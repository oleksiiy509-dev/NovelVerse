import { useMemo, useState } from "react";
import { PLAN_CATALOG, PLAN_IDS, trialDaysLeft } from "../lib/subscriptions";
import "../styles/Subscription.css";

const demoSubscription = { plan_id: PLAN_IDS.TRIAL, status: "trialing", trial_ends_at: new Date(Date.now() + 18 * 86400000).toISOString(), current_period_end: new Date(Date.now() + 18 * 86400000).toISOString() };
const benefits = { free_trial: ["First month free", "Full catalog access", "Cancel anytime"], basic: ["Full audiobook catalog", "Streaming access", "Ad-supported"], premium: ["No advertisements", "Offline downloads", "Highest audio quality", "Unlimited listening"], premium_plus: ["Everything in Premium", "Early access", "Exclusive audiobooks", "Beta features"] };

export default function Subscription() {
  const [subscription, setSubscription] = useState(demoSubscription);
  const [cancelled, setCancelled] = useState(false);
  const renewal = subscription.trial_ends_at || subscription.current_period_end;
  const invoices = useMemo(() => [{ id: "INV-2026-0712", date: "Jul 12, 2026", amount: "$0.00", status: "Trial" }], []);
  return <main className="subscription-page page-shell">
    <header className="subscription-hero"><span className="eyebrow">NOVELVERSE MEMBERSHIP</span><h1>Stories without limits.</h1><p>Choose the listening experience that fits your world.</p></header>
    <section className="plan-grid" aria-label="Subscription plans">{Object.entries(PLAN_CATALOG).map(([id, plan]) => <article className={`plan-card ${id === PLAN_IDS.PREMIUM ? "featured" : ""}`} key={id}>{id === PLAN_IDS.PREMIUM && <span className="popular">MOST POPULAR</span>}<h2>{plan.name}</h2><p className="price"><strong>${plan.price}</strong><span>/ month</span></p><ul>{benefits[id].map((item) => <li key={item}>✓ {item}</li>)}</ul><button type="button" className={subscription.plan_id === id ? "current" : ""} onClick={() => { setSubscription({ plan_id: id, status: id === PLAN_IDS.TRIAL ? "trialing" : "active", trial_ends_at: id === PLAN_IDS.TRIAL ? new Date(Date.now() + 30 * 86400000).toISOString() : null, current_period_end: new Date(Date.now() + 30 * 86400000).toISOString() }); setCancelled(false); }}>{subscription.plan_id === id ? "Current plan" : id === PLAN_IDS.TRIAL ? "Start free trial" : `Choose ${plan.name}`}</button></article>)}</section>
    <section className="account-panel"><div><span className="eyebrow">YOUR MEMBERSHIP</span><h2>{PLAN_CATALOG[subscription.plan_id].name}</h2><p>{subscription.status === "trialing" ? `${trialDaysLeft(subscription)} days left in your free trial` : "Your subscription is active"}</p></div><div className="renewal"><span>Next renewal</span><strong>{new Date(renewal).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</strong></div><button className="cancel" onClick={() => setCancelled(true)} disabled={cancelled}>{cancelled ? "Cancellation scheduled" : "Cancel subscription"}</button></section>
    <section className="billing"><div><span className="eyebrow">BILLING</span><h2>Payment history</h2></div>{invoices.map((invoice) => <div className="invoice" key={invoice.id}><span><strong>{invoice.id}</strong><small>{invoice.date}</small></span><strong>{invoice.amount}</strong><span className="status">{invoice.status}</span><button type="button">Download invoice</button></div>)}</section>
  </main>;
}
