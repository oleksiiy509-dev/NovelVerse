import { useMemo, useState } from "react";
import { fetchNovelVoiceCast, fetchVoiceCharacters, saveNovelVoiceCastEntry } from "../lib/voiceEngine/client";
import { exportVoicePreset, importVoicePreset, providerAdapterMap, resolveCharacterVoice, universalVoiceProfiles, voiceProviderAdapters } from "../lib/universalVoiceStudio";
import "../styles/AdminPanel.css";

const storageKey = "novelverse.universalVoiceStudio";
const emptyAssignments = {};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return { profiles: parsed.profiles || universalVoiceProfiles, assignments: parsed.assignments || emptyAssignments };
  } catch {
    return { profiles: universalVoiceProfiles, assignments: emptyAssignments };
  }
}

export default function UniversalVoiceStudio() {
  const initial = useMemo(() => loadState(), []);
  const [profiles, setProfiles] = useState(initial.profiles);
  const [assignments, setAssignments] = useState(initial.assignments);
  const [novelId, setNovelId] = useState("");
  const [characters, setCharacters] = useState([]);
  const [cast, setCast] = useState([]);
  const [previewText, setPreviewText] = useState("This is one sentence from the Universal Voice Studio.");
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [storyProgress, setStoryProgress] = useState(0);
  const [presetText, setPresetText] = useState("");
  const [notice, setNotice] = useState("");

  function persist(nextProfiles = profiles, nextAssignments = assignments) {
    localStorage.setItem(storageKey, JSON.stringify({ profiles: nextProfiles, assignments: nextAssignments }));
  }

  async function loadCharacters() {
    if (!novelId) return;
    const [nextCharacters, nextCast] = await Promise.all([fetchVoiceCharacters(novelId), fetchNovelVoiceCast(novelId)]);
    setCharacters(nextCharacters);
    setCast(nextCast);
    setSelectedCharacter(nextCharacters[0]?.id || "");
    setNotice(`Loaded ${nextCharacters.length} characters and ${nextCast.length} persistent voice assignments.`);
  }

  function updateProfile(id, field, value) {
    const next = profiles.map((profile) => profile.id === id ? { ...profile, [field]: field.includes("Modifier") ? Number(value) : value } : profile);
    setProfiles(next);
    persist(next, assignments);
  }

  function updateAssignment(characterId, patch) {
    const next = { ...assignments, [characterId]: { assignmentMode: "automatic", ...(assignments[characterId] || {}), ...patch } };
    setAssignments(next);
    persist(profiles, next);
  }

  async function saveCharacterAssignment(character) {
    const resolved = resolveCharacterVoice({ character, assignment: assignments[character.id], profiles, storyProgress: Number(storyProgress) });
    const existing = cast.find((entry) => String(entry.character_id) === String(character.id));
    const saved = await saveNovelVoiceCastEntry({
      ...(existing || {}), novel_id: Number(novelId), character_id: character.id, cast_slot: existing?.cast_slot || `universal_${character.id}`,
      voice_profile: resolved.id, provider_voice_id: resolved.voice, provider_voice_mappings: { [resolved.provider]: { model: resolved.model, voice: resolved.voice }, fallbackProvider: resolved.fallbackProvider },
      pitch_offset: resolved.pitchModifier - 1, rate_offset: resolved.speedModifier - 1, energy: resolved.energyModifier,
      assignment_source: resolved.assignmentMode === "custom" ? "manual" : "automatic", manually_locked: resolved.assignmentMode === "custom",
    });
    setCast((rows) => [...rows.filter((entry) => entry.id !== saved.id), saved]);
    setNotice(`${character.display_name || character.canonical_name} now uses ${resolved.label}; consistency is preserved until manually changed.`);
  }

  function preview() {
    const character = characters.find((item) => String(item.id) === String(selectedCharacter));
    const resolved = resolveCharacterVoice({ character, assignment: assignments[selectedCharacter], profiles, storyProgress: Number(storyProgress) });
    if (!("speechSynthesis" in window)) {
      setNotice(`Preview adapter ${resolved.provider} is configured, but this browser has no SpeechSynthesis support.`);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(previewText.split(/[.!?]/)[0] || previewText);
    utterance.pitch = resolved.pitchModifier;
    utterance.rate = resolved.speedModifier;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setNotice(`Previewing ${resolved.label} through provider-agnostic browser playback.`);
  }

  function doExport() {
    setPresetText(exportVoicePreset(profiles, assignments));
    setNotice("Voice profile preset exported.");
  }

  function doImport() {
    const imported = importVoicePreset(presetText);
    setProfiles(imported.profiles);
    setAssignments(imported.assignments);
    persist(imported.profiles, imported.assignments);
    setNotice("Voice profile preset imported.");
  }

  const selected = characters.find((item) => String(item.id) === String(selectedCharacter));
  const resolved = resolveCharacterVoice({ character: selected, assignment: assignments[selectedCharacter], profiles, storyProgress: Number(storyProgress) });

  return <main className="admin-shell"><div className="admin-header"><div><h1>🎚️ Universal Voice Studio</h1><p className="admin-muted">Provider-neutral voices for reusable profiles, persistent character assignments, previews, and gradual character evolution.</p></div></div>{notice && <p className="admin-toast">{notice}</p>}<section className="admin-grid"><article className="admin-stat"><h2>Provider Status</h2>{voiceProviderAdapters.map((adapter) => <p key={adapter.id}><strong>{adapter.label}</strong><br /><span className="admin-muted">Models: {adapter.models.join(", ")} · Voices: {adapter.voices.join(", ")}</span></p>)}</article><article className="admin-stat"><h2>Character Voices</h2><label>Novel ID<input value={novelId} onChange={(event) => setNovelId(event.target.value)} placeholder="Novel id" /></label><button onClick={loadCharacters}>Load character cast</button><label>Story progress / chapter step<input type="number" min="0" value={storyProgress} onChange={(event) => setStoryProgress(event.target.value)} /></label></article></section><section className="admin-form"><h2>Voice Profiles</h2>{profiles.map((profile) => <div className="admin-form-grid" key={profile.id}><strong>{profile.label}</strong><select value={profile.provider} onChange={(event) => updateProfile(profile.id, "provider", event.target.value)}>{voiceProviderAdapters.map((adapter) => <option key={adapter.id} value={adapter.id}>{adapter.label}</option>)}</select><select value={profile.model} onChange={(event) => updateProfile(profile.id, "model", event.target.value)}>{(providerAdapterMap[profile.provider]?.models || [profile.model]).map((model) => <option key={model}>{model}</option>)}</select><input value={profile.voice} onChange={(event) => updateProfile(profile.id, "voice", event.target.value)} /><label>Pitch<input type="number" step="0.01" value={profile.pitchModifier} onChange={(event) => updateProfile(profile.id, "pitchModifier", event.target.value)} /></label><label>Speed<input type="number" step="0.01" value={profile.speedModifier} onChange={(event) => updateProfile(profile.id, "speedModifier", event.target.value)} /></label><label>Energy<input type="number" step="0.01" value={profile.energyModifier} onChange={(event) => updateProfile(profile.id, "energyModifier", event.target.value)} /></label><span>Emotion defaults: {profile.emotionDefaults.join(", ")} · Fallback: {profile.fallbackProvider}</span></div>)}</section><section className="admin-form"><h2>Character Assignment</h2>{characters.map((character) => { const assignment = assignments[character.id] || {}; const voice = resolveCharacterVoice({ character, assignment, profiles, storyProgress: Number(storyProgress) }); return <div className="admin-form-grid" key={character.id}><strong>{character.display_name || character.canonical_name}</strong><select value={assignment.assignmentMode || "automatic"} onChange={(event) => updateAssignment(character.id, { assignmentMode: event.target.value })}><option value="automatic">Automatic profile</option><option value="custom">Custom profile</option></select><select value={assignment.profileId || voice.id} disabled={(assignment.assignmentMode || "automatic") === "automatic"} onChange={(event) => updateAssignment(character.id, { profileId: event.target.value })}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select><label>Pitch / chapter<input type="number" step="0.01" value={assignment.evolution?.pitchPerChapter || 0} onChange={(event) => updateAssignment(character.id, { evolution: { ...(assignment.evolution || {}), pitchPerChapter: event.target.value } })} /></label><label>Speed / chapter<input type="number" step="0.01" value={assignment.evolution?.speedPerChapter || 0} onChange={(event) => updateAssignment(character.id, { evolution: { ...(assignment.evolution || {}), speedPerChapter: event.target.value } })} /></label><label>Energy / chapter<input type="number" step="0.01" value={assignment.evolution?.energyPerChapter || 0} onChange={(event) => updateAssignment(character.id, { evolution: { ...(assignment.evolution || {}), energyPerChapter: event.target.value } })} /></label><span>{voice.label}: {voice.provider}/{voice.model}/{voice.voice}</span><button onClick={() => saveCharacterAssignment(character)}>Save consistent voice</button></div>; })}</section><section className="admin-form"><h2>Preview</h2><select value={selectedCharacter} onChange={(event) => setSelectedCharacter(event.target.value)}>{characters.map((character) => <option key={character.id} value={character.id}>{character.display_name || character.canonical_name}</option>)}</select><textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} maxLength={220} /><p className="admin-muted">Resolved profile: {resolved.label} · {resolved.provider}/{resolved.model}/{resolved.voice} · pitch {resolved.pitchModifier.toFixed(2)} speed {resolved.speedModifier.toFixed(2)} energy {resolved.energyModifier.toFixed(2)}</p><button onClick={preview}>Preview one sentence</button></section><section className="admin-form"><h2>Import / Export</h2><div className="admin-actions"><button onClick={doExport}>Export presets</button><button onClick={doImport} disabled={!presetText.trim()}>Import presets</button></div><textarea className="admin-full" value={presetText} onChange={(event) => setPresetText(event.target.value)} placeholder="Preset JSON" /></section></main>;
}
