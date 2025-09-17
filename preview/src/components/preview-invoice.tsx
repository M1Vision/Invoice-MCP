import InvoiceTemplate from "@shared/components/invoice-template";
import { testInvoiceData } from "../lib/test-invoice-data";

const PreviewInvoice = () => {
  return <InvoiceTemplate invoice={testInvoiceData} />;
};

export default PreviewInvoice;
