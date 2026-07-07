import { AppShell } from "@/components/AppShell";
import { StockItemForm } from "./StockItemForm";

export default function StockItemsPage() {
  return (
    <AppShell title="Stock Items">
      <StockItemForm />
    </AppShell>
  );
}
