import { AppShell } from "@/components/AppShell";
import { ClosedOrders } from "./ClosedOrders";

export default function ClosedOrdersPage() {
  return (
    <AppShell title="Closed Orders">
      <ClosedOrders />
    </AppShell>
  );
}
