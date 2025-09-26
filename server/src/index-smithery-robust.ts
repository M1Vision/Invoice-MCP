#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { Invoice, InvoiceItem, InvoiceSchema } from "./shared/types/invoice.js";
import { generateInvoicePdfBuffer } from "./shared/components/invoice-template.js";
import { z } from "zod";
import { createClient } from '@supabase/supabase-js';

// ===== CONFIGURATION SCHEMA =====
// This schema defines what configuration parameters users can provide
// when connecting to the MCP server via Smithery
export const configSchema = z.object({
  // REQUIRED: Supabase connection
  supabaseUrl: z.string().describe("Your Supabase project URL (e.g., https://mohsljimdduthwjhygkp.supabase.co)"),
  supabaseKey: z.string().describe("Your Supabase anon/public key for authentication"),
  
  // OPTIONAL: Storage settings (defaults work for most cases)
  storageBucket: z.string().default("invoices").describe("Supabase storage bucket name for PDFs (default: invoices)"),
  
  // OPTIONAL: Business information (for invoice branding)
  businessName: z.string().optional().describe("Your business name (appears on invoices)"),
  businessEmail: z.string().optional().describe("Your business email"),
  businessPhone: z.string().optional().describe("Your business phone"),
  businessAddress: z.string().optional().describe("Your business address"),
  
  // OPTIONAL: Advanced settings (usually keep defaults)
  autoCreateBucket: z.boolean().default(false).describe("Auto-create bucket if missing (set false if bucket exists)"),
  enableMetadataStorage: z.boolean().default(false).describe("Store invoice metadata in database (set false for URL-only)"),
});

export type Config = z.infer<typeof configSchema>;

// ===== SUPABASE CLIENT MANAGEMENT =====
class SupabaseManager {
  private supabase: any;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const { data, error } = await this.supabase.from('_test').select('*').limit(1);
      if (error && !error.message.includes('relation "_test" does not exist')) {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }

      // Create storage bucket if needed
      if (this.config.autoCreateBucket) {
        await this.ensureBucketExists();
      }

      // Create database table if needed
      if (this.config.enableMetadataStorage) {
        await this.ensureTableExists();
      }

      console.log('✅ Supabase initialized successfully');
    } catch (error) {
      console.error('❌ Supabase initialization failed:', error);
      throw error;
    }
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      const { data: buckets, error } = await this.supabase.storage.listBuckets();
      
      if (error) {
        console.warn('Could not list buckets:', error.message);
        return;
      }

      const bucketExists = buckets?.some((bucket: any) => bucket.name === this.config.storageBucket);
      
      if (!bucketExists) {
        const { error: createError } = await this.supabase.storage.createBucket(
          this.config.storageBucket,
          {
            public: true,
            allowedMimeTypes: ['application/pdf'],
            fileSizeLimit: 50 * 1024 * 1024, // 50MB
          }
        );

        if (createError) {
          console.warn(`Could not create bucket: ${createError.message}`);
        } else {
          console.log(`✅ Created storage bucket: ${this.config.storageBucket}`);
        }
      }
    } catch (error) {
      console.warn('Error ensuring bucket exists:', error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      // Try to create the invoices table
      const { error } = await this.supabase.rpc('create_invoices_table_if_not_exists');
      
      // If the RPC doesn't exist, create it via SQL
      if (error && error.message.includes('function create_invoices_table_if_not_exists() does not exist')) {
        await this.createInvoiceTableDirectly();
      }
    } catch (error) {
      console.warn('Error ensuring table exists:', error);
    }
  }

  private async createInvoiceTableDirectly(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.config.databaseTable} (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        client_name TEXT NOT NULL,
        client_email TEXT,
        total_amount DECIMAL(10,2) NOT NULL,
        currency TEXT DEFAULT 'GBP',
        status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'paid', 'cancelled')),
        pdf_url TEXT,
        pdf_filename TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON ${this.config.databaseTable}(invoice_number);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON ${this.config.databaseTable}(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON ${this.config.databaseTable}(created_at);
    `;

    try {
      const { error } = await this.supabase.rpc('exec_sql', { sql: createTableSQL });
      if (error) {
        console.warn('Could not create table via RPC:', error.message);
      } else {
        console.log(`✅ Created database table: ${this.config.databaseTable}`);
      }
    } catch (error) {
      console.warn('Error creating table:', error);
    }
  }

  async uploadPDF(buffer: Buffer, filename: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.config.storageBucket)
      .upload(filename, buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true, // Overwrite if exists
      });

    if (error) {
      throw new Error(`PDF upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = this.supabase.storage
      .from(this.config.storageBucket)
      .getPublicUrl(filename);

    return publicUrlData.publicUrl;
  }

  async saveInvoiceMetadata(invoice: any, pdfUrl: string, filename: string): Promise<void> {
    if (!this.config.enableMetadataStorage) return;

    const invoiceRecord = {
      invoice_number: invoice.invoiceNumber,
      client_name: invoice.customer.name,
      client_email: invoice.customer.email,
      total_amount: invoice.total,
      currency: invoice.currency,
      status: 'generated',
      pdf_url: pdfUrl,
      pdf_filename: filename,
      metadata: {
        items: invoice.items,
        subtotal: invoice.subtotal,
        vatAmount: invoice.vatAmount,
        vatRate: invoice.vatRate,
        date: invoice.date,
        dueDate: invoice.dueDate,
        business: this.config.businessName ? {
          name: this.config.businessName,
          email: this.config.businessEmail,
          phone: this.config.businessPhone,
          address: this.config.businessAddress,
        } : invoice.business,
        notes: invoice.notes,
        terms: invoice.terms,
      }
    };

    const { error } = await this.supabase
      .from(this.config.databaseTable)
      .upsert(invoiceRecord, { 
        onConflict: 'invoice_number',
        ignoreDuplicates: false 
      });

    if (error) {
      console.warn('Could not save invoice metadata:', error.message);
    }
  }

  async getInvoiceMetadata(invoiceNumber: string): Promise<any> {
    if (!this.config.enableMetadataStorage) return null;

    const { data, error } = await this.supabase
      .from(this.config.databaseTable)
      .select('*')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (error) {
      console.warn('Could not fetch invoice metadata:', error.message);
      return null;
    }

    return data;
  }

  async listInvoices(limit: number = 50): Promise<any[]> {
    if (!this.config.enableMetadataStorage) return [];

    const { data, error } = await this.supabase
      .from(this.config.databaseTable)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Could not list invoices:', error.message);
      return [];
    }

    return data || [];
  }

  async updateInvoiceStatus(invoiceNumber: string, status: string): Promise<boolean> {
    if (!this.config.enableMetadataStorage) return false;

    const { error } = await this.supabase
      .from(this.config.databaseTable)
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('invoice_number', invoiceNumber);

    if (error) {
      console.warn('Could not update invoice status:', error.message);
      return false;
    }

    return true;
  }
}

// ===== MCP SERVER FACTORY =====
// This function creates a new MCP server instance with the provided configuration
function createMcpServer(config: Config) {
  const server = new Server(
    {
      name: "Invoice MCP Server with Supabase",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize Supabase manager
  const supabaseManager = new SupabaseManager(config);

  // Initialize on first use
  let initialized = false;
  const ensureInitialized = async () => {
    if (!initialized) {
      await supabaseManager.initialize();
      initialized = true;
    }
  };

  // Define available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: "generate-invoice-pdf",
        description: "Generate a professional invoice PDF and store it in Supabase",
        inputSchema: {
          type: "object",
          properties: {
            invoiceNumber: {
              type: "string",
              description: "Unique invoice number (e.g., INV-001)"
            },
            clientName: {
              type: "string", 
              description: "Client/customer name"
            },
            clientEmail: {
              type: "string",
              description: "Client email address"
            },
            items: {
              type: "array",
              description: "Invoice line items",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" }
                },
                required: ["description", "quantity", "unitPrice"]
              }
            },
            currency: {
              type: "string",
              enum: ["GBP", "USD", "EUR", "CAD"],
              default: "GBP"
            },
            vatRate: {
              type: "number",
              description: "VAT/Tax rate (e.g., 0.20 for 20%)",
              default: 0.20
            },
            dueDate: {
              type: "string",
              description: "Due date (YYYY-MM-DD format)"
            },
            notes: {
              type: "string",
              description: "Additional notes or terms"
            }
          },
          required: ["invoiceNumber", "clientName", "items"]
        }
      },
      {
        name: "get-invoice-details",
        description: "Get details of a specific invoice from the database",
        inputSchema: {
          type: "object",
          properties: {
            invoiceNumber: {
              type: "string",
              description: "Invoice number to retrieve"
            }
          },
          required: ["invoiceNumber"]
        }
      },
      {
        name: "list-invoices", 
        description: "List recent invoices with their status and details",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of invoices to return",
              default: 20,
              maximum: 100
            }
          }
        }
      },
      {
        name: "update-invoice-status",
        description: "Update the status of an invoice (generated, sent, paid, cancelled)",
        inputSchema: {
          type: "object", 
          properties: {
            invoiceNumber: {
              type: "string",
              description: "Invoice number to update"
            },
            status: {
              type: "string",
              enum: ["generated", "sent", "paid", "cancelled"],
              description: "New status for the invoice"
            }
          },
          required: ["invoiceNumber", "status"]
        }
      }
    ];

    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await ensureInitialized();

    try {
      switch (request.params.name) {
        case "generate-invoice-pdf":
          return await handleGenerateInvoice(request.params.arguments, supabaseManager, config);
        
        case "get-invoice-details":
          return await handleGetInvoiceDetails(request.params.arguments, supabaseManager);
        
        case "list-invoices":
          return await handleListInvoices(request.params.arguments, supabaseManager);
        
        case "update-invoice-status":
          return await handleUpdateInvoiceStatus(request.params.arguments, supabaseManager);
        
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      console.error(`Error handling ${request.params.name}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  return server;
}

// ===== TOOL HANDLERS =====

async function handleGenerateInvoice(args: any, supabaseManager: SupabaseManager, config: Config) {
  const {
    invoiceNumber,
    clientName,
    clientEmail,
    items,
    currency = "GBP",
    vatRate = 0.20,
    dueDate,
    notes
  } = args;

  // Build invoice object
  const invoiceDate = new Date();
  const invoiceDueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

  // Calculate totals
  const itemsWithTotals = items.map((item: any) => ({
    ...item,
    total: item.quantity * item.unitPrice,
  }));

  const subtotal = itemsWithTotals.reduce((sum: number, item: any) => sum + item.total, 0);
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  const invoice: Invoice = {
    invoiceNumber,
    date: invoiceDate,
    dueDate: invoiceDueDate,
    business: {
      name: config.businessName || "Your Business",
      email: config.businessEmail || "contact@yourbusiness.com",
      phone: config.businessPhone,
      address: config.businessAddress,
    },
    customer: {
      name: clientName,
      email: clientEmail,
    },
    items: itemsWithTotals,
    subtotal,
    vatRate,
    vatAmount,
    total,
    currency: currency as any,
    notes,
  };

  // Validate invoice
  const validationResult = InvoiceSchema.safeParse(invoice);
  if (!validationResult.success) {
    throw new Error(`Invalid invoice data: ${validationResult.error.message}`);
  }

  const validatedInvoice = validationResult.data;

  // Generate PDF buffer
  const pdfBuffer = await generateInvoicePdfBuffer(validatedInvoice);
  
  // Upload to Supabase Storage
  const filename = `invoice-${invoiceNumber}-${Date.now()}.pdf`;
  const pdfUrl = await supabaseManager.uploadPDF(pdfBuffer, filename);

  // Save metadata to database
  await supabaseManager.saveInvoiceMetadata(validatedInvoice, pdfUrl, filename);

  return {
    content: [
      {
        type: "text",
        text: `✅ **Invoice Generated Successfully!**

📄 **Invoice:** ${invoiceNumber}
👤 **Client:** ${clientName}
💰 **Total:** ${currency} ${total.toFixed(2)}
📅 **Due Date:** ${invoiceDueDate.toLocaleDateString()}

🔗 **PDF Download:** ${pdfUrl}

**Storage Details:**
• ✅ PDF stored in Supabase Storage
• ✅ Metadata saved to database
• ✅ Permanent public URL generated
• ✅ Accessible from anywhere

**Next Steps:**
• Share the PDF URL with your client
• Update status when sent/paid
• Track invoice in your database`,
      },
    ],
  };
}

async function handleGetInvoiceDetails(args: any, supabaseManager: SupabaseManager) {
  const { invoiceNumber } = args;
  
  const invoice = await supabaseManager.getInvoiceMetadata(invoiceNumber);
  
  if (!invoice) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Invoice ${invoiceNumber} not found in database.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text", 
        text: `📄 **Invoice Details: ${invoice.invoice_number}**

👤 **Client:** ${invoice.client_name}
📧 **Email:** ${invoice.client_email || 'Not provided'}
💰 **Amount:** ${invoice.currency} ${invoice.total_amount}
📊 **Status:** ${invoice.status}
📅 **Created:** ${new Date(invoice.created_at).toLocaleString()}
📅 **Updated:** ${new Date(invoice.updated_at).toLocaleString()}

🔗 **PDF URL:** ${invoice.pdf_url}

**Line Items:** ${invoice.metadata?.items?.length || 0} items
**Subtotal:** ${invoice.currency} ${invoice.metadata?.subtotal?.toFixed(2) || '0.00'}
**VAT:** ${invoice.currency} ${invoice.metadata?.vatAmount?.toFixed(2) || '0.00'}

${invoice.metadata?.notes ? `**Notes:** ${invoice.metadata.notes}` : ''}`,
      },
    ],
  };
}

async function handleListInvoices(args: any, supabaseManager: SupabaseManager) {
  const { limit = 20 } = args;
  
  const invoices = await supabaseManager.listInvoices(limit);
  
  if (invoices.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "📋 No invoices found in the database.",
        },
      ],
    };
  }

  const invoiceList = invoices
    .map((inv, index) => 
      `${index + 1}. **${inv.invoice_number}** - ${inv.client_name} - ${inv.currency} ${inv.total_amount} - ${inv.status} (${new Date(inv.created_at).toLocaleDateString()})`
    )
    .join('\n');

  return {
    content: [
      {
        type: "text",
        text: `📋 **Recent Invoices** (${invoices.length} found)

${invoiceList}

Use \`get-invoice-details\` to view full details of any invoice.`,
      },
    ],
  };
}

async function handleUpdateInvoiceStatus(args: any, supabaseManager: SupabaseManager) {
  const { invoiceNumber, status } = args;
  
  const success = await supabaseManager.updateInvoiceStatus(invoiceNumber, status);
  
  if (!success) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Could not update status for invoice ${invoiceNumber}. Invoice may not exist.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `✅ Invoice ${invoiceNumber} status updated to: **${status}**`,
      },
    ],
  };
}

// ===== SMITHERY HTTP SERVER =====
// This handles the HTTP transport for Smithery deployment
function parseConfig(req: express.Request): Config {
  const rawConfig: any = {};
  
  // Parse dot-notation query parameters from Smithery
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      const keys = key.split('.');
      let current = rawConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
    }
  }

  // Validate and parse configuration
  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error(`Invalid configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Express app setup
const app = express();

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id", "*"],
  exposedHeaders: ["mcp-session-id", "mcp-protocol-version"]
}));

app.use(express.json());

// Store active transports and servers by session
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const servers: { [sessionId: string]: Server } = {};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Invoice MCP Server with Supabase',
    version: '1.0.0'
  });
});

// Main MCP endpoint
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;
    let server: Server;

    if (sessionId && transports[sessionId] && servers[sessionId]) {
      // Reuse existing transport and server
      transport = transports[sessionId];
      server = servers[sessionId];
    } else {
      // Parse configuration from query parameters
      const config = parseConfig(req);
      
      // Create new server with configuration
      server = createMcpServer(config);
      
      // Create new transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
          servers[newSessionId] = server;
        }
      });

      // Clean up on close
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          delete servers[transport.sessionId];
        }
      };

      // Connect server to transport
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
          message: error instanceof Error ? error.message : 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Handle GET requests for server-to-client notifications
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

// Start server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`🚀 Invoice MCP Server with Supabase running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`📚 Ready for Smithery deployment!`);
});

