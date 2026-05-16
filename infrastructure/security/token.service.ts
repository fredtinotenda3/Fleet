// infrastructure/security/token.service.ts

import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions?: string[];
}

export interface VerifiedToken extends TokenPayload {
  iat: number;
  exp: number;
}

export class TokenService {
  private secret: string;
  private refreshSecret: string;

  constructor() {
    this.secret = process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production';
    this.refreshSecret = process.env.REFRESH_TOKEN_SECRET || 'default-refresh-secret-change-in-production';
  }

  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(
      {
        userId: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions || [],
      },
      this.secret,
      { expiresIn: '15m' }
    );
  }

  generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(
      {
        userId: payload.userId,
        tenantId: payload.tenantId,
      },
      this.refreshSecret,
      { expiresIn: '7d' }
    );
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, this.secret, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded as VerifiedToken);
        }
      });
    });
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string; tenantId: string }> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, this.refreshSecret, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded as { userId: string; tenantId: string });
        }
      });
    });
  }

  decodeToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.decode(token) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as { exp: number };
      if (!decoded || !decoded.exp) return true;
      return decoded.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }

  refreshAccessToken(refreshToken: string): Promise<string> {
    return this.verifyRefreshToken(refreshToken).then(({ userId, tenantId }) => {
      // You would typically fetch user data from database here
      // For now, we'll create a minimal payload
      const payload: TokenPayload = {
        userId,
        tenantId,
        email: '',
        roles: [],
      };
      return this.generateAccessToken(payload);
    });
  }
}

export const tokenService = new TokenService();

// Alias for backward compatibility
export const verifyToken = (token: string) => tokenService.verifyToken(token);