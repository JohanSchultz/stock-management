import { MenuDynamicContent } from "./MenuDynamicContent";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function MenuDynamicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Stock Management
        </h1>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="p-6">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Menu Dynamic
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {user?.email ?? "unknown"}
          </p>
          <MenuDynamicContent />
        </div>
      </main>
    </div>
  );
}
