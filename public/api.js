// Cliente da API do localia e do ComfyUI (via proxy do server.js).

const clientId = crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const status = async () => (await fetch('/api/status')).json();

export async function setMode(mode) {
  const r = await fetch('/api/mode', { method: 'POST', body: JSON.stringify({ mode }) });
  return r.json();
}

export async function upload(blob, name) {
  const form = new FormData();
  form.append('image', blob, name);
  form.append('overwrite', 'true');
  const r = await fetch('/comfy/upload/image', { method: 'POST', body: form });
  if (!r.ok) throw new Error('falha ao enviar a imagem');
  return (await r.json()).name;
}

export const interrupt = () => fetch('/comfy/interrupt', { method: 'POST' });

// Envia o grafo, espera o fim por polling no histórico e devolve a imagem. O WebSocket só alimenta a barra de progresso.
export async function generate(graph, onProgress) {
  let ws;
  try {
    ws = new WebSocket(`ws://${location.host}/comfy/ws?clientId=${clientId}`);
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const m = JSON.parse(e.data);
      if (m.type === 'progress') onProgress?.(m.data.value, m.data.max);
    };
  } catch { /* sem barra de progresso */ }

  const t0 = performance.now();
  try {
    const r = await fetch('/comfy/prompt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: clientId }),
    });
    if (!r.ok) throw new Error(`o ComfyUI recusou o pedido: ${(await r.text()).slice(0, 300)}`);
    const { prompt_id } = await r.json();

    for (;;) {
      await sleep(700);
      const entry = (await (await fetch(`/comfy/history/${prompt_id}`)).json())[prompt_id];
      if (!entry) continue;
      if (entry.status?.status_str !== 'success') throw new Error('a geração falhou ou foi cancelada');
      const img = Object.values(entry.outputs).flatMap((o) => o.images || [])[0];
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
      const blob = await (await fetch(`/comfy/view?${q}`)).blob();
      return { blob, seconds: (performance.now() - t0) / 1000 };
    }
  } finally {
    ws?.close();
  }
}
