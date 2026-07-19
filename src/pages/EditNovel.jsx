import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import NovelForm from "../components/NovelForm";
import "../styles/AdminPanel.css";
function EditNovel() { const { id } = useParams(); const [novel, setNovel] = useState(null); useEffect(()=>{ supabase.from("novels").select("*").eq("id", id).single().then(({data,error})=> error ? alert(error.message) : setNovel(data)); }, [id]); return <main className="admin-shell"><h1>✏️ Редагувати новелу</h1>{novel ? <NovelForm key={id} initialNovel={novel} novelId={id} /> : <p className="loading-state">Завантаження...</p>}</main>; }
export default EditNovel;
