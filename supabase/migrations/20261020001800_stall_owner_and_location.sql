-- Taxpayer address and map point (filled in when the council supplies the data).
alter table public.taxpayers
  add column address text,
  add column latitude double precision,
  add column longitude double precision;

-- Each payment keeps the stall, owner and the collector's location at the time it was recorded.
alter table public.transactions
  add column stall text not null default '-',
  add column owner text not null default '',
  add column collector_latitude double precision,
  add column collector_longitude double precision,
  add column location_accuracy double precision;
