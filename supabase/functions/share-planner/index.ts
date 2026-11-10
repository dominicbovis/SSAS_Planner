import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSignedInUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === "string" ? user.id : null;
}

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const callerId = await getSignedInUserId(req);
    if (!callerId) return json({ error: "Please sign in again" }, 401);

    const body = await req.json().catch(() => null);
    const schemeId = typeof body?.schemeId === "string" ? body.schemeId : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!schemeId) return json({ error: "Missing planner" }, 400);
    if (!isValidEmail(email)) return json({ error: "Please enter a valid email address" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: planner, error: plannerError } = await admin
      .from("ssas_schemes")
      .select("id, owner_id")
      .eq("id", schemeId)
      .maybeSingle();
    if (plannerError) {
      console.error(plannerError);
      return json({ error: "Could not load this planner" }, 500);
    }
    if (!planner || planner.owner_id !== callerId) {
      return json({ error: "Only the owner can share this planner" }, 403);
    }

    let targetId: string;
    const { data: existing, error: existingError } = await admin
      .from("profiles")
      .select("user_id, is_active")
      .eq("email", email)
      .maybeSingle();
    if (existingError) {
      console.error(existingError);
      return json({ error: "Could not look up that address" }, 500);
    }

    if (existing) {
      if (!existing.is_active) return json({ error: "That account has been deactivated" }, 400);
      targetId = existing.user_id;
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: safeRedirect(body?.redirectTo),
      });
      if (inviteError || !invited?.user) {
        console.error(inviteError);
        return json({ error: "Could not send an invitation to that address" }, 400);
      }
      targetId = invited.user.id;
      const { error: profileError } = await admin.from("profiles").insert({
        user_id: targetId,
        email,
        is_admin: false,
        is_active: true,
        must_set_password: true,
      });
      if (profileError) {
        console.error(profileError);
        return json({ error: "The invitation was sent but the account could not be set up" }, 500);
      }
    }

    if (targetId === callerId) {
      return json({ error: "This is your own account" }, 400);
    }

    const { error: shareError } = await admin.from("planner_shares").upsert(
      { scheme_id: schemeId, user_id: targetId, shared_by: callerId, email },
      { onConflict: "scheme_id,user_id", ignoreDuplicates: true },
    );
    if (shareError) {
      console.error(shareError);
      return json({ error: "Could not share this planner" }, 500);
    }

    return json({ ok: true, email });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
