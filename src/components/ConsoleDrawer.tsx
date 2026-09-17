import { useState, useRef, useEffect } from 'react';
import type { ConsoleEntry } from '@/types';
import { ChevronUp, ChevronDown, Trash2, Send, Terminal } from 'lucide-react';

type Props = {
  entries: ConsoleEntry[];
  onClear: () => void;
  onSend: (cmd: string) => void;
  connected: boolean;
  open: boolean;
  onToggle: () => void;
};

export default function ConsoleDrawer({
  entries,
  onClear,
  onSend,
  connected,
  open,
  onToggle,
}: Props) {
  const [manualCmd, setManualCmd] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, open]);

  function handleSend() {
    if (manualCmd.trim()) {
      onSend(manualCmd.trim());
      setManualCmd('');
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-t border-slate-700/50 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 w-full transition-colors"
      >
        <Terminal size={12} />
        <span>Console & Advanced</span>
        {entries.length > 0 && (
          <span className="text-[10px] text-slate-600">({entries.length})</span>
        )}
        <div className="flex-1" />
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Drawer */}
      <div
        className={`bg-[#0d1117] border-t border-slate-700/50 overflow-hidden transition-all duration-300 ${
          open ? 'h-48' : 'h-0'
        }`}
      >
        <div className="flex flex-col h-full">
          <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 font-mono text-[11px] space-y-0.5">
            {entries.length === 0 ? (
              <div className="text-slate-600 text-center py-4">No messages</div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex gap-2 ${
                    entry.direction === 'tx'
                      ? 'text-cyan-400'
                      : entry.direction === 'rx'
                      ? 'text-slate-300'
                      : entry.direction === 'error'
                      ? 'text-red-400'
                      : 'text-slate-500'
                  }`}
                >
                  <span className="text-slate-700 select-none shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span className="text-slate-600 select-none shrink-0">
                    {entry.direction === 'tx' ? '→' : entry.direction === 'rx' ? '←' : '·'}
                  </span>
                  <span className="whitespace-pre-wrap break-all">{entry.text}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-800">
            <input
              type="text"
              value={manualCmd}
              onChange={(e) => setManualCmd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="MDI command (e.g. $$ or $X)..."
              disabled={!connected}
              className="flex-1 bg-slate-800 text-slate-300 text-xs rounded px-2.5 py-1.5 border border-slate-700 focus:border-blue-500 focus:outline-none disabled:opacity-30"
            />
            <button
              onClick={handleSend}
              disabled={!connected}
              className="flex items-center justify-center w-8 h-8 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded transition-colors"
            >
              <Send size={12} />
            </button>
            <button
              onClick={onClear}
              className="flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
