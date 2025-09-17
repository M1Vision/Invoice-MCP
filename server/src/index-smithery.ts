import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { Invoice, InvoiceItem, InvoiceSchema } from "./shared/types/invoice.js";
import { join } from "path";
import { generateInvoicePdf } from "./shared/components/invoice-template.js";
import { z } from "zod";

// Configuration schema for Smithery
const configSchema = z.object({
  apiKey: z.string().describe("API key for authentication (Bearer token)"),
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

// Parse configuration from query parameters (Smithery dot-notation format)
function parseConfig(query: any): z.infer<typeof configSchema> {
  const config: any = {};
  
  // Parse dot-notation parameters as per Smithery docs
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      // Handle nested properties like "business.name"
      const keys = key.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    }
  }
  
  // Set defaults and validate
  const result = {
    apiKey: config.apiKey || "default-api-key",
    logoUrl: config.logoUrl,
    businessName: config.businessName,
    businessAddress: config.businessAddress,
    businessEmail: config.businessEmail,
    accountName: config.accountName,
    accountNumber: config.accountNumber,
    sortCode: config.sortCode,
    defaultCurrency: config.defaultCurrency || "GBP",
    defaultPaymentTerms: config.defaultPaymentTerms || "Payment due within 30 days of invoice date",
  };
  
  // Validate with Zod schema
  return configSchema.parse(result);
}

// Parse invoice description into structured data
function parseInvoiceDescription(description: string, config: z.infer<typeof configSchema>): Invoice {
  // This is a simplified parser - in a real implementation, you'd use NLP or structured input
  const lines = description.split('\n').map(line => line.trim()).filter(line => line);
  
  // Extract client information
  const clientName = lines.find(line => line.toLowerCase().includes('client') || line.toLowerCase().includes('customer'))?.split(':')[1]?.trim() || 'Client Name';
  const clientEmail = lines.find(line => line.toLowerCase().includes('email'))?.split(':')[1]?.trim() || 'client@example.com';
  const clientAddress = lines.find(line => line.toLowerCase().includes('address'))?.split(':')[1]?.trim() || 'Client Address';
  
  // Extract items (simplified - look for lines with numbers and descriptions)
  const items: InvoiceItem[] = [];
  let currentItem: Partial<InvoiceItem> = {};
  
  for (const line of lines) {
    // Look for quantity and description patterns
    const quantityMatch = line.match(/(\d+)\s+(.+?)\s+@\s+\$?(\d+\.?\d*)/);
    if (quantityMatch) {
      if (currentItem.description) {
        items.push(currentItem as InvoiceItem);
      }
      currentItem = {
        description: quantityMatch[2].trim(),
        quantity: parseInt(quantityMatch[1]),
        unitPrice: parseFloat(quantityMatch[3]),
      };
    } else if (line.includes('$') && currentItem.description) {
      // Price line
      const priceMatch = line.match(/\$?(\d+\.?\d*)/);
      if (priceMatch) {
        currentItem.unitPrice = parseFloat(priceMatch[1]);
      }
    }
  }
  
  if (currentItem.description) {
    items.push(currentItem as InvoiceItem);
  }
  
  // If no items found, create a default item
  if (items.length === 0) {
    items.push({
      description: "Service rendered",
      quantity: 1,
      unitPrice: 100.00,
      total: 100.00,
    });
  }
  
  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const vatRate = 0.20; // 20% VAT
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  return {
    invoiceNumber: `INV-${Date.now()}`,
    date: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    business: {
      name: config.businessName || "Your Business Name",
      address: config.businessAddress || "Your Business Address",
      email: config.businessEmail || "contact@yourbusiness.com",
      accountName: config.accountName || "Your Account Name",
      accountNumber: config.accountNumber || "12345678",
      sortCode: config.sortCode || "12-34-56",
    },
    customer: {
      name: clientName,
      email: clientEmail,
      address: clientAddress,
    },
    items,
    subtotal,
    vatRate,
    vatAmount,
    total,
    currency: (config.defaultCurrency as "GBP" | "USD" | "CAD" | "EUR") || "GBP",
    terms: config.defaultPaymentTerms || "Payment due within 30 days of invoice date",
  };
}

// Create MCP server function (per session as per official docs)
function createMcpServer(config: z.infer<typeof configSchema>) {
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

  // Set up request handlers using the low-level API

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "generate-invoice-pdf",
          description: "Generate a professional PDF invoice from natural language description",
          inputSchema: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Natural language description of the invoice to generate",
              },
              outputPath: {
                type: "string",
                description: "Filename for the generated PDF (will be saved to temp/ directory)",
                default: "invoice.pdf",
              },
            },
            required: ["description"],
          },
        },
      ],
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "generate-invoice-pdf") {
      const { description, outputPath = "invoice.pdf" } = request.params.arguments as {
        description: string;
        outputPath?: string;
      };
      try {
        // Parse the description to extract invoice details
        const invoiceData = parseInvoiceDescription(description, config);
        
        // Calculate totals (matching original logic)
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
        
        // Save to temp directory (web-accessible)
        const tempDir = join(process.cwd(), "temp");
        const fs = await import("fs");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filename = `invoice-${validatedInvoice.invoiceNumber}.pdf`;
        const filePath = join(tempDir, filename);
        
        await generateInvoicePdf(validatedInvoice, filePath);
        
        // Get the server URL for file access
        const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 8081}`;
        const downloadUrl = `${serverUrl}/files/${filename}`;

        return {
          content: [
            {
              type: "text",
              text: `✅ Invoice PDF generated successfully!\n\n📄 **File**: ${filename}\n🔗 **Download**: ${downloadUrl}\n\n**Invoice Details:**\n- Client: ${validatedInvoice.customer.name}\n- Amount: ${validatedInvoice.currency} ${validatedInvoice.total.toFixed(2)}\n- Items: ${validatedInvoice.items.length} line items\n\nYou can download the PDF using the link above or access it via the /files endpoint.`,
            },
          ],
        };
      } catch (error) {
        console.error("Error generating invoice PDF:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Error generating invoice PDF: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
    
    throw new Error("Tool not found");
  });

  return server;
}

// Create Express app
const app = express();
const port = process.env.PORT || 8081;

// CORS configuration for MCP
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', '*'],
  exposedHeaders: ['mcp-session-id', 'mcp-protocol-version']
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Well-known MCP configuration endpoint (required by Smithery)
app.get('/.well-known/mcp-config', (req, res) => {
  const configSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": `${req.protocol}://${req.get('host')}/.well-known/mcp-config`,
    "title": "Invoice MCP Configuration",
    "description": "Configuration for connecting to the Invoice MCP server",
    "x-query-style": "dot+bracket",
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "title": "API Key",
        "description": "API key for authentication (Bearer token)",
        "minLength": 10
      },
      "logoUrl": {
        "type": "string",
        "title": "Logo URL",
        "description": "Direct URL to logo image (JPG, PNG, WebP)"
      },
      "businessName": {
        "type": "string",
        "title": "Business Name",
        "description": "Your business name"
      },
      "businessAddress": {
        "type": "string",
        "title": "Business Address",
        "description": "Your business address"
      },
      "businessEmail": {
        "type": "string",
        "title": "Business Email",
        "description": "Your business email"
      },
      "accountName": {
        "type": "string",
        "title": "Account Name",
        "description": "Bank account name"
      },
      "accountNumber": {
        "type": "string",
        "title": "Account Number",
        "description": "Bank account number"
      },
      "sortCode": {
        "type": "string",
        "title": "Sort Code",
        "description": "Bank sort code"
      },
      "defaultCurrency": {
        "type": "string",
        "title": "Default Currency",
        "description": "Default currency (GBP, USD, CAD, EUR)",
        "default": "GBP",
        "enum": ["GBP", "USD", "CAD", "EUR"]
      },
      "defaultPaymentTerms": {
        "type": "string",
        "title": "Default Payment Terms",
        "description": "Default payment terms",
        "default": "Payment due within 30 days of invoice date"
      }
    },
    "required": ["apiKey"],
    "additionalProperties": false
  };
  
  res.json(configSchema);
});

// File serving endpoints
app.get('/files', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const tempDir = path.join(process.cwd(), 'temp');
  
  if (!fs.existsSync(tempDir)) {
    return res.json({ files: [] });
  }
  
  const files = fs.readdirSync(tempDir).map((file: string) => ({
    name: file,
    url: `${req.protocol}://${req.get('host')}/files/${file}`,
    size: fs.statSync(path.join(tempDir, file)).size,
    created: fs.statSync(path.join(tempDir, file)).birthtime
  }));
  
  res.json({ files });
});

app.get('/files/:filename', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const tempDir = path.join(process.cwd(), 'temp');
  const filePath = path.join(tempDir, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filePath);
});

app.delete('/files/:filename', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const tempDir = path.join(process.cwd(), 'temp');
  const filePath = path.join(tempDir, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  fs.unlinkSync(filePath);
  res.json({ message: 'File deleted successfully' });
});

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  try {
    console.log('MCP POST request received:', {
      method: req.method,
      headers: req.headers,
      body: req.body
    });

    // Parse configuration from query parameters (Smithery format)
    const config = parseConfig(req.query);
    console.log('Parsed config:', config);

    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      console.log('Reusing existing transport for session:', sessionId);
      // Reuse existing transport
      transport = transports[sessionId];
    } else {
      console.log('Creating new transport for request');
      // Create new transport for any request (simplified for testing)
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          console.log('Session initialized:', sessionId);
          // Store the transport by session ID
          transports[sessionId] = transport;
        },
        // DNS rebinding protection is disabled by default for backwards compatibility
        enableDnsRebindingProtection: false,
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log('Transport closed for session:', transport.sessionId);
          delete transports[transport.sessionId];
        }
      };

      // Create server with config and connect to transport
      console.log('Creating MCP server with config');
      const server = createMcpServer(config);
      await server.connect(transport);
    }

    // Handle the request
    console.log('Handling request with transport');
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP POST request error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP session request error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

// Start server
app.listen(port, () => {
  console.log(`Invoice MCP Server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
  console.log(`Config endpoint: http://localhost:${port}/.well-known/mcp-config`);
  console.log(`Files endpoint: http://localhost:${port}/files`);
});
