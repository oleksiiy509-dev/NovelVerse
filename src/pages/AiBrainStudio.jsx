import { useMemo, useState } from "react";
import { analyzeChapter } from "../lib/aiBrain";
import "../styles/AdminPanel.css";

const sample = "Lin Fan protected Mo Chen. Young Master Lin was wounded but became confident. Their enemy attacked again.";

function AiBrainStudio() {
  const [text, setText] = useState(sample);
  const [result, setResult] = useState(null);
  const stats = useMemo(() => result ? [
    ["Characters", result.characters.length], ["Relationships", result.relationships.length], ["Timeline states", result.states.length], ["Identity reviews", result.aliases.reviewQueue.length], ["Warnings", result.warnings.length],
  ] : [], [result]);
  async function runAnalysis() { setResult(await analyzeChapter({ novelId: "preview", chapterId: "preview", chapterNumber: 1, text, existingCharacters: [{ id: "lin_fan", canonical_name: "Lin Fan", aliases: [] }] })); }
  return <main className="admin-shell"><div className="admin-header"><div><h1>🧠 AI Brain Studio</h1><p className="admin-muted">Review character memory, aliases, relationships, timeline changes and voice evolution before updates are persisted.</p></div><button onClick={runAnalysis}>Analyze preview</button></div><textarea className="admin-input" rows="7" value={text} onChange={(e)=>setText(e.target.value)} />{result && <><section className="admin-stats-row">{stats.map(([label,value])=><article className="admin-stat admin-stat--compact" key={label}><strong>{value}</strong><span>{label}</span></article>)}</section><section className="admin-grid"><article className="admin-stat"><h2>Character list</h2>{result.characters.map(c=><p key={c.id}><strong>{c.canonical_name}</strong> <span className="admin-muted">confidence {c.confidence}</span><br/><small>Aliases: {c.aliases.join(", ") || "none"}</small></p>)}</article><article className="admin-stat"><h2>Relationship graph/list</h2>{result.relationships.map((r,i)=><p key={i}>{r.source_character_id} → {r.target_character_id}: <strong>{r.type}</strong> ({r.confidence})</p>)}</article><article className="admin-stat"><h2>Character timeline</h2>{result.states.map((s,i)=><p key={i}>{s.character_id}: {s.physical_state}, {s.emotional_state}, voice {s.voice_age}/{s.voice_stability}</p>)}</article><article className="admin-stat"><h2>Unresolved identity queue</h2>{result.aliases.reviewQueue.map((q,i)=><p key={i}>{q.notes} <button>Manual merge</button> <button>Undo merge</button></p>) || <p className="empty-state">No uncertain identities.</p>}</article><article className="admin-stat"><h2>Contradiction warnings</h2>{result.warnings.map((w,i)=><p key={i}>⚠️ {w.message}</p>) || <p className="empty-state">No warnings.</p>}</article><article className="admin-stat"><h2>Manual state correction</h2><p className="admin-muted">Corrections append a new timeline row instead of overwriting historical states.</p><button>Save correction</button></article></section></>}</main>;
}
export default AiBrainStudio;
