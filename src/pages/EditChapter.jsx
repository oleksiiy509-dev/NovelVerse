import { useParams } from "react-router-dom";
import ChapterForm from "../components/ChapterForm";
import { useAdminRecord } from "../hooks/useAdminRecord";
import "../styles/AdminPanel.css";
function EditChapter() { const { id } = useParams(); const { data: chapter, error, loading, retry } = useAdminRecord("chapters", id); return <main className="admin-shell" aria-busy={loading}><h1>✏️ Редагувати главу</h1>{loading ? <p className="loading-state" role="status">Завантаження…</p> : error ? <section className="error-state" role="alert"><h2>Главу не завантажено</h2><p>{error}</p><button type="button" onClick={retry}>Спробувати ще раз</button></section> : <ChapterForm key={id} initialChapter={chapter} chapterId={id} />}</main>; }
export default EditChapter;
