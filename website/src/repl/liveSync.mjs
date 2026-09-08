import { logger } from '@strudel/core';

const DEFAULT_URL = 'ws://localhost:9999';
const MAX_BACKOFF_MS = 10000;

function isLiveSyncEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('liveSync') === '0') {
    return false;
  }
  if (params.get('liveSync') === '1') {
    return true;
  }
  return Boolean(import.meta.env.DEV);
}

/**
 * Connect to the live-sync watcher and hot-swap code into the running REPL
 * via the same Update path (setCode + evaluate) without stopping audio.
 */
export function startLiveSync(getMirror, { url = DEFAULT_URL } = {}) {
  if (!isLiveSyncEnabled()) {
    return () => {};
  }

  let ws;
  let closed = false;
  let backoff = 500;
  let reconnectTimer;
  let applying = false;
  let lastCode;

  const applyCode = async (code) => {
    if (typeof code !== 'string' || code === lastCode) {
      return;
    }
    const mirror = getMirror?.() ?? window.strudelMirror;
    if (!mirror?.setCode || !mirror?.evaluate) {
      logger('[live-sync] strudelMirror not ready yet', 'warning');
      return;
    }
    if (applying) {
      return;
    }
    applying = true;
    try {
      lastCode = code;
      mirror.setCode(code);
      // same as UI Update / Ctrl+Enter → queues into the live cycle via setPattern
      await mirror.evaluate();
      logger('[live-sync] updated from live.js', 'highlight');
    } catch (err) {
      logger(`[live-sync] evaluate failed: ${err.message || err}`, 'error');
    } finally {
      applying = false;
    }
  };

  const connect = () => {
    if (closed) {
      return;
    }
    try {
      ws = new WebSocket(url);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      backoff = 500;
      logger(`[live-sync] connected to ${url}`, 'highlight');
    };

    ws.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload?.type === 'code') {
        applyCode(payload.code);
      }
    };

    ws.onclose = () => {
      if (!closed) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will reconnect
    };
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      backoff = Math.min(backoff * 1.5, MAX_BACKOFF_MS);
      connect();
    }, backoff);
  };

  connect();

  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    try {
      ws?.close();
    } catch {
      // ignore
    }
  };
}
