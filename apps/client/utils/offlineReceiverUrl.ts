export const DEFAULT_OFFLINE_PWA_URL = "https://reinerlau.github.io/earthworm";

export interface OfflineReceiverUrlOptions {
  pwaUrl?: string;
  signalUrl: string;
  roomToken: string;
}

export function createOfflineReceiverUrl(options: OfflineReceiverUrlOptions): string {
  const pwaUrl = (options.pwaUrl || DEFAULT_OFFLINE_PWA_URL).replace(/\/$/, "");
  const url = new URL(`${pwaUrl}/`);
  url.hash = `/receive?signal=${encodeURIComponent(options.signalUrl)}&room=${encodeURIComponent(options.roomToken)}`;
  return url.toString();
}
