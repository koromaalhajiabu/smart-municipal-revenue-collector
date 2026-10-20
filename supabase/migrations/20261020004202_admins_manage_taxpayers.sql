-- Admins can add and edit taxpayers from the admin screen.
create policy "admins insert taxpayers" on public.taxpayers
  for insert to authenticated
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins update taxpayers" on public.taxpayers
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
