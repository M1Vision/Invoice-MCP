import { StyleSheet } from "@react-pdf/renderer";

const COLORS = {
  primary: "#1a1a1a",
  secondary: "#5F6470",
  accent: "#3b719f",
  border: "#e5e7eb",
};

const BORDERS = {
  standard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "solid",
  },
  accent: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderStyle: "solid",
  },
} as const;

export const styles = StyleSheet.create({
  // document
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.3,
    color: COLORS.primary,
    letterSpacing: 0.35,
  },

  // header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 30,
  },
  invoiceTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
  },
  invoiceNumber: {
    fontSize: 11,
    color: COLORS.secondary,
  },
  logoImage: {
    height: 43,
    objectFit: "contain",
  },

  // dates and billing info
  mainContent: {
    flexDirection: "row",
    marginBottom: 25,
    borderTopWidth: BORDERS.standard.borderWidth,
    borderTopColor: BORDERS.standard.borderColor,
    borderTopStyle: BORDERS.standard.borderStyle,
    borderBottomWidth: BORDERS.standard.borderWidth,
    borderBottomColor: BORDERS.standard.borderColor,
    borderBottomStyle: BORDERS.standard.borderStyle,
  },
  leftColumn: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 15,
    paddingBottom: 11,
    borderRightWidth: BORDERS.standard.borderWidth,
    borderRightColor: BORDERS.standard.borderColor,
    borderRightStyle: BORDERS.standard.borderStyle,
  },
  middleColumn: {
    flex: 1,
    paddingTop: 15,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 11,
    borderRightWidth: BORDERS.standard.borderWidth,
    borderRightColor: BORDERS.standard.borderColor,
    borderRightStyle: BORDERS.standard.borderStyle,
  },
  rightColumn: {
    flex: 1,
    paddingTop: 15,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 11,
  },

  // main content
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 5,
  },
  dateRow: {
    marginBottom: 5,
  },
  dateValue: {
    fontSize: 10,
    color: COLORS.secondary,
  },
  companyName: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.secondary,
    marginBottom: 5,
  },
  addressText: {
    fontSize: 10,
    color: COLORS.secondary,
    marginBottom: 2,
  },

  // items table
  table: {
    marginBottom: 20,
    borderBottomWidth: BORDERS.standard.borderWidth,
    borderBottomColor: BORDERS.standard.borderColor,
    borderBottomStyle: BORDERS.standard.borderStyle,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: BORDERS.standard.borderWidth,
    borderBottomColor: BORDERS.standard.borderColor,
    borderBottomStyle: BORDERS.standard.borderStyle,
  },
  tableHeaderText: {
    fontWeight: "bold",
    color: COLORS.primary,
  },
  tableRow: {
    flexDirection: "row",
    paddingTop: 10,
    paddingBottom: 7,
  },

  // table columns
  serviceColumn: {
    width: "50%",
    paddingRight: 15,
  },
  qtyColumn: {
    width: "15%",
    textAlign: "right",
    color: COLORS.secondary,
  },
  rateColumn: {
    width: "20%",
    textAlign: "right",
    color: COLORS.secondary,
  },
  totalColumn: {
    width: "15%",
    textAlign: "right",
    color: COLORS.secondary,
  },

  // table cell content
  serviceName: {
    marginBottom: 2,
  },

  // totals
  totalsSection: {
    alignItems: "flex-end",
    marginBottom: 25,
  },
  totalsContainer: {
    width: 200,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 1,
  },
  totalRowWithBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 1,
    borderBottomWidth: BORDERS.standard.borderWidth,
    borderBottomColor: BORDERS.standard.borderColor,
    borderBottomStyle: BORDERS.standard.borderStyle,
  },
  finalTotalRow: {
    marginTop: 3,
    paddingVertical: 8,
    paddingBottom: 7,
    borderTopWidth: BORDERS.accent.borderWidth,
    borderTopColor: BORDERS.accent.borderColor,
    borderTopStyle: BORDERS.accent.borderStyle,
    borderBottomWidth: BORDERS.accent.borderWidth,
    borderBottomColor: BORDERS.accent.borderColor,
    borderBottomStyle: BORDERS.accent.borderStyle,
  },

  // total text
  totalLabel: {
    fontWeight: "bold",
  },
  values: {
    color: COLORS.secondary,
  },
  finalTotalLabel: {
    color: COLORS.accent,
    fontWeight: "bold",
  },
  finalTotalValue: {
    color: COLORS.accent,
    fontWeight: "bold",
  },

  // footer
  footer: {
    marginTop: "auto",
    paddingTop: 15,
  },

  // notes and terms
  thankYouText: {
    fontWeight: "bold",
    marginBottom: 5,
  },
  paymentTerms: {
    color: COLORS.secondary,
    marginBottom: 20,
  },

  // payment details
  paymentDetails: {
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 15,
    borderTopWidth: BORDERS.standard.borderWidth,
    borderTopColor: BORDERS.standard.borderColor,
    borderTopStyle: BORDERS.standard.borderStyle,
    borderBottomWidth: BORDERS.standard.borderWidth,
    borderBottomColor: BORDERS.standard.borderColor,
    borderBottomStyle: BORDERS.standard.borderStyle,
  },
  paymentTitle: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  paymentLabel: {
    fontSize: 9,
    fontWeight: "bold",
    width: 80,
    marginRight: 20,
  },
  paymentValue: {
    fontSize: 9,
    color: COLORS.secondary,
  },
});
