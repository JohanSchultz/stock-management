const SAMPLE_ROW_HEIGHT_MM = 6;
const PAGE_TOP_MM = 15;
const PAGE_WIDTH_MM = 210;
const PAGE_HORIZONTAL_MARGIN_MM = 15;
const COMMENTS_MIN_HEIGHT_MM = 18;
const COMMENTS_SECTION_GAP_MM = 4;
const COMMENTS_INNER_PADDING_MM = 3;

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

  if (align === "right" || align === "center") {
    doc.text(content, x, y, { align, maxWidth });
    return;
  }

  doc.text(content, x, y, maxWidth ? { maxWidth } : undefined);
}

function drawCommentsSection(doc, header, topY) {
  const comments = String(rowValue(header, "comments") ?? "").trim();
  if (!comments) {
    return topY;
  }

  const areaWidth = PAGE_WIDTH_MM - 2 * PAGE_HORIZONTAL_MARGIN_MM;
  const textWidth = areaWidth - 2 * COMMENTS_INNER_PADDING_MM;
  const commentsLabelGapMm = 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  drawCellText(doc, "Comments", PAGE_HORIZONTAL_MARGIN_MM, topY);

  const boxTopY = topY + commentsLabelGapMm;

  doc.setFont("helvetica", "normal");
  const wrappedLines = doc.splitTextToSize(comments, textWidth);
  const lineHeightMm = 5;
  const textBlockHeight = wrappedLines.length * lineHeightMm;
  const boxHeight = Math.max(
    COMMENTS_MIN_HEIGHT_MM,
    textBlockHeight + 2 * COMMENTS_INNER_PADDING_MM
  );

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(PAGE_HORIZONTAL_MARGIN_MM, boxTopY, areaWidth, boxHeight);

  doc.text(
    wrappedLines,
    PAGE_HORIZONTAL_MARGIN_MM + COMMENTS_INNER_PADDING_MM,
    boxTopY + COMMENTS_INNER_PADDING_MM + 3.5
  );

  return boxTopY + boxHeight + COMMENTS_SECTION_GAP_MM;
}

const DESC_LINE_HEIGHT_MM = 5;
const DESC_CELL_TEXT_TOP_OFFSET_MM = 4;

function drawTableRowBorderAt(doc, topY, heightMm, { header = false } = {}) {
  const right =
    TABLE.left +
    TABLE.descWidth +
    TABLE.qtyWidth +
    TABLE.unitWidth +
    TABLE.amountWidth;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(header ? 0.35 : 0.25);
  doc.rect(TABLE.left, topY, right - TABLE.left, heightMm);
  doc.line(
    TABLE.left + TABLE.descWidth,
    topY,
    TABLE.left + TABLE.descWidth,
    topY + heightMm
  );
  doc.line(
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth,
    topY,
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth,
    topY + heightMm
  );
  doc.line(
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth + TABLE.unitWidth,
    topY,
    TABLE.left + TABLE.descWidth + TABLE.qtyWidth + TABLE.unitWidth,
    topY + heightMm
  );
}

function layoutDescriptionCell(doc, itemText, maxWidthMm) {
  const wrapped = doc.splitTextToSize(String(itemText ?? ""), maxWidthMm);
  const lineCount = Math.max(1, wrapped.length);
  const textBlockHeight =
    lineCount === 1
      ? DESC_LINE_HEIGHT_MM
      : DESC_CELL_TEXT_TOP_OFFSET_MM + (lineCount - 1) * DESC_LINE_HEIGHT_MM;
  const height = Math.max(
    SAMPLE_ROW_HEIGHT_MM,
    textBlockHeight + DESC_CELL_TEXT_TOP_OFFSET_MM
  );
  return { wrapped, height };
}

export async function generateSampleInvoicePdf(
  headerData,
  linesData,
  documentNumber = "11092026_1",
  options = {}
) {
  const {
    documentTitle = "Tax Invoice",
    documentNumberLabel = "Invoice No",
    contentRowOffset = 0,
    centerDocumentTitle = false,
    showSupplierOnBillTo = false,
  } = options;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const header = normalizeHeaderRow(headerData);
  const lines = normalizeLinesRows(linesData);
  const vatPerc = parseAmount(rowValue(header, "vat_perc"));
  const subtotal = sumLineTotals(lines);
  const vatAmount = (vatPerc * subtotal) / 100;
  const totalWithVat = (1 + vatPerc / 100) * subtotal;

  const billToRow = 10 + contentRowOffset;
  const documentNumberRow = billToRow;
  const dateRow = billToRow + 1;
  const tableHeaderRow = 17 + contentRowOffset;
  const billToAddressStartRow = billToRow + (showSupplierOnBillTo ? 1 : 0);

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
    drawCellText(
      doc,
      rowValue(header, field),
      COL.A,
      yForExcelRow(1 + index + contentRowOffset)
    );
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const titleY = yForExcelRow(1);
  if (centerDocumentTitle) {
    drawCellText(doc, documentTitle, PAGE_WIDTH_MM / 2, titleY, {
      align: "center",
    });
  } else {
    drawCellText(doc, documentTitle, COL.F, titleY, { align: "right" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Bill To:", COL.A, yForExcelRow(billToRow));
  doc.setFont("helvetica", "normal");

  if (showSupplierOnBillTo) {
    drawCellText(
      doc,
      rowValue(header, "supplier"),
      COL.B,
      yForExcelRow(billToRow)
    );
  }

  const billFields = [
    "customer",
    "address1",
    "address2",
    "address3",
    "postalcode",
    "vatregno",
  ];
  billFields.forEach((field, index) => {
    drawCellText(
      doc,
      rowValue(header, field),
      COL.B,
      yForExcelRow(billToAddressStartRow + index)
    );
  });

  const invoiceMetaLabelX = COL.D + TABLE.qtyWidth;

  doc.setFont("helvetica", "bold");
  drawCellText(
    doc,
    documentNumberLabel,
    invoiceMetaLabelX,
    yForExcelRow(documentNumberRow)
  );
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    rowValue(header, "invoice_number"),
    COL.F,
    yForExcelRow(documentNumberRow),
    { align: "right" }
  );

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Date", invoiceMetaLabelX, yForExcelRow(dateRow));
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    formatInvoiceDate(rowValue(header, "created_at")),
    COL.F,
    yForExcelRow(dateRow),
    { align: "right" }
  );

  const tableHeaderTopY = yForExcelRow(tableHeaderRow) - 4.5;
  drawTableRowBorderAt(doc, tableHeaderTopY, SAMPLE_ROW_HEIGHT_MM, {
    header: true,
  });
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

  const itemColumnMaxWidth = TABLE.descWidth - 4;
  let nextLineRowTopY = tableHeaderTopY + SAMPLE_ROW_HEIGHT_MM;

  lines.forEach((line) => {
    const { wrapped, height: rowHeight } = layoutDescriptionCell(
      doc,
      rowValue(line, "item"),
      itemColumnMaxWidth
    );

    drawTableRowBorderAt(doc, nextLineRowTopY, rowHeight);
    doc.text(
      wrapped,
      TABLE.left + 2,
      nextLineRowTopY + DESC_CELL_TEXT_TOP_OFFSET_MM + 3.5,
      { maxWidth: itemColumnMaxWidth }
    );

    const numericBaselineY = nextLineRowTopY + rowHeight / 2 + 1.5;
    drawCellText(
      doc,
      rowValue(line, "qty"),
      TABLE.left + TABLE.descWidth + TABLE.qtyWidth - 2,
      numericBaselineY,
      { align: "right" }
    );
    drawCellText(
      doc,
      formatMoney(rowValue(line, "unit_price")),
      TABLE.left + TABLE.descWidth + TABLE.qtyWidth + TABLE.unitWidth - 2,
      numericBaselineY,
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
      numericBaselineY,
      { align: "right" }
    );

    nextLineRowTopY += rowHeight;
  });

  const afterLinesY =
    (lines.length > 0
      ? nextLineRowTopY
      : tableHeaderTopY + SAMPLE_ROW_HEIGHT_MM) + COMMENTS_SECTION_GAP_MM;
  const afterCommentsY = drawCommentsSection(doc, header, afterLinesY);

  const summaryLineStepMm = SAMPLE_ROW_HEIGHT_MM;
  const subtotalY = afterCommentsY + 4;
  const vatY = subtotalY + summaryLineStepMm;
  const totalY = vatY + summaryLineStepMm;

  const amountColumnRight =
    TABLE.left +
    TABLE.descWidth +
    TABLE.qtyWidth +
    TABLE.unitWidth +
    TABLE.amountWidth -
    2;

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Subtotal", COL.E, subtotalY);
  doc.setFont("helvetica", "normal");
  drawCellText(doc, formatMoney(subtotal), amountColumnRight, subtotalY, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "VAT", COL.E, vatY);
  doc.setFont("helvetica", "normal");
  drawCellText(doc, formatMoney(vatAmount), amountColumnRight, vatY, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  drawCellText(doc, "Total with VAT", COL.E, totalY);
  doc.setFont("helvetica", "normal");
  drawCellText(
    doc,
    formatMoney(totalWithVat),
    amountColumnRight,
    totalY,
    { align: "right" }
  );

  const filePrefix =
    documentTitle === "Credit Note" ? "credit-note" : "tax-invoice";
  doc.save(`${filePrefix}-${documentNumber}.pdf`);
}

export { normalizeHeaderRow, normalizeLinesRows };
