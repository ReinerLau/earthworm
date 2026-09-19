export interface TransferReceiverUrlOptions {
  appUrl: string;
  signalUrl: string;
  roomToken: string;
}

export function createTransferReceiverUrl(options: TransferReceiverUrlOptions): string {
  const url = new URL(options.appUrl);
  url.search = new URLSearchParams({
    signal: options.signalUrl,
    room: options.roomToken,
  }).toString();
  return url.toString();
}
