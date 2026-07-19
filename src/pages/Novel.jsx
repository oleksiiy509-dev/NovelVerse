import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

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

  useEffect(() => {
    init();
  }, [id]);

  async function init() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user);

    const read = JSON.parse(
      localStorage.getItem(`readChapters_${id}`) || "[]"
    );

    setReadChapters(read);

    await loadNovel();

    if (user) {
      await checkLibrary(user.id);
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

  async function checkLibrary(userId) {
  const { data, error } = await supabase
    .from("library")
    .select("id")
    .eq("user_id", userId)
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

  if (!novel) {
    return (
      <div
        style={{
          color: "white",
          padding: 30,
        }}
      >
        Завантаження...
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "30px auto",
        padding: 20,
        color: "white",
        paddingBottom: 120,
      }}
    >      <button
        onClick={() => navigate(-1)}
        style={{
          padding: "10px 20px",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          marginBottom: 25,
        }}
      >
        ⬅ Назад
      </button>

      <div
        style={{
          display: "flex",
          gap: 30,
          flexWrap: "wrap",
          background: "#111827",
          borderRadius: 20,
          padding: 25,
        }}
      >
        <img
          src={novel.image}
          alt={novel.title}
          style={{
            width: 220,
            borderRadius: 15,
            objectFit: "cover",
          }}
        />

        <div style={{ flex: 1 }}>
          <h1>{novel.title}</h1>
          <p
  style={{
    color: "#facc15",
    fontSize: "18px",
    marginBottom: "15px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  }}
>
  {"★".repeat(Math.round(averageRating))}
  {"☆".repeat(5 - Math.round(averageRating))}
  <span style={{ color: "white" }}>
    {averageRating.toFixed(1)} / 5 ({ratingCount} оцінок)
  </span>
</p>

          <p style={{ color: "#9ca3af" }}>
            ✍️ {novel.author}
          </p>

          <div
            style={{
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
              marginTop: 15,
              marginBottom: 20,
            }}
          >
            <span>⭐ {novel.rating}</span>
            <span>📖 {chapters.length} глав</span>
            <span>👁 {novel.views || 0}</span>
            <span>❤️ {novel.bookmarks || 0}</span>
            <span>📚 {novel.status}</span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 20,
            }}
          >
            {(novel.genres || "")
              .split(",")
              .filter(Boolean)
              .map((genre) => (
                <span
                  key={genre}
                  style={{
                    background: "#2563eb",
                    padding: "6px 14px",
                    borderRadius: 30,
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                >
                  {genre.trim()}
                </span>
              ))}
          </div>

          <p
            style={{
              lineHeight: 1.8,
              color: "#d1d5db",
            }}
          >
            {novel.description}
          </p>

          <div
            style={{
              display: "flex",
              gap: 15,
              marginTop: 25,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => {
                const last = localStorage.getItem(`lastChapter_${id}`);

                if (last) {
                  navigate(`/reader/${last}`);
                } else if (chapters.length > 0) {
                  navigate(`/reader/${chapters[0].id}`);
                }
              }}
              style={{
                padding: "14px 30px",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              📖 Продовжити читання
            </button>

            <button
              onClick={addToLibrary}
              disabled={saved}
              style={{
                padding: "14px 30px",
                background: saved ? "#16a34a" : "#dc2626",
                color: "white",
                border: "none",
                borderRadius: 10,
                cursor: saved ? "default" : "pointer",
                fontSize: 16,
              }}
            >
              {saved ? "💖 У бібліотеці" : "❤️ В бібліотеку"}
            </button>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 40 }}>📚 Список глав</h2>

{chapters.length === 0 ? (
  <div
    style={{
      background: "#1f2937",
      padding: 20,
      borderRadius: 12,
      marginTop: 20,
      textAlign: "center",
    }}
  >
    Глав поки немає.
  </div>
) : (
  chapters.map((chapter) => (
    <div
      key={chapter.id}
      onClick={() => {
        localStorage.setItem(`lastChapter_${id}`, chapter.id);
        navigate(`/reader/${chapter.id}`);
      }}
      style={{
        background: readChapters.includes(chapter.id)
          ? "#166534"
          : "#1e293b",
        marginTop: 12,
        padding: 18,
        borderRadius: 12,
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <strong>Глава {chapter.number}</strong>

        <div
          style={{
            marginTop: 5,
            color: "#d1d5db",
          }}
        >
          {chapter.title}
        </div>
      </div>

      <div style={{ fontSize: 24 }}>
        {readChapters.includes(chapter.id) ? "✅" : "📖"}
      </div>
    </div>
  ))
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
