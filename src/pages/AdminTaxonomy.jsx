import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { adminWrite, joinList, normalize, splitList } from "../lib/adminContent";
import "../styles/AdminPanel.css";

function AdminTaxonomy() {
  const navigate = useNavigate();
  const [novels, setNovels] = useState([]);
  const [genre, setGenre] = useState("");
  const [selected, setSelected] = useState([]);
  const [toast, setToast] = useState("");
  useEffect(() => { load(); }, []);
  async function load() { const { data, error } = await supabase.from("novels").select("id,title,genres").order("title"); if (error) setToast(error.message); else setNovels(data || []); }
  const genres = useMemo(() => [...new Set(novels.flatMap((novel) => splitList(novel.genres)))].sort((a, b) => a.localeCompare(b)), [novels]);
  async function updateNovelGenres(id, updater) { const novel = novels.find((item) => String(item.id) === String(id)); const next = joinList(updater(splitList(novel?.genres))); await adminWrite(() => supabase.from("novels").update({ genres: next }).eq("id", id)); }
  async function addGenre() { const value = genre.trim(); if (!value) { setToast("Enter a genre name."); return; } if (genres.some((item) => normalize(item) === normalize(value))) { setToast("That genre already exists. Select novels to attach it instead."); return; } if (!selected.length) { setToast("Select at least one novel so the genre remains discoverable."); return; } try { for (const id of selected) await updateNovelGenres(id, (items) => [...items, value]); setGenre(""); setSelected([]); setToast("Genre added."); load(); } catch (error) { setToast(error.message); } }
  async function renameGenre(oldName) { const nextName = window.prompt("Rename genre", oldName)?.trim(); if (!nextName || nextName === oldName) return; if (genres.some((item) => normalize(item) === normalize(nextName))) { setToast("A genre with that name already exists."); return; } try { for (const novel of novels.filter((item) => splitList(item.genres).includes(oldName))) await updateNovelGenres(novel.id, (items) => items.map((item) => (item === oldName ? nextName : item))); setToast("Genre renamed without deleting existing novel links."); load(); } catch (error) { setToast(error.message); } }
  async function deleteGenre(value) { if (!window.confirm(`Remove genre “${value}” from all novels? Novels will not be deleted.`)) return; try { for (const novel of novels.filter((item) => splitList(item.genres).includes(value))) await updateNovelGenres(novel.id, (items) => items.filter((item) => item !== value)); setToast("Genre removed from novels."); load(); } catch (error) { setToast(error.message); } }
  async function attachExisting(value) { if (!selected.length) { setToast("Select novels first."); return; } try { for (const id of selected) await updateNovelGenres(id, (items) => [...items, value]); setSelected([]); setToast("Genre attached to selected novels."); load(); } catch (error) { setToast(error.message); } }
  return <main className="admin-shell"><div className="admin-header"><div><h1>🏷️ Genres</h1><p className="admin-muted">Genres are managed through the existing comma-separated novels.genres field for schema compatibility.</p></div><button className="admin-secondary" onClick={() => navigate("/admin")}>Back</button></div>{toast && <p className="admin-toast">{toast}</p>}<section className="admin-form"><div className="admin-form-grid"><label>New genre<input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Fantasy" /></label><label className="admin-full">Novels<select multiple value={selected} onChange={(e) => setSelected([...e.target.selectedOptions].map((option) => option.value))}>{novels.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}</select></label></div><button type="button" onClick={addGenre}>Add genre to selected novels</button></section><section className="admin-grid"><article className="admin-stat"><h2>Existing genres</h2>{genres.length ? <div className="admin-chip-list">{genres.map((item) => <span className="admin-chip" key={item}>{item}<button type="button" onClick={() => attachExisting(item)}>Attach</button><button type="button" onClick={() => renameGenre(item)}>Rename</button><button type="button" className="admin-danger" onClick={() => deleteGenre(item)}>Delete</button></span>)}</div> : <p className="empty-state">No genres found.</p>}</article></section></main>;
}
export default AdminTaxonomy;
