// localia: servidor local, só módulos nativos.
// Serve /public e /workflows, faz proxy para ComfyUI (/comfy/*) e Ollama (/ollama/*) e controla o modo (image | chat).
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const configPath = ['config.json', 'config.example.json'].map((f) => join(root, f)).find(existsSync);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const { comfy, ollama } = config;
const PORT = Number(process.env.PORT) || config.port;

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const send = (res, status, body, type = 'text/plain; charset=utf-8') => res.writeHead(status, { 'content-type': type }).end(body);
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data), types['.json']);

const alive = (host, port) => new Promise((done) => {
  const s = net.connect(port, host);
  s.setTimeout(1000, () => { s.destroy(); done(false); });
  s.once('connect', () => { s.destroy(); done(true); });
  s.once('error', () => done(false));
});

async function serveFile(res, dir, rel) {
  const base = resolve(root, dir);
  const file = resolve(base, rel.replace(/^[/\\]+/, '') || 'index.html');
  if (file !== base && !file.startsWith(base + sep)) return send(res, 403, 'proibido');
  try {
    send(res, 200, await readFile(file), types[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'não encontrado');
  }
}

// O ComfyUI recusa requisições com Origin diferente do host, então removemos origin e referer no proxy.
function proxy(req, res, target, prefix) {
  const headers = { ...req.headers, host: `${target.host}:${target.port}` };
  delete headers.origin;
  delete headers.referer;
  const up = http.request({ host: target.host, port: target.port, path: req.url.slice(prefix.length) || '/', method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) send(res, 502, 'serviço indisponível'); else res.end(); });
  req.pipe(up);
}

const readBody = (req) => new Promise((done) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => { try { done(JSON.parse(data || '{}')); } catch { done({}); } });
});

// Uma GPU, um estado: trocar de modo libera a VRAM do outro serviço.
let mode = 'image';
async function setMode(next) {
  const t0 = Date.now();
  const post = (target, path, body) => fetch(`http://${target.host}:${target.port}${path}`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
  if (next === 'image') await post(ollama, '/api/generate', { model: ollama.model, keep_alive: 0 });
  else await post(comfy, '/free', { unload_models: true, free_memory: true });
  mode = next;
  return { mode, seconds: (Date.now() - t0) / 1000 };
}

// Encerramento por inatividade: a interface consulta /api/status a cada poucos segundos, então fechar a janela
// para o servidor (e o ComfyUI que ele iniciou) e libera a GPU. 0 = nunca encerra.
const idleMinutes = Number(process.env.LOCALIA_IDLE_EXIT_MIN ?? config.idleExitMinutes ?? 0);
let lastSeen = Date.now();

const server = http.createServer(async (req, res) => {
  lastSeen = Date.now();
  const path = new URL(req.url, 'http://x').pathname;
  if (path.startsWith('/comfy/')) return proxy(req, res, comfy, '/comfy');
  if (path.startsWith('/ollama/')) return proxy(req, res, ollama, '/ollama');
  if (path === '/api/status') return sendJson(res, 200, { mode, comfy: await alive(comfy.host, comfy.port), ollama: await alive(ollama.host, ollama.port) });
  if (path === '/api/mode' && req.method === 'POST') {
    const { mode: next } = await readBody(req);
    if (!['image', 'chat'].includes(next)) return sendJson(res, 400, { error: 'modo inválido' });
    return sendJson(res, 200, await setMode(next));
  }
  if (path.startsWith('/workflows/')) return serveFile(res, 'workflows', decodeURIComponent(path.slice('/workflows/'.length)));
  return serveFile(res, 'public', decodeURIComponent(path));
});

// WebSocket do ComfyUI (progresso): repassa o handshake e conecta os dois sockets.
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/comfy/')) return socket.destroy();
  const up = net.connect(comfy.port, comfy.host, () => {
    const headers = Object.entries(req.headers).filter(([k]) => !['host', 'origin'].includes(k)).map(([k, v]) => `${k}: ${v}`);
    up.write(`GET ${req.url.slice('/comfy'.length)} HTTP/1.1\r\nHost: ${comfy.host}:${comfy.port}\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

async function ensureComfy() {
  if (!comfy.autostart || await alive(comfy.host, comfy.port)) return;
  const { command, args = [], cwd } = comfy.autostart;
  console.log('ComfyUI não está rodando; iniciando...');
  const child = spawn(command, args, { cwd, stdio: 'ignore', windowsHide: true });
  child.on('error', (e) => console.log('não foi possível iniciar o ComfyUI:', e.message));
  process.on('exit', () => child.kill());
  process.on('SIGINT', () => process.exit());
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`localia em http://127.0.0.1:${PORT} (config: ${configPath.split(sep).pop()})`);
  ensureComfy();
  if (idleMinutes > 0) {
    setInterval(() => {
      if (Date.now() - lastSeen > idleMinutes * 60_000) {
        console.log(`sem uso há ${idleMinutes} min; encerrando.`);
        process.exit(0);
      }
    }, 10_000).unref();
  }
});
