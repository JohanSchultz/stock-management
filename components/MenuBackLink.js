import Link from "next/link";

export function MenuBackLink() {
  return (
    <Link
      href="/app-menu"
      className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <span aria-hidden="true">←</span>
      Menu
    </Link>
  );
}
