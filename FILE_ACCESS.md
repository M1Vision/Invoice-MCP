# Invoice PDF File Access Guide

## 🚨 Important: How to Access Your Generated PDFs

When you use the Invoice MCP through a web tool or LLM interface, the PDF files are generated on the server and are immediately accessible through multiple endpoints with enhanced metadata tracking.

## 📥 Enhanced Download Process

### 1. **Generate Invoice**
Use the `generate-invoice-pdf` tool as normal:
```
Create an invoice for John Smith for web development work
```

### 2. **Get Enhanced Response**
The tool now responds with comprehensive information:
```
✅ Invoice PDF Successfully Generated!

📄 Invoice: INV-12345
👤 Client: John Smith
💰 Total: GBP 250.00
📅 Created: 2024-01-15, 10:30:00

🔗 Direct Download URL: /files/invoice-INV-12345.pdf

Quick Access:
• View all invoices: GET /files
• Download this invoice: GET /files/invoice-INV-12345.pdf
• Invoice metadata: GET /invoices/INV-12345

For web access, use your server's full URL:
https://your-server-domain.com/files/invoice-INV-12345.pdf
```

### 3. **Access Your PDF**
Multiple ways to access your invoices:
- **Direct download**: `https://your-server.com/files/invoice-INV-12345.pdf`
- **Browse all invoices**: `https://your-server.com/invoices`
- **Get metadata**: `https://your-server.com/invoices/INV-12345`

## 🌐 Enhanced API Endpoints

### File Download
```
GET /files/{filename}
```
- Downloads a specific PDF file
- Example: `GET /files/invoice-INV-12345.pdf`
- Response: PDF file download with proper headers

### List All Files (Enhanced)
```
GET /files
```
- Lists all available PDF files with metadata
- Returns JSON with download URLs and invoice information
- Example response:
```json
{
  "files": [
    {
      "filename": "invoice-INV-12345.pdf",
      "invoiceNumber": "INV-12345",
      "downloadUrl": "/files/invoice-INV-12345.pdf",
      "fullUrl": "https://your-server.com/files/invoice-INV-12345.pdf",
      "metadata": {
        "invoiceNumber": "INV-12345",
        "clientName": "John Smith",
        "total": "250.00",
        "currency": "GBP",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "status": "generated"
      }
    }
  ],
  "total": 1,
  "serverUrl": "https://your-server.com"
}
```

### Invoice Management (NEW!)
```
GET /invoices
```
- Lists all invoices with complete metadata
- Includes full download URLs
- Example response:
```json
{
  "invoices": [
    {
      "invoiceNumber": "INV-12345",
      "filename": "invoice-INV-12345.pdf",
      "downloadUrl": "/files/invoice-INV-12345.pdf",
      "fullDownloadUrl": "https://your-server.com/files/invoice-INV-12345.pdf",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "total": "250.00",
      "currency": "GBP",
      "clientName": "John Smith",
      "status": "generated"
    }
  ],
  "total": 1,
  "serverUrl": "https://your-server.com"
}
```

### Get Specific Invoice
```
GET /invoices/{invoiceNumber}
```
- Gets metadata for a specific invoice
- Example: `GET /invoices/INV-12345`
- Returns complete invoice information with download URL

### Update Invoice Status (NEW!)
```
PATCH /invoices/{invoiceNumber}/status
```
- Updates invoice status (generated, sent, paid)
- Body: `{ "status": "sent" }`
- Useful for tracking invoice lifecycle

### Delete Invoice (NEW!)
```
DELETE /invoices/{invoiceNumber}
```
- Removes invoice PDF and metadata
- Example: `DELETE /invoices/INV-12345`
- Permanently deletes both file and tracking data

## 🔒 Security Features

- **File Type Restriction**: Only `.pdf` files can be accessed
- **Path Sanitization**: Prevents directory traversal attacks
- **Filename Validation**: Blocks malicious filename patterns

## 💡 Usage Examples

### With Claude Desktop (Local)
1. Generate invoice using MCP
2. Copy the download URL from the response
3. Replace `localhost:8081` with your server URL
4. Paste the full URL in your browser

### With Smithery Deployment
1. Generate invoice using MCP
2. Copy the download URL: `/files/invoice-ABC-123.pdf`
3. Prepend your Smithery URL: `https://your-server.smithery.ai/files/invoice-ABC-123.pdf`
4. Access the URL to download your PDF

### With Web Tools
1. Use the Invoice MCP through your web interface
2. The LLM will provide the download URL in the response
3. Click or copy the URL to access your PDF

## 🗂️ File Management

### Automatic Cleanup
- Files are stored temporarily in the container
- Consider implementing cleanup policies for production use

### Manual Cleanup
```bash
# List all files
curl https://your-server.smithery.ai/files

# Delete a specific file
curl -X DELETE https://your-server.smithery.ai/files/invoice-ABC-123.pdf
```

## 🚀 Production Considerations

### For High-Volume Usage
- Implement file expiration (e.g., delete files after 24 hours)
- Add authentication to file endpoints
- Consider cloud storage integration (AWS S3, Google Cloud Storage)

### Alternative: Base64 Response
For smaller PDFs, you could modify the tool to return base64-encoded PDF data directly in the response, eliminating the need for file serving.

## 🔧 Troubleshooting

### "File not found" Error
- Check if the invoice was successfully generated
- Verify the filename in the URL matches exactly
- Ensure the server is running and accessible

### Cannot Access Download URL
- Verify your Smithery deployment URL is correct
- Check if the server is publicly accessible
- Ensure CORS is properly configured

### PDF Won't Download
- Try accessing the `/files` endpoint first to list available files
- Check browser network tools for any CORS or security errors
- Verify the file still exists on the server

