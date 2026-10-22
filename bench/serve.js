// Servidor estático para bench/out/: node bench/serve.js [porta] (ou PORT)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./out/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).split(sep).filter(Boolean).join(sep) || 'contact.html';
  if (path.startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(Number(process.env.PORT || process.argv[2]) || 3100, '127.0.0.1', () => console.log('http://127.0.0.1:' + (process.env.PORT || process.argv[2] || 3100)));
