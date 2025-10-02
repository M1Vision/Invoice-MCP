# 🚀 Smithery Deployment Guide - Invoice MCP with Cloud Storage

## 🎯 **Problem Solved**

Your original issue was that **invoices weren't accessible** because:
- ❌ Local file storage in containers is ephemeral
- ❌ Smithery only supports `/mcp` endpoint (no custom file serving)
- ❌ No persistent storage for PDF files

## ✅ **Cloud Storage Solution**

I've implemented a **cloud storage solution** that makes invoices permanently accessible via public URLs:

### **Key Features:**
- 📄 **PDFs stored in Supabase Storage**
- 🔗 **Direct download URLs** provided immediately
- 🌍 **Global accessibility** - works from anywhere
- 🔄 **Persistent storage** - survives server restarts

## 🏗️ **Architecture**

```
User Request → MCP Server → Generate PDF Buffer → Upload to Supabase → Return Public URL
```

## 📋 **Setup Instructions**

### **Supabase Storage Setup (Recommended)**

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
   VALUES ('invoices', 'invoices', true)
   ON CONFLICT (id) DO UPDATE SET public = true;
   ```

   > 💡 You can also create the bucket through the Supabase dashboard UI—just ensure it's marked as public so the generated URLs are accessible.

3. **Configure Smithery:**
   ```yaml
   # Your smithery.yaml is already configured!
   # Just provide these values when deploying:
   supabaseUrl: https://your-project.supabase.co
   supabaseKey: your-supabase-anon-key
   supabaseBucket: invoices
   autoCreateBucket: false # switch to true only if you deploy with a service role key
   ```

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
Generate Invoice → Upload to Supabase → ✅ Get permanent URL
                      ↓
        https://<project>.supabase.co/storage/v1/object/public/invoices/invoice-123.pdf
```

### **Example Response:**
```
✅ Invoice PDF Successfully Generated & Stored!

📄 Invoice: INV-12345
👤 Client: John Smith
💰 Total: GBP 250.00
📅 Created: 2024-01-15, 10:30:00

🔗 Download URL: https://your-storage.supabase.co/storage/v1/object/public/invoices/invoice-INV-12345.pdf

Supabase Storage Features:
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

The Smithery configuration focuses on Supabase storage credentials and branding options. Auto-creating buckets requires deploying with a Supabase service role key; otherwise, create the bucket ahead of time and keep `autoCreateBucket` disabled.

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

1. **Set up your Supabase project & public bucket**
2. **Deploy to Smithery with Supabase credentials**
3. **Test invoice generation**
4. **Share URLs with clients!**

---

## 🤝 **Support**

Your invoices are now **permanently accessible** via cloud storage URLs! No more localhost issues or server dependencies.

The solution works with:
- ✅ **Smithery deployment** (containerized)
- ✅ **Supabase Storage buckets** for persistent file hosting
- ✅ **Global accessibility** (CDN distributed)
- ✅ **Permanent URLs** (survive restarts)

