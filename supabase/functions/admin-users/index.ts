import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BAN_DURATION = "876000h";

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: caller } = await admin
      .from("profiles")
      .select("is_admin, is_active")
      .eq("user_id", callerId)
      .maybeSingle();
    if (!caller?.is_admin || !caller.is_active) {
      return json({ error: "Only administrators can manage users" }, 403);
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;

    if (action === "list") {
      const [{ data: profiles, error: profilesError }, { data: planners, error: plannersError }, { data: authData, error: authError }] =
        await Promise.all([
          admin.from("profiles").select("user_id, email, is_admin, is_active, must_set_password, created_at").order("created_at"),
          admin.from("ssas_schemes").select("name, owner_id"),
          admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);
      if (profilesError || plannersError || authError) {
        console.error(profilesError ?? plannersError ?? authError);
        return json({ error: "Could not load users" }, 500);
      }

      const lastSignIn = new Map<string, string | null>();
      for (const u of authData.users) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
      const plannerName = new Map<string, string>();
      for (const p of planners ?? []) {
        if (p.owner_id) plannerName.set(p.owner_id, p.name);
      }

      return json({
        users: (profiles ?? []).map((p) => ({
          userId: p.user_id,
          email: p.email,
          isAdmin: p.is_admin,
          isActive: p.is_active,
          mustSetPassword: p.must_set_password,
          createdAt: p.created_at,
          lastSignInAt: lastSignIn.get(p.user_id) ?? null,
          plannerName: plannerName.get(p.user_id) ?? null,
        })),
      });
    }

    if (action === "invite") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const plannerName = typeof body.plannerName === "string" ? body.plannerName.trim() : "";
      const isAdmin = body.isAdmin === true;
      if (!isValidEmail(email)) return json({ error: "Please enter a valid email address" }, 400);
      if (plannerName.length === 0 || plannerName.length > 120) {
        return json({ error: "Please give the planner a name (up to 120 characters)" }, 400);
      }

      const { data: existing } = await admin.from("profiles").select("user_id").eq("email", email).maybeSingle();
      if (existing) return json({ error: "This person already has an account" }, 409);

      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: safeRedirect(body.redirectTo),
      });
      if (inviteError || !invited?.user) {
        console.error(inviteError);
        return json({ error: "Could not send the invitation. Please check the address and try again." }, 400);
      }

      const newUserId = invited.user.id;
      const { error: profileError } = await admin.from("profiles").insert({
        user_id: newUserId,
        email,
        is_admin: isAdmin,
        is_active: true,
        must_set_password: true,
      });
      if (profileError) {
        console.error(profileError);
        return json({ error: "The invitation was sent but the account could not be set up" }, 500);
      }

      const { error: plannerError } = await admin.from("ssas_schemes").insert({
        name: plannerName,
        owner_id: newUserId,
      });
      if (plannerError) {
        console.error(plannerError);
        return json({ error: "The account was created but its planner could not be set up" }, 500);
      }

      return json({ ok: true, email });
    }

    if (action === "set-active") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      const active = body.active === true;
      if (!userId) return json({ error: "Missing user" }, 400);
      if (userId === callerId && !active) {
        return json({ error: "You cannot deactivate your own account" }, 400);
      }

      const { error: updateError } = await admin.from("profiles").update({ is_active: active }).eq("user_id", userId);
      if (updateError) {
        console.error(updateError);
        return json({ error: "Could not update this account" }, 500);
      }

      const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? "none" : BAN_DURATION,
      });
      if (banError) {
        console.error(banError);
        return json({ error: "Could not update this account's sign-in access" }, 500);
      }

      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
