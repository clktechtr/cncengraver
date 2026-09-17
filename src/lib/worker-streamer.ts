// Vite handles worker instantiation via new URL() syntax. The import is only
// used to get the worker constructor; the actual file is loaded at runtime.

import type { SerialConnection } from './serial';

type StreamerCallbacks = {
  onProgress: (sent: number, total: number) => void;
  onComplete: () => void;
  onError: (msg: string) => void;
  onStopped: () => void;
};

export class WorkerStreamer {
  private worker: Worker;
  private connection: SerialConnection;
  private callbacks: StreamerCallbacks;
  private loaded = false;

  constructor(connection: SerialConnection, callbacks: StreamerCallbacks) {
    this.connection = connection;
    this.callbacks = callbacks;
    this.worker = new Worker(new URL('./gcode-streamer.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      switch (msg.type) {
        case 'send_line':
          this.connection.sendLine(msg.line).catch((err: Error) => {
            this.worker.postMessage({ type: 'stop' });
            this.callbacks.onError(err.message || 'Serial write failed');
          });
          break;
        case 'progress':
          this.callbacks.onProgress(msg.sent, msg.total);
          break;
        case 'complete':
          this.callbacks.onComplete();
          break;
        case 'stream_error':
          this.callbacks.onError(msg.message);
          break;
        case 'stopped':
          this.callbacks.onStopped();
          break;
      }
    };
  }

  load(lines: string[]) {
    this.worker.postMessage({ type: 'load', lines });
    this.loaded = true;
  }

  start() {
    this.connection.stopStatusPolling();
    this.worker.postMessage({ type: 'start' });
  }

  stop() {
    this.worker.postMessage({ type: 'stop' });
  }

  handleAck() {
    this.worker.postMessage({ type: 'ack' });
  }

  handleError() {
    this.worker.postMessage({ type: 'error' });
  }

  get totalLines(): number {
    return 0;
  }

  terminate() {
    this.worker.terminate();
  }
}
