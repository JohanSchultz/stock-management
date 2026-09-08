import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { ChartOfAccountsForm } from "./ChartOfAccountsForm";

export default async function ChartOfAccountsPage() {
  const supabase = await createClient();
  const [{ data: accountTypes, error: accountTypesError }, { data: accounts, error: accountsError }] =
    await Promise.all([
      supabase.rpc("pr_account_types"),
      supabase.rpc("pr_chart_of_accounts"),
    ]);

  return (
    <AppShell title="Chart of Accounts">
      <ChartOfAccountsForm
        initialAccountTypes={accountTypes}
        initialAccounts={accounts}
        initialLoadError={
          accountTypesError?.message ?? accountsError?.message ?? ""
        }
      />
    </AppShell>
  );
}
