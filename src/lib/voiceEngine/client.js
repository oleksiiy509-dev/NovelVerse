import { supabase } from "../supabase";
export async function fetchVoiceCharacters(novelId) { if (!novelId) return []; const { data, error } = await supabase.from("voice_characters").select("*").eq("novel_id", novelId).order("display_name"); if (error) return []; return data || []; }
export async function fetchChapterVoiceSegments(chapterId) { if (!chapterId) return []; const { data, error } = await supabase.from("chapter_voice_segments").select("*").eq("chapter_id", chapterId).order("segment_index"); if (error) return []; return data || []; }
export async function analyzeChapterOnServer(chapterId, options = {}) { const { data, error } = await supabase.functions.invoke("analyze-chapter-voice", { body: { chapter_id: chapterId, force: !!options.force } }); if (error) throw error; return data; }
export async function saveVoiceSegmentEdits(segments) { const payload = segments.map((s) => ({ id: s.id, segment_type: s.segment_type || s.segmentType || s.type, speaker_id: s.speaker_id || s.speakerId || null, speaker_name: s.speaker_name || s.speakerName || "Невідомий", voice_profile: s.voice_profile || s.voiceProfile || "unknown_neutral", emotion: s.emotion || "neutral", intensity: Number(s.intensity) || 0, text: s.text || "", manually_edited: true, updated_at: new Date().toISOString() })); const { error } = await supabase.from("chapter_voice_segments").upsert(payload); if (error) throw error; return payload; }
export async function saveVoiceCharacter(character) { const payload = { ...character, aliases: Array.isArray(character.aliases) ? character.aliases : String(character.aliases || "").split(",").map((v) => v.trim()).filter(Boolean), manually_verified: !!character.manually_verified }; const { data, error } = await supabase.from("voice_characters").upsert(payload).select("*").single(); if (error) throw error; return data; }
export async function deleteVoiceCharacter(id) { const { error } = await supabase.from("voice_characters").delete().eq("id", id); if (error) throw error; }

export async function fetchNovelVoiceCast(novelId) { if (!novelId) return []; const { data, error } = await supabase.from("novel_voice_cast").select("*").eq("novel_id", novelId).order("cast_slot"); if (error) return []; return data || []; }
export async function saveNovelVoiceCastEntry(entry) { const { data, error } = await supabase.from("novel_voice_cast").upsert(entry).select("*").single(); if (error) throw error; return data; }
export async function deleteNovelVoiceCastEntry(id) { const { error } = await supabase.from("novel_voice_cast").delete().eq("id", id); if (error) throw error; }
export async function addVoiceCastAudit(entry) { const { error } = await supabase.from("voice_cast_audit").insert(entry); if (error) throw error; }

export async function fetchReadyDirectorPlan(chapterId, contentHash) {
  if (!chapterId) return null;
  let query = supabase.from("chapter_director_plans").select("*, director_scenes(*), director_segment_settings(*)").eq("chapter_id", chapterId).eq("status", "ready").order("created_at", { ascending: false }).limit(1);
  if (contentHash) query = query.eq("content_hash", contentHash);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data;
}
export async function saveDirectorPlan(plan) {
  const { data, error } = await supabase.from("chapter_director_plans").upsert({ id: plan.id, chapter_id: plan.chapterId, novel_id: plan.novelId, analysis_version: plan.analysisVersion || null, director_version: plan.version, language: plan.language, scene_count: plan.statistics?.sceneCount || plan.scenes?.length || 0, total_segments: plan.statistics?.totalSegments || plan.segmentSettings?.length || 0, average_intensity: plan.statistics?.averageIntensity || 0, status: plan.status || "ready", warnings: plan.warnings || [], statistics: plan.statistics || {}, content_hash: plan.contentHash, manually_edited: !!plan.manuallyEdited }).select("*").single();
  if (error) throw error;
  const sceneRows = (plan.scenes || []).map((s) => ({ director_plan_id: data.id, chapter_id: plan.chapterId, novel_id: plan.novelId, scene_index: s.sceneIndex, scene_type: s.sceneType, title: s.title, start_segment_index: s.startSegmentIndex, end_segment_index: s.endSegmentIndex, intensity: s.intensity, pace: s.pace, atmosphere_profile: s.atmosphereProfile, ambience_volume: s.ambienceVolume, notes: s.notes || null, manually_edited: !!s.manuallyEdited }));
  const { data: savedScenes, error: sceneError } = await supabase.from("director_scenes").upsert(sceneRows).select("*");
  if (sceneError) throw sceneError;
  const sceneByIndex = new Map((savedScenes || []).map((s) => [s.scene_index, s.id]));
  const segmentRows = (plan.segmentSettings || []).map((s) => ({ director_plan_id: data.id, scene_id: sceneByIndex.get((plan.scenes || []).find((sc) => s.segmentIndex >= sc.startSegmentIndex && s.segmentIndex <= sc.endSegmentIndex)?.sceneIndex) || null, voice_segment_id: s.voiceSegmentId, segment_index: s.segmentIndex, cast_slot: s.castSlot, voice_profile: s.voiceProfile, emotion: s.emotion, intensity: s.intensity, delivery_style: s.deliveryStyle, rate: s.rate, pitch: s.pitch, energy: s.energy, volume: s.volume, pause_before_ms: s.pauseBeforeMs, pause_after_ms: s.pauseAfterMs, emphasis: s.emphasis || [], sound_cues: s.soundCues || [], manually_edited: !!s.manuallyEdited }));
  const { error: segmentError } = await supabase.from("director_segment_settings").upsert(segmentRows);
  if (segmentError) throw segmentError;
  return data;
}
export async function invalidateDirectorPlan(chapterId, contentHash) { const { error } = await supabase.from("chapter_director_plans").update({ status: "outdated", updated_at: new Date().toISOString() }).eq("chapter_id", chapterId).neq("content_hash", contentHash); if (error) throw error; }
export async function updateDirectorScene(id, patch) { const { data, error } = await supabase.from("director_scenes").update({ ...patch, manually_edited: true, updated_at: new Date().toISOString() }).eq("id", id).select("*").single(); if (error) throw error; return data; }
export async function updateSegmentPerformance(id, patch) { const { data, error } = await supabase.from("director_segment_settings").update({ ...patch, manually_edited: true, updated_at: new Date().toISOString() }).eq("id", id).select("*").single(); if (error) throw error; return data; }
