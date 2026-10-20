import { Capacitor, registerPlugin } from '@capacitor/core';

// Barcode scanning via the native ML Kit plugin (@capacitor-mlkit/barcode-scanning).
// Talks to the native side by name, so the web build needs no extra JS; until a build
// includes the plugin, canScan() is false and the scan button simply isn't shown.
interface BarcodeScannerPlugin {
  scan(options?: { formats?: string[] }): Promise<{ barcodes: { rawValue?: string; displayValue?: string }[] }>;
  requestPermissions(): Promise<{ camera: string }>;
  isGoogleBarcodeScannerModuleAvailable?(): Promise<{ available: boolean }>;
  installGoogleBarcodeScannerModule?(): Promise<void>;
}
const Scanner = registerPlugin<BarcodeScannerPlugin>('BarcodeScanner');

export const canScan = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BarcodeScanner');

/** Opens the camera scanner; returns the code, or null (cancelled / no permission). */
export async function scanBarcode(): Promise<string | null> {
  if (!canScan()) return null;
  try {
    const perm = await Scanner.requestPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') return null;
    if (Capacitor.getPlatform() === 'android' && Scanner.isGoogleBarcodeScannerModuleAvailable) {
      const { available } = await Scanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available && Scanner.installGoogleBarcodeScannerModule) await Scanner.installGoogleBarcodeScannerModule();
    }
    const { barcodes } = await Scanner.scan({ formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'] });
    return barcodes[0]?.rawValue ?? barcodes[0]?.displayValue ?? null;
  } catch {
    return null;
  }
}
