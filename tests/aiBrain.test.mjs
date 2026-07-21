import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChapter, aliasScore, buildVoiceEvolution, detectContradictions } from "../src/lib/aiBrain/index.js";

test("alias matching recognizes titles",()=>{assert.ok(aliasScore("Lin Fan","Young Master Lin")>=.55); assert.equal(aliasScore("Lin Fan","Lin Fan"),1);});
test("uncertain identity goes to review queue",async()=>{const r=await analyzeChapter({novelId:"n",chapterId:"c",chapterNumber:2,text:"Young Master Lin entered.",existingCharacters:[{id:"x",canonical_name:"Lin Fan",aliases:[]}]}); assert.ok(r.aliases.reviewQueue.length>=1);});
test("relationship extraction detects enemies",async()=>{const r=await analyzeChapter({novelId:"n",chapterId:"c",chapterNumber:1,text:"Lin Fan attacked Mo Chen. They were enemies."}); assert.ok(r.relationships.some(x=>x.type==="enemy"));});
test("timeline append behavior returns new state",async()=>{const r=await analyzeChapter({novelId:"n",chapterId:"c2",chapterNumber:2,text:"Lin Fan was wounded.",previousStates:[{character_id:"char_lin_fan",chapter_number:1,physical_state:"normal"}]}); assert.ok(r.states.some(s=>s.chapter_number===2));});
test("gradual voice evolution is default",()=>{assert.equal(buildVoiceEvolution({state:{emotional_state:"neutral",injuries:[],transformations:[],voice_stability:"stable"}}).change_type,"gradual");});
test("temporary injury voice changes weaken delivery",()=>{const v=buildVoiceEvolution({state:{emotional_state:"neutral",injuries:["cut"],transformations:[]}}); assert.equal(v.change_type,"temporary"); assert.ok(v.energy_offset<0);});
test("permanent transformation changes confidence",()=>{const v=buildVoiceEvolution({state:{emotional_state:"neutral",injuries:[],transformations:["immortal"]}}); assert.equal(v.change_type,"permanent"); assert.ok(v.confidence>0);});
test("contradiction detection warns on dead character alive",()=>{const warnings=detectContradictions({states:[{character_id:"a",physical_state:"dead"},{character_id:"a",physical_state:"normal"}]}); assert.ok(warnings.some(w=>w.type==="dead_character_alive"));});
