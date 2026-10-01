// Small server: serves the built UI, stores the layout JSON and uploaded plan
// images on a persistent volume, and proxies the Home Assistant WebSocket API
// so the access token never reaches the browser.
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8099);
const DATA_DIR = path.resolve(process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data')));
const IMAGE_DIR = path.join(DATA_DIR, 'images');
const CONFIG_FILE = path.join(DATA_DIR, 'floorplan.json');
const DIST_DIR = path.join(__dirname, '..', 'dist');
fs.mkdirSync(IMAGE_DIR, { recursive: true });

// --- Home Assistant connection settings ------------------------------------
// Add-on: the Supervisor injects SUPERVISOR_TOKEN and exposes the core API.
// Standalone container: HA_URL (e.g. http://homeassistant.local:8123) + HA_TOKEN
// (a long-lived access token).
function haTarget() {
  if (process.env.SUPERVISOR_TOKEN) {
    return { mode: 'addon', url: 'ws://supervisor/core/websocket', token: process.env.SUPERVISOR_TOKEN };
  }
  if (process.env.HA_URL && process.env.HA_TOKEN) {
    const base = process.env.HA_URL.replace(/\/+$/, '').replace(/^http/, 'ws');
    return { mode: 'standalone', url: `${base}/api/websocket`, token: process.env.HA_TOKEN };
  }
  return null;
}

const app = express();
app.disable('x-powered-by');

app.get('/api/status', (_req, res) => {
  const t = haTarget();
  res.json({ ha: t ? t.mode : 'none' });
});

// --- Layout config ----------------------------------------------------------
const DEFAULT_CONFIG = { version: 1, title: 'Home', views: [] };

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return DEFAULT_CONFIG;
  }
}

app.get('/api/config', (_req, res) => {
  res.set('Cache-Control', 'no-store').json(readConfig());
});

app.put('/api/config', express.json({ limit: '5mb' }), (req, res) => {
  const cfg = req.body;
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.views)) {
    return res.status(400).json({ error: 'Invalid config' });
  }
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_FILE); // atomic replace
  res.json({ ok: true });
});

// --- Plan images ------------------------------------------------------------
const EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 0, 3) === 'GIF') return 'image/gif';
  if (buf.toString('latin1', 4, 12) === 'ftypavif') return 'image/avif';
  return null;
}

// Raw body upload (no multipart dependency). SVG is deliberately not accepted.
app.post('/api/images', express.raw({ type: () => true, limit: '40mb' }), (req, res) => {
  const buf = req.body;
  const type = Buffer.isBuffer(buf) ? sniff(buf) : null;
  if (!type) return res.status(415).json({ error: 'Unsupported image. Use PNG, JPEG, WebP, AVIF or GIF.' });
  const file = `${crypto.randomBytes(8).toString('hex')}.${EXT_BY_TYPE[type]}`;
  fs.writeFileSync(path.join(IMAGE_DIR, file), buf);
  res.json({ file });
});

app.delete('/api/images/:file', (req, res) => {
  const file = req.params.file;
  if (!/^[a-f0-9]{16}\.(png|jpg|webp|avif|gif)$/.test(file)) return res.status(400).json({ error: 'Bad name' });
  fs.rmSync(path.join(IMAGE_DIR, file), { force: true });
  res.json({ ok: true });
});

app.use('/media', express.static(IMAGE_DIR, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' }));

// --- UI ----------------------------------------------------------------------
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(DIST_DIR, 'index.html')));
}

// --- Home Assistant WebSocket proxy -------------------------------------------
// The browser speaks the normal HA WebSocket protocol minus authentication:
// we authenticate upstream ourselves and tell the client {"type":"auth_ok"}.
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname !== '/api/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', (client) => {
  const target = haTarget();
  if (!target) {
    client.send(JSON.stringify({ type: 'auth_invalid', message: 'HA_URL / HA_TOKEN are not configured on the server.' }));
    return client.close();
  }
  const upstream = new WebSocket(target.url);
  let authed = false;
  const queue = [];

  upstream.on('message', (data) => {
    if (authed) return client.readyState === WebSocket.OPEN && client.send(data.toString());
    const msg = JSON.parse(data.toString());
    if (msg.type === 'auth_required') {
      upstream.send(JSON.stringify({ type: 'auth', access_token: target.token }));
    } else if (msg.type === 'auth_ok') {
      authed = true;
      client.send(JSON.stringify({ type: 'auth_ok' }));
      queue.splice(0).forEach((m) => upstream.send(m));
    } else if (msg.type === 'auth_invalid') {
      client.send(JSON.stringify({ type: 'auth_invalid', message: 'Home Assistant rejected the server token.' }));
      client.close();
    }
  });
  client.on('message', (data) => {
    const text = data.toString();
    if (authed) upstream.send(text);
    else queue.push(text);
  });
  upstream.on('error', (err) => {
    console.error('HA upstream error:', err.message);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'auth_invalid', message: `Cannot reach Home Assistant: ${err.message}` }));
      client.close();
    }
  });
  upstream.on('close', () => client.close());
  client.on('close', () => upstream.close());
  client.on('error', () => upstream.close());
});

server.listen(PORT, '0.0.0.0', () => {
  const t = haTarget();
  console.log(`floorplan-ha listening on :${PORT} | data: ${DATA_DIR} | Home Assistant: ${t ? t.mode : 'not configured (demo mode)'}`);
});
