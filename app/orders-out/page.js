import { AppShell } from "@/components/AppShell";
import { BookingOutForm } from "@/app/booking-out/BookingOutForm";

export default function OrdersOutPage() {
  return (
    <AppShell title="Orders Out">
      <BookingOutForm />
    </AppShell>
  );
}
