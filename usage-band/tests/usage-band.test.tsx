import { expect, mock, test } from 'claude-code/testing'

import { fit, groupThousands, higgsfieldServer, readCredits, segments, untilReset } from '../hooks/format'

const NOW = Date.parse('2026-10-27T09:00:00Z')

const USAGE = {
  limits: [
    { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-30T13:00:00Z' },
    { kind: 'five_hour', percentUsed: 82.5, resetsAt: '2026-10-27T11:14:00Z' },
  ],
  contextPercent: 61,
}

test('limits come first, with their reset countdown', async () => {
  const list = segments(USAGE, { credits: 4738.5, plan: 'ultra' }, NOW)
  expect(list.map(s => s.long)).toEqual([
    'Claude 5h 83% · resets in 2h 14m',
    'Week 18% · resets in 3d 4h',
    'Context 61%',
    'Higgsfield 4,738.5 credits',
  ])
  expect(list.map(s => s.level)).toEqual(['warn', 'ok', 'ok', 'ok'])
})

test('a narrow band gets the short wording', async () => {
  const list = segments(USAGE, { credits: 4738.5 }, NOW)
  const { texts } = fit(list, 40)
  expect(texts).toEqual(['5h 83% 2h14m', '7d 18% 3d4h', 'ctx 61%', 'HF 4.7k'])
})

test('before the first reply, and without Higgsfield', async () => {
  const list = segments(null, null, NOW)
  expect(list.map(s => s.long)).toEqual(['Claude limits after the first reply', 'Context –'])
})

test('low credits and a full context turn red', async () => {
  const list = segments({ limits: [], contextPercent: 96 }, { credits: 40 }, NOW)
  expect(list[1]?.level).toBe('high')
  expect(list[2]?.level).toBe('high')
})

test('helpers', async () => {
  expect(untilReset('2026-10-27T09:00:20Z', NOW)).toBe('now')
  expect(untilReset('2026-10-27T09:45:00Z', NOW)).toBe('45m')
  expect(groupThousands(1234567)).toBe('1,234,567')
  expect(higgsfieldServer(['Bash', 'mcp__claude_ai_Higgsfield__balance'])).toBe('claude_ai_Higgsfield')
  expect(higgsfieldServer(['mcp__claude_ai_Gmail__balance'])).toBe(undefined)
  expect(
    readCredits({
      content: [{ type: 'text', text: '{"credits":4738.5,"subscription_plan_type":"ultra"}' }],
      isError: false,
    }),
  ).toEqual({ credits: 4738.5, plan: 'ultra' })
  expect(readCredits({ content: [], isError: true })).toBe(null)
})

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the band draws the figures the engine measured, on every surface', async ($, on) => {
  mock.clock(on, { now: NOW })
  const balance = 4738.5
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  on('tool.list', () => ({
    value: [{ name: 'mcp__claude_ai_Higgsfield__balance', description: '', mcp: true }],
  }))
  on('mcp.call', () => ({
    value: { content: [{ type: 'text', text: JSON.stringify({ credits: balance }) }], isError: false },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200000, tokens: 122000, percent: 61 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-27T11:30:00Z' }],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const row = (await ui.find({ type: 'Text', text: /Claude 5h 42%/ }))?.text
    expect(row).toContain('resets in 2h 30m')
    expect(row).toContain('Context 61%')
    expect((await ui.find({ type: 'Text', text: /Higgsfield/ }))?.text).toContain('4,738.5')
    await ui.unmount()
  }
})

test('the balance is read again every five minutes', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  let balance = 4738.5
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  on('tool.list', () => ({
    value: [{ name: 'mcp__claude_ai_Higgsfield__balance', description: '', mcp: true }],
  }))
  on('mcp.call', () => ({
    value: { content: [{ type: 'text', text: JSON.stringify({ credits: balance }) }], isError: false },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  balance = 80
  await clock.advance(5 * 60 * 1000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Higgsfield/ }))?.text).toContain('Higgsfield 80 credits')
  await ui.unmount()
})
