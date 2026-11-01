import { useEffect, useState } from 'react';
import { X, Maximize2 } from 'lucide-react';

type Props = {
  selectionCount: number;
  onApply: (percent: number) => void;
  onClose: () => void;
};

const PRESETS = [50, 75, 150, 200];
const MAX_PERCENT = 1000;

const inputClass =
  'w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-blue-500 focus:outline-none';

export default function ScaleDialog({ selectionCount, onApply, onClose }: Props) {
  const [value, setValue] = useState('150');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const percent = value.trim() === '' ? NaN : Number(value);
  const valid = Number.isFinite(percent) && percent > 0 && percent <= MAX_PERCENT;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-5 space-y-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Maximize2 size={14} />
            Scale selection
          </h2>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <label className="block text-xs text-slate-400">
          Size (percent of current size)
          <input
            type="number"
            min={1}
            max={MAX_PERCENT}
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>

        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setValue(String(p))}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors ${
                percent === p ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p}%
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          {valid
            ? `Resizes ${selectionCount} selected ${selectionCount === 1 ? 'shape' : 'shapes'} to ${percent}% around their center.`
            : `Enter a percentage from 1 to ${MAX_PERCENT}.`}
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-slate-300 hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => valid && onApply(percent)}
            disabled={!valid}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
