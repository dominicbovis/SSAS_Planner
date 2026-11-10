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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderEmailHtml(paragraphs: string[], ctaLabel: string, ctaUrl: string): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(p)}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:32px 16px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
<p style="margin:0 0 24px;font-size:16px;font-weight:700;color:#111827;">Red Horizons SSAS Planner</p>
${body}
<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;margin:8px 0 24px;padding:12px 20px;border-radius:8px;background:#dc2626;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
<p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">If the button does not work, copy this link into your browser:<br>${escapeHtml(ctaUrl)}</p>
</div>
</body></html>`;
}

async function sendEmail(to: string, subject: string, paragraphs: string[], ctaLabel: string, ctaUrl: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Red Horizons SSAS Planner <noreply@redhorizons.co.uk>",
      to: [to],
      subject,
      html: renderEmailHtml(paragraphs, ctaLabel, ctaUrl),
      text: [...paragraphs, `${ctaLabel}: ${ctaUrl}`].join("\n\n"),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend rejected the email (${res.status}): ${await res.text()}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isValidEmail(email)) return json({ error: "Please enter a valid email address" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_active")
      .eq("email", email)
      .maybeSingle();
    if (profileError) {
      console.error(profileError);
      return json({ error: "We could not send the reset email right now. Please try again shortly." }, 500);
    }

    if (profile?.is_active) {
      const { data, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: safeRedirect(body?.redirectTo) },
      });
      const actionLink = data?.properties?.action_link;
      if (linkError || !actionLink) {
        console.error(linkError);
        return json({ error: "We could not send the reset email right now. Please try again shortly." }, 500);
      }

      try {
        await sendEmail(
          email,
          "Reset your Red Horizons SSAS Planner password",
          [
            "We received a request to reset the password for your account.",
            "Use the button below to choose a new password. The link can only be used once. If you did not ask for this, you can ignore this email.",
          ],
          "Choose a new password",
          actionLink,
        );
      } catch (sendError) {
        console.error(sendError);
        return json({ error: "The reset email service is unavailable right now. Please contact your administrator." }, 503);
      }
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
