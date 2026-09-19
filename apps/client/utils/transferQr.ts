export interface TransferQrPayload {
  signalUrl: string;
  roomToken: string;
}

const ROOM_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

export function parseTransferQr(raw: string, currentOrigin: string): TransferQrPayload | undefined {
  try {
    const url = new URL(raw);
    if (url.origin !== currentOrigin) return undefined;

    const signalUrl = url.searchParams.get("signal") || "";
    const roomToken = url.searchParams.get("room") || "";

    if (!ROOM_TOKEN_PATTERN.test(roomToken)) return undefined;
    const signal = new URL(signalUrl);
    if (!["http:", "https:", "ws:", "wss:"].includes(signal.protocol)) return undefined;

    return { signalUrl, roomToken };
  } catch {
    return undefined;
  }
}
