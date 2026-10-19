-- Taxpayer register: only signed-in active collectors and admins can read it.
-- (The old public read policy "taxpayers readable" is removed by a separate step.)
create policy "active collectors and admins read taxpayers" on public.taxpayers
  for select to authenticated
  using (
    exists (select 1 from public.collectors c where c.user_id = auth.uid() and c.active)
    or exists (select 1 from public.admins a where a.user_id = auth.uid())
  );
