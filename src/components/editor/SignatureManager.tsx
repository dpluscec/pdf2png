import { useState, useRef, useEffect } from 'react';
import SignaturePad from 'signature_pad';
import type { SavedSignature } from '../../lib/editor/types';
import { saveSignatures } from '../../lib/editor/persistence';

type Tab = 'draw' | 'type' | 'upload';

const CURSIVE_FONTS = ['Dancing Script', 'Georgia', 'Arial'];

interface Props {
  signatures: SavedSignature[];
  onSignaturesChange: (sigs: SavedSignature[]) => void;
  activeSignatureId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function overlayStyle(): React.CSSProperties {
  return {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function modalStyle(): React.CSSProperties {
  return {
    background: '#fff', borderRadius: 8, padding: 24, width: 480, maxHeight: '90vh',
    overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  };
}

export default function SignatureManager({
  signatures,
  onSignaturesChange,
  activeSignatureId,
  onSelect,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('draw');
  const [typedName, setTypedName] = useState('');
  const [typedFont, setTypedFont] = useState('Dancing Script');
  const padCanvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = padCanvasRef.current;
    if (!canvas) return;
    padRef.current = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
    return () => { padRef.current?.off(); padRef.current = null; };
  }, [tab]);

  function saveNewSig(dataUrl: string) {
    const count = signatures.length + 1;
    const newSig: SavedSignature = { id: uid(), name: `Signature ${count}`, dataUrl };
    const updated = [...signatures, newSig];
    saveSignatures(updated);
    onSignaturesChange(updated);
    onSelect(newSig.id);
  }

  function handleSaveDraw() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    saveNewSig(pad.toDataURL('image/png'));
  }

  function handleSaveType() {
    if (!typedName.trim()) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = `48px "${typedFont}"`;
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, 16, 50);
    saveNewSig(canvas.toDataURL('image/png'));
  }

  function handleUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) saveNewSig(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleDelete(id: string) {
    const updated = signatures.filter((s) => s.id !== id);
    saveSignatures(updated);
    onSignaturesChange(updated);
  }

  function handleRename(id: string, name: string) {
    const updated = signatures.map((s) => (s.id === id ? { ...s, name } : s));
    saveSignatures(updated);
    onSignaturesChange(updated);
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', border: 'none', borderBottom: active ? '2px solid #0070f3' : '2px solid transparent',
    background: 'none', cursor: 'pointer', fontWeight: active ? 600 : 400,
    color: active ? '#0070f3' : '#555', fontSize: '0.9rem',
  });

  return (
    <div style={overlayStyle()} role="dialog" aria-modal="true" aria-label="Signature Manager"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Signatures</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
          {(['draw', 'type', 'upload'] as Tab[]).map((t) => (
            <button key={t} style={tabBtnStyle(tab === t)} onClick={() => setTab(t)}>
              {t === 'draw' ? 'Draw' : t === 'type' ? 'Type' : 'Upload'}
            </button>
          ))}
        </div>

        {/* Draw tab */}
        {tab === 'draw' && (
          <div>
            <canvas
              ref={padCanvasRef}
              width={432}
              height={150}
              style={{ border: '1px solid #ccc', borderRadius: 4, width: '100%', touchAction: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => padRef.current?.clear()}
                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
                Clear
              </button>
              <button onClick={handleSaveDraw}
                style={{ padding: '6px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Save signature
              </button>
            </div>
          </div>
        )}

        {/* Type tab */}
        {tab === 'type' && (
          <div>
            <input
              type="text"
              placeholder="Your name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: 16, border: '1px solid #ccc', borderRadius: 4, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <select
              value={typedFont}
              onChange={(e) => setTypedFont(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4, marginBottom: 8 }}
            >
              {CURSIVE_FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
            {typedName && (
              <div style={{ fontFamily: typedFont, fontSize: 36, padding: 8, border: '1px solid #eee', borderRadius: 4, marginBottom: 8, minHeight: 56 }}>
                {typedName}
              </div>
            )}
            <button onClick={handleSaveType}
              style={{ padding: '6px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Save signature
            </button>
          </div>
        )}

        {/* Upload tab */}
        {tab === 'upload' && (
          <div>
            <label
              style={{ display: 'block', border: '2px dashed #aaa', borderRadius: 8, padding: '2rem', textAlign: 'center', cursor: 'pointer', color: '#666' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file);
              }}
            >
              Drop PNG / JPG / SVG here or click to select
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
              />
            </label>
          </div>
        )}

        {/* Saved signatures list */}
        {signatures.length > 0 && (
          <>
            <h4 style={{ marginTop: 24, marginBottom: 8 }}>Saved signatures</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {signatures.map((sig) => (
                <div
                  key={sig.id}
                  onClick={() => { onSelect(sig.id); onClose(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: 8,
                    border: sig.id === activeSignatureId ? '2px solid #0070f3' : '1px solid #e5e7eb',
                    borderRadius: 6, cursor: 'pointer', background: sig.id === activeSignatureId ? '#e8f0fe' : '#fff',
                  }}
                >
                  <img src={sig.dataUrl} alt={sig.name}
                    style={{ width: 100, height: 40, objectFit: 'contain', border: '1px solid #eee', borderRadius: 4 }} />
                  <input
                    value={sig.name}
                    onChange={(e) => { e.stopPropagation(); handleRename(sig.id, e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14 }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(sig.id); }}
                    aria-label={`Delete ${sig.name}`}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
