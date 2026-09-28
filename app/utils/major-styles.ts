import type { Major } from '#shared/utils/major'

/** Colours for each major level, written out in full so Tailwind picks them up */
export const MAJOR_STYLES: Record<Major, { dot: string, edge: string, pill: string }> = {
  high: {
    dot: 'bg-(--major-high)',
    edge: 'shadow-[inset_4px_0_0_var(--major-high)]',
    pill: 'bg-(--major-high-bg) text-(--major-high-fg)'
  },
  mid: {
    dot: 'bg-(--major-mid)',
    edge: 'shadow-[inset_4px_0_0_var(--major-mid)]',
    pill: 'bg-(--major-mid-bg) text-(--major-mid-fg)'
  },
  low: {
    dot: 'bg-(--major-low)',
    edge: 'shadow-[inset_4px_0_0_var(--major-low)]',
    pill: 'bg-(--major-low-bg) text-(--major-low-fg)'
  }
}
