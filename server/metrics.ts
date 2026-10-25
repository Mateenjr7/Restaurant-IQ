import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  prefix: 'restaurantiq_',
  register: metricsRegistry,
});

const httpRequests = new Counter({
  name: 'restaurantiq_http_requests_total',
  help: 'Total HTTP requests handled by RestaurantIQ.',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

const httpRequestDuration = new Histogram({
  name: 'restaurantiq_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const standardHttpMethods = new Set([
  'CONNECT',
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
  'TRACE',
]);

export function normalizeHttpMethod(method: string): string {
  const normalizedMethod = method.toUpperCase();
  return standardHttpMethods.has(normalizedMethod) ? normalizedMethod : 'OTHER';
}

export const requestMetricsMiddleware: RequestHandler = (req, res, next) => {
  if (req.path === '/metrics') {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const routePath = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
    const labels = {
      method: normalizeHttpMethod(req.method),
      route: routePath,
      status: String(res.statusCode),
    };
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    httpRequests.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
  });
  next();
};

export function isMetricsAuthorizationValid(
  authorization: string | undefined,
  expectedToken: string | undefined
): boolean {
  if (!authorization || !expectedToken) {
    return false;
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) {
    return false;
  }

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
