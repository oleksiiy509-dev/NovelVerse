import { useParams } from "react-router-dom";
import NovelForm from "../components/NovelForm";
import { useAdminRecord } from "../hooks/useAdminRecord";
import "../styles/AdminPanel.css";
function EditNovel() { const { id } = useParams(); const { data: novel, error, loading, retry } = useAdminRecord("novels", id); return <main className="admin-shell" aria-busy={loading}><h1>✏️ Редагувати новелу</h1>{loading ? <p className="loading-state" role="status">Завантаження…</p> : error ? <section className="error-state" role="alert"><h2>Новелу не завантажено</h2><p>{error}</p><button type="button" onClick={retry}>Спробувати ще раз</button></section> : <NovelForm key={id} initialNovel={novel} novelId={id} />}</main>; }
export default EditNovel;
