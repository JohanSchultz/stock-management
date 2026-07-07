import { AppShell } from "@/components/AppShell";
import { SupplierForm } from "./SupplierForm";

export default function SuppliersPage() {
  return (
    <AppShell title="Suppliers">
      <SupplierForm />
    </AppShell>
  );
}
