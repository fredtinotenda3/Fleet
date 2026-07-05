// infrastructure/websocket/server.ts

import { Server as HTTPServer } from 'http';
import { monitoring } from '@/infrastructure/monitoring/logger';

export interface WebSocketEvent {
  type: string;
  payload: unknown;
  timestamp: Date;
  tenantId: string;
  userId?: string;
}

// Lazy Socket.IO instance — only created when initialize() is called
let io: any | null = null;
const tenantClients = new Map<string, Set<string>>();
const userSockets = new Map<string, string[]>();

export class WebSocketManager {
  async initialize(server: HTTPServer): Promise<void> {
    if (io) return; // Already initialised

    try {
      const [{ Server: SocketServer }, { verifyToken }] = await Promise.all([
        import('socket.io'),
        import('@/infrastructure/security/token.service'),
      ]);

      io = new SocketServer(server, {
        cors: {
          origin: process.env.NEXTAUTH_URL,
          credentials: true,
        },
        path: '/api/socket',
        addTrailingSlash: false,
      });

      io.use(async (socket: any, next: any) => {
        try {
          const token = socket.handshake.auth.token;
          if (!token) return next(new Error('Authentication required'));

          const payload = await verifyToken(token);
          socket.data.userId = payload.userId;
          socket.data.tenantId = payload.tenantId;
          socket.data.roles = payload.roles;
          next();
        } catch {
          next(new Error('Invalid token'));
        }
      });

      io.on('connection', (socket: any) => {
        const { tenantId, userId } = socket.data;

        if (!tenantClients.has(tenantId)) {
          tenantClients.set(tenantId, new Set());
        }
        tenantClients.get(tenantId)!.add(socket.id);

        if (userId) {
          if (!userSockets.has(userId)) {
            userSockets.set(userId, []);
          }
          userSockets.get(userId)!.push(socket.id);
          socket.join(`user:${userId}`);
        }

        socket.join(`tenant:${tenantId}`);
        socket.emit('connected', { timestamp: new Date() });

        socket.on('subscribe', (events: string[]) => {
          events.forEach((e: string) => socket.join(`event:${e}`));
          socket.emit('subscribed', { events });
        });

        socket.on('disconnect', () => {
          tenantClients.get(tenantId)?.delete(socket.id);
          if (userId) {
            const sockets = userSockets.get(userId) || [];
            const idx = sockets.indexOf(socket.id);
            if (idx > -1) sockets.splice(idx, 1);
            if (sockets.length === 0) userSockets.delete(userId);
          }
        });
      });

      monitoring.logInfo('[WebSocket] Server initialized');
    } catch (err) {
      monitoring.logWarn(
        '[WebSocket] socket.io not available — skipping initialization'
      );
    }
  }

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    if (!io) return;
    io.to(`tenant:${tenantId}`).emit(event, {
      type: event,
      payload,
      timestamp: new Date(),
      tenantId,
    });
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!io) return;
    io.to(`user:${userId}`).emit(event, {
      type: event,
      payload,
      timestamp: new Date(),
    });
  }

  emitToAll(event: string, payload: unknown): void {
    if (!io) return;
    io.emit(event, { type: event, payload, timestamp: new Date() });
  }

  emitVehicleUpdated(tenantId: string, vehicle: unknown): void {
    this.emitToTenant(tenantId, 'vehicle:updated', vehicle);
  }

  emitExpenseCreated(tenantId: string, expense: unknown): void {
    this.emitToTenant(tenantId, 'expense:created', expense);
  }

  emitFuelLogged(tenantId: string, fuelLog: unknown): void {
    this.emitToTenant(tenantId, 'fuel:logged', fuelLog);
  }

  emitReminderOverdue(tenantId: string, reminder: unknown): void {
    this.emitToTenant(tenantId, 'maintenance:overdue', reminder);
  }

  emitTripCreated(tenantId: string, trip: unknown): void {
    this.emitToTenant(tenantId, 'trip:created', trip);
  }

  getConnectionCount(tenantId?: string): number {
    if (tenantId) return tenantClients.get(tenantId)?.size || 0;
    let total = 0;
    tenantClients.forEach((set) => { total += set.size; });
    return total;
  }
}

export const webSocketManager = new WebSocketManager();