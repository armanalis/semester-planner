import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** One synced planner: the data plus when it last changed (client clock, ms). */
export interface SyncRecord {
  data: Record<string, unknown>
  updatedAt: number
}

// Upstash Redis (Vercel Marketplace) when its env vars exist; a local folder otherwise (dev server).
const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
const useRedis = Boolean(redisUrl && redisToken)
export const redisAuth = useRedis ? { url: redisUrl!, token: redisToken! } : null
const localDir = path.join(process.cwd(), '.data', 'sync')

/** On Vercel there's no writable disk, so sync needs Redis there. */
export const storageReady = () => useRedis || !process.env.VERCEL

async function redis(command: (string | number)[]) {
  const res = await fetch(redisUrl!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error(`storage responded ${res.status}`)
  return ((await res.json()) as { result: unknown }).result
}

export async function getRecord(code: string): Promise<SyncRecord | null> {
  if (useRedis) {
    const value = await redis(['GET', `sync:${code}`])
    return typeof value === 'string' ? (JSON.parse(value) as SyncRecord) : null
  }
  try {
    return JSON.parse(await readFile(path.join(localDir, `${code}.json`), 'utf8')) as SyncRecord
  } catch {
    return null
  }
}

export async function putRecord(code: string, record: SyncRecord) {
  if (useRedis) {
    await redis(['SET', `sync:${code}`, JSON.stringify(record)])
    return
  }
  await mkdir(localDir, { recursive: true })
  await writeFile(path.join(localDir, `${code}.json`), JSON.stringify(record))
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
