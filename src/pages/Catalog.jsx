import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import NovelGrid from "../components/NovelGrid";
import "../styles/Catalog.css";

const PAGE_SIZE = 12;
const NOVEL_COLUMNS = "id,title,author,rating,chapters,views,status,genres,image,description,created_at,updated_at,bookmarks";
const initialFilters = { genre: "all", status: "all", rating: "all", author: "all" };
const sortOptions = {
  newest: { label: "Newest", column: "created_at", ascending: false, fallback: "id" },
  popular: { label: "Most Popular", column: "views", ascending: false, fallback: "bookmarks" },
  rated: { label: "Highest Rated", column: "rating", ascending: false, fallback: "views" },
  chapters: { label: "Most Chapters", column: "chapters", ascending: false, fallback: "rating" },
};

const normalize = (value = "") => String(value).trim().toLowerCase();
const splitGenres = (value = "") => value.split(",").map((item) => item.trim()).filter(Boolean);
const escapeFilter = (value = "") => String(value).replaceAll("%", "\\%").replaceAll("*", "\\*").replaceAll(",", "\\,");


function uniqueBy(values) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function Catalog() {
  const [novels, setNovels] = useState([]);
  const [facets, setFacets] = useState({ genres: [], authors: [] });
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const loadMoreRef = useRef(null);

  useEffect(() => { loadFacets(); }, []);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading && !loadingMore) loadNovels(page + 1);
    }, { rootMargin: "280px" });
    observer.observe(node);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, page, search, filters, sort]);

  async function loadFacets() {
    const { data } = await supabase.from("novels").select("author,genres").order("author");
    const source = data || [];
    setFacets({
      authors: uniqueBy(source.map((novel) => novel.author)),
      genres: uniqueBy(source.flatMap((novel) => splitGenres(novel.genres))),
    });
  }

  const applyQuery = useCallback((builder) => {
    const query = normalize(search);
    if (query) {
      const term = `%${escapeFilter(query)}%`;
      builder.or(`title.ilike.${term},author.ilike.${term},genres.ilike.${term}`);
    }
    if (filters.status !== "all") builder.eq("status", filters.status);
    else builder.neq("status", "Draft");
    if (filters.author !== "all") builder.eq("author", filters.author);
    if (filters.genre !== "all") builder.ilike("genres", `%${escapeFilter(filters.genre)}%`);
    if (filters.rating !== "all") builder.gte("rating", Number(filters.rating));
    return builder;
  }, [search, filters]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const loadNovels = useCallback(async (nextPage = 0, replace = false) => {
    replace ? setLoading(true) : setLoadingMore(true);
    setError("");
    const start = nextPage * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;
    const option = sortOptions[sort] || sortOptions.newest;
    const { data, error } = await applyQuery(
      supabase.from("novels").select(NOVEL_COLUMNS).order(option.column, { ascending: option.ascending }).order(option.fallback, { ascending: false }).range(start, end)
    );
    if (error) {
      setError(error.message || "Перевірте підключення до каталогу.");
      setHasMore(false);
    } else {
      const rows = data || [];
      setNovels((current) => replace ? rows : [...current, ...rows]);
      setPage(nextPage);
      setHasMore(rows.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [applyQuery, sort]);

  useEffect(() => { loadNovels(0, true); }, [loadNovels]);

  useEffect(() => {
    const query = normalize(search);
    if (!query) return undefined;
    const timeout = setTimeout(async () => {
      const term = `%${escapeFilter(query)}%`;
      const { data } = await supabase.from("novels").select("id,title,author,genres").neq("status", "Draft").or(`title.ilike.${term},author.ilike.${term},genres.ilike.${term}`).limit(6);
      setSuggestions(data || []);
    }, 140);
    return () => clearTimeout(timeout);
  }, [search]);

  const visibleSuggestions = search ? suggestions : [];

  const activeCount = useMemo(() => Object.values(filters).filter((value) => value !== "all").length + (search ? 1 : 0), [filters, search]);

  return <main className="catalog page-shell">
    <header className="catalog__hero"><p className="home__eyebrow">Catalog v1</p><h1>Explore every NovelVerse story</h1><p>Fast Supabase-backed discovery with live search, filters, sorting, and infinite scrolling for Telegram Mini Apps.</p></header>
    <section className="catalog__panel" aria-label="Catalog filters">
      <div className="catalog__search-wrap"><input className="catalog__search" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="🔍 Instant search by title, author, or genre" />{visibleSuggestions.length > 0 && <div className="catalog__suggestions">{visibleSuggestions.map((item)=><button key={item.id} onClick={()=>setSearch(item.title)}><strong>{item.title}</strong><span>{item.author} • {splitGenres(item.genres).slice(0,2).join(", ")}</span></button>)}</div>}</div>
      <div className="catalog__filters">
        <label>Genre<select value={filters.genre} onChange={(e)=>setFilters((v)=>({ ...v, genre:e.target.value }))}><option value="all">All genres</option>{facets.genres.map((genre)=><option key={genre}>{genre}</option>)}</select></label>
        <label>Status<select value={filters.status} onChange={(e)=>setFilters((v)=>({ ...v, status:e.target.value }))}><option value="all">All statuses</option><option>Ongoing</option><option>Completed</option></select></label>
        <label>Rating<select value={filters.rating} onChange={(e)=>setFilters((v)=>({ ...v, rating:e.target.value }))}><option value="all">Any rating</option><option value="4.5">4.5+</option><option value="4">4.0+</option><option value="3">3.0+</option></select></label>
        <label>Author<select value={filters.author} onChange={(e)=>setFilters((v)=>({ ...v, author:e.target.value }))}><option value="all">All authors</option>{facets.authors.map((author)=><option key={author}>{author}</option>)}</select></label>
        <label>Sort<select value={sort} onChange={(e)=>setSort(e.target.value)}>{Object.entries(sortOptions).map(([key, value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
      </div>
      <div className="catalog__actions"><span>{activeCount} active filters</span><button type="button" onClick={()=>{ setSearch(""); setFilters(initialFilters); setSort("newest"); }}>Reset</button></div>
    </section>
    <section className="catalog__results"><div className="home__section-heading"><div><p className="home__eyebrow">Results</p><h2>{novels.length} novels loaded</h2></div></div><NovelGrid novels={novels} loading={loading} error={error} onRetry={()=>loadNovels(0, true)} /></section>
    <div ref={loadMoreRef} className="catalog__load-more">{error ? "" : loadingMore ? "Loading more novels…" : hasMore ? "Scroll for more" : !loading && "End of catalog"}</div>
  </main>;
}

export default Catalog;
