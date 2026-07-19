import { useEffect, useMemo, useRef, useState } from "react";
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

function formatNumber(value = 0) {
  return new Intl.NumberFormat("uk-UA", { notation: value > 9999 ? "compact" : "standard" }).format(value || 0);
}

function getChapterNumber(chapter, index) {
  return Number(chapter.number || index + 1);
}

function chapterRanges(chapters) {
  const groups = [];
  if (!chapters.length) return groups;
  const maxNumber = Math.max(...chapters.map((chapter, index) => getChapterNumber(chapter, index)));
  for (let start = 1; start <= maxNumber; start += 50) {
    const end = start + 49;
    const groupChapters = chapters.filter((chapter, index) => {
      const number = getChapterNumber(chapter, index);
      return number >= start && number <= end;
    });
    if (groupChapters.length) groups.push({ label: `${start}–${end}`, chapters: groupChapters });
  }
  return groups;
}

function NovelSkeleton() {
  return (
    <div className="novel-page page-shell">
      <div className="skeleton novel-back-skeleton" />
      <section className="novel-hero-card novel-hero-card--loading">
        <div>
          <div className="skeleton novel-line novel-line--short" />
          <div className="skeleton novel-line novel-line--title" />
          <div className="skeleton novel-line" />
          <div className="skeleton novel-line" />
          <div className="novel-skeleton-pills"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
        </div>
        <div className="skeleton novel-cover" />
      </section>
      <div className="skeleton novel-loading" />
    </div>
  );
}

function Novel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const commentsRef = useRef(null);
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
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [commentSort, setCommentSort] = useState("newest");
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [editRating, setEditRating] = useState(5);
  const [chapterSearch, setChapterSearch] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);

  const continueReading = () => {
    const last = localStorage.getItem(`lastChapter_${id}`);
    if (last) navigate(`/reader/${last}`);
    else if (chapters.length > 0) navigate(`/reader/${chapters[0].id}`);
  };

  useTelegramMainButton(novel ? { text: "Continue reading", onClick: continueReading, disabled: !chapters.length } : null);

  useEffect(() => {
    init();
  }, [id]);

  async function init() {
    setRecommendationsLoading(true);
    const currentUser = await getCurrentUser(supabase);
    setUser(currentUser);
    setReadChapters(JSON.parse(localStorage.getItem(`readChapters_${id}`) || "[]"));
    const loadedNovel = await loadNovel();
    if (currentUser) await checkLibrary(currentUser);
    await Promise.all([loadChapters(), loadComments(), loadRecommendations(loadedNovel)]);
  }

  async function loadNovel() {
    const { data, error } = await supabase.from("novels").select("*").eq("id", id).single();
    if (error) {
      console.error(error);
      return null;
    }
    const newViews = (data.views || 0) + 1;
    await supabase.from("novels").update({ views: newViews }).eq("id", id);
    const loadedNovel = { ...data, views: newViews };
    setNovel(loadedNovel);
    return loadedNovel;
  }

  async function loadChapters() {
    const { data, error } = await supabase.from("chapters").select("*").eq("novel_id", id).order("number", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setChapters(data || []);
  }

  async function loadComments() {
    const { data, error } = await supabase.from("comments").select("*").eq("novel_id", id).order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    const list = data || [];
    setComments(list);
    const rated = list.filter((item) => Number(item.rating));
    setAverageRating(rated.length ? rated.reduce((sum, item) => sum + Number(item.rating || 0), 0) / rated.length : 0);
    setRatingCount(rated.length);
  }

  async function loadRecommendations(sourceNovel) {
    if (!sourceNovel) {
      setRecommendations([]);
      setRecommendationsLoading(false);
      return;
    }
    const { data, error } = await supabase.from("novels").select("*").order("views", { ascending: false }).limit(24);
    if (error) console.error(error);
    const genres = splitPills(sourceNovel.genres).map((genre) => genre.toLowerCase());
    const scored = (data || [])
      .filter((item) => String(item.id) !== String(id))
      .map((item) => {
        const itemGenres = splitPills(item.genres).map((genre) => genre.toLowerCase());
        const sameGenreCount = itemGenres.filter((genre) => genres.includes(genre)).length;
        const sameAuthor = item.author && sourceNovel.author && item.author.toLowerCase() === sourceNovel.author.toLowerCase();
        return { ...item, recommendationReason: sameAuthor ? "Same author" : sameGenreCount ? "Same genres" : "Similar novel", score: sameGenreCount + (sameAuthor ? 5 : 0) + (item.views || 0) / 100000 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    setRecommendations(scored);
    setRecommendationsLoading(false);
  }

  async function checkLibrary(currentUser) {
    if (currentUser?.app_metadata?.provider === "telegram") {
      setSaved(readList(userKey(currentUser.id, "library")).some((item) => item.novel_id === id));
      return;
    }
    const { data, error } = await supabase.from("library").select("id").eq("user_id", currentUser.id).eq("novel_id", id).maybeSingle();
    if (error) console.error(error);
    setSaved(!!data);
  }

  async function addToLibrary() {
    if (!user) {
      navigate("/login");
      return;
    }
    if (saved) return;
    if (user.app_metadata?.provider === "telegram") {
      const key = userKey(user.id, "library");
      writeList(key, [{ novel_id: id, saved_at: new Date().toISOString() }, ...readList(key).filter((item) => item.novel_id !== id)]);
      setSaved(true);
      return;
    }
    const { error } = await supabase.from("library").insert({ user_id: user.id, novel_id: id });
    if (error) {
      alert(error.message);
      return;
    }
    const bookmarks = (novel.bookmarks || 0) + 1;
    await supabase.from("novels").update({ bookmarks }).eq("id", id);
    setNovel({ ...novel, bookmarks });
    setSaved(true);
  }

  function shareNovel() {
    shareToTelegram({ title: novel.title, text: `Читайте ${novel.title} у NovelVerse`, url: window.location.href });
  }

  function markChapterRead(chapterId) {
    const next = readChapters.includes(chapterId) ? readChapters.filter((item) => item !== chapterId) : [...readChapters, chapterId];
    setReadChapters(next);
    localStorage.setItem(`readChapters_${id}`, JSON.stringify(next));
  }

  async function deleteComment(commentId) {
    if (!user || !window.confirm("Delete this comment?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("user_id", user.id);
    if (error) alert(error.message);
    else await loadComments();
  }

  async function saveCommentEdit(commentId) {
    if (!editMessage.trim()) return;
    const { error } = await supabase.from("comments").update({ message: editMessage.trim(), rating: editRating }).eq("id", commentId).eq("user_id", user.id);
    if (error) alert(error.message);
    else {
      setEditingCommentId(null);
      await loadComments();
    }
  }

  async function sendComment() {
    if (!user) {
      navigate("/login");
      return;
    }
    if (!comment.trim()) {
      alert("Write a comment first.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("comments").insert({ novel_id: id, user_id: user.id, username: user.user_metadata?.username || user.email || "NovelVerse reader", message: comment.trim(), rating });
    setSending(false);
    if (error) alert(error.message);
    else {
      setComment("");
      setRating(5);
      await loadComments();
    }
  }

  const filteredChapters = useMemo(() => {
    const query = chapterSearch.trim().toLowerCase();
    if (!query) return chapters;
    return chapters.filter((chapter) => String(chapter.number).includes(query) || chapter.title?.toLowerCase().includes(query));
  }, [chapterSearch, chapters]);
  const ranges = useMemo(() => chapterRanges(filteredChapters), [filteredChapters]);
  const sortedComments = useMemo(() => [...comments].sort((a, b) => commentSort === "highest" ? Number(b.rating || 0) - Number(a.rating || 0) : new Date(b.created_at) - new Date(a.created_at)), [comments, commentSort]);
  const genres = splitPills(novel?.genres);
  const readPercent = chapters.length ? Math.round((readChapters.length / chapters.length) * 100) : 0;
  const lastUpdated = novel?.updated_at || chapters.at(-1)?.created_at || novel?.created_at;

  if (!novel) return <NovelSkeleton />;

  return (
    <div className="novel-page page-shell">
      <button className="novel-back" onClick={() => navigate(-1)}>← Back</button>
      <section className="novel-hero-card">
        <img className="novel-cover" loading="eager" src={novel.image || novel.cover_url || defaultCover} alt={novel.title} onError={(event) => { event.currentTarget.src = defaultCover; }} />
        <div className="novel-hero-card__content">
          <span className="novel-id">Novel ID #{novel.id}</span>
          <h1>{novel.title}</h1>
          <p className="novel-author">✍️ {novel.author || "Unknown author"}</p>
          <div className="novel-meta-grid">
            <span>⭐ {averageRating.toFixed(1)} / 5 ({ratingCount})</span><span>👁 {formatNumber(novel.views)}</span><span>❤️ {formatNumber(novel.bookmarks)}</span><span>📌 {novel.status || "Ongoing"}</span><span>🕒 {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "No updates yet"}</span>
          </div>
          <div className="novel-pills">{genres.map((genre) => <span key={genre}>{genre}</span>)}</div>
          <div className="novel-actions">
            <button onClick={continueReading} disabled={!chapters.length}>📖 Continue reading</button>
            <button onClick={addToLibrary} disabled={saved} className={saved ? "novel-save novel-save--saved" : "novel-save"}>{saved ? "💖 Bookmarked" : "❤️ Bookmark"}</button>
            <button onClick={() => commentsRef.current?.scrollIntoView({ behavior: "smooth" })} className="novel-rate">⭐ Rate</button>
            <button onClick={shareNovel} className="novel-share">🔗 Share</button>
          </div>
        </div>
      </section>

      <section className="novel-panel">
        <div className="novel-section-heading"><h2>Description</h2><button onClick={() => setDescriptionOpen(!descriptionOpen)}>{descriptionOpen ? "Collapse" : "Show full description"}</button></div>
        <p className={descriptionOpen ? "novel-description novel-description--open" : "novel-description"}>{novel.description || "No description yet."}</p>
      </section>

      <section className="novel-stat-grid" aria-label="Novel statistics">
        <div><strong>{formatNumber(chapters.length)}</strong><span>Total chapters</span></div><div><strong>{formatNumber(novel.readers || novel.views || 0)}</strong><span>Readers</span></div><div><strong>{averageRating.toFixed(1)}</strong><span>Average rating</span></div><div><strong>{formatNumber(novel.bookmarks || 0)}</strong><span>Bookmark count</span></div>
      </section>

      <section className="novel-panel">
        <div className="novel-section-heading"><h2>📚 Chapters</h2><span>{readPercent}% read</span></div>
        <div className="novel-progress"><span style={{ width: `${readPercent}%` }} /></div>
        <input className="chapter-search" value={chapterSearch} onChange={(event) => setChapterSearch(event.target.value)} placeholder="Search chapter..." />
        {chapters.length === 0 ? <div className="novel-empty">No chapters yet.</div> : <div className="chapter-ranges">{ranges.map((group, index) => <details className="chapter-range" key={group.label} open={index === 0}><summary>{group.label}<span>{group.chapters.length} chapters</span></summary><div className="chapter-list">{group.chapters.map((chapter) => <div key={chapter.id} className={readChapters.includes(chapter.id) ? "chapter-row chapter-row--read" : "chapter-row"}><button onClick={() => { markChapterRead(chapter.id); localStorage.setItem(`lastChapter_${id}`, chapter.id); navigate(`/reader/${chapter.id}`); }}><span><strong>Chapter {chapter.number}</strong><small>{chapter.title}</small></span></button><button className="chapter-read-toggle" onClick={() => markChapterRead(chapter.id)}>{readChapters.includes(chapter.id) ? "✓ Read" : "Mark read"}</button></div>)}</div></details>)}</div>}
      </section>

      <section className="novel-panel" ref={commentsRef}>
        <div className="novel-section-heading"><h2>💬 Comments ({comments.length})</h2><select value={commentSort} onChange={(event) => setCommentSort(event.target.value)}><option value="newest">Newest</option><option value="highest">Highest rated</option></select></div>
        <div className="comment-form"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment..." rows={4} /><div className="star-row">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} className={value <= rating ? "active" : ""}>★</button>)}</div><button onClick={sendComment} disabled={sending}>{sending ? "Sending..." : "💬 Add comment"}</button></div>
        <div className="comment-list">{sortedComments.length === 0 ? <div className="novel-empty">No comments yet.</div> : sortedComments.map((item) => <article className="comment-card" key={item.id}><header><strong>👤 {item.username}</strong><span>{new Date(item.created_at).toLocaleString()}</span></header>{editingCommentId === item.id ? <div className="comment-edit"><textarea value={editMessage} onChange={(event) => setEditMessage(event.target.value)} rows={3} /><div className="star-row">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setEditRating(value)} className={value <= editRating ? "active" : ""}>★</button>)}</div><button onClick={() => saveCommentEdit(item.id)}>Save</button><button className="ghost" onClick={() => setEditingCommentId(null)}>Cancel</button></div> : <><div className="comment-rating">{"★".repeat(Number(item.rating || 0))}{"☆".repeat(5 - Number(item.rating || 0))}</div><p>{item.message}</p>{user && item.user_id === user.id && <div className="comment-actions"><button onClick={() => { setEditingCommentId(item.id); setEditMessage(item.message); setEditRating(Number(item.rating || 5)); }}>Edit</button><button onClick={() => deleteComment(item.id)}>Delete</button></div>}</>}</article>)}</div>
      </section>

      <section className="novel-panel">
        <div className="novel-section-heading"><h2>✨ Recommendations</h2><span>Similar novels · Same genres · Same author</span></div>
        {recommendationsLoading ? <div className="recommendation-grid"><div className="skeleton recommendation-card" /><div className="skeleton recommendation-card" /></div> : recommendations.length === 0 ? <div className="novel-empty">No recommendations yet.</div> : <div className="recommendation-grid">{recommendations.map((item) => <button className="recommendation-card" key={item.id} onClick={() => navigate(`/novel/${item.id}`)}><img loading="lazy" src={item.image || item.cover_url || defaultCover} alt="" onError={(event) => { event.currentTarget.src = defaultCover; }} /><strong>{item.title}</strong><span>{item.recommendationReason}</span></button>)}</div>}
      </section>
    </div>
  );
}

export default Novel;
