/** Values of the sheet's "Major" column, highest first */
export const MAJOR_LEVELS = ['high', 'mid', 'low'] as const

export type Major = typeof MAJOR_LEVELS[number]

export const MAJOR_LABELS: Record<Major, string> = {
  high: 'High major',
  mid: 'Mid major',
  low: 'Low major'
}

/** Reads a "Major" cell case-insensitively; anything other than high, mid or low counts as blank */
export function parseMajor(value: string): Major | undefined {
  const normalized = value.trim().toLowerCase()
  return MAJOR_LEVELS.find(level => level === normalized)
}
