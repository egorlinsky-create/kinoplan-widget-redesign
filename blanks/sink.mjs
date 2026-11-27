// Приёмник PNG от render.html: POST /save?name=...&w=... , тело — dataURL base64.
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'png');
mkdirSync(OUT, { recursive: true });

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/save') { res.writeHead(200).end('ok'); return; }
  const name = (url.searchParams.get('name') || 'asset').replace(/[^\w.-]/g, '');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const b64 = body.replace(/^data:image\/png;base64,/, '');
    writeFileSync(join(OUT, name + '.png'), Buffer.from(b64, 'base64'));
    console.log('saved', name, Math.round(b64.length * 0.75 / 1024) + 'KB');
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('saved ' + name);
  });
}).listen(8777, '127.0.0.1', () => console.log('sink on http://127.0.0.1:8777'));
