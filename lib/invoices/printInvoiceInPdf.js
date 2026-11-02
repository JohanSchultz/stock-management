import { prepareSupabaseClient } from "@/lib/supabase/useSupabaseIdleRecovery";

export async function printInvoiceInByNumber(invoiceNumberParam) {
  const normalizedInvoiceNumber = String(invoiceNumberParam ?? "").trim();
  if (!normalizedInvoiceNumber) {
    throw new Error(
      "Enter or create an invoice to get an invoice number before printing."
    );
  }

  const supabase = await prepareSupabaseClient();
  if (!supabase) return;

  const [headerResult, linesResult] = await Promise.all([
    supabase.rpc("pr_invoice_in_header_by_invno", {
      p_invoice_number: normalizedInvoiceNumber,
    }),
    supabase.rpc("pr_invoice_in_lines_by_invno", {
      p_invoice_number: normalizedInvoiceNumber,
    }),
  ]);

  if (headerResult.error) throw headerResult.error;
  if (linesResult.error) throw linesResult.error;

  const { generateSampleInvoicePdf } = await import(
    "./generateSampleInvoicePdf"
  );
  await generateSampleInvoicePdf(
    headerResult.data,
    linesResult.data,
    normalizedInvoiceNumber
  );
}
