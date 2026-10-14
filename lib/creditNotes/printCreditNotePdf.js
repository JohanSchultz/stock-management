import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";

function normalizeSingleRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === "object") return data;
  return null;
}

export function getCrnNumberFromHeaderData(data) {
  const row = normalizeSingleRpcRow(data);
  if (!row || typeof row !== "object") return "";
  const value = row.crn_number ?? row.crnNumber;
  if (value == null || value === "") return "";
  return String(value);
}

/** Value shown in the report grid "Credit Note Number" column. */
export function getCrnNumberFromReportRow(row) {
  if (!row || typeof row !== "object") return "";
  const value =
    row.crn_number ??
    row.crnNumber ??
    row.credit_note_number ??
    row.creditNoteNumber;
  if (value == null || value === "") return "";
  return String(value);
}

function normalizeCrnHeaderForInvoicePdf(headerData) {
  const row = normalizeSingleRpcRow(headerData);
  if (!row || typeof row !== "object") return headerData;
  return {
    ...row,
    invoice_number:
      row.invoice_number ?? row.crn_number ?? row.crnNumber ?? "",
  };
}

export async function printCreditNoteByNumber(crnNumber) {
  const normalizedCrnNumber = String(crnNumber ?? "").trim();
  if (!normalizedCrnNumber) {
    throw new Error("Credit note number is missing.");
  }

  const supabase = await prepareSupabaseClient();
  if (!supabase) return;

  const [headerResult, linesResult] = await Promise.all([
    supabase.rpc("pr_crn_out_header_by_invno", {
      p_crn_number: normalizedCrnNumber,
    }),
    supabase.rpc("pr_crn_out_lines_by_invno", {
      p_crn_number: normalizedCrnNumber,
    }),
  ]);

  if (headerResult.error) throw headerResult.error;
  if (linesResult.error) throw linesResult.error;

  const { generateSampleInvoicePdf } = await import(
    "@/lib/invoices/generateSampleInvoicePdf"
  );
  await generateSampleInvoicePdf(
    normalizeCrnHeaderForInvoicePdf(headerResult.data),
    linesResult.data,
    normalizedCrnNumber,
    {
      documentTitle: "Credit Note",
      documentNumberLabel: "CRN No",
      contentRowOffset: 2,
      centerDocumentTitle: true,
      showSupplierOnBillTo: true,
    }
  );
}
