# 🚀 Complete Supabase + Smithery Setup Guide

## ❌ **The Problem** 
You asked: *"so once I have the supabase credentials I paste them in here? there is no env file?"*

**Answer: NO env file needed!** Smithery handles configuration differently than traditional deployments.

## ✅ **How Smithery Configuration Works**

### **1. Configuration via Smithery UI (Not .env files)**
- Smithery uses **query parameters** to pass configuration
- Configuration is defined in `smithery.yaml` 
- Users enter values in **Smithery's web interface**
- No `.env` files needed!

### **2. Configuration Flow:**
```
User enters config in Smithery UI → Query parameters → MCP Server → Parsed config
```

## 🏗️ **Complete Setup Process**

### **Step 1: Setup Supabase** 

1. **Create Supabase Project:**
   ```bash
   # Go to https://supabase.com
   # Click "New Project"
   # Choose organization, name, region, password
   ```

2. **Get Your Credentials:**
   ```
   Project URL: https://your-project-id.supabase.co
   Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   *Found in: Project Settings → API*

3. **Create Storage Bucket (IMPORTANT - PRIVATE for Security):**
   ```sql
   -- Go to Storage in Supabase Dashboard
   -- Click "New Bucket"
   -- Name: "invoices"  
   -- Make it Public: ❌ LEAVE UNCHECKED (keep it PRIVATE!)
   -- Or run this SQL:
   
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('invoices', 'invoices', false);  -- false = private bucket
   ```
   
   **🔒 SECURITY NOTE:** 
   - Invoices contain sensitive business and client data
   - PRIVATE buckets protect against unauthorized access
   - The server will generate time-limited signed URLs (7 days expiration)
   - Only people with the signed URL can download the invoice

4. **Set Storage Policies (Required for Private Bucket):**
   ```sql
   -- Allow authenticated uploads to invoices bucket
   CREATE POLICY "Authenticated Upload" ON storage.objects
   FOR INSERT TO authenticated
   WITH CHECK (bucket_id = 'invoices');
   
   -- Allow authenticated access for signed URL generation
   CREATE POLICY "Authenticated Access" ON storage.objects
   FOR SELECT TO authenticated
   USING (bucket_id = 'invoices');
   ```

### **Step 2: Deploy to Smithery**

1. **Install Dependencies:**
   ```bash
   cd server
   npm install  # This installs @supabase/supabase-js automatically
   ```

2. **Build the Project:**
   ```bash
   npm run build:robust  # Builds the robust Supabase-enabled server
   ```

3. **Deploy to Smithery:**
   ```bash
   # Install Smithery CLI
   npm install -g @smithery/cli
   
   # Deploy from the root directory
   smithery deploy
   ```

### **Step 3: Configure in Smithery Dashboard**

When you deploy, Smithery will show you a **configuration form** based on your `smithery.yaml`:

```yaml
# This creates the form fields:
Required Fields:
  ✅ Supabase Project URL: https://your-project-id.supabase.co
  ✅ Supabase Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Optional Fields:
  📁 Storage Bucket: invoices (default)
  📊 Database Table: invoices (default) 
  🏢 Business Name: Your Business Ltd
  📧 Business Email: contact@yourbusiness.com
  📞 Business Phone: +44 123 456 7890
  🏠 Business Address: 123 Business St, London, UK
  
Advanced Settings:
  🔄 Enable Database Storage: ✅ (recommended)
  🪣 Auto-create Bucket: ✅ (recommended)
```

### **Step 4: Test the Setup**

1. **Generate Test Invoice:**
   ```
   Use MCP tool: generate-invoice-pdf
   
   Input:
   - invoiceNumber: "TEST-001"
   - clientName: "Test Client"
   - clientEmail: "test@example.com"
   - items: [{"description": "Test Service", "quantity": 1, "unitPrice": 100}]
   ```

2. **Expected Result:**
   ```
   ✅ Invoice Generated Successfully!
   
   📄 Invoice: TEST-001
   👤 Client: Test Client
   💰 Total: GBP 120.00
   📅 Due Date: 2024-02-15
   
   🔗 PDF Download: https://your-project.supabase.co/storage/v1/object/sign/invoices/invoice-TEST-001-1234567890.pdf?token=...
   
   Storage Details:
   • ✅ PDF stored securely in PRIVATE Supabase bucket
   • ✅ Signed URL generated (expires in 7 days)
   • ✅ Secure access - only people with URL can download
   • ✅ Protected from unauthorized access
   
   Security Features:
   • 🔒 Private bucket - invoices NOT publicly accessible
   • ⏱️ Time-limited URLs (expire after 7 days)
   • 🛡️ No unauthorized access to sensitive data
   • ✅ Share URLs safely with clients
   ```

## 🛠️ **Available MCP Tools**

Your robust server provides these tools:

### **1. generate-invoice-pdf**
- Generates professional PDF invoices
- Uploads to PRIVATE Supabase Storage bucket
- Saves metadata to database (optional)
- Returns secure time-limited signed URL (7 days)

### **2. get-invoice-details**
- Retrieves invoice information from database
- Shows status, amounts, dates
- Includes PDF download link

### **3. list-invoices**
- Lists recent invoices with status
- Sortable by date, amount, status
- Pagination support

### **4. update-invoice-status** 
- Updates invoice status (generated → sent → paid)
- Tracks invoice lifecycle
- Useful for business processes

## 🔧 **Advanced Configuration**

### **Database Auto-Setup**
The server automatically:
- ✅ Creates `invoices` table if needed
- ✅ Sets up proper indexes
- ✅ Configures data types
- ✅ Handles migrations

### **Storage Auto-Setup**  
The server automatically:
- ✅ Creates PRIVATE storage bucket if needed (when autoCreateBucket enabled)
- ✅ Configures secure access policies
- ✅ Sets file size limits (50MB)
- ✅ Restricts to PDF files only
- ✅ Generates time-limited signed URLs for downloads

### **Error Handling**
- ✅ Graceful degradation if database unavailable
- ✅ Retry logic for uploads
- ✅ Detailed error messages
- ✅ Fallback configurations

## 📊 **Database Schema**

The server creates this table automatically:

```sql
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  total_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'GBP',
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'paid', 'cancelled')),
  pdf_url TEXT,
  pdf_filename TEXT,
  metadata JSONB,  -- Full invoice details
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🎯 **Key Benefits**

| Feature | Traditional Setup | Smithery + Supabase |
|---------|------------------|-------------------- |
| Configuration | .env files | Web UI form |
| File Storage | Local/temporary | Cloud/permanent |
| Database | Manual setup | Auto-created |
| URLs | Localhost only | Global public URLs |
| Deployment | Complex | One command |
| Scaling | Manual | Automatic |

## 🆘 **Troubleshooting**

### **"Supabase connection failed"**
- ✅ Check URL format: `https://your-project.supabase.co`
- ✅ Verify anon key is correct
- ✅ Ensure project is active

### **"Bucket creation failed"**
- ✅ Check Storage is enabled in Supabase
- ✅ Verify bucket name is valid (lowercase, no spaces)
- ✅ Check permissions

### **"Table creation failed"**
- ✅ Ensure Database is enabled
- ✅ Check RLS policies aren't blocking
- ✅ Verify sufficient permissions

## 🚀 **Ready to Deploy!**

1. ✅ **Supabase project created**
2. ✅ **Credentials obtained** 
3. ✅ **Code built**: `npm run build:robust`
4. ✅ **Deploy**: `smithery deploy`
5. ✅ **Configure in Smithery UI**
6. ✅ **Test invoice generation**

**No .env files, no manual configuration - just paste your Supabase credentials in Smithery's web interface and you're ready to generate invoices!** 🎉

