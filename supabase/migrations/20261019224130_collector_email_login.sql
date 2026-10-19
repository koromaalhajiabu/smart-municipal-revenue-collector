-- Collector accounts: each collector record is linked to a Supabase Auth user.
alter table public.collectors
  add column email text,
  add column user_id uuid unique references auth.users(id) on delete set null;

-- A signed-in collector can read their own record.
create policy "collectors read own record" on public.collectors
  for select to authenticated using (user_id = auth.uid());

-- A signed-in, active collector can record transactions under their own collector ID only.
create policy "collectors insert own transactions" on public.transactions
  for insert to authenticated
  with check (exists (
    select 1 from public.collectors c
    where c.user_id = auth.uid() and c.id = collector_id and c.active
  ));
