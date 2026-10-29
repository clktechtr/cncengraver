import { useState, useRef, useCallback } from 'react';
import type { Shape, ToolType, CamSettings, GCodeLine, MachineState, ConsoleEntry, Workspace } from '@/types';
import { generateGCode, parseGCode, estimateTime } from '@/lib/gcode';
import { SerialConnection } from '@/lib/serial';
import { WorkerStreamer } from '@/lib/worker-streamer';
import { genId, shapeBounds } from '@/lib/geometry';
import { parseSvg } from '@/lib/svgImport';
import { loadCustomFont } from '@/lib/fontManager';
import Toolbar from '@/components/Toolbar';
import DesignCanvas from '@/components/DesignCanvas';
import CamPanel from '@/components/CamPanel';
import GCodeViewer from '@/components/GCodeViewer';
import SimulationView from '@/components/SimulationView';
import MachineControl from '@/components/MachineControl';
import ConsoleDrawer from '@/components/ConsoleDrawer';
import { Cpu, Code2, Box, PanelRight } from 'lucide-react';

type Tab = 'design' | 'gcode' | 'simulation';

const DEFAULT_CAM: CamSettings = {
  cutType: 'profile',
  bitDiameter: 3.175,
  cutDepth: 3,
  passDepth: 1,
  feedRate: 800,
  plungeRate: 200,
  safeHeight: 5,
  spindleSpeed: 1000,
  units: 'mm',
  vBitAngle: 60,
  vBitWidth: 0.5,
};

const DEFAULT_MACHINE: MachineState = {
  connected: false,
  portName: null,
  status: 'disconnected',
  position: { x: 0, y: 0, z: 0 },
  workOffset: { x: 0, y: 0, z: 0 },
  sending: false,
  linesSent: 0,
  linesTotal: 0,
};

function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<ToolType>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>({ width: 200, height: 200, unit: 'mm' });
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(10);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [camSettings, setCamSettings] = useState<CamSettings>(DEFAULT_CAM);
  const [gcodeLines, setGcodeLines] = useState<string[]>([]);
  const [parsedGcode, setParsedGcode] = useState<GCodeLine[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('design');
  const [machine, setMachine] = useState<MachineState>(DEFAULT_MACHINE);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const serialRef = useRef<SerialConnection | null>(null);
  const streamerRef = useRef<WorkerStreamer | null>(null);
  const rxBufferRef = useRef('');

  const serialSupported = SerialConnection.isSupported();
  const carving = machine.sending;
  const gcodeReady = gcodeLines.length > 0;

  const addConsoleEntry = useCallback((direction: ConsoleEntry['direction'], text: string) => {
    setConsoleEntries((prev) => [...prev.slice(-200), {
      id: genId(),
      timestamp: Date.now(),
      direction,
      text,
    }]);
  }, []);

  const handleSerialReceive = useCallback((data: string) => {
    if (!data) return;
    rxBufferRef.current += data;
    const lines = rxBufferRef.current.split('\n');
    rxBufferRef.current = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      addConsoleEntry('rx', trimmed);

      if (trimmed === 'ok') {
        streamerRef.current?.handleAck();
      } else if (trimmed.startsWith('error')) {
        streamerRef.current?.handleError();
        setMachine((m) => ({ ...m, status: 'alarm', sending: false }));
      } else if (trimmed.startsWith('<')) {
        parseStatusReport(trimmed);
      }
    }
  }, [addConsoleEntry]);

  function parseStatusReport(report: string) {
    const match = report.match(/<(\w+)/);
    if (match) {
      const status = match[1].toLowerCase();
      setMachine((m) => ({ ...m, status: status as MachineState['status'] }));
    }

    const posMatch = report.match(/MPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
    if (posMatch) {
      setMachine((m) => ({
        ...m,
        position: {
          x: parseFloat(posMatch[1]),
          y: parseFloat(posMatch[2]),
          z: parseFloat(posMatch[3]),
        },
      }));
    }

    const wposMatch = report.match(/WPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
    if (wposMatch) {
      setMachine((m) => ({
        ...m,
        position: {
          x: parseFloat(wposMatch[1]),
          y: parseFloat(wposMatch[2]),
          z: parseFloat(wposMatch[3]),
        },
      }));
    }
  }

  const handleSerialStatus = useCallback((status: string) => {
    if (status.startsWith('connected:')) {
      const portName = status.substring('connected:'.length);
      setMachine((m) => ({ ...m, connected: true, portName, status: 'idle' }));
      addConsoleEntry('info', `Connected to ${portName}`);
    }
  }, [addConsoleEntry]);

  const handleSerialError = useCallback((error: string) => {
    addConsoleEntry('error', error);
  }, [addConsoleEntry]);

  const handleSerialDisconnect = useCallback(() => {
    setMachine(DEFAULT_MACHINE);
    addConsoleEntry('info', 'Disconnected');
  }, [addConsoleEntry]);

  const handleConnect = useCallback(async () => {
    const serial = new SerialConnection({
      onReceive: handleSerialReceive,
      onStatus: handleSerialStatus,
      onError: handleSerialError,
      onDisconnect: handleSerialDisconnect,
    });

    try {
      await serial.connect(115200);
      serialRef.current = serial;
      streamerRef.current = new WorkerStreamer(serial, {
        onProgress: (sent, total) => setMachine((m) => ({ ...m, linesSent: sent, linesTotal: total })),
        onComplete: () => {
          setMachine((m) => ({ ...m, sending: false, status: 'idle' }));
          addConsoleEntry('info', 'G-Code streaming complete');
        },
        onError: (msg) => addConsoleEntry('error', `Stream error: ${msg}`),
        onStopped: () => {
          setMachine((m) => ({ ...m, sending: false, status: 'idle' }));
        },
      });
      serial.startStatusPolling(250);
      addConsoleEntry('info', 'Status polling started');
    } catch (e: any) {
      addConsoleEntry('error', e.message || 'Connection failed');
    }
  }, [handleSerialReceive, handleSerialStatus, handleSerialError, handleSerialDisconnect, addConsoleEntry]);

  const handleDisconnect = useCallback(async () => {
    if (streamerRef.current) streamerRef.current.stop();
    if (serialRef.current) await serialRef.current.disconnect();
    serialRef.current = null;
    streamerRef.current = null;
  }, []);

  const handleSendCommand = useCallback(async (cmd: string) => {
    if (!serialRef.current) return;
    addConsoleEntry('tx', cmd);
    await serialRef.current.sendLine(cmd);
  }, [addConsoleEntry]);

  const handleHome = useCallback(() => {
    handleSendCommand('$H');
  }, [handleSendCommand]);

  const handleUnlock = useCallback(() => {
    handleSendCommand('$X');
  }, [handleSendCommand]);

  const handleJog = useCallback((axis: 'x' | 'y' | 'z', dir: number, dist: number, feed: number) => {
    const cmd = `$J=G91 G21 ${axis.toUpperCase()}${(dir * dist).toFixed(2)} F${feed}`;
    handleSendCommand(cmd);
  }, [handleSendCommand]);

  const handleGenerateGCode = useCallback(() => {
    let outOfBounds = false;
    for (const s of shapes) {
      const b = shapeBounds(s);
      if (b.minX < 0 || b.minY < 0 || b.maxX > workspace.width || b.maxY > workspace.height) {
        outOfBounds = true;
        break;
      }
    }
    if (outOfBounds) {
      addConsoleEntry('error', 'Warning: some shapes extend beyond workspace bounds. G-Code generated but carving may hit machine limits.');
    }
    const lines = generateGCode(shapes, camSettings);
    setGcodeLines(lines);
    setParsedGcode(parseGCode(lines));
    setActiveTab('gcode');
  }, [shapes, camSettings, workspace, addConsoleEntry]);

  const handleStartCarve = useCallback(() => {
    if (!streamerRef.current || gcodeLines.length === 0) return;
    streamerRef.current.load(gcodeLines);
    streamerRef.current.start();
    const total = gcodeLines.filter((l) => l.trim() && !l.trim().startsWith(';')).length;
    setMachine((m) => ({ ...m, sending: true, linesSent: 0, linesTotal: total, status: 'run' }));
    addConsoleEntry('info', `Starting carve: ${total} lines`);
  }, [gcodeLines, addConsoleEntry]);

  const handlePause = useCallback(() => {
    if (!serialRef.current) return;
    serialRef.current.sendRaw('!');
    addConsoleEntry('tx', '!');
    setMachine((m) => ({ ...m, status: 'hold' }));
    addConsoleEntry('info', 'Feed hold (pause)');
  }, [addConsoleEntry]);

  const handleResume = useCallback(() => {
    if (!serialRef.current) return;
    serialRef.current.sendRaw('~');
    addConsoleEntry('tx', '~');
    setMachine((m) => ({ ...m, status: 'run' }));
    addConsoleEntry('info', 'Cycle resume');
  }, [addConsoleEntry]);

  const handleAbort = useCallback(() => {
    if (serialRef.current) serialRef.current.sendRaw('\x18');
    streamerRef.current?.stop();
    setMachine((m) => ({ ...m, sending: false, status: 'idle' }));
    addConsoleEntry('info', 'Emergency stop (Ctrl-X soft reset)');
  }, [addConsoleEntry]);

  const handleClearShapes = useCallback(() => {
    setShapes([]);
    setSelectedId(null);
  }, []);

  const handleAddTemplate = useCallback((templateShapes: Shape[]) => {
    setShapes((prev) => [...prev, ...templateShapes]);
    addConsoleEntry('info', `Added ${templateShapes.length} template shapes`);
  }, [addConsoleEntry]);

  const handleCopyGCode = useCallback(() => {
    navigator.clipboard.writeText(gcodeLines.join('\n'));
  }, [gcodeLines]);

  const handleImportSvg = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const imported = parseSvg(text, workspace.width);
      if (imported.length > 0) {
        setShapes((prev) => [...prev, ...imported]);
        addConsoleEntry('info', `Imported ${imported.length} shapes from SVG`);
      } else {
        addConsoleEntry('error', 'No shapes found in SVG file');
      }
    };
    reader.readAsText(file);
  }, [workspace.width, addConsoleEntry]);

  const handleUploadFont = useCallback(async (file: File) => {
    try {
      const font = await loadCustomFont(file);
      addConsoleEntry('info', `Loaded font: ${font.name}`);
      setShapes((prev) => prev.map((s) =>
        s.type === 'text' && (!(s as any).font || (s as any).font === 'cnc-stroke')
          ? { ...s, font: font.id } as Shape
          : s
      ));
    } catch (e: any) {
      addConsoleEntry('error', `Font load failed: ${e.message || e}`);
    }
  }, [addConsoleEntry]);

  const estTime = estimateTime(parsedGcode, camSettings.feedRate);

  return (
    <div className="h-screen flex flex-col bg-[#0a0e14] text-slate-200 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-lg">
            <Cpu size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100">WebCNC</h1>
            <p className="text-[10px] text-slate-500">CAD / CAM / Machine Control</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className={`w-2 h-2 rounded-full ${
              !machine.connected ? 'bg-slate-600'
                : machine.status === 'alarm' ? 'bg-red-400'
                : machine.status === 'hold' ? 'bg-amber-400'
                : carving ? 'bg-blue-400 animate-pulse'
                : 'bg-green-400 animate-pulse'
            }`} />
            <span>{machine.connected ? `Connected · ${machine.status}` : 'Not Connected'}</span>
          </div>
          {gcodeLines.length > 0 && (
            <div className="text-slate-500">
              Est. time: <span className="text-slate-300 font-mono">{Math.floor(estTime / 60)}m {Math.floor(estTime % 60)}s</span>
            </div>
          )}
          <button
            onClick={() => setRightCollapsed((c) => !c)}
            className="flex items-center justify-center w-8 h-8 text-slate-400 hover:bg-slate-800 rounded transition-colors"
          >
            <PanelRight size={16} />
          </button>
        </div>
      </header>

      <Toolbar
        tool={tool}
        setTool={setTool}
        workspace={workspace}
        setWorkspace={setWorkspace}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        gridSize={gridSize}
        setGridSize={setGridSize}
        snapToGrid={snapToGrid}
        setSnapToGrid={setSnapToGrid}
        showDimensions={showDimensions}
        setShowDimensions={setShowDimensions}
        onClearShapes={handleClearShapes}
        onImportSvg={handleImportSvg}
        onUploadFont={handleUploadFont}
        onAddTemplate={handleAddTemplate}
        shapeCount={shapes.length}
        disabled={carving}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900/50 border-b border-slate-700/50">
            <TabButton active={activeTab === 'design'} onClick={() => setActiveTab('design')} icon={<Cpu size={14} />} disabled={carving}>
              Design
            </TabButton>
            <TabButton active={activeTab === 'gcode'} onClick={() => setActiveTab('gcode')} icon={<Code2 size={14} />}>
              G-Code
              {gcodeLines.length > 0 && <span className="ml-1.5 text-[10px] text-slate-500">({gcodeLines.length})</span>}
            </TabButton>
            <TabButton active={activeTab === 'simulation'} onClick={() => setActiveTab('simulation')} icon={<Box size={14} />}>
              Simulation
            </TabButton>
          </div>

          <div className="flex-1 min-h-0">
            {activeTab === 'design' && (
              <DesignCanvas
                shapes={shapes}
                setShapes={setShapes}
                tool={tool}
                workspace={workspace}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                showGrid={showGrid}
                gridSize={gridSize}
                snapToGrid={snapToGrid}
                showDimensions={showDimensions}
              />
            )}
            {activeTab === 'gcode' && (
              <GCodeViewer lines={gcodeLines} parsed={parsedGcode} onCopy={handleCopyGCode} />
            )}
            {activeTab === 'simulation' && (
              <SimulationView
                parsed={parsedGcode}
                workspaceWidth={workspace.width}
                workspaceHeight={workspace.height}
                cutDepth={camSettings.cutDepth}
              />
            )}
          </div>

          {/* Console drawer at bottom of main area */}
          <ConsoleDrawer
            entries={consoleEntries}
            onClear={() => setConsoleEntries([])}
            onSend={handleSendCommand}
            connected={machine.connected}
            open={consoleOpen}
            onToggle={() => setConsoleOpen((o) => !o)}
          />
        </div>

        {!rightCollapsed && (
          <div className="w-80 bg-slate-900 border-l border-slate-700/50 flex flex-col overflow-hidden">
            <div className={`flex-1 overflow-auto border-b border-slate-700/50 transition-opacity ${carving ? 'opacity-40 pointer-events-none' : ''}`}>
              <CamPanel
                settings={camSettings}
                onChange={setCamSettings}
                onGenerate={handleGenerateGCode}
                shapeCount={shapes.length}
                disabled={carving}
              />
            </div>
            <div className="flex-shrink-0">
              <MachineControl
                machine={machine}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onSend={handleSendCommand}
                onHome={handleHome}
                onUnlock={handleUnlock}
                onStartCarve={handleStartCarve}
                onPause={handlePause}
                onResume={handleResume}
                onAbort={handleAbort}
                onJog={handleJog}
                serialSupported={serialSupported}
                gcodeReady={gcodeReady}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none ${
        active
          ? 'bg-slate-800 text-slate-200'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export default App;
