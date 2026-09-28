import type { Team, TeamsResponse } from '#shared/types/team'

/** How long a read of the sheet is reused before it is fetched again */
const MAX_AGE = 5 * 60 * 1000
/** A manual refresh within this window returns the read that just happened */
const MIN_REFRESH_INTERVAL = 10 * 1000
const CACHE_KEY = 'teams.json'

const COLUMNS = {
  name: 'college name',
  conference: 'conference',
  location: 'location',
  coach: 'coach',
  major: 'major',
  notes: 'notes'
} as const

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function fetchTeams(): Promise<Team[]> {
  const { googleSheetId } = useRuntimeConfig()

  if (!googleSheetId) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_GOOGLE_SHEET_ID is not set' })
  }

  const csv = await $fetch<string>(`https://docs.google.com/spreadsheets/d/${googleSheetId}/export?format=csv`, {
    responseType: 'text',
    timeout: 10_000
  }).catch((error) => {
    throw createError({ statusCode: 502, statusMessage: 'Could not load the teams spreadsheet', cause: error })
  })

  const [header = [], ...rows] = parseCsv(csv)

  // Look columns up by header name so the sheet's column order can change
  const headers = header.map(h => h.trim().toLowerCase())
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, label]) => [key, headers.indexOf(label)])
  ) as Record<keyof typeof COLUMNS, number>

  if (index.name === -1) {
    throw createError({ statusCode: 502, statusMessage: 'The teams spreadsheet has no "College name" column' })
  }

  const cell = (row: string[], key: keyof typeof COLUMNS) => (index[key] === -1 ? '' : row[index[key]]?.trim() ?? '')
  const seen = new Map<string, number>()

  return rows
    .filter(row => cell(row, 'name'))
    .map((row): Team => {
      const name = cell(row, 'name')
      const location = cell(row, 'location')

      const slug = slugify(name)
      const count = (seen.get(slug) ?? 0) + 1
      seen.set(slug, count)

      return {
        id: count > 1 ? `${slug}-${count}` : slug,
        name,
        conference: cell(row, 'conference'),
        location,
        state: /,\s*([A-Z]{2})$/.exec(location)?.[1],
        coach: cell(row, 'coach'),
        major: parseMajor(cell(row, 'major')),
        notes: cell(row, 'notes')
      }
    })
}

// Concurrent requests share one read of the sheet
let pending: Promise<TeamsResponse> | undefined

/**
 * Teams from the Google Sheet, reused for five minutes.
 * `force` reads the sheet again unless it was read in the last few seconds.
 */
export async function getTeams({ force = false } = {}): Promise<TeamsResponse> {
  const storage = useStorage('cache')
  const cached = await storage.getItem<TeamsResponse>(CACHE_KEY)
  const age = cached ? Date.now() - Date.parse(cached.updatedAt) : Infinity

  if (cached && age < (force ? MIN_REFRESH_INTERVAL : MAX_AGE)) {
    return cached
  }

  pending ??= fetchTeams()
    .then(async (teams) => {
      const response = { updatedAt: new Date().toISOString(), teams }
      await storage.setItem(CACHE_KEY, response)
      return response
    })
    .finally(() => {
      pending = undefined
    })

  try {
    return await pending
  } catch (error) {
    // Keep serving the last good read if a scheduled refresh fails; a manual refresh reports the error
    if (cached && !force) return cached
    throw error
  }
}
