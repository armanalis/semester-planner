import type { SlotKind } from '../types'

/**
 * Reads a weekly timetable screenshot in the browser, for free: no server, no API key.
 *  1. pixel analysis finds the colored class blocks (thin grid lines and text are filtered out)
 *  2. Tesseract OCR reads day names, the time axis and the course names
 *  3. block x → day column, block top/bottom → times via the time axis, text inside → course
 */

export interface ReadTimetableResult {
  courses: { name: string; short: string; color?: [number, number, number] }[]
  slots: { course: string; day: number; start: string; end: string; kind: SlotKind }[]
  note: string
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
interface Word extends Box {
  text: string
}
interface Block extends Box {
  color: [number, number, number]
}

type RGB = [number, number, number]

const cx = (b: Box) => (b.x0 + b.x1) / 2
const cy = (b: Box) => (b.y0 + b.y1) / 2
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export class TimetableReadError extends Error {}

/** Filled after each read, for troubleshooting from the console. */
export const lastRead: Record<string, unknown> = {}

// ---------- image → class blocks ----------

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new TimetableReadError('unreadable_image'))
    img.src = src
  })
}

/** The page background: the most common color, roughly. */
function backgroundColor(px: Uint8ClampedArray): RGB {
  const counts = new Map<number, number>()
  for (let i = 0; i < px.length; i += 16) {
    const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best = 0
  let bestN = -1
  for (const [k, n] of counts) if (n > bestN) [best, bestN] = [k, n]
  const sum = [0, 0, 0]
  let n = 0
  for (let i = 0; i < px.length; i += 16) {
    const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)
    if (key !== best) continue
    sum[0] += px[i]
    sum[1] += px[i + 1]
    sum[2] += px[i + 2]
    n++
  }
  return [sum[0] / n, sum[1] / n, sum[2] / n]
}

/** Box filter over a 0/1 mask using a summed-area table. Returns window sums. */
function windowSums(mask: Uint8Array, W: number, H: number, r: number) {
  const sat = new Uint32Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    let row = 0
    for (let x = 0; x < W; x++) {
      row += mask[y * W + x]
      sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row
    }
  }
  return (x: number, y: number) => {
    const x0 = Math.max(0, x - r)
    const y0 = Math.max(0, y - r)
    const x1 = Math.min(W, x + r + 1)
    const y1 = Math.min(H, y + r + 1)
    return {
      sum: sat[y1 * (W + 1) + x1] - sat[y0 * (W + 1) + x1] - sat[y1 * (W + 1) + x0] + sat[y0 * (W + 1) + x0],
      area: (x1 - x0) * (y1 - y0),
    }
  }
}

/** Morphological opening: removes thin lines and text strokes, keeps filled areas. */
function open(mask: Uint8Array, W: number, H: number, r: number) {
  const s1 = windowSums(mask, W, H, r)
  const eroded = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const { sum, area } = s1(x, y)
      eroded[y * W + x] = sum === area ? 1 : 0
    }
  const s2 = windowSums(eroded, W, H, r)
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = s2(x, y).sum > 0 ? 1 : 0
  return out
}

/**
 * Classes that touch each other end up in one component. Split it by fill color: every color
 * that covers a real share of the component becomes its own block(s). Text pixels match no fill.
 */
function splitByColor(pixels: number[], px: Uint8ClampedArray, W: number, H: number, bgColor: RGB): Block[] {
  const hist = new Map<number, [number, number, number, number]>()
  for (const p of pixels) {
    const i = p * 4
    const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)
    const c = hist.get(key) ?? [0, 0, 0, 0]
    c[0]++
    c[1] += px[i]
    c[2] += px[i + 1]
    c[3] += px[i + 2]
    hist.set(key, c)
  }
  const fills: RGB[] = []
  for (const [n, r, g, b] of [...hist.values()].sort((a, b) => b[0] - a[0])) {
    if (n < pixels.length * 0.03) break
    const c: RGB = [r / n, g / n, b / n]
    if (!fills.some((f) => dist(f, c) < 16)) fills.push(c)
  }
  if (!fills.length) return []

  // which fill does each pixel belong to (or none: text, edges)
  const own = new Map<number, number>()
  for (const p of pixels) {
    const i = p * 4
    const c: RGB = [px[i], px[i + 1], px[i + 2]]
    let k = -1
    let best = 18
    fills.forEach((f, j) => {
      const d = dist(f, c)
      if (d < best) [k, best] = [j, d]
    })
    if (k >= 0) own.set(p, k)
  }

  const out: Block[] = []
  const seen = new Set<number>()
  for (const [start, k] of own) {
    if (seen.has(start)) continue
    seen.add(start)
    const stack = [start]
    let x0 = W
    let y0 = H
    let x1 = 0
    let y1 = 0
    let area = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % W
      const y = (p - x) / W
      area++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      // 1px steps: a 1px divider line between two classes must keep them apart
      // (text doesn't cut a block in two: blocks have padding around their text)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = p + dy * W + dx
        if (x + dx < 0 || x + dx >= W || seen.has(q) || own.get(q) !== k) continue
        seen.add(q)
        stack.push(q)
      }
    }
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    if (!(bw > W * 0.025 && bh > H * 0.02 && area > W * H * 0.0008 && area / (bw * bh) > 0.4)) continue
    // points near the corners must still be inside the block (rules out round buttons)
    const ix = Math.max(3, bw * 0.08)
    const iy = Math.max(3, bh * 0.08)
    const bgLike = [
      [x0 + ix, y0 + iy],
      [x1 - ix, y0 + iy],
      [x0 + ix, y1 - iy],
      [x1 - ix, y1 - iy],
    ].filter(([x, y]) => {
      const i = (Math.round(y) * W + Math.round(x)) * 4
      const c: RGB = [px[i], px[i + 1], px[i + 2]]
      return dist(c, bgColor) + 10 < dist(c, fills[k])
    }).length
    if (bgLike >= 2) continue
    out.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, color: fills[k] })
  }
  return out
}

function findBlocks(px: Uint8ClampedArray, W: number, H: number, bg: RGB): { blocks: Block[]; mask: Uint8Array } {
  const fill = new Uint8Array(W * H)
  for (let i = 0, p = 0; p < W * H; p++, i += 4)
    if (Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])) >= 12) fill[p] = 1
  const mask = open(fill, W, H, Math.max(1, Math.round(W / 700)))

  // connected components of "not background"; each is one class or several touching classes
  const label = new Uint8Array(W * H)
  const blocks: Block[] = []
  const stack: number[] = []
  for (let start = 0; start < W * H; start++) {
    if (!mask[start] || label[start]) continue
    label[start] = 1
    stack.push(start)
    const pixels: number[] = []
    let x0 = W
    let y0 = H
    let x1 = 0
    let y1 = 0
    while (stack.length) {
      const p = stack.pop()!
      pixels.push(p)
      const x = p % W
      const y = (p - x) / W
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H || label[q] || !mask[q]) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue
        label[q] = 1
        stack.push(q)
      }
    }
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    const sized = bw > W * 0.025 && bh > H * 0.02 && pixels.length > W * H * 0.0012
    const notChrome = bw < W * 0.98 && bh < H * 0.9 // whole-screen panels (edge bars go later: left of the time axis)
    if (!sized || !notChrome) continue
    blocks.push(...splitByColor(pixels, px, W, H, bg))
  }
  return { blocks, mask }
}

/** Is the pixel at p part of a thin line: different from both neighbours `step` away? */
function thinAt(px: Uint8ClampedArray, p: number, step: number) {
  const i = p * 4
  const a = (p - step) * 4
  const b = (p + step) * 4
  const c: RGB = [px[i], px[i + 1], px[i + 2]]
  const l: RGB = [px[a], px[a + 1], px[a + 2]]
  const r: RGB = [px[b], px[b + 1], px[b + 2]]
  return dist(c, l) >= 10 && dist(c, r) >= 10
}

/** Runs of indices where `isLine` holds, at most 4 wide, as their centers. */
function centers(len: number, isLine: (t: number) => boolean) {
  const out: number[] = []
  let run: number[] = []
  for (let t = 0; t <= len; t++) {
    if (t < len && isLine(t)) run.push(t)
    else if (run.length) {
      if (run.length <= 4) out.push(run.reduce((s, v) => s + v, 0) / run.length)
      run = []
    }
  }
  return out
}

/** y positions of horizontal grid lines in the area right of the time axis. */
function gridLines(px: Uint8ClampedArray, mask: Uint8Array, W: number, H: number, xFrom: number) {
  return centers(H, (y) => {
    if (y < 3 || y >= H - 3) return false
    let free = 0
    let thin = 0
    for (let x = xFrom; x < W; x += 2) {
      const p = y * W + x
      if (mask[p]) continue
      free++
      if (thinAt(px, p, 3 * W)) thin++
    }
    return free > ((W - xFrom) / 2) * 0.3 && thin / free > 0.5
  })
}

/** x positions of vertical column separators inside the grid area. */
function columnLines(px: Uint8ClampedArray, mask: Uint8Array, W: number, y0: number, y1: number) {
  const span = y1 - y0
  return centers(W, (x) => {
    if (x < 3 || x >= W - 3) return false
    let free = 0
    let thin = 0
    for (let y = y0; y < y1; y += 2) {
      const p = y * W + x
      if (mask[p]) continue
      free++
      if (thinAt(px, p, 3)) thin++
    }
    // a day separator runs through most of the grid; gaps between side-by-side classes don't
    return free > (span / 2) * 0.5 && thin / free > 0.5
  })
}

// ---------- text → days and times ----------

const DAY_PATTERNS: RegExp[] = [
  /^(mon|monday|lun|lunedi|lundi|lunes|pzt|pazartesi|mo|montag)$/,
  /^(tue|tues|tuesday|mar|martedi|mardi|martes|sal|sali|di|dienstag)$/,
  /^(wed|wednesday|mer|mercoledi|mercredi|mie|miercoles|car|carsamba|mi|mittwoch)$/,
  /^(thu|thur|thurs|thursday|gio|giovedi|jeu|jeudi|jue|jueves|per|persembe|do|donnerstag)$/,
  /^(fri|friday|ven|venerdi|vendredi|vie|viernes|cum|cuma|fr|freitag)$/,
  /^(sat|saturday|sab|sabato|sam|samedi|cmt|cumartesi|sa|samstag)$/,
  /^(sun|sunday|dom|domenica|domingo|dim|dimanche|paz|pazar|so|sonntag)$/,
]

const simplify = (s: string) =>
  s
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const dayOf = (text: string) => {
  const s = simplify(text)
  return s ? DAY_PATTERNS.findIndex((re) => re.test(s)) : -1
}

const TIME_RE = /^(\d{1,2})(?:[:.h](\d{2}))?(am|pm)?$/

function timeOf(word: Word, words: Word[]): number | null {
  const m = TIME_RE.exec(word.text.toLowerCase().replace(/\s/g, ''))
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  let ampm = m[3]
  if (!ampm) {
    // "8:00 AM" is often two words
    const h0 = word.y1 - word.y0
    const after = words.find((w) => w !== word && Math.abs(cy(w) - cy(word)) < h0 * 0.6 && w.x0 > word.x1 && w.x0 - word.x1 < h0 * 1.5)
    const t = after && after.text.toLowerCase().replace(/[^apm]/g, '')
    if (t === 'am' || t === 'pm') ampm = t
  }
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Robust straight-line fit y = a·minutes + b through (minutes, y) points. */
function fitTimeAxis(points: { m: number; y: number }[]) {
  let best: { a: number; b: number; inliers: { m: number; y: number }[] } | null = null
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const p = points[i]
      const q = points[j]
      if (p.m === q.m) continue
      const a = (q.y - p.y) / (q.m - p.m)
      if (a <= 0) continue
      const b = p.y - a * p.m
      const tol = Math.max(4, a * 6)
      const inliers = points.filter((r) => Math.abs(a * r.m + b - r.y) <= tol)
      if (!best || inliers.length > best.inliers.length) best = { a, b, inliers }
    }
  if (!best || best.inliers.length < 2) return null
  // least squares on the inliers
  const n = best.inliers.length
  const sm = best.inliers.reduce((s, p) => s + p.m, 0)
  const sy = best.inliers.reduce((s, p) => s + p.y, 0)
  const smm = best.inliers.reduce((s, p) => s + p.m * p.m, 0)
  const smy = best.inliers.reduce((s, p) => s + p.m * p.y, 0)
  const a = (n * smy - sm * sy) / (n * smm - sm * sm)
  const b = (sy - a * sm) / n
  return a > 0 ? { a, b } : null
}

// ---------- course names ----------

const JUNK = /^([\d:.\-–—/]+|am|pm|[|•·,;]+)$/i

function nameIn(block: Box, words: Word[]) {
  const inside = words
    .filter((w) => cx(w) > block.x0 && cx(w) < block.x1 && cy(w) > block.y0 && cy(w) < block.y1)
    .sort((a, b) => (Math.abs(cy(a) - cy(b)) < (a.y1 - a.y0) * 0.5 ? a.x0 - b.x0 : cy(a) - cy(b)))
  return inside
    .map((w) => w.text.trim())
    .filter((t) => t.length > 0 && !JUNK.test(t) && !TIME_RE.test(t.toLowerCase()) && !/\d{1,2}[:.]\d{2}/.test(t))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\d]+|[^\p{L}\d)]+$/gu, '')
    .trim()
}

const normalize = (s: string) => simplify(s)

function bigrams(s: string) {
  const out = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1)
  return out
}
function similarity(a: string, b: string) {
  if (!a || !b) return 0
  const A = bigrams(a)
  const B = bigrams(b)
  let both = 0
  for (const [k, n] of A) both += Math.min(n, B.get(k) ?? 0)
  return (2 * both) / Math.max(1, a.length - 1 + b.length - 1)
}

export const shortFrom = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 3 || /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 5) || name.slice(0, 4).toUpperCase()

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// ---------- main ----------

export async function readTimetable(dataUrl: string, onProgress?: (fraction: number) => void): Promise<ReadTimetableResult> {
  for (const k of Object.keys(lastRead)) delete lastRead[k]
  onProgress?.(0.02)
  const img = await loadImage(dataUrl)
  const W = img.naturalWidth
  const H = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, W, H).data
  const bg = backgroundColor(px)
  const found = findBlocks(px, W, H, bg)
  const mask = found.mask
  let blocks = found.blocks
  Object.assign(lastRead, {
    bg: bg.map(Math.round),
    rawBlocks: found.blocks.map((b) => [b.x0, b.y0, b.x1, b.y1, b.color.map(Math.round).join(',')]),
    blocks: blocks.map((b) => [b.x0, b.y0, b.x1, b.y1]),
  })
  if (blocks.length === 0) throw new TimetableReadError('no_blocks')
  onProgress?.(0.1)

  // OCR source: black text on white. Each pixel is compared with the fill of the block it sits in
  // (or the page background), so colored blocks and grid lines don't confuse the text reader.
  const owner = new Int16Array(W * H).fill(-1)
  blocks.forEach((b, i) => {
    for (let y = b.y0; y < b.y1; y++) owner.fill(i, y * W + b.x0, y * W + b.x1)
  })
  const clean = ctx.createImageData(W, H)
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const ref = owner[p] >= 0 ? blocks[owner[p]].color : bg
    const d = dist([px[i], px[i + 1], px[i + 2]], ref)
    const v = d < 40 ? 255 : d > 110 ? 0 : 255 - ((d - 40) / 70) * 255
    clean.data[i] = clean.data[i + 1] = clean.data[i + 2] = v
    clean.data[i + 3] = 255
  }
  const flat = document.createElement('canvas')
  flat.width = W
  flat.height = H
  flat.getContext('2d')!.putImageData(clean, 0, 0)
  // and upscaled: small UI text reads much better at 2x or more (capped to keep OCR quick)
  const scale = Math.max(1, Math.min(3, Math.max(2, 2600 / W), Math.sqrt(9e6 / (W * H))))
  const big = document.createElement('canvas')
  big.width = Math.round(W * scale)
  big.height = Math.round(H * scale)
  const bctx = big.getContext('2d')!
  bctx.imageSmoothingQuality = 'high'
  bctx.drawImage(flat, 0, 0, big.width, big.height)

  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(0.15 + m.progress * 0.8)
    },
  })
  let words: Word[] = []
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    const { data } = await worker.recognize(big, {}, { blocks: true })
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const w of l.words)
            if (w.text.trim() && w.confidence > 25)
              words.push({
                text: w.text.trim(),
                x0: w.bbox.x0 / scale,
                y0: w.bbox.y0 / scale,
                x1: w.bbox.x1 / scale,
                y1: w.bbox.y1 / scale,
              })
  } finally {
    await worker.terminate()
  }
  words = words.filter((w) => w.x1 > w.x0 && w.y1 > w.y0)

  const notes: string[] = []

  // time axis first: the column of time labels (8:00, 10:00 AM, 14…) with the most consistent fit.
  // Only blocks to its right are classes (this ignores highlighted menu items, sidebars, etc.).
  const timed = words.map((w) => ({ w, m: timeOf(w, words) })).filter((l): l is { w: Word; m: number } => l.m !== null)
  const tol = W * 0.03
  const clusters: { w: Word; m: number }[][] = []
  for (const l of timed.sort((a, b) => a.w.x1 - b.w.x1)) {
    const c = clusters.find((cl) => Math.abs(cl[0].w.x1 - l.w.x1) < tol)
    if (c) c.push(l)
    else clusters.push([l])
  }
  let labels: { w: Word; m: number }[] = []
  let bestFit = 0
  for (const c of clusters) {
    if (new Set(c.map((l) => l.m)).size < 2) continue
    const fit = fitTimeAxis(c.map((l) => ({ m: l.m, y: cy(l.w) })))
    if (!fit) continue
    const inliers = c.filter((l) => Math.abs(fit.a * l.m + fit.b - cy(l.w)) <= Math.max(6, fit.a * 10)).length
    if (inliers > bestFit) [labels, bestFit] = [c, inliers]
  }
  if (!labels.length) throw new TimetableReadError('no_time_axis')
  const axisRight = Math.max(...labels.map((l) => l.w.x1))
  blocks = blocks.filter((b) => b.x0 >= axisRight - 2)
  if (blocks.length === 0) throw new TimetableReadError('no_blocks')
  const gridLeft = Math.min(...blocks.map((b) => b.x0))
  const gridTop = Math.min(...blocks.map((b) => b.y0))

  // snap each label to the grid line it belongs to
  const lines = gridLines(px, mask, W, H, gridLeft)
  const points = labels.map(({ w, m }) => {
    const h = w.y1 - w.y0
    const near = lines.filter((y) => Math.abs(y - cy(w)) <= h * 1.6).sort((a, b) => Math.abs(a - cy(w)) - Math.abs(b - cy(w)))[0]
    return { m, y: near ?? cy(w) }
  })
  // labels tied to a grid line are exact; use only those when there are enough of them
  const onLines = points.filter((pt, i) => pt.y !== cy(labels[i].w))
  const snapped = onLines.length
  const axis = fitTimeAxis(snapped >= 2 ? onLines : points)
  Object.assign(lastRead, { lines, labels: labels.map((l) => [l.w.text, l.m, Math.round(cy(l.w))]), points, axis })
  if (!axis) throw new TimetableReadError('no_time_axis')
  // Labels usually sit on or just below their grid line. If we couldn't find the lines, times come out
  // a little early: shift so class edges land on :00/:30, the way timetables are laid out.
  let shift = 0
  if (snapped < 2) {
    const edges = blocks.flatMap((bl) => [bl.y0, bl.y1]).map((y) => (y - axis.b) / axis.a)
    const misfit = (d: number) => edges.reduce((sum, m) => sum + Math.min(((m + d) % 30 + 30) % 30, 30 - (((m + d) % 30 + 30) % 30)), 0)
    let best = misfit(0)
    for (let d = 1; d <= 20; d++) if (misfit(d) < best - edges.length * 0.5) [shift, best] = [d, misfit(d)]
  }
  Object.assign(lastRead, { snapped, shift })
  const minutesAt = (y: number) => Math.round(((y - axis.b) / axis.a + shift) / 15) * 15
  const yAt = (m: number) => axis.a * (m - shift) + axis.b

  // Two classes stacked with no visible line between them look like one block, but each starts
  // with its own title. Split where a new title starts after a clear vertical gap (on the half hour).
  const visualLines = (b: Box) => {
    const inside = words.filter((w) => cx(w) > b.x0 && cx(w) < b.x1 && cy(w) > b.y0 && cy(w) < b.y1).sort((p, q) => cy(p) - cy(q))
    const rows: Box[] = []
    for (const w of inside) {
      const row = rows.find((r) => Math.abs(cy(r) - cy(w)) < (w.y1 - w.y0) * 0.5)
      if (row) Object.assign(row, { x0: Math.min(row.x0, w.x0), x1: Math.max(row.x1, w.x1), y0: Math.min(row.y0, w.y0), y1: Math.max(row.y1, w.y1) })
      else rows.push({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 })
    }
    return rows.sort((p, q) => p.y0 - q.y0)
  }
  // typical gap between a block's top edge and its first line of text
  const pads = blocks
    .map((b) => {
      const first = visualLines(b)[0]
      return first ? first.y0 - b.y0 : NaN
    })
    .filter((v) => v > 0)
    .sort((p, q) => p - q)
  const typicalPad = pads[Math.floor(pads.length / 2)] ?? 5
  blocks = blocks.flatMap((b) => {
    const rows = visualLines(b)
    ;((lastRead.rows ??= []) as unknown[]).push([Math.round(b.x0), Math.round(b.y0), Math.round(b.y1), rows.map((r) => [Math.round(r.y0), Math.round(r.y1)])])
    if (rows.length < 2) return [b]
    const lineH = [...rows.map((r) => r.y1 - r.y0)].sort((p, q) => p - q)[Math.floor(rows.length / 2)]
    const pad = Math.max(2, Math.min(lineH * 1.2, typicalPad))
    const cuts: number[] = []
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].y0 - rows[i - 1].y1 <= Math.max(lineH * 0.9, 6)) continue
      const m = Math.round(((rows[i].y0 - pad - axis.b) / axis.a + shift) / 30) * 30
      const y = yAt(m)
      // a real title sits one padding below a half-hour line; a wrapped line lands anywhere
      if (Math.abs(rows[i].y0 - pad - y) > Math.max(3, lineH * 0.35)) continue
      const prev = cuts.at(-1) ?? b.y0
      if (y - prev >= axis.a * 30 && b.y1 - y >= axis.a * 30) cuts.push(y)
    }
    if (!cuts.length) return [b]
    const edges = [b.y0, ...cuts, b.y1]
    return edges.slice(1).map((y1, i) => ({ ...b, y0: edges[i], y1 }))
  })

  // day columns: day names (Mon, Tue… in several languages, or single letters M T W…) are
  // evenly spaced, one per column. A view can start on any day (Sunday-first weeks, 3-day views).
  const gridBottom = Math.max(...blocks.map((b) => b.y1))
  const gridRight = Math.max(...blocks.map((b) => b.x1))
  const band = words.filter((w) => w.y1 <= gridTop + 4 && w.y0 >= gridTop - H * 0.3)
  Object.assign(lastRead, { band: band.map((w) => `${w.text}@${Math.round(cx(w))},${Math.round(cy(w))}`).join(' ') })
  let heads = band.map((w) => ({ x: cx(w), day: dayOf(w.text) })).filter((h) => h.day >= 0)
  if (heads.length < 2) {
    // single letters: line them up by position (a missed letter leaves a gap), then find the weekday
    // pattern and starting point that match best
    const letters = band.filter((w) => /^\p{L}$/u.test(w.text.trim())).sort((a, b) => cx(a) - cx(b))
    if (letters.length >= 3) {
      const gaps = letters.slice(1).map((w, i) => cx(w) - cx(letters[i]))
      const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      const units = gaps.map((g) => g / Math.max(1, Math.round(g / med))).sort((a, b) => a - b)
      const unit = units[Math.floor(units.length / 2)]
      const ks = letters.map((w) => Math.round((cx(w) - cx(letters[0])) / unit))
      const aligned = letters.every((w, i) => Math.abs(cx(w) - cx(letters[0]) - ks[i] * unit) < unit * 0.25) && new Set(ks).size === ks.length
      if (aligned && ks.at(-1)! < 7) {
        const chars = letters.map((w) => simplify(w.text)[0])
        // pattern letters → day (0 = Monday); Sunday-first patterns are rotated
        const patterns: { letters: string; sundayFirst: boolean }[] = [
          { letters: 'mtwtfss', sundayFirst: false }, // English
          { letters: 'lmmgvsd', sundayFirst: false }, // Italian
          { letters: 'pscpccp', sundayFirst: false }, // Turkish
          { letters: 'lmmjvsd', sundayFirst: false }, // French / Spanish
          { letters: 'mdmdfss', sundayFirst: false }, // German
          { letters: 'smtwtfs', sundayFirst: true }, // English, Sunday first
        ]
        let best = { score: 0, pattern: patterns[0], offset: 0 }
        for (const pattern of patterns)
          for (let offset = 0; offset < 7; offset++) {
            const score = chars.filter((c, i) => pattern.letters[(offset + ks[i]) % 7] === c).length
            if (score > best.score) best = { score, pattern, offset }
          }
        if (best.score >= Math.ceil(letters.length * 0.7))
          heads = letters.map((w, i) => {
            const idx = (best.offset + ks[i]) % 7
            return { x: cx(w), day: best.pattern.sundayFirst ? (idx + 6) % 7 : idx }
          })
      }
    }
  }
  heads.sort((a, b) => a.x - b.x)
  heads = heads.filter((h, i) => i === 0 || h.x - heads[i - 1].x > W * 0.02) // one per column

  const widest = Math.max(...blocks.map((b) => b.x1 - b.x0))
  const singleDay = widest > (gridRight - gridLeft) * 0.5
  let dayAt: (x: number) => number
  if (singleDay) {
    // a day view: everything happens on the day named above it (Monday if unreadable)
    const day = heads[0]?.day ?? 0
    if (!heads.length) notes.push('days_guessed')
    dayAt = () => day
  } else if (heads.length >= 2) {
    const steps = heads.slice(1).map((h, i) => h.x - heads[i].x)
    // one column wide: typical step between neighbouring names (a missing name makes a double step)
    const med = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)]
    const perColumn = steps.map((st) => st / Math.max(1, Math.round(st / med))).sort((a, b) => a - b)
    const spacing = perColumn[Math.floor(perColumn.length / 2)]
    const at = heads.map((h) => ({ ...h, k: Math.round((h.x - heads[0].x) / spacing) }))
    const dayOfColumn = (k: number) => {
      const near = at.reduce((a, b) => (Math.abs(b.k - k) < Math.abs(a.k - k) ? b : a))
      return (((near.day + (k - near.k)) % 7) + 7) % 7
    }
    // where does a column start relative to its day name? most classes start at a column's left edge
    const bins = new Map<number, number>()
    for (const b of blocks) {
      const rel = Math.round(((((b.x0 - heads[0].x) % spacing) + spacing) % spacing) / 4)
      bins.set(rel, (bins.get(rel) ?? 0) + 1)
    }
    const rel = [...bins.entries()].sort((a, b) => b[1] - a[1])[0][0] * 4
    const start0 = heads[0].x - ((spacing - rel) % spacing) // a column's left edge is never right of its name
    dayAt = (x) => dayOfColumn(Math.floor((x - start0 + 2) / spacing))
    Object.assign(lastRead, { spacing, rel, start0, days: at })
  } else {
    // no readable day names: use the vertical lines between days, Monday onwards
    const seps = columnLines(px, mask, W, gridTop, gridBottom).filter((x) => x >= gridLeft - W * 0.02)
    const bounds = [...seps]
    if (!bounds.length || bounds[0] > gridLeft + 2) bounds.unshift(gridLeft - 1)
    if (bounds.at(-1)! < gridRight - 2) bounds.push(W)
    const widths = bounds.slice(1).map((x, i) => x - bounds[i])
    const typical = [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)] ?? W
    const cols = bounds.slice(1).map((r, i) => ({ l: bounds[i], r })).filter((c) => c.r - c.l > typical * 0.5)
    dayAt = (x) => Math.max(0, Math.min(6, cols.findIndex((c) => x >= c.l && x < c.r)))
    notes.push('days_guessed')
    Object.assign(lastRead, { seps })
  }

  // blocks → slots, grouped into courses by name, then by (nearly identical) color
  const groups: { color: RGB; names: string[]; keys: string[] }[] = []
  const placed: { group: number; day: number; start: number; end: number }[] = []
  const close = (a: string, b: string) =>
    a === b || (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) || similarity(a, b) > 0.7
  for (const b of blocks.sort((p, q) => p.x0 - q.x0 || p.y0 - q.y0)) {
    const start = minutesAt(b.y0)
    const end = minutesAt(b.y1)
    if (!(end - start >= 30) || start < 5 * 60 || end > 24 * 60) continue
    const name = nameIn(b, words)
    const key = normalize(name)
    ;((lastRead.blockNames ??= []) as unknown[]).push([Math.round(b.x0), Math.round(b.y0), name])
    let g = key.length >= 4 ? groups.findIndex((gr) => gr.keys.some((k) => close(k, key))) : -1
    if (g < 0) {
      // same fill color and no clear name conflict → same course (OCR may have garbled one of them)
      g = groups.findIndex(
        (gr) => dist(gr.color, b.color) < 12 && (key.length < 8 || !gr.keys.some((k) => k.length >= 8) || gr.keys.some((k) => similarity(k, key) > 0.3)),
      )
    }
    if (g < 0) {
      groups.push({ color: b.color, names: [], keys: [] })
      g = groups.length - 1
    }
    if (key.length >= 4) {
      groups[g].names.push(name)
      groups[g].keys.push(key)
    }
    placed.push({ group: g, day: dayAt(cx(b)), start, end })
  }
  // each course is named by its most common reading (longest wins a tie)
  let unnamed = 0
  const finalNames = groups.map((gr) => {
    const count = new Map<string, number>()
    for (const k of gr.keys) count.set(k, (count.get(k) ?? 0) + 1)
    let bestName = ''
    let bestScore = -1
    gr.names.forEach((n, i) => {
      const score = (count.get(gr.keys[i]) ?? 0) * 1000 + n.length
      if (score > bestScore) [bestName, bestScore] = [n, score]
    })
    // narrow blocks often cut a name short: prefer a longer reading that contains the common one
    const bestKey = normalize(bestName)
    gr.names.forEach((n, i) => {
      if (n.length > bestName.length && gr.keys[i].startsWith(bestKey)) bestName = n
    })
    return bestName || `Course ${++unnamed}`
  })
  const kindOf = (name: string): SlotKind =>
    /laborator/i.test(name) ? 'lab' : /esercitaz|exercise|practice|tutorial/i.test(name) ? 'practice' : 'lecture'
  const slots: ReadTimetableResult['slots'] = placed.map((pl) => ({
    course: finalNames[pl.group],
    day: pl.day,
    start: hhmm(pl.start),
    end: hhmm(pl.end),
    kind: kindOf(finalNames[pl.group]),
  }))
  const courses = [...new Set(finalNames)].map((name) => ({ name, color: groups[finalNames.indexOf(name)].color }))
  onProgress?.(1)
  return { courses: courses.map((c) => ({ name: c.name, short: shortFrom(c.name), color: c.color })), slots, note: notes.join(',') }
}
