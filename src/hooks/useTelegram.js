import { useContext, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TelegramContext } from "../contexts/TelegramContextValue";
import { configureTelegramBackButton, configureTelegramMainButton } from "../lib/telegram";

export function useTelegram() {
  return useContext(TelegramContext);
}

export function useTelegramBackButton(enabled = true, fallbackPath = "/") {
  const navigate = useNavigate();
  const location = useLocation();
  const { isTelegram } = useTelegram();

  useEffect(() => {
    if (!isTelegram || !enabled || location.pathname === "/") return undefined;
    return configureTelegramBackButton(() => {
      if (window.history.length > 1) navigate(-1);
      else navigate(fallbackPath);
    });
  }, [enabled, fallbackPath, isTelegram, location.pathname, navigate]);
}

export function useTelegramMainButton(options) {
  const { isTelegram } = useTelegram();
  useEffect(() => {
    if (!isTelegram || !options?.text) return undefined;
    return configureTelegramMainButton(options);
  }, [isTelegram, options]);
}
