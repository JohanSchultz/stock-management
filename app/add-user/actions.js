"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CONFIG_ERROR =
  "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase Dashboard → Project Settings → API → service_role secret), then restart the dev server.";

async function createUserWithAdmin(email, password) {
  const admin = createAdminClient();
  return admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
}

async function createUserWithSignUp(email, password) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      data: { user: null },
      error: { message: CONFIG_ERROR },
    };
  }

  const client = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return client.auth.signUp({ email, password });
}

export async function createAuthUser(userName, password) {
  const email = String(userName ?? "").trim();
  const userPassword = String(password ?? "");
  if (!email) {
    return { error: "User name is required." };
  }
  if (!userPassword) {
    return { error: "Password is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to add a user." };
  }

  try {
    let result;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      result = await createUserWithAdmin(email, userPassword);
    } else {
      result = await createUserWithSignUp(email, userPassword);
    }

    if (result.error) {
      return { error: result.error.message };
    }

    if (!result.data.user) {
      return {
        error:
          "User could not be created. If email confirmation is required, add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server.",
      };
    }

    return { success: true, userId: result.data.user.id };
  } catch (err) {
    return { error: err.message ?? "Failed to create user" };
  }
}
