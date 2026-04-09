declare module 'compress-pdf' {
  export function compress(
    input: string | Buffer,
    options?: { resolution?: string; imageQuality?: number }
  ): Promise<Buffer>;
  export function getBinPath(platform: string): string;
}
