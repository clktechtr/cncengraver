import type { Shape, Point, PathShape, RectShape, CircleShape, LineShape } from '@/types';
import { genId } from '@/lib/geometry';

export function parseSvg(svgText: string, targetWidth: number): Shape[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return [];

  const viewBox = svg.getAttribute('viewBox');
  let vbX = 0, vbY = 0, vbW = 0, vbH = 0;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(parseFloat);
    if (parts.length >= 4) { [vbX, vbY, vbW, vbH] = parts; }
  } else {
    vbW = parseFloat(svg.getAttribute('width') || '100') || 100;
    vbH = parseFloat(svg.getAttribute('height') || '100') || 100;
  }

  const scale = vbW > 0 ? targetWidth / vbW : 1;
  const shapes: Shape[] = [];

  function transformX(x: number): number { return (x - vbX) * scale; }
  function transformY(y: number): number { return (y - vbY) * scale; }

  svg.querySelectorAll('rect').forEach((el) => {
    const x = parseFloat(el.getAttribute('x') || '0');
    const y = parseFloat(el.getAttribute('y') || '0');
    const w = parseFloat(el.getAttribute('width') || '0');
    const h = parseFloat(el.getAttribute('height') || '0');
    if (w > 0 && h > 0) {
      shapes.push({
        id: genId(), type: 'rect', selected: false,
        x: transformX(x), y: transformY(y),
        width: w * scale, height: h * scale,
      } as RectShape);
    }
  });

  svg.querySelectorAll('circle').forEach((el) => {
    const cx = parseFloat(el.getAttribute('cx') || '0');
    const cy = parseFloat(el.getAttribute('cy') || '0');
    const r = parseFloat(el.getAttribute('r') || '0');
    if (r > 0) {
      shapes.push({
        id: genId(), type: 'circle', selected: false,
        cx: transformX(cx), cy: transformY(cy), radius: r * scale,
      } as CircleShape);
    }
  });

  svg.querySelectorAll('line').forEach((el) => {
    const x1 = parseFloat(el.getAttribute('x1') || '0');
    const y1 = parseFloat(el.getAttribute('y1') || '0');
    const x2 = parseFloat(el.getAttribute('x2') || '0');
    const y2 = parseFloat(el.getAttribute('y2') || '0');
    shapes.push({
      id: genId(), type: 'line', selected: false,
      x1: transformX(x1), y1: transformY(y1),
      x2: transformX(x2), y2: transformY(y2),
    } as LineShape);
  });

  svg.querySelectorAll('path').forEach((el) => {
    const d = el.getAttribute('d') || '';
    const pts = parsePathData(d, transformX, transformY);
    if (pts.length >= 2) {
      shapes.push({
        id: genId(), type: 'path', selected: false, points: pts,
      } as PathShape);
    }
  });

  svg.querySelectorAll('polyline, polygon').forEach((el) => {
    const pointsAttr = el.getAttribute('points') || '';
    const pts: Point[] = [];
    const matches = pointsAttr.match(/[-+]?[\d.]+(?:e[-+]?\d+)?/gi);
    if (matches) {
      for (let i = 0; i + 1 < matches.length; i += 2) {
        pts.push({ x: transformX(parseFloat(matches[i])), y: transformY(parseFloat(matches[i + 1])) });
      }
    }
    if (el.tagName.toLowerCase() === 'polygon' && pts.length > 0) {
      pts.push({ ...pts[0] });
    }
    if (pts.length >= 2) {
      shapes.push({ id: genId(), type: 'path', selected: false, points: pts } as PathShape);
    }
  });

  return shapes;
}

function parsePathData(d: string, tx: (n: number) => number, ty: (n: number) => number): Point[] {
  const pts: Point[] = [];
  let cx = 0, cy = 0;
  let startPt: Point = { x: 0, y: 0 };

  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?[\d.]+(?:e[-+]?\d+)?/gi);
  if (!tokens) return pts;

  let i = 0;
  let cmd = '';

  function nextNum(): number {
    return parseFloat(tokens![i++]);
  }

  while (i < tokens!.length) {
    const t = tokens![i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(t)) {
      cmd = t;
      i++;
    }

    switch (cmd.toUpperCase()) {
      case 'M': {
        const x = nextNum(), y = nextNum();
        if (cmd === 'm') { cx += x; cy += y; } else { cx = x; cy = y; }
        startPt = { x: cx, y: cy };
        pts.push({ x: tx(cx), y: ty(cy) });
        cmd = cmd === 'M' ? 'L' : 'l';
        break;
      }
      case 'L': {
        const x = nextNum(), y = nextNum();
        if (cmd === 'l') { cx += x; cy += y; } else { cx = x; cy = y; }
        pts.push({ x: tx(cx), y: ty(cy) });
        break;
      }
      case 'H': {
        const x = nextNum();
        if (cmd === 'h') cx += x; else cx = x;
        pts.push({ x: tx(cx), y: ty(cy) });
        break;
      }
      case 'V': {
        const y = nextNum();
        if (cmd === 'v') cy += y; else cy = y;
        pts.push({ x: tx(cx), y: ty(cy) });
        break;
      }
      case 'Z': {
        pts.push({ x: tx(startPt.x), y: ty(startPt.y) });
        cx = startPt.x;
        cy = startPt.y;
        break;
      }
      case 'C': {
        const x1 = nextNum(), y1 = nextNum(), x2 = nextNum(), y2 = nextNum(), x = nextNum(), y = nextNum();
        if (cmd === 'c') { cx += x; cy += y; } else { cx = x; cy = y; }
        pts.push({ x: tx(cx), y: ty(cy) });
        break;
      }
      case 'Q': {
        nextNum(); nextNum();
        const x = nextNum(), y = nextNum();
        if (cmd === 'q') { cx += x; cy += y; } else { cx = x; cy = y; }
        pts.push({ x: tx(cx), y: ty(cy) });
        break;
      }
      case 'A': {
        nextNum(); nextNum(); nextNum();
        nextNum(); nextNum();
        const x = nextNum(), y = nextNum();
        if (cmd === 'a') { cx += x; cy += y; } else { cx = x; cy = y; }
        pts.push({ x: tx(cx), y: ty(cy) });
        break;
      }
      default:
        i++;
    }
  }

  return pts;
}
