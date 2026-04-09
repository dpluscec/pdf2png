import { compress } from 'compress-pdf';

export type CompressionLevel = 'maximum' | 'balanced' | 'quality';

const RESOLUTION: Record<CompressionLevel, string> = {
  maximum: 'screen',
  balanced: 'ebook',
  quality: 'printer',
};

export async function compressPdf(inputBuffer: Buffer, level: CompressionLevel): Promise<Buffer> {
  if (!(level in RESOLUTION)) {
    throw new Error(`Invalid compression level: ${level}`);
  }
  return compress(inputBuffer, { resolution: RESOLUTION[level] });
}
