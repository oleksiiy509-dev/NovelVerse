import { NavLink, useLocation } from "react-router-dom";
import "./BottomNav.css";

function BottomNav() {
  const location = useLocation();
  const catalogActive = location.pathname === "/" && location.hash === "#catalog";
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <NavLink to="/" end>⌂<span>Home</span></NavLink>
      <NavLink to="/#catalog" className={catalogActive ? "active" : undefined}>☷<span>Catalog</span></NavLink>
      <NavLink to="/library">♡<span>Bookmarks</span></NavLink>
    </nav>
  );
}

export default BottomNav;
