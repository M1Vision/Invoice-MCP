# Invoice PDF File Access Guide

## 🚨 Important: How to Access Your Generated PDFs

When you use the Invoice MCP through a web tool or LLM interface, the PDF files are generated on the server but need to be downloaded using specific URLs.

## 📥 Download Process

### 1. **Generate Invoice**
Use the `generate-invoice-pdf` tool as normal:
```
Create an invoice for John Smith for web development work
```

### 2. **Get Download URL**
The tool will respond with a download URL like:
```
🔗 Download URL: /files/invoice-JS-15-01-2024.pdf
```

### 3. **Access Your PDF**
Replace the domain with your actual Smithery deployment URL:
```
https://your-server.smithery.ai/files/invoice-JS-15-01-2024.pdf
```

## 🌐 Available Endpoints

### File Download
```
GET /files/{filename}
```
- Downloads a specific PDF file
- Example: `GET /files/invoice-JS-15-01-2024.pdf`
- Response: PDF file download

### List All Files
```
GET /files
```
- Lists all available PDF files
- Returns JSON with download URLs
- Example response:
```json
{
  "files": [
    {
      "filename": "invoice-JS-15-01-2024.pdf",
      "downloadUrl": "/files/invoice-JS-15-01-2024.pdf",
      "fullUrl": "https://your-server.smithery.ai/files/invoice-JS-15-01-2024.pdf"
    }
  ]
}
```

### Delete File (Optional)
```
DELETE /files/{filename}
```
- Removes a specific PDF file from server
- Example: `DELETE /files/invoice-JS-15-01-2024.pdf`

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

