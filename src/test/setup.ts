// Gives Dexie a working IndexedDB in Node (Vitest runs with environment:
// 'node', which has no browser storage APIs at all).
import 'fake-indexeddb/auto';

// Node's global Blob/File are already available (18+), but there's no
// FileReader - fileValidation.ts uses one for blob<->base64 conversion.
// This is a minimal polyfill covering just the readAsDataURL path used in
// the app and tests.
if (typeof (globalThis as any).FileReader === 'undefined') {
  class NodeFileReader {
    result: string | ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          const base64 = Buffer.from(buf).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
          this.onload?.();
        })
        .catch(() => this.onerror?.());
    }
  }
  (globalThis as any).FileReader = NodeFileReader;
}
