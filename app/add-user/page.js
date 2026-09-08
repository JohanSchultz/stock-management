import { AppShell } from "@/components/AppShell";
import { AddUserForm } from "./AddUserForm";

export default function AddUserPage() {
  return (
    <AppShell title="Users">
      <AddUserForm />
    </AppShell>
  );
}
