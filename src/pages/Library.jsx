import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import defaultCover from "../assets/default-cover.svg";
import "./Library.css";

function Library() {
  const navigate = useNavigate();

  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        setError("Не вдалося завантажити бібліотеку. Перевірте з’єднання та спробуйте ще раз.");
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
    return <main className="library page-shell" aria-busy="true"><span className="sr-only">Завантаження бібліотеки</span><div className="library__loading" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="skeleton library__skeleton" key={index} />)}</div></main>;
  }

  return (
    <main className="library page-shell">
      <header className="library__header">
        <h1>📚 Моя бібліотека</h1>
        <p>Збережені новели з швидким доступом до читання.</p>
        <button className="library__downloads-link" onClick={() => navigate("/downloads")}>⬇️ Завантаження</button>
      </header>

      {error ? (
        <section className="error-state" role="alert"><h2>Бібліотека недоступна</h2><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Спробувати знову</button></section>
      ) : novels.length === 0 ? (
        <section className="empty-state"><div className="empty-state__icon" aria-hidden="true">📚</div><h2>Створіть свою бібліотеку</h2><p>Зберігайте новели, щоб швидко повертатися до читання.</p><button type="button" onClick={() => navigate("/catalog")}>Переглянути каталог</button></section>
      ) : (
        <section className="library__grid" aria-label="Збережені новели">
          {novels.map((item) => {
            const novel = item.novels || {};
            const coverSrc = novel.image?.trim ? novel.image.trim() : novel.image;

            return (
              <article className="library-card" key={item.id}>
                <img
                  src={coverSrc || defaultCover}
                  alt={`Обкладинка «${novel.title || "NovelVerse"}»`}
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
                  <button aria-label={`Видалити «${novel.title}» з бібліотеки`} onClick={() => removeFromLibrary(item.id)}>🗑 Видалити</button>
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
