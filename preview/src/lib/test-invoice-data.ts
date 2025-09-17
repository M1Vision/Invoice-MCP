import { Invoice } from "@shared/types/invoice";

export const testInvoiceData: Invoice = {
  invoiceNumber: "INV-2024-001",
  date: new Date("2024-01-15"),
  dueDate: new Date("2024-02-14"),
  currency: "GBP",
  business: {
    name: "Highland Creative Studio",
    email: "hello@highlandcreative.co.uk",
    phone: "+44 131 555 0123",
    address: "42 Royal Mile",
    city: "Edinburgh",
    country: "Scotland",
    postCode: "EH1 2PB",
    accountName: "Highland Creative Studio Ltd",
    accountNumber: "12345678",
    sortCode: "80-22-60",
    logo: "https://i.ibb.co/7tkcWycq/waving-transparent.png",
  },
  customer: {
    name: "Glasgow Tech Solutions",
    email: "accounts@glasgowtech.co.uk",
    address: "15 Merchant City Square",
    city: "Glasgow",
    country: "Scotland",
    postCode: "G1 1RB",
  },
  items: [
    {
      description: "Website Design & Development",
      quantity: 1,
      unitPrice: 2500.0,
      total: 2500.0,
    },
    {
      description: "Logo Design & Branding Package",
      quantity: 1,
      unitPrice: 800.0,
      total: 800.0,
    },
  ],
  subtotal: 3300.0,
  vatRate: 0.2,
  vatAmount: 660.0,
  total: 3960.0,
  notes: "Thank you for your business!",
  terms: "Payment terms: Net 30 days.",
};
