import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import defaultCover from "../assets/default-cover.svg";
import "./Library.css";

function Library() {
  const navigate = useNavigate();

  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadLibrary() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      const { data, error } = await supabase
        .from("library")
        .select(`
        id,
        novels (
          id,
          title,
          author,
          image,
          rating,
          chapters,
          views
        )
      `)
        .eq("user_id", user.id);

      if (ignore) return;

      if (error) {
        console.error("Library load failed.", error);
        setLoading(false);
        return;
      }

      setNovels(data || []);
      setLoading(false);
    }

    loadLibrary();

    return () => {
      ignore = true;
    };
  }, [navigate]);

  async function removeFromLibrary(id) {
    const { error } = await supabase
      .from("library")
      .delete()
      .eq("id", id);

    if (!error) {
      setNovels((items) => items.filter((item) => item.id !== id));
    }
  }

  if (loading) {
    return <div className="library page-shell"><div className="loading-state">Завантаження...</div></div>;
  }

  return (
    <main className="library page-shell">
      <header className="library__header">
        <h1>📚 Моя бібліотека</h1>
        <p>Збережені новели з швидким доступом до читання.</p>
        <button className="library__downloads-link" onClick={() => navigate("/downloads")}>⬇️ Завантаження</button>
      </header>

      {novels.length === 0 ? (
        <div className="empty-state">У бібліотеці поки немає новел.</div>
      ) : (
        <section className="library__grid" aria-label="Збережені новели">
          {novels.map((item) => {
            const novel = item.novels || {};
            const coverSrc = novel.image?.trim ? novel.image.trim() : novel.image;

            return (
              <article className="library-card" key={item.id}>
                <img
                  src={coverSrc || defaultCover}
                  alt={novel.title || "NovelVerse"}
                  loading="lazy"
                  onError={(event) => { event.currentTarget.src = defaultCover; }}
                />

                <div>
                  <h3>{novel.title}</h3>
                  <p>✍️ {novel.author}</p>
                  <div className="library-card__meta">
                    <span>⭐ {novel.rating || "—"}</span>
                    <span>👁 {Number(novel.views || 0).toLocaleString("uk-UA")}</span>
                    <span>📖 {Number(novel.chapters || 0).toLocaleString("uk-UA")} глав</span>
                  </div>
                </div>

                <div className="library-card__actions">
                  <button onClick={() => navigate(`/novel/${novel.id}`)}>📖 Відкрити</button>
                  <button onClick={() => removeFromLibrary(item.id)}>🗑 Видалити</button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

export default Library;