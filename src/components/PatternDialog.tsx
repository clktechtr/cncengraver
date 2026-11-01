import { useEffect, useState } from 'react';
import { X, Rows3, RotateCw } from 'lucide-react';
import type { Point } from '@/types';
import type { PatternSettings } from '@/lib/pattern';

type Props = {
  selectionCount: number;
  defaultCenter: Point;
  onApply: (settings: PatternSettings) => void;
  onClose: () => void;
};

const MAX_COUNT = 100;

const inputClass =
  'w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-blue-500 focus:outline-none';

function parseNumber(value: string): number {
  return value.trim() === '' ? NaN : Number(value);
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export default function PatternDialog({ selectionCount, defaultCenter, onApply, onClose }: Props) {
  const [kind, setKind] = useState<'linear' | 'circular'>('linear');
  const [count, setCount] = useState('3');
  const [dx, setDx] = useState('20');
  const [dy, setDy] = useState('0');
  const [cx, setCx] = useState(round(defaultCenter.x));
  const [cy, setCy] = useState(round(defaultCenter.y));
  const [angle, setAngle] = useState('360');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copies = Number(count);
  const countValid = Number.isInteger(copies) && copies >= 2 && copies <= MAX_COUNT;

  function buildSettings(): PatternSettings | null {
    if (!countValid) return null;
    if (kind === 'linear') {
      const x = parseNumber(dx);
      const y = parseNumber(dy);
      if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return null;
      return { kind: 'linear', count: copies, dx: x, dy: y };
    }
    const x = parseNumber(cx);
    const y = parseNumber(cy);
    const total = parseNumber(angle);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(total) || total === 0) return null;
    return { kind: 'circular', count: copies, center: { x, y }, totalAngle: total };
  }

  const settings = buildSettings();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-5 space-y-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Pattern copies</h2>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-800 rounded-lg">
          {([
            { id: 'linear', label: 'Linear', icon: <Rows3 size={14} /> },
            { id: 'circular', label: 'Circular', icon: <RotateCw size={14} /> },
          ] as const).map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                kind === k.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {k.icon}
              {k.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            Total count (including original)
            <input type="number" min={2} max={MAX_COUNT} value={count} onChange={(e) => setCount(e.target.value)} className={`${inputClass} mt-1`} />
          </label>

          {kind === 'linear' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-400">
                Spacing X (mm)
                <input type="number" step="0.1" value={dx} onChange={(e) => setDx(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="block text-xs text-slate-400">
                Spacing Y (mm)
                <input type="number" step="0.1" value={dy} onChange={(e) => setDy(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-slate-400">
                  Center X (mm)
                  <input type="number" step="0.1" value={cx} onChange={(e) => setCx(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="block text-xs text-slate-400">
                  Center Y (mm)
                  <input type="number" step="0.1" value={cy} onChange={(e) => setCy(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <label className="block text-xs text-slate-400">
                Total angle (degrees)
                <input type="number" step="1" value={angle} onChange={(e) => setAngle(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
            </>
          )}
        </div>

        <p className="text-xs text-slate-500">
          {settings
            ? `Adds ${settings.count - 1} copies of ${selectionCount} selected ${selectionCount === 1 ? 'shape' : 'shapes'}.`
            : `Enter a count from 2 to ${MAX_COUNT} and valid values.`}
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-slate-300 hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => settings && onApply(settings)}
            disabled={!settings}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
