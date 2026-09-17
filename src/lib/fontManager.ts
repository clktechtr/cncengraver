import * as opentype from 'opentype.js';
import type { Point } from '@/types';

export type FontDef = {
  id: string;
  name: string;
  source: 'system' | 'custom';
  fontFamily?: string;
  data?: ArrayBuffer;
  parsed?: opentype.Font;
};

const BUILTIN_FONT_IDS = [
  'cnc-stroke',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
];

const BUILTIN_FONTS: FontDef[] = [
  { id: 'cnc-stroke', name: 'CNC Stroke (built-in)', source: 'system' },
  { id: 'sans-serif', name: 'Sans Serif', source: 'system', fontFamily: 'sans-serif' },
  { id: 'serif', name: 'Serif', source: 'system', fontFamily: 'serif' },
  { id: 'monospace', name: 'Monospace', source: 'system', fontFamily: 'monospace' },
  { id: 'cursive', name: 'Cursive', source: 'system', fontFamily: 'cursive' },
  { id: 'fantasy', name: 'Fantasy', source: 'system', fontFamily: 'fantasy' },
];

let customFonts: FontDef[] = [];

const fontCache = new Map<string, opentype.Font>();

export function getBuiltinFonts(): FontDef[] {
  return BUILTIN_FONTS;
}

export function getCustomFonts(): FontDef[] {
  return customFonts;
}

export function getAllFonts(): FontDef[] {
  return [...BUILTIN_FONTS, ...customFonts];
}

export function getFontById(id: string): FontDef | undefined {
  return getAllFonts().find((f) => f.id === id);
}

export function isCustomFont(fontId: string): boolean {
  return customFonts.some((f) => f.id === fontId);
}

export function isCncStrokeFont(fontId: string): boolean {
  return fontId === 'cnc-stroke';
}

export function isSystemFont(fontId: string): boolean {
  return BUILTIN_FONTS.some((f) => f.id === fontId && f.id !== 'cnc-stroke');
}

let systemFontCanvas: HTMLCanvasElement | null = null;

function getSystemFontCanvas(): HTMLCanvasElement {
  if (!systemFontCanvas) {
    systemFontCanvas = document.createElement('canvas');
    systemFontCanvas.width = 2000;
    systemFontCanvas.height = 500;
  }
  return systemFontCanvas;
}

export function systemFontToPathPoints(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontId: string,
): Point[][] {
  const fontDef = getFontById(fontId);
  const fontFamily = fontDef?.fontFamily || 'sans-serif';
  const canvas = getSystemFontCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const pxSize = fontSize * 4;
  ctx.font = `${pxSize}px ${fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(pxSize * 1.4);

  if (textWidth <= 0 || textHeight <= 0) return [];

  const offCanvas = document.createElement('canvas');
  offCanvas.width = textWidth + 4;
  offCanvas.height = textHeight + 4;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return [];

  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
  offCtx.fillStyle = '#fff';
  offCtx.font = `${pxSize}px ${fontFamily}`;
  offCtx.textBaseline = 'alphabetic';
  offCtx.textAlign = 'left';
  offCtx.fillText(text, 2, pxSize + 2);

  const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
  const data = imageData.data;
  const w = offCanvas.width;
  const h = offCanvas.height;

  const visited = new Uint8Array(w * h);
  const contours: Point[][] = [];

  function isWhite(px: number, py: number): boolean {
    if (px < 0 || px >= w || py < 0 || py >= h) return false;
    return data[(py * w + px) * 4] > 128;
  }

  function isBorderPixel(px: number, py: number): boolean {
    if (!isWhite(px, py)) return false;
    return !isWhite(px - 1, py) || !isWhite(px + 1, py) ||
           !isWhite(px, py - 1) || !isWhite(px, py + 1);
  }

  function traceContour(startX: number, startY: number): Point[] {
    const contour: Point[] = [];
    let cx = startX, cy = startY;
    let dir = 0;
    const maxSteps = w * h;

    for (let step = 0; step < maxSteps; step++) {
      visited[cy * w + cx] = 1;
      contour.push({ x: cx, y: cy });

      const dirs = [
        [1, 0], [0, 1], [-1, 0], [0, -1],
        [1, 1], [-1, 1], [-1, -1], [1, -1],
      ];

      let found = false;
      for (let i = 0; i < 8; i++) {
        const checkDir = (dir + i) % 8;
        const nx = cx + dirs[checkDir][0];
        const ny = cy + dirs[checkDir][1];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && isBorderPixel(nx, ny) && !visited[ny * w + nx]) {
          cx = nx;
          cy = ny;
          dir = (checkDir + 6) % 8;
          found = true;
          break;
        }
      }

      if (!found) break;
      if (cx === startX && cy === startY) break;
    }

    return contour;
  }

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (isBorderPixel(px, py) && !visited[py * w + px]) {
        const contour = traceContour(px, py);
        if (contour.length >= 3) contours.push(contour);
      }
    }
  }

  const scale = fontSize / pxSize;
  const offsetX = x;
  const offsetY = y;

  return contours.map((contour) =>
    contour.map((p) => ({
      x: offsetX + (p.x - 2) * scale,
      y: offsetY + (p.y - 2 - pxSize) * scale,
    }))
  );
}

export async function loadCustomFont(file: File): Promise<FontDef> {
  const buffer = await file.arrayBuffer();
  const parsed = opentype.parse(buffer);
  const id = `custom-${Date.now()}`;
  const name = parsed.names.fontFamily?.en || file.name.replace(/\.(ttf|otf)$/i, '') || 'Custom Font';
  const fontDef: FontDef = {
    id,
    name,
    source: 'custom',
    data: buffer,
    parsed,
  };
  customFonts = [...customFonts, fontDef];
  fontCache.set(id, parsed);
  return fontDef;
}

function getParsedFont(fontId: string): opentype.Font | null {
  if (fontCache.has(fontId)) return fontCache.get(fontId)!;
  const fontDef = getFontById(fontId);
  if (fontDef?.data) {
    try {
      const parsed = opentype.parse(fontDef.data);
      fontCache.set(fontId, parsed);
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export function fontToPathPoints(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontId: string,
): Point[][] {
  const parsed = getParsedFont(fontId);
  if (!parsed) return [];

  const paths: Point[][] = [];
  const font = parsed;
  const scale = fontSize / font.unitsPerEm;
  let offsetX = x;
  const baselineY = y;

  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    if (glyph.unicode !== undefined || ch === ' ') {
      const glyphPath = glyph.getPath(offsetX / scale, baselineY / scale, fontSize);
      const commands = glyphPath.commands;

      let currentPath: Point[] = [];
      for (const cmd of commands) {
        if (cmd.type === 'M') {
          if (currentPath.length >= 2) paths.push(currentPath);
          currentPath = [{ x: cmd.x, y: cmd.y }];
        } else if (cmd.type === 'L') {
          currentPath.push({ x: cmd.x, y: cmd.y });
        } else if (cmd.type === 'Q') {
          const steps = 8;
          const lastPt = currentPath[currentPath.length - 1] || { x: cmd.x1, y: cmd.y1 };
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const px = mt * mt * lastPt.x + 2 * mt * t * cmd.x1 + t * t * cmd.x;
            const py = mt * mt * lastPt.y + 2 * mt * t * cmd.y1 + t * t * cmd.y;
            currentPath.push({ x: px, y: py });
          }
        } else if (cmd.type === 'C') {
          const steps = 12;
          const lastPt = currentPath[currentPath.length - 1] || { x: cmd.x1, y: cmd.y1 };
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const px = mt * mt * mt * lastPt.x + 3 * mt * mt * t * cmd.x1 + 3 * mt * t * t * cmd.x2 + t * t * t * cmd.x;
            const py = mt * mt * mt * lastPt.y + 3 * mt * mt * t * cmd.y1 + 3 * mt * t * t * cmd.y2 + t * t * t * cmd.y;
            currentPath.push({ x: px, y: py });
          }
        } else if (cmd.type === 'Z') {
          if (currentPath.length >= 2) paths.push(currentPath);
          currentPath = [];
        }
      }
      if (currentPath.length >= 2) paths.push(currentPath);
    }
    offsetX += (glyph.advanceWidth ?? 0) * scale;
  }

  return paths;
}
