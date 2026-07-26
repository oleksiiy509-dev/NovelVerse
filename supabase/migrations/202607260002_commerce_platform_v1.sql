-- Commerce Platform v1. Provider credentials belong in the secrets vault, never this table.
create type public.billing_interval as enum ('monthly','quarterly','yearly','lifetime');
create type public.commerce_code_type as enum ('promo','gift','referral','seasonal','regional','first_month_free','custom');

alter table public.subscription_plans add column billing_interval public.billing_interval not null default 'monthly';
alter table public.subscription_plans add column tax_code text;
alter table public.subscriptions add column auto_renew boolean not null default true;
alter table public.subscriptions add column grace_ends_at timestamptz;
alter table public.subscriptions add column retry_count smallint not null default 0;
alter table public.subscriptions add column provider text;

create table public.payment_providers (id text primary key check(id in ('stripe','google_play','apple_iap','telegram_stars','paypal')), enabled boolean not null default false, sandbox boolean not null default true, currencies text[] not null default '{}', secret_reference text, updated_at timestamptz not null default now());
insert into public.payment_providers(id) values ('stripe'),('google_play'),('apple_iap'),('telegram_stars'),('paypal');
create table public.billing_attempts (id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.subscriptions(id), provider text not null references public.payment_providers(id), attempt smallint not null, scheduled_at timestamptz not null, completed_at timestamptz, status text not null default 'scheduled', error_code text);

alter table public.promotions add column type public.commerce_code_type not null default 'promo';
alter table public.promotions add column amount_off_cents integer check(amount_off_cents >= 0);
alter table public.promotions add column regions text[];
alter table public.promotions add column campaign text;
alter table public.promotions add column max_redemptions integer;
alter table public.promotions add column redemptions integer not null default 0;
create table public.promotion_redemptions (id uuid primary key default gen_random_uuid(), promotion_id uuid not null references public.promotions(id), user_id uuid not null references auth.users(id), discount_cents integer not null, redeemed_at timestamptz not null default now(), unique(promotion_id,user_id));
create table public.referrals (id uuid primary key default gen_random_uuid(), code text unique not null, owner_user_id uuid not null references auth.users(id), inviter_benefit jsonb not null, invitee_benefit jsonb not null, max_redemptions integer not null default 100, redemptions integer not null default 0, active boolean not null default true);
create table public.referral_redemptions (id uuid primary key default gen_random_uuid(), referral_id uuid not null references public.referrals(id), invited_user_id uuid not null references auth.users(id), redeemed_at timestamptz not null default now(), unique(referral_id,invited_user_id));
create table public.gift_subscriptions (id uuid primary key default gen_random_uuid(), purchaser_user_id uuid not null references auth.users(id), recipient_user_id uuid references auth.users(id), recipient_email text, plan_id text not null references public.subscription_plans(id), billing_interval public.billing_interval not null, redemption_token_hash text unique not null, message text check(length(message)<=500), status text not null default 'pending', redeemed_at timestamptz, expires_at timestamptz);

create table public.ad_campaigns (id uuid primary key default gen_random_uuid(), name text not null, active boolean not null default false, eligible_plans text[] not null, placements text[] not null, frequency_limit integer not null check(frequency_limit>0), starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), budget_cents integer check(budget_cents>=0));
create table public.ad_events (id bigint generated always as identity primary key, campaign_id uuid not null references public.ad_campaigns(id), user_id uuid references auth.users(id), placement text not null, event text not null check(event in ('impression','click','conversion')), created_at timestamptz not null default now());
create index ad_events_campaign_time on public.ad_events(campaign_id,created_at);

create table public.tax_rates (id uuid primary key default gen_random_uuid(), region text not null, tax_code text not null, rate numeric(7,6) not null check(rate between 0 and 1), active boolean not null default true, unique(region,tax_code));
create table public.currencies (code text primary key, name text not null, minor_units smallint not null default 2, active boolean not null default true);
create table public.financial_reports (id uuid primary key default gen_random_uuid(), period text not null check(period in ('daily','weekly','monthly','yearly')), starts_at timestamptz not null, ends_at timestamptz not null, totals jsonb not null, generated_by uuid references auth.users(id), created_at timestamptz not null default now());
create table public.fraud_signals (id bigint generated always as identity primary key, user_id uuid not null references auth.users(id), signal text not null, risk_score integer not null check(risk_score between 0 and 100), evidence jsonb not null default '{}', status text not null default 'open', created_at timestamptz not null default now());

alter table public.payment_providers enable row level security; alter table public.billing_attempts enable row level security; alter table public.promotion_redemptions enable row level security; alter table public.referrals enable row level security; alter table public.referral_redemptions enable row level security; alter table public.gift_subscriptions enable row level security; alter table public.ad_campaigns enable row level security; alter table public.ad_events enable row level security; alter table public.financial_reports enable row level security; alter table public.fraud_signals enable row level security;
create policy "read own gifts" on public.gift_subscriptions for select using(auth.uid()=purchaser_user_id or auth.uid()=recipient_user_id);
create policy "read own referral" on public.referrals for select using(auth.uid()=owner_user_id);
create policy "read own fraud status" on public.fraud_signals for select using(auth.uid()=user_id);
create policy "record ad events" on public.ad_events for insert with check(auth.uid()=user_id);
