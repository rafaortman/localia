// Varredura de parâmetros: node bench/sweep.js [host:porta]
// Prompt e seed fixos; muda um parâmetro por vez a partir do padrão.
// Gera bench/out/sweep/ (imagens), bench/sweep-results.json e bench/out/sweep.html (grid).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { negative, SEED, run } from './comfy.js';

const checkpoints = ['sd_xl_base_1.0.safetensors', 'RealVisXL_V5.0_fp16.safetensors'];
const prompt = 'portrait of an elderly fisherman with a weathered face and white beard, natural light, 85mm photo';
const DEFAULT = { steps: 25, cfg: 6.5, sampler: 'dpmpp_2m', scheduler: 'karras', size: 1024 };
const groups = {
  steps: [15, 20, 25, 30],
  cfg: [4, 5.5, 6.5, 8],
  sampler: [['dpmpp_2m', 'karras'], ['euler_ancestral', 'normal'], ['dpmpp_2m_sde', 'karras'], ['dpmpp_sde', 'karras']],
  size: [768, 896, 1024],
};

const key = (c) => `${c.steps}-${c.cfg}-${c.sampler}-${c.scheduler}-${c.size}`;
const configs = new Map();
for (const [g, values] of Object.entries(groups)) {
  for (const v of values) {
    const c = { ...DEFAULT };
    if (g === 'sampler') [c.sampler, c.scheduler] = v; else c[g] = v;
    configs.set(key(c), c);
  }
}

const template = JSON.parse(readFileSync(new URL('../workflows/txt2img.json', import.meta.url)));
mkdirSync(new URL('./out/sweep/', import.meta.url), { recursive: true });
const results = [];

for (const ckpt of checkpoints) {
  for (const [k, c] of configs) {
    const wf = structuredClone(template);
    wf['1'].inputs.ckpt_name = ckpt;
    wf['2'].inputs.text = prompt;
    wf['3'].inputs.text = negative;
    Object.assign(wf['4'].inputs, { width: c.size, height: c.size });
    Object.assign(wf['5'].inputs, { seed: SEED, steps: c.steps, cfg: c.cfg, sampler_name: c.sampler, scheduler: c.scheduler });
    const file = `${ckpt.replace('.safetensors', '')}__${k}.png`;
    try {
      const { seconds, peak, bytes } = await run(wf);
      writeFileSync(new URL(`./out/sweep/${file}`, import.meta.url), bytes);
      results.push({ ckpt, ...c, file, seconds: +seconds.toFixed(1), peakVramMB: peak });
    } catch (e) {
      results.push({ ckpt, ...c, file, error: String(e.message).slice(0, 300) });
    }
    console.log(results.at(-1));
  }
}
writeFileSync(new URL('./sweep-results.json', import.meta.url), JSON.stringify(results, null, 2));

const label = (r) => ({ steps: `${r.steps} steps`, cfg: `cfg ${r.cfg}`, sampler: `${r.sampler} / ${r.scheduler}`, size: `${r.size}×${r.size}` });
const section = (ckpt, g) => {
  const rows = results.filter((r) => r.ckpt === ckpt && !r.error && Object.entries(DEFAULT).every(([p, d]) => p === g || (g === 'sampler' && p === 'scheduler') || r[p] === d));
  const cells = rows.map((r) => `<figure><img src="sweep/${r.file}" loading="lazy"><figcaption>${label(r)[g]}<br>${r.seconds} s · ${r.peakVramMB} MB</figcaption></figure>`);
  return `<h3>${g}</h3><div class="row">${cells.join('')}</div>`;
};
const html = `<!doctype html><meta charset="utf-8"><title>Sweep</title>
<style>body{font:14px sans-serif;margin:16px;background:#111;color:#eee}.row{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0;width:240px}img{width:100%}figcaption{font-size:12px;color:#aaa}</style>
<p>Prompt: ${prompt} · seed ${SEED}</p>
${checkpoints.map((c) => `<h2>${c}</h2>${Object.keys(groups).map((g) => section(c, g)).join('')}`).join('')}`;
writeFileSync(new URL('./out/sweep.html', import.meta.url), html);
