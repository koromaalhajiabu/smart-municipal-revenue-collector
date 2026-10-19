// admin-collectors: lets a signed-in admin create collector logins and turn them on or off.
// Deployed to Supabase Edge Functions. Requires a valid JWT (verify_jwt = true) and an
// admin row in public.admins. The service role key is only ever used on the server.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. Who is calling?
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Please sign in again.' }, 401);

  // 2. Are they an admin?
  const { data: adminRow } = await admin
    .from('admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (!adminRow) return json({ error: 'Only admins can manage collectors.' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  // 3. Create a collector login and record.
  if (body.action === 'create') {
    const id = String(body.collector_id || '').trim().toUpperCase();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!/^COL-\d{4}$/.test(id)) return json({ error: 'Collector ID must look like COL-1234.' }, 400);
    if (name.length < 2) return json({ error: 'Enter the collector name.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (password.length < 8) return json({ error: 'The temporary password must be at least 8 characters.' }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return json({ error: createErr?.message || 'Could not create the login.' }, 400);
    }

    const { error: insErr } = await admin.from('collectors').insert({
      id, name, email, user_id: created.user.id, active: true,
    });
    if (insErr) {
      // Roll back the login so no orphan account is left behind.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: insErr.message.includes('duplicate') ? 'That collector ID already exists.' : insErr.message }, 400);
    }
    return json({ ok: true, id });
  }

  // 4. Turn a collector on or off. Off = they cannot sign in and cannot record payments.
  if (body.action === 'set_active') {
    const id = String(body.collector_id || '');
    const active = !!body.active;

    const { data: row, error: selErr } = await admin
      .from('collectors').select('user_id').eq('id', id).maybeSingle();
    if (selErr || !row) return json({ error: 'Collector not found.' }, 404);

    const { error: updErr } = await admin.from('collectors').update({ active }).eq('id', id);
    if (updErr) return json({ error: updErr.message }, 400);

    if (row.user_id) {
      await admin.auth.admin.updateUserById(row.user_id, {
        ban_duration: active ? 'none' : '876000h',
      });
    }
    return json({ ok: true });
  }

  return json({ error: 'Unknown request.' }, 400);
});
