-- Im Supabase SQL Editor vollständig ausführen.
-- Danach in Authentication > Users einen Admin-Benutzer anlegen.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  category text not null check (category in ('Kaffee','Tee','Wasser','Softdrinks','Snacks','Sonstiges')),
  price numeric(10,2) not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.event_settings (
  id integer primary key default 1 check (id = 1),
  title text not null default 'Elternabend',
  event_date date,
  start_time time not null default '18:00',
  end_time time not null default '20:00',
  location text not null default ''
);

insert into public.event_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  teacher_name text not null check (char_length(teacher_name) between 1 and 100),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  quantity integer not null check (quantity between 1 and 100),
  unit_price numeric(10,2) not null check (unit_price >= 0)
);

alter table public.products enable row level security;
alter table public.event_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Lehrer sehen nur aktive Produkte und den Veranstaltungstermin.
create policy "Public can read active products" on public.products
for select to anon, authenticated using (active = true or auth.uid() is not null);
create policy "Admins manage products" on public.products
for all to authenticated using (true) with check (true);

create policy "Public can read event settings" on public.event_settings
for select to anon, authenticated using (true);
create policy "Admins manage event settings" on public.event_settings
for all to authenticated using (true) with check (true);

create policy "Admins read orders" on public.orders
for select to authenticated using (true);
create policy "Admins read order items" on public.order_items
for select to authenticated using (true);

-- Bestellungen werden ausschließlich über diese Funktion eingetragen.
-- Preise werden serverseitig aus der Produkttabelle übernommen, nicht vom Browser.
create or replace function public.submit_order(
  p_teacher_name text,
  p_note text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_order_id uuid;
  item jsonb;
  chosen_product public.products%rowtype;
  qty integer;
begin
  if length(trim(coalesce(p_teacher_name,''))) < 1 or length(p_teacher_name) > 100 then
    raise exception 'Bitte einen gültigen Namen eingeben.';
  end if;
  if length(coalesce(p_note,'')) > 500 then raise exception 'Anmerkung ist zu lang.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Ungültige Artikelauswahl.';
  end if;

  insert into public.orders(teacher_name,note)
  values (trim(p_teacher_name),coalesce(p_note,'')) returning id into new_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    qty := (item->>'quantity')::integer;
    if qty < 1 or qty > 100 then raise exception 'Ungültige Menge.'; end if;
    select * into chosen_product from public.products
      where id = (item->>'product_id')::uuid and active = true;
    if not found then raise exception 'Ein ausgewähltes Produkt ist nicht verfügbar.'; end if;
    insert into public.order_items(order_id,product_id,quantity,unit_price)
    values(new_order_id,chosen_product.id,qty,chosen_product.price);
  end loop;
  return new_order_id;
end;
$$;

revoke all on function public.submit_order(text,text,jsonb) from public;
grant execute on function public.submit_order(text,text,jsonb) to anon, authenticated;

-- Beispielsortiment. Preise sind Platzhalter und im Adminbereich änderbar.
insert into public.products(name,category,price) values
('Kaffee','Kaffee',2.00),
('Tee','Tee',1.50),
('Wasser','Wasser',1.00),
('Softdrink','Softdrinks',2.00),
('Snack','Snacks',1.50)
on conflict do nothing;
