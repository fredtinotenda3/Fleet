// infrastructure/websocket/client.ts

import { io, Socket } from 'socket.io-client';

export class WebSocketClient {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();

  connect(token: string) {
    this.socket = io({
      path: '/api/socket',
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected');
    });

    this.socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected');
    });

    this.socket.onAny((event, data) => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.forEach(handler => handler(data));
      }
    });
  }

  on(event: string, handler: (data: any) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: (data: any) => void) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  subscribe(events: string[]) {
    this.socket?.emit('subscribe', events);
  }

  unsubscribe(events: string[]) {
    this.socket?.emit('unsubscribe', events);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.eventHandlers.clear();
  }
}

export const webSocketClient = new WebSocketClient();