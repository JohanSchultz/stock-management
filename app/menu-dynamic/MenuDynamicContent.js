"use client";

import { MenuTree } from "@/components/MenuTree";
import { buildMenuDynamicTree } from "@/lib/menu/menuTree";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

export function MenuDynamicContent() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "get_permissions_by_user"
      );
      if (rpcError) throw rpcError;
      setPermissions(Array.isArray(data) ? data : []);
    } catch (err) {
      setPermissions([]);
      setError(err.message ?? "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const menuTree = useMemo(
    () => buildMenuDynamicTree(permissions),
    [permissions]
  );

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {error ? (
        <p
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading menu…</p>
      ) : (
        <MenuTree tree={menuTree} />
      )}
    </div>
  );
}
