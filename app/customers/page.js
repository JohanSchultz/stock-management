import { AppShell } from "@/components/AppShell";
import { CustomerForm } from "./CustomerForm";

export default function CustomersPage() {
  return (
    <AppShell title="Customers">
      <CustomerForm />
    </AppShell>
  );
}
