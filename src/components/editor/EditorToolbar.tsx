import type { CSSProperties } from 'react';
import type { ToolType, StyleState } from '../../lib/editor/types';

interface ToolDef {
  id: ToolType;
  label: string;
  shortcut: string;
  symbol: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select',    label: 'Select',      shortcut: 'V', symbol: '↖' },
  { id: 'rect',      label: 'Rectangle',   shortcut: 'R', symbol: '▭' },
  { id: 'ellipse',   label: 'Ellipse',     shortcut: 'E', symbol: '⬭' },
  { id: 'line',      label: 'Line',        shortcut: 'L', symbol: '╱' },
  { id: 'cross',     label: 'Cross (×)',   shortcut: 'X', symbol: '✕' },
  { id: 'text',      label: 'Free text',   shortcut: 'T', symbol: 'T' },
  { id: 'mono-text', label: 'Monospaced',  shortcut: 'M', symbol: 'T̲' },
  { id: 'checkmark', label: 'Checkmark',   shortcut: '',  symbol: '✓' },
  { id: 'crossmark', label: 'Cross mark',  shortcut: '',  symbol: '✗' },
  { id: 'dot',       label: 'Dot',         shortcut: '',  symbol: '•' },
  { id: 'signature', label: 'Signature',   shortcut: 'S', symbol: '✒' },
];

const FONT_FAMILIES = ['Noto Sans', 'Arial', 'Georgia', 'Dancing Script'];

interface Props {
  activeTool: ToolType;
  style: StyleState;
  onToolChange: (tool: ToolType) => void;
  onStyleChange: (patch: Partial<StyleState>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSignatures: () => void;
  onDownload: () => void;
  hasFile: boolean;
}

const sidebarStyle: CSSProperties = {
  width: 56,
  minHeight: '100%',
  background: '#f9fafb',
  borderRight: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 0',
  gap: 2,
  flexShrink: 0,
};

const dividerStyle: CSSProperties = {
  width: 36,
  height: 1,
  background: '#e5e7eb',
  margin: '4px 0',
};

function ToolButton({
  def,
  active,
  disabled,
  onClick,
}: {
  def: ToolDef;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tooltip = def.shortcut ? `${def.label} [${def.shortcut}]` : def.label;
  return (
    <button
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        border: active ? '2px solid #0070f3' : '1px solid transparent',
        borderRadius: 6,
        background: active ? '#e8f0fe' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        color: active ? '#0070f3' : '#444',
      }}
    >
      {def.symbol}
    </button>
  );
}

function IconButton({
  label,
  symbol,
  disabled,
  onClick,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        border: '1px solid transparent',
        borderRadius: 6,
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        color: '#444',
      }}
    >
      {symbol}
    </button>
  );
}

export default function EditorToolbar({
  activeTool,
  style,
  onToolChange,
  onStyleChange,
  onUndo,
  onRedo,
  onOpenSignatures,
  onDownload,
  hasFile,
}: Props) {
  const shapeTools = TOOLS.filter((t) =>
    ['select', 'rect', 'ellipse', 'line', 'cross'].includes(t.id)
  );
  const textTools = TOOLS.filter((t) =>
    ['text', 'mono-text', 'checkmark', 'crossmark', 'dot'].includes(t.id)
  );
  const sigTool = TOOLS.find((t) => t.id === 'signature')!;

  const showFill = ['rect', 'ellipse'].includes(activeTool);
  const showFont = ['text', 'mono-text'].includes(activeTool);

  return (
    <div style={sidebarStyle}>
      {/* Shape tools */}
      {shapeTools.map((def) => (
        <ToolButton
          key={def.id}
          def={def}
          active={activeTool === def.id}
          disabled={!hasFile}
          onClick={() => onToolChange(def.id)}
        />
      ))}
      <div style={dividerStyle} />

      {/* Text tools */}
      {textTools.map((def) => (
        <ToolButton
          key={def.id}
          def={def}
          active={activeTool === def.id}
          disabled={!hasFile}
          onClick={() => onToolChange(def.id)}
        />
      ))}
      <div style={dividerStyle} />

      {/* Signature */}
      <ToolButton
        def={sigTool}
        active={activeTool === 'signature'}
        disabled={!hasFile}
        onClick={() => { onToolChange('signature'); onOpenSignatures(); }}
      />
      <div style={dividerStyle} />

      {/* Style controls */}
      <div title="Stroke color" style={{ padding: '2px 0' }}>
        <input
          type="color"
          value={style.strokeColor}
          onChange={(e) => onStyleChange({ strokeColor: e.target.value })}
          disabled={!hasFile}
          style={{ width: 32, height: 28, cursor: 'pointer', border: 'none', padding: 0 }}
          aria-label="Stroke color"
        />
      </div>
      <div title={`Stroke width: ${style.strokeWidth}px`} style={{ width: 40, padding: '0 4px' }}>
        <input
          type="range"
          min={1}
          max={10}
          value={style.strokeWidth}
          onChange={(e) => onStyleChange({ strokeWidth: Number(e.target.value) })}
          disabled={!hasFile}
          style={{ width: 36 }}
          aria-label="Stroke width"
        />
      </div>

      {showFill && (
        <>
          <div title="Fill color" style={{ padding: '2px 0' }}>
            <input
              type="color"
              value={style.fillColor}
              onChange={(e) => onStyleChange({ fillColor: e.target.value })}
              disabled={!hasFile}
              style={{ width: 32, height: 28, cursor: 'pointer', border: 'none', padding: 0 }}
              aria-label="Fill color"
            />
          </div>
          <button
            title={`Fill: ${style.fillEnabled ? 'on' : 'off'}`}
            onClick={() => onStyleChange({ fillEnabled: !style.fillEnabled })}
            disabled={!hasFile}
            style={{
              width: 40,
              height: 28,
              fontSize: 11,
              border: `1px solid ${style.fillEnabled ? '#0070f3' : '#ccc'}`,
              borderRadius: 4,
              background: style.fillEnabled ? '#e8f0fe' : 'transparent',
              cursor: 'pointer',
              color: style.fillEnabled ? '#0070f3' : '#888',
            }}
          >
            Fill
          </button>
        </>
      )}

      {showFont && (
        <>
          <div title="Font" style={{ width: 40, padding: '2px 0' }}>
            <select
              value={style.fontFamily}
              onChange={(e) => onStyleChange({ fontFamily: e.target.value })}
              disabled={!hasFile}
              style={{ width: 40, fontSize: 10, cursor: 'pointer' }}
              aria-label="Font"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div title={`Font size: ${style.fontSize}px`} style={{ width: 40, padding: '0 4px' }}>
            <input
              type="number"
              min={8}
              max={72}
              value={style.fontSize}
              onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
              disabled={!hasFile}
              style={{ width: 36, fontSize: 11 }}
              aria-label="Font size"
            />
          </div>
        </>
      )}

      <div title={`Opacity: ${Math.round(style.opacity * 100)}%`} style={{ width: 40, padding: '0 4px' }}>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(style.opacity * 100)}
          onChange={(e) => onStyleChange({ opacity: Number(e.target.value) / 100 })}
          disabled={!hasFile}
          style={{ width: 36 }}
          aria-label="Opacity"
        />
      </div>

      <div style={dividerStyle} />

      {/* Undo / Redo */}
      <IconButton label="Undo [Ctrl+Z]" symbol="↩" disabled={!hasFile} onClick={onUndo} />
      <IconButton label="Redo [Ctrl+Y]" symbol="↪" disabled={!hasFile} onClick={onRedo} />

      <div style={dividerStyle} />

      {/* Download */}
      <IconButton label="Download" symbol="⬇" disabled={!hasFile} onClick={onDownload} />
    </div>
  );
}
