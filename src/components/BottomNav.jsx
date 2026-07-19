import { NavLink } from "react-router-dom";
import "./BottomNav.css";
function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/">🏠<br />Головна</NavLink>
      <NavLink to="/library">📚<br />Бібліотека</NavLink>
      <NavLink to="/reader">📖<br />Читати</NavLink>
      <NavLink to="/profile">👤<br />Профіль</NavLink>
    </nav>
  );
}

export default BottomNav;