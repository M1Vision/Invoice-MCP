#!/usr/bin/env node
import { createStatelessServer } from '@smithery/sdk/server/stateless.js';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { invoicePdfToolSchema } from "./lib/invoice-pdf-tool-schema.js";
import { Invoice, InvoiceItem, InvoiceSchema } from "./shared/types/invoice.js";
import { join } from "path";
import { generateInvoicePdf } from "./shared/components/invoice-template.js";
import { z } from "zod";

// Configuration schema for Smithery
const configSchema = z.object({
  logoUrl: z.string().optional().describe("Direct URL to logo image (JPG, PNG, WebP)"),
  businessName: z.string().optional().describe("Your business name"),
  businessAddress: z.string().optional().describe("Your business address"),
  businessEmail: z.string().optional().describe("Your business email"),
  accountName: z.string().optional().describe("Bank account name"),
  accountNumber: z.string().optional().describe("Bank account number"),
  sortCode: z.string().optional().describe("Bank sort code"),
  defaultCurrency: z.string().default("GBP").describe("Default currency (GBP, USD, CAD, EUR)"),
  defaultPaymentTerms: z.string().default("Payment due within 30 days of invoice date").describe("Default payment terms"),
});

// Create MCP server function for Smithery
function createMcpServer({ config }: { config: z.infer<typeof configSchema> }) {
  const server = new McpServer(
    {
      name: "Invoice MCP Server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      console.log('Handling ListTools request');
      return {
        tools: [
          {
            name: "generate-invoice-pdf",
            description: "Creates and exports an invoice as a PDF",
            inputSchema: invoicePdfToolSchema,
          },
        ],
      };
    } catch (error) {
      console.error('Error in ListTools handler:', error);
      throw error;
    }
  });

  // Call tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      console.log('Handling CallTool request:', request.params.name);
      if (request.params.name === "generate-invoice-pdf") {
        const { invoice: invoiceData, outputPath } = request.params.arguments as {
          invoice: Invoice;
          outputPath: string;
        };

        // Apply default configuration values
        const finalInvoiceData = {
          ...invoiceData,
          logoUrl: invoiceData.logoUrl || config.logoUrl,
          sender: {
            ...invoiceData.sender,
            name: invoiceData.sender.name || config.businessName,
            address: invoiceData.sender.address || config.businessAddress,
            email: invoiceData.sender.email || config.businessEmail,
          },
          paymentInformation: {
            ...invoiceData.paymentInformation,
            accountName: invoiceData.paymentInformation.accountName || config.accountName,
            accountNumber: invoiceData.paymentInformation.accountNumber || config.accountNumber,
            sortCode: invoiceData.paymentInformation.sortCode || config.sortCode,
          },
          currency: invoiceData.currency || config.defaultCurrency,
          paymentTerms: invoiceData.paymentTerms || config.defaultPaymentTerms,
        };

        // Calculate totals
        const itemsWithTotals = finalInvoiceData.items.map((item: InvoiceItem) => ({
          ...item,
          total: item.quantity * item.unitPrice,
        }));

        const subtotal = itemsWithTotals.reduce(
          (sum: number, item: InvoiceItem) => sum + item.total,
          0
        );
        const vatAmount = subtotal * finalInvoiceData.vatRate;
        const total = subtotal + vatAmount;

        const calculatedInvoice = {
          ...finalInvoiceData,
          date: new Date(finalInvoiceData.date),
          dueDate: new Date(finalInvoiceData.dueDate),
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

        // Use temp directory for container environment
        const defaultPath = join(
          process.cwd(),
          "temp",
          `invoice-${finalInvoiceData.invoiceNumber}.pdf`
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
        const filename = `invoice-${finalInvoiceData.invoiceNumber}.pdf`;
        const downloadUrl = `/files/${filename}`;
        
        return {
          content: [
            {
              type: "text",
              text: `Invoice PDF successfully created!\n\n📄 **Invoice:** ${finalInvoiceData.invoiceNumber}\n💰 **Total:** ${finalInvoiceData.currency} ${total.toFixed(2)}\n\n🔗 **Download URL:** ${downloadUrl}\n\n**Instructions:**\n1. Copy the download URL above\n2. Replace the domain with your actual Smithery deployment URL\n3. Example: https://your-server.smithery.ai${downloadUrl}\n\nThe PDF is available for download at the provided URL.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to generate invoice PDF: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
      throw new Error("Tool not found");
    } catch (error) {
      console.error('Error in CallTool handler:', error);
      throw error;
    }
  });

  return server.server;
}

// Store the current configuration for authentication
let currentConfig: any = null;

// Create the stateless server using Smithery SDK
const statelessServer = createStatelessServer(({ config }) => {
  try {
    console.log('Creating MCP server with config:', config);
    currentConfig = config; // Store config for authentication
    return createMcpServer({ config });
  } catch (error) {
    console.error('Error creating MCP server:', error);
    throw error;
  }
});

// Add file serving capabilities
import express from 'express';
import { readFile, stat } from 'fs/promises';
import { basename } from 'path';

// Authentication middleware
function authenticateRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Bearer token required'
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  // Get the expected API key from Smithery configuration
  const expectedApiKey = currentConfig?.apiKey || 'sk-m1vision-invoice-mcp-2024-09-11-abcdef1234567890';
  
  if (!token || token !== expectedApiKey) {
    return res.status(401).json({
      error: 'Unauthorized', 
      message: 'Invalid API key'
    });
  }
  
  // Add token to request for use in handlers
  (req as any).authToken = token;
  next();
}

// Add health endpoint for Smithery scanning (no auth required)
statelessServer.app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Invoice MCP Server',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// Add a simple MCP info endpoint for Smithery scanning (no auth required)
statelessServer.app.get('/mcp/info', (req, res) => {
  res.json({
    name: "Invoice MCP Server",
    version: "0.1.0",
    description: "MCP server for creating professional PDF invoices using natural language",
    tools: [
      {
        name: "generate-invoice-pdf",
        description: "Creates and exports an invoice as a PDF",
        inputSchema: {
          type: "object",
          properties: {
            invoice: {
              type: "object",
              description: "Invoice data"
            },
            outputPath: {
              type: "string",
              description: "Path to save the PDF (optional)"
            }
          },
          required: ["invoice"]
        }
      }
    ]
  });
});

// Apply authentication to MCP endpoint
statelessServer.app.use('/mcp', authenticateRequest);

// Serve generated PDF files
statelessServer.app.get('/files/:filename', async (req, res) => {
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
statelessServer.app.get('/files', async (req, res) => {
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

// Delete a specific file
statelessServer.app.delete('/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Security: Only allow PDF files and sanitize filename
    if (!filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filePath = join(process.cwd(), 'temp', filename);
    const { unlink } = await import('fs/promises');
    
    try {
      await unlink(filePath);
      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Start server
const PORT = process.env.PORT || 8081;
statelessServer.app.listen(PORT, () => {
  console.log(`Invoice MCP Server (Smithery) running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`File serving: http://localhost:${PORT}/files`);
});

export default createMcpServer;
