begin;
alter table public.event_settings add column if not exists place_type text not null default 'Raum' check (place_type in ('Raum','Tisch'));
alter table public.orders add column if not exists place_type text not null default 'Raum' check (place_type in ('Raum','Tisch'));
alter table public.products drop constraint if exists products_category_check;
update public.products set category = 'Heißgetränke' where category in ('Kaffee','Tee');
alter table public.products add constraint products_category_check check (category in ('Heißgetränke','Wasser','Softdrinks','Essen','Snacks','Sonstiges'));
create or replace function public.set_order_place_type() returns trigger language plpgsql set search_path = public as $$
begin
  new.place_type := coalesce((select place_type from public.event_settings where id = 1), 'Raum');
  return new;
end;
$$;
drop trigger if exists set_order_place_type on public.orders;
create trigger set_order_place_type before insert on public.orders for each row execute function public.set_order_place_type();


-- Nur vorhandene Admin-Konten freischalten; vor Ausführung Authentication > Users prüfen.
create table if not exists public.portal_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.portal_admins enable row level security;
revoke all on public.portal_admins from anon, authenticated;
do $$ begin
if not exists(select 1 from public.portal_admins) then
  if (select count(*) from auth.users) <> 1 then raise exception 'Bitte Admin-UUID ausdrücklich in portal_admins eintragen; mehrere oder keine Benutzer vorhanden.'; end if;
  insert into public.portal_admins select id from auth.users on conflict do nothing;
end if; end $$;
create or replace function public.is_portal_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.portal_admins where user_id=auth.uid()) $$;
revoke all on function public.is_portal_admin() from public;
grant execute on function public.is_portal_admin() to anon,authenticated;
do $$ declare p record; begin for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('products','event_settings','orders','order_items') loop execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop; end $$;
create policy public_products on public.products for select to anon,authenticated using(active or public.is_portal_admin());
create policy public_event on public.event_settings for select to anon,authenticated using(true);
create policy admin_products on public.products for all to authenticated using(public.is_portal_admin()) with check(public.is_portal_admin());
create policy admin_event on public.event_settings for all to authenticated using(public.is_portal_admin()) with check(public.is_portal_admin());
create policy admin_orders on public.orders for all to authenticated using(public.is_portal_admin()) with check(public.is_portal_admin());
create policy admin_items on public.order_items for select to authenticated using(public.is_portal_admin());
alter table public.event_settings add column if not exists accepting boolean not null default true, add column if not exists deadline timestamptz, add column if not exists event_key uuid not null default gen_random_uuid();
alter table public.products add column if not exists stock integer check(stock>=0);
alter table public.orders add column if not exists paid boolean not null default false, add column if not exists event_key uuid;
update public.orders set event_key=(select event_key from public.event_settings where id=1) where event_key is null;
create table if not exists public.event_archive (event_key uuid primary key, settings jsonb not null, archived_at timestamptz default now());
alter table public.event_archive enable row level security;
drop policy if exists archive_read on public.event_archive;
create policy archive_read on public.event_archive for select to authenticated using(public.is_portal_admin());
grant select on public.event_archive to authenticated;
grant update(paid) on public.orders to authenticated;
create or replace function public.archive_event() returns void language plpgsql security definer set search_path=public as $$ declare e public.event_settings%rowtype; begin if not public.is_portal_admin() then raise exception 'Nicht berechtigt'; end if; select * into e from public.event_settings where id=1 for update; insert into public.event_archive(event_key,settings) values(e.event_key,to_jsonb(e)); update public.event_settings set event_key=gen_random_uuid(), accepting=false, deadline=null, title='Neue Veranstaltung',event_date=null where id=1; end $$;
revoke all on function public.archive_event() from public;
grant execute on function public.archive_event() to authenticated;
create or replace function public.submit_order(p_teacher_name text,p_room text,p_note text,p_items jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare e public.event_settings%rowtype; oid uuid; i jsonb; p public.products%rowtype; q integer;
begin
select * into e from public.event_settings where id=1 for update;
if not found or not e.accepting or (e.deadline is not null and now()>=e.deadline) then raise exception 'Bestellannahme geschlossen.'; end if;
if length(trim(coalesce(p_teacher_name,''))) not between 1 and 100 or length(trim(coalesce(p_room,''))) not between 1 and 100 or length(coalesce(p_note,''))>500 then raise exception 'Ungültige Angaben.'; end if;
if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Ungültige Auswahl.'; end if;
if jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Ungültige Auswahl.'; end if;
insert into public.orders(teacher_name,room,note,event_key,place_type) values(trim(p_teacher_name),trim(p_room),coalesce(p_note,''),e.event_key,e.place_type) returning id into oid;
for i in select value from jsonb_array_elements(p_items) loop
q := (i->>'quantity')::integer;
if q is null or q not between 1 and 100 then raise exception 'Ungültige Menge.'; end if;
select * into p from public.products where id=(i->>'product_id')::uuid and active for update;
if not found or (p.stock is not null and p.stock<q) then raise exception 'Produkt nicht ausreichend verfügbar.'; end if;
if p.stock is not null then update public.products set stock=stock-q where id=p.id; end if;
insert into public.order_items(order_id,product_id,quantity,unit_price,product_name) values(oid,p.id,q,p.price,p.name);
end loop; return oid; end $$;
drop function if exists public.submit_order(text,text,jsonb);
revoke all on function public.submit_order(text,text,text,jsonb) from public;
grant execute on function public.submit_order(text,text,text,jsonb) to anon,authenticated;
commit;
