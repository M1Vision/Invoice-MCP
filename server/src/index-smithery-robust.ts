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
import { Invoice, InvoiceSchema } from "./shared/types/invoice.js";
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
  autoCreateBucket: z
    .boolean()
    .default(false)
    .describe(
      "Automatically create the bucket if it does not exist (requires a service role key). Leave disabled when using an anon key."
    ),

  // OPTIONAL: Business information (for invoice branding)
  businessName: z.string().optional().describe("Your business name (appears on invoices)"),
  businessEmail: z.string().optional().describe("Your business email"),
  businessPhone: z.string().optional().describe("Your business phone"),
  businessAddress: z.string().optional().describe("Your business address"),

  // OPTIONAL: Legacy field preserved for backwards compatibility. Metadata storage is currently disabled.
  enableMetadataStorage: z
    .boolean()
    .default(false)
    .describe(
      "(Deprecated) Metadata storage in Supabase Database is not currently supported and will be ignored."
    ),
});

export type Config = z.infer<typeof configSchema>;

// ===== SUPABASE CLIENT MANAGEMENT =====
class SupabaseManager {
  private supabase: any;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  async initialize(): Promise<void> {
    try {
      if (this.config.autoCreateBucket) {
        await this.ensureBucketExists();
      } else {
        await this.checkBucketAccess();
      }

      console.log('✅ Supabase initialized successfully (PDF storage ready)');
    } catch (error) {
      console.error('❌ Supabase initialization failed:', error);
      throw error;
    }
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      console.log(`🔍 Checking if bucket '${this.config.storageBucket}' exists...`);

      const { data: buckets, error } = await this.supabase.storage.listBuckets();

      if (error) {
        console.warn('Could not list buckets:', error.message);
        console.log('⚠️  Will attempt to create bucket anyway...');
      } else {
        console.log('📋 Available buckets:', buckets?.map((bucket: { name: string }) => bucket.name) || 'none');
      }

      const bucketExists = buckets?.some((bucket: { name: string }) => bucket.name === this.config.storageBucket);

      if (bucketExists) {
        console.log(`✅ Bucket '${this.config.storageBucket}' already exists`);
        return;
      }

      console.log(`📦 Creating bucket '${this.config.storageBucket}'...`);
      const { error: createError } = await this.supabase.storage.createBucket(
        this.config.storageBucket,
        {
          public: true,
          allowedMimeTypes: ['application/pdf'],
          fileSizeLimit: 50 * 1024 * 1024, // 50MB
        }
      );

      if (createError) {
        console.error(`❌ Could not create bucket: ${createError.message}`);
        throw new Error(
          `Failed to create storage bucket '${this.config.storageBucket}': ${createError.message}. ` +
            `If you are using an anon key, disable autoCreateBucket in your configuration.`
        );
      } else {
        console.log(`✅ Successfully created storage bucket: ${this.config.storageBucket}`);
      }
    } catch (error) {
      console.error('❌ Error ensuring bucket exists:', error);
      throw error;
    }
  }

  private async checkBucketAccess(): Promise<void> {
    try {
      console.log(`🔍 Verifying access to bucket '${this.config.storageBucket}' (autoCreateBucket disabled)...`);

      const { error } = await this.supabase.storage
        .from(this.config.storageBucket)
        .list({ limit: 1, offset: 0 });

      if (error) {
        if (error.message?.toLowerCase().includes('not found')) {
          throw new Error(
            `Supabase bucket '${this.config.storageBucket}' does not exist or is not accessible. ` +
              `Create the bucket manually or enable autoCreateBucket with a service role key.`
          );
        }

        console.warn(
          `⚠️  Could not list contents of bucket '${this.config.storageBucket}'. ` +
            'Continuing anyway because uploads may still succeed with anon keys.',
          error.message
        );
      } else {
        console.log(`✅ Bucket '${this.config.storageBucket}' is reachable.`);
      }
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw explicit errors, log and continue for unexpected ones
        if (error.message.includes('does not exist') || error.message.includes('not accessible')) {
          throw error;
        }

        console.warn('⚠️  Bucket verification encountered an unexpected issue. Proceeding anyway.', error.message);
      } else {
        console.warn('⚠️  Bucket verification encountered an unexpected issue. Proceeding anyway.', error);
      }
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
      const guidance =
        error.message?.toLowerCase().includes('bucket not found')
          ? ` Verify that the bucket '${this.config.storageBucket}' exists and is public.`
          : '';
      throw new Error(`PDF upload failed: ${error.message}.${guidance}`);
    }

    // Get public URL
    const { data: publicUrlData } = this.supabase.storage
      .from(this.config.storageBucket)
      .getPublicUrl(filename);

    return publicUrlData.publicUrl;
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

  if (config.enableMetadataStorage) {
    console.warn(
      'enableMetadataStorage is currently disabled in this deployment. Invoice PDFs will be stored in Supabase Storage only.'
    );
  }

  // Initialize on first use
  let initialized = false;
  const ensureInitialized = async () => {
    if (!initialized) {
      await supabaseManager.initialize();
      initialized = true;
    }
  };

  // Define available tools - simplified for PDF storage only
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: "generate-invoice-pdf",
        description: "Generate a professional invoice PDF and store it in Supabase Storage",
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
      }
    ];

    return { tools };
  });

  // Handle tool calls - simplified for PDF storage only
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await ensureInitialized();

    try {
      switch (request.params.name) {
        case "generate-invoice-pdf":
          return await handleGenerateInvoice(request.params.arguments, supabaseManager, config);
        
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
• ✅ PDF stored in Supabase Storage bucket: "${config.storageBucket}"
• ✅ Permanent public URL generated
• ✅ Accessible from anywhere
• ✅ Ready for your chat frontend

**Perfect for your use case:**
• Direct PDF storage in your "invoices" bucket
• No database complexity - just clean URLs
• Optimized for chat frontend integration`,
      },
    ],
  };
}

// ===== SMITHERY HTTP SERVER =====
// This handles the HTTP transport for Smithery deployment
function parseConfig(req: express.Request): Config {
  let rawConfig: any = {};
  
  // Method 1: Parse base64-encoded config parameter (Smithery standard)
  const configParam = req.query.config as string;
  if (configParam) {
    try {
      const decodedConfig = Buffer.from(configParam, 'base64').toString();
      rawConfig = JSON.parse(decodedConfig);
      console.log('Parsed config from base64 parameter:', rawConfig);
    } catch (error) {
      console.warn('Failed to parse base64 config parameter:', error);
    }
  }
  
  // Method 2: Parse dot-notation query parameters (fallback)
  if (Object.keys(rawConfig).length === 0) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && key !== 'config') {
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
    if (Object.keys(rawConfig).length > 0) {
      console.log('Parsed config from dot-notation query parameters:', rawConfig);
    }
  }

  // Method 3: Environment variables (fallback for local testing)
  if (Object.keys(rawConfig).length === 0) {
    rawConfig.supabaseUrl =
      process.env.SUPABASE_URL || process.env.supabaseUrl || process.env.SUPABASE_PROJECT_URL;
    rawConfig.supabaseKey =
      process.env.SUPABASE_KEY ||
      process.env.supabaseKey ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    rawConfig.storageBucket = process.env.STORAGE_BUCKET || process.env.storageBucket || 'invoices';
    rawConfig.businessName = process.env.BUSINESS_NAME || process.env.businessName;
    rawConfig.businessEmail = process.env.BUSINESS_EMAIL || process.env.businessEmail;
    rawConfig.businessPhone = process.env.BUSINESS_PHONE || process.env.businessPhone;
    rawConfig.businessAddress = process.env.BUSINESS_ADDRESS || process.env.businessAddress;
    
    // Only log if we found environment variables
    if (rawConfig.supabaseUrl || rawConfig.supabaseKey) {
      console.log('Using environment variables for configuration');
    }
  }

  console.log('Final raw config before validation:', rawConfig);

  // Validate and parse configuration
  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    console.error('Query parameters available:', Object.keys(req.query));
    console.error('Environment variables status:', {
      SUPABASE_URL: process.env.SUPABASE_URL ? '***set***' : 'undefined',
      SUPABASE_KEY: process.env.SUPABASE_KEY ? '***set***' : 'undefined',
      supabaseUrl: process.env.supabaseUrl ? '***set***' : 'undefined',
      supabaseKey: process.env.supabaseKey ? '***set***' : 'undefined'
    });
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

