-- Sprint 5 production authorization and query audit.
-- Client-editable user_metadata is deliberately excluded from every privilege check.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true', false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Billing configuration and provider state are server-owned. Explicit RLS prevents
-- accidental access if table grants change during a future deployment.
alter table public.subscription_plans enable row level security;
alter table public.subscription_config enable row level security;
alter table public.promotions enable row level security;
alter table public.regional_prices enable row level security;
alter table public.subscription_notifications enable row level security;
alter table public.listening_events enable row level security;
alter table public.tax_rates enable row level security;
alter table public.currencies enable row level security;

create policy "active plans are readable" on public.subscription_plans for select using (active);
create policy "active regional prices are readable" on public.regional_prices for select using (
  exists (select 1 from public.subscription_plans p where p.id = plan_id and p.active)
);
create policy "active currencies are readable" on public.currencies for select using (active);
create policy "users read own notifications" on public.subscription_notifications for select using (auth.uid() = user_id);
create policy "users record own listening" on public.listening_events for insert with check (auth.uid() = user_id);

create policy "admins manage subscription plans" on public.subscription_plans for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage subscription config" on public.subscription_config for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage promotions" on public.promotions for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage regional prices" on public.regional_prices for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage notifications" on public.subscription_notifications for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read listening events" on public.listening_events for select using (public.is_admin());
create policy "admins manage tax rates" on public.tax_rates for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage currencies" on public.currencies for all using (public.is_admin()) with check (public.is_admin());

-- Indexes match the authenticated user, expiry and pending-work access patterns.
create index if not exists subscriptions_user_status_expiry_idx
  on public.subscriptions(user_id, status, trial_ends_at, current_period_end);
create index if not exists subscription_notifications_user_created_idx
  on public.subscription_notifications(user_id, created_at desc);
create index if not exists listening_events_user_created_idx
  on public.listening_events(user_id, created_at desc);
create index if not exists billing_attempts_pending_idx
  on public.billing_attempts(scheduled_at) where status = 'scheduled';
create index if not exists promotion_redemptions_user_idx
  on public.promotion_redemptions(user_id, redeemed_at desc);
create index if not exists referral_redemptions_user_idx
  on public.referral_redemptions(invited_user_id, redeemed_at desc);

-- reading_progress belongs to the deployment's core schema rather than these
-- feature migrations, so create its hot-path index only when that table exists.
do $$
begin
  if to_regclass('public.reading_progress') is not null then
    execute 'create unique index if not exists reading_progress_user_novel_idx on public.reading_progress(user_id, novel_id)';
  end if;
end $$;

-- Subscription entitlements are evaluated from server-owned rows and use the
-- caller identity from auth.uid(); callers cannot supply another user id.
create or replace function public.has_subscription_feature(requested text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.user_id = auth.uid()
      and s.status in ('trialing', 'active')
      and case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end > now()
      and p.active
      and p.features ? requested
  );
$$;

revoke all on function public.has_subscription_feature(text) from public;
grant execute on function public.has_subscription_feature(text) to authenticated;
