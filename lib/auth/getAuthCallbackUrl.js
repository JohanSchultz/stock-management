const AUTH_CALLBACK_PATH = "/auth/callback";

export function getAuthCallbackUrl(next = "/reset-password") {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

  const url = new URL(AUTH_CALLBACK_PATH, origin);
  url.searchParams.set("next", next);
  return url.toString();
}
