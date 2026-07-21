import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCinematicTimeline, detectCinematicScenes, previewCinematicScene, ambientLibrary, cinematicLayers } from "../src/lib/cinematicSceneEngine.js";

test("Phase 9 detects required cinematic scene categories", () => {
  const engine = readFileSync("src/lib/cinematicSceneEngine.js", "utf8");
  for (const token of ["battle", "romance", "horror", "mystery", "comedy", "travel", "city", "forest", "rain", "storm", "cave", "dungeon", "tavern", "palace", "marketplace", "ocean", "night", "day", "silence"]) assert.match(engine, new RegExp(token));
  assert.equal(detectCinematicScenes("Swords rang in the battle.")[0].sceneType, "battle");
});

test("ambient library groups reusable ambience and effects", () => {
  assert.deepEqual(Object.keys(ambientLibrary), ["nature", "city", "buildings", "combat"]);
  for (const key of ["rain", "wind", "birds", "river", "forest"]) assert.ok(ambientLibrary.nature[key]);
  for (const key of ["crowd", "carriage", "market", "footsteps"]) assert.ok(ambientLibrary.city[key]);
  for (const key of ["tavern", "palace", "temple", "dungeon"]) assert.ok(ambientLibrary.buildings[key]);
  for (const key of ["swords", "magic", "explosions", "monsters"]) assert.ok(ambientLibrary.combat[key]);
});

test("timeline orders narrator ambience dialogue effects music and next-scene silence", () => {
  const [scene] = buildCinematicTimeline('The battle began. "Run," she shouted as swords flashed.');
  assert.ok(cinematicLayers.includes("voice"));
  assert.deepEqual(scene.layers.map((layer) => layer.layer).slice(0, 6), ["voice", "ambience", "dialogue", "effects", "effects", "music"]);
  assert.equal(scene.layers.at(-1).layer, "silence");
});

test("volume automation ducks ambience under dialogue and restores it", () => {
  const [scene] = buildCinematicTimeline('Rain covered the street. "Listen," he whispered.');
  const ambience = scene.layers.find((layer) => layer.layer === "ambience");
  assert.ok(ambience.automation.length >= 3);
  assert.ok(ambience.automation[1].volume < ambience.automation[0].volume);
  assert.equal(ambience.automation.at(-1).volume, ambience.automation[0].volume);
});

test("Scene Studio and Reader expose Phase 9 controls", () => {
  const studio = readFileSync("src/components/SceneStudio.jsx", "utf8");
  const reader = readFileSync("src/pages/Reader.jsx", "utf8");
  assert.match(studio, /Scene Studio/);
  assert.match(studio, /Layer editor/);
  assert.match(studio, /Volume editor/);
  assert.match(studio, /Preview one scene/);
  assert.match(reader, /Cinematic Audio/);
  assert.match(reader, /Classic Audio/);
  assert.match(reader, /Device Voice/);
  assert.ok(previewCinematicScene("The palace crowd cheered victory."));
});
