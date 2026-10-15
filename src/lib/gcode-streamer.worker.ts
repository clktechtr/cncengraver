/// <reference lib="webworker" />

// Web Worker: G-Code stream processing with ping-pong flow control.
// The worker manages the 127-byte GRBL RX buffer budget and tracks line indices.
// It never touches the serial port directly — it sends "send_line" messages to the
// main thread, which performs the actual serial write. The main thread sends "ack"
// messages back when GRBL returns "ok".

const GRBL_RX_BUFFER_SIZE = 127;

type WorkerMessage =
  | { type: 'load'; lines: string[] }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'ack' }
  | { type: 'error' };

type WorkerOutMessage =
  | { type: 'send_line'; line: string; index: number; total: number }
  | { type: 'progress'; sent: number; total: number }
  | { type: 'complete' }
  | { type: 'stream_error'; message: string }
  | { type: 'stopped' };

let lines: string[] = [];
let sentIndex = 0;
let ackedIndex = 0;
let pendingChars = 0;
let sending = false;

function post(msg: WorkerOutMessage) {
  (self as any).postMessage(msg);
}

function pump() {
  if (!sending) return;

  while (
    sending &&
    sentIndex < lines.length &&
    pendingChars + (lines[sentIndex]?.length || 0) + 1 < GRBL_RX_BUFFER_SIZE
  ) {
    const line = lines[sentIndex];
    sentIndex++;
    pendingChars += line.length + 1;
    post({ type: 'send_line', line, index: sentIndex, total: lines.length });
    post({ type: 'progress', sent: sentIndex, total: lines.length });
  }

  if (sending && sentIndex >= lines.length && ackedIndex >= lines.length) {
    sending = false;
    post({ type: 'complete' });
  }
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'load':
      lines = msg.lines.filter((l) => l.trim() && !l.trim().startsWith(';'));
      sentIndex = 0;
      ackedIndex = 0;
      pendingChars = 0;
      break;

    case 'start':
      sending = true;
      sentIndex = 0;
      ackedIndex = 0;
      pendingChars = 0;
      pump();
      break;

    case 'stop':
      sending = false;
      post({ type: 'stopped' });
      break;

    case 'ack':
      if (ackedIndex < sentIndex) {
        const ackedLine = lines[ackedIndex];
        if (ackedLine) {
          pendingChars = Math.max(0, pendingChars - (ackedLine.length + 1));
        }
        ackedIndex++;
      }
      if (sending) pump();
      break;

    case 'error':
      sending = false;
      post({ type: 'stream_error', message: 'Hardware reported error' });
      break;
  }
};
