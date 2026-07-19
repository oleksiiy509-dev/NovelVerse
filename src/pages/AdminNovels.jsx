import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "../styles/AdminPanel.css";

const norm = (v="") => String(v).toLowerCase();
function AdminNovels() {
  const navigate = useNavigate();
  const [novels, setNovels] = useState([]); const [search, setSearch] = useState(""); const [category, setCategory] = useState("all"); const [status, setStatus] = useState("all");
  useEffect(() => { loadNovels(); }, []);
  async function loadNovels() { const { data, error } = await supabase.from("novels").select("*").order("id", { ascending: false }); if (error) alert(error.message); else setNovels(data || []); }
  async function deleteNovel(id) { if (!window.confirm("Видалити цю новелу та її глави?")) return; await supabase.from("chapters").delete().eq("novel_id", id); const { error } = await supabase.from("novels").delete().eq("id", id); if (error) alert(error.message); else loadNovels(); }
  const categories = useMemo(() => [...new Set(novels.flatMap((n) => [...(n.genres || "").split(",")].map((x) => x?.trim()).filter(Boolean)))], [novels]);
  const filtered = useMemo(() => novels.filter((n) => (!search || [n.title,n.author,n.description,n.tags,n.genres].some((v)=>norm(v).includes(norm(search)))) && (category === "all" || [n.genres,n.tags].some((v)=>norm(v).includes(norm(category)))) && (status === "all" || n.status === status)), [novels, search, category, status]);
  return <main className="admin-shell"><div className="admin-header"><div><h1>📚 Керування новелами</h1><p className="admin-muted">Пошук, фільтрація, редагування і видалення.</p></div><div className="admin-actions"><button onClick={() => navigate("/admin/novels/add")}>➕ Додати</button><button className="admin-secondary" onClick={() => navigate("/admin")}>Назад</button></div></div>
    <section className="admin-card admin-filters"><input placeholder="Пошук за назвою, автором, тегами" value={search} onChange={(e)=>setSearch(e.target.value)} /><select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="all">Усі категорії</option>{categories.map((c)=><option key={c} value={c}>{c}</option>)}</select><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="all">Усі статуси</option><option>Ongoing</option><option>Completed</option><option>Hiatus</option></select></section>
    <section className="admin-list">{filtered.map((novel)=><article className="admin-card" key={novel.id}><img src={novel.image || "/favicon.svg"} alt=""/><div><h2>{novel.title}</h2><p className="admin-muted">{novel.author} • {novel.genres} • ⭐ {novel.rating || 0}</p><p>{novel.description}</p><div className="admin-chip-list">{(novel.tags || "").split(",").filter(Boolean).map((t)=><span className="admin-chip" key={t}>{t.trim()}</span>)}</div><div className="admin-card-actions"><button onClick={()=>navigate(`/admin/novels/edit/${novel.id}`)}>✏️ Редагувати</button><button className="admin-danger" onClick={()=>deleteNovel(novel.id)}>🗑️ Видалити</button></div></div></article>)}{!filtered.length && <p className="empty-state">Новел не знайдено.</p>}</section></main>;
}
export default AdminNovels;
