import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import ChapterForm from "../components/ChapterForm";
import "../styles/AdminPanel.css";
function EditChapter() { const { id } = useParams(); const [chapter,setChapter]=useState(null); useEffect(()=>{ supabase.from("chapters").select("*").eq("id", id).single().then(({data,error})=> error ? alert(error.message) : setChapter(data)); },[id]); return <main className="admin-shell"><h1>✏️ Редагувати главу</h1>{chapter ? <ChapterForm key={id} initialChapter={chapter} chapterId={id} /> : <p className="loading-state">Завантаження...</p>}</main>; }
export default EditChapter;
