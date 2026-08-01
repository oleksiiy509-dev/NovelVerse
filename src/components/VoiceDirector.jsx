import { useEffect, useMemo, useRef, useState } from "react";
import { loadManagedBooks } from "../lib/bookManagement";
import { directorStorageKey, EMOTIONS, estimateDuration, analyzeChapters, parseDirectorJson, validateSegments, VOICES } from "../lib/voiceDirectorLocal";
import ChapterGeneration from "./ChapterGeneration";

const EMPTY = { version: 1, characters: [], segments: [] };
const optionValues = {
  gender: ["Unspecified", "Female", "Male", "Non-binary"],
  age: ["Child", "Teen", "Young adult", "Adult", "Senior"],
  narrationStyle: ["Natural", "Storytelling", "Conversational", "Dramatic", "Documentary"],
};
const segmentTypes = ["Narration", "Dialogue", "Thought"];
const newId = () => globalThis.crypto?.randomUUID?.() || `segment-${Date.now()}`;

function readDirector(bookId) {
  try { return parseDirectorJson(localStorage.getItem(directorStorageKey(bookId))); }
  catch { return EMPTY; }
}

export default function VoiceDirector() {
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [director, setDirector] = useState(EMPTY);
  const [notice, setNotice] = useState("");
  const importRef = useRef(null);
  const book = books.find((item) => String(item.id) === bookId);
  const chapter = book?.chapters.find((item) => String(item.id) === chapterId);
  const warnings = useMemo(() => validateSegments(director.segments, director.characters), [director.segments, director.characters]);

  useEffect(() => {
    loadManagedBooks().then((items) => {
      setBooks(items);
      if (items[0]) { setBookId(String(items[0].id)); setChapterId(String(items[0].chapters[0]?.id || "")); }
    }).catch((error) => setNotice(error.message));
  }, []);
  useEffect(() => { if (bookId) setDirector(readDirector(bookId)); }, [bookId]);

  const analyze = (chapters, label) => {
    if (!chapters.length) { setNotice("No chapter text is available to analyze."); return; }
    setDirector(analyzeChapters(chapters));
    setNotice(`${label} analyzed locally. Review the detected speakers before saving.`);
  };
  const patchCharacter = (id, patch) => setDirector((current) => {
    const existing = current.characters.find((item) => item.id === id);
    return {
      ...current,
      characters: current.characters.map((item) => item.id === id ? { ...item, ...patch } : item),
      segments: patch.voice ? current.segments.map((item) => item.speaker === existing?.name ? { ...item, voice: patch.voice } : item) : current.segments,
    };
  });
  const patchSegment = (id, patch) => setDirector((current) => ({ ...current, segments: current.segments.map((item) => item.id === id ? { ...item, ...patch, estimatedDuration: estimateDuration(patch.text ?? item.text) } : item) }));
  const changeSpeaker = (segment, speaker) => {
    const character = director.characters.find((item) => item.name === speaker);
    patchSegment(segment.id, { speaker, voice: character?.voice || "" });
  };
  const merge = (index) => setDirector((current) => {
    if (index >= current.segments.length - 1) return current;
    const segments = [...current.segments];
    const text = `${segments[index].text} ${segments[index + 1].text}`.trim();
    segments.splice(index, 2, { ...segments[index], text, estimatedDuration: estimateDuration(text) });
    return { ...current, segments };
  });
  const split = (index) => setDirector((current) => {
    const source = current.segments[index];
    const middle = Math.floor(source.text.length / 2);
    const candidates = [source.text.lastIndexOf(" ", middle), source.text.indexOf(" ", middle)].filter((value) => value > 0);
    const at = candidates.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0];
    if (!at) { setNotice("This segment is too short to split."); return current; }
    const segments = [...current.segments];
    const first = source.text.slice(0, at).trim(); const second = source.text.slice(at).trim();
    segments.splice(index, 1, { ...source, id: newId(), text: first, estimatedDuration: estimateDuration(first) }, { ...source, id: newId(), text: second, estimatedDuration: estimateDuration(second) });
    return { ...current, segments };
  });
  const move = (index, offset) => setDirector((current) => {
    const destination = index + offset;
    if (destination < 0 || destination >= current.segments.length) return current;
    const segments = [...current.segments];
    [segments[index], segments[destination]] = [segments[destination], segments[index]];
    return { ...current, segments };
  });
  const addSegment = () => setDirector((current) => {
    const narrator = current.characters.find((item) => item.name === "Narrator");
    const fallbackNarrator = { id: "character-narrator", name: "Narrator", voice: "Narrator", gender: "Unspecified", age: "Adult", narrationStyle: "Storytelling", speed: 1, pitch: 0, volume: 1 };
    return { ...current, characters: narrator ? current.characters : [fallbackNarrator, ...current.characters], segments: [...current.segments, { id: newId(), chapterId: chapter?.id || "", chapterTitle: chapter?.title || "Manual", type: "Narration", speaker: "Narrator", emotion: "Neutral", voice: narrator?.voice || "Narrator", text: "", estimatedDuration: 1 }] };
  });
  const save = () => {
    if (!bookId) return;
    localStorage.setItem(directorStorageKey(bookId), JSON.stringify({ ...director, updatedAt: new Date().toISOString() }));
    setNotice("Director saved in this browser.");
  };
  const reset = () => {
    if (bookId) localStorage.removeItem(directorStorageKey(bookId));
    setDirector(EMPTY); setNotice("Director reset.");
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(director, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${book?.title || "book"}-voice-director.json`; link.click(); URL.revokeObjectURL(url);
  };
  const importJson = async (file) => {
    try { setDirector(parseDirectorJson(await file.text())); setNotice("Director JSON imported locally."); }
    catch (error) { setNotice(error.message); }
  };

  return <div className="voice-director">
    <header><div><h2>Voice Director</h2><p>Detect speakers and prepare editable voice direction locally. No audio is generated.</p></div><span>Local only</span></header>
    {notice && <p className="voice-director__notice" role="status">{notice}</p>}
    <div className="voice-director__selectors">
      <label>Book<select value={bookId} onChange={(event) => { const next = books.find((item) => String(item.id) === event.target.value); setBookId(event.target.value); setChapterId(String(next?.chapters[0]?.id || "")); }}>{books.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <label>Chapter<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>{(book?.chapters || []).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
    </div>
    <div className="voice-director__actions">
      <button onClick={() => analyze(chapter ? [chapter] : [], "Chapter")}>Analyze Chapter</button>
      <button onClick={() => analyze(book?.chapters || [], "Book")}>Analyze Book</button>
      <button onClick={save} disabled={!director.segments.length}>Save Director</button>
      <button className="secondary" onClick={addSegment} disabled={!bookId}>Add Segment</button>
      <button className="secondary" onClick={reset}>Reset</button>
      <button className="secondary" onClick={exportJson} disabled={!director.segments.length}>Export Director JSON</button>
      <button className="secondary" onClick={() => importRef.current?.click()}>Import Director JSON</button>
      <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files[0] && importJson(event.target.files[0])}/>
    </div>

    <section className="voice-director__section"><div className="voice-director__heading"><div><h3>Characters</h3><p>{director.characters.length} detected speakers</p></div></div>
      <div className="voice-director__characters">{director.characters.map((character) => <article key={character.id}><strong>{character.name}</strong>
        <p className="voice-director__appearances">{character.lineCount ?? 0} lines · first segment {character.firstAppearance ?? "—"} · last segment {character.lastAppearance ?? "—"}</p>
        <label>Selected voice<select value={character.voice} onChange={(event) => patchCharacter(character.id, { voice: event.target.value })}>{VOICES.map((voice) => <option key={voice}>{voice}</option>)}</select></label>
        {Object.entries(optionValues).map(([field, values]) => <label key={field}>{field === "narrationStyle" ? "Narration style" : field[0].toUpperCase() + field.slice(1)}<select value={character[field]} onChange={(event) => patchCharacter(character.id, { [field]: event.target.value })}>{values.map((value) => <option key={value}>{value}</option>)}</select></label>)}
        <label>Speaking speed<input type="number" min="0.5" max="2" step="0.05" value={character.speed} onChange={(event) => patchCharacter(character.id, { speed: Number(event.target.value) })}/></label>
        <label>Pitch<input type="number" min="-1" max="1" step="0.1" value={character.pitch} onChange={(event) => patchCharacter(character.id, { pitch: Number(event.target.value) })}/></label>
        <label>Volume<input type="number" min="0" max="1" step="0.05" value={character.volume} onChange={(event) => patchCharacter(character.id, { volume: Number(event.target.value) })}/></label>
      </article>)}</div>
    </section>

    <section className="voice-director__section"><div className="voice-director__heading"><div><h3>Segment preview</h3><p>{director.segments.length} segments · {warnings.length} warnings</p></div>{warnings.length > 0 && <span className="voice-director__warning">Review required</span>}</div>
      <div className="voice-director__segments">{director.segments.map((segment, index) => { const character = director.characters.find((item) => item.name === segment.speaker); const segmentWarnings = warnings.filter((item) => item.segmentId === segment.id); return <article key={segment.id} className={segmentWarnings.length ? "has-warning" : ""}>
        <div className="voice-director__segment-meta"><small>{segment.chapterTitle}</small><span>~{estimateDuration(segment.text, character?.speed)} sec</span></div>
        <div className="voice-director__segment-fields"><label>Type<select value={segment.type || "Narration"} onChange={(event) => patchSegment(segment.id, { type: event.target.value })}>{segmentTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Speaker<select value={segment.speaker} onChange={(event) => changeSpeaker(segment, event.target.value)}><option value="">Missing</option>{director.characters.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Emotion<select value={segment.emotion} onChange={(event) => patchSegment(segment.id, { emotion: event.target.value })}>{EMOTIONS.map((emotion) => <option key={emotion}>{emotion}</option>)}</select></label><label>Voice<select value={segment.voice} onChange={(event) => patchSegment(segment.id, { voice: event.target.value })}><option value="">Missing</option>{VOICES.map((voice) => <option key={voice}>{voice}</option>)}</select></label></div>
        <label>Text<textarea rows="3" value={segment.text} onChange={(event) => patchSegment(segment.id, { text: event.target.value })}/></label>
        {segmentWarnings.length > 0 && <ul>{segmentWarnings.map((warning) => <li key={warning.message}>⚠ {warning.message}</li>)}</ul>}
        <div className="voice-director__segment-actions"><button aria-label="Move segment up" className="secondary" onClick={() => move(index, -1)} disabled={index === 0}>Move up</button><button aria-label="Move segment down" className="secondary" onClick={() => move(index, 1)} disabled={index === director.segments.length - 1}>Move down</button><button className="secondary" onClick={() => merge(index)} disabled={index === director.segments.length - 1}>Merge with next</button><button className="secondary" onClick={() => split(index)}>Split segment</button><button className="danger" onClick={() => setDirector((current) => ({ ...current, segments: current.segments.filter((item) => item.id !== segment.id) }))}>Delete</button></div>
      </article>; })}</div>
      {!director.segments.length && <div className="voice-director__empty">Choose an imported book and analyze a chapter or the entire book.</div>}
    </section>
    <ChapterGeneration book={book} chapter={chapter} segments={director.segments}/>
  </div>;
}
