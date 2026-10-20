-- Business licence register. Not yet applied to the live project.
-- Run this in the Supabase SQL editor when the council agrees to use the licence register.
create table if not exists public.business_licences (
  id            uuid primary key default gen_random_uuid(),
  taxpayer_id   text not null references public.taxpayers(id),
  licence_no    text not null unique,
  licence_type  text not null,
  issued_on     date not null,
  expires_on    date not null,
  status        text not null default 'active' check (status in ('active', 'revoked')),
  created_at    timestamptz not null default now(),
  check (expires_on > issued_on)
);

alter table public.business_licences enable row level security;

create policy "staff read licences" on public.business_licences
  for select to authenticated
  using (
    exists (select 1 from public.admins a where a.user_id = auth.uid())
    or exists (select 1 from public.collectors c where c.user_id = auth.uid() and c.active)
  );

create policy "admins add licences" on public.business_licences
  for insert to authenticated
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins update licences" on public.business_licences
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
