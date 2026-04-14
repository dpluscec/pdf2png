export type ToolType =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'cross'
  | 'text'
  | 'mono-text'
  | 'checkmark'
  | 'crossmark'
  | 'dot'
  | 'signature';

export interface StyleState {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillEnabled: boolean;
  opacity: number;
  fontSize: number;
  fontFamily: string;
}

export const DEFAULT_STYLE: StyleState = {
  strokeColor: '#000000',
  strokeWidth: 2,
  fillColor: '#ff0000',
  fillEnabled: false,
  opacity: 1,
  fontSize: 16,
  fontFamily: 'Noto Sans',
};

export interface SavedSignature {
  id: string;
  name: string;
  dataUrl: string;
}

export interface AnnotationSession {
  filename: string;
  /** Fabric.js canvas.toJSON() result for each page, indexed by page number */
  pages: object[];
  savedAt: string;
}
