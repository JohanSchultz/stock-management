import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";

function normalizeSingleRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === "object") return data;
  return null;
}

/** Value shown in the report grid "Debit Note Number" column. */
export function getDbnNumberFromReportRow(row) {
  if (!row || typeof row !== "object") return "";
  const value =
    row.dbn_number ??
    row.dbnNumber ??
    row.debit_note_number ??
    row.debitNoteNumber ??
    row.invoice_number ??
    row.invoiceNumber;
  if (value == null || value === "") return "";
  return String(value);
}

export function getDbnNumberFromHeaderData(data) {
  const row = normalizeSingleRpcRow(data);
  if (!row || typeof row !== "object") return "";
  const value =
    row.dbn_number ??
    row.dbnNumber ??
    row.debit_note_number ??
    row.debitNoteNumber ??
    row.invoice_number ??
    row.invoiceNumber;
  if (value == null || value === "") return "";
  return String(value);
}

function normalizeDbnHeaderForInvoicePdf(headerData) {
  const row = normalizeSingleRpcRow(headerData);
  if (!row || typeof row !== "object") return headerData;
  return {
    ...row,
    invoice_number:
      row.invoice_number ?? row.dbn_number ?? row.dbnNumber ?? "",
  };
}

export async function printDebitNoteByNumber(dbnNumber) {
  const normalizedDbnNumber = String(dbnNumber ?? "").trim();
  if (!normalizedDbnNumber) {
    throw new Error("Debit note number is missing.");
  }

  const supabase = await prepareSupabaseClient();
  if (!supabase) return;

  const [headerResult, linesResult] = await Promise.all([
    supabase.rpc("pr_dbn_in_header_by_invno", {
      p_dbn_number: normalizedDbnNumber,
    }),
    supabase.rpc("pr_dbn_in_lines_by_invno", {
      p_dbn_number: normalizedDbnNumber,
    }),
  ]);

  if (headerResult.error) throw headerResult.error;
  if (linesResult.error) throw linesResult.error;

  const { generateSampleInvoicePdf } = await import(
    "@/lib/invoices/generateSampleInvoicePdf"
  );
  await generateSampleInvoicePdf(
    normalizeDbnHeaderForInvoicePdf(headerResult.data),
    linesResult.data,
    normalizedDbnNumber,
    {
      documentTitle: "Debit Note",
      documentNumberLabel: "DBN No",
      contentRowOffset: 2,
      centerDocumentTitle: true,
      showSupplierOnBillTo: true,
    }
  );
}
