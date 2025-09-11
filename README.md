# Invoice MCP Server

A Model Context Protocol server for creating professional PDF invoices using natural language.

## Features

- **Natural Language Processing**: Create invoices by simply describing them
- **Professional PDF Generation**: High-quality invoice PDFs with customizable templates
- **Web-Compatible**: File serving endpoints for easy PDF access in web environments
- **Smithery Optimized**: Built with Smithery SDK for optimal deployment
- **Configuration Management**: User-configurable business details and branding
- **Multi-Transport Support**: STDIO, HTTP, and Smithery-optimized variants

## Quick Start

### Local Development
```bash
cd server
npm install
npm run build
npm run start:http
```

### Docker Deployment
```bash
docker build -t invoice-mcp .
docker run -p 8081:8081 invoice-mcp
```

### Smithery Deployment
1. Push to GitHub
2. Connect repository to Smithery
3. Deploy using the provided `smithery.yaml` configuration

## Usage

### Creating an Invoice
```
Create an invoice to John Smith for:
- Web development (10 hours @ £75/hour)
- Logo design (5 hours @ £60/hour)
- Due in 14 days
```

### Accessing Generated PDFs
The server provides download URLs for all generated PDFs:
- **Download**: `GET /files/{filename}`
- **List All**: `GET /files`
- **Delete**: `DELETE /files/{filename}`

See [FILE_ACCESS.md](FILE_ACCESS.md) for complete file access documentation.

## Configuration

Configure business details via `smithery.yaml`:
- Logo URL
- Business name and address
- Banking information
- Default currency and payment terms

## Architecture

- **`index.ts`**: STDIO transport (Claude Desktop)
- **`index-http.ts`**: Manual HTTP implementation
- **`index-smithery.ts`**: Smithery SDK optimized (recommended)

## License

MIT License - see [LICENSE](LICENSE) for details.

