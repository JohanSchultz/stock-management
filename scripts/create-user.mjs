import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const env = {};
  for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/create-user.mjs <email> <password>");
  process.exit(1);
}

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

async function trySignUp() {
  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { method: "signUp", error };
  return { method: "signUp", user: data.user, session: data.session };
}

async function tryAdminCreate() {
  if (!serviceKey) {
    return {
      method: "admin.createUser",
      error: new Error("SUPABASE_SERVICE_ROLE_KEY not set in .env.local"),
    };
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) return { method: "admin.createUser", user: data.user };

  if (!/already|exists|registered/i.test(error.message)) {
    return { method: "admin.createUser", error };
  }

  const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) return { method: "admin.listUsers", error: listError };

  const existing = listData.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );
  if (!existing) return { method: "admin.createUser", error };

  const { data: updateData, error: updateError } =
    await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
  if (updateError) return { method: "admin.updateUserById", error: updateError };
  return { method: "admin.updateUserById", user: updateData.user };
}

async function verifySignIn() {
  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error };
  return { user: data.user, session: !!data.session };
}

let result = await tryAdminCreate();
if (result.error?.message?.includes("SUPABASE_SERVICE_ROLE_KEY")) {
  result = await trySignUp();
}

if (result.error) {
  console.error(`Failed via ${result.method}:`, result.error.message);
  process.exit(1);
}

console.log(`User created via ${result.method}.`);
console.log("User id:", result.user?.id);
console.log("Email:", result.user?.email);
console.log("Email confirmed:", result.user?.email_confirmed_at ?? "(pending)");

const signIn = await verifySignIn();
if (signIn.error) {
  console.error("Sign-in verification failed:", signIn.error.message);
  console.error(
    "If email confirmation is required, add SUPABASE_SERVICE_ROLE_KEY to .env.local and rerun, or confirm the user in the Supabase dashboard."
  );
  process.exit(1);
}

console.log("Sign-in verification succeeded. The user can use the Sign in page.");
