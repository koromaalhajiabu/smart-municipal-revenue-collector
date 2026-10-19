-- Admin access: admins are Supabase Auth users listed in public.admins.

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- An admin can see their own admin record only.
create policy "admins read own record" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Only listed admins can read the ledger and the collector list.
create policy "admins read transactions" on public.transactions
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins read collectors" on public.collectors
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
