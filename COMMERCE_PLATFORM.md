# NovelVerse Commerce Platform v1

## Architecture

Commerce uses deterministic domain services in `src/lib/commerce.js`, Supabase persistence, and the protected subscription administration route. Payment secrets are referenced by name and remain in a server-side vault. Provider webhooks must verify signatures and idempotently update payments and subscriptions; clients never grant entitlements.

## Billing and payments

Stripe, Google Play Billing, Apple IAP, Telegram Stars, and optional PayPal share a provider configuration model. Billing covers monthly, quarterly, yearly, and non-renewing lifetime access. Failed payments enter `past_due`, receive a configurable grace period, and create retry attempts. Production adapters and webhook secrets must be supplied per deployment.

## Growth, analytics, and reports

Promotion rules cover promo/gift/referral codes, seasonal and regional campaigns, first-purchase offers, fixed or percentage discounts, and campaign windows. Referrals reward both parties; gifts bind a plan to a recipient. Ad selection enforces plan, placement, schedule, and frequency caps. Analytics cover revenue, subscribers, churn, trial conversion, listening, content, region, and device. Reports expose daily through yearly periods and CSV, Excel, and PDF rendering contracts.

## Fraud protection and limitations

Risk rules flag concurrent account use, geographically abnormal logins, excessive device churn, and repeated trial abuse. Signals are persisted for review. Provider SDK adapters, signed webhook endpoints, tax remittance, Excel/PDF binary renderers, automated suspension, and an appeal workflow remain deployment integrations rather than browser responsibilities.
