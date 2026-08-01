import { NavLink, useLocation } from "react-router-dom";
import "../styles/NovelVerseStudio.css";

const sections = [
  ["Dashboard", ""],
  ["Books", "books"],
  ["Audio Production", "audio-production"],
  ["Voice Director", "voice-director"],
  ["Uploads", "uploads"],
  ["Publishing", "publishing"],
  ["Settings", "settings"],
];

function NovelVerseStudio() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\/admin\/studio\/?/, "").split("/")[0];
  const activeSection = sections.find(([, path]) => path === slug) || sections[0];

  return (
    <main className="studio-shell">
      <aside className="studio-sidebar">
        <h1>NovelVerse Studio</h1>
        <nav aria-label="Studio navigation">
          {sections.map(([label, path]) => (
            <NavLink key={label} end={!path} to={`/admin/studio${path ? `/${path}` : ""}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="studio-content">
        <h2>{activeSection[0]}</h2>
        <p>This section is coming soon.</p>
      </section>
    </main>
  );
}

export default NovelVerseStudio;
