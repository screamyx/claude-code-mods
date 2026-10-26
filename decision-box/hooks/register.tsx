import type { Register } from 'claude-code'

import { panelFor, withoutStories } from './stories'

export const RULES = `# Asking the person to decide (decision-box mod)

Whenever you need the person's input to go on, ask with the AskUserQuestion tool, not in plain text. That covers a choice between approaches, a call on direction, a confirmation before a step that is hard to undo, and a clarifying question about what they expect. Use it whenever you can: the person would rather click an answer than type one. Do not ask about things you can reasonably decide yourself, and never ask the same thing twice.

Write every question like this:
- question: plain words, no jargon, ending in "?".
- Always recommend one option. Put it first and end its label with " (Recommended)".
- label: 1 to 5 words. A technical term is fine as a label, but the scenario below comes first in the person's mind.
- description: one short line on what happens if it is picked.
- preview: the everyday scenario, exactly in these lines:
  Normal day: who is affected (a staff member, a customer, the person themselves), and what they see or do.
  Bad case: what goes wrong, concretely.
  and on the recommended option only:
  Why: one sentence on why you recommend it.
- multiSelect only when picks really combine.
- No "Other" option: the box already has a field for typing.

When the answer comes back, act on it straight away. Free text the person typed wins over the options you offered.

Subagents cannot reach the person. If you are a subagent, hand the question back to the agent that started you, written the same way.`

const TOOL_NOTE = `

Write the options as the decision-box rules in the system prompt say: the recommended option first with " (Recommended)" in its label, and each option's preview holding "Normal day:" and "Bad case:" lines, plus "Why:" on the recommended one.`

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes('AskUserQuestion')) return composed

    return {
      sections: [
        ...composed.sections,
        { id: 'decision-box:rules', text: RULES, scope: 'session' },
      ],
    }
  })

  on('tool.describe', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const described = await next(e)

    return { ...described, description: described.description + TOOL_NOTE }
  })

  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const panel = panelFor(e.props.questions, e.surface)
    if (panel === undefined) return next(e)

    const box = await next(
      panel.isStripping
        ? { ...e, props: { ...e.props, questions: withoutStories(e.props.questions) } }
        : e,
    )

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>{panel.text}</Text>
          {box}
        </Box>
      )
    }

    const { Box, Markdown } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap="sm">
        <Box flexDirection="column" padding="sm" borderStyle="round" borderDimColor>
          <Markdown text={panel.text} />
        </Box>
        {box}
      </Box>
    )
  })
}
