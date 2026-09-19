const ROOM_LIFETIME_MS = 10 * 60 * 1000;
const MAX_SIGNAL_BYTES = 64 * 1024;
const ROOM_TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const ALLOWED_MESSAGE_TYPES = new Set(["offer", "answer", "candidate", "leave"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "earthworm-course-transfer" });
    }

    const match = url.pathname.match(/^\/signal\/([a-f0-9]{32})$/);
    if (!match || !ROOM_TOKEN_PATTERN.test(match[1])) {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const role = url.searchParams.get("role");
    if (role !== "sender" && role !== "receiver") {
      return new Response("Invalid role", { status: 400 });
    }

    const room = env.SIGNAL_ROOMS.getByName(match[1]);
    return room.fetch(request);
  },
};

export class SignalRoom {
  constructor(state) {
    this.ctx = state;
  }

  async fetch(request) {
    const role = new URL(request.url).searchParams.get("role");
    const sockets = this.ctx.getWebSockets();
    const roles = sockets.map((socket) => socket.deserializeAttachment()?.role);

    if (sockets.length >= 2 || roles.includes(role)) {
      return new Response("Room already has this role", { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ role });
    this.ctx.acceptWebSocket(server);

    if (sockets.length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_LIFETIME_MS);
    } else {
      const ready = JSON.stringify({ type: "peer-ready" });
      server.send(ready);
      sockets[0].send(ready);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(sender, message) {
    if (
      typeof message !== "string" ||
      new TextEncoder().encode(message).byteLength > MAX_SIGNAL_BYTES
    ) {
      sender.close(1009, "Unsupported message");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      sender.close(1003, "Expected JSON");
      return;
    }

    if (!parsed || !ALLOWED_MESSAGE_TYPES.has(parsed.type)) {
      sender.close(1008, "Unsupported signal type");
      return;
    }

    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== sender) socket.send(message);
    }
  }

  webSocketClose(socket, code, reason) {
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== socket) peer.send(JSON.stringify({ type: "leave", code, reason }));
    }
  }

  async alarm() {
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(4000, "Room expired");
    }
    await this.ctx.storage.deleteAlarm();
  }
}
