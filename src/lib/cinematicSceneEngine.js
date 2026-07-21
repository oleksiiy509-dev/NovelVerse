const sceneLexicon = {
  battle: ["battle", "sword", "blood", "army", "duel", "fight", "war", "strike"], romance: ["kiss", "love", "heart", "embrace", "beloved", "romance"], horror: ["horror", "scream", "ghost", "terror", "nightmare", "corpse"], mystery: ["mystery", "secret", "clue", "shadow", "whisper", "unknown"], comedy: ["laugh", "joke", "grin", "funny", "comedy"], travel: ["road", "journey", "horse", "wagon", "travel"], city: ["city", "street", "crowd", "alley"], forest: ["forest", "trees", "woods", "leaves"], rain: ["rain", "drizzle", "downpour"], storm: ["storm", "thunder", "lightning"], cave: ["cave", "cavern"], dungeon: ["dungeon", "cell", "chains"], tavern: ["tavern", "inn", "ale"], palace: ["palace", "throne", "court"], marketplace: ["market", "marketplace", "merchant"], ocean: ["ocean", "sea", "waves", "ship"], night: ["night", "moon", "darkness"], day: ["day", "sun", "morning"], silence: ["silence", "silent", "stillness"]
};

export const cinematicSceneTypes = Object.keys(sceneLexicon);
export const cinematicLayers = ["voice", "ambience", "dialogue", "effects", "music", "silence"];
export const cinematicMoods = ["happy", "sad", "tense", "horror", "victory", "romance"];

export const ambientLibrary = {
  nature: { rain: "ambience/nature/rain.loop", wind: "ambience/nature/wind.loop", birds: "ambience/nature/birds.loop", river: "ambience/nature/river.loop", forest: "ambience/nature/forest.loop" },
  city: { crowd: "ambience/city/crowd.loop", carriage: "ambience/city/carriage.loop", market: "ambience/city/market.loop", footsteps: "ambience/city/footsteps.loop" },
  buildings: { tavern: "ambience/buildings/tavern.loop", palace: "ambience/buildings/palace.loop", temple: "ambience/buildings/temple.loop", dungeon: "ambience/buildings/dungeon.loop" },
  combat: { swords: "effects/combat/swords.hit", magic: "effects/combat/magic.burst", explosions: "effects/combat/explosions.hit", monsters: "effects/combat/monsters.growl" }
};

const sceneAmbience = { battle: ["combat", "swords"], horror: ["buildings", "dungeon"], mystery: ["nature", "wind"], city: ["city", "crowd"], forest: ["nature", "forest"], rain: ["nature", "rain"], storm: ["nature", "wind"], dungeon: ["buildings", "dungeon"], tavern: ["buildings", "tavern"], palace: ["buildings", "palace"], marketplace: ["city", "market"], ocean: ["nature", "river"], travel: ["city", "carriage"], day: ["nature", "birds"] };
const sceneMood = { battle: "tense", horror: "horror", romance: "romance", comedy: "happy", mystery: "tense", palace: "victory", storm: "tense", rain: "sad" };
const effectsByScene = { battle: ["swords", "magic", "explosions"], horror: ["monsters"], storm: ["explosions"], dungeon: ["footsteps"], city: ["footsteps"], marketplace: ["footsteps"], ocean: ["wind"] };

function normalizeText(text = "") { return String(text).toLowerCase(); }
function scoreScene(text, type) { return sceneLexicon[type].reduce((score, word) => score + (new RegExp(`\\b${word}\\b`, "gi").test(text) ? 1 : 0), 0); }
function splitScenes(content = "") { return String(content).replace(/<[^>]+>/g, " ").split(/\n{2,}|(?<=\.)\s+(?=(?:Meanwhile|Then|At|In|When|The)\b)/).map((part) => part.trim()).filter(Boolean); }
function isDialogue(text) { return /[“"«][^”"»]+[”"»]|^\s*[—-]\s*\S/.test(text); }
function getAsset(category, key) { return ambientLibrary[category]?.[key] || `generated/${category}/${key}`; }
function pushCached(cache, asset) { if (asset) cache.add(asset); return asset; }

export function detectCinematicScenes(content = "") {
  return splitScenes(content).map((text, index) => {
    const normalized = normalizeText(text);
    const ranked = cinematicSceneTypes.map((type) => [type, scoreScene(normalized, type)]).sort((a, b) => b[1] - a[1]);
    const sceneType = ranked[0][1] > 0 ? ranked[0][0] : "silence";
    return { id: `scene-${index + 1}`, index, title: `Scene ${index + 1}`, text, sceneType, detectedTags: ranked.filter(([, score]) => score > 0).map(([type]) => type), mood: sceneMood[sceneType] || (isDialogue(text) ? "tense" : "sad"), confidence: Math.min(0.98, 0.45 + ranked[0][1] * 0.17) };
  });
}

export function buildCinematicTimeline(content = "") {
  const cache = new Set();
  let cursor = 0;
  return detectCinematicScenes(content).map((scene) => {
    const [ambienceCategory = "nature", ambienceKey = "wind"] = sceneAmbience[scene.sceneType] || [];
    const ambienceAsset = scene.sceneType === "silence" ? null : pushCached(cache, getAsset(ambienceCategory, ambienceKey));
    const duration = Math.max(8, Math.ceil(scene.text.split(/\s+/).length / 2.6));
    const dialogue = isDialogue(scene.text);
    const ambienceBase = scene.mood === "horror" ? 0.34 : scene.mood === "romance" ? 0.22 : 0.28;
    const layers = [
      { layer: "voice", role: "narrator", startsAt: cursor, duration, volume: 1, energy: scene.mood === "victory" ? 0.92 : scene.mood === "sad" ? 0.52 : 0.72 },
      { layer: "ambience", role: ambienceKey || "silence", asset: ambienceAsset, startsAt: cursor, duration, volume: ambienceBase, automation: dialogue ? [{ at: cursor, volume: ambienceBase }, { at: cursor + 1, volume: 0.12 }, { at: cursor + duration - 1, volume: ambienceBase }] : [] },
      ...(dialogue ? [{ layer: "dialogue", role: "characters", startsAt: cursor + 1, duration: Math.max(1, duration - 2), volume: 1 }] : []),
      ...((effectsByScene[scene.sceneType] || []).slice(0, 2).map((effect, effectIndex) => ({ layer: "effects", role: effect, asset: pushCached(cache, getAsset("combat", effect)), startsAt: cursor + 2 + effectIndex * 2, duration: 1, volume: scene.mood === "horror" ? 0.44 : 0.58 }))),
      { layer: "music", role: scene.mood, asset: pushCached(cache, `music/${scene.mood}.bed`), startsAt: cursor, duration, volume: scene.mood === "tense" ? 0.24 : 0.18 },
      { layer: "silence", role: "scene-gap", startsAt: cursor + duration, duration: 0.75, volume: 0 }
    ];
    cursor += duration + 0.75;
    return { ...scene, startsAt: layers[0].startsAt, duration, layers, reusableAssets: [...cache] };
  });
}

export function previewCinematicScene(content = "", index = 0) { return buildCinematicTimeline(content)[index] || null; }
