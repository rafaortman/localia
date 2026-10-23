// Folha de contato única: node bench/contact.js  ->  bench/out/contact.html
// Junta bench.js, sweep.js e modes.js; cada seção compara os dois checkpoints (linhas) por valor (colunas).
import { readFileSync, writeFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const bench = load('./results.json');
const sweep = load('./sweep-results.json');
const modes = load('./modes-results.json');
const zimage = load('./zimage-results.json');
const ckpts = ['sd_xl_base_1.0.safetensors', 'RealVisXL_V5.0_fp16.safetensors'];
const short = { 'sd_xl_base_1.0.safetensors': 'SDXL base', 'RealVisXL_V5.0_fp16.safetensors': 'RealVisXL' };
const D = { steps: 25, cfg: 6.5, sampler: 'dpmpp_2m', scheduler: 'karras', size: 1024 };

const cell = (src, cap) => src
  ? `<figure data-src="${src}" data-cap="${cap.replace(/<br>/g, " · ")}"><img src="${src}" loading="lazy"><figcaption>${cap}</figcaption></figure>`
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

// Z-Image Turbo contra os dois checkpoints SDXL, mesmos prompts e seed (bench/zimage.js).
function zimageSection() {
  const ids = ['objeto', 'pessoa', 'cena'];
  const row = (label, find) => `<div class="label">${label}</div>${ids.map((id) => {
    const r = find(id);
    return r && !r.error ? cell(r.src, `${id}<br>${stat(r)}`) : cell(null, id);
  }).join('')}`;
  const sdxl = (c) => (id) => {
    const r = bench.find((x) => x.ckpt === c && x.prompt === id);
    return r && { ...r, src: `${c.replace('.safetensors', '')}__${id}.png` };
  };
  const z = (id) => {
    const r = zimage.find((x) => x.prompt === id);
    return r && { ...r, src: `zimage/${id}.png` };
  };
  const rows = [row('SDXL base', sdxl(ckpts[0])), row('RealVisXL', sdxl(ckpts[1])), row('Z-Image Turbo', z)].join('');
  return `<section><h2>Z-Image contra os dois SDXL</h2><p>Mesmos prompts e seed 0. Z-Image: 8 steps, cfg 1 (fixos do modelo). SDXL: 25 steps, cfg 6,5. A primeira imagem do Z-Image inclui a carga dos modelos.</p><div class="grid" style="--n:3">${rows}</div></section>`;
}

// Z-Image Turbo: 3 seeds por prompt, depois img2img e inpaint (bench/zimage-full.js).
const zfull = load('./zimage-full-results.json');
function zimageDeepSection() {
  const ids = ['objeto', 'pessoa', 'cena'];
  const stat2 = (r) => (r ? `${r.seconds} s · ${(r.peakVramMB / 1024).toFixed(1)} GB` : '');
  const seedRows = [['seed 0', ''], ['seed 1', '-s1'], ['seed 2', '-s2']].map(([label, suf]) => `<div class="label">${label}</div>${ids.map((id) => {
    const r = suf ? zfull.find((x) => x.id === `${id}${suf}`) : zimage.find((x) => x.prompt === id);
    return r && !r.error ? cell(`zimage/${id}${suf}.png`, `${id}<br>${stat2(r)}`) : cell(null, id);
  }).join('')}`).join('');
  const one = (file, label) => { const r = zfull.find((x) => x.id === file); return r && !r.error ? cell(`zimage/${file}.png`, `${label}<br>${stat2(r)}`) : cell(null, label); };
  const edits = `<div class="label">img2img</div>${cell('zimage/pessoa.png', 'entrada (Z-Image)')}${one('img2img-entradaZ-0.8', 'denoise 0,8')}${cell('sweep/sd_xl_base_1.0__25-6.5-dpmpp_2m-karras-1024.png', 'entrada (SDXL base)')}${one('img2img-entradaSDXL-0.6', 'denoise 0,6')}${one('img2img-entradaSDXL-0.8', 'denoise 0,8')}`
    + `<div class="label">inpaint</div>${cell('sweep/RealVisXL_V5.0_fp16__25-6.5-dpmpp_2m-karras-1024.png', 'entrada')}${cell('mask.png', 'máscara')}${one('inpaint-0.75', 'denoise 0,75')}${one('inpaint-0.9', 'denoise 0,9')}`;
  return `<section><h2>Z-Image Turbo: mais seeds</h2><p>Mesmos 3 prompts, 3 seeds cada. Veja se o estilo se repete.</p><div class="grid" style="--n:3">${seedRows}</div></section>`
    + `<section><h2>Z-Image Turbo: img2img e inpaint</h2><p>Pedido do img2img: capa de chuva amarela. Inpaint: gorro vermelho de tricô, mesma máscara e entrada do teste SDXL.</p><div class="grid" style="--n:5">${edits}</div></section>`;
}

const divider = (id, title, note) => `<div class="part" id="${id}"><h1>${title}</h1><p>${note}</p></div>`;

const parts = [
  divider('zimage', 'Parte 1: Z-Image Turbo',
    'Modelo novo, candidato a padrão. Cada linha é uma seed; cada coluna, um prompt. Parâmetros fixos do modelo: 8 steps, cfg 1, sem prompt negativo.'),
  zimageSection(),
  zimageDeepSection(),
  divider('sdxl', 'Parte 2: SDXL, efeito de cada parâmetro',
    'Benchmark dos dois checkpoints SDXL (linhas: SDXL base e RealVisXL). Todas as imagens usam 25 steps, cfg 6,5 e dpmpp_2m karras, exceto o parâmetro que está sendo variado em cada seção. Esses valores são do teste, e não os defaults decididos (15 steps, cfg 7).'),
  section('SDXL: prompts diferentes', 'Só o prompt muda: 1024², 25 steps, cfg 6,5, dpmpp_2m karras, seed fixa.',
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
a{color:#7ab8ff}.part{margin:44px 0 0;padding:12px 16px;border-left:4px solid #4da3ff;background:#1b2330}.part h1{margin:0 0 4px;font-size:22px}.part p{margin:0;max-width:760px}
figure[data-src]{cursor:zoom-in}figure.sel img{outline:3px solid #4da3ff}
#box{position:fixed;inset:0;background:#000e;display:none;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:zoom-out}
#box img{max-width:96vw;max-height:88vh}#box.on{display:flex}
</style>
<h1>Folha de contato</h1><p>Duas partes: <a href="#zimage">1. Z-Image Turbo</a> · <a href="#sdxl">2. SDXL, efeito de cada parâmetro</a>. Seed 123456789. Clique numa imagem para ampliar.</p>${parts}<div id="box"><img><div id="boxcap"></div></div>
<script>
// window.sel = última imagem clicada, window.hov = imagem sob o mouse (lidas pelo Claude durante a inspeção)
const box = document.getElementById("box");
document.addEventListener("mouseover", (e) => { const f = e.target.closest("figure[data-src]"); if (f) window.hov = { src: f.dataset.src, cap: f.dataset.cap }; });
document.addEventListener("click", (e) => {
  if (box.classList.contains("on")) { box.classList.remove("on"); return; }
  const f = e.target.closest("figure[data-src]"); if (!f) return;
  document.querySelectorAll("figure.sel").forEach((x) => x.classList.remove("sel")); f.classList.add("sel");
  window.sel = { src: f.dataset.src, cap: f.dataset.cap };
  box.querySelector("img").src = f.dataset.src; document.getElementById("boxcap").textContent = f.dataset.cap; box.classList.add("on");
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") box.classList.remove("on"); });
</script>`);
console.log('ok');
