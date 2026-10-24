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

// Resume a resposta de erro do ComfyUI (JSON com error.message e node_errors) em uma frase legível.
function explain(text) {
  try {
    const e = JSON.parse(text);
    const nodes = Object.values(e.node_errors || {}).flatMap((n) => n.errors.map((x) => `${n.class_type}: ${x.message}`));
    return [e.error?.message, ...nodes].filter(Boolean).join(' | ') || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

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
    if (!r.ok) throw new Error(`O ComfyUI recusou o pedido: ${explain(await r.text())}`);
    const { prompt_id } = await r.json();

    let failures = 0;
    for (;;) {
      await sleep(700);
      if (performance.now() - t0 > 15 * 60_000) throw new Error('A geração passou de 15 minutos e foi abandonada.');
      let entry;
      try {
        const h = await fetch(`/comfy/history/${prompt_id}`);
        if (!h.ok) throw new Error(String(h.status));
        entry = (await h.json())[prompt_id];
        failures = 0;
      } catch {
        if (++failures >= 5) throw new Error('O ComfyUI parou de responder. Aguarde ele reiniciar e tente de novo.');
        continue;
      }
      if (!entry) continue;
      const msgs = entry.status?.messages || [];
      if (msgs.some(([type]) => type === 'execution_interrupted')) throw Object.assign(new Error('Geração cancelada.'), { cancelled: true });
      if (entry.status?.status_str !== 'success') {
        const err = msgs.find(([type]) => type === 'execution_error');
        throw new Error(`A geração falhou${err ? `: ${err[1].exception_message}` : '.'}`);
      }
      const img = Object.values(entry.outputs).flatMap((o) => o.images || [])[0];
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
      const blob = await (await fetch(`/comfy/view?${q}`)).blob();
      return { blob, seconds: (performance.now() - t0) / 1000 };
    }
  } finally {
    ws?.close();
  }
}
