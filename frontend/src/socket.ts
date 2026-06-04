// src/socket.ts

type SocketHandler = (data: any) => void;

let socket: WebSocket | null = null;
let handler: SocketHandler | null = null;

const pendingMessages: unknown[] = [];

function buildWsUrl(token: string) {
  const raw =
    (import.meta.env.VITE_WS_URL as string | undefined)?.trim() ||
    "ws://localhost:8000/ws";

  const url = new URL(raw);

  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = "/ws";
  }

  url.searchParams.set("token", token);

  return url.toString();
}

function flushPendingMessages() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift();
    socket.send(JSON.stringify(msg));
  }
}

export function connectSocket(token: string, onMessage: SocketHandler) {
  handler = onMessage;

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const wsUrl = buildWsUrl(token);

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log("✅ WebSocket connected");
    flushPendingMessages();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handler?.(data);
    } catch (err) {
      console.error("WebSocket message parse error:", err);
    }
  };

  socket.onerror = (event) => {
    console.error("WebSocket error", event);
  };

  socket.onclose = () => {
    console.log("❌ WebSocket closed");
    socket = null;
  };
}

export function disconnectSocket() {
  pendingMessages.length = 0;

  if (!socket) return;

  socket.onclose = null;
  socket.close();
  socket = null;
}

export function isSocketOpen() {
  return socket?.readyState === WebSocket.OPEN;
}

export function isSocketConnecting() {
  return socket?.readyState === WebSocket.CONNECTING;
}

export function sendSocket(data: unknown) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
    return true;
  }

  if (socket && socket.readyState === WebSocket.CONNECTING) {
    pendingMessages.push(data);
    return true;
  }

  console.warn("WebSocket ist nicht verbunden.");
  return false;
}