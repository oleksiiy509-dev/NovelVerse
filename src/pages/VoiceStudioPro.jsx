import { useEffect, useRef, useState } from "react";
import { defaultVoiceStudioProfile, normalizeStudioProfile, readStudioProfiles, saveStudioProfile, voiceStudioSynthesisOptions } from "../lib/voiceStudioPro.js";
import { getVoiceWorkerHealth, synthesizeVoiceWorkerAudio } from "../lib/voiceWorker.js";
import "../styles/VoiceStudioPro.css";

const defaultText = "Beyond the last ridge, the forgotten city waited in silence. Somewhere below, an ancient bell began to ring.";
const controls = [
  ["speed", "Speed", 0.5, 1.5, 0.01, (value) => `${value.toFixed(2)}×`],
  ["pitch", "Pitch", 0.5, 1.5, 0.01, (value) => value.toFixed(2)],
  ["energy", "Energy", 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
  ["pauseLength", "Pause length", 0, 1200, 10, (value) => `${value} ms`],
];

export default function VoiceStudioPro() {
  const [text, setText] = useState(defaultText);
  const [profile, setProfile] = useState(() => normalizeStudioProfile(defaultVoiceStudioProfile));
  const [profiles, setProfiles] = useState(() => readStudioProfiles());
  const [loadId, setLoadId] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [status, setStatus] = useState("Ready for local synthesis.");
  const [busy, setBusy] = useState("");
  const [worker, setWorker] = useState({ online: false, providers: [] });
  const controllerRef = useRef();

  useEffect(() => {
    getVoiceWorkerHealth().then(setWorker).catch(() => setWorker({ online: false, providers: [] }));
    return () => { controllerRef.current?.abort(); if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const render = async (preview) => {
    if (!text.trim()) return setStatus("Enter test text before generating audio.");
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setBusy(preview ? "preview" : "sample");
    setStatus(`${preview ? "Previewing" : "Generating sample"} with the local engine chain…`);
    try {
      const result = await synthesizeVoiceWorkerAudio({
        text, provider: "narrator", voice: profile.voice, language: profile.language,
        preview, signal: controllerRef.current.signal, options: voiceStudioSynthesisOptions(profile),
      });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const nextUrl = URL.createObjectURL(result.blob);
      setAudioUrl(nextUrl);
      setStatus(`${result.metadata?.provider || "Local engine"} completed ${preview ? "the preview" : "the sample"}.`);
      if (preview) requestAnimationFrame(() => document.querySelector(".vsp-audio")?.play().catch(() => {}));
    } catch (error) {
      if (error.name !== "AbortError") setStatus(error.message || "The local voice worker is unavailable.");
    } finally { setBusy(""); }
  };

  const update = (key, value) => setProfile((current) => normalizeStudioProfile({ ...current, [key]: value }));
  const save = () => { const next = saveStudioProfile(profile); setProfiles(next); setLoadId(profile.id); setStatus(`${profile.name} saved on this device.`); };
  const load = () => { const selected = profiles.find(({ id }) => id === loadId); if (!selected) return setStatus("Choose a saved profile to load."); setProfile(selected); setStatus(`${selected.name} loaded from this device.`); };
  const available = new Set((worker.providers || []).filter(({ available }) => available).map(({ id }) => id);

  return <main className="vsp-shell">
    <header className="vsp-header">
      <div><p>VOICE LAB / LOCAL</p><h1>Voice Studio <span>PRO</span></h1><small>Shape a voice, audition the result, and keep every profile on your device.</small></div>
      <div className={`vsp-local ${worker.online ? "online" : ""}`}><i /> Local only · Worker {worker.online ? "online" : "offline"}</div>
    </header>

    <section className="vsp-grid">
      <article className="vsp-card vsp-script">
        <div className="vsp-card-title"><div><p>01 / TEST SCRIPT</p><h2>Give the voice something to say</h2></div><span>{text.length} characters</span></div>
        <label htmlFor="voice-test-text">Test text</label>
        <textarea id="voice-test-text" value={text} maxLength="5000" onChange={(event) => setText(event.target.value)} />
        <div className="vsp-actions">
          <button className="secondary" disabled={Boolean(busy)} onClick={() => render(true)}>{busy === "preview" ? "Previewing…" : "▶ Preview"}</button>
          <button disabled={Boolean(busy)} onClick={() => render(false)}>{busy === "sample" ? "Generating…" : "✦ Generate Sample"}</button>
        </div>
      </article>

      <aside className="vsp-card vsp-engine">
        <p>ENGINE ROUTING</p><h2>Local synthesis chain</h2>
        {[['fish-speech', 'Fish Speech', 'Primary'], ['kokoro', 'Kokoro', 'Fallback 01'], ['piper', 'Piper', 'Fallback 02']].map(([id, name, role], index) => <div className="vsp-engine-row" key={id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{name}</strong><small>{role}</small></span><i className={available.has(id) ? "ready" : ""}>{available.has(id) ? "READY" : "STANDBY"}</i></div>)}
        <small className="vsp-privacy">No cloud provider is used. The worker stays on your machine and falls back automatically.</small>
      </aside>

      <article className="vsp-card vsp-profile">
        <div className="vsp-card-title"><div><p>02 / VOICE PROFILE</p><h2>Direct the performance</h2></div><input aria-label="Profile name" value={profile.name} onChange={(event) => update("name", event.target.value)} /></div>
        <div className="vsp-controls">{controls.map(([key, label, min, max, step, format]) => <label key={key}><span>{label}<b>{format(profile[key])}</b></span><input type="range" min={min} max={max} step={step} value={profile[key]} onChange={(event) => update(key, event.target.value)} /></label>)}</div>
        <div className="vsp-profile-footer"><label>Language<select value={profile.language} onChange={(event) => update("language", event.target.value)}>{["en", "uk", "de", "es", "fr", "it", "pt", "ru", "ja"].map((language) => <option key={language}>{language}</option>)}</select></label><div><button className="secondary" onClick={save}>Save Profile</button><select aria-label="Saved profiles" value={loadId} onChange={(event) => setLoadId(event.target.value)}><option value="">Saved profiles…</option>{profiles.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button onClick={load}>Load Profile</button></div></div>
      </article>

      <article className="vsp-card vsp-output">
        <div><p>03 / OUTPUT</p><h2>Sample monitor</h2></div>
        <div className="vsp-wave" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 29) % 58)}%` }} />)}</div>
        <audio className="vsp-audio" controls src={audioUrl}>Your browser does not support audio playback.</audio>
        <p className="vsp-status" role="status">● {status}</p>
      </article>
    </section>
  </main>;
}
