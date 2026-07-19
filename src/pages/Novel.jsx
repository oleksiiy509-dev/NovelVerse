import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCurrentUser, readList, writeList, userKey } from "../lib/userFeatures";
import { shareToTelegram } from "../lib/telegram";
import { useTelegramMainButton } from "../hooks/useTelegram";
import defaultCover from "../assets/default-cover.svg";
import "../styles/Novel.css";


function splitPills(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function chapterRanges(chapters) {
  const groups = [];
  for (let i = 0; i < chapters.length; i += 10) {
    const chunk = chapters.slice(i, i + 10);
    groups.push({ label: `${chunk[0].number}–${chunk[chunk.length - 1].number}`, chapters: chunk });
  }
  return groups;
}

function Novel() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  const [novel, setNovel] = useState(null);

  const [chapters, setChapters] = useState([]);

  const [readChapters, setReadChapters] = useState([]);

  const [saved, setSaved] = useState(false);

  const [comments, setComments] = useState([]);

  const [comment, setComment] = useState("");

  const [sending, setSending] = useState(false);

  const [rating, setRating] = useState(5);

  const [averageRating, setAverageRating] = useState(0);

  const [ratingCount, setRatingCount] = useState(0);

  useTelegramMainButton(novel ? {
    text: "Read novel",
    onClick: () => {
      const last = localStorage.getItem(`lastChapter_${id}`);
      if (last) navigate(`/reader/${last}`);
      else if (chapters.length > 0) navigate(`/reader/${chapters[0].id}`);
    },
    disabled: !chapters.length,
  } : null);

  useEffect(() => {
    init();
  }, [id]);

  async function init() {
    const user = await getCurrentUser(supabase);

    setUser(user);

    const read = JSON.parse(
      localStorage.getItem(`readChapters_${id}`) || "[]"
    );

    setReadChapters(read);

    await loadNovel();

    if (user) {
      await checkLibrary(user);
    }

    await loadChapters();

    await loadComments();
  }

 async function loadNovel() {
  const { data, error } = await supabase
    .from("novels")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  const newViews = (data.views || 0) + 1;

  await supabase
    .from("novels")
    .update({
      views: newViews,
    })
    .eq("id", id);

  setNovel({
    ...data,
    views: newViews,
  });
}

async function loadChapters() {
  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("novel_id", id)
    .order("number", {
      ascending: true,
    });

  if (error) {
    console.error(error);
    return;
  }

  setChapters(data || []);
}

async function loadComments() {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("novel_id", id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(error);
    return;
  }

  const list = data || [];
  setComments(list);

  if (list.length > 0) {
    const total = list.reduce(
      (sum, item) => sum + Number(item.rating || 0),
      0
    );

    setAverageRating(total / list.length);
    setRatingCount(list.length);
  } else {
    setAverageRating(0);
    setRatingCount(0);
  }
}

  async function checkLibrary(currentUser) {
  if (currentUser?.app_metadata?.provider === "telegram") {
    setSaved(readList(userKey(currentUser.id, "library")).some((item) => item.novel_id === id));
    return;
  }
  const { data, error } = await supabase
    .from("library")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("novel_id", id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  setSaved(!!data);
}

async function addToLibrary() {
  if (!user) {
    navigate("/login");
    return;
  }

  if (saved) {
    alert("Новела вже у бібліотеці.");
    return;
  }

  if (user.app_metadata?.provider === "telegram") {
    const key = userKey(user.id, "library");
    writeList(key, [{ novel_id: id, saved_at: new Date().toISOString() }, ...readList(key).filter((item) => item.novel_id !== id)]);
    setSaved(true);
    return;
  }

  const { error } = await supabase
    .from("library")
    .insert({
      user_id: user.id,
      novel_id: id,
    });

  if (error) {
    alert(error.message);
    return;
  }

  const bookmarks = (novel.bookmarks || 0) + 1;

  await supabase
    .from("novels")
    .update({
      bookmarks,
    })
    .eq("id", id);

  setNovel({
    ...novel,
    bookmarks,
  });

  setSaved(true);
}

function shareNovel() {
  shareToTelegram({ title: novel.title, text: `Читайте ${novel.title} у NovelVerse`, url: window.location.href });
}

async function deleteComment(commentId) {
  if (!user) return;

  const ok = window.confirm("Видалити коментар?");

  if (!ok) return;

  const { error: deleteError } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", user.id);

  if (deleteError) {
    alert(deleteError.message);
    return;
  }

  await loadComments();
}

async function sendComment() {
  if (!user) {
    navigate("/login");
    return;
  }

  if (!comment.trim()) {
    alert("Напишіть коментар.");
    return;
  }

  setSending(true);

  const { error: insertError } = await supabase
    .from("comments")
    .insert({
      novel_id: id,
      user_id: user.id,
      username: user.user_metadata?.username || user.email,
      message: comment.trim(),
      rating,
    });

  setSending(false);

  if (insertError) {
    alert(insertError.message);
    return;
  }

  setComment("");
  setRating(5);

  await loadComments();
}

  const ranges = useMemo(() => chapterRanges(chapters), [chapters]);

  if (!novel) return <div className="novel-page page-shell"><div className="skeleton novel-loading" /></div>;

  return (
    <div className="novel-page page-shell">
      <button className="novel-back" onClick={() => navigate(-1)}>⬅ Назад</button>
      <section className="novel-hero-card">
        <div className="novel-hero-card__content">
          <span className="novel-id">Novel ID #{novel.id}</span>
          <h1>{novel.title}</h1>
          <p className="novel-rating">{"★".repeat(Math.round(averageRating))}{"☆".repeat(5 - Math.round(averageRating))}<span>{averageRating.toFixed(1)} / 5 ({ratingCount} оцінок)</span></p>
          <p className="novel-author">✍️ {novel.author}</p>
          <div className="novel-stats"><span>⭐ {novel.rating}</span><span>📖 {chapters.length} глав</span><span>👁 {novel.views || 0}</span><span>❤️ {novel.bookmarks || 0}</span><span className="novel-status">{novel.status}</span></div>
          <div className="novel-pills">{splitPills(novel.genres).map((genre) => <span key={genre}>{genre}</span>)}{splitPills(novel.tags).map((tag) => <span className="novel-pill--tag" key={tag}>{tag}</span>)}</div>
          <p className="novel-description">{novel.description}</p>
          <div className="novel-actions">
            <button
              onClick={() => {
                const last = localStorage.getItem(`lastChapter_${id}`);

                if (last) {
                  navigate(`/reader/${last}`);
                } else if (chapters.length > 0) {
                  navigate(`/reader/${chapters[0].id}`);
                }
              }}

            >
              📖 Продовжити читання
            </button>

            <button
              onClick={addToLibrary}
              disabled={saved}
className={saved ? "novel-save novel-save--saved" : "novel-save"}
            >
              {saved ? "💖 У бібліотеці" : "❤️ В бібліотеку"}
            </button>
            <button onClick={shareNovel} className="novel-share">📤 Telegram</button>
          </div>
        </div>
        <img className="novel-cover" src={novel.image || defaultCover} alt={novel.title} onError={(event) => { event.currentTarget.src = defaultCover; }} />
      </section>

      <h2 className="novel-section-title">📚 Список глав</h2>

{chapters.length === 0 ? (
  <div className="novel-empty">Глав поки немає.</div>
) : (
  <div className="chapter-ranges">
    {ranges.map((group) => (
      <details className="chapter-range" key={group.label} open={group === ranges[0]}>
        <summary>{group.label}<span>{group.chapters.length} глав</span></summary>
        <div className="chapter-list">
          {group.chapters.map((chapter) => (
            <button key={chapter.id} className={readChapters.includes(chapter.id) ? "chapter-row chapter-row--read" : "chapter-row"} onClick={() => { localStorage.setItem(`lastChapter_${id}`, chapter.id); navigate(`/reader/${chapter.id}`); }}>
              <span><strong>Глава {chapter.number}</strong><small>{chapter.title}</small></span><em>{readChapters.includes(chapter.id) ? "✅" : "📖"}</em>
            </button>
          ))}
        </div>
      </details>
    ))}
  </div>
)}

<h2 style={{ marginTop: 50 }}>
  💬 Коментарі ({comments.length})
</h2>

<div
  style={{
    background: "#1f2937",
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
  }}
>
  <textarea
  value={comment}
  onChange={(e) => setComment(e.target.value)}
  placeholder="Напишіть свій коментар..."
  rows={4}
  style={{
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #374151",
    background: "#111827",
    color: "white",
    resize: "vertical",
    boxSizing: "border-box",
  }}
/>

<div
  style={{
    display: "flex",
    gap: 8,
    marginTop: 15,
    marginBottom: 15,
  }}
>
  {[1, 2, 3, 4, 5].map((value) => (
    <button
      key={value}
      type="button"
      onClick={() => setRating(value)}
      style={{
        background: "transparent",
        border: "none",
        fontSize: 28,
        cursor: "pointer",
        color: value <= rating ? "#facc15" : "#6b7280",
      }}
    >
      ★
    </button>
  ))}
</div>

<button
  onClick={sendComment}
  disabled={sending}
  style={{
    marginTop: 10,
    padding: "12px 24px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  }}
>
  {sending ? "Відправка..." : "💬 Надіслати"}
</button>
</div>

<div style={{ marginTop: 25 }}>
  {comments.length === 0 ? (
    <div
      style={{
        background: "#1f2937",
        padding: 20,
        borderRadius: 12,
        textAlign: "center",
        color: "#9ca3af",
      }}
    >
      Поки що коментарів немає.
    </div>
  ) : (
    comments.map((item) => (
      <div
        key={item.id}
        style={{
          background: "#1f2937",
          padding: 16,
          borderRadius: 12,
          marginBottom: 15,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <strong>
            👤 {item.username}
          </strong>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                color: "#9ca3af",
                fontSize: 13,
              }}
            >
              {new Date(item.created_at).toLocaleString()}
            </span>

            {user && item.user_id === user.id && (
              <button
                onClick={() => deleteComment(item.id)}
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                🗑
              </button>
            )}
          </div>
        </div>

        <div
  style={{
    marginBottom: 10,
    color: "#facc15",
    fontSize: 18,
  }}
>
  {"★".repeat(item.rating)}
  {"☆".repeat(5 - item.rating)}
</div>

<div
  style={{
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
  }}
>
  {item.message}
</div>
      </div>
    ))
  )}
</div>
    </div>
  );
}

export default Novel;
