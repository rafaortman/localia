import { MODELS, SAMPLERS, PRESETS, DEFAULTS, DEFAULT_NEGATIVE, buildGraph } from './models.js';
import * as api from './api.js';

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['model', 'model-note', 'prompt', 'presets', 'drop', 'file', 'pick', 'drop-text', 'drop-preview', 'input-img', 'remove',
  'seed', 'new-seed', 'f-denoise', 'denoise', 'steps', 'cfg', 'sampler', 'negative', 'go', 'cancel', 'bar', 'state', 'empty', 'current', 'out',
  'metrics', 'continue', 'download', 'history', 'chips', 'adjust'].map((id) => [id, $(id)]));

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
const state = { busy: false, image: null, results: [], shown: -1, lastModel: null };

// ---------- formulário ----------
for (const [key, m] of Object.entries(MODELS)) el.model.add(new Option(m.label, key));
SAMPLERS.forEach((s, i) => el.sampler.add(new Option(s.label, i)));
el.steps.value = DEFAULTS.steps;
el.cfg.value = DEFAULTS.cfg;
el.negative.value = DEFAULT_NEGATIVE;
el.seed.value = randomSeed();

function onModelChange() {
  const m = MODELS[el.model.value];
  el['model-note'].textContent = m.note;
  document.querySelectorAll('.sdxl-only').forEach((n) => { n.hidden = m.family !== 'sdxl'; });
}
el.model.addEventListener('change', onModelChange);
onModelChange();

for (const p of PRESETS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = p.label;
  b.addEventListener('click', () => {
    const cur = el.prompt.value.trim();
    el.prompt.value = cur ? `${cur}, ${p.text}` : p.text;
    el.prompt.focus();
  });
  el.presets.append(b);
}

el['new-seed'].addEventListener('click', () => { el.seed.value = randomSeed(); });

// ---------- imagem de partida ----------
// Reduz para ~1 MP com lados múltiplos de 64 (evita estourar a VRAM). Pode distorcer de leve a proporção.
async function fit(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.sqrt(1048576 / (bmp.width * bmp.height));
  const side = (n) => Math.max(64, Math.round((n * k) / 64) * 64);
  const c = new OffscreenCanvas(side(bmp.width), side(bmp.height));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/png' });
}

async function setInput(blob) {
  if (state.image) URL.revokeObjectURL(state.image.url);
  if (!blob) {
    state.image = null;
  } else {
    const fitted = await fit(blob);
    state.image = { blob: fitted, url: URL.createObjectURL(fitted) };
    el['input-img'].src = state.image.url;
  }
  const has = Boolean(state.image);
  el['drop-text'].hidden = has;
  el['drop-preview'].hidden = !has;
  el['f-denoise'].hidden = !has;
  if (has) el.adjust?.setAttribute('open', '');
}

el.pick.addEventListener('click', () => el.file.click());
el.file.addEventListener('change', () => { if (el.file.files[0]) setInput(el.file.files[0]); el.file.value = ''; });
el.remove.addEventListener('click', () => setInput(null));
el.drop.addEventListener('dragover', (e) => { e.preventDefault(); el.drop.classList.add('over'); });
el.drop.addEventListener('dragleave', () => el.drop.classList.remove('over'));
el.drop.addEventListener('drop', (e) => {
  e.preventDefault();
  el.drop.classList.remove('over');
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (f) setInput(f);
});
document.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) setInput(f);
});

// ---------- geração ----------
function say(text, error = false) {
  el.state.textContent = text;
  el.state.classList.toggle('error', error);
}

function setBusy(busy) {
  state.busy = busy;
  el.go.disabled = busy;
  el.cancel.hidden = !busy;
  el.bar.hidden = !busy;
  if (!busy) el.bar.value = 0;
}

async function create() {
  if (state.busy) return;
  const prompt = el.prompt.value.trim();
  if (!prompt) return say('Escreva o que você quer ver.', true);

  const key = el.model.value;
  const model = MODELS[key];
  const mode = state.image ? 'img2img' : 'txt2img';
  const { sampler, scheduler } = SAMPLERS[Number(el.sampler.value)];
  const params = {
    prompt, negative: el.negative.value, seed: Number(el.seed.value) || 0, steps: Number(el.steps.value), cfg: Number(el.cfg.value),
    sampler, scheduler, denoise: Number(el.denoise.value),
  };

  setBusy(true);
  try {
    const st = await api.status();
    if (!st.comfy) throw new Error('O ComfyUI não está rodando.');
    if (st.mode !== 'image') { say('Trocando para o modo imagem...'); await api.setMode('image'); }
    if (state.image) params.image = await api.upload(state.image.blob, `localia_${Date.now()}.png`);

    say(state.lastModel !== key ? `Carregando o modelo ${model.label}... a primeira imagem demora mais.` : 'Gerando...');
    const graph = await buildGraph(key, mode, params);
    const { blob, seconds } = await api.generate(graph, (v, max) => {
      el.bar.max = max;
      el.bar.value = v;
      say(`Gerando... passo ${v} de ${max}`);
    });
    state.lastModel = key;
    const url = URL.createObjectURL(blob);
    state.results.push({ blob, url, seconds, key, mode, params });
    show(state.results.length - 1);
    say('');
  } catch (e) {
    say(e.message, true);
  } finally {
    setBusy(false);
  }
}

el.go.addEventListener('click', create);
el.prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) create(); });
el.cancel.addEventListener('click', () => api.interrupt());

// ---------- resultado ----------
function show(i) {
  const r = state.results[i];
  state.shown = i;
  el.empty.hidden = true;
  el.current.hidden = false;
  el.out.src = r.url;
  el.download.href = r.url;
  const m = MODELS[r.key];
  const parts = [m.label, `${r.seconds.toFixed(1)} s`, `seed ${r.params.seed}`];
  if (m.family === 'sdxl') parts.push(`${r.params.steps} steps`, `cfg ${r.params.cfg}`, `${r.params.sampler} + ${r.params.scheduler}`);
  if (r.mode === 'img2img') parts.push(`img2img, denoise ${r.params.denoise}`);
  el.out.addEventListener('load', () => {
    el.metrics.textContent = [...parts, `${el.out.naturalWidth}×${el.out.naturalHeight}`].join(' · ');
  }, { once: true });
  el.go.textContent = 'Recriar imagem';
  renderHistory();
}

function renderHistory() {
  el.history.replaceChildren(...state.results.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = `Imagem ${i + 1}`;
    b.classList.toggle('on', i === state.shown);
    const img = document.createElement('img');
    img.src = r.url;
    img.alt = `Imagem ${i + 1}`;
    b.append(img);
    b.addEventListener('click', () => show(i));
    return b;
  }));
}

el.continue.addEventListener('click', () => {
  const r = state.results[state.shown];
  if (r) setInput(r.blob);
});

// ---------- estado dos serviços ----------
async function refreshStatus() {
  const chip = (label, ok) => {
    const s = document.createElement('span');
    s.className = `chip ${ok ? 'ok' : 'bad'}`;
    s.textContent = `${label}: ${ok ? 'online' : 'offline'}`;
    return s;
  };
  try {
    const s = await api.status();
    el.chips.replaceChildren(chip('ComfyUI', s.comfy), chip('Ollama', s.ollama));
  } catch {
    el.chips.replaceChildren(chip('Servidor', false));
  }
}
refreshStatus();
setInterval(refreshStatus, 5000);
