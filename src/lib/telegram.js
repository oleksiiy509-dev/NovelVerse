const THEME_MAP = {
  bg_color: "--tg-bg",
  secondary_bg_color: "--tg-secondary-bg",
  text_color: "--tg-text",
  hint_color: "--tg-hint",
  link_color: "--tg-link",
  button_color: "--tg-button",
  button_text_color: "--tg-button-text",
};

let sdkModulePromise;
let cachedApp;
let backButtonHandler;
let mainButtonHandler;
let viewportCleanup;
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "";

function getTelegramApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

function getViewportHeight() {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height || window.innerHeight || 0;
}

function setPxProperty(name, value) {
  const number = Number(value) || 0;
  document.documentElement.style.setProperty(name, `${Math.max(0, number)}px`);
}

function setClass(name, enabled) {
  document.documentElement.classList.toggle(name, Boolean(enabled));
}

export function applyTheme(webApp = getTelegramApp()) {
  if (typeof document === "undefined") return;
  const params = webApp?.themeParams || {};
  Object.entries(THEME_MAP).forEach(([key, cssVar]) => {
    if (params[key]) document.documentElement.style.setProperty(cssVar, params[key]);
  });
  document.documentElement.dataset.telegramColorScheme = webApp?.colorScheme || "";
  setClass("telegram-theme-light", webApp?.colorScheme === "light");
  setClass("telegram-theme-dark", webApp?.colorScheme === "dark");
}

export function applyViewport(webApp = getTelegramApp()) {
  if (typeof document === "undefined") return;
  const viewportHeight = webApp?.viewportHeight || getViewportHeight();
  const stableHeight = webApp?.viewportStableHeight || window.innerHeight || viewportHeight;
  const safeArea = webApp?.safeAreaInset || {};
  const contentSafeArea = webApp?.contentSafeAreaInset || {};
  setPxProperty("--tg-viewport-height", viewportHeight);
  setPxProperty("--tg-viewport-stable-height", stableHeight);
  setPxProperty("--tg-keyboard-height", Math.max(0, stableHeight - viewportHeight));
  setPxProperty("--tg-safe-area-inset-top", safeArea.top ?? contentSafeArea.top ?? 0);
  setPxProperty("--tg-safe-area-inset-right", safeArea.right ?? contentSafeArea.right ?? 0);
  setPxProperty("--tg-safe-area-inset-bottom", safeArea.bottom ?? contentSafeArea.bottom ?? 0);
  setPxProperty("--tg-safe-area-inset-left", safeArea.left ?? contentSafeArea.left ?? 0);
  setClass("telegram-keyboard-open", stableHeight - viewportHeight > 120);
}

export function isTelegramMiniApp() {
  const webApp = getTelegramApp();
  if (typeof navigator === "undefined") return false;
  return Boolean(webApp && (webApp.initData || webApp.initDataUnsafe?.user || /Telegram/i.test(navigator.userAgent)));
}

export async function loadTelegramSdk() {
  if (!sdkModulePromise) sdkModulePromise = import(/* @vite-ignore */ "@telegram-apps/sdk").catch((error) => {
    console.warn("Telegram SDK could not be loaded; falling back to window.Telegram.WebApp", error);
    return null;
  });
  return sdkModulePromise;
}

function bindViewportListeners(webApp) {
  if (viewportCleanup) viewportCleanup();
  const refresh = () => applyViewport(webApp);
  const onFocusIn = () => setClass("telegram-input-focused", true);
  const onFocusOut = () => setClass("telegram-input-focused", false);
  webApp?.onEvent?.("viewportChanged", refresh);
  window.addEventListener("resize", refresh);
  window.visualViewport?.addEventListener("resize", refresh);
  window.visualViewport?.addEventListener("scroll", refresh);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  viewportCleanup = () => {
    webApp?.offEvent?.("viewportChanged", refresh);
    window.removeEventListener("resize", refresh);
    window.visualViewport?.removeEventListener("resize", refresh);
    window.visualViewport?.removeEventListener("scroll", refresh);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
  };
}

export async function initTelegramMiniApp() {
  if (typeof document === "undefined") return null;
  const webApp = getTelegramApp();
  applyViewport(webApp);
  if (!webApp) {
    document.body.classList.add("browser-webapp");
    return null;
  }
  if (cachedApp) return cachedApp;
  await loadTelegramSdk();
  webApp.ready?.();
  webApp.expand?.();
  webApp.enableClosingConfirmation?.();
  document.body.classList.add("telegram-webapp");
  document.body.classList.remove("browser-webapp");
  applyTheme(webApp);
  applyViewport(webApp);
  webApp.onEvent?.("themeChanged", () => applyTheme(webApp));
  bindViewportListeners(webApp);
  cachedApp = webApp;
  return webApp;
}

export function getTelegramUser() {
  return getTelegramApp()?.initDataUnsafe?.user || null;
}

export function getTelegramInitData() {
  return getTelegramApp()?.initData || "";
}

export function getTelegramDisplayName(user = getTelegramUser()) {
  if (!user) return "Telegram Reader";
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Telegram Reader";
}

export function getTelegramAvatarUrl(user = getTelegramUser()) {
  return user?.photo_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(getTelegramDisplayName(user))}`;
}

export function getTelegramProfileFields(user = getTelegramUser()) {
  if (!user?.id) return null;
  return {
    telegram_id: String(user.id),
    username: user.username || getTelegramDisplayName(user),
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    language_code: user.language_code || "",
    photo_url: user.photo_url || "",
  };
}

export function getTelegramLocalUser(user = getTelegramUser()) {
  const fields = getTelegramProfileFields(user);
  if (!fields) return null;
  return {
    id: `telegram:${fields.telegram_id}`,
    email: user.username ? `${user.username}@telegram.local` : `telegram-${fields.telegram_id}@telegram.local`,
    app_metadata: { provider: "telegram", verified_auth: false },
    user_metadata: {
      provider: "telegram",
      ...fields,
      avatar_url: getTelegramAvatarUrl(user),
    },
  };
}

export async function syncTelegramDisplayProfile(supabase, authUser) {
  const fields = getTelegramProfileFields();
  if (!fields || !authUser?.id) return { synced: false, reason: "missing-telegram-user" };
  const profilePayload = { id: authUser.id, ...fields, avatar_url: fields.photo_url };
  localStorage.setItem(`novelverse:${authUser.id}:telegramProfile`, JSON.stringify(profilePayload));
  if (authUser.id.startsWith("telegram:")) return { synced: true, localOnly: true };
  const { error } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
  return { synced: !error, error };
}

export function openTelegramLogin(botUsername = BOT_USERNAME) {
  const webApp = getTelegramApp();
  if (webApp?.initDataUnsafe?.user) return true;
  if (!botUsername) return false;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const loginUrl = `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(botUsername)}&origin=${encodeURIComponent(origin)}&request_access=write`;
  webApp?.openTelegramLink?.(loginUrl) || window.open(loginUrl, "_blank", "noopener,noreferrer");
  return true;
}

export function configureTelegramBackButton(onClick) {
  const backButton = getTelegramApp()?.BackButton;
  if (!backButton) return () => {};
  if (backButtonHandler) backButton.offClick?.(backButtonHandler);
  backButtonHandler = onClick;
  backButton.onClick?.(onClick);
  backButton.show?.();
  return () => {
    backButton.offClick?.(onClick);
    backButton.hide?.();
    if (backButtonHandler === onClick) backButtonHandler = null;
  };
}

export function configureTelegramMainButton(options = {}) {
  const mainButton = getTelegramApp()?.MainButton;
  if (!mainButton) return () => {};
  if (mainButtonHandler) mainButton.offClick?.(mainButtonHandler);
  mainButtonHandler = options.onClick;
  mainButton.setText?.(options.text || "Continue");
  if (options.color) mainButton.setParams?.({ color: options.color });
  if (options.textColor) mainButton.setParams?.({ text_color: options.textColor });
  if (options.disabled) mainButton.disable?.(); else mainButton.enable?.();
  if (options.onClick) mainButton.onClick?.(options.onClick);
  if (options.visible === false) mainButton.hide?.(); else mainButton.show?.();
  return () => {
    if (options.onClick) mainButton.offClick?.(options.onClick);
    mainButton.hide?.();
    if (mainButtonHandler === options.onClick) mainButtonHandler = null;
  };
}

export function shareToTelegram({ title, text, url = window.location.href }) {
  const shareText = [title, text].filter(Boolean).join(" — ");
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;
  const webApp = getTelegramApp();
  if (webApp?.openTelegramLink) webApp.openTelegramLink(shareUrl);
  else window.open(shareUrl, "_blank", "noopener,noreferrer");
}

export const telegramTheme = { applyTheme, applyViewport };

function cloudStorage() {
  return getTelegramApp()?.CloudStorage || null;
}

export function telegramCloudStorageAvailable() {
  return Boolean(cloudStorage());
}

export function telegramCloudGetItem(key) {
  const storage = cloudStorage();
  if (!storage) return Promise.resolve(null);
  return new Promise((resolve) => {
    storage.getItem(key, (error, value) => resolve(error ? null : value || null));
  });
}

export function telegramCloudSetItem(key, value) {
  const storage = cloudStorage();
  if (!storage) return Promise.resolve(false);
  return new Promise((resolve) => {
    storage.setItem(key, value, (error) => resolve(!error));
  });
}

export function telegramCloudRemoveItem(key) {
  const storage = cloudStorage();
  if (!storage) return Promise.resolve(false);
  return new Promise((resolve) => {
    storage.removeItem(key, (error) => resolve(!error));
  });
}
