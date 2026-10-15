import { useRef, useEffect, useState } from 'react';
import type { GCodeLine } from '@/types';
import { extractSimSegments, type SimSegment } from '@/lib/gcode';
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react';

type Props = {
  parsed: GCodeLine[];
  workspaceWidth: number;
  workspaceHeight: number;
  cutDepth: number;
};

type View3D = {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
};

export default function SimulationView({
  parsed,
  workspaceWidth,
  workspaceHeight,
  cutDepth,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [segments, setSegments] = useState<SimSegment[]>([]);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<View3D>({ rotX: 0, rotY: 0, zoom: 1, panX: 0, panY: 0 });
  const [isRotating, setIsRotating] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    setSegments(extractSimSegments(parsed));
    setProgress(0);
  }, [parsed]);

  useEffect(() => {
    draw();
  });

  useEffect(() => {
    const handler = () => resize();
    handler();
    const frame = requestAnimationFrame(handler);
    window.addEventListener('resize', handler);
    const container = containerRef.current;
    const observer = container ? new ResizeObserver(handler) : null;
    if (container && observer) observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handler);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (playing) {
      let last = performance.now();
      const animate = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        setProgress((p) => {
          const next = p + dt * 30;
          if (next >= segments.length) {
            setPlaying(false);
            return segments.length;
          }
          return next;
        });
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
      return () => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };
    }
  }, [playing, segments.length]);

  function resize() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function project(x: number, y: number, z: number): { x: number; y: number; depth: number } {
    const cx = workspaceWidth / 2;
    const cy = workspaceHeight / 2;
    const rx = x - cx;
    const ry = y - cy;
    const rz = z;

    const cosY = Math.cos(view.rotY);
    const sinY = Math.sin(view.rotY);
    const cosX = Math.cos(view.rotX);
    const sinX = Math.sin(view.rotX);

    const x1 = rx * cosY + rz * sinY;
    const z1 = -rx * sinY + rz * cosY;
    const y1 = ry;

    const y2 = y1 * cosX - z1 * sinX;
    const z2 = y1 * sinX + z1 * cosX;
    const x2 = x1;

    const container = containerRef.current;
    const w = container?.clientWidth || canvasRef.current?.clientWidth || 400;
    const h = container?.clientHeight || canvasRef.current?.clientHeight || 300;
    const scale = Math.min(w / Math.max(workspaceWidth, 1), h / Math.max(workspaceHeight, 1)) * 0.78 * view.zoom;

    return {
      x: x2 * scale + w / 2 + view.panX,
      y: y2 * scale + h / 2 + view.panY,
      depth: z2,
    };
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    drawWorkspacePlane(ctx);
    drawAxes(ctx);

    const visibleCount = Math.floor(progress);
    if (segments.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Generate G-Code and press Play to simulate', w / 2, h / 2);
      return;
    }

    for (let i = 0; i < visibleCount && i < segments.length; i++) {
      const seg = segments[i];
      const from = project(seg.from.x, seg.from.y, seg.z);
      const to = project(seg.to.x, seg.to.y, seg.z);

      if (seg.rapid) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
      } else {
        const depthFactor = seg.z < 0 ? Math.min(1, Math.abs(seg.z) / Math.abs(cutDepth || 1)) : 0;
        const r = Math.floor(245 - depthFactor * 100);
        const g = Math.floor(158 - depthFactor * 50);
        const b = Math.floor(11 + depthFactor * 50);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (visibleCount > 0 && visibleCount <= segments.length) {
      const lastSeg = segments[visibleCount - 1];
      const tip = project(lastSeg.to.x, lastSeg.to.y, lastSeg.z);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawWorkspacePlane(ctx: CanvasRenderingContext2D) {
    const corners = [
      project(0, 0, 0),
      project(workspaceWidth, 0, 0),
      project(workspaceWidth, workspaceHeight, 0),
      project(0, workspaceHeight, 0),
    ];
    ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const gridStep = Math.max(10, Math.round(Math.max(workspaceWidth, workspaceHeight) / 10));
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= workspaceWidth; x += gridStep) {
      const p1 = project(x, 0, 0);
      const p2 = project(x, workspaceHeight, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let y = 0; y <= workspaceHeight; y += gridStep) {
      const p1 = project(0, y, 0);
      const p2 = project(workspaceWidth, y, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  function drawAxes(ctx: CanvasRenderingContext2D) {
    const origin = project(0, 0, 0);
    const xEnd = project(20, 0, 0);
    const yEnd = project(0, 20, 0);
    const zEnd = project(0, 0, 20);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(xEnd.x, xEnd.y);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.font = '11px monospace';
    ctx.fillText('X', xEnd.x + 4, xEnd.y);

    ctx.strokeStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(yEnd.x, yEnd.y);
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Y', yEnd.x + 4, yEnd.y);

    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(zEnd.x, zEnd.y);
    ctx.stroke();
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('Z', zEnd.x + 4, zEnd.y);
  }

  function handleMouseDown(e: React.MouseEvent) {
    const shouldPan = e.button === 1 || e.button === 2 || e.shiftKey;
    if (shouldPan) {
      e.preventDefault();
      setIsPanning(true);
    } else if (e.button === 0) {
      setIsRotating(true);
    }
    setLastMouse({ x: e.clientX, y: e.clientY });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isRotating && !isPanning) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    setView((v) => isPanning
      ? { ...v, panX: v.panX + dx, panY: v.panY + dy }
      : {
          ...v,
          rotY: v.rotY + dx * 0.01,
          rotX: Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, v.rotX + dy * 0.01)),
        });
    setLastMouse({ x: e.clientX, y: e.clientY });
  }

  function handleMouseUp() {
    setIsRotating(false);
    setIsPanning(false);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setView((v) => ({
      ...v,
      zoom: Math.max(0.2, Math.min(5, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))),
    }));
  }

  const pct = segments.length > 0 ? (progress / segments.length) * 100 : 0;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#0a0e14] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full cursor-grab"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={segments.length === 0}
          className="flex items-center justify-center w-9 h-9 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          onClick={() => {
            setProgress(0);
            setPlaying(false);
          }}
          disabled={segments.length === 0}
          className="flex items-center justify-center w-9 h-9 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-lg transition-colors"
        >
          <RotateCcw size={16} />
        </button>
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-mono text-slate-400 min-w-[60px] text-right">
          {Math.floor(progress)}/{segments.length}
        </span>
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button
          onClick={() => setView((v) => ({ ...v, zoom: Math.min(5, v.zoom * 1.2) }))}
          className="w-8 h-8 flex items-center justify-center bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-sm"
        >
          +
        </button>
        <button
          onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.2, v.zoom * 0.8) }))}
          className="w-8 h-8 flex items-center justify-center bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-sm"
        >
          −
        </button>
        <button
          onClick={() => setView({ rotX: 0, rotY: 0, zoom: 1, panX: 0, panY: 0 })}
          className="w-8 h-8 flex items-center justify-center bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-sm"
        >
          R
        </button>
      </div>
      <div className="absolute top-3 left-3 text-[10px] text-slate-500 bg-slate-900/80 px-2 py-1 rounded">
        Drag to rotate · Shift/middle/right drag to move · Scroll to zoom
      </div>
    </div>
  );
}
