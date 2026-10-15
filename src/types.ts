export type ToolType = 'select' | 'rect' | 'circle' | 'line' | 'text' | 'path' | 'dimension';

export type Point = { x: number; y: number };

export type ShapeBase = {
  id: string;
  type: ToolType;
  selected: boolean;
};

export type RectShape = ShapeBase & {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CircleShape = ShapeBase & {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
};

export type LineShape = ShapeBase & {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TextShape = ShapeBase & {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  font: string;
};

export type PathShape = ShapeBase & {
  type: 'path';
  points: Point[];
};

export type DimensionShape = ShapeBase & {
  type: 'dimension';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  targetId?: string;
  anchorStart?: Point;
  anchorEnd?: Point;
};

export type Shape = RectShape | CircleShape | LineShape | TextShape | PathShape | DimensionShape;

export type CutType = 'profile' | 'pocket' | 'drill' | 'vcarve';

export type CamSettings = {
  cutType: CutType;
  bitDiameter: number;
  cutDepth: number;
  passDepth: number;
  feedRate: number;
  plungeRate: number;
  safeHeight: number;
  spindleSpeed: number;
  units: 'mm' | 'inch';
  vBitAngle: number;
  vBitWidth: number;
};

export type GCodeLine = {
  line: string;
  command: 'G0' | 'G1' | 'G2' | 'G3' | 'M3' | 'M5' | 'M30' | 'G21' | 'G90' | 'G17' | 'G94' | 'OTHER';
  x?: number;
  y?: number;
  z?: number;
  f?: number;
  s?: number;
};

export type MachineState = {
  connected: boolean;
  portName: string | null;
  status: 'idle' | 'run' | 'hold' | 'alarm' | 'door' | 'check' | 'home' | 'sleep' | 'disconnected';
  position: { x: number; y: number; z: number };
  workOffset: { x: number; y: number; z: number };
  sending: boolean;
  linesSent: number;
  linesTotal: number;
};

export type ConsoleEntry = {
  id: string;
  timestamp: number;
  direction: 'tx' | 'rx' | 'info' | 'error';
  text: string;
};

export type Workspace = {
  width: number;
  height: number;
  unit: 'mm' | 'inch';
};

export type TemplateCategory = {
  name: string;
  icon: string;
  shapes: Shape[];
};
