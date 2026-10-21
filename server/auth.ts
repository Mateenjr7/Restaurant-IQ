/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export type UserRole = 'admin' | 'revenue_manager' | 'kitchen_ops' | 'auditor';

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  permissions: string[];
}

export interface TokenPayload {
  sub: string;
  role: UserRole;
  name: string;
  email: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Role Permissions Matrix
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'menu:read',
    'menu:write',
    'pricing:recommend',
    'pricing:approve',
    'pricing:apply',
    'pricing:override',
    'policy:read',
    'policy:write',
    'inventory:read',
    'inventory:write',
    'agents:execute',
    'audit:read',
    'imports:write',
  ],
  revenue_manager: [
    'menu:read',
    'menu:write',
    'pricing:recommend',
    'pricing:approve',
    'pricing:apply',
    'policy:read',
    'inventory:read',
    'agents:execute',
    'audit:read',
    'imports:write',
  ],
  kitchen_ops: [
    'menu:read',
    'inventory:read',
    'inventory:write',
    'audit:read',
  ],
  auditor: [
    'menu:read',
    'policy:read',
    'inventory:read',
    'audit:read',
  ],
};

// Seeded local demonstration accounts for testing and verification
export const DEMO_ACCOUNTS: Array<{
  id: string;
  username: string;
  passwordHash: string; // SHA-256 hash of password
  role: UserRole;
  name: string;
  email: string;
}> = [
  {
    id: 'usr-admin',
    username: 'admin',
    // 'admin123'
    passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
    role: 'admin',
    name: 'Executive Revenue Director',
    email: 'admin@restaurantiq.internal',
  },
  {
    id: 'usr-rev-mgr',
    username: 'rev_mgr',
    // 'rev123'
    passwordHash: '21191ec4d9e3b6eb4cf3c3a9f06e484fc66114eb3a3399479b4a44ccac133f96',
    role: 'revenue_manager',
    name: 'Culinary Revenue Manager',
    email: 'revenue@restaurantiq.internal',
  },
  {
    id: 'usr-kitchen',
    username: 'kitchen',
    // 'kitchen123'
    passwordHash: '1979aa746a67f08c37d4e5f0394c8e762b3ef775a2f5f9a65682496a751684c3',
    role: 'kitchen_ops',
    name: 'Executive Chef & Kitchen Ops',
    email: 'kitchen@restaurantiq.internal',
  },
  {
    id: 'usr-auditor',
    username: 'auditor',
    // 'audit123'
    passwordHash: '7a126d4187071f11417a86e09e13b28b7e23117562635bc407ef27509cf6e927',
    role: 'auditor',
    name: 'Governance & Compliance Auditor',
    email: 'auditor@restaurantiq.internal',
  },
];

// Initialize and validate Auth Secret
let authSecret: string = '';

export function initializeAuthSecret(): void {
  const envSecret = process.env.AUTH_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!envSecret || envSecret.trim().length < 32) {
      console.error(
        '[CRITICAL SECURITY FATAL] Production startup aborted: AUTH_SECRET must be set and contain at least 32 characters.'
      );
      process.exit(1);
    }
    authSecret = envSecret.trim();
  } else {
    if (envSecret && envSecret.trim().length >= 16) {
      authSecret = envSecret.trim();
    } else {
      // In dev/test mode, generate a secure random 256-bit secret for this runtime process
      authSecret = crypto.randomBytes(32).toString('hex');
    }
  }
}

// Cryptographic token generation & verification (HMAC-SHA256)
export function signToken(user: { id: string; role: UserRole; name: string; email: string }, expiresInSeconds: number = 86400): string {
  if (!authSecret) initializeAuthSecret();

  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', authSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  if (!authSecret) initializeAuthSecret();
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;

  // Constant-time signature verification to prevent timing attacks
  const expectedSig = crypto
    .createHmac('sha256', authSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (expectedSig.length !== signature.length) return null;
  const valid = crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature));
  if (!valid) return null;

  try {
    const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

// Authentication middleware
// Extracts and verifies Bearer token. Does NOT assign a default admin role or trust X-Operator-Role.
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    req.user = undefined;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      error: 'Invalid authorization header format. Expected "Bearer <token>".',
    });
  }

  const token = parts[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      error: 'Authentication failed: Token is invalid, expired, or signature verification failed.',
    });
  }

  req.user = {
    id: payload.sub,
    name: payload.name,
    role: payload.role,
    email: payload.email,
    permissions: ROLE_PERMISSIONS[payload.role] || [],
  };

  next();
}

// Authorization middleware requiring authentication and specific role
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized: Authentication required. Please provide a valid Bearer token.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Action requires one of [${allowedRoles.join(', ')}]. Current role: '${req.user.role}'`,
      });
    }

    next();
  };
}

// Rate limiting middleware for sensitive endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(windowMs: number = 60000, maxRequests: number = 60) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests: Rate limit exceeded. Please wait before retrying.',
        retryAfterMs: record.resetTime - now,
      });
    }

    next();
  };
}
