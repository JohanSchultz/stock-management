"use client";

import { createClient } from "@/lib/supabase/client";
import {
  isFetchFailure,
  redirectToLogin,
  refreshSupabaseSession,
} from "@/lib/supabase/browserSession";
import { useEffect } from "react";

export function useSupabaseIdleRecovery() {
  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        redirectToLogin();
      }
    });

    async function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      try {
        const session = await refreshSupabaseSession(supabase);
        if (!session) {
          redirectToLogin();
        }
      } catch (error) {
        if (!isFetchFailure(error)) {
          console.error("Session refresh failed after idle:", error);
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}

export async function prepareSupabaseClient() {
  const supabase = createClient();

  try {
    const session = await refreshSupabaseSession(supabase);
    if (!session) {
      redirectToLogin();
      return null;
    }
    return supabase;
  } catch (error) {
    if (isFetchFailure(error)) {
      return supabase;
    }
    throw error;
  }
}
