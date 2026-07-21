import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import defaultCover from "../assets/default-cover.svg";
import "./NovelCard.css";

function NovelCard({
  id,
  title,
  author,
  rating,
  chapters,
  views = 0,
  description,
  image,
  status,
  genres,
}) {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function checkLibrary() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (ignore) return;

      setUser(user);
      setSaved(false);

      if (!user) return;

      const { data } = await supabase
        .from("library")
        .select("id")
        .eq("user_id", user.id)
        .eq("novel_id", id)
        .maybeSingle();

      if (!ignore) setSaved(!!data);
    }

    checkLibrary();

    return () => {
      ignore = true;
    };
  }, [id]);

  async function toggleLibrary() {
    if (saving) return;
    if (!user) {
      navigate("/login");
      return;
    }

    setSaving(true);

    try {
      const { data } = await supabase
        .from("novels")
        .select("bookmarks")
        .eq("id", id)
        .single();

      if (saved) {
        await supabase
          .from("library")
          .delete()
          .eq("user_id", user.id)
          .eq("novel_id", id);

        await supabase
          .from("novels")
          .update({ bookmarks: Math.max((data?.bookmarks || 1) - 1, 0) })
          .eq("id", id);

        setSaved(false);
      } else {
        await supabase
          .from("library")
          .insert({ user_id: user.id, novel_id: id });

        await supabase
          .from("novels")
          .update({ bookmarks: (data?.bookmarks || 0) + 1 })
          .eq("id", id);

        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  const coverSrc = image?.trim ? image.trim() : image;
  const genreList = (genres || "").split(",").map((genre) => genre.trim()).filter(Boolean).slice(0, 4);

  return (
    <div className="novel-card">
      <div className="novel-cover-wrap">
        <img
          className="novel-cover"
          src={coverSrc || defaultCover}
          alt={title}
          loading="lazy"
          onError={(event) => { event.currentTarget.src = defaultCover; }}
        />
      </div>

      <div className="novel-info">
        <h2>{title}</h2>

        <p className="author">✍️ {author}</p>

        <div className="novel-meta" aria-label="Статистика новели">
          <span>⭐ {rating || "—"}</span>
          <span>👁 {Number(views || 0).toLocaleString("uk-UA")}</span>
          <span>📖 {Number(chapters || 0).toLocaleString("uk-UA")} глав</span>
          {status && <span className="novel-status">{status}</span>}
        </div>

        {genreList.length > 0 && <div className="novel-genres" aria-label="Жанри новели">{genreList.map((genre) => <span key={genre}>{genre}</span>)}</div>}

        <p className="description">
          {description}
        </p>

        <div className="buttons">
          <button
            className="read-btn"
            onClick={() => navigate(`/novel/${id}`)}
          >
            📖 Читати
          </button>

          <button
            className="fav-btn"
            onClick={toggleLibrary}
            disabled={saving}
            aria-label={saved ? "Видалити з бібліотеки" : "Додати до бібліотеки"}
            aria-pressed={saved}
          >
            {saved ? "💖" : "🤍"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NovelCard;