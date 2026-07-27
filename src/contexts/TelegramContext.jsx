import { useEffect, useMemo, useState } from "react";
import { getTelegramInitData, getTelegramLocalUser, getTelegramProfileFields, getTelegramUser, initTelegramMiniApp, isTelegramMiniApp } from "../lib/telegram";
import { TelegramContext } from "./TelegramContextValue";

export function TelegramProvider({ children }) {
  const [webApp, setWebApp] = useState(null);
  const [ready, setReady] = useState(false);
  const [initializationError, setInitializationError] = useState(null);

  useEffect(() => {
    let active = true;
    initTelegramMiniApp()
      .then((app) => {
        if (active) setWebApp(app);
      })
      .catch((error) => {
        if (active) setInitializationError(error);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    isTelegram: isTelegramMiniApp(),
    webApp,
    user: getTelegramUser(),
    localUser: getTelegramLocalUser(),
    profileFields: getTelegramProfileFields(),
    initData: getTelegramInitData(),
    ready,
    initializationError,
    verifiedAuthentication: false,
  }), [webApp, ready, initializationError]);

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}
