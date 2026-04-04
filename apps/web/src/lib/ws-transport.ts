import type { WsMethods, WsPushEvents, WsPush } from "@iara/contracts";

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000] as const;
const REQUEST_TIMEOUT_MS = 30_000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PushListener = (params: never) => void;

class WsTransport {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<string, PendingRequest>();
  private subscribers = new Map<string, Set<PushListener>>();
  private queue: string[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private wsUrl: string | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Resolve the WS URL and connect. Called lazily on first request.
   */
  async init(): Promise<void> {
    if (this.wsUrl) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.wsUrl = await this.resolveWsUrl();
      this.connect();
    })();

    return this.initPromise;
  }

  connect(): void {
    if (this.ws || !this.wsUrl) return;
    this.intentionalClose = false;

    const ws = new WebSocket(this.wsUrl);

    ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.flushQueue();
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    ws.addEventListener("message", (event) => {
      this.handleMessage(event.data as string);
    });

    ws.addEventListener("error", () => {
      console.warn("[ws-transport] WebSocket error");
    });

    this.ws = ws;
  }

  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error("Transport disconnected"));
    }
    this.pending.clear();
    this.queue.length = 0;
  }

  async request<M extends keyof WsMethods>(
    method: M,
    params: WsMethods[M]["params"],
    options?: { timeoutMs?: number },
  ): Promise<WsMethods[M]["result"]> {
    // Ensure connected before first request
    await this.init();

    const id = String(this.nextId++);
    const timeout = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

    const promise = new Promise<WsMethods[M]["result"]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request "${method as string}" timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
    });

    const message = JSON.stringify({ id, method, params });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.queue.push(message);
    }

    return promise;
  }

  subscribe<E extends keyof WsPushEvents>(
    event: E,
    listener: (params: WsPushEvents[E]) => void,
  ): () => void {
    // Ensure connected for push subscriptions
    void this.init();

    const key = event as string;
    let listeners = this.subscribers.get(key);
    if (!listeners) {
      listeners = new Set();
      this.subscribers.set(key, listeners);
    }
    const fn = listener as PushListener;
    listeners.add(fn);

    return () => {
      listeners!.delete(fn);
      if (listeners!.size === 0) {
        this.subscribers.delete(key);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private handleMessage(raw: string): void {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn("[ws-transport] Failed to parse message:", raw);
      return;
    }

    const msg = data as Record<string, unknown>;

    // Response (has "id" field)
    if (typeof msg.id === "string") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;

      this.pending.delete(msg.id);
      clearTimeout(pending.timer);

      const asError = msg as unknown as { error?: { code: string; message: string } };
      if (asError.error) {
        const err = new Error(asError.error.message);
        (err as any).code = asError.error.code;
        pending.reject(err);
      } else {
        pending.resolve((msg as { result: unknown }).result);
      }
      return;
    }

    // Push event (has "push" field)
    if (typeof msg.push === "string") {
      const push = msg as unknown as WsPush;
      const listeners = this.subscribers.get(push.push as string);
      if (listeners) {
        for (const fn of listeners) {
          try {
            (fn as (params: unknown) => void)(push.params);
          } catch (err) {
            console.warn("[ws-transport] Push listener error:", err);
          }
        }
      }
    }
  }

  private flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    for (const msg of this.queue) {
      this.ws.send(msg);
    }
    this.queue.length = 0;
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // Re-resolve WS URL on reconnect — server may have restarted on a new port
      this.resolveWsUrl()
        .then((url) => {
          this.wsUrl = url;
          this.connect();
        })
        .catch(() => this.connect());
    }, delay);
  }

  private async resolveWsUrl(): Promise<string> {
    const bridge = window.desktopBridge as
      | (Record<string, unknown> & { getWsUrl?: () => Promise<string> | string })
      | undefined;

    const bridgeUrl = bridge?.getWsUrl ? await bridge.getWsUrl() : undefined;
    return (
      (typeof bridgeUrl === "string" && bridgeUrl.length > 0 ? bridgeUrl : undefined) ??
      (import.meta.env.VITE_WS_URL as string | undefined) ??
      `ws://${location.host}`
    );
  }
}

export const transport = new WsTransport();
