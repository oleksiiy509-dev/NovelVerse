# NovelVerse Production Deployment

NovelVerse is a Vite React single-page app (SPA) with Supabase and Telegram Mini App support. This guide keeps release 1.0 deployment-focused and does not require service-role keys or server-side secrets in the frontend.

## A. Vercel

1. Import the GitHub repository into Vercel.
2. Select the **Vite** framework preset.
3. Use these build settings:
   - **Install command:** `npm install` (or Vercel default)
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Add the required Environment Variables in the Vercel project settings:
   - `VITE_SUPABASE_URL` — your Supabase project URL, for example `https://your-project-ref.supabase.co`.
   - `VITE_SUPABASE_ANON_KEY` — the public Supabase anon/publishable frontend key only.
   - `VITE_ADMIN_EMAILS` — comma-separated admin email allowlist used by the frontend convenience check.
5. Optional public Telegram variable:
   - `VITE_TELEGRAM_BOT_USERNAME` — bot username without `@`; used only for browser fallback login links outside Telegram.
6. Do **not** add `service_role`, `SUPABASE_SERVICE`, private keys, bot tokens, or passwords to Vercel frontend variables.
7. Deploy the project.
8. Redeploy after changing environment variables because Vite embeds `VITE_` variables at build time.

### Vercel routing behavior

`vercel.json` rewrites application routes to `/index.html` so direct refreshes work for routes such as `/catalog`, `/novel/:id`, `/reader/:id`, `/profile`, `/downloads`, and `/admin`. Static assets under `/assets/` and public files such as `/favicon.svg`, `/icons.svg`, and `/manifest.webmanifest` remain served as files.

## B. Supabase

1. In **Authentication → URL Configuration**, set **Site URL** to the production Vercel domain, for example `https://novelverse.example.vercel.app`.
2. Add allowed redirect URLs for every production domain you use:
   - `https://novelverse.example.vercel.app/*`
   - `https://your-custom-domain.example/*` if a custom domain is connected.
   - Add Vercel preview URLs only if you intentionally test auth on previews.
3. Verify email/password sign-in, sign-up, and admin login from the deployed domain.
4. Verify public Storage URLs for the `covers` bucket load from the deployed app.
5. Keep Row Level Security enabled. Do not weaken RLS policies for deployment; admin writes must remain protected by Supabase Auth and database policies.
6. Frontend Telegram profile data is not verified authentication. Treat Telegram `initDataUnsafe` as display/profile convenience only unless a trusted backend validates `initData` with the bot token.

## C. Telegram BotFather

1. Open BotFather in Telegram and create or select the NovelVerse bot.
2. Set the bot menu button to open the NovelVerse Web App.
3. Set the Web App URL to the production HTTPS Vercel or custom domain.
4. Configure the Mini App/domain in BotFather if Telegram prompts for domain setup.
5. Open the Mini App from Telegram on Android and iOS.
6. Test that the app calls Telegram readiness, expands the viewport, applies Telegram theme colors, and preserves browser fallback outside Telegram.
7. Navigate through Home, Catalog, Novel, Reader, Downloads, Profile, and Admin routes.
8. Test BackButton behavior, MainButton cleanup on route changes, and theme switching.

### Telegram layout notes

- The app uses safe-area variables and Telegram viewport data so the bottom navigation, reader controls, and audiobook controls stay above device insets and Telegram keyboard changes.
- Android Telegram WebView should respect viewport and keyboard resize events.
- iOS Telegram WebView safe-area and keyboard reporting can be less consistent; verify bottom controls manually on real iOS devices, especially with the keyboard open in login/admin forms.

## D. Post-deployment verification checklist

- [ ] Home loads.
- [ ] Catalog loads and filters/search work.
- [ ] Novel direct links load and refresh correctly.
- [ ] Reader direct links load and refresh correctly.
- [ ] Library loads.
- [ ] Profile loads.
- [ ] Downloads page loads.
- [ ] Admin login works on the deployed domain.
- [ ] Admin dashboard and forms fit narrow screens.
- [ ] Offline reading works after downloading chapters.
- [ ] Audiobook controls remain visible and usable.
- [ ] Telegram Mini App opens from the bot menu button.
- [ ] Telegram BackButton works and cleans up after navigation.
- [ ] Telegram theme colors apply.
- [ ] Direct URL refresh works on all routes.
- [ ] Mobile layout works on Android Telegram WebView.
- [ ] iOS Telegram WebView is manually checked for safe-area and keyboard limitations.
- [ ] Failed Supabase/network requests show loading, empty, toast, or error recovery states instead of blank screens.

## Missing production assets to consider

- PNG PWA icons such as 192×192 and 512×512 are not present in the repository.
- A dedicated Telegram Mini App share/preview image is not present in the repository.
- The manifest currently references the existing SVG favicon rather than newly invented image assets.
