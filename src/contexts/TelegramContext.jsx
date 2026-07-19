import { useEffect, useMemo, useState } from "react";
import { getTelegramInitData, getTelegramLocalUser, getTelegramUser, initTelegramMiniApp, isTelegramMiniApp } from "../lib/telegram";
import { TelegramContext } from "./TelegramContextValue";

export function TelegramProvider({ children }) {
  const [webApp, setWebApp] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    initTelegramMiniApp().then((app) => {
      if (!active) return;
      setWebApp(app);
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    isTelegram: isTelegramMiniApp(),
    webApp,
    user: getTelegramUser(),
    localUser: getTelegramLocalUser(),
    initData: getTelegramInitData(),
    ready,
  }), [webApp, ready]);

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}
