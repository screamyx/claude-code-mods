// Reads the everyday story Claude writes into each option's `preview`:
//   Normal day: ...
//   Bad case: ...
//   Why: ...        (the recommended option only)

export type Story = {
  label: string
  isRecommended: boolean
  day?: string
  bad?: string
  why?: string
}

export type Asked = {
  header: string
  question: string
  stories: Story[]
}

type RawOption = { label?: unknown; description?: unknown; preview?: unknown }
type RawQuestion = { question?: unknown; header?: unknown; options?: unknown }

const RECOMMENDED = /\s*\((recommended|my pick)\)\s*$/i
const LINE = /^\s*(normal day|bad case|why)\s*:\s*(.+)$/i

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function cleanLabel(label: string): string {
  return label.replace(RECOMMENDED, '')
}

export function readStory(option: RawOption): Story {
  const label = text(option.label)
  const story: Story = {
    label: cleanLabel(label),
    isRecommended: RECOMMENDED.test(label),
  }

  for (const line of text(option.preview).split('\n')) {
    const match = LINE.exec(line)
    if (match === null) continue
    const kind = (match[1] ?? '').toLowerCase()
    const body = (match[2] ?? '').trim()
    if (kind === 'normal day') story.day = body
    else if (kind === 'bad case') story.bad = body
    else story.why = body
  }
  if (story.why !== undefined) story.isRecommended = true

  return story
}

export function hasStory(story: Story): boolean {
  return story.day !== undefined || story.bad !== undefined
}

export function readQuestions(questions: readonly unknown[]): Asked[] {
  return questions.map(raw => {
    const q = (raw ?? {}) as RawQuestion
    const options = Array.isArray(q.options) ? (q.options as RawOption[]) : []

    return {
      header: text(q.header),
      question: text(q.question),
      stories: options.map(readStory),
    }
  })
}

// The previews the mod draws itself come off the options, so the box does
// not show the same story twice. Previews that hold no story stay.
export function withoutStories(questions: readonly unknown[]): unknown[] {
  return questions.map(raw => {
    const q = (raw ?? {}) as RawQuestion
    if (!Array.isArray(q.options)) return raw

    return {
      ...q,
      options: (q.options as RawOption[]).map(option => {
        if (!hasStory(readStory(option))) return option
        const { preview: _, ...rest } = option

        return rest
      }),
    }
  })
}

export function pickLine(asked: Asked): string | undefined {
  const pick = asked.stories.find(story => story.isRecommended)
  if (pick === undefined) return undefined

  return pick.why === undefined
    ? `My pick: ${pick.label}.`
    : `My pick: ${pick.label}. ${pick.why}`
}

export function storyMarkdown(asked: readonly Asked[]): string {
  const blocks: string[] = []

  for (const one of asked) {
    if (!one.stories.some(hasStory)) continue
    const lines: string[] = []
    if (asked.length > 1 && one.header !== '') lines.push(`**${one.header}**`)
    const pick = pickLine(one)
    if (pick !== undefined) lines.push(pick, '')
    for (const story of one.stories) {
      if (!hasStory(story)) continue
      lines.push(`**${story.label}**`)
      if (story.day !== undefined) lines.push(`Normal day: ${story.day}`)
      if (story.bad !== undefined) lines.push(`*Bad case:* ${story.bad}`)
      lines.push('')
    }
    blocks.push(lines.join('\n').trim())
  }

  return blocks.join('\n\n---\n\n')
}

// Rows as the question dialog counts them: one per line, one more for every
// 40 columns a line runs to.
export function countRows(markdown: string): number {
  return markdown
    .split('\n')
    .reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / 40)), 0)
}

export function picksMarkdown(asked: readonly Asked[]): string {
  return asked
    .map(one => {
      const pick = pickLine(one)
      if (pick === undefined) return undefined

      return asked.length > 1 && one.header !== '' ? `**${one.header}:** ${pick}` : pick
    })
    .filter((line): line is string => line !== undefined)
    .join('\n\n')
}

// The desktop, VS Code and mobile frame above the box holds 48 rows; a few
// are kept spare for the gap and wrapping the count cannot see.
const ROWS = 42
// The terminal frame holds 12 and draws no Markdown.
const TERMINAL_ROWS = 4

export type Panel = {
  // What goes above the box.
  text: string
  // Whether the stories come off the options' previews, shown above instead.
  isStripping: boolean
}

export function panelFor(questions: readonly unknown[], surface: string): Panel | undefined {
  const asked = readQuestions(questions)

  if (surface === 'terminal') {
    // The terminal shows each option's preview as the box's own, so the
    // stories stay there and only the picks go above.
    const picks = picksMarkdown(asked).replace(/\*\*/g, '')
    if (picks === '' || countRows(picks) > TERMINAL_ROWS) return undefined

    return { text: picks, isStripping: false }
  }

  const story = storyMarkdown(asked)
  if (story === '') return undefined
  if (countRows(story) <= ROWS) return { text: story, isStripping: true }

  // Too long to show whole: the picks go above and each story stays in its
  // option's preview, where the box shows it on focus.
  const picks = picksMarkdown(asked)
  if (picks === '' || countRows(picks) > ROWS) return undefined

  return { text: picks, isStripping: false }
}
