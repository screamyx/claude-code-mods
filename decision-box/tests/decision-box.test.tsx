import { expect, test } from 'claude-code/testing'

import { countRows, panelFor, readQuestions, storyMarkdown, withoutStories } from '../hooks/stories'

const QUESTIONS = [
  {
    question: "Which contact goes on the reel's end card?",
    header: 'End card',
    multiSelect: false,
    options: [
      {
        label: 'WhatsApp button (Recommended)',
        description: 'Viewer taps, chat opens with the lot number.',
        preview:
          'Normal day: a buyer taps it at 11pm and your sales WhatsApp gets the lot number.\nBad case: nobody answers after hours.\nWhy: reel viewers tap, they rarely call.',
      },
      {
        label: 'Phone number',
        description: 'Viewer notes the number and calls.',
        preview: 'Normal day: a keen buyer calls next afternoon.\nBad case: most viewers never call.',
      },
    ],
  },
]

test('stories and the pick are read off the previews', async () => {
  const [asked] = readQuestions(QUESTIONS)
  expect(asked?.stories[0]?.label).toBe('WhatsApp button')
  expect(asked?.stories[0]?.isRecommended).toBe(true)
  expect(asked?.stories[1]?.bad).toBe('most viewers never call.')

  const story = storyMarkdown(readQuestions(QUESTIONS))
  expect(story).toContain('My pick: WhatsApp button. reel viewers tap, they rarely call.')
  expect(story).toContain('*Bad case:* nobody answers after hours.')
  expect(countRows(story)).toBeLessThan(42)
})

test('only previews that hold a story come off', async () => {
  const kept = { label: 'Code', description: 'x', preview: 'const a = 1' }
  const [q] = withoutStories([{ ...QUESTIONS[0], options: [...QUESTIONS[0]!.options, kept] }]) as {
    options: { preview?: string }[]
  }[]
  expect(q?.options[0]?.preview).toBeUndefined()
  expect(q?.options[2]?.preview).toBe('const a = 1')
})

test('desktop shows the stories above and takes them off the box', async () => {
  const panel = panelFor(QUESTIONS, 'desktop')
  expect(panel?.isStripping).toBe(true)
  expect(panel?.text).toContain('Normal day: a keen buyer calls next afternoon.')
})

test('the terminal shows the pick alone and keeps the previews', async () => {
  const panel = panelFor(QUESTIONS, 'terminal')
  expect(panel?.isStripping).toBe(false)
  expect(panel?.text).toBe('My pick: WhatsApp button. reel viewers tap, they rarely call.')
})

test('a long set falls back to the picks and keeps the previews', async () => {
  const long = Array.from({ length: 4 }, () => QUESTIONS[0]!).map((q, i) => ({
    ...q,
    header: 'Q' + i,
    options: q.options.map(o => ({ ...o, preview: o.preview + '\nNormal day: ' + 'x'.repeat(200) })),
  }))
  const panel = panelFor(long, 'desktop')
  expect(panel?.isStripping).toBe(false)
  expect(panel?.text).toContain('**Q0:** My pick: WhatsApp button.')
})

test('a question with no stories is left to the engine', async () => {
  const plain = [{ question: 'Go?', header: 'Go', multiSelect: false, options: [{ label: 'Yes', description: '' }, { label: 'No', description: '' }] }]
  expect(panelFor(plain, 'desktop')).toBeUndefined()
  expect(panelFor(plain, 'terminal')).toBeUndefined()
})

test('the rules join the system prompt and the tool description', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }))
  on('tool.describe', () => ({ description: 'Ask the user.' }))

  const base = { model: 'm', promptModel: 'm', surfaces: ['desktop'] as const, outputStyle: null, traits: [] }
  const composed = await $.prompt.compose({ ...base, tools: ['AskUserQuestion'] })
  expect(composed.sections.at(-1)?.id).toBe('decision-box:rules')

  const without = await $.prompt.compose({ ...base, tools: ['Bash'] })
  expect(without.sections.some(s => s.id === 'decision-box:rules')).toBe(false)
})
