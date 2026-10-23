// Teste do Z-Image Turbo (template do Comfy Desktop): node bench/zimage.js
// Mesmos 3 prompts do bench.js, seed fixa; a primeira imagem inclui a carga dos modelos.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { SEED, run } from './comfy.js';

const prompts = [
  { id: 'objeto', text: 'a vintage red bicycle leaning against a brick wall, soft morning light, detailed, sharp focus' },
  { id: 'pessoa', text: 'portrait of an elderly fisherman with a weathered face and white beard, natural light, 85mm photo' },
  { id: 'cena', text: 'a busy night street market in Tokyo with neon signs, rain on the pavement, reflections, cinematic' },
  { id: 'objeto-seed2', text: 'a vintage red bicycle leaning against a brick wall, soft morning light, detailed, sharp focus', seed: SEED + 1 },
];

const template = JSON.parse(readFileSync(new URL('./zimage.json', import.meta.url)));
mkdirSync(new URL('./out/zimage/', import.meta.url), { recursive: true });
const results = [];
for (const p of prompts) {
  const wf = structuredClone(template);
  wf['4'].inputs.text = p.text;
  wf['8'].inputs.seed = p.seed ?? SEED;
  try {
    const { seconds, peak, bytes } = await run(wf);
    writeFileSync(new URL(`./out/zimage/${p.id}.png`, import.meta.url), bytes);
    results.push({ prompt: p.id, seconds: +seconds.toFixed(1), peakVramMB: peak });
  } catch (e) {
    results.push({ prompt: p.id, error: String(e.message).slice(0, 400) });
  }
  console.log(results.at(-1));
}
writeFileSync(new URL('./zimage-results.json', import.meta.url), JSON.stringify(results, null, 2));
