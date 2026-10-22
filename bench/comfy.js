// Helpers compartilhados pelos scripts de benchmark.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const base = `http://${process.argv[2] || '127.0.0.1:8188'}`;
export const negative = 'blurry, low quality, deformed, extra fingers, watermark, text';
export const SEED = 123456789;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vram = () => new Promise((res) =>
  execFile('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'],
    (e, out) => res(e ? 0 : parseInt(out, 10))));

export async function api(path, opts) {
  const r = await fetch(base + path, opts);
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r;
}

export async function run(workflow) {
  let peak = 0, sampling = true;
  const sampler = (async () => { while (sampling) { peak = Math.max(peak, await vram()); await sleep(500); } })();
  const t0 = Date.now();
  const { prompt_id } = await (await api('/prompt', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  })).json();
  let entry;
  while (!(entry = (await (await api(`/history/${prompt_id}`)).json())[prompt_id])) await sleep(1000);
  const seconds = (Date.now() - t0) / 1000;
  sampling = false; await sampler;
  if (entry.status?.status_str !== 'success') throw new Error(JSON.stringify(entry.status));
  const img = Object.values(entry.outputs).flatMap((o) => o.images || [])[0];
  const bytes = Buffer.from(await (await api(`/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`)).arrayBuffer());
  return { seconds, peak, bytes };
}

// Envia uma imagem para input/ do ComfyUI e devolve o nome salvo.
export async function upload(bytes, name) {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/png' }), name);
  form.append('overwrite', 'true');
  return (await (await api('/upload/image', { method: 'POST', body: form })).json()).name;
}
