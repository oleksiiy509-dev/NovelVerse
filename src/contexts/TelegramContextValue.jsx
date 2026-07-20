import { createContext } from "react";

export const TelegramContext = createContext({
  isTelegram: false,
  webApp: null,
  user: null,
  localUser: null,
  initData: "",
  ready: false,
  verifiedAuthentication: false,
});
