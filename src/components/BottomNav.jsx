import { NavLink } from "react-router-dom";
import "./BottomNav.css";
import { useLanguage } from "../hooks/useLanguage";

function BottomNav() {
  const { t } = useLanguage();
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <NavLink to="/" end><span aria-hidden="true" className="bottom-nav__icon">⌂</span><span>{t("home")}</span></NavLink>
      <NavLink to="/catalog"><span aria-hidden="true" className="bottom-nav__icon">☷</span><span>{t("catalog")}</span></NavLink>
      <NavLink to="/library"><span aria-hidden="true" className="bottom-nav__icon">♡</span><span>{t("bookmarks")}</span></NavLink>
      <NavLink to="/beta"><span aria-hidden="true" className="bottom-nav__icon">◉</span><span>{t("beta")}</span></NavLink>
    </nav>
  );
}

export default BottomNav;
