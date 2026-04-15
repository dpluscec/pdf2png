import type { SavedSignature, AnnotationSession } from './types';

const ANNO_KEY_PREFIX = 'pdf-editor-annotations-';
const SIG_KEY = 'pdf-editor-signatures';

export function djb2Hash(bytes: Uint8Array): string {
  let hash = 5381;
  const len = Math.min(bytes.length, 65536);
  for (let i = 0; i < len; i++) {
    hash = (((hash << 5) + hash) ^ bytes[i]) >>> 0;
  }
  return hash.toString(16);
}

export async function hashFile(file: File): Promise<string> {
  const slice = file.slice(0, 65536);
  const buffer = await slice.arrayBuffer();
  return djb2Hash(new Uint8Array(buffer));
}

export function saveAnnotations(hash: string, session: AnnotationSession): void {
  localStorage.setItem(ANNO_KEY_PREFIX + hash, JSON.stringify(session));
}

export function loadAnnotations(hash: string): AnnotationSession | null {
  const raw = localStorage.getItem(ANNO_KEY_PREFIX + hash);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AnnotationSession;
  } catch {
    return null;
  }
}

export function clearAnnotations(hash: string): void {
  localStorage.removeItem(ANNO_KEY_PREFIX + hash);
}

export function saveSignatures(signatures: SavedSignature[]): void {
  localStorage.setItem(SIG_KEY, JSON.stringify(signatures));
}

export function loadSignatures(): SavedSignature[] {
  const raw = localStorage.getItem(SIG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedSignature[];
  } catch {
    return [];
  }
}

export function getStorageUsageBytes(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('pdf-editor-')) {
      const val = localStorage.getItem(key) ?? '';
      total += (key.length + val.length) * 2;
    }
  }
  return total;
}

export function clearAllEditorData(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('pdf-editor-')) keys.push(key);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
