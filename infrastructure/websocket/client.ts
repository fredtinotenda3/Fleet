// infrastructure/websocket/client.ts

type EventHandler = (data: unknown) => void;

export class WebSocketClient {
  private socket: any | null = null;
  private eventHandlers = new Map<string, Set<EventHandler>>();

  connect(token: string): void {
    if (this.socket?.connected) return;

    import('socket.io-client')
      .then(({ io }) => {
        this.socket = io({
          path: '/api/socket',
          auth: { token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1_000,
        });

        this.socket.on('connect', () => {
          console.log('[WebSocket] Connected');
        });

        this.socket.on('disconnect', () => {
          console.log('[WebSocket] Disconnected');
        });

        this.socket.onAny((event: string, data: unknown) => {
          const handlers = this.eventHandlers.get(event);
          if (handlers) {
            handlers.forEach((handler) => handler(data));
          }
        });
      })
      .catch(() => {
        console.warn(
          '[WebSocket] socket.io-client not available — real-time updates disabled'
        );
      });
  }

  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  subscribe(events: string[]): void {
    this.socket?.emit('subscribe', events);
  }

  unsubscribe(events: string[]): void {
    this.socket?.emit('unsubscribe', events);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.eventHandlers.clear();
  }
}

export const webSocketClient = new WebSocketClient();