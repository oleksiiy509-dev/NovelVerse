export const PLAN_IDS = Object.freeze({ TRIAL: "free_trial", BASIC: "basic", PREMIUM: "premium", PREMIUM_PLUS: "premium_plus" });

export const PLAN_CATALOG = Object.freeze({
  [PLAN_IDS.TRIAL]: { name: "Free Trial", price: 0, trialDays: 30, ads: "optional", features: ["catalog", "unlimited_listening", "high_quality", "downloads", "premium_books"] },
  [PLAN_IDS.BASIC]: { name: "Basic", price: 7.99, ads: true, features: ["catalog", "streaming"] },
  [PLAN_IDS.PREMIUM]: { name: "Premium", price: 12.99, ads: false, features: ["catalog", "streaming", "downloads", "high_quality", "unlimited_listening", "premium_books"] },
  [PLAN_IDS.PREMIUM_PLUS]: { name: "Premium+", price: 17.99, ads: false, features: ["catalog", "streaming", "downloads", "high_quality", "unlimited_listening", "premium_books", "early_access", "exclusive_books", "beta_features"] },
});

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

/** Server/domain subscription validation. Callers must pass a record loaded for the authenticated user. */
export function validateSubscription(subscription, now = new Date()) {
  if (!subscription || !PLAN_CATALOG[subscription.plan_id] || !ACTIVE_STATUSES.has(subscription.status)) return { active: false, reason: "inactive" };
  const expiresAt = subscription.status === "trialing" ? subscription.trial_ends_at : subscription.current_period_end;
  if (!expiresAt || new Date(expiresAt).getTime() <= now.getTime()) return { active: false, reason: "expired" };
  return { active: true, reason: null, plan: PLAN_CATALOG[subscription.plan_id], expiresAt };
}

export function canAccess(subscription, feature, now = new Date(), flags = {}) {
  const result = validateSubscription(subscription, now);
  if (!result.active) return false;
  if (Object.hasOwn(flags, feature) && !flags[feature]) return false;
  return result.plan.features.includes(feature);
}

export function shouldShowAds(subscription, { trialAdsEnabled = false, now = new Date() } = {}) {
  const result = validateSubscription(subscription, now);
  if (!result.active) return true;
  if (subscription.plan_id === PLAN_IDS.TRIAL) return trialAdsEnabled;
  return subscription.plan_id === PLAN_IDS.BASIC;
}

export function trialDaysLeft(subscription, now = new Date()) {
  if (subscription?.status !== "trialing" || !subscription.trial_ends_at) return 0;
  return Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - now.getTime()) / 86400000));
}

export function requireRole(user, roles) {
  const role = user?.app_metadata?.role;
  return Boolean(role && roles.includes(role));
}

export function buildNotifications(subscription, event, now = new Date()) {
  const allowed = new Set(["payment_failed", "renewal_success", "subscription_cancelled"]);
  if (allowed.has(event)) return [{ type: event, userId: subscription.user_id, createdAt: now.toISOString() }];
  if (event === "trial_check" && subscription.status === "trialing" && trialDaysLeft(subscription, now) <= 3) {
    return [{ type: "trial_ending", userId: subscription.user_id, createdAt: now.toISOString() }];
  }
  return [];
}

export function calculateAnalytics({ subscriptions = [], payments = [], listening = [] }, now = new Date()) {
  const valid = subscriptions.filter((item) => validateSubscription(item, now).active);
  const trials = valid.filter((item) => item.status === "trialing");
  const converted = subscriptions.filter((item) => item.converted_from_trial).length;
  const completedTrials = subscriptions.filter((item) => item.trial_started_at).length;
  const bookMinutes = listening.reduce((all, item) => all.set(item.book_title, (all.get(item.book_title) || 0) + Number(item.minutes || 0)), new Map());
  return {
    activeSubscribers: valid.filter((item) => item.status === "active").length,
    trialUsers: trials.length,
    conversionRate: completedTrials ? Math.round((converted / completedTrials) * 1000) / 10 : 0,
    cancellations: subscriptions.filter((item) => item.status === "cancelled").length,
    revenue: payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount || 0), 0),
    mostListenedBooks: [...bookMinutes].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([title, minutes]) => ({ title, minutes })),
  };
}
