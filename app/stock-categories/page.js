import { AppShell } from "@/components/AppShell";
import { StockCategoryForm } from "./StockCategoryForm";

export default function StockCategoriesPage() {
  return (
    <AppShell title="Stock Categories">
      <StockCategoryForm />
    </AppShell>
  );
}
