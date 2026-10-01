-- Supabase migration for pdfconverter Pro entitlements.
-- Run in Supabase Dashboard > SQL Editor, then set
-- SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Vercel env.

create table if not exists public.entitlements (
  subscription_id text primary key,
  email text,
  status text not null default 'active'
    check (status in ('active', 'cancelled', 'expired')),
  current_end timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists entitlements_email_idx
  on public.entitlements (email);

-- Service role bypasses RLS; no policies needed if you keep RLS off for this
-- table. If RLS is on, add: create policy "service all" on public.entitlements
-- for all using (true) with check (true);
