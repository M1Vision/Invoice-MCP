#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
const server = new McpServer(
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
      
      return {
        content: [
          {
            type: "text",
            text: `Invoice PDF successfully created!\n\n📄 **Invoice:** ${invoiceData.invoiceNumber}\n💰 **Total:** ${invoiceData.currency || 'GBP'} ${total.toFixed(2)}\n\n🔗 **Download URL:** ${downloadUrl}\n\n**Instructions:**\n1. Copy the download URL above\n2. Replace the domain with your actual server URL\n3. Example: https://your-server.smithery.ai${downloadUrl}\n\nThe PDF is available for download at the provided URL.`,
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
import { readFile, stat } from 'fs/promises';
import { basename } from 'path';

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

// List available files
app.get('/files', async (req, res) => {
  try {
    const { readdir } = await import('fs/promises');
    const tempDir = join(process.cwd(), 'temp');
    
    try {
      const files = await readdir(tempDir);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      const fileList = pdfFiles.map(filename => ({
        filename,
        downloadUrl: `/files/${filename}`,
        fullUrl: `${req.protocol}://${req.get('host')}/files/${filename}`
      }));
      
      res.json({ files: fileList });
    } catch (error) {
      res.json({ files: [] });
    }
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
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
