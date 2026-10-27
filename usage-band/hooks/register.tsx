import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Usage } from '../types'
import { fit, higgsfieldServer, readCredits, segments } from './format'
import type { Level } from './format'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null, { shape: 'usage-1' })
const credits = atom({ plugin: 'usage-band', key: 'credits' } as const, null, { shape: 'credits-1' })

const CREDITS_EVERY = 5 * 60 * 1000
const COUNTDOWN_EVERY = 60 * 1000

const COLORS: Record<Level, 'warning' | 'error' | undefined> = {
  ok: undefined,
  warn: 'warning',
  high: 'error',
}

function toUsage(context: SessionContextUsage, rateLimits: SessionRateLimit[]): Usage {
  return {
    limits: rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    contextPercent: context.percent,
  }
}

// The balance tool's server, found once per load.
let server: string | undefined

async function refreshCredits($: EngineInterface) {
  if (!server) {
    server = higgsfieldServer((await $.tool.list()).filter(t => t.mcp).map(t => t.name))
  }
  if (!server) return
  try {
    const found = readCredits(await $.mcp.call(server, 'balance'))
    if (found) await update($, credits, () => found)
  } catch {
    // The connector is down or signed out: keep the last balance shown.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const now = await $.session.usage()
    await update($, usage, () => toUsage(now.context, now.rateLimits))
    void refreshCredits($)
    $.clock.every(CREDITS_EVERY, () => void refreshCredits($))
    $.clock.every(COUNTDOWN_EVERY, () => $.ui.invalidate('ui.render'))

    return started
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e.context, e.rateLimits))

    return next(e)
  })

  // A generation spends credits: read the balance again once it is sent.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (/^mcp__.*higgsfield.*__/i.test(e.tool) && !e.tool.endsWith('__balance')) {
      void refreshCredits($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const list = segments(await read($, usage), await read($, credits), await $.clock.now())
    const { texts, separator } = fit(list, e.props.bodyColumns)

    return (
      <Box>
        <Text wrap="truncate-end">
          {texts.map((text, i) => (
            <Text>
              {i > 0 && <Text dimColor>{separator}</Text>}
              <Text color={COLORS[list[i]!.level]} dimColor={list[i]!.level === 'ok'}>
                {text}
              </Text>
            </Text>
          ))}
        </Text>
      </Box>
    )
  })
}
