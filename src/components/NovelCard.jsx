import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./NovelCard.css";

function NovelCard({
  id,
  title,
  author,
  rating,
  chapters,
  description,
  image,
}) {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    checkLibrary();
  }, []);

  async function checkLibrary() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user);

    if (!user) return;

    const { data } = await supabase
      .from("library")
      .select("id")
      .eq("user_id", user.id)
      .eq("novel_id", id)
      .maybeSingle();

    if (data) {
      setSaved(true);
    }
  }

  async function toggleLibrary() {
    if (!user) {
      navigate("/login");
      return;
    }

    if (saved) {
      await supabase
        .from("library")
        .delete()
        .eq("user_id", user.id)
        .eq("novel_id", id);
        const { data } = await supabase
  .from("novels")
  .select("bookmarks")
  .eq("id", id)
  .single();

await supabase
  .from("novels")
  .update({
    bookmarks: Math.max((data.bookmarks || 1) - 1, 0),
  })
  .eq("id", id);

      setSaved(false);
    } else {
      await supabase
        .from("library")
        .insert({
          user_id: user.id,
          novel_id: id,
        });
        const { data } = await supabase
  .from("novels")
  .select("bookmarks")
  .eq("id", id)
  .single();

await supabase
  .from("novels")
  .update({
    bookmarks: (data.bookmarks || 0) + 1,
  })
  .eq("id", id);

      setSaved(true);
    }
  }

  return (
    <div className="novel-card">
      <img
        className="novel-cover"
        src={image}
        alt={title}
      />

      <div className="novel-info">
        <h2>{title}</h2>

        <p className="author">
          ✍️ {author}
        </p>

        <p className="rating">
          ⭐ {rating}
        </p>

        <p className="chapters">
          📖 {chapters} глав
        </p>

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
          >
            {saved ? "💖" : "🤍"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NovelCard;