import { NavLink, useLocation } from "react-router-dom";
import AudioProductionDashboard from "../components/AudioProductionDashboard.jsx";
import BookImport from "../components/BookImport.jsx";
import StudioBooks from "../components/StudioBooks.jsx";
import VoiceDirector from "../components/VoiceDirector.jsx";
import "../styles/NovelVerseStudio.css";

const sections = [
  ["Dashboard", ""],
  ["Books", "books"],
  ["Import Book", "import-book"],
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
            <NavLink key={label} end={!path} title={label} to={`/admin/studio${path ? `/${path}` : ""}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="studio-content">
        {slug === "books" ? <StudioBooks /> : slug === "audio-production" ? <AudioProductionDashboard /> : slug === "import-book" ? <BookImport /> : slug === "voice-director" ? <VoiceDirector /> : <><h2>{activeSection[0]}</h2><p>This section is coming soon.</p></>}
      </section>
    </main>
  );
}

export default NovelVerseStudio;
