-- Subscription Platform v1: billing state is server-owned; clients receive read-only scoped access.
create type public.subscription_status as enum ('trialing','active','past_due','cancelled','expired');
create table public.subscription_plans (id text primary key, name text not null, price_cents integer not null check (price_cents >= 0), currency text not null default 'USD', trial_days integer not null default 0, features jsonb not null default '[]', ads_enabled boolean not null default false, active boolean not null default true, updated_at timestamptz not null default now());
insert into public.subscription_plans values
 ('free_trial','Free Trial',0,'USD',30,'["catalog","downloads","premium_books","high_quality","unlimited_listening"]',false,true,now()),
 ('basic','Basic',799,'USD',0,'["catalog","streaming"]',true,true,now()),
 ('premium','Premium',1299,'USD',0,'["catalog","streaming","downloads","premium_books","high_quality","unlimited_listening"]',false,true,now()),
 ('premium_plus','Premium+',1799,'USD',0,'["catalog","streaming","downloads","premium_books","high_quality","unlimited_listening","early_access","exclusive_books","beta_features"]',false,true,now());
create table public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, plan_id text not null references public.subscription_plans(id), status public.subscription_status not null, trial_started_at timestamptz, trial_ends_at timestamptz, current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean not null default false, provider_customer_id text, provider_subscription_id text unique, converted_from_trial boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index one_current_subscription_per_user on public.subscriptions(user_id) where status in ('trialing','active','past_due');
create table public.payments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), subscription_id uuid references public.subscriptions(id), amount_cents integer not null, currency text not null, status text not null, provider_payment_id text unique, paid_at timestamptz);
create table public.invoices (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), payment_id uuid references public.payments(id), number text unique not null, invoice_url text, created_at timestamptz not null default now());
create table public.subscription_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
insert into public.subscription_config values ('trial_ads_enabled','false',now()),('feature_flags','{"beta_features":true}',now());
create table public.promotions (id uuid primary key default gen_random_uuid(), code text unique not null, percent_off integer check(percent_off between 1 and 100), starts_at timestamptz, ends_at timestamptz, active boolean default true);
create table public.regional_prices (plan_id text references public.subscription_plans(id), region text, currency text, price_cents integer check(price_cents >= 0), primary key(plan_id,region));
create table public.subscription_notifications (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), type text not null, payload jsonb default '{}', sent_at timestamptz, created_at timestamptz default now());
create table public.listening_events (id bigint generated always as identity primary key, user_id uuid references auth.users(id), novel_id bigint references public.novels(id), minutes numeric not null check(minutes >= 0), created_at timestamptz default now());
alter table public.subscriptions enable row level security; alter table public.payments enable row level security; alter table public.invoices enable row level security;
create policy "read own subscription" on public.subscriptions for select using (auth.uid()=user_id);
create policy "read own payments" on public.payments for select using (auth.uid()=user_id);
create policy "read own invoices" on public.invoices for select using (auth.uid()=user_id);
-- SECURITY DEFINER is the canonical access gate for edge functions and protected media endpoints.
create or replace function public.has_subscription_feature(requested text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from subscriptions s join subscription_plans p on p.id=s.plan_id where s.user_id=auth.uid() and s.status in ('trialing','active') and coalesce(s.trial_ends_at,s.current_period_end)>now() and p.features ? requested);
$$;
revoke all on function public.has_subscription_feature(text) from public; grant execute on function public.has_subscription_feature(text) to authenticated;
