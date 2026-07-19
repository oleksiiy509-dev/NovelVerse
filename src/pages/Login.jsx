import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useLocation, useNavigate } from "react-router-dom";
import { isAdminUser } from "../lib/admin";
import "../styles/Login.css";

function Login() {
  const navigate = useNavigate(); const location = useLocation();
  const adminOnly = useMemo(() => new URLSearchParams(location.search).get("admin") === "1", [location.search]);
  const [username, setUsername] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  async function signUp() { if (adminOnly) return alert("Адміністраторів створюють у Supabase. Увійдіть адміністраторським акаунтом."); if (!username.trim()) return alert("Введіть ім'я користувача."); const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } }); if (error) return alert(error.message); if (data.user) await supabase.from("profiles").insert({ id: data.user.id, username }); alert("Реєстрація успішна!"); navigate("/"); }
  async function signIn() { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) return alert(error.message); if (adminOnly && !isAdminUser(data.user)) { await supabase.auth.signOut(); return alert("Цей акаунт не має прав адміністратора."); } navigate(adminOnly ? (location.state?.from || "/admin") : "/"); }
  return <main className="login"><h1>{adminOnly ? "🛡️ Вхід адміністратора" : "🔐 Авторизація"}</h1>{adminOnly && <p>Доступ до панелі мають лише користувачі з роллю <strong>admin</strong>, прапорцем <strong>is_admin</strong> або email у <strong>VITE_ADMIN_EMAILS</strong>.</p>}{!adminOnly && <input type="text" placeholder="Ім'я користувача" value={username} onChange={(e)=>setUsername(e.target.value)} />}<input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} /><input type="password" placeholder="Пароль" value={password} onChange={(e)=>setPassword(e.target.value)} /><button onClick={signIn}>{adminOnly ? "Увійти як адміністратор" : "Увійти"}</button>{!adminOnly && <button onClick={signUp}>Зареєструватися</button>}<button className="login__secondary" onClick={()=>navigate("/")}>⬅ На головну</button></main>;
}
export default Login;
