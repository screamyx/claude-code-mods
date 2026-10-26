# Claude Code mods

Mods for the Claude Code desktop app and terminal.

## decision-box

When Claude needs your call, it asks in Claude Code's own question box instead of in plain text, and it writes every option the same way:

- The option it recommends comes first, marked "(Recommended)", with one sentence on why.
- Each option has a short everyday story: who is affected and what they see on a normal day, and what goes wrong in the bad case.

In the desktop app the stories sit in a panel just above the box, so you can compare all the options at once. In the terminal, your pick shows above the box and each story shows when you move to that option. You click an option, or type your own answer under Other, and Claude carries on with it right away.

The mod also tells Claude to use the box whenever it needs your input, and to hand questions up to the main agent when a subagent hits one.

## Install

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace**, enter `screamyx/claude-code-mods`, then **Add plugin** and choose `decision-box`.

At the prompt of a terminal session:

```
/plugin install decision-box --marketplace screamyx/claude-code-mods
```

From a shell:

```
claude plugin install decision-box --marketplace screamyx/claude-code-mods
```

Answer `y` to add the marketplace, then pick the user scope so it applies to every session.

If this repository is private, your machine needs a git login for github.com first (`gh auth login`, then `gh auth setup-git`).

## Develop

```
claude plugin validate decision-box
claude plugin test decision-box
```
