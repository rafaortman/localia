// Folha de contato única: node bench/contact.js  ->  bench/out/contact.html
// Junta bench.js, sweep.js e modes.js; cada seção compara os dois checkpoints (linhas) por valor (colunas).
import { readFileSync, writeFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const bench = load('./results.json');
const sweep = load('./sweep-results.json');
const modes = load('./modes-results.json');
const ckpts = ['sd_xl_base_1.0.safetensors', 'RealVisXL_V5.0_fp16.safetensors'];
const short = { 'sd_xl_base_1.0.safetensors': 'SDXL base', 'RealVisXL_V5.0_fp16.safetensors': 'RealVisXL' };
const D = { steps: 25, cfg: 6.5, sampler: 'dpmpp_2m', scheduler: 'karras', size: 1024 };

const cell = (src, cap) => src
  ? `<figure><img src="${src}" loading="lazy"><figcaption>${cap}</figcaption></figure>`
  : `<figure class="miss"><figcaption>${cap}<br>sem imagem</figcaption></figure>`;
const stat = (r) => (r.peakVramMB ? `${r.seconds} s · ${(r.peakVramMB / 1024).toFixed(1)} GB` : '');

function section(title, note, cols, find) {
  const rows = ckpts.map((c) => `<div class="label">${short[c]}</div>${cols.map((col) => {
    const r = find(c, col);
    return r && !r.error ? cell(r.src, `${col.label}<br>${stat(r)}`) : cell(null, col.label);
  }).join('')}`).join('');
  return `<section><h2>${title}</h2><p>${note}</p><div class="grid" style="--n:${cols.length}">${rows}</div></section>`;
}

const sweepFind = (over) => (c, col) => {
  const want = { ...D, ...over(col) };
  const r = sweep.find((x) => x.ckpt === c && Object.keys(D).every((k) => x[k] === want[k]));
  return r && { ...r, src: `sweep/${r.file}` };
};

const parts = [
  section('Prompts diferentes', 'Padrão: 1024², 25 steps, cfg 6,5, dpmpp_2m karras, seed fixa.',
    ['objeto', 'pessoa', 'cena'].map((p) => ({ label: p, p })),
    (c, col) => { const r = bench.find((x) => x.ckpt === c && x.prompt === col.p); return r && { ...r, src: `${c.replace('.safetensors', '')}__${col.p}.png` }; }),
  section('Steps', 'Cada step custa ~1,5 s.', [15, 20, 25, 30].map((v) => ({ label: `${v} steps`, v })), sweepFind((c) => ({ steps: c.v }))),
  section('CFG', 'Quanto o modelo obedece o prompt.', [4, 5.5, 6.5, 8].map((v) => ({ label: `cfg ${v}`, v })), sweepFind((c) => ({ cfg: c.v }))),
  section('Sampler', 'dpmpp_sde dobra o tempo.',
    [['dpmpp_2m', 'karras'], ['euler_ancestral', 'normal'], ['dpmpp_2m_sde', 'karras'], ['dpmpp_sde', 'karras']].map(([s, k]) => ({ label: `${s}<br>${k}`, s, k })),
    sweepFind((c) => ({ sampler: c.s, scheduler: c.k }))),
  section('Tamanho', 'Menor tamanho = rascunho mais rápido.', [768, 896, 1024].map((v) => ({ label: `${v}×${v}`, v })), sweepFind((c) => ({ size: c.v }))),
  section('img2img', 'Entrada: mesma imagem (RealVisXL) nos dois modelos. Pedido: capa de chuva amarela.',
    [{ label: 'entrada' }, ...[0.2, 0.3, 0.4, 0.6, 0.8].map((d) => ({ label: `denoise ${d}`, d }))],
    (c, col) => {
      if (!col.d) return { seconds: '-', peakVramMB: 0, src: 'sweep/RealVisXL_V5.0_fp16__25-6.5-dpmpp_2m-karras-1024.png', entrada: true };
      const r = modes.find((x) => x.ckpt === c && x.mode === 'img2img' && x.denoise === col.d); return r && { ...r, src: `modes/${r.file}` };
    }),
  section('Inpaint', 'Máscara com borda suave sobre o chapéu; pedido: gorro vermelho de tricô.',
    [{ label: 'máscara' }, ...[0.75, 0.9].map((d) => ({ label: `denoise ${d}`, d }))],
    (c, col) => {
      if (!col.d) return { seconds: '-', peakVramMB: 0, src: 'mask.png' };
      const r = modes.find((x) => x.ckpt === c && x.mode === 'inpaint' && x.denoise === col.d); return r && { ...r, src: `modes/${r.file}` };
    }),
].join('');

writeFileSync(new URL('./out/contact.html', import.meta.url), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Folha de contato</title>
<style>
body{font:14px sans-serif;margin:16px;background:#111;color:#eee}h2{margin:28px 0 2px}p{margin:0 0 8px;color:#999}
.grid{display:grid;grid-template-columns:80px repeat(var(--n),minmax(0,240px));gap:8px;align-items:start}
.label{font-weight:600;padding-top:8px}figure{margin:0}img{width:100%;display:block}
figcaption{font-size:12px;color:#aaa}.miss{border:1px dashed #555;padding:8px}
</style>
<h1>Folha de contato</h1><p>Seed 123456789; steps, cfg, sampler, tamanho e modos usam o prompt do pescador. Cada linha é um checkpoint; cada coluna, um valor.</p>${parts}`);
console.log('ok');
