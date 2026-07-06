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

const deleteEmail = process.argv[2];
const createEmail = process.argv[3];
const password = process.argv[4];

if (!deleteEmail || !createEmail || !password) {
  console.error(
    "Usage: node scripts/replace-auth-user.mjs <delete-email> <create-email> <password>"
  );
  process.exit(1);
}

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

function adminClient() {
  if (!serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserByEmail(supabase, email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
}

async function deleteUser(email) {
  const supabase = adminClient();
  if (!supabase) {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY not set; cannot delete via API. Run this SQL in Supabase SQL Editor:"
    );
    console.warn(`DELETE FROM auth.users WHERE email = '${email}';`);
    return { deleted: false, reason: "missing_service_role_key" };
  }

  const user = await findUserByEmail(supabase, email);
  if (!user) {
    console.log(`No user found to delete: ${email}`);
    return { deleted: false, reason: "not_found" };
  }

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) throw error;

  console.log(`Deleted user: ${email} (${user.id})`);
  return { deleted: true, id: user.id };
}

async function createUser(email) {
  const supabaseAdmin = adminClient();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (!error) return { method: "admin.createUser", user: data.user };

    if (!/already|exists|registered/i.test(error.message)) {
      throw error;
    }

    const existing = await findUserByEmail(supabaseAdmin, email);
    if (!existing) throw error;

    const { data: updateData, error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
    if (updateError) throw updateError;
    return { method: "admin.updateUserById", user: updateData.user };
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { method: "signUp", user: data.user };
}

async function verifySignIn(email) {
  const supabase = createClient(url, anonKey);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error };
  return { ok: true };
}

try {
  await deleteUser(deleteEmail);

  const created = await createUser(createEmail);
  console.log(`User created via ${created.method}.`);
  console.log("User id:", created.user?.id);
  console.log("Email:", created.user?.email);
  console.log("Email confirmed:", created.user?.email_confirmed_at ?? "(pending)");

  const signIn = await verifySignIn(createEmail);
  if (signIn.error) {
    console.error("Sign-in verification failed:", signIn.error.message);
    console.error(
      "Add SUPABASE_SERVICE_ROLE_KEY to .env.local and rerun, or confirm the user in Supabase SQL Editor."
    );
    process.exit(1);
  }

  console.log("Sign-in verification succeeded.");
} catch (err) {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
}
