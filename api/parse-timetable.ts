import Anthropic from '@anthropic-ai/sdk'

/** What we ask Claude to return for a timetable screenshot. */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['courses', 'slots', 'note'],
  properties: {
    courses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'short'],
        properties: {
          name: { type: 'string', description: 'Full course name exactly as written in the timetable' },
          short: { type: 'string', description: 'Short label of 2-6 characters, e.g. initials like "CLA"' },
        },
      },
    },
    slots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['course', 'day', 'start', 'end', 'kind'],
        properties: {
          course: { type: 'string', description: 'The full course name, matching one of courses[].name' },
          day: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6], description: '0 = Monday … 6 = Sunday' },
          start: { type: 'string', description: '24-hour time HH:MM' },
          end: { type: 'string', description: '24-hour time HH:MM' },
          kind: { type: 'string', enum: ['lecture', 'lab', 'practice'] },
        },
      },
    },
    note: { type: 'string', description: 'Anything the student should double-check, or an empty string' },
  },
} as const

const SYSTEM = `You read screenshots of university weekly timetables and turn them into structured data.
List every distinct course once. For each colored block in the grid, add one slot with its weekday and start/end time.
Read times from the time axis: a block's top edge is its start and its bottom edge is its end; round to the nearest 15 minutes.
Blocks that sit side by side in the same column are separate slots at the same time.
Use "lab" when the block or course says lab/laboratory, "practice" for exercise sessions or esercitazioni, otherwise "lecture".
If something is unreadable or ambiguous, leave it out and mention it in note.`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const GATEWAY_URL = 'https://ai-gateway.vercel.sh'

export async function POST(request: Request) {
  // Direct Anthropic key if there is one; otherwise Vercel AI Gateway, which authenticates
  // with the deployment's OIDC token (no key to manage) or an AI Gateway key.
  const directKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
  const gatewayKey =
    process.env.AI_GATEWAY_API_KEY || request.headers.get('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN
  if (!directKey && !gatewayKey) return json({ error: 'missing_key' }, 501)
  const viaGateway = !directKey

  let body: { image?: string; program?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(body.image ?? '')
  if (!match || !MEDIA_TYPES.includes(match[1] as MediaType)) return json({ error: 'not_an_image' }, 400)

  const client = viaGateway ? new Anthropic({ apiKey: gatewayKey, baseURL: GATEWAY_URL }) : new Anthropic()
  const params = {
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: match[1] as MediaType, data: match[2] } },
          {
            type: 'text',
            text: `This is my weekly timetable${body.program ? ` for the program "${body.program.slice(0, 200)}"` : ''}. Extract the courses and class times.`,
          },
        ],
      },
    ],
  }
  try {
    const response = viaGateway
      ? await client.messages.create({
          ...params,
          model: 'anthropic/claude-opus-5.5',
        } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming)
      : await client.beta.messages.create({
          ...params,
          model: 'claude-opus-5-5',
          // on a safety decline, retry on Anthropic's recommended fallback model instead of failing
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)

    if (response.stop_reason === 'refusal') return json({ error: 'refused' }, 422)
    if (response.stop_reason === 'max_tokens') return json({ error: 'too_long' }, 502)
    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return json({ error: 'empty_response' }, 502)
    return json(JSON.parse(text.text))
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return json({ error: 'bad_key' }, 401)
    // AI Gateway: no credits, budget used up, or a payment method needed for free credits
    if (error instanceof Anthropic.APIError && (error.status === 402 || error.status === 403))
      return json({ error: 'no_credits' }, 503)
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429)
    if (error instanceof Anthropic.BadRequestError) return json({ error: `bad_request: ${error.message}` }, 400)
    if (error instanceof Anthropic.APIError) return json({ error: `api_error_${error.status}` }, 502)
    if (error instanceof SyntaxError) return json({ error: 'unreadable_response' }, 502)
    throw error
  }
}
