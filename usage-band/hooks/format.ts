import type { Credits, Limit, Usage } from '../types'

export type Level = 'ok' | 'warn' | 'high'

export type Segment = { long: string; short: string; level: Level }

const LABELS: Record<string, { long: string; short: string }> = {
  five_hour: { long: 'Claude 5h', short: '5h' },
  seven_day: { long: 'Week', short: '7d' },
  spend_limit: { long: 'Spend', short: '$' },
}

// Credits below these numbers turn the Higgsfield segment amber, then red.
export const CREDITS_WARN = 500
export const CREDITS_HIGH = 100

export function levelOf(percent: number): Level {
  if (percent >= 95) return 'high'
  if (percent >= 80) return 'warn'

  return 'ok'
}

export function untilReset(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return undefined
  const minutes = Math.max(0, Math.round((at - now) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`

  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export function groupThousands(n: number): string {
  const [whole, part] = (Math.round(n * 10) / 10).toString().split('.')
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return part ? `${grouped}.${part}` : grouped
}

function compactNumber(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toString()}k`

  return String(Math.round(n))
}

function limitSegment(limit: Limit, now: number): Segment {
  const label = LABELS[limit.kind] ?? { long: limit.kind, short: limit.kind }
  const percent = `${Math.round(limit.percentUsed)}%`
  const reset = untilReset(limit.resetsAt, now)

  return {
    long: reset ? `${label.long} ${percent} · resets in ${reset}` : `${label.long} ${percent}`,
    short: reset ? `${label.short} ${percent} ${reset.replace(' ', '')}` : `${label.short} ${percent}`,
    level: levelOf(limit.percentUsed),
  }
}

export function segments(usage: Usage | null, credits: Credits | null, now: number): Segment[] {
  const out: Segment[] = []
  const order = ['five_hour', 'seven_day', 'spend_limit']
  const limits = [...(usage?.limits ?? [])].sort(
    (a, b) => (order.indexOf(a.kind) + 1 || 9) - (order.indexOf(b.kind) + 1 || 9),
  )

  if (limits.length === 0) {
    out.push({ long: 'Claude limits after the first reply', short: 'limits –', level: 'ok' })
  }
  for (const limit of limits) out.push(limitSegment(limit, now))

  const context = usage?.contextPercent
  out.push(
    context === undefined
      ? { long: 'Context –', short: 'ctx –', level: 'ok' }
      : { long: `Context ${context}%`, short: `ctx ${context}%`, level: levelOf(context) },
  )

  if (credits) {
    const level: Level =
      credits.credits < CREDITS_HIGH ? 'high' : credits.credits < CREDITS_WARN ? 'warn' : 'ok'
    out.push({
      long: `Higgsfield ${groupThousands(credits.credits)} credits`,
      short: `HF ${compactNumber(credits.credits)}`,
      level,
    })
  }

  return out
}

export const SEPARATOR = '  |  '
export const SHORT_SEPARATOR = ' | '

// The long wording when it fits the band's width, the short one otherwise.
export function fit(list: Segment[], columns: number): { texts: string[]; separator: string } {
  const long = list.map(s => s.long)
  const width = long.join(SEPARATOR).length
  if (width <= columns) return { texts: long, separator: SEPARATOR }

  return { texts: list.map(s => s.short), separator: SHORT_SEPARATOR }
}

// Reads `{"credits": 4738.5, "subscription_plan_type": "ultra"}` out of the
// balance tool's answer, structured or as its first text block.
export function readCredits(result: { content: readonly unknown[]; isError: boolean; structuredContent?: unknown }): Credits | null {
  if (result.isError) return null
  let body: unknown = result.structuredContent
  if (body === undefined) {
    const block = result.content.find(
      (c): c is { type: 'text'; text: string } =>
        typeof c === 'object' && c !== null && (c as { type?: unknown }).type === 'text',
    )
    if (!block) return null
    try {
      body = JSON.parse(block.text)
    } catch {
      return null
    }
  }
  if (typeof body !== 'object' || body === null) return null
  const { credits, subscription_plan_type } = body as Record<string, unknown>
  if (typeof credits !== 'number') return null

  return {
    credits,
    plan: typeof subscription_plan_type === 'string' ? subscription_plan_type : undefined,
  }
}

// The balance tool's server, from the session's tool names
// (`mcp__claude_ai_Higgsfield__balance` gives `claude_ai_Higgsfield`).
export function higgsfieldServer(toolNames: readonly string[]): string | undefined {
  for (const name of toolNames) {
    const match = /^mcp__(.*higgsfield.*)__balance$/i.exec(name)
    if (match) return match[1]
  }

  return undefined
}
