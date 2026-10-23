// Validação completa do Z-Image Turbo: node bench/zimage-full.js
// 1) txt2img com mais seeds, 2) img2img, 3) inpaint, 4) RAM e troca de VRAM com o Ollama.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { SEED, run, upload, api } from './comfy.js';

const out = (f) => new URL(`./out/${f}`, import.meta.url);
const base = JSON.parse(readFileSync(new URL('./zimage.json', import.meta.url)));
const text = {
  objeto: 'a vintage red bicycle leaning against a brick wall, soft morning light, detailed, sharp focus',
  pessoa: 'portrait of an elderly fisherman with a weathered face and white beard, natural light, 85mm photo',
  cena: 'a busy night street market in Tokyo with neon signs, rain on the pavement, reflections, cinematic',
};
const fisherman = 'portrait of an elderly fisherman with a weathered face and white beard, wearing a yellow raincoat, natural light, 85mm photo';
const results = [];
const log = (r) => { results.push(r); console.log(r); };
mkdirSync(out('zimage/'), { recursive: true });

// executa um workflow medindo tempo, VRAM (comfy.js) e menor RAM livre do sistema
async function timed(wf) {
  let minFree = os.freemem(), on = true;
  const t = (async () => { while (on) { minFree = Math.min(minFree, os.freemem()); await new Promise((r) => setTimeout(r, 500)); } })();
  try { return { ...(await run(wf)), peakRamGB: 0, get ram() { return +((os.totalmem() - minFree) / 2 ** 30).toFixed(1); } }; }
  finally { on = false; await t; }
}
const clone = () => structuredClone(base);
let n = 0;
const seeded = (wf, seed) => { wf['8'].inputs.seed = seed; return wf; };
const fresh = () => seeded(clone(), SEED + 1000 + ++n); // seed nova a cada chamada: evita o cache do ComfyUI

// 1) txt2img: seeds extras (a seed SEED já foi rodada em zimage.js)
for (const id of Object.keys(text)) {
  for (const k of [1, 2]) {
    const wf = clone(); wf['4'].inputs.text = text[id]; seeded(wf, SEED + k);
    try {
      const r = await timed(wf); writeFileSync(out(`zimage/${id}-s${k}.png`), r.bytes);
      log({ teste: 'txt2img', id: `${id}-s${k}`, seconds: +r.seconds.toFixed(1), peakVramMB: r.peak, peakRamGB: r.ram });
    } catch (e) { log({ teste: 'txt2img', id: `${id}-s${k}`, error: String(e.message).slice(0, 300) }); }
  }
}

// 2) img2img e 3) inpaint: acrescenta os nós de entrada ao workflow do Z-Image
function edit(prompt, denoise, maskName) {
  const wf = clone();
  wf['4'].inputs.text = prompt;
  wf['11'] = { class_type: 'LoadImage', inputs: { image: 'zimg_input.png' } };
  wf['12'] = { class_type: 'VAEEncode', inputs: { pixels: ['11', 0], vae: ['3', 0] } };
  wf['8'].inputs.denoise = denoise;
  wf['8'].inputs.latent_image = ['12', 0];
  if (maskName) {
    wf['13'] = { class_type: 'LoadImageMask', inputs: { image: maskName, channel: 'red' } };
    wf['14'] = { class_type: 'SetLatentNoiseMask', inputs: { samples: ['12', 0], mask: ['13', 0] } };
    wf['8'].inputs.latent_image = ['14', 0];
  }
  return seeded(wf, SEED);
}
const maskName = await upload(readFileSync(out('mask.png')), 'zimg_mask.png');
const inputs = {
  zimage: readFileSync(out('zimage/pessoa.png')),
  sdxl: readFileSync(out('sweep/sd_xl_base_1.0__25-6.5-dpmpp_2m-karras-1024.png')),
  realvis: readFileSync(out('sweep/RealVisXL_V5.0_fp16__25-6.5-dpmpp_2m-karras-1024.png')),
};
const edits = [
  { file: 'img2img-entradaZ-0.8', input: 'zimage', wf: () => edit(fisherman, 0.8) },
  { file: 'img2img-entradaSDXL-0.6', input: 'sdxl', wf: () => edit(fisherman, 0.6) },
  { file: 'img2img-entradaSDXL-0.8', input: 'sdxl', wf: () => edit(fisherman, 0.8) },
  { file: 'inpaint-0.75', input: 'realvis', wf: () => edit('a red knitted beanie, natural light, 85mm photo', 0.75, maskName) },
  { file: 'inpaint-0.9', input: 'realvis', wf: () => edit('a red knitted beanie, natural light, 85mm photo', 0.9, maskName) },
];
for (const e of edits) {
  try {
    await upload(inputs[e.input], 'zimg_input.png');
    const r = await timed(e.wf()); writeFileSync(out(`zimage/${e.file}.png`), r.bytes);
    log({ teste: e.file.split('-')[0], id: e.file, seconds: +r.seconds.toFixed(1), peakVramMB: r.peak, peakRamGB: r.ram });
  } catch (err) { log({ teste: e.file.split('-')[0], id: e.file, error: String(err.message).slice(0, 300) }); }
}

// 4) troca de VRAM com o Ollama (mesma lógica do swap.js)
const OLLAMA = 'http://127.0.0.1:11434';
const ollama = async (keep_alive) => {
  const t0 = Date.now();
  const r = await (await fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'qwen3:4b', prompt: 'oi', stream: false, think: false, keep_alive, options: { num_predict: 1 } }) })).json();
  return { wall: (Date.now() - t0) / 1000, load: r.load_duration / 1e9 };
};
try {
  const warm = await timed(fresh());
  const t1 = Date.now();
  await api('/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
  const freeS = (Date.now() - t1) / 1000;
  const load = await ollama('5m');
  const t2 = Date.now(); await ollama(0); const unloadS = (Date.now() - t2) / 1000;
  const cold = await timed(fresh());
  log({
    teste: 'troca-vram', imagemQuente: +warm.seconds.toFixed(1), paraChat: +(freeS + load.wall).toFixed(1),
    cargaOllama: +load.load.toFixed(1), descarregarOllama: +unloadS.toFixed(1), imagemFria: +cold.seconds.toFixed(1),
    cargaExtraImagem: +(cold.seconds - warm.seconds).toFixed(1), peakRamGB: Math.max(warm.ram, cold.ram),
  });
} catch (e) { log({ teste: 'troca-vram', error: String(e.message).slice(0, 300) }); }

writeFileSync(new URL('./zimage-full-results.json', import.meta.url), JSON.stringify(results, null, 2));
