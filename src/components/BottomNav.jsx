import { NavLink } from "react-router-dom";
import "./BottomNav.css";

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <NavLink to="/" end>⌂<span>Home</span></NavLink>
      <NavLink to="/catalog">☷<span>Catalog</span></NavLink>
      <NavLink to="/library">♡<span>Bookmarks</span></NavLink>
    </nav>
  );
}

export default BottomNav;
