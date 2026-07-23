"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { menuTree } from "@/lib/menu/menuTree";

function TreeNode({ node, depth = 0 }) {
  const pathname = usePathname();
  const hasChildren = node.children?.length > 0;
  const [expanded, setExpanded] = useState(true);

  if (!hasChildren) {
    if (!node.href) {
      return (
        <li>
          <span
            className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm ${
              depth === 0
                ? "font-medium text-zinc-800 dark:text-zinc-200"
                : "text-zinc-700 dark:text-zinc-300"
            }`}
            style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
          >
            {depth > 0 ? (
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
            ) : null}
            {node.label}
          </span>
        </li>
      );
    }

    const isActive = node.href === pathname;

    return (
      <li>
        <Link
          href={node.href}
          className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            isActive
              ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-700 dark:text-zinc-300"
          }`}
          style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        >
          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
          {node.label}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        <span
          className={`mr-2 inline-block text-xs text-zinc-500 transition-transform dark:text-zinc-400 ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        {node.label}
      </button>
      {expanded && (
        <ul className="mt-0.5">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MenuTree({ tree = menuTree }) {
  return (
    <nav aria-label="Application menu">
      <ul className="flex flex-col gap-0.5">
        {tree.map((node) => (
          <TreeNode key={node.id} node={node} />
        ))}
      </ul>
    </nav>
  );
}
