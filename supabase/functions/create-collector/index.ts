// Creates a collector account. Only signed-in admins can call this.
// It creates the Supabase Auth user (email and password) and links it to a collector record.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function serviceHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Identify the caller from their access token.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in as an admin." }, 401);

  const whoRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!whoRes.ok) return json({ error: "Your session has ended. Please sign in again." }, 401);
  const caller = await whoRes.json();

  // 2. Check the caller is an admin.
  const adminRes = await fetch(
    `${SUPABASE_URL}/rest/v1/admins?select=user_id&user_id=eq.${caller.id}`,
    { headers: serviceHeaders() },
  );
  const admins = adminRes.ok ? await adminRes.json() : [];
  if (!admins.length) return json({ error: "Only admins can add collectors." }, 403);

  // 3. Validate the input.
  const input = await req.json().catch(() => ({}));
  const collectorId = String(input.id || "").trim().toUpperCase();
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");

  if (!/^COL-\d{3,6}$/.test(collectorId)) return json({ error: "Collector ID must look like COL-1234." }, 400);
  if (name.length < 2 || name.length > 100) return json({ error: "Enter the collector's full name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (password.length < 8) return json({ error: "The temporary password must be at least 8 characters." }, 400);

  // 4. Create the sign-in account. The email is confirmed so the collector can sign in straight away.
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!createRes.ok) {
    const detail = await createRes.text();
    const exists = /already|registered|exists/i.test(detail);
    return json(
      { error: exists ? "An account with this email already exists." : "Could not create the account." },
      exists ? 409 : 400,
    );
  }
  const user = await createRes.json();

  // 5. Link the account to a new collector record.
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/collectors`, {
    method: "POST",
    headers: { ...serviceHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({ id: collectorId, name, email, user_id: user.id, active: true }),
  });
  if (!insertRes.ok) {
    // Roll back the account so no orphan login is left behind.
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: serviceHeaders(),
    });
    const duplicate = insertRes.status === 409 || insertRes.status === 23505;
    return json(
      { error: duplicate ? "That collector ID is already in use." : "Could not save the collector record." },
      duplicate ? 409 : 500,
    );
  }

  return json({ ok: true, id: collectorId, name, email });
});
