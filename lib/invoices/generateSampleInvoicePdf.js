const SAMPLE_ROW_HEIGHT_MM = 6;
const PAGE_TOP_MM = 15;

const COL = {
  A: 15,
  B: 40,
  C: 65,
  D: 100,
  E: 145,
  F: 170,
};

const INVOICE_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const TABLE = {
  left: COL.B,
  descWidth: 78,
  qtyWidth: 22,
  unitWidth: 22,
  amountWidth: 28,
};

function yForExcelRow(rowNumber) {
  return PAGE_TOP_MM + (rowNumber - 1) * SAMPLE_ROW_HEIGHT_MM;
}

function rowValue(row, key) {
  if (!row || typeof row !== "object") return "";
  const value = row[key];
  if (value != null && value !== "") return value;
  return "";
}

function parseAmount(value) {
  if (value == null || value === "") return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  return parseAmount(value).toFixed(2);
}

function formatInvoiceDate(value) {
  if (value == null || value === "") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = INVOICE_MONTH_NAMES[parsed.getMonth()] ?? "";
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

function truncateTextToWidth(doc, text, maxWidthMm) {
  const content = String(text ?? "");
  if (!content) return "";

  if (doc.getTextWidth(content) <= maxWidthMm) return content;

  const ellipsis = "...";
  let truncated = content;
  while (
    truncated.length > 0 &&
    doc.getTextWidth(`${truncated}${ellipsis}`) > maxWidthMm
  ) {
    truncated = truncated.slice(0, -1);
  }

  return truncated ? `${truncated}${ellipsis}` : ellipsis;
}

function normalizeHeaderRow(data) {
  if (Array.isArray(data)) return data[0] ?? {};
  if (data && typeof data === "object") return data;
  return {};
}

function normalizeLinesRows(data) {
  return Array.isArray(data) ? data : [];
}

function sumLineTotals(lines) {
  return lines.reduce(
    (sum, line) => sum + parseAmount(rowValue(line, "linetotal")),
    0
  );
}

function drawCellText(doc, text, x, y, { align = "left", maxWidth } = {}) {
  const content = String(text ?? "");
  if (!content) return;

  if (align === "right") {
    doc.text(content, x, y, { align: "right", maxWidth });
    return;
  }

  doc.text(content, x, y, maxWidth ? { maxWidth } : undefined);
}

function drawTableRowBorder(doc, rowNumber, { header = false } = {}) {
  const top = yForExcelRow(rowNumber) - 4.5;
  const height = SAMPLE_ROW_HEIGHT_MM;
  const right =
    TABLE.left +
    TABLE.descWidth +
    TABLE.qtyWidth +
    TABLE.unitWidth +
    TABLE.amountWidth;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(header ? 0.35 : 0.25);
  doc.rect(TABLE.left, top, right - TABLE.left, height);
  doc.line(
    TABLE.left + TABLE.descWidth,
    top,
    TABLE.left + TABLE.descWidth,
    top + height
  );
  doc.line(
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth,
    top,
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth,
    top + height
  );
  doc.line(
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth + TABLE.unitWidth,
    top,
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth + TABLE.unitWidth,
    top + height
  );
}

export async function generateSampleInvoicePdf(
  headerData,
  linesData,
  invoiceNumber = "11092026_1"
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const header = normalizeHeaderRow(headerData);
  const lines = normalizeLinesRows(linesData);
  const vatPerc = parseAmount(rowValue(header, "vat_perc"));
  const subtotal = sumLineTotals(lines);
  const vatAmount = (vatPerc * subtotal) / 100;
  const totalWithVat = (1 + vatPerc / 100) * subtotal;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const ownFields = [
    "ownname",
    "ownaddress1",
    "ownaddress2",
    "ownaddress3",
    "ownpostalcode",
    "ownvatregno",
    "owntel_no",
    "ownemail",
  ];
  ownFields.forEach((field, index) => {
    drawCellText(doc, rowValue(header, field), COL.A, yForExcelRow(1 + index));
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  drawCellText(doc, "Tax Invoice", COL.F, yForExcelRow(1), { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Bill To:", COL.A, yForExcelRow(10));
  doc.setFont("helvetica", "normal");

  const billFields = [
    "customer",
    "address1",
    "address2",
    "address3",
    "postalcode",
    "vatregno",
  ];
  billFields.forEach((field, index) => {
    drawCellText(doc, rowValue(header, field), COL.B, yForExcelRow(10 + index));
  });

  const invoiceMetaLabelX = COL.D + TABLE.qtyWidth;

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Invoice No", invoiceMetaLabelX, yForExcelRow(10));
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    rowValue(header, "invoice_number"),
    COL.F,
    yForExcelRow(10),
    { align: "right" }
  );

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Date", invoiceMetaLabelX, yForExcelRow(11));
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    formatInvoiceDate(rowValue(header, "created_at")),
    COL.F,
    yForExcelRow(11),
    { align: "right" }
  );

  const tableHeaderRow = 17;
  drawTableRowBorder(doc, tableHeaderRow, { header: true });
  doc.setFont("helvetica", "bold");
  drawCellText(
    doc,
    "Description",
    TABLE.left + 2,
    yForExcelRow(tableHeaderRow)
  );
  drawCellText(
    doc,
    "Quantity",
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth - 2,
    yForExcelRow(tableHeaderRow),
    { align: "right" }
  );
  drawCellText(
    doc,
    "Unit Price",
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth + TABLE.unitWidth - 2,
    yForExcelRow(tableHeaderRow),
    { align: "right" }
  );
  drawCellText(
    doc,
    "Amount",
    TABLE.left +
      TABLE.descWidth +
      TABLE.qtyWidth +
      TABLE.unitWidth +
      TABLE.amountWidth -
      2,
    yForExcelRow(tableHeaderRow),
    { align: "right" }
  );
  doc.setFont("helvetica", "normal");

  const firstLineRow = 18;
  const itemColumnMaxWidth = TABLE.descWidth - 4;
  lines.forEach((line, index) => {
    const rowNumber = firstLineRow + index;

    drawTableRowBorder(doc, rowNumber);
    drawCellText(
      doc,
      truncateTextToWidth(doc, rowValue(line, "item"), itemColumnMaxWidth),
      TABLE.left + 2,
      yForExcelRow(rowNumber)
    );
    drawCellText(
      doc,
      rowValue(line, "qty"),
      TABLE.left + TABLE.descWidth + TABLE.qtyWidth - 2,
      yForExcelRow(rowNumber),
      { align: "right" }
    );
    drawCellText(
      doc,
      formatMoney(rowValue(line, "unit_price")),
      TABLE.left + TABLE.descWidth + TABLE.qtyWidth + TABLE.unitWidth - 2,
      yForExcelRow(rowNumber),
      { align: "right" }
    );
    drawCellText(
      doc,
      formatMoney(rowValue(line, "linetotal")),
      TABLE.left +
        TABLE.descWidth +
        TABLE.qtyWidth +
        TABLE.unitWidth +
        TABLE.amountWidth -
        2,
      yForExcelRow(rowNumber),
      { align: "right" }
    );
  });

  const lastLineRow =
    lines.length > 0 ? firstLineRow + lines.length - 1 : firstLineRow;
  const subtotalRow = lastLineRow + 1;
  const vatRow = subtotalRow + 1;
  const totalRow = vatRow + 1;

  const amountColumnRight =
    TABLE.left +
    TABLE.descWidth +
    TABLE.qtyWidth +
    TABLE.unitWidth +
    TABLE.amountWidth -
    2;

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Subtotal", COL.E, yForExcelRow(subtotalRow));
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    formatMoney(subtotal),
    amountColumnRight,
    yForExcelRow(subtotalRow),
    { align: "right" }
  );

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "VAT", COL.E, yForExcelRow(vatRow));
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    formatMoney(vatAmount),
    amountColumnRight,
    yForExcelRow(vatRow),
    { align: "right" }
  );

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Total with VAT", COL.E, yForExcelRow(totalRow));
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    formatMoney(totalWithVat),
    amountColumnRight,
    yForExcelRow(totalRow),
    { align: "right" }
  );

  doc.save(`tax-invoice-${invoiceNumber}.pdf`);
}

export { normalizeHeaderRow, normalizeLinesRows };
