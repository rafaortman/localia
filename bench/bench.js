// Benchmark de checkpoints: node bench/bench.js [host:porta]
// Mesmos prompts, seed e tamanho para todos; registra tempo e pico de VRAM.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { negative, SEED, run } from './comfy.js';

const checkpoints = ['sd_xl_base_1.0.safetensors', 'RealVisXL_V5.0_fp16.safetensors'];
const prompts = [
  { id: 'objeto', text: 'a vintage red bicycle leaning against a brick wall, soft morning light, detailed, sharp focus' },
  { id: 'pessoa', text: 'portrait of an elderly fisherman with a weathered face and white beard, natural light, 85mm photo' },
  { id: 'cena', text: 'a busy night street market in Tokyo with neon signs, rain on the pavement, reflections, cinematic' },
];

const template = JSON.parse(readFileSync(new URL('../workflows/txt2img.json', import.meta.url)));
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const results = [];

for (const ckpt of checkpoints) {
  for (const p of prompts) {
    const wf = structuredClone(template);
    wf['1'].inputs.ckpt_name = ckpt;
    wf['2'].inputs.text = p.text;
    wf['3'].inputs.text = negative;
    wf['5'].inputs.seed = SEED;
    const name = ckpt.replace('.safetensors', '');
    try {
      const { seconds, peak, bytes } = await run(wf);
      writeFileSync(new URL(`./out/${name}__${p.id}.png`, import.meta.url), bytes);
      results.push({ ckpt, prompt: p.id, seconds: +seconds.toFixed(1), peakVramMB: peak });
    } catch (e) {
      results.push({ ckpt, prompt: p.id, error: String(e.message).slice(0, 300) });
    }
    console.log(results.at(-1));
  }
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2));
