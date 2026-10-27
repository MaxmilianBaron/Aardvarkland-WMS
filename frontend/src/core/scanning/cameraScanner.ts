import { BrowserMultiFormatReader } from '@zxing/browser';

export function isCameraScannerAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function createCameraScannerReader(): BrowserMultiFormatReader {
  return new BrowserMultiFormatReader();
}
