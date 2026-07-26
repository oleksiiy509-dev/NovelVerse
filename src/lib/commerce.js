export const BILLING_INTERVALS = Object.freeze({ monthly: 1, quarterly: 3, yearly: 12, lifetime: 0 });
export const PROVIDERS = Object.freeze(["stripe", "google_play", "apple_iap", "telegram_stars", "paypal"]);

const money = (value) => Math.max(0, Math.round(Number(value) || 0));
const date = (value) => new Date(value).getTime();

export function configureProviders(configurations = []) {
  return configurations.map((provider) => {
    if (!PROVIDERS.includes(provider.id)) throw new Error(`Unsupported payment provider: ${provider.id}`);
    return { id: provider.id, enabled: Boolean(provider.enabled), currencies: [...new Set(provider.currencies || [])], sandbox: Boolean(provider.sandbox) };
  });
}

export function createBillingSchedule({ interval, startedAt, graceDays = 7, retryDays = [1, 3, 5] }) {
  if (!(interval in BILLING_INTERVALS)) throw new Error("Unsupported billing interval");
  const start = new Date(startedAt);
  const renewalAt = new Date(start);
  const months = BILLING_INTERVALS[interval];
  if (months) renewalAt.setUTCMonth(renewalAt.getUTCMonth() + months);
  return { interval, autoRenew: months > 0, renewalAt: months ? renewalAt.toISOString() : null, graceDays, retryDays: [...retryDays] };
}

export function handlePaymentFailure(subscription, failedAt = new Date(), retryDays = [1, 3, 5], graceDays = 7) {
  const at = new Date(failedAt);
  const addDays = (days) => new Date(at.getTime() + days * 86400000).toISOString();
  return { ...subscription, status: "past_due", grace_ends_at: addDays(graceDays), retry_at: retryDays.map(addDays), retry_count: 0 };
}

export function evaluatePromotion(promotion, context, now = new Date()) {
  if (!promotion?.active || (promotion.startsAt && date(promotion.startsAt) > +now) || (promotion.endsAt && date(promotion.endsAt) <= +now)) return { eligible: false, reason: "inactive", discountCents: 0 };
  if (promotion.regions?.length && !promotion.regions.includes(context.region)) return { eligible: false, reason: "region", discountCents: 0 };
  if (promotion.firstPurchaseOnly && !context.firstPurchase) return { eligible: false, reason: "existing_customer", discountCents: 0 };
  const subtotal = money(context.subtotalCents);
  const discountCents = promotion.freeMonths ? subtotal : Math.min(subtotal, promotion.amountOffCents ? money(promotion.amountOffCents) : Math.round(subtotal * money(promotion.percentOff) / 100));
  return { eligible: true, reason: null, discountCents, totalCents: subtotal - discountCents, campaign: promotion.campaign || promotion.type };
}

export function redeemReferral(referral, invitedUserId, now = new Date()) {
  if (!referral?.active || referral.ownerUserId === invitedUserId || referral.redemptions >= referral.maxRedemptions) throw new Error("Referral is not redeemable");
  return { redeemedAt: now.toISOString(), code: referral.code, invitedUserId, rewards: [{ userId: referral.ownerUserId, benefit: referral.inviterBenefit }, { userId: invitedUserId, benefit: referral.inviteeBenefit }] };
}

export function createGift({ purchaserUserId, recipientUserId, planId, interval, message = "" }, tokenFactory = () => crypto.randomUUID()) {
  if (!purchaserUserId || !recipientUserId || purchaserUserId === recipientUserId) throw new Error("Gift requires a different recipient");
  if (!(interval in BILLING_INTERVALS)) throw new Error("Unsupported gift interval");
  return { token: tokenFactory(), purchaserUserId, recipientUserId, planId, interval, message: message.slice(0, 500), status: "pending" };
}

export function eligibleAds(campaigns, { planId, placement, now = new Date(), impressions = {} }) {
  return campaigns.filter((campaign) => campaign.active && campaign.eligiblePlans.includes(planId) && campaign.placements.includes(placement) && date(campaign.startsAt) <= +now && date(campaign.endsAt) > +now && (impressions[campaign.id] || 0) < campaign.frequencyLimit);
}

export function buildBusinessAnalytics({ subscriptions = [], payments = [], listening = [] }, now = new Date()) {
  const paid = payments.filter((p) => p.status === "paid");
  const since = (days) => +now - days * 86400000;
  const sumSince = (days) => paid.filter((p) => date(p.paidAt) >= since(days)).reduce((sum, p) => sum + money(p.amountCents), 0);
  const active = subscriptions.filter((s) => ["active", "trialing", "past_due"].includes(s.status));
  const trials = subscriptions.filter((s) => s.trialStartedAt);
  const group = (items, key) => Object.entries(items.reduce((out, item) => { const name = item[key] || "Unknown"; out[name] = (out[name] || 0) + 1; return out; }, {})).sort((a,b) => b[1]-a[1]);
  const rankedMinutes = (key) => Object.entries(listening.reduce((out, item) => { const name=item[key]||"Unknown"; out[name]=(out[name]||0)+Number(item.minutes||0); return out; }, {})).sort((a,b)=>b[1]-a[1]).map(([name, minutes])=>({name,minutes}));
  return { monthlyRevenue: sumSince(30), annualRevenue: sumSince(365), activeSubscribers: active.filter(s=>s.status === "active").length, churnRate: subscriptions.length ? subscriptions.filter(s=>s.status === "cancelled").length / subscriptions.length : 0, trialConversion: trials.length ? trials.filter(s=>s.convertedFromTrial).length / trials.length : 0, averageListeningTime: listening.length ? listening.reduce((n,e)=>n+Number(e.minutes||0),0)/listening.length : 0, topAudiobooks: rankedMinutes("bookTitle"), topAuthors: rankedMinutes("author"), regions: group(active,"region"), devices: group(listening,"device") };
}

export function generateFinancialReport(payments, { from, to, period = "monthly" }) {
  const rows = payments.filter((p) => date(p.createdAt) >= date(from) && date(p.createdAt) < date(to)).map((p) => ({ id: p.id, date: p.createdAt, provider: p.provider, currency: p.currency, grossCents: money(p.amountCents), taxCents: money(p.taxCents), netCents: money(p.amountCents)-money(p.taxCents), status: p.status }));
  return { period, from, to, totals: rows.reduce((a,r)=>({ grossCents:a.grossCents+r.grossCents, taxCents:a.taxCents+r.taxCents, netCents:a.netCents+r.netCents }),{grossCents:0,taxCents:0,netCents:0}), rows };
}

export function exportReport(report, format = "csv") {
  if (!['csv','xlsx','pdf'].includes(format)) throw new Error("Unsupported report format");
  if (format !== "csv") return { format, data: report, renderer: format === "xlsx" ? "spreadsheet" : "pdf" };
  const columns = ["id","date","provider","currency","grossCents","taxCents","netCents","status"];
  return { format, mimeType: "text/csv", data: [columns.join(','), ...report.rows.map(row=>columns.map(key=>JSON.stringify(row[key]??'')).join(','))].join('\n') };
}

export function detectFraud({ logins = [], devices = [], subscriptions = [] }, config = {}) {
  const limits = { maxRegionsPerDay: 3, maxDevicesPerMonth: 5, maxTrialsPerDevice: 2, ...config };
  const reasons = [];
  if (new Set(logins.filter(l=>date(l.at)>=Date.now()-86400000).map(l=>l.region)).size > limits.maxRegionsPerDay) reasons.push("abnormal_login_activity");
  if (new Set(devices.filter(d=>date(d.seenAt)>=Date.now()-30*86400000).map(d=>d.id)).size > limits.maxDevicesPerMonth) reasons.push("excessive_device_changes");
  if (subscriptions.filter(s=>s.trial && devices.some(d=>d.id===s.deviceId)).length > limits.maxTrialsPerDevice) reasons.push("subscription_abuse");
  if (logins.some(l=>l.concurrentStreams > 1)) reasons.push("account_sharing");
  return { flagged: reasons.length > 0, riskScore: Math.min(100, reasons.length * 25), reasons };
}
