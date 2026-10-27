export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Usage = {
  limits: Limit[]
  contextPercent?: number
}

export type Credits = { credits: number; plan?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Shaped<Usage | null>; credits: Shaped<Credits | null> }
  }
}
