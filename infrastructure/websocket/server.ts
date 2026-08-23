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

/**
 * PHASE 0, F-7 -- ORG-UNIT ISOLATION ON THE REALTIME CHANNEL.
 *
 * THE LEAK THIS CLOSES
 * Every socket joined exactly one room, `tenant:${tenantId}`, and
 * telematicsService.ingestTelematicsData emitted `vehicle:location` for
 * EVERY ingested fix through emitToTenant(). So every user in a tenant
 * received live positions for every vehicle in that tenant, regardless
 * of org unit.
 *
 * That is data the REST path deliberately withholds: the live map is
 * org-unit scoped (live-map.service.ts, assertVehicleInScope), reports
 * apply orgUnitPredicate, exports are conformance-tested. A Bulawayo
 * branch user was denied Harare vehicles over HTTP and pushed them over
 * WebSocket, continuously, in real time. In aggregate this collection is
 * a movement history of identifiable employees -- see
 * telematics.tenancy-addendum.ts's own header on why it is the most
 * privacy-sensitive data in the product.
 *
 * THE MODEL -- membership decided ONCE at handshake, from server-side
 * authority, never from anything the client sends:
 *
 *   tenant:{t}              every authenticated member. Tenant-wide
 *                           events ONLY (billing, membership).
 *   tenant:{t}:allunits     callers with organization-wide visibility
 *                           (accessibleOrgUnitIds === null). One room
 *                           rather than "join every unit", so creating
 *                           an org unit does not require reconnecting
 *                           every admin socket.
 *   tenant:{t}:unit:{u}     one per accessible org unit for scoped
 *                           callers, from the SAME expanded closure
 *                           (assignments + descendants) the REST layer
 *                           uses.
 *
 * An entity event goes to `unit:{u}` PLUS `allunits` -- exactly the
 * population entitled to it.
 *
 * UNASSIGNED ENTITIES FAIL CLOSED. An event whose entity has no
 * orgUnitId reaches `allunits` only; it is NOT broadcast tenant-wide.
 * This matches assertVehicleInScope rather than the geofence
 * convention: a geofence with no owner is genuinely shared reference
 * data, but a vehicle with no org unit is MISSING INFORMATION, and the
 * REST reads for it already return nothing to a scoped caller.
 * Broadcasting it here would show a scoped user a vehicle their own map
 * cannot display -- a leak and an inconsistency at once. The fix is to
 * assign the vehicle, not to loosen the predicate.
 *
 * WHY NOT FILTER ON THE CLIENT: the event would still have been
 * delivered. Socket.IO payloads are visible in devtools and to anything
 * holding the token. Hiding a marker in React is presentation, not
 * authorization.
 */
function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

function allUnitsRoom(tenantId: string): string {
  return `tenant:${tenantId}:allunits`;
}

function orgUnitRoom(tenantId: string, orgUnitId: string): string {
  return `tenant:${tenantId}:unit:${orgUnitId}`;
}

/**
 * Client-initiated subscriptions, strictly allow-listed.
 *
 * The previous handler was:
 *
 *   socket.on('subscribe', (events: string[]) =>
 *     events.forEach((e) => socket.join(`event:${e}`)));
 *
 * i.e. a client could join ANY room whose name began `event:`, chosen
 * by the client, unvalidated and unauthorized. Nothing currently emits
 * to `event:` rooms so it was inert -- but it is an unvalidated
 * client-controlled room join inside the authenticated path, and the
 * next person to write `io.to('event:' + x)` turns it into a live
 * bypass of everything above.
 *
 * Kept rather than deleted because `socket.emit('subscribe', [...])` is
 * public client surface. It now accepts only names on this list, and
 * joining one NEVER widens what a socket receives -- these are topic
 * filters layered on top of room membership, which remains decided
 * entirely by the handshake.
 */
const SUBSCRIBABLE_TOPICS = new Set<string>([
  'vehicle:location',
  'vehicle:alert',
  'vehicle:geofence',
  'maintenance:overdue',
]);

const MAX_SUBSCRIPTIONS_PER_SOCKET = 32;

export class WebSocketManager {
  async initialize(server: HTTPServer): Promise<void> {
    if (io) return; // Already initialised

    try {
      const [{ Server: SocketServer }, { verifyToken }, { tenantContextService }] =
        await Promise.all([
          import('socket.io'),
          import('@/infrastructure/security/token.service'),
          import('@/modules/tenancy/services/tenant-context.service'),
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

          // A token that verifies but carries no tenant/user cannot be
          // scoped to anything, so it is refused rather than defaulted.
          // Same fail-closed stance as server/tenancy/tenant-scope.ts,
          // which raises instead of widening when scope is unresolvable.
          if (!payload.tenantId || !payload.userId) {
            return next(new Error('Invalid token'));
          }

          socket.data.userId = payload.userId;
          socket.data.tenantId = payload.tenantId;
          socket.data.roles = payload.roles ?? [];

          /**
           * PHASE 0, F-7: resolve the org-unit closure ONCE, here, from
           * server-side authority -- never from anything the client
           * sends.
           *
           * At handshake rather than per event for two reasons.
           * Correctness: the set is then fixed for the life of the
           * connection, so an event cannot be delivered against a
           * half-resolved context. Cost: resolveContext hits Mongo, and
           * doing it per emitted fix would add a query per vehicle per
           * poll to the hottest path in the system.
           *
           * Trade-off: a permission change mid-session is not picked up
           * until reconnect. That is bounded by the access token's own
           * TTL and matches the REST path, which reads scope per
           * request from a token of the same lifetime.
           */
          const context = await tenantContextService.resolveContext(
            payload.userId,
            payload.tenantId,
            payload.roles ?? [],
            false
          );
          socket.data.accessibleOrgUnitIds = context.accessibleOrgUnitIds;

          next();
        } catch (error) {
          // Includes a resolveContext failure. A socket whose scope
          // could not be established is REFUSED, never admitted with an
          // absent scope -- an admitted socket carrying
          // `accessibleOrgUnitIds === undefined` would read as org-wide
          // to any future consumer of that field.
          monitoring.logWarn('[WebSocket] Rejected connection', {
            reason: (error as Error).message,
          });
          next(new Error('Invalid token'));
        }
      });

      io.on('connection', (socket: any) => {
        const { tenantId, userId, accessibleOrgUnitIds } = socket.data;

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

        socket.join(tenantRoom(tenantId));

        // PHASE 0, F-7: org-unit room membership, from the resolved
        // closure only.
        if (accessibleOrgUnitIds === null) {
          socket.join(allUnitsRoom(tenantId));
        } else {
          for (const unitId of (accessibleOrgUnitIds as string[]) ?? []) {
            socket.join(orgUnitRoom(tenantId, unitId));
          }
          // An EMPTY array means "scoped, but to nothing": the socket
          // joins no unit room and receives no entity events. Fail
          // closed, matching TenantContext's own documented semantics.
        }

        socket.emit('connected', { timestamp: new Date() });

        socket.on('subscribe', (events: unknown) => {
          const requested = Array.isArray(events) ? events : [];
          const accepted: string[] = [];
          const rejected: string[] = [];

          for (const raw of requested.slice(0, MAX_SUBSCRIPTIONS_PER_SOCKET)) {
            const name = typeof raw === 'string' ? raw.trim() : '';
            if (SUBSCRIBABLE_TOPICS.has(name)) {
              socket.join(`event:${name}`);
              accepted.push(name);
            } else {
              rejected.push(String(raw).slice(0, 64));
            }
          }

          if (rejected.length > 0) {
            monitoring.logWarn('[WebSocket] Rejected non-allow-listed subscription', {
              tenantId,
              count: rejected.length,
            });
          }

          socket.emit('subscribed', { events: accepted, rejected });
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

  /**
   * TENANT-WIDE broadcast. Every member of the tenant receives this.
   *
   * PHASE 0, F-7: correct for events about the ORGANIZATION itself --
   * billing state, membership changes -- and WRONG for anything about
   * an entity that belongs to an org unit. Entity events must use
   * emitToOrgUnit. Kept as two separate methods rather than one method
   * with an optional argument precisely so that "which kind is this?"
   * has to be answered at every call site.
   */
  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    if (!io) return;
    io.to(tenantRoom(tenantId)).emit(event, {
      type: event,
      payload,
      timestamp: new Date(),
      tenantId,
    });
  }

  /**
   * ORG-UNIT SCOPED emit -- the F-7 replacement for entity events.
   *
   * Delivered to the owning unit's room plus the organization-wide
   * room. When `orgUnitId` is absent the event reaches org-wide
   * subscribers ONLY -- see this file's header for why unassigned fails
   * closed here rather than broadcasting.
   *
   * `orgUnitId` must come from the STORED entity (which inherits it
   * from its vehicle at write time), never from a client payload.
   */
  emitToOrgUnit(
    tenantId: string,
    orgUnitId: string | undefined | null,
    event: string,
    payload: unknown
  ): void {
    if (!io) return;

    const envelope = {
      type: event,
      payload,
      timestamp: new Date(),
      tenantId,
    };

    const rooms = orgUnitId
      ? [orgUnitRoom(tenantId, orgUnitId), allUnitsRoom(tenantId)]
      : [allUnitsRoom(tenantId)];

    io.to(rooms).emit(event, envelope);
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

  emitVehicleUpdated(tenantId: string, vehicle: unknown, orgUnitId?: string): void {
    this.emitToOrgUnit(tenantId, orgUnitId, 'vehicle:updated', vehicle);
  }

  emitExpenseCreated(tenantId: string, expense: unknown, orgUnitId?: string): void {
    this.emitToOrgUnit(tenantId, orgUnitId, 'expense:created', expense);
  }

  emitFuelLogged(tenantId: string, fuelLog: unknown, orgUnitId?: string): void {
    this.emitToOrgUnit(tenantId, orgUnitId, 'fuel:logged', fuelLog);
  }

  emitReminderOverdue(tenantId: string, reminder: unknown, orgUnitId?: string): void {
    this.emitToOrgUnit(tenantId, orgUnitId, 'maintenance:overdue', reminder);
  }

  emitTripCreated(tenantId: string, trip: unknown, orgUnitId?: string): void {
    this.emitToOrgUnit(tenantId, orgUnitId, 'trip:created', trip);
  }

  getConnectionCount(tenantId?: string): number {
    if (tenantId) return tenantClients.get(tenantId)?.size || 0;
    let total = 0;
    tenantClients.forEach((set) => { total += set.size; });
    return total;
  }
}

export const webSocketManager = new WebSocketManager();