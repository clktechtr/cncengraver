export type SerialCallbacks = {
  onReceive: (data: string) => void;
  onStatus: (status: string) => void;
  onError: (error: string) => void;
  onDisconnect: () => void;
};

export class SerialConnection {
  private port: any = null;
  private writer: any = null;
  private reader: any = null;
  private readableStreamClosed: Promise<void> | null = null;
  private writableStreamClosed: Promise<void> | null = null;
  private keepReading = false;
  private callbacks: SerialCallbacks;
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: SerialCallbacks) {
    this.callbacks = callbacks;
  }

  get isConnected(): boolean {
    return this.port !== null;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect(baudRate: number = 115200): Promise<string> {
    if (!SerialConnection.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser. Use Chrome or Edge.');
    }

    try {
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({ baudRate });
      const portName = this.port.getInfo?.()?.usbProductName || 'USB Serial';

      const textEncoder = new TextEncoderStream();
      this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable as any);
      this.writer = textEncoder.writable.getWriter();

      this.keepReading = true;
      this.readLoop();

      this.callbacks.onStatus(`connected:${portName}`);
      return portName;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        throw new Error('No serial port selected.');
      }
      throw error;
    }
  }

  startStatusPolling(intervalMs: number = 250) {
    this.stopStatusPolling();
    this.statusTimer = setInterval(() => {
      this.send('?').catch(() => {});
    }, intervalMs);
  }

  stopStatusPolling() {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }

  private async readLoop() {
    if (!this.port) return;
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = (this.port.readable as any).pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.keepReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.callbacks.onReceive(value);
      }
    } catch (error: any) {
      if (this.keepReading) this.callbacks.onError(error.message || 'Read error');
    }
  }

  async send(data: string): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    await this.writer.write(data);
  }

  async sendLine(line: string): Promise<void> {
    await this.send(line + '\n');
  }

  async sendRaw(data: string): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    await this.writer.write(data);
  }

  async disconnect() {
    this.stopStatusPolling();
    this.keepReading = false;
    if (this.writer) {
      await this.writer.releaseLock();
      this.writer = null;
    }
    if (this.reader) {
      await this.reader.cancel().catch(() => {});
      await this.readableStreamClosed?.catch(() => {});
      this.reader = null;
    }
    if (this.writableStreamClosed) {
      await this.writableStreamClosed.catch(() => {});
      this.writableStreamClosed = null;
    }
    if (this.port) {
      await this.port.close().catch(() => {});
      this.port = null;
    }
    this.callbacks.onDisconnect();
  }
}
