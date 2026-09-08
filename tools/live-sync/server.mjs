#!/usr/bin/env node
import { watch, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const LIVE_FILE = resolve(ROOT, 'live.js');
const WS_PORT = Number(process.env.LIVE_SYNC_PORT || 9999);
const DEBOUNCE_MS = 80;

if (!existsSync(LIVE_FILE)) {
  console.error(`[live-sync] missing file: ${LIVE_FILE}`);
  process.exit(1);
}

const clients = new Set();

function readCode() {
  return readFileSync(LIVE_FILE, 'utf8');
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

function sendCode(ws) {
  const msg = { type: 'code', code: readCode() };
  if (ws) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
    return;
  }
  broadcast(msg);
}

const wss = new WebSocketServer({ port: WS_PORT });
console.log(`[live-sync] watching ${LIVE_FILE}`);
console.log(`[live-sync] ws://localhost:${WS_PORT}`);

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[live-sync] client connected (${clients.size})`);
  sendCode(ws);

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[live-sync] client disconnected (${clients.size})`);
  });

  ws.on('error', (err) => {
    console.warn('[live-sync] client error', err.message);
  });
});

let debounceTimer;
watch(LIVE_FILE, { persistent: true }, (eventType) => {
  if (eventType !== 'change' && eventType !== 'rename') {
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    try {
      console.log('[live-sync] file changed → broadcasting');
      sendCode();
    } catch (err) {
      console.warn('[live-sync] failed to read file', err.message);
    }
  }, DEBOUNCE_MS);
});
