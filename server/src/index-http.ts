#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { invoicePdfToolSchema } from "./lib/invoice-pdf-tool-schema.js";
import { Invoice, InvoiceItem, InvoiceSchema } from "./shared/types/invoice.js";
import { join } from "path";
import { generateInvoicePdf } from "./shared/components/invoice-template.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

// Parse configuration from query parameters
function parseConfig(req: express.Request) {
  const config: any = {};
  
  // Extract dot-notation parameters
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      const keys = key.split('.');
      let current = config;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
    }
  }
  
  return config;
}

// Create server instance
const server = new Server(
  {
    name: "Invoice MCP Server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate-invoice-pdf",
        description: "Creates and exports an invoice as a PDF",
        inputSchema: invoicePdfToolSchema,
      },
    ],
  };
});

// Call tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "generate-invoice-pdf") {
    try {
      const { invoice: invoiceData, outputPath } = request.params.arguments as {
        invoice: Invoice;
        outputPath: string;
      };

      // Calculate totals
      const itemsWithTotals = invoiceData.items.map((item: InvoiceItem) => ({
        ...item,
        total: item.quantity * item.unitPrice,
      }));

      const subtotal = itemsWithTotals.reduce(
        (sum: number, item: InvoiceItem) => sum + item.total,
        0
      );
      const vatAmount = subtotal * invoiceData.vatRate;
      const total = subtotal + vatAmount;

      const calculatedInvoice = {
        ...invoiceData,
        date: new Date(invoiceData.date),
        dueDate: new Date(invoiceData.dueDate),
        items: itemsWithTotals,
        subtotal,
        vatAmount,
        total,
      };

      const validationResult = InvoiceSchema.safeParse(calculatedInvoice);

      if (!validationResult.success) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate invoice PDF: ${validationResult.error.format()}`,
            },
          ],
        };
      }

      const validatedInvoice = validationResult.data;

      // For web environments, use a temporary directory or return the PDF data
      // Instead of saving to local desktop, we'll save to a temp location
      const defaultPath = join(
        process.cwd(),
        "temp",
        `invoice-${invoiceData.invoiceNumber}.pdf`
      );

      const finalOutputPath = outputPath || defaultPath;
      
      // Ensure temp directory exists
      const { mkdir } = await import('fs/promises');
      const tempDir = join(process.cwd(), "temp");
      try {
        await mkdir(tempDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }

      await generateInvoicePdf(validatedInvoice, finalOutputPath);

      // Generate download URL for the created PDF
      const filename = `invoice-${invoiceData.invoiceNumber}.pdf`;
      const downloadUrl = `/files/${filename}`;
      
      // Store invoice metadata for better tracking
      const invoiceMetadata: InvoiceMetadata = {
        invoiceNumber: invoiceData.invoiceNumber,
        filename,
        downloadUrl,
        createdAt: new Date().toISOString(),
        total: total.toFixed(2),
        currency: invoiceData.currency || 'GBP',
        clientName: invoiceData.customer.name,
        status: 'generated'
      };
      
      // Save metadata to a simple JSON file for tracking
      await saveInvoiceMetadata(invoiceMetadata);
      
      return {
        content: [
          {
            type: "text",
            text: `✅ **Invoice PDF Successfully Generated!**\n\n📄 **Invoice:** ${invoiceData.invoiceNumber}\n👤 **Client:** ${invoiceData.customer.name}\n💰 **Total:** ${invoiceData.currency || 'GBP'} ${total.toFixed(2)}\n📅 **Created:** ${new Date().toLocaleString()}\n\n🔗 **Direct Download URL:** ${downloadUrl}\n\n**Quick Access:**\n• View all invoices: GET /files\n• Download this invoice: GET ${downloadUrl}\n• Invoice metadata: GET /invoices/${invoiceData.invoiceNumber}\n\n**For web access, use your server's full URL:**\n\`https://your-server-domain.com${downloadUrl}\``,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: "Failed to generate invoice PDF" }],
      };
    }
  }
  throw new Error("Tool not found");
});

// Create Express app
const app = express();

// Configure CORS for MCP
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id", "*"],
  exposedHeaders: ["mcp-session-id", "mcp-protocol-version"]
}));

app.use(express.json());

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Invoice MCP Server' });
});

// MCP endpoint - POST for client-to-server communication
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else {
      // Create new transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
        }
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      // Connect to the MCP server
      await server.connect(transport);
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

// Handle DELETE requests for session termination
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

// Add file serving capabilities
import { readFile, stat, writeFile } from 'fs/promises';
import { basename } from 'path';

// Invoice metadata management
interface InvoiceMetadata {
  invoiceNumber: string;
  filename: string;
  downloadUrl: string;
  createdAt: string;
  total: string;
  currency: string;
  clientName: string;
  status: 'generated' | 'sent' | 'paid';
}

async function saveInvoiceMetadata(metadata: InvoiceMetadata): Promise<void> {
  try {
    const metadataPath = join(process.cwd(), 'temp', 'invoices-metadata.json');
    let existingData: InvoiceMetadata[] = [];
    
    try {
      const existingContent = await readFile(metadataPath, 'utf-8');
      existingData = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist yet, start with empty array
    }
    
    // Remove existing entry with same invoice number and add new one
    existingData = existingData.filter(inv => inv.invoiceNumber !== metadata.invoiceNumber);
    existingData.push(metadata);
    
    await writeFile(metadataPath, JSON.stringify(existingData, null, 2));
  } catch (error) {
    console.error('Error saving invoice metadata:', error);
  }
}

async function getInvoiceMetadata(): Promise<InvoiceMetadata[]> {
  try {
    const metadataPath = join(process.cwd(), 'temp', 'invoices-metadata.json');
    const content = await readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

async function getInvoiceMetadataByNumber(invoiceNumber: string): Promise<InvoiceMetadata | null> {
  const allMetadata = await getInvoiceMetadata();
  return allMetadata.find(inv => inv.invoiceNumber === invoiceNumber) || null;
}

// Serve generated PDF files
app.get('/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Security: Only allow PDF files and sanitize filename
    if (!filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filePath = join(process.cwd(), 'temp', filename);
    
    // Check if file exists
    try {
      await stat(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Read and serve the file
    const fileBuffer = await readFile(filePath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${basename(filename)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// List available files with enhanced metadata
app.get('/files', async (req, res) => {
  try {
    const { readdir } = await import('fs/promises');
    const tempDir = join(process.cwd(), 'temp');
    const metadata = await getInvoiceMetadata();
    
    try {
      const files = await readdir(tempDir);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      const fileList = pdfFiles.map(filename => {
        const invoiceNumber = filename.replace('invoice-', '').replace('.pdf', '');
        const metaData = metadata.find(m => m.filename === filename);
        
        return {
          filename,
          invoiceNumber,
          downloadUrl: `/files/${filename}`,
          fullUrl: `${req.protocol}://${req.get('host')}/files/${filename}`,
          metadata: metaData || null
        };
      });
      
      res.json({ 
        files: fileList,
        total: fileList.length,
        serverUrl: `${req.protocol}://${req.get('host')}`
      });
    } catch (error) {
      res.json({ files: [], total: 0 });
    }
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Get all invoices with metadata
app.get('/invoices', async (req, res) => {
  try {
    const metadata = await getInvoiceMetadata();
    const enhancedMetadata = metadata.map(invoice => ({
      ...invoice,
      fullDownloadUrl: `${req.protocol}://${req.get('host')}${invoice.downloadUrl}`
    }));
    
    res.json({ 
      invoices: enhancedMetadata,
      total: enhancedMetadata.length,
      serverUrl: `${req.protocol}://${req.get('host')}`
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get specific invoice metadata
app.get('/invoices/:invoiceNumber', async (req, res) => {
  try {
    const invoiceNumber = req.params.invoiceNumber;
    const metadata = await getInvoiceMetadataByNumber(invoiceNumber);
    
    if (!metadata) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const enhancedMetadata = {
      ...metadata,
      fullDownloadUrl: `${req.protocol}://${req.get('host')}${metadata.downloadUrl}`
    };
    
    res.json(enhancedMetadata);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Update invoice status
app.patch('/invoices/:invoiceNumber/status', async (req, res) => {
  try {
    const invoiceNumber = req.params.invoiceNumber;
    const { status } = req.body;
    
    if (!['generated', 'sent', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: generated, sent, or paid' });
    }
    
    const metadata = await getInvoiceMetadata();
    const invoiceIndex = metadata.findIndex(inv => inv.invoiceNumber === invoiceNumber);
    
    if (invoiceIndex === -1) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    metadata[invoiceIndex].status = status;
    
    // Save updated metadata
    const metadataPath = join(process.cwd(), 'temp', 'invoices-metadata.json');
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    res.json({ 
      message: 'Invoice status updated successfully',
      invoice: {
        ...metadata[invoiceIndex],
        fullDownloadUrl: `${req.protocol}://${req.get('host')}${metadata[invoiceIndex].downloadUrl}`
      }
    });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
});

// Delete invoice
app.delete('/invoices/:invoiceNumber', async (req, res) => {
  try {
    const invoiceNumber = req.params.invoiceNumber;
    const metadata = await getInvoiceMetadata();
    const invoice = metadata.find(inv => inv.invoiceNumber === invoiceNumber);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Delete PDF file
    const filePath = join(process.cwd(), 'temp', invoice.filename);
    try {
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
    } catch (error) {
      console.error('Error deleting PDF file:', error);
    }
    
    // Remove from metadata
    const updatedMetadata = metadata.filter(inv => inv.invoiceNumber !== invoiceNumber);
    const metadataPath = join(process.cwd(), 'temp', 'invoices-metadata.json');
    await writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2));
    
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// Start server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Invoice MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`File serving: http://localhost:${PORT}/files`);
});
