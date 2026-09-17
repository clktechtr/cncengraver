import { useState } from 'react';
import type { GCodeLine } from '@/types';
import { Download, Copy, FileText } from 'lucide-react';

type Props = {
  lines: string[];
  parsed: GCodeLine[];
  onCopy: () => void;
};

export default function GCodeViewer({ lines, parsed, onCopy }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cnc-job.gcode';
    a.click();
    URL.revokeObjectURL(url);
  }

  const rapidCount = parsed.filter((p) => p.command === 'G0').length;
  const cutCount = parsed.filter((p) => p.command === 'G1').length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <FileText size={14} className="text-slate-500" />
          <span className="font-medium">G-Code Output</span>
          <span className="text-xs text-slate-500">({lines.length} lines)</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            {copied ? <Copy size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            disabled={lines.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
          >
            <Download size={12} />
            Save
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-1.5 text-[11px] text-slate-500 bg-slate-900/50 border-b border-slate-800">
        <span>G0: {rapidCount}</span>
        <span>G1: {cutCount}</span>
      </div>
      <div className="flex-1 overflow-auto bg-[#0d1117] font-mono text-xs">
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Generate G-Code to see output
          </div>
        ) : (
          <table className="w-full">
            <tbody>
              {lines.map((line, i) => {
                const p = parsed[i];
                const isComment = line.trim().startsWith(';');
                const isRapid = p?.command === 'G0';
                const isCut = p?.command === 'G1';
                const isMove = isRapid || isCut;
                return (
                  <tr
                    key={i}
                    className={`border-b border-slate-900/50 ${
                      isComment
                        ? 'text-slate-600'
                        : isRapid
                        ? 'text-cyan-400'
                        : isCut
                        ? 'text-amber-300'
                        : 'text-slate-300'
                    }`}
                  >
                    <td className="px-2 py-0.5 text-right text-slate-700 w-10 select-none">
                      {i + 1}
                    </td>
                    <td className="px-2 py-0.5 whitespace-nowrap">
                      {isMove && (
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
                            isRapid ? 'bg-cyan-400' : 'bg-amber-400'
                          }`}
                        />
                      )}
                      {line.trim()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
