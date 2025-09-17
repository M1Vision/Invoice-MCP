import { PDFViewer } from "@react-pdf/renderer";
import PreviewInvoice from "./components/preview-invoice";

function App() {
  return (
    <PDFViewer style={{ height: "100vh", width: "100%" }}>
      <PreviewInvoice />
    </PDFViewer>
  );
}

export default App;
