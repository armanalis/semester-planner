import { randomInt } from 'node:crypto'
import { rateLimit } from './_lib/limit.js'
import { getRecord, json, putRecord, storageReady, type SyncRecord } from './_lib/store.js'

// No 0/O/1/I so codes are easy to read off a screen and type on a phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE = /^[A-HJ-NP-Z2-9]{8}$/
const MAX_BYTES = 3_000_000

const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

function codeFrom(request: Request) {
  const code = new URL(request.url).searchParams.get('code')?.toUpperCase() ?? ''
  return CODE.test(code) ? code : null
}

async function readBody(request: Request): Promise<SyncRecord | Response> {
  const text = await request.text()
  if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413)
  try {
    const body = JSON.parse(text) as Partial<SyncRecord>
    if (!body.data || typeof body.data !== 'object' || typeof body.updatedAt !== 'number')
      return json({ error: 'bad_request' }, 400)
    return { data: body.data, updatedAt: body.updatedAt }
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
}

/** Download the planner for a code. */
export async function GET(request: Request) {
  if (!storageReady()) return json({ error: 'storage_missing' }, 503)
  const code = codeFrom(request)
  if (!code) return json({ error: 'invalid_code' }, 400)
  const limited = await rateLimit(request, 'sync')
  if (limited) return limited
  const record = await getRecord(code)
  return record ? json(record) : json({ error: 'not_found' }, 404)
}

/** Create a new code holding this planner. */
export async function POST(request: Request) {
  if (!storageReady()) return json({ error: 'storage_missing' }, 503)
  const limited = await rateLimit(request, 'create')
  if (limited) return limited
  const body = await readBody(request)
  if (body instanceof Response) return body
  for (let i = 0; i < 5; i++) {
    const code = newCode()
    if (await getRecord(code)) continue
    await putRecord(code, body)
    return json({ code, updatedAt: body.updatedAt })
  }
  return json({ error: 'try_again' }, 500)
}

/** Save a newer version. If the server already has something newer, send that back instead. */
export async function PUT(request: Request) {
  if (!storageReady()) return json({ error: 'storage_missing' }, 503)
  const code = codeFrom(request)
  if (!code) return json({ error: 'invalid_code' }, 400)
  const limited = await rateLimit(request, 'sync')
  if (limited) return limited
  const body = await readBody(request)
  if (body instanceof Response) return body
  const current = await getRecord(code)
  if (!current) return json({ error: 'not_found' }, 404)
  if (current.updatedAt > body.updatedAt) return json({ conflict: true, ...current })
  await putRecord(code, body)
  return json({ ok: true, updatedAt: body.updatedAt })
}
