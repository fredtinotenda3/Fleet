// infrastructure/websocket/server.ts

import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyToken } from '@/infrastructure/security/token.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp: Date;
  tenantId: string;
  userId?: string;
}

export class WebSocketManager {
  private io: SocketServer | null = null;
  private clients: Map<string, Set<string>> = new Map(); // tenantId -> socketIds
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds

  initialize(server: HTTPServer) {
    this.io = new SocketServer(server, {
      cors: {
        origin: process.env.NEXTAUTH_URL,
        credentials: true,
      },
      path: '/api/socket',
      addTrailingSlash: false,
    });

    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }
        
        const payload = await verifyToken(token);
        socket.data.userId = payload.userId;
        socket.data.tenantId = payload.tenantId;
        socket.data.roles = payload.roles;
        
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
      this.setupEventHandlers(socket);
    });

    console.log('[WebSocket] Server initialized');
  }

  private handleConnection(socket: Socket) {
    const { tenantId, userId } = socket.data;
    
    // Track connection
    if (!this.clients.has(tenantId)) {
      this.clients.set(tenantId, new Set());
    }
    this.clients.get(tenantId)!.add(socket.id);
    
    if (userId) {
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, []);
      }
      this.userSockets.get(userId)!.push(socket.id);
    }
    
    // Join tenant room
    socket.join(`tenant:${tenantId}`);
    
    // Join user room
    if (userId) {
      socket.join(`user:${userId}`);
    }
    
    console.log(`[WebSocket] Client connected: ${socket.id} (tenant: ${tenantId}, user: ${userId})`);
    
    // Send initial connection confirmation
    socket.emit('connected', { timestamp: new Date() });
  }

  private setupEventHandlers(socket: Socket) {
    socket.on('subscribe', (events: string[]) => {
      events.forEach(event => {
        socket.join(`event:${event}`);
      });
      socket.emit('subscribed', { events });
    });

    socket.on('unsubscribe', (events: string[]) => {
      events.forEach(event => {
        socket.leave(`event:${event}`);
      });
      socket.emit('unsubscribed', { events });
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  private handleDisconnect(socket: Socket) {
    const { tenantId, userId } = socket.data;
    
    if (tenantId && this.clients.has(tenantId)) {
      this.clients.get(tenantId)!.delete(socket.id);
    }
    
    if (userId && this.userSockets.has(userId)) {
      const sockets = this.userSockets.get(userId)!;
      const index = sockets.indexOf(socket.id);
      if (index > -1) sockets.splice(index, 1);
      if (sockets.length === 0) this.userSockets.delete(userId);
    }
    
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  }

  // Event emission methods
  emitToTenant(tenantId: string, event: string, payload: any) {
    if (!this.io) return;
    this.io.to(`tenant:${tenantId}`).emit(event, {
      type: event,
      payload,
      timestamp: new Date(),
      tenantId,
    });
  }

  emitToUser(userId: string, event: string, payload: any) {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, {
      type: event,
      payload,
      timestamp: new Date(),
    });
  }

  emitToAll(event: string, payload: any) {
    if (!this.io) return;
    this.io.emit(event, {
      type: event,
      payload,
      timestamp: new Date(),
    });
  }

  emitVehicleUpdated(tenantId: string, vehicle: any) {
    this.emitToTenant(tenantId, 'vehicle:updated', vehicle);
  }

  emitExpenseCreated(tenantId: string, expense: any) {
    this.emitToTenant(tenantId, 'expense:created', expense);
  }

  emitFuelLogged(tenantId: string, fuelLog: any) {
    this.emitToTenant(tenantId, 'fuel:logged', fuelLog);
  }

  emitReminderOverdue(tenantId: string, reminder: any) {
    this.emitToTenant(tenantId, 'maintenance:overdue', reminder);
  }

  emitTripCreated(tenantId: string, trip: any) {
    this.emitToTenant(tenantId, 'trip:created', trip);
  }

  emitNotification(tenantId: string, userId: string, notification: any) {
    this.emitToUser(userId, 'notification:new', notification);
    this.emitToTenant(tenantId, 'notification:tenant', notification);
  }

  getConnectionCount(tenantId?: string): number {
    if (tenantId) {
      return this.clients.get(tenantId)?.size || 0;
    }
    let total = 0;
    this.clients.forEach(set => { total += set.size; });
    return total;
  }
}

export const webSocketManager = new WebSocketManager();