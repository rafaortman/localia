// Mede a troca de VRAM entre ComfyUI e Ollama: node bench/swap.js
import { readFileSync, writeFileSync } from 'node:fs';
import { base, negative, SEED, run, api } from './comfy.js';

const OLLAMA = 'http://127.0.0.1:11434';
const MODEL = 'qwen3:4b';
const wf = JSON.parse(readFileSync(new URL('../workflows/txt2img.json', import.meta.url)));
wf['1'].inputs.ckpt_name = 'RealVisXL_V5.0_fp16.safetensors';
wf['2'].inputs.text = 'a vintage red bicycle leaning against a brick wall, soft morning light';
wf['3'].inputs.text = negative;
let n = 0;
const render = async () => { const w = structuredClone(wf); w['5'].inputs.seed = SEED + ++n; return run(w); }; // seed nova a cada render: o ComfyUI reaproveita resultado em cache se o grafo for idêntico
const ollama = async (keep_alive) => {
  const t0 = Date.now();
  const r = await (await fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model: MODEL, prompt: 'oi', stream: false, think: false, keep_alive, options: { num_predict: 1 } }) })).json();
  return { wall: (Date.now() - t0) / 1000, load: r.load_duration / 1e9 };
};
const s = (n) => +n.toFixed(1);
const out = {};

await render();                                   // garante o SDXL carregado
out.imagemQuente = s((await render()).seconds);    // referência: modelo já na VRAM

const t1 = Date.now();
await api('/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
const freeS = (Date.now() - t1) / 1000;
const load = await ollama('5m');
out.paraChat = { liberarComfy: s(freeS), cargaOllama: s(load.load), total: s(freeS + load.wall) };

const t2 = Date.now();
await ollama(0);                                  // descarrega o Ollama
const unloadS = (Date.now() - t2) / 1000;
const cold = await render();                      // primeira imagem recarrega o SDXL
out.paraImagem = { descarregarOllama: s(unloadS), imagemFria: s(cold.seconds), cargaExtra: s(cold.seconds - out.imagemQuente), total: s(unloadS + cold.seconds - out.imagemQuente) };

writeFileSync(new URL('./swap-results.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
