declare module "qrcode-generator" {
  interface QRCode {
    addData(value: string): void;
    make(): void;
    createDataURL(cellSize?: number, margin?: number): string;
  }

  type QRCodeFactory = (typeNumber: number, errorCorrectionLevel: string) => QRCode;
  const qrcode: QRCodeFactory;
  export default qrcode;
}
