import { z } from "zod";

export const COURSE_TRANSFER_VERSION = 1 as const;
export const COURSE_TRANSFER_CHUNK_SIZE = 16 * 1024;
export const COURSE_TRANSFER_MAX_BYTES = 5 * 1024 * 1024;

const courseStatementSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().nonnegative(),
  chinese: z.string(),
  english: z.string(),
  soundmark: z.string(),
});

export const courseTransferEnvelopeSchema = z.object({
  protocolVersion: z.literal(COURSE_TRANSFER_VERSION),
  kind: z.literal("course"),
  // Hash of the canonical course object (the transport hash covers the full
  // envelope and is carried separately in the transfer metadata).
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  course: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    order: z.number().int().nonnegative(),
    coursePackId: z.string().min(1),
    statements: z.array(courseStatementSchema).min(1),
  }),
});

export type CourseTransferEnvelopeV1 = z.infer<typeof courseTransferEnvelopeSchema>;
export type CourseTransferCourse = CourseTransferEnvelopeV1["course"];
export type CourseTransferStatement = CourseTransferCourse["statements"][number];

export type TransferRole = "sender" | "receiver";
export type TransferStatus =
  | "idle"
  | "signaling"
  | "peer-ready"
  | "negotiating"
  | "connected"
  | "transferring"
  | "completed"
  | "closed"
  | "error";

export interface TransferStatusEvent {
  status: TransferStatus;
  message?: string;
  progress?: { receivedBytes: number; totalBytes: number };
}

export interface VerifiedReceipt {
  id: string;
  name: string;
  bytes: number;
  sha256: string;
  durationMs: number;
}

export interface ReceivedCourse {
  envelope: CourseTransferEnvelopeV1;
  receipt: Omit<VerifiedReceipt, "id" | "name" | "durationMs">;
}

export interface TransferSessionOptions {
  role: TransferRole;
  signalUrl: string;
  roomToken: string;
  rtcConfiguration?: RTCConfiguration;
  signalTimeoutMs?: number;
  peerTimeoutMs?: number;
  transferTimeoutMs?: number;
  onStatus?: (event: TransferStatusEvent) => void;
  onCourseReceived?: (course: ReceivedCourse) => void | Promise<void>;
}

export interface TransferSession {
  connect(): Promise<void>;
  sendCourse(course: CourseTransferCourse): Promise<VerifiedReceipt>;
  close(): void;
}

export function createRoomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createCourseEnvelope(course: CourseTransferCourse): CourseTransferEnvelopeV1 {
  return courseTransferEnvelopeSchema.parse({
    protocolVersion: COURSE_TRANSFER_VERSION,
    kind: "course",
    course: {
      id: course.id,
      title: course.title,
      order: course.order,
      coursePackId: course.coursePackId,
      statements: course.statements.map((statement) => ({
        id: statement.id,
        order: statement.order,
        chinese: statement.chinese,
        english: statement.english,
        soundmark: statement.soundmark,
      })),
    },
  });
}

export function encodeChunk(index: number, body: Uint8Array): ArrayBuffer {
  const packet = new Uint8Array(4 + body.byteLength);
  new DataView(packet.buffer).setUint32(0, index);
  packet.set(body, 4);
  return packet.buffer;
}

export function decodeChunk(raw: ArrayBuffer): { index: number; body: Uint8Array } {
  if (raw.byteLength < 4) throw new Error("数据块过短");
  const view = new DataView(raw);
  return { index: view.getUint32(0), body: new Uint8Array(raw, 4) };
}

export function assembleChunks(
  chunks: Map<number, Uint8Array>,
  totalChunks: number,
  totalBytes: number,
): Uint8Array {
  if (chunks.size !== totalChunks) throw new Error("课程数据块不完整");
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (let index = 0; index < totalChunks; index++) {
    const chunk = chunks.get(index);
    if (!chunk) throw new Error(`缺少数据块 ${index}`);
    if (offset + chunk.byteLength > totalBytes) throw new Error("接收数据超过声明大小");
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== totalBytes) throw new Error("接收数据未达到声明大小");
  return bytes;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeSignalUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("信令地址必须以 http:// 或 https:// 开头");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

function signalSocketUrl(signalUrl: string, roomToken: string, role: TransferRole): string {
  const url = new URL(`${normalizeSignalUrl(signalUrl)}/signal/${roomToken}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("role", role);
  return url.toString();
}

function waitFor<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function waitForBuffer(channel: RTCDataChannel): Promise<void> {
  if (channel.bufferedAmount < 1024 * 1024) return Promise.resolve();
  return new Promise((resolve) => {
    const onLow = () => {
      channel.removeEventListener("bufferedamountlow", onLow);
      resolve();
    };
    channel.addEventListener("bufferedamountlow", onLow, { once: true });
  });
}

export function createTransferSession(options: TransferSessionOptions): TransferSession {
  const signalTimeoutMs = options.signalTimeoutMs ?? 15_000;
  const peerTimeoutMs = options.peerTimeoutMs ?? 30_000;
  const transferTimeoutMs = options.transferTimeoutMs ?? 120_000;
  let socket: WebSocket | undefined;
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let closed = false;
  let pendingCandidates: RTCIceCandidateInit[] = [];
  let queuedSignals: string[] = [];
  let resolveChannel: ((value: RTCDataChannel) => void) | undefined;
  let rejectChannel: ((reason?: unknown) => void) | undefined;
  let channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
    resolveChannel = resolve;
    rejectChannel = reject;
  });
  let incoming:
    | {
        id: string;
        name: string;
        size: number;
        sha256: string;
        totalChunks: number;
        chunks: Map<number, Uint8Array>;
        received: number;
        startedAt: number;
      }
    | undefined;

  function status(event: TransferStatusEvent): void {
    options.onStatus?.(event);
  }

  function fail(error: unknown): Error {
    const normalized = error instanceof Error ? error : new Error(String(error));
    status({ status: "error", message: normalized.message });
    rejectChannel?.(normalized);
    return normalized;
  }

  function sendSignal(value: unknown): void {
    const message = JSON.stringify(value);
    if (socket?.readyState === WebSocket.OPEN) socket.send(message);
    else queuedSignals.push(message);
  }

  async function flushCandidates(): Promise<void> {
    if (!peer?.remoteDescription) return;
    for (const candidate of pendingCandidates.splice(0)) await peer.addIceCandidate(candidate);
  }

  function setupChannel(nextChannel: RTCDataChannel): void {
    channel = nextChannel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.onopen = () => {
      status({ status: "connected", message: "数据通道已打开" });
      resolveChannel?.(channel!);
    };
    channel.onclose = () => {
      if (!closed) status({ status: "closed", message: "数据通道已关闭" });
    };
    channel.onerror = () => fail(new Error("数据通道发生错误"));
    channel.onmessage = ({ data }) => {
      void handleDataMessage(data).catch(fail);
    };
  }

  async function handleDataMessage(raw: string | ArrayBuffer | Blob): Promise<void> {
    if (typeof raw === "string") {
      const message = JSON.parse(raw) as Record<string, unknown>;
      if (message.kind === "metadata") {
        const size = Number(message.size);
        const totalChunks = Number(message.totalChunks);
        if (
          typeof message.id !== "string" ||
          typeof message.name !== "string" ||
          typeof message.sha256 !== "string" ||
          !Number.isSafeInteger(size) ||
          size <= 0 ||
          size > COURSE_TRANSFER_MAX_BYTES ||
          !Number.isSafeInteger(totalChunks) ||
          totalChunks <= 0
        ) {
          throw new Error("课程传输元数据无效");
        }
        incoming = {
          id: message.id,
          name: message.name,
          size,
          sha256: message.sha256,
          totalChunks,
          chunks: new Map(),
          received: 0,
          startedAt: performance.now(),
        };
        status({ status: "transferring", progress: { receivedBytes: 0, totalBytes: size } });
        return;
      }
      if (message.kind === "complete") {
        await finishIncoming(String(message.id));
        return;
      }
      if (message.kind === "verified" && options.role === "sender") {
        status({ status: "completed", message: "接收端已保存课程" });
        return;
      }
      if (message.kind === "failed") throw new Error(String(message.message || "接收端校验失败"));
      return;
    }

    const buffer = raw instanceof Blob ? await raw.arrayBuffer() : raw;
    if (!incoming) throw new Error("收到数据块前没有元数据");
    const { index, body } = decodeChunk(buffer);
    if (index >= incoming.totalChunks || incoming.chunks.has(index)) {
      throw new Error(`数据块索引无效：${index}`);
    }
    incoming.chunks.set(index, body.slice());
    incoming.received += body.byteLength;
    if (incoming.received > incoming.size) throw new Error("接收数据超过声明大小");
    status({
      status: "transferring",
      progress: { receivedBytes: incoming.received, totalBytes: incoming.size },
    });
  }

  async function finishIncoming(id: string): Promise<void> {
    if (!incoming || incoming.id !== id) throw new Error("complete 与当前传输不匹配");
    if (incoming.received !== incoming.size) throw new Error("课程数据块不完整");
    const bytes = assembleChunks(incoming.chunks, incoming.totalChunks, incoming.size);
    const digest = await sha256(bytes);
    if (digest !== incoming.sha256) throw new Error("课程 SHA-256 校验失败");
    const envelope = courseTransferEnvelopeSchema.parse(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    await options.onCourseReceived?.({
      envelope,
      receipt: {
        bytes: incoming.size,
        sha256: digest,
      },
    });
    const durationMs = Math.round(performance.now() - incoming.startedAt);
    channel?.send(
      JSON.stringify({
        kind: "verified",
        id,
        name: incoming.name,
        bytes: incoming.size,
        sha256: digest,
        durationMs,
      }),
    );
    status({ status: "completed", message: "课程已保存" });
    incoming = undefined;
  }

  async function handleSignal(message: unknown): Promise<void> {
    if (!peer || typeof message !== "object" || !message) return;
    const signal = message as Record<string, unknown>;
    if (signal.type === "peer-ready") {
      status({ status: "peer-ready", message: "另一端已加入房间" });
      if (options.role === "sender") {
        status({ status: "negotiating" });
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendSignal({ type: "offer", description: peer.localDescription });
      }
      return;
    }
    if (signal.type === "offer" && options.role === "receiver") {
      status({ status: "negotiating" });
      await peer.setRemoteDescription(signal.description as RTCSessionDescriptionInit);
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      sendSignal({ type: "answer", description: peer.localDescription });
      return;
    }
    if (signal.type === "answer" && options.role === "sender") {
      await peer.setRemoteDescription(signal.description as RTCSessionDescriptionInit);
      await flushCandidates();
      return;
    }
    if (signal.type === "candidate") {
      const candidate = signal.candidate as RTCIceCandidateInit;
      if (peer.remoteDescription) await peer.addIceCandidate(candidate);
      else pendingCandidates.push(candidate);
      return;
    }
    if (signal.type === "leave") throw new Error("另一端已离开房间");
  }

  async function connect(): Promise<void> {
    if (closed) throw new Error("传输会话已关闭");
    const roomToken = options.roomToken.toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(roomToken)) throw new Error("房间令牌无效");
    status({ status: "signaling", message: "连接信令服务" });
    peer = new RTCPeerConnection(
      options.rtcConfiguration ?? { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] },
    );
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal({ type: "candidate", candidate });
    };
    peer.ondatachannel = ({ channel: receivedChannel }) => setupChannel(receivedChannel);
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === "failed") fail(new Error("WebRTC 连接失败"));
    };
    if (options.role === "sender")
      setupChannel(peer.createDataChannel("courses", { ordered: true }));

    await waitFor(
      new Promise<void>((resolve, reject) => {
        socket = new WebSocket(signalSocketUrl(options.signalUrl, roomToken, options.role));
        socket.onopen = () => {
          for (const message of queuedSignals.splice(0)) socket?.send(message);
          resolve();
        };
        socket.onmessage = ({ data }) => {
          void handleSignal(JSON.parse(data)).catch(reject);
        };
        socket.onerror = () => reject(new Error("信令连接失败，请检查 VPN 或网络"));
        socket.onclose = ({ code, reason }) => {
          if (!closed && code !== 1000) reject(new Error(`信令连接断开：${code} ${reason}`));
        };
      }),
      signalTimeoutMs,
      "信令连接超时，请检查 VPN 或网络",
    );
    await waitFor(channelPromise, peerTimeoutMs, "WebRTC 连接超时，请重试");
  }

  async function sendCourse(course: CourseTransferCourse): Promise<VerifiedReceipt> {
    if (options.role !== "sender") throw new Error("只有发送端可以发送课程");
    const activeChannel = await waitFor(channelPromise, peerTimeoutMs, "数据通道未打开");
    const baseEnvelope = createCourseEnvelope(course);
    const contentHash = await sha256(new TextEncoder().encode(JSON.stringify(baseEnvelope.course)));
    const envelope: CourseTransferEnvelopeV1 = { ...baseEnvelope, contentHash };
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    if (bytes.byteLength > COURSE_TRANSFER_MAX_BYTES) throw new Error("课程超过 5 MiB 限制");
    const digest = await sha256(bytes);
    const id = crypto.randomUUID();
    const totalChunks = Math.ceil(bytes.byteLength / COURSE_TRANSFER_CHUNK_SIZE);
    const startedAt = performance.now();
    status({
      status: "transferring",
      progress: { receivedBytes: 0, totalBytes: bytes.byteLength },
    });
    activeChannel.send(
      JSON.stringify({
        kind: "metadata",
        protocolVersion: COURSE_TRANSFER_VERSION,
        id,
        name: `${course.title}.json`,
        size: bytes.byteLength,
        sha256: digest,
        chunkSize: COURSE_TRANSFER_CHUNK_SIZE,
        totalChunks,
      }),
    );
    for (let index = 0; index < totalChunks; index++) {
      await waitForBuffer(activeChannel);
      const start = index * COURSE_TRANSFER_CHUNK_SIZE;
      activeChannel.send(
        encodeChunk(
          index,
          bytes.subarray(start, Math.min(start + COURSE_TRANSFER_CHUNK_SIZE, bytes.length)),
        ),
      );
    }
    activeChannel.send(JSON.stringify({ kind: "complete", id }));
    return waitFor(
      new Promise<VerifiedReceipt>((resolve, reject) => {
        const previousMessage = activeChannel.onmessage;
        activeChannel.onmessage = ({ data }) => {
          if (typeof data === "string") {
            const message = JSON.parse(data) as Record<string, unknown>;
            if (message.kind === "verified" && message.id === id) {
              const receipt = {
                id,
                name: String(message.name),
                bytes: Number(message.bytes),
                sha256: String(message.sha256),
                durationMs: Math.round(performance.now() - startedAt),
              };
              resolve(receipt);
              return;
            }
          }
          previousMessage?.call(activeChannel, { data } as MessageEvent);
        };
        activeChannel.addEventListener("close", () => reject(new Error("数据通道已关闭")), {
          once: true,
        });
      }),
      transferTimeoutMs,
      "课程传输超时",
    );
  }

  function close(): void {
    if (closed) return;
    closed = true;
    socket?.close(1000, "done");
    channel?.close();
    peer?.close();
    status({ status: "closed" });
  }

  return { connect, sendCourse, close };
}
