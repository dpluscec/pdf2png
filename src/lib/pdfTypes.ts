export interface PdfEntry {
  id: string;
  file: File;
  pageCount: number | null;
  thumbnail: string | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  error: string;
}
