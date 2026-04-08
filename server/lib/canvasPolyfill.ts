import { Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';

// pdfjs-dist checks these globals at module load time.
// On Node.js < 22, its built-in polyfill fails (uses process.getBuiltinModule
// which is v22+), so we set them here before pdfjs-dist is imported.
if (!globalThis.Path2D) (globalThis as Record<string, unknown>).Path2D = Path2D;
if (!globalThis.DOMMatrix) (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
if (!globalThis.ImageData) (globalThis as Record<string, unknown>).ImageData = ImageData;
