import { AppShell } from "@/components/AppShell";
import { BookingInForm } from "@/app/booking-in/BookingInForm";

export default function OrdersInPage() {
  return (
    <AppShell title="Orders In">
      <BookingInForm variant="orders-in" />
    </AppShell>
  );
}
