import { useRef, useState } from 'react';
import type { ToolType, Workspace, Shape } from '@/types';
import { TEMPLATES } from '@/lib/templates';
import { genId } from '@/lib/geometry';
import {
  MousePointer2,
  Square,
  Circle as CircleIcon,
  Minus,
  Type,
  Spline,
  Grid3x3,
  Ruler,
  Trash2,
  Layers,
  Settings2,
  Upload,
  Shapes,
  PencilRuler,
  FileType,
} from 'lucide-react';

type Props = {
  tool: ToolType;
  setTool: (t: ToolType) => void;
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  gridSize: number;
  setGridSize: (v: number) => void;
  snapToGrid: boolean;
  setSnapToGrid: (v: boolean) => void;
  showDimensions: boolean;
  setShowDimensions: (v: boolean) => void;
  onClearShapes: () => void;
  onImportSvg: (file: File) => void;
  onUploadFont: (file: File) => void;
  onAddTemplate: (shapes: Shape[]) => void;
  shapeCount: number;
  disabled?: boolean;
};

export default function Toolbar({
  tool,
  setTool,
  workspace,
  setWorkspace,
  showGrid,
  setShowGrid,
  gridSize,
  setGridSize,
  snapToGrid,
  setSnapToGrid,
  showDimensions,
  setShowDimensions,
  onClearShapes,
  onImportSvg,
  onUploadFont,
  onAddTemplate,
  shapeCount,
  disabled = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const tools: { id: ToolType; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: 'Select' },
    { id: 'rect', icon: <Square size={16} />, label: 'Rectangle' },
    { id: 'circle', icon: <CircleIcon size={16} />, label: 'Circle' },
    { id: 'line', icon: <Minus size={16} />, label: 'Line' },
    { id: 'path', icon: <Spline size={16} />, label: 'Path' },
    { id: 'text', icon: <Type size={16} />, label: 'Text' },
    { id: 'dimension', icon: <PencilRuler size={16} />, label: 'Dimension' },
  ];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImportSvg(file);
    e.target.value = '';
  }

  function handleFontChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUploadFont(file);
    e.target.value = '';
  }

  function handleTemplateClick(templateId: string) {
    const tmpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    const shapes = tmpl.create(10, 10).map((s) => ({ ...s, id: genId() }));
    onAddTemplate(shapes);
    setShowTemplates(false);
  }

  const disabledCls = disabled ? 'opacity-40 pointer-events-none' : '';

  return (
    <div className={`flex items-center gap-1 px-2 py-1.5 bg-slate-900 border-b border-slate-700/50 transition-opacity ${disabledCls}`}>
      <div className="flex items-center gap-0.5">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.label}
            className={`flex items-center justify-center w-9 h-9 rounded transition-colors ${
              tool === t.id
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      {/* Templates dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowTemplates((s) => !s)}
          title="Template Shapes"
          className={`flex items-center justify-center w-9 h-9 rounded transition-colors ${
            showTemplates ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Shapes size={16} />
        </button>
        {showTemplates && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowTemplates(false)} />
            <div className="absolute top-full left-0 mt-1 z-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[180px] max-h-64 overflow-y-auto">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Ready-Made Templates
              </div>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTemplateClick(t.id)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        title="Import SVG"
        className="flex items-center justify-center w-9 h-9 rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
      >
        <Upload size={16} />
      </button>

      <input
        ref={fontRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        onChange={handleFontChange}
        className="hidden"
      />
      <button
        onClick={() => fontRef.current?.click()}
        title="Upload Custom Font"
        className="flex items-center justify-center w-9 h-9 rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
      >
        <FileType size={16} />
      </button>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <button
        onClick={() => setShowGrid(!showGrid)}
        title="Toggle Grid"
        className={`flex items-center justify-center w-9 h-9 rounded transition-colors ${
          showGrid ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:bg-slate-800'
        }`}
      >
        <Grid3x3 size={16} />
      </button>
      <select
        value={gridSize}
        onChange={(e) => setGridSize(Number(e.target.value))}
        title="Grid spacing"
        className="h-9 w-[62px] bg-slate-800 text-slate-300 text-xs rounded border border-slate-700 focus:border-blue-500 focus:outline-none px-1"
      >
        {[1, 2, 5, 10, 20, 25, 50].map((size) => (
          <option key={size} value={size}>{size} mm</option>
        ))}
      </select>
      <button
        onClick={() => setSnapToGrid(!snapToGrid)}
        title="Toggle grid snapping"
        className={`flex items-center justify-center h-9 px-2 rounded text-xs transition-colors ${
          snapToGrid ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:bg-slate-800'
        }`}
      >
        Snap
      </button>
      <button
        onClick={() => setShowDimensions(!showDimensions)}
        title="Toggle Dimensions"
        className={`flex items-center justify-center w-9 h-9 rounded transition-colors ${
          showDimensions ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:bg-slate-800'
        }`}
      >
        <Ruler size={16} />
      </button>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <div className="flex items-center gap-1.5">
        <Layers size={14} className="text-slate-500" />
        <span className="text-xs text-slate-400">{shapeCount} shapes</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <Settings2 size={14} className="text-slate-500" />
        <label className="text-xs text-slate-400">Workspace:</label>
        <input
          type="number"
          value={workspace.width}
          onChange={(e) => setWorkspace({ ...workspace, width: parseFloat(e.target.value) || 100 })}
          className="w-16 bg-slate-800 text-slate-300 text-xs rounded px-2 py-1 border border-slate-700 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-slate-600 text-xs">×</span>
        <input
          type="number"
          value={workspace.height}
          onChange={(e) => setWorkspace({ ...workspace, height: parseFloat(e.target.value) || 100 })}
          className="w-16 bg-slate-800 text-slate-300 text-xs rounded px-2 py-1 border border-slate-700 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">{workspace.unit}</span>
      </div>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <button
        onClick={onClearShapes}
        disabled={shapeCount === 0}
        title="Clear All Shapes"
        className="flex items-center justify-center w-9 h-9 rounded text-slate-400 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-30 transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
