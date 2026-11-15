-- 狐隱 KOGAKURE：正式帳務管理。只有 admin_users 正式管理員可讀寫。
-- 不將「已完成訂單」自動認列現金收入；帳務登錄以實際 Gil 收付為準。
create table if not exists public.accounting_entries (
 id uuid primary key default gen_random_uuid(),
 entry_date date not null default ((now() at time zone 'Asia/Taipei')::date),
 kind text not null check (kind in ('income','expense')),
 category text not null check (char_length(btrim(category)) between 1 and 48),
 amount_gil bigint not null check (amount_gil between 1 and 1000000000),
 description text not null default '' check (char_length(description) <= 240),
 reference text not null default '' check (char_length(reference) <= 100),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists accounting_entries_period
 on public.accounting_entries(entry_date desc, created_at desc);

-- Allow timestamp maintenance without changing the owner's bookkeeping rows.
drop trigger if exists accounting_entries_update_timestamp on public.accounting_entries;
create trigger accounting_entries_update_timestamp
 before update on public.accounting_entries
 for each row execute function public.set_updated_at();

alter table public.accounting_entries enable row level security;
revoke all on table public.accounting_entries from public,anon,authenticated;
grant select,delete on public.accounting_entries to authenticated;
grant insert(entry_date,kind,category,amount_gil,description,reference)
 on public.accounting_entries to authenticated;
grant update(entry_date,kind,category,amount_gil,description,reference)
 on public.accounting_entries to authenticated;

-- Strict owner-only policies. Merely being an authenticated employee, or
-- having orders.manage, does NOT authorize reading the finance ledger.
drop policy if exists "owners read accounting entries" on public.accounting_entries;
create policy "owners read accounting entries"
 on public.accounting_entries for select to authenticated
 using ((select public.is_site_admin()));

drop policy if exists "owners record accounting entries" on public.accounting_entries;
create policy "owners record accounting entries"
 on public.accounting_entries for insert to authenticated
 with check ((select public.is_site_admin()) and created_by=(select auth.uid()));

drop policy if exists "owners edit accounting entries" on public.accounting_entries;
create policy "owners edit accounting entries"
 on public.accounting_entries for update to authenticated
 using ((select public.is_site_admin()))
 with check ((select public.is_site_admin()));

drop policy if exists "owners remove accounting entries" on public.accounting_entries;
create policy "owners remove accounting entries"
 on public.accounting_entries for delete to authenticated
 using ((select public.is_site_admin()));

comment on table public.accounting_entries is
 'Manual, owner-only Gil income/expense ledger. Completed tea orders are NOT auto-settled or auto-included.';
