// Collector management for admins. Only signed-in admins can call this.
// Actions:
//   create  - new sign-in account and collector record
//   update  - change name, email, or password (blank password = unchanged)
//   delete  - remove a collector. Refused if they have recorded payments; deactivate instead.

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

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validId(id: string) {
  return /^COL-\d{3,6}$/.test(id);
}

// Stands in for leaked-password checks, which need a paid Supabase plan.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "11111111",
  "00000000", "qwerty123", "qwertyui", "iloveyou", "admin123", "welcome1", "welcome123",
  "letmein1", "monkey123", "dragon123", "abc12345", "abcd1234", "sierraleone", "freetown1",
  "freetown123", "council123", "collector1", "changeme1", "passw0rd",
]);

function weakPassword(pw: string) {
  const p = pw.toLowerCase();
  if (COMMON_PASSWORDS.has(p)) return true;
  if (/^(.)\1+$/.test(p)) return true;          // one character repeated
  if (/^\d+$/.test(p) && p.length < 12) return true; // digits only and short
  if (/^[a-z]+$/.test(p) && p.length < 12) return true; // letters only and short
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Identify the caller.
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
  if (!admins.length) return json({ error: "Only admins can manage collectors." }, 403);

  const input = await req.json().catch(() => ({}));
  const action = String(input.action || "create");
  const collectorId = String(input.id || "").trim().toUpperCase();

  // Find an existing collector record (used by update and delete).
  async function findCollector() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/collectors?select=id,name,email,user_id&id=eq.${encodeURIComponent(collectorId)}`,
      { headers: serviceHeaders() },
    );
    const rows = res.ok ? await res.json() : [];
    return rows[0] || null;
  }

  // ---------- create ----------
  if (action === "create") {
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");

    if (!validId(collectorId)) return json({ error: "Collector ID must look like COL-1234." }, 400);
    if (name.length < 2 || name.length > 100) return json({ error: "Enter the collector's full name." }, 400);
    if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 8) return json({ error: "The temporary password must be at least 8 characters." }, 400);
    if (weakPassword(password)) return json({ error: "That password is too common or too simple. Mix letters and numbers, or use a longer password." }, 400);

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

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/collectors`, {
      method: "POST",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ id: collectorId, name, email, user_id: user.id, active: true }),
    });
    if (!insertRes.ok) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
        headers: serviceHeaders(),
      });
      const duplicate = insertRes.status === 409;
      return json(
        { error: duplicate ? "That collector ID is already in use." : "Could not save the collector record." },
        duplicate ? 409 : 500,
      );
    }
    return json({ ok: true, id: collectorId, name, email });
  }

  // ---------- update ----------
  if (action === "update") {
    const existing = await findCollector();
    if (!existing) return json({ error: "Collector not found." }, 404);

    const name = input.name !== undefined ? String(input.name).trim() : existing.name;
    const email = input.email !== undefined ? String(input.email).trim().toLowerCase() : existing.email;
    const password = String(input.password || "");

    if (name.length < 2 || name.length > 100) return json({ error: "Enter the collector's full name." }, 400);
    if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);
    if (password && password.length < 8) return json({ error: "The new password must be at least 8 characters." }, 400);
    if (password && weakPassword(password)) return json({ error: "That password is too common or too simple. Mix letters and numbers, or use a longer password." }, 400);

    if (existing.user_id) {
      const authBody: Record<string, unknown> = { email, email_confirm: true };
      if (password) authBody.password = password;
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.user_id}`, {
        method: "PUT",
        headers: serviceHeaders(),
        body: JSON.stringify(authBody),
      });
      if (!authRes.ok) {
        const detail = await authRes.text();
        const taken = /already|registered|exists/i.test(detail);
        return json(
          { error: taken ? "Another account already uses this email." : "Could not update the sign-in details." },
          taken ? 409 : 400,
        );
      }
    }

    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/collectors?id=eq.${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        headers: serviceHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({ name, email }),
      },
    );
    if (!patchRes.ok) return json({ error: "Could not save the collector record." }, 500);
    return json({ ok: true, id: existing.id, name, email });
  }

  // ---------- delete ----------
  if (action === "delete") {
    const existing = await findCollector();
    if (!existing) return json({ error: "Collector not found." }, 404);

    const txRes = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?select=id&collector_id=eq.${encodeURIComponent(existing.id)}&limit=1`,
      { headers: serviceHeaders() },
    );
    const txRows = txRes.ok ? await txRes.json() : [];
    if (txRows.length) {
      return json(
        { error: "This collector has recorded payments, so they can't be removed. Deactivate them instead to keep the records." },
        409,
      );
    }

    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/collectors?id=eq.${encodeURIComponent(existing.id)}`,
      { method: "DELETE", headers: serviceHeaders({ Prefer: "return=minimal" }) },
    );
    if (!delRes.ok) return json({ error: "Could not remove the collector." }, 500);

    if (existing.user_id) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.user_id}`, {
        method: "DELETE",
        headers: serviceHeaders(),
      });
    }
    return json({ ok: true, id: existing.id });
  }

  return json({ error: "Unknown action." }, 400);
});
