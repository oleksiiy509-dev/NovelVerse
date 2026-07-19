import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCurrentUser, readList, writeList, userKey } from "../lib/userFeatures";
import { formatBytes, getDownloadedNovelChapters, saveDownloadedChapter } from "../lib/offlineStorage";
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


const COMMENTS_PAGE_SIZE = 20;
const MAX_REPLY_DEPTH = 2;

function getDisplayName(currentUser) {
  return currentUser?.user_metadata?.username || currentUser?.user_metadata?.full_name || currentUser?.email || "NovelVerse reader";
}

function getAvatar(currentUser) {
  return currentUser?.user_metadata?.avatar_url || currentUser?.user_metadata?.picture || "";
}

function buildRatingStats(ratings = []) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratings.forEach((item) => {
    const value = Number(item.rating || item.value || 0);
    if (value >= 1 && value <= 5) distribution[value] += 1;
  });
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  const weighted = Object.entries(distribution).reduce((sum, [star, count]) => sum + Number(star) * count, 0);
  return { average: total ? weighted / total : 0, count: total, distribution };
}

function normalizeComment(item, likes = []) {
  return {
    ...item,
    likes_count: Number(item.likes_count ?? item.likes ?? likes.filter((like) => like.comment_id === item.id).length ?? 0),
    avatar_url: item.avatar_url || item.user_avatar || "",
    parent_id: item.parent_id || null,
  };
}

function nestComments(items = []) {
  const byId = new Map(items.map((item) => [item.id, { ...item, replies: [] }]));
  const roots = [];
  byId.forEach((item) => {
    if (item.parent_id && byId.has(item.parent_id)) byId.get(item.parent_id).replies.push(item);
    else roots.push(item);
  });
  return roots;
}

function ratingOrder(sort) {
  if (sort === "oldest") return { column: "created_at", ascending: true };
  if (sort === "highest") return { column: "likes_count", ascending: false };
  return { column: "created_at", ascending: false };
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
  const loadMoreRef = useRef(null);
  const [user, setUser] = useState(null);
  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [readChapters, setReadChapters] = useState([]);
  const [saved, setSaved] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentPage, setCommentPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState([]);
  const [collapsedThreads, setCollapsedThreads] = useState([]);
  const [likedCommentIds, setLikedCommentIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [ratingStats, setRatingStats] = useState({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [commentSort, setCommentSort] = useState("newest");
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [editSpoiler, setEditSpoiler] = useState(false);
  const [chapterSearch, setChapterSearch] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [novelDownloading, setNovelDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const cancelDownloadRef = useRef(false);

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
    await Promise.all([loadChapters(), loadRatings(currentUser), loadComments({ page: 0, reset: true }), loadRecommendations(loadedNovel), refreshDownloadCount()]);
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

  async function refreshDownloadCount() {
    const rows = await getDownloadedNovelChapters(id).catch(() => []);
    setDownloadedCount(rows.length);
  }

  async function loadChapters() {
    const { data, error } = await supabase.from("chapters").select("*").eq("novel_id", id).order("number", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setChapters(data || []);
  }

  async function loadRatings(currentUser = user) {
    const { data, error } = await supabase.from("novel_ratings").select("*").eq("novel_id", id);
    if (error) {
      console.error(error);
      setRatingStats({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
      return;
    }
    setRatingStats(buildRatingStats(data || []));
    const mine = (data || []).find((item) => item.user_id === currentUser?.id);
    setUserRating(Number(mine?.rating || mine?.value || 0));
  }

  async function loadComments({ page = commentPage, reset = false } = {}) {
    setCommentsLoading(true);
    const sort = ratingOrder(commentSort);
    const from = page * COMMENTS_PAGE_SIZE;
    const to = from + COMMENTS_PAGE_SIZE - 1;
    const { data, error } = await supabase.from("comments").select("*").eq("novel_id", id).order(sort.column, { ascending: sort.ascending }).range(from, to);
    if (error) {
      console.error(error);
      setCommentsLoading(false);
      return;
    }
    const list = data || [];
    const ids = list.map((item) => item.id);
    let likes = [];
    if (ids.length) {
      const { data: likeData } = await supabase.from("comment_likes").select("*").eq("novel_id", id);
      likes = likeData || [];
      setLikedCommentIds(likes.filter((like) => like.user_id === user?.id).map((like) => like.comment_id));
    }
    const normalized = list.map((item) => normalizeComment(item, likes));
    setComments((previous) => reset ? normalized : [...previous, ...normalized.filter((item) => !previous.some((oldItem) => oldItem.id === item.id))]);
    setHasMoreComments(list.length === COMMENTS_PAGE_SIZE);
    setCommentPage(page);
    setCommentsLoading(false);
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

  useEffect(() => {
    loadComments({ page: 0, reset: true });
  }, [commentSort]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMoreComments) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !commentsLoading) loadComments({ page: commentPage + 1 });
    }, { rootMargin: "240px" });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [commentPage, commentsLoading, hasMoreComments]);

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


  async function downloadNovel() {
    if (!chapters.length || novelDownloading) return;
    const roughSize = chapters.reduce((sum, chapter) => sum + (chapter.content?.length || 60000), 0);
    if (roughSize > 5 * 1024 * 1024 && !window.confirm(`Ця новела може зайняти приблизно ${formatBytes(roughSize)}. Продовжити?`)) return;
    setNovelDownloading(true);
    setDownloadError("");
    cancelDownloadRef.current = false;
    try {
      const existing = new Set((await getDownloadedNovelChapters(id)).map((item) => item.chapter_id));
      for (const chapter of chapters) {
        if (cancelDownloadRef.current) break;
        if (existing.has(chapter.id)) continue;
        let full = chapter;
        if (!full.content) {
          const { data, error } = await supabase.from("chapters").select("*").eq("id", chapter.id).single();
          if (error) throw error;
          full = data;
        }
        await saveDownloadedChapter(full, novel);
        existing.add(chapter.id);
        setDownloadedCount(existing.size);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    } catch (error) {
      setDownloadError(error.message || "Не вдалося завантажити новелу.");
    } finally {
      setNovelDownloading(false);
      refreshDownloadCount();
    }
  }

  function cancelNovelDownload() {
    cancelDownloadRef.current = true;
    setNovelDownloading(false);
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
    else await loadComments({ page: 0, reset: true });
  }

  async function saveCommentEdit(commentId) {
    if (!editMessage.trim()) return;
    const { error } = await supabase.from("comments").update({ message: editMessage.trim(), is_spoiler: editSpoiler, edited_at: new Date().toISOString() }).eq("id", commentId).eq("user_id", user.id);
    if (error) alert(error.message);
    else {
      setEditingCommentId(null);
      await loadComments({ page: 0, reset: true });
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
    const { error } = await supabase.from("comments").insert({ novel_id: id, user_id: user.id, username: getDisplayName(user), avatar_url: getAvatar(user), message: comment.trim(), parent_id: replyTo?.id || null, is_spoiler: isSpoiler, likes_count: 0 });
    setSending(false);
    if (error) alert(error.message);
    else {
      setComment("");
      setReplyTo(null);
      setIsSpoiler(false);
      await loadComments({ page: 0, reset: true });
    }
  }


  async function submitRating(value) {
    if (!user) {
      navigate("/login");
      return;
    }
    setUserRating(value);
    const payload = { novel_id: id, user_id: user.id, rating: value };
    const { error } = await supabase.from("novel_ratings").upsert(payload, { onConflict: "novel_id,user_id" });
    if (error) alert(error.message);
    await loadRatings(user);
  }

  async function toggleLike(item) {
    if (!user) {
      navigate("/login");
      return;
    }
    const liked = likedCommentIds.includes(item.id);
    const query = supabase.from("comment_likes");
    const { error } = liked
      ? await query.delete().eq("comment_id", item.id).eq("user_id", user.id)
      : await query.upsert({ novel_id: id, comment_id: item.id, user_id: user.id }, { onConflict: "comment_id,user_id" });
    if (error) alert(error.message);
    else await loadComments({ page: 0, reset: true });
  }

  async function reportComment(item) {
    if (!user) {
      navigate("/login");
      return;
    }
    const reason = window.prompt("Why are you reporting this comment?", "Inappropriate content");
    if (!reason) return;
    const { error } = await supabase.from("comment_reports").insert({ novel_id: id, comment_id: item.id, reporter_id: user.id, reason });
    if (error) alert(error.message);
    else alert("Thanks. The report was submitted.");
  }

  function toggleSpoiler(idToToggle) {
    setRevealedSpoilers((current) => current.includes(idToToggle) ? current.filter((item) => item !== idToToggle) : [...current, idToToggle]);
  }

  function toggleThread(idToToggle) {
    setCollapsedThreads((current) => current.includes(idToToggle) ? current.filter((item) => item !== idToToggle) : [...current, idToToggle]);
  }

  const filteredChapters = useMemo(() => {
    const query = chapterSearch.trim().toLowerCase();
    if (!query) return chapters;
    return chapters.filter((chapter) => String(chapter.number).includes(query) || chapter.title?.toLowerCase().includes(query));
  }, [chapterSearch, chapters]);
  const ranges = useMemo(() => chapterRanges(filteredChapters), [filteredChapters]);
  const nestedComments = useMemo(() => nestComments(comments), [comments]);
  const genres = splitPills(novel?.genres);
  const readPercent = chapters.length ? Math.round((readChapters.length / chapters.length) * 100) : 0;
  const lastUpdated = novel?.updated_at || chapters.at(-1)?.created_at || novel?.created_at;


  function renderComment(item, depth = 0) {
    const isMine = user && item.user_id === user.id;
    const hiddenSpoiler = item.is_spoiler && !revealedSpoilers.includes(item.id);
    const collapsed = collapsedThreads.includes(item.id);
    return (
      <article className={`comment-card comment-card--depth-${Math.min(depth, MAX_REPLY_DEPTH)}`} key={item.id}>
        <header><div className="comment-author"><span className="comment-avatar">{item.avatar_url ? <img src={item.avatar_url} alt="" /> : "👤"}</span><strong>{item.username || "NovelVerse reader"}</strong></div><span>{new Date(item.created_at).toLocaleString()}</span></header>
        {editingCommentId === item.id ? <div className="comment-edit"><textarea value={editMessage} onChange={(event) => setEditMessage(event.target.value)} rows={3} /><label className="spoiler-toggle"><input type="checkbox" checked={editSpoiler} onChange={(event) => setEditSpoiler(event.target.checked)} /> Spoiler</label><button onClick={() => saveCommentEdit(item.id)}>Save</button><button className="ghost" onClick={() => setEditingCommentId(null)}>Cancel</button></div> : <>
          {item.edited_at && <span className="edited-badge">edited</span>}
          {hiddenSpoiler ? <button className="spoiler-card" onClick={() => toggleSpoiler(item.id)}>⚠️ Spoiler hidden · Tap to reveal</button> : <p>{item.message}</p>}
          <div className="comment-actions"><button className={likedCommentIds.includes(item.id) ? "liked" : "ghost"} onClick={() => toggleLike(item)}>♥ {formatNumber(item.likes_count)}</button>{depth < MAX_REPLY_DEPTH && <button className="ghost" onClick={() => setReplyTo(item)}>Reply</button>}<button className="ghost" onClick={() => reportComment(item)}>Report</button>{isMine && <><button onClick={() => { setEditingCommentId(item.id); setEditMessage(item.message); setEditSpoiler(!!item.is_spoiler); }}>Edit</button><button onClick={() => deleteComment(item.id)}>Delete</button></>}</div>
        </>}
        {item.replies?.length > 0 && <div className="reply-thread"><button className="thread-toggle" onClick={() => toggleThread(item.id)}>{collapsed ? `Show ${item.replies.length} replies` : "Collapse replies"}</button>{!collapsed && item.replies.map((reply) => renderComment(reply, depth + 1))}</div>}
      </article>
    );
  }

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
            <span>⭐ {ratingStats.average.toFixed(1)} / 5 ({ratingStats.count})</span><span>👁 {formatNumber(novel.views)}</span><span>❤️ {formatNumber(novel.bookmarks)}</span><span>📌 {novel.status || "Ongoing"}</span><span>🕒 {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "No updates yet"}</span>
          </div>
          <div className="novel-pills">{genres.map((genre) => <span key={genre}>{genre}</span>)}</div>
          <div className="novel-actions">
            <button onClick={continueReading} disabled={!chapters.length}>📖 Continue reading</button>
            <button onClick={addToLibrary} disabled={saved} className={saved ? "novel-save novel-save--saved" : "novel-save"}>{saved ? "💖 Bookmarked" : "❤️ Bookmark"}</button>
            <button onClick={() => commentsRef.current?.scrollIntoView({ behavior: "smooth" })} className="novel-rate">⭐ Rate</button>
            <button onClick={shareNovel} className="novel-share">🔗 Share</button>
            <button onClick={downloadNovel} disabled={!chapters.length || novelDownloading}>⬇️ Завантажити новелу</button>
          </div>
          <div className="novel-download-box"><strong>{downloadedCount}/{chapters.length} глав</strong><span>{chapters.length ? Math.round((downloadedCount / chapters.length) * 100) : 0}% завантажено</span><div className="novel-progress"><span style={{ width: `${chapters.length ? Math.round((downloadedCount / chapters.length) * 100) : 0}%` }} /></div>{novelDownloading && <button onClick={cancelNovelDownload}>Скасувати</button>}{downloadError && <p>{downloadError}</p>}</div>
        </div>
      </section>

      <section className="novel-panel">
        <div className="novel-section-heading"><h2>Description</h2><button onClick={() => setDescriptionOpen(!descriptionOpen)}>{descriptionOpen ? "Collapse" : "Show full description"}</button></div>
        <p className={descriptionOpen ? "novel-description novel-description--open" : "novel-description"}>{novel.description || "No description yet."}</p>
      </section>

      <section className="novel-stat-grid" aria-label="Novel statistics">
        <div><strong>{formatNumber(chapters.length)}</strong><span>Total chapters</span></div><div><strong>{formatNumber(novel.readers || novel.views || 0)}</strong><span>Readers</span></div><div><strong>{ratingStats.average.toFixed(1)}</strong><span>Average rating</span></div><div><strong>{formatNumber(novel.bookmarks || 0)}</strong><span>Bookmark count</span></div>
      </section>

      <section className="novel-panel">
        <div className="novel-section-heading"><h2>📚 Chapters</h2><span>{readPercent}% read</span></div>
        <div className="novel-progress"><span style={{ width: `${readPercent}%` }} /></div>
        <input className="chapter-search" value={chapterSearch} onChange={(event) => setChapterSearch(event.target.value)} placeholder="Search chapter..." />
        {chapters.length === 0 ? <div className="novel-empty">No chapters yet.</div> : <div className="chapter-ranges">{ranges.map((group, index) => <details className="chapter-range" key={group.label} open={index === 0}><summary>{group.label}<span>{group.chapters.length} chapters</span></summary><div className="chapter-list">{group.chapters.map((chapter) => <div key={chapter.id} className={readChapters.includes(chapter.id) ? "chapter-row chapter-row--read" : "chapter-row"}><button onClick={() => { markChapterRead(chapter.id); localStorage.setItem(`lastChapter_${id}`, chapter.id); navigate(`/reader/${chapter.id}`); }}><span><strong>Chapter {chapter.number}</strong><small>{chapter.title}</small></span></button><button className="chapter-read-toggle" onClick={() => markChapterRead(chapter.id)}>{readChapters.includes(chapter.id) ? "✓ Read" : "Mark read"}</button></div>)}</div></details>)}</div>}
      </section>

      <section className="novel-panel community-panel" ref={commentsRef}>
        <div className="novel-section-heading"><h2>⭐ Community rating</h2><span>{ratingStats.count} votes</span></div>
        <div className="rating-dashboard"><div className="rating-score"><strong>{ratingStats.average.toFixed(1)}</strong><span>average</span><div className="star-row star-row--interactive">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => submitRating(value)} className={value <= userRating ? "active" : ""}>★</button>)}</div></div><div className="rating-bars">{[5, 4, 3, 2, 1].map((star) => <div className="rating-bar" key={star}><span>{star}★</span><meter min="0" max={Math.max(1, ratingStats.count)} value={ratingStats.distribution[star]} /><strong>{ratingStats.distribution[star]}</strong></div>)}</div></div>
        <div className="novel-section-heading"><h2>💬 Comments ({comments.length})</h2><select value={commentSort} onChange={(event) => setCommentSort(event.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="highest">Highest rated</option></select></div>
        <div className="comment-form">{replyTo && <div className="replying-to">Replying to {replyTo.username}<button onClick={() => setReplyTo(null)}>Cancel</button></div>}<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={user ? "Add a comment..." : "Sign in to join the discussion..."} rows={4} /><label className="spoiler-toggle"><input type="checkbox" checked={isSpoiler} onChange={(event) => setIsSpoiler(event.target.checked)} /> Mark as spoiler</label><button onClick={sendComment} disabled={sending}>{sending ? "Sending..." : "💬 Post comment"}</button></div>
        <div className="comment-list">{commentsLoading && comments.length === 0 ? <><div className="skeleton comment-card" /><div className="skeleton comment-card" /></> : nestedComments.length === 0 ? <div className="novel-empty">No comments yet. Start the conversation.</div> : nestedComments.map((item) => renderComment(item))}</div>
        {hasMoreComments && <button ref={loadMoreRef} className="load-more-comments" onClick={() => loadComments({ page: commentPage + 1 })} disabled={commentsLoading}>{commentsLoading ? "Loading..." : "Load more comments"}</button>}
      </section>

      <section className="novel-panel">
        <div className="novel-section-heading"><h2>✨ Recommendations</h2><span>Similar novels · Same genres · Same author</span></div>
        {recommendationsLoading ? <div className="recommendation-grid"><div className="skeleton recommendation-card" /><div className="skeleton recommendation-card" /></div> : recommendations.length === 0 ? <div className="novel-empty">No recommendations yet.</div> : <div className="recommendation-grid">{recommendations.map((item) => <button className="recommendation-card" key={item.id} onClick={() => navigate(`/novel/${item.id}`)}><img loading="lazy" src={item.image || item.cover_url || defaultCover} alt="" onError={(event) => { event.currentTarget.src = defaultCover; }} /><strong>{item.title}</strong><span>{item.recommendationReason}</span></button>)}</div>}
      </section>
    </div>
  );
}

export default Novel;
