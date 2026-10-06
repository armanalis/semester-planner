import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { json, redisAuth } from './store.js'

// Made once per server instance, so an IP that used up its limit is turned away from memory without asking Redis.
const redis = redisAuth && new Redis(redisAuth)
const limiters = redis && {
  // new codes are the only thing that makes storage grow, so they get a tight limit
  create: new Ratelimit({ redis, prefix: 'limit:create', limiter: Ratelimit.slidingWindow(10, '1 h') }),
  // a device saves ~1 s after an edit and checks every 30 s; this leaves room for several people on one Wi-Fi.
  // Fixed window: 2 Redis commands per request instead of 4, which matters for the free monthly quota.
  sync: new Ratelimit({ redis, prefix: 'limit:sync', limiter: Ratelimit.fixedWindow(120, '1 m') }),
}

/** Vercel sets these headers itself, so a client can't fake its IP to dodge the limit. */
const clientIp = (request: Request) =>
  request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

/** A 429 response if this IP made too many requests of this kind, otherwise null. Off without Redis (local folder storage). */
export async function rateLimit(request: Request, kind: keyof NonNullable<typeof limiters>) {
  if (!limiters) return null
  const { success, reset } = await limiters[kind].limit(clientIp(request))
  if (success) return null
  const seconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(seconds) })
}
