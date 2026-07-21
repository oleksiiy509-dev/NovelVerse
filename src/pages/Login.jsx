import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import { supabase } from "../lib/supabase";
import { isAdminUser } from "../lib/admin";
import { openTelegramLogin } from "../lib/telegram";
import "../styles/Login.css";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const adminOnly = searchParams.get("admin") === "1";
  const { isTelegram, user: telegramUser, localUser } = useTelegram();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function signUp() {
    if (submitting) return;
    if (adminOnly) {
      setMessage("Адміністраторів створюють у Supabase. Увійдіть адміністраторським акаунтом.");
      return;
    }
    if (!username.trim()) {
      setMessage("Введіть ім'я користувача.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
    if (error) {
      setMessage("Не вдалося зареєструватися. Перевірте email і пароль.");
      setSubmitting(false);
      return;
    }
    if (data.user) await supabase.from("profiles").insert({ id: data.user.id, username });
    setSubmitting(false);
    navigate("/");
  }

  async function signIn() {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("Не вдалося увійти. Перевірте email і пароль.");
      setSubmitting(false);
      return;
    }
    if (adminOnly && !isAdminUser(data.user)) {
      await supabase.auth.signOut();
      setMessage("Цей акаунт не має прав адміністратора.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    navigate(adminOnly ? (location.state?.from || "/admin") : "/");
  }

  function telegramLogin() {
    if (telegramUser) navigate(location.state?.from || "/profile");
    else if (!openTelegramLogin()) setMessage("Telegram Login доступний у Mini App або з налаштованим VITE_TELEGRAM_BOT_USERNAME.");
  }

  return (
    <main className="login">
      <h1>{adminOnly ? "🛡️ Вхід адміністратора" : "🔐 Авторизація"}</h1>
      {adminOnly && <p>Доступ до панелі мають лише користувачі з роллю <strong>admin</strong>, прапорцем <strong>is_admin</strong> або email у <strong>VITE_ADMIN_EMAILS</strong>.</p>}
      {!adminOnly && isTelegram && (
        <section className="login__telegram">
          <h2>Telegram</h2>
          {telegramUser ? <p>Ви увійшли як <strong>{localUser?.user_metadata?.username}</strong>. NovelVerse автоматично синхронізує прогрес, закладки й налаштування в Telegram Cloud Storage.</p> : <p>Увійдіть через Telegram, щоб NovelVerse міг автоматично визначити ваш профіль.</p>}
          <button type="button" onClick={telegramLogin}>Продовжити з Telegram</button>
        </section>
      )}
      {!adminOnly && <label>Ім'я користувача<input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>}
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={adminOnly ? "current-password" : "new-password"} /></label>
      {message && <p className="login__message" role="alert">{message}</p>}
      <button type="button" onClick={signIn} disabled={submitting}>{adminOnly ? "Увійти як адміністратор" : "Увійти"}</button>
      {!adminOnly && <button type="button" onClick={signUp} disabled={submitting}>Зареєструватися</button>}
      <button type="button" className="login__secondary" onClick={() => navigate("/")}>⬅ На головну</button>
    </main>
  );
}

export default Login;
