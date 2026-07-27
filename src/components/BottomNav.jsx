import { NavLink } from "react-router-dom";
import "./BottomNav.css";
import { useLanguage } from "../contexts/LanguageContext";

function BottomNav() {
  const { t } = useLanguage();
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <NavLink to="/" end>⌂<span>{t("home")}</span></NavLink>
      <NavLink to="/catalog">☷<span>{t("catalog")}</span></NavLink>
      <NavLink to="/library">♡<span>{t("bookmarks")}</span></NavLink>
      <NavLink to="/beta">◉<span>{t("beta")}</span></NavLink>
    </nav>
  );
}

export default BottomNav;
