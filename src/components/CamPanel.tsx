import type { CamSettings, CutType } from '@/types';
import { calculateVBitDepth } from '@/lib/gcode';

type Props = {
  settings: CamSettings;
  onChange: (settings: CamSettings) => void;
  onGenerate: () => void;
  shapeCount: number;
  disabled?: boolean;
};

export default function CamPanel({ settings, onChange, onGenerate, shapeCount, disabled = false }: Props) {
  const update = (key: keyof CamSettings, value: string | number) => {
    onChange({ ...settings, [key]: value });
  };

  const disabledCls = disabled ? 'opacity-40 pointer-events-none' : '';
  const isVCarve = settings.cutType === 'vcarve';
  const vBitDepth = calculateVBitDepth(settings.vBitWidth, settings.vBitAngle);

  return (
    <div className={`flex flex-col gap-4 p-4 transition-opacity ${disabledCls}`}>
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Toolpath Settings</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Cut Type</label>
            <div className="grid grid-cols-4 gap-1">
              {(['profile', 'pocket', 'drill', 'vcarve'] as CutType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => update('cutType', t)}
                  className={`px-1.5 py-1.5 text-xs rounded font-medium capitalize transition-colors ${
                    settings.cutType === t
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {t === 'vcarve' ? 'V-Carve' : t}
                </button>
              ))}
            </div>
          </div>

          {isVCarve ? (
            <>
              <Field label="V-Bit Angle" value={settings.vBitAngle} unit="deg" onChange={(v) => update('vBitAngle', v)} />
              <Field label="V-Bit Width" value={settings.vBitWidth} unit="mm" onChange={(v) => update('vBitWidth', v)} />
              <Field label="Max Depth" value={settings.cutDepth} unit="mm" onChange={(v) => update('cutDepth', v)} />
              <Field label="Pass Depth" value={settings.passDepth} unit="mm" onChange={(v) => update('passDepth', v)} />
              <Field label="Feed Rate" value={settings.feedRate} unit="mm/min" onChange={(v) => update('feedRate', v)} />
              <Field label="Plunge Rate" value={settings.plungeRate} unit="mm/min" onChange={(v) => update('plungeRate', v)} />
              <Field label="Safe Height" value={settings.safeHeight} unit="mm" onChange={(v) => update('safeHeight', v)} />
              <Field label="Spindle Speed" value={settings.spindleSpeed} unit="RPM" onChange={(v) => update('spindleSpeed', v)} />
            </>
          ) : (
            <>
              <Field label="Bit Diameter" value={settings.bitDiameter} unit="mm" onChange={(v) => update('bitDiameter', v)} />
              <Field label="Cut Depth" value={settings.cutDepth} unit="mm" onChange={(v) => update('cutDepth', v)} />
              <Field label="Pass Depth" value={settings.passDepth} unit="mm" onChange={(v) => update('passDepth', v)} />
              <Field label="Safe Height" value={settings.safeHeight} unit="mm" onChange={(v) => update('safeHeight', v)} />
              <Field label="Feed Rate" value={settings.feedRate} unit="mm/min" onChange={(v) => update('feedRate', v)} />
              <Field label="Plunge Rate" value={settings.plungeRate} unit="mm/min" onChange={(v) => update('plungeRate', v)} />
              <Field label="Spindle Speed" value={settings.spindleSpeed} unit="RPM" onChange={(v) => update('spindleSpeed', v)} />
            </>
          )}

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Units</label>
            <div className="grid grid-cols-2 gap-1">
              {(['mm', 'inch'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => update('units', u)}
                  className={`px-2 py-1.5 text-xs rounded font-medium transition-colors ${
                    settings.units === u
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
        {isVCarve && (
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 pb-2 border-b border-slate-700/30">
            <span>Calc. V-Bit Depth</span>
            <span className="text-blue-300 font-mono">{vBitDepth.toFixed(3)}mm</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>Passes</span>
          <span className="text-slate-200 font-mono">
            {isVCarve
              ? Math.ceil(Math.min(vBitDepth, settings.cutDepth) / settings.passDepth)
              : Math.ceil(settings.cutDepth / settings.passDepth)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>Shapes</span>
          <span className="text-slate-200 font-mono">{shapeCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{isVCarve ? 'V-Bit Width' : 'Bit Offset'}</span>
          <span className="text-slate-200 font-mono">
            {isVCarve ? `${settings.vBitWidth.toFixed(2)}mm` : `${(settings.bitDiameter / 2).toFixed(2)}mm`}
          </span>
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={shapeCount === 0 || disabled}
        className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        Generate G-Code
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 pr-10 border border-slate-700 focus:border-blue-500 focus:outline-none"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}
