import { useState, useEffect, useRef, useCallback } from 'react';
import type { MachineState } from '@/types';
import {
  Usb,
  Home,
  Unlock,
  Play,
  Pause,
  OctagonX,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Send,
  Plug,
} from 'lucide-react';

type Props = {
  machine: MachineState;
  onConnect: () => void;
  onDisconnect: () => void;
  onSend: (cmd: string) => void;
  onHome: () => void;
  onUnlock: () => void;
  onStartCarve: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
  onJog: (axis: 'x' | 'y' | 'z', dir: number, dist: number, feed: number) => void;
  serialSupported: boolean;
  gcodeReady: boolean;
};

const STEP_OPTIONS = [0.1, 1, 10, 50, 100];

export default function MachineControl({
  machine,
  onConnect,
  onDisconnect,
  onSend,
  onHome,
  onUnlock,
  onStartCarve,
  onPause,
  onResume,
  onAbort,
  onJog,
  serialSupported,
  gcodeReady,
}: Props) {
  const [manualCmd, setManualCmd] = useState('');
  const [jogDist, setJogDist] = useState(10);
  const [jogFeed, setJogFeed] = useState(500);
  const jogDistRef = useRef(jogDist);
  const jogFeedRef = useRef(jogFeed);
  jogDistRef.current = jogDist;
  jogFeedRef.current = jogFeed;
  const lastJogTimeRef = useRef(0);
  const JOG_COOLDOWN_MS = 150;

  const connected = machine.connected;
  const carving = machine.sending;
  const isHold = machine.status === 'hold';

  const statusColors: Record<string, string> = {
    idle: 'text-green-400',
    run: 'text-blue-400',
    hold: 'text-amber-400',
    alarm: 'text-red-400',
    door: 'text-amber-400',
    check: 'text-cyan-400',
    home: 'text-green-400',
    sleep: 'text-slate-500',
    disconnected: 'text-slate-500',
  };
  const statusColor = statusColors[machine.status] || 'text-slate-400';
  const statusDot = !connected ? 'bg-slate-600' : machine.status === 'alarm' ? 'bg-red-400' : machine.status === 'hold' ? 'bg-amber-400' : machine.status === 'run' || carving ? 'bg-blue-400' : 'bg-green-400';

  const safeJog = useCallback((axis: 'x' | 'y' | 'z', dir: number, dist: number, feed: number) => {
    const now = Date.now();
    if (now - lastJogTimeRef.current < JOG_COOLDOWN_MS) return;
    lastJogTimeRef.current = now;
    onJog(axis, dir, dist, feed);
  }, [onJog]);

  // Keyboard jogging
  useEffect(() => {
    if (!connected || carving) return;
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const d = jogDistRef.current;
      const f = jogFeedRef.current;
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); safeJog('y', 1, d, f); break;
        case 'ArrowDown': e.preventDefault(); safeJog('y', -1, d, f); break;
        case 'ArrowLeft': e.preventDefault(); safeJog('x', -1, d, f); break;
        case 'ArrowRight': e.preventDefault(); safeJog('x', 1, d, f); break;
        case 'PageUp': e.preventDefault(); safeJog('z', 1, d, f); break;
        case 'PageDown': e.preventDefault(); safeJog('z', -1, d, f); break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [connected, carving, safeJog]);

  function handleManualSend() {
    if (manualCmd.trim()) {
      onSend(manualCmd.trim());
      setManualCmd('');
    }
  }

  // Disconnected state: only show connect button
  if (!connected) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <Plug size={28} className="text-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400 font-medium">No Machine Connected</p>
              <p className="text-xs text-slate-600 mt-1">Connect via Web Serial API</p>
            </div>
          </div>
          <button
            onClick={onConnect}
            disabled={!serialSupported}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Usb size={16} />
            {serialSupported ? 'Connect to CNC' : 'Serial Not Supported'}
          </button>
          {!serialSupported && (
            <p className="text-[11px] text-slate-600 text-center leading-relaxed">
              Web Serial requires Chrome or Edge desktop.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Connected state: full control panel
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Connection header */}
      <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusDot} ${machine.status !== 'alarm' ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-mono uppercase ${statusColor}`}>{machine.status}</span>
        </div>
        <button
          onClick={onDisconnect}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
        >
          <Usb size={12} />
          Disconnect
        </button>
      </div>

      {/* DRO coordinates */}
      <div className="px-4 py-3 border-b border-slate-700/50">
        <div className="grid grid-cols-3 gap-2">
          <DRO axis="X" value={machine.position.x} />
          <DRO axis="Y" value={machine.position.y} />
          <DRO axis="Z" value={machine.position.z} />
        </div>
      </div>

      {/* Primary action: START CARVE / PAUSE+ESTOP */}
      <div className="px-4 py-3 border-b border-slate-700/50">
        {!carving && !isHold ? (
          <button
            onClick={onStartCarve}
            disabled={!gcodeReady}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-500 hover:bg-green-400 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-lg tracking-wide transition-colors shadow-lg shadow-green-500/20 disabled:shadow-none"
          >
            <Play size={18} fill="currentColor" />
            START CARVE
          </button>
        ) : (
          <div className="flex gap-2">
            {isHold ? (
              <button
                onClick={onResume}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-400 text-white text-sm font-bold rounded-lg transition-colors"
              >
                <Play size={16} fill="currentColor" />
                RESUME
              </button>
            ) : (
              <button
                onClick={onPause}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-amber-500/20"
              >
                <Pause size={16} fill="currentColor" />
                PAUSE
              </button>
            )}
            <button
              onClick={onAbort}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-red-500/20"
            >
              <OctagonX size={18} />
              E-STOP
            </button>
          </div>
        )}
        {carving && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Carving progress</span>
              <span className="font-mono text-slate-300">{machine.linesSent}/{machine.linesTotal}</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-200"
                style={{ width: `${machine.linesTotal > 0 ? (machine.linesSent / machine.linesTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Jog controls - disabled during carve */}
      <div className={`px-4 py-3 border-b border-slate-700/50 transition-opacity ${carving ? 'opacity-30 pointer-events-none' : ''}`}>
        <div className="text-xs text-slate-400 mb-2.5 flex items-center justify-between">
          <span>Jog Control</span>
          <span className="text-[10px] text-slate-600">Arrow keys / PgUp / PgDn</span>
        </div>

        {/* Step chips */}
        <div className="grid grid-cols-5 gap-1 mb-3">
          {STEP_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setJogDist(s)}
              className={`py-1.5 text-[11px] font-medium rounded transition-colors ${
                jogDist === s
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {s < 1 ? s : s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="text-[11px] text-slate-500 w-10">Feed</label>
          <input
            type="number"
            value={jogFeed}
            onChange={(e) => setJogFeed(parseFloat(e.target.value) || 100)}
            className="flex-1 bg-slate-800 text-slate-300 text-xs rounded px-2 py-1 border border-slate-700 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-[10px] text-slate-600">mm/min</span>
        </div>

        {/* D-Pad layout: XY pad on left, Z column on right */}
        <div className="flex gap-3 justify-center">
          {/* XY D-Pad */}
          <div className="grid grid-cols-3 gap-1">
            <div />
            <DpadBtn onClick={() => safeJog('y', 1, jogDist, jogFeed)} disabled={carving}>
              <ArrowUp size={18} />
            </DpadBtn>
            <div />
            <DpadBtn onClick={() => safeJog('x', -1, jogDist, jogFeed)} disabled={carving}>
              <ArrowLeft size={18} />
            </DpadBtn>
            <div className="flex items-center justify-center text-[10px] text-slate-700 font-mono">XY</div>
            <DpadBtn onClick={() => safeJog('x', 1, jogDist, jogFeed)} disabled={carving}>
              <ArrowRight size={18} />
            </DpadBtn>
            <div />
            <DpadBtn onClick={() => safeJog('y', -1, jogDist, jogFeed)} disabled={carving}>
              <ArrowDown size={18} />
            </DpadBtn>
            <div />
          </div>

          {/* Z column */}
          <div className="flex flex-col gap-1 justify-center">
            <DpadBtn onClick={() => safeJog('z', 1, jogDist, jogFeed)} disabled={carving} accent="blue">
              <ChevronUp size={18} />
            </DpadBtn>
            <div className="flex items-center justify-center text-[10px] text-slate-700 font-mono h-9">Z</div>
            <DpadBtn onClick={() => safeJog('z', -1, jogDist, jogFeed)} disabled={carving} accent="blue">
              <ChevronDown size={18} />
            </DpadBtn>
          </div>
        </div>
      </div>

      {/* Home / Unlock - disabled during carve */}
      <div className={`px-4 py-3 border-b border-slate-700/50 flex gap-2 transition-opacity ${carving ? 'opacity-30 pointer-events-none' : ''}`}>
        <button
          onClick={onHome}
          disabled={carving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors"
        >
          <Home size={14} />
          Home
        </button>
        <button
          onClick={onUnlock}
          disabled={carving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors"
        >
          <Unlock size={14} />
          Unlock
        </button>
      </div>

      {/* MDI input - disabled during carve */}
      <div className={`px-4 py-3 transition-opacity ${carving ? 'opacity-30 pointer-events-none' : ''}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualCmd}
            onChange={(e) => setManualCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSend()}
            placeholder="MDI: send command..."
            disabled={carving}
            className="flex-1 bg-slate-800 text-slate-300 text-xs rounded px-2.5 py-2 border border-slate-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleManualSend}
            disabled={carving}
            className="flex items-center justify-center w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DRO({ axis, value }: { axis: string; value: number }) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-2 text-center border border-slate-700/40">
      <div className="text-[10px] text-slate-500 mb-0.5 font-mono">{axis}</div>
      <div className="text-sm font-mono text-slate-100 tabular-nums">{value.toFixed(2)}</div>
    </div>
  );
}

function DpadBtn({
  children,
  onClick,
  disabled,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  accent?: 'blue';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
        accent === 'blue'
          ? 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 disabled:opacity-30'
          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30'
      }`}
    >
      {children}
    </button>
  );
}
