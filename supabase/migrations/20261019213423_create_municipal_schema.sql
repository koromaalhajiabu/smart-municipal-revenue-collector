-- SmartMunicipal core schema (Freetown City Council revenue collection)

create table public.taxpayers (
  id text primary key,
  business text not null,
  stall text not null default '-',
  owner text not null,
  zone text not null,
  standard_rate numeric(12,2) not null default 0 check (standard_rate >= 0),
  created_at timestamptz not null default now()
);

create table public.collectors (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key,
  receipt_number text not null unique,
  taxpayer_id text not null references public.taxpayers(id),
  business text not null,
  zone text not null,
  collector_id text not null references public.collectors(id),
  levy text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash','Orange Money','Africell Money')),
  reference text not null default '',
  created_at timestamptz not null,
  synced_at timestamptz not null default now()
);

-- A mobile money reference can be recorded only once per collector.
create unique index transactions_momo_reference_key
  on public.transactions (collector_id, reference)
  where reference <> '';

alter table public.taxpayers enable row level security;
alter table public.collectors enable row level security;
alter table public.transactions enable row level security;

-- The public (anon) key may read the taxpayer register, so search works in the app.
create policy "taxpayers readable" on public.taxpayers
  for select to anon, authenticated using (true);

-- Field devices may only insert transactions. They cannot read, edit or delete the ledger.
create policy "transactions insert from devices" on public.transactions
  for insert to anon, authenticated with check (true);

-- Sample taxpayers and collectors for the demo. Replace with the council's data before live use.
insert into public.taxpayers (id, business, stall, owner, zone, standard_rate) values
  ('TP-0402', 'Mabinty''s General Store', '402', 'Mabinty Kamara', 'Kissy Market', 50000),
  ('TP-0231', 'Fatmata Tailoring', '231', 'Fatmata Conteh', 'Kissy Market', 30000),
  ('TP-0077', 'Kono Fresh Produce', '77', 'Ibrahim Kono', 'Kissy Market', 40000),
  ('TP-0118', 'Alhaji Transport Hub', '-', 'Alhaji Sesay', 'Central Station', 120000);

insert into public.collectors (id, name) values
  ('COL-8492', 'Collector 8492'),
  ('COL-8411', 'Collector 8411');
