export const invoicePdfToolSchema = {
  type: "object",
  properties: {
    invoice: {
      type: "object",
      description:
        "Invoice data object with business, customer, and item information",
      properties: {
        invoiceNumber: {
          type: "string",
          description: "Unique invoice identifier",
          default: "INV-0001",
        },
        date: {
          type: "string",
          description: "Invoice date in YYYY-MM-DD format",
        },
        dueDate: {
          type: "string",
          description: "Payment due date in YYYY-MM-DD format",
        },
        business: {
          type: "object",
          description: "Business information",
          properties: {
            name: { type: "string", description: "Business name" },
            email: { type: "string", description: "Business email" },
            phone: { type: "string", description: "Business phone" },
            address: {
              type: "string",
              description: "Business address",
            },
            city: { type: "string", description: "Business city" },
            country: {
              type: "string",
              description: "Business country",
            },
            postCode: {
              type: "string",
              description: "Business postal code",
            },
            accountName: {
              type: "string",
              description: "Bank account name",
            },
            accountNumber: {
              type: "string",
              description: "Bank account number",
            },
            sortCode: { type: "string", description: "Bank sort code" },
            logo: { type: "string", description: "Business logo URL" },
          },
          required: ["name"],
        },
        customer: {
          type: "object",
          description: "Customer information",
          properties: {
            name: { type: "string", description: "Customer name" },
            email: { type: "string", description: "Customer email" },
            address: {
              type: "string",
              description: "Customer address",
            },
            city: { type: "string", description: "Customer city" },
            country: {
              type: "string",
              description: "Customer country",
            },
            postCode: {
              type: "string",
              description: "Customer postal code",
            },
          },
          required: ["name"],
        },
        items: {
          type: "array",
          description: "Array of invoice line items",
          items: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Item description",
              },
              quantity: {
                type: "number",
                description: "Item quantity",
              },
              unitPrice: {
                type: "number",
                description: "Price per unit",
              },
              total: {
                type: "number",
                description: "Total price for this item",
              },
            },
            required: ["description", "quantity", "unitPrice", "total"],
          },
        },
        subtotal: {
          type: "number",
          description: "Subtotal before VAT",
        },
        vatRate: {
          type: "number",
          description: "VAT rate as decimal (0.20 for 20%)",
        },
        vatAmount: { type: "number", description: "VAT amount" },
        total: {
          type: "number",
          description: "Total amount including VAT",
        },
        currency: {
          type: "string",
          description:
            "Currency code. Use GBP for British Pounds/UK, USD for US Dollars/American, CAD for Canadian Dollars, EUR for Euros/European",
          enum: ["GBP", "USD", "CAD", "EUR"],
          default: "GBP",
        },
        notes: { type: "string", description: "Additional notes" },
        terms: { type: "string", description: "Payment terms" },
      },
      required: [
        "invoiceNumber",
        "date",
        "dueDate",
        "business",
        "customer",
        "items",
        "subtotal",
        "total",
      ],
    },
    outputPath: {
      type: "string",
      description:
        "Custom output file path (defaults to temp/invoice-{invoiceNumber}.pdf in container environment)",
    },
  },
  required: ["invoice"],
};
