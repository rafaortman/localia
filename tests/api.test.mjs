// Testes do servidor e da API: node --test tests/api.test.mjs
// Precisam do servidor rodando (node server.js) e, para os testes do ComfyUI, do ComfyUI online.
// TEST_URL muda o endereço (padrão http://127.0.0.1:3000).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3000';
const url = new URL(BASE);

// Requisição com o caminho exatamente como escrito (fetch normaliza "../").
const raw = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((done, fail) => {
  const req = http.request({ host: url.hostname, port: url.port, path, method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => done({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
  });
  req.on('error', fail);
  req.end(body);
});
const json = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => null) }; };
const comfyUp = (await json('/api/status')).body?.comfy;
const needComfy = { skip: comfyUp ? false : 'ComfyUI offline' };

test('status: formato e campos', async () => {
  const { status, body } = await json('/api/status');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['comfy', 'comfyStarting', 'mode', 'ollama']);
  assert.ok(['image', 'chat'].includes(body.mode));
});

test('arquivos estáticos com o tipo certo', async () => {
  const expected = { '/': 'text/html', '/app.js': 'text/javascript', '/api.js': 'text/javascript', '/models.js': 'text/javascript',
    '/style.css': 'text/css', '/localia.ico': 'image/x-icon', '/icon.svg': 'image/svg+xml', '/logo.svg': 'image/svg+xml' };
  for (const [path, type] of Object.entries(expected)) {
    const r = await raw(path);
    assert.equal(r.status, 200, path);
    assert.ok(r.headers['content-type'].startsWith(type), `${path}: ${r.headers['content-type']}`);
  }
});

test('os 6 workflows existem e são JSON válido com nós conectados', async () => {
  for (const f of ['txt2img', 'img2img', 'inpaint', 'zimage-txt2img', 'zimage-img2img', 'zimage-inpaint']) {
    const { status, body } = await json(`/workflows/${f}.json`);
    assert.equal(status, 200, f);
    for (const [id, node] of Object.entries(body)) {
      assert.ok(node.class_type, `${f}: nó ${id} sem class_type`);
      for (const v of Object.values(node.inputs)) if (Array.isArray(v)) assert.ok(body[v[0]], `${f}: nó ${id} aponta para o nó ${v[0]}, que não existe`);
    }
  }
});

test('segurança: não vaza config.json nem arquivos fora de public e workflows', async () => {
  const paths = ['/config.json', '/server.js', '/CLAUDE.md', '/.git/config', '/workflows/../config.json', '/workflows/..%2Fconfig.json',
    '/..%2Fconfig.json', '/%2e%2e/config.json', '/..%5Cconfig.json', '/workflows/..%5C..%5Cconfig.json', '/public/../config.json'];
  for (const p of paths) {
    const r = await raw(p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!r.text.includes('autostart') && !r.text.includes('"ollama"'), `${p} vazou o config`);
  }
});

test('rotas desconhecidas dão 404 e /api/mode só aceita POST com modo válido', async () => {
  assert.equal((await raw('/nao-existe')).status, 404);
  assert.equal((await json('/api/mode', { method: 'POST', body: JSON.stringify({ mode: 'xyz' }) })).status, 400);
  assert.equal((await json('/api/mode', { method: 'POST', body: '{quebrado' })).status, 400);
  assert.equal((await json('/api/mode', { method: 'POST', body: '' })).status, 400);
});

test('segurança: Host e Origin de outro site são recusados', async () => {
  const rebind = await raw('/api/status', { headers: { host: 'evil.example:3000' } });
  assert.equal(rebind.status, 403, 'Host estranho (DNS rebinding)');
  const post = await raw('/comfy/interrupt', { method: 'POST', headers: { origin: 'http://evil.example' } });
  assert.equal(post.status, 403, 'POST vindo de outro site');
  const ok = await raw('/api/status', { headers: { origin: BASE } });
  assert.equal(ok.status, 200, 'o próprio site continua funcionando');
});

test('troca de modo: chat <-> image e tempo medido', needComfy, async () => {
  const chat = await json('/api/mode', { method: 'POST', body: JSON.stringify({ mode: 'chat' }) });
  assert.equal(chat.body.mode, 'chat');
  assert.equal((await json('/api/status')).body.mode, 'chat');
  const img = await json('/api/mode', { method: 'POST', body: JSON.stringify({ mode: 'image' }) });
  assert.equal(img.body.mode, 'image');
  assert.equal(typeof img.body.seconds, 'number');
  assert.equal((await json('/api/status')).body.mode, 'image');
});

test('proxy do ComfyUI: system_stats, modelos instalados e upload', needComfy, async () => {
  const stats = await json('/comfy/system_stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.body.devices[0].name.includes('3050'));
  const names = async (node, key) => (await json(`/comfy/object_info/${node}`)).body[node].input.required[key][0];
  const ckpts = await names('CheckpointLoaderSimple', 'ckpt_name');
  for (const c of ['sd_xl_base_1.0.safetensors', 'RealVisXL_V5.0_fp16.safetensors']) assert.ok(ckpts.includes(c), `falta ${c}`);
  assert.ok((await names('UNETLoader', 'unet_name')).includes('z_image_turbo_bf16.safetensors'));
  assert.ok((await names('CLIPLoader', 'clip_name')).includes('qwen_3_4b.safetensors'));
  assert.ok((await names('VAELoader', 'vae_name')).includes('ae.safetensors'));

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'teste_localia.png');
  form.append('overwrite', 'true');
  const up = await json('/comfy/upload/image', { method: 'POST', body: form });
  assert.equal(up.status, 200);
  assert.equal(up.body.name, 'teste_localia.png');
});

test('proxy do ComfyUI: pedido inválido volta com erro legível (não derruba o servidor)', needComfy, async () => {
  const r = await fetch(`${BASE}/comfy/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: { 1: { class_type: 'NoExiste', inputs: {} } } }) });
  assert.equal(r.status, 400);
  assert.ok((await r.text()).length > 0);
  assert.equal((await json('/api/status')).status, 200);
});

test('WebSocket do ComfyUI passa pelo proxy', needComfy, async () => {
  const msg = await new Promise((done, fail) => {
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/comfy/ws?clientId=teste-${Date.now()}`);
    const timer = setTimeout(() => { ws.close(); fail(new Error('sem mensagem em 8 s')); }, 8000);
    ws.onmessage = (e) => { clearTimeout(timer); ws.close(); done(JSON.parse(e.data)); };
    ws.onerror = () => { clearTimeout(timer); fail(new Error('erro de conexão')); };
  });
  assert.equal(msg.type, 'status');
});

test('proxy do Ollama responde', async () => {
  const r = await json('/ollama/api/tags');
  assert.equal(r.status, 200);
  assert.ok(r.body.models.some((m) => m.name.startsWith('qwen3')));
});
