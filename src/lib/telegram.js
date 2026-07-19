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

function getTelegramApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

function setPxProperty(name, value) {
  const number = Number(value) || 0;
  document.documentElement.style.setProperty(name, `${Math.max(0, number)}px`);
}

function applyTheme(webApp = getTelegramApp()) {
  if (typeof document === "undefined") return;
  const params = webApp?.themeParams || {};
  Object.entries(THEME_MAP).forEach(([key, cssVar]) => {
    if (params[key]) document.documentElement.style.setProperty(cssVar, params[key]);
  });
  document.documentElement.dataset.telegramColorScheme = webApp?.colorScheme || "";
  document.documentElement.classList.toggle("telegram-theme-light", webApp?.colorScheme === "light");
  document.documentElement.classList.toggle("telegram-theme-dark", webApp?.colorScheme === "dark");
}

function applyViewport(webApp = getTelegramApp()) {
  if (typeof document === "undefined") return;
  setPxProperty("--tg-viewport-height", webApp?.viewportHeight || window.innerHeight);
  setPxProperty("--tg-viewport-stable-height", webApp?.viewportStableHeight || window.innerHeight);
  const safeArea = webApp?.safeAreaInset || {};
  const contentSafeArea = webApp?.contentSafeAreaInset || {};
  setPxProperty("--tg-safe-area-inset-top", safeArea.top || contentSafeArea.top);
  setPxProperty("--tg-safe-area-inset-right", safeArea.right || contentSafeArea.right);
  setPxProperty("--tg-safe-area-inset-bottom", safeArea.bottom || contentSafeArea.bottom);
  setPxProperty("--tg-safe-area-inset-left", safeArea.left || contentSafeArea.left);
}

export function isTelegramMiniApp() {
  const webApp = getTelegramApp();
  return Boolean(webApp && (webApp.initData || webApp.initDataUnsafe?.user || /Telegram/i.test(navigator.userAgent)));
}

export async function loadTelegramSdk() {
  if (!sdkModulePromise) sdkModulePromise = import(/* @vite-ignore */ "@telegram-apps/sdk").catch((error) => {
    console.warn("Telegram SDK could not be loaded", error);
    return null;
  });
  return sdkModulePromise;
}

export async function initTelegramMiniApp() {
  if (cachedApp) return cachedApp;
  const webApp = getTelegramApp();
  if (!webApp) return null;
  await loadTelegramSdk();
  webApp.ready?.();
  webApp.expand?.();
  webApp.enableClosingConfirmation?.();
  document.body.classList.add("telegram-webapp");
  applyTheme(webApp);
  applyViewport(webApp);
  webApp.onEvent?.("themeChanged", () => applyTheme(webApp));
  webApp.onEvent?.("viewportChanged", () => applyViewport(webApp));
  cachedApp = webApp;
  return webApp;
}

export function getTelegramUser() {
  return getTelegramApp()?.initDataUnsafe?.user || null;
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
