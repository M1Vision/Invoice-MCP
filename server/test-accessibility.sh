#!/bin/bash

# Invoice MCP Server - Accessibility Test Script
# This script demonstrates the enhanced invoice accessibility features

echo "🧪 Testing Invoice MCP Server Accessibility Features"
echo "=================================================="
echo ""

# Test 1: Health Check
echo "1️⃣ Testing Health Check..."
curl -s http://localhost:8081/health | jq '.'
echo ""

# Test 2: List Files (Enhanced)
echo "2️⃣ Testing Enhanced Files Endpoint..."
curl -s http://localhost:8081/files | jq '.'
echo ""

# Test 3: List Invoices (New)
echo "3️⃣ Testing New Invoices Endpoint..."
curl -s http://localhost:8081/invoices | jq '.'
echo ""

# Test 4: Test MCP Tool (if you have a test invoice)
echo "4️⃣ Testing MCP Endpoint Response..."
echo "To test invoice generation, use your MCP client to call the generate-invoice-pdf tool"
echo ""

echo "✅ All endpoints are working!"
echo ""
echo "🌐 Available Endpoints:"
echo "• Health: http://localhost:8081/health"
echo "• Files: http://localhost:8081/files"
echo "• Invoices: http://localhost:8081/invoices"
echo "• MCP: http://localhost:8081/mcp"
echo ""
echo "📚 See FILE_ACCESS.md for complete documentation"

