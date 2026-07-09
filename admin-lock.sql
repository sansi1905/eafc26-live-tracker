-- EA FC 26 Tracker - Admin yazma kilidi
-- Supabase > SQL Editor > New query > Run

-- Önce eski public yazma izinlerini kaldırıyoruz.
drop policy if exists "public insert matches" on public.matches;
drop policy if exists "public update matches" on public.matches;
drop policy if exists "public delete matches" on public.matches;

-- Herkes maçları okuyabilir.
drop policy if exists "public read matches" on public.matches;
create policy "public read matches"
on public.matches
for select
to anon, authenticated
using (true);

-- Sadece Serkan admin maili yazabilir.
create policy "admin insert matches"
on public.matches
for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'serkanmutlu2109@gmail.com');

create policy "admin update matches"
on public.matches
for update
to authenticated
using ((auth.jwt() ->> 'email') = 'serkanmutlu2109@gmail.com')
with check ((auth.jwt() ->> 'email') = 'serkanmutlu2109@gmail.com');

create policy "admin delete matches"
on public.matches
for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'serkanmutlu2109@gmail.com');
