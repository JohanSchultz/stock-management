export function isFetchFailure(error) {
  const message = error?.message ?? String(error ?? "");
  return (
    message === "Failed to fetch" ||
    message.includes("NetworkError") ||
    error?.name === "TypeError"
  );
}

export async function refreshSupabaseSession(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getSessionUser(supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export function sessionUserLabel(user) {
  return (
    user?.email ??
    user?.user_metadata?.username ??
    user?.user_metadata?.user_name ??
    ""
  );
}

export function redirectToLogin() {
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}
