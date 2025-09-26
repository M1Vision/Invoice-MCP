# 🚀 Smithery Deployment Guide - Invoice MCP with Cloud Storage

## 🎯 **Problem Solved**

Your original issue was that **invoices weren't accessible** because:
- ❌ Local file storage in containers is ephemeral
- ❌ Smithery only supports `/mcp` endpoint (no custom file serving)
- ❌ No persistent storage for PDF files

## ✅ **Cloud Storage Solution**

I've implemented a **cloud storage solution** that makes invoices permanently accessible via public URLs:

### **Key Features:**
- 📄 **PDFs stored in cloud storage** (Supabase, AWS S3, or custom)
- 🔗 **Direct download URLs** provided immediately
- 💾 **Metadata tracking** for invoice management
- 🌍 **Global accessibility** - works from anywhere
- 🔄 **Persistent storage** - survives server restarts

## 🏗️ **Architecture**

```
User Request → MCP Server → Generate PDF Buffer → Upload to Cloud → Return Public URL
                ↓
         Save Metadata → Cloud Storage → Accessible Forever
```

## 📋 **Setup Instructions**

### **Option 1: Supabase Storage (Recommended)**

1. **Create Supabase Project:**
   ```bash
   # Go to https://supabase.com
   # Create new project
   # Get your project URL and anon key
   ```

2. **Create Storage Bucket:**
   ```sql
   -- In Supabase SQL Editor
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('invoices', 'invoices', true);
   ```

3. **Configure Smithery:**
   ```yaml
   # Your smithery.yaml is already configured!
   # Just provide these values when deploying:
   cloudStorageProvider: supabase
   supabaseUrl: https://your-project.supabase.co
   supabaseKey: your-supabase-anon-key
   supabaseBucket: invoices
   ```

### **Option 2: AWS S3 Storage**

1. **Create S3 Bucket:**
   ```bash
   aws s3 mb s3://your-invoice-bucket
   aws s3api put-bucket-policy --bucket your-invoice-bucket --policy '{
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::your-invoice-bucket/*"
     }]
   }'
   ```

2. **Configure Smithery:**
   ```yaml
   cloudStorageProvider: s3
   awsS3Bucket: your-invoice-bucket
   awsRegion: us-east-1
   awsAccessKeyId: your-access-key
   awsSecretAccessKey: your-secret-key
   ```

### **Option 3: Custom Storage**

For any other cloud provider, modify the `SimpleCloudStorage` class in `cloud-storage.ts`.

## 🚀 **Deployment Steps**

1. **Build the project:**
   ```bash
   cd server
   npm run build:smithery
   ```

2. **Deploy to Smithery:**
   ```bash
   # Install Smithery CLI
   npm install -g @smithery/cli
   
   # Deploy
   smithery deploy
   ```

3. **Configure in Smithery Dashboard:**
   - Set your cloud storage credentials
   - Configure business details
   - Test the deployment

## 💡 **How It Works Now**

### **Before (Your Issue):**
```
Generate Invoice → Save to temp/ → ❌ Not accessible
```

### **After (Cloud Solution):**
```
Generate Invoice → Upload to Cloud → ✅ Get permanent URL
                      ↓
               https://storage.com/invoice-123.pdf
```

### **Example Response:**
```
✅ Invoice PDF Successfully Generated & Stored!

📄 Invoice: INV-12345
👤 Client: John Smith
💰 Total: GBP 250.00
📅 Created: 2024-01-15, 10:30:00

🔗 Download URL: https://your-storage.supabase.co/storage/v1/object/public/invoices/invoice-INV-12345.pdf

Cloud Storage Features:
• ✅ Permanently accessible via URL
• ✅ No server dependency
• ✅ Automatic backup & redundancy
• ✅ Global CDN distribution

Access Methods:
• Direct download: Click the URL above
• Share with clients: Send the URL directly
• Embed in emails: Use the URL in email templates

*Note: This invoice is stored in cloud storage and will remain accessible even if the server restarts.*
```

## 🔧 **Configuration Options**

The `smithery.yaml` now supports multiple cloud storage providers:

```yaml
configSchema:
  properties:
    cloudStorageProvider:
      enum: ["supabase", "s3", "simple"]
      description: "Choose your cloud storage provider"
    
    # Supabase options
    supabaseUrl: "https://your-project.supabase.co"
    supabaseKey: "your-anon-key"
    supabaseBucket: "invoices"
    
    # AWS S3 options  
    awsS3Bucket: "your-bucket"
    awsRegion: "us-east-1"
    awsAccessKeyId: "your-key"
    awsSecretAccessKey: "your-secret"
```

## 📊 **Benefits**

| Feature | Local Storage ❌ | Cloud Storage ✅ |
|---------|------------------|------------------|
| Persistent | No | Yes |
| Accessible | Only locally | Global URLs |
| Backup | Manual | Automatic |
| CDN | No | Yes |
| Sharing | Difficult | Easy URLs |
| Cost | Free | ~$0.01/GB |

## 🔒 **Security**

- **Public URLs:** PDFs are accessible to anyone with the URL
- **No authentication:** URLs are direct download links
- **Secure by obscurity:** URLs are hard to guess
- **Optional:** Add authentication layer if needed

## 🆘 **Troubleshooting**

### **Common Issues:**

1. **"Upload failed"**
   - Check cloud storage credentials
   - Verify bucket exists and is public
   - Check network connectivity

2. **"PDF generation failed"**
   - Check invoice data structure
   - Verify all required fields
   - Check server logs

3. **"URL not accessible"**
   - Verify bucket is public
   - Check CORS settings
   - Test URL in browser

## 🎉 **Next Steps**

1. **Choose your cloud storage provider**
2. **Set up storage bucket/container**
3. **Deploy to Smithery with credentials**
4. **Test invoice generation**
5. **Share URLs with clients!**

---

## 🤝 **Support**

Your invoices are now **permanently accessible** via cloud storage URLs! No more localhost issues or server dependencies.

The solution works with:
- ✅ **Smithery deployment** (containerized)
- ✅ **Any cloud storage** (Supabase, S3, etc.)
- ✅ **Global accessibility** (CDN distributed)
- ✅ **Permanent URLs** (survive restarts)

