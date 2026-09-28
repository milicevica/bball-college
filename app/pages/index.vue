<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Team, TeamsResponse } from '#shared/types/team'

const ALL = 'all'
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000

const { data, status, error, refresh } = await useFetch('/api/teams', {
  key: 'teams',
  default: (): TeamsResponse => ({ updatedAt: '', teams: [] })
})

const teams = computed(() => data.value.teams)
const loading = computed(() => status.value === 'pending' && !teams.value.length)

const toast = useToast()
const refreshing = ref(false)

// Reads the sheet again right away instead of waiting for the 5-minute cache
async function refreshNow() {
  refreshing.value = true
  try {
    await $fetch('/api/teams/refresh', { method: 'POST' })
    await refresh()
    toast.add({ title: 'Teams updated from the spreadsheet', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Couldn\'t refresh teams', description: 'The spreadsheet didn\'t respond. Try again in a moment.', icon: 'i-lucide-cloud-off', color: 'error' })
  } finally {
    refreshing.value = false
  }
}

// Keep an open page current, and the "Updated … ago" label ticking
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

// The filter bar sticks on wider screens; the table header sticks just below it
const filterBar = useTemplateRef('filterBar')
const filterHeight = ref(0)
const stuck = ref(false)
let filterObserver: ResizeObserver | undefined

function onScroll() {
  stuck.value = window.scrollY > 60
}

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
    const age = now.value - Date.parse(data.value.updatedAt)
    if (age >= AUTO_REFRESH_INTERVAL && document.visibilityState === 'visible' && !refreshing.value) {
      refresh()
    }
  }, 30_000)

  if (filterBar.value) {
    filterObserver = new ResizeObserver(([entry]) => {
      filterHeight.value = entry?.target.getBoundingClientRect().height ?? 0
    })
    filterObserver.observe(filterBar.value)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onArrowKey)
  onScroll()
})

onBeforeUnmount(() => {
  clearInterval(ticker)
  filterObserver?.disconnect()
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onArrowKey)
})

const updatedLabel = computed(() => {
  if (!data.value.updatedAt) return ''
  const minutes = Math.floor((now.value - Date.parse(data.value.updatedAt)) / 60_000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  return `Updated ${Math.floor(minutes / 60)} h ago`
})

const query = ref('')
const major = ref<Major | typeof ALL>(ALL)
const conferences = ref<string[]>([])
const states = ref<string[]>([])
const sorting = ref([{ id: 'name', desc: false }])

const searchInput = useTemplateRef('searchInput')

function toggle(list: Ref<string[]>, value: string) {
  list.value = list.value.includes(value)
    ? list.value.filter(v => v !== value)
    : [...list.value, value]
}

function countBy(key: 'conference' | 'state') {
  const counts = new Map<string, number>()
  for (const team of teams.value) {
    const value = team[key]
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

const conferenceItems = computed(() =>
  [...countBy('conference')]
    .map(([value, count]) => ({ label: value, value, count }))
    .sort((a, b) => a.label.localeCompare(b.label))
)

const stateItems = computed(() =>
  [...countBy('state')]
    .map(([value, count]) => ({ label: US_STATES[value] ?? value, value, count }))
    .sort((a, b) => a.label.localeCompare(b.label))
)

const majorItems: { label: string, value: Major | typeof ALL, dot: string }[] = [
  { label: 'All', value: ALL, dot: '' },
  ...MAJOR_LEVELS.map(level => ({ label: MAJOR_LABELS[level], value: level, dot: MAJOR_STYLES[level].dot }))
]

// One removable chip per active filter value
const chips = computed(() => [
  ...(major.value === ALL
    ? []
    : [{ key: 'major', category: 'Major', label: MAJOR_LABELS[major.value], remove: () => { major.value = ALL } }]),
  ...conferences.value.map(c => ({ key: `conference:${c}`, category: 'Conference', label: c, remove: () => toggle(conferences, c) })),
  ...states.value.map(s => ({ key: `state:${s}`, category: 'State', label: US_STATES[s] ?? s, remove: () => toggle(states, s) }))
])

const hasFilters = computed(() => chips.value.length > 0)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()

  return teams.value.filter((t) => {
    if (major.value !== ALL && t.major !== major.value) return false
    if (conferences.value.length && !conferences.value.includes(t.conference)) return false
    if (states.value.length && (!t.state || !states.value.includes(t.state))) return false
    if (!q) return true

    return [t.name, t.conference, t.location, t.state ? US_STATES[t.state] : '', t.coach, t.notes]
      .some(field => field?.toLowerCase().includes(q))
  })
})

// Sorted here rather than inside UTable, so sorting covers every page and not just the visible one
const sorted = computed(() => {
  const [sort] = sorting.value
  if (!sort) return filtered.value

  const key = sort.id as keyof Team
  const direction = sort.desc ? -1 : 1

  return [...filtered.value].sort((a, b) => {
    const x = String(a[key] ?? '')
    const y = String(b[key] ?? '')
    // Blank cells go last in either direction
    if (!x || !y) return Number(!x) - Number(!y)
    // Major sorts by level rather than alphabetically: high, mid, low when ascending
    if (key === 'major') {
      return (MAJOR_LEVELS.indexOf(x as Major) - MAJOR_LEVELS.indexOf(y as Major)) * direction
    }
    return x.localeCompare(y, 'en', { sensitivity: 'base', numeric: true }) * direction
  })
})

// Group by major: one section per level, then teams with no major listed
type GroupKey = Major | 'none'

interface TeamGroup {
  key: GroupKey
  label: string
  teams: Team[]
  collapsed: boolean
}

/** A table row: a team, or a group's header row when grouping by major */
type TableEntry = Team & { group?: TeamGroup }

const GROUP_KEYS: GroupKey[] = [...MAJOR_LEVELS, 'none']

const grouped = ref(true)
const collapsedGroups = ref<GroupKey[]>([])

function toggleGroup(key: GroupKey) {
  collapsedGroups.value = collapsedGroups.value.includes(key)
    ? collapsedGroups.value.filter(k => k !== key)
    : [...collapsedGroups.value, key]
}

function groupDot(key: GroupKey) {
  return key === 'none' ? 'bg-accented' : MAJOR_STYLES[key].dot
}

const groups = computed<TeamGroup[]>(() =>
  GROUP_KEYS
    .map(key => ({
      key,
      label: key === 'none' ? 'No major listed' : MAJOR_LABELS[key],
      teams: sorted.value.filter(t => (t.major ?? 'none') === key),
      collapsed: collapsedGroups.value.includes(key)
    }))
    .filter(group => group.teams.length)
)

// Teams in display order; collapsed groups drop out, so paging only counts rows you can see
const ordered = computed(() =>
  grouped.value ? groups.value.flatMap(group => group.collapsed ? [] : group.teams) : sorted.value
)

const PAGE_SIZES = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: 'All', value: 0 }
]

const pageSize = ref(25)
const page = ref(1)

const pageCount = computed(() =>
  pageSize.value ? Math.max(1, Math.ceil(ordered.value.length / pageSize.value)) : 1
)

const pageStart = computed(() => pageSize.value ? (page.value - 1) * pageSize.value : 0)

const paged = computed(() => {
  if (!pageSize.value) return ordered.value
  return ordered.value.slice(pageStart.value, pageStart.value + pageSize.value)
})

// The current page with a header row above each group's teams. A group running over
// several pages gets its header again on each; a collapsed group shows just its header,
// on the page where its teams would have started
const tableData = computed<TableEntry[]>(() => {
  if (!grouped.value) return paged.value

  const start = pageStart.value
  const end = start + paged.value.length
  const isLastPage = page.value >= pageCount.value
  const onPage = new Set(paged.value.map(t => t.id))
  let position = 0

  return groups.value.flatMap((group) => {
    const header: TableEntry = { id: `group:${group.key}`, name: group.label, conference: '', location: '', coach: '', notes: '', group }

    if (group.collapsed) {
      return position >= start && (position < end || isLastPage) ? [header] : []
    }

    position += group.teams.length
    const rows = group.teams.filter(t => onPage.has(t.id))
    return rows.length ? [header, ...rows] : []
  })
})

const rangeLabel = computed(() => {
  const total = ordered.value.length
  if (!total) return ''
  const start = pageSize.value ? (page.value - 1) * pageSize.value + 1 : 1
  const end = start + paged.value.length - 1
  return `Showing ${start.toLocaleString('en-US')}–${end.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} teams`
})

// A new search, filter, sort or page size starts again from page 1
watch([query, major, conferences, states, sorting, pageSize, grouped], () => {
  page.value = 1
}, { deep: true })

// A refresh can shrink the list below the current page
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

const resultsTop = useTemplateRef('resultsTop')

function goToPage(value: number) {
  page.value = value
  // Bring the top of the table back into view when paging from the bottom
  if (resultsTop.value && resultsTop.value.getBoundingClientRect().top < filterHeight.value) {
    resultsTop.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const countLabel = computed(() => filtered.value.length === 1 ? 'team' : 'teams')
const narrowed = computed(() => hasFilters.value || !!query.value.trim())

const emptyTitle = computed(() => query.value.trim()
  ? `No teams match “${query.value.trim()}”`
  : 'No teams match these filters'
)

function clearFilters() {
  major.value = ALL
  conferences.value = []
  states.value = []
}

function clearAll() {
  query.value = ''
  clearFilters()
}

// A group header row is one cell spanning the table; it sticks below the table header
const COLUMN_COUNT = 5

function groupCell(entry: TableEntry, teamClass = '') {
  return entry.group ? 'hidden' : teamClass
}

const columns: TableColumn<TableEntry>[] = [
  {
    accessorKey: 'name',
    header: 'College',
    meta: {
      colspan: {
        td: cell => String(cell.row.original.group ? COLUMN_COUNT : 1)
      },
      class: {
        th: 'w-[32%] ps-6',
        td: ({ row: { original } }) => {
          if (original.group) {
            return 'sticky top-[calc(var(--filter-h)+2.75rem)] z-5 h-10 bg-elevated ps-3'
          }
          // Coloured edge for the team's major level
          return `ps-6 ${original.major ? MAJOR_STYLES[original.major].edge : ''}`
        }
      }
    }
  },
  { accessorKey: 'conference', header: 'Conference', meta: { class: { th: 'w-[18%]', td: cell => groupCell(cell.row.original) } } },
  { accessorKey: 'major', header: 'Major', meta: { class: { th: 'w-[15%]', td: cell => groupCell(cell.row.original) } } },
  { accessorKey: 'location', header: 'Location', meta: { class: { th: 'w-[19%]', td: cell => groupCell(cell.row.original) } } },
  { accessorKey: 'coach', header: 'Coach', meta: { class: { th: 'w-[16%] pe-5', td: cell => groupCell(cell.row.original, 'pe-5') } } }
]

const SORTABLE = ['name', 'conference', 'major', 'location', 'coach']

function sortIcon(sorted: false | 'asc' | 'desc') {
  if (sorted === 'asc') return 'i-lucide-arrow-up'
  if (sorted === 'desc') return 'i-lucide-arrow-down'
  return 'i-lucide-chevrons-up-down'
}

// The team shown in the details drawer; kept after closing so the drawer doesn't empty mid-animation
const selectedTeam = ref<Team>()
const detailsOpen = ref(false)

function openTeam(team: Team) {
  selectedTeam.value = team
  detailsOpen.value = true
}

// Enter or a click on a row: a group header folds its group, a team opens its details
function selectEntry(entry: TableEntry) {
  if (entry.group) toggleGroup(entry.group.key)
  else openTeam(entry)
}

const selectedIndex = computed(() =>
  selectedTeam.value ? ordered.value.findIndex(t => t.id === selectedTeam.value?.id) : -1
)

const selectedPosition = computed(() =>
  selectedIndex.value < 0 ? '' : `${selectedIndex.value + 1} of ${ordered.value.length.toLocaleString('en-US')}`
)

// Previous or next team in the current order, turning the page so its row stays in view
function step(offset: 1 | -1) {
  if (selectedIndex.value < 0) return
  const index = selectedIndex.value + offset
  const team = ordered.value[index]
  if (!team) return
  selectedTeam.value = team
  if (pageSize.value) page.value = Math.floor(index / pageSize.value) + 1
}

// ↑ and ↓ walk the table rows (Enter opens one, via UTable), or step through teams while the drawer is open
const tableWrapper = useTemplateRef('tableWrapper')

function moveFocus(offset: 1 | -1) {
  const rows = [...tableWrapper.value?.querySelectorAll<HTMLElement>('tbody > tr[data-selectable="true"]') ?? []]
  if (!rows.length) return
  const current = rows.indexOf(document.activeElement as HTMLElement)
  const next = current < 0
    ? (offset > 0 ? 0 : rows.length - 1)
    : Math.min(rows.length - 1, Math.max(0, current + offset))
  rows[next]?.focus()
}

defineShortcuts({
  '/': () => searchInput.value?.inputRef?.focus()
})

// Not a shortcut, which would always swallow the arrows: they should still scroll the page from anywhere else
function onArrowKey(e: KeyboardEvent) {
  if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const offset = e.key === 'ArrowDown' ? 1 : -1

  if (detailsOpen.value) {
    e.preventDefault()
    step(offset)
    return
  }

  const target = e.target as HTMLElement
  const inTable = !!tableWrapper.value?.contains(target)
  if (inTable || target === document.body || target === searchInput.value?.inputRef) {
    e.preventDefault()
    moveFocus(offset)
  }
}

// Mobile filter sheet
const sheetOpen = ref(false)

const sheetGroups = computed(() => [
  { label: 'Conference', items: conferenceItems.value, selected: conferences.value, toggle: (value: string) => toggle(conferences, value) },
  { label: 'State', items: stateItems.value, selected: states.value, toggle: (value: string) => toggle(states, value) }
])
</script>

<template>
  <div :style="{ '--filter-h': `${filterHeight}px` }">
    <!-- Search and filters -->
    <div
      ref="filterBar"
      class="
        z-20 border-b bg-(--bg) transition-colors
        sm:sticky sm:top-0
      "
      :class="stuck ? 'border-transparent sm:border-default' : 'border-transparent'"
    >
      <UContainer class="flex flex-col gap-3 pt-1 pb-3 sm:pt-2 sm:pb-4">
        <UInput
          ref="searchInput"
          v-model="query"
          enterkeyhint="search"
          size="xl"
          icon="i-lucide-search"
          placeholder="Search teams, coaches, cities…"
          aria-label="Search teams"
          class="w-full"
          :ui="{
            base: 'h-14 ps-12 pe-14 text-lg sm:pe-24',
            leading: 'ps-4.5',
            leadingIcon: 'size-5',
            trailing: 'gap-2 pe-3.5'
          }"
        >
          <template #trailing>
            <UButton
              v-if="query"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              aria-label="Clear search"
              class="rounded-full"
              @click="query = ''"
            />
            <UKbd
              value="/"
              size="lg"
              class="max-sm:hidden"
            />
          </template>
        </UInput>

        <!-- Desktop filters -->
        <div class="hidden flex-wrap items-center gap-2 sm:flex">
          <UTabs
            v-model="major"
            :items="majorItems"
            :content="false"
            color="neutral"
            size="sm"
            aria-label="Major"
            :ui="{
              list: 'gap-0.5 rounded-lg bg-elevated p-[3px] ring ring-default ring-inset',
              indicator: 'rounded-md bg-default shadow-xs',
              trigger: 'h-8 grow-0 gap-2 px-3 text-sm data-[state=active]:text-highlighted'
            }"
          >
            <template #leading="{ item }">
              <span
                v-if="item.dot"
                aria-hidden="true"
                class="size-2 rounded-full"
                :class="item.dot"
              />
            </template>
          </UTabs>

          <USeparator
            orientation="vertical"
            class="mx-1 h-6"
          />

          <USelectMenu
            v-model="conferences"
            :items="conferenceItems"
            value-key="value"
            multiple
            trailing-icon="i-lucide-chevron-down"
            aria-label="Conference"
            :search-input="{ placeholder: 'Search conferences…', icon: 'i-lucide-search' }"
            :content="{ align: 'start' }"
            :ui="{
              base: 'h-10 ps-3.5 pe-9 text-sm font-medium',
              trailingIcon: 'size-4',
              content: 'max-h-[400px] w-[300px]'
            }"
          >
            <span class="flex items-center gap-2 whitespace-nowrap">
              Conference
              <UBadge
                v-if="conferences.length"
                :label="conferences.length"
                size="sm"
                class="min-w-5 justify-center rounded-full"
              />
            </span>

            <template #item-trailing="{ item }">
              <span class="text-[13px] text-dimmed">{{ item.count }}</span>
            </template>

            <template #content-bottom>
              <div class="flex items-center justify-between border-t border-default py-2 ps-4 pe-2">
                <span class="text-[13px] text-dimmed">
                  {{ conferences.length ? `${conferences.length} selected` : 'None selected' }}
                </span>
                <UButton
                  label="Clear"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="!conferences.length"
                  @click="conferences = []"
                />
              </div>
            </template>
          </USelectMenu>

          <USelectMenu
            v-model="states"
            :items="stateItems"
            value-key="value"
            multiple
            trailing-icon="i-lucide-chevron-down"
            aria-label="State"
            :search-input="{ placeholder: 'Search states…', icon: 'i-lucide-search' }"
            :content="{ align: 'start' }"
            :ui="{
              base: 'h-10 ps-3.5 pe-9 text-sm font-medium',
              trailingIcon: 'size-4',
              content: 'max-h-[400px] w-[300px]'
            }"
          >
            <span class="flex items-center gap-2 whitespace-nowrap">
              State
              <UBadge
                v-if="states.length"
                :label="states.length"
                size="sm"
                class="min-w-5 justify-center rounded-full"
              />
            </span>

            <template #item-trailing="{ item }">
              <span class="text-[13px] text-dimmed">{{ item.count }}</span>
            </template>

            <template #content-bottom>
              <div class="flex items-center justify-between border-t border-default py-2 ps-4 pe-2">
                <span class="text-[13px] text-dimmed">
                  {{ states.length ? `${states.length} selected` : 'None selected' }}
                </span>
                <UButton
                  label="Clear"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="!states.length"
                  @click="states = []"
                />
              </div>
            </template>
          </USelectMenu>
        </div>

        <div
          v-if="hasFilters"
          class="hidden flex-wrap items-center gap-2 sm:flex"
        >
          <UBadge
            v-for="chip in chips"
            :key="chip.key"
            color="neutral"
            variant="outline"
            size="lg"
            class="h-7.5 gap-1.5 rounded-full ps-3 pe-1 text-[13px] font-medium"
          >
            <span class="text-dimmed">{{ chip.category }}</span>
            <span>{{ chip.label }}</span>

            <template #trailing>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-x"
                :aria-label="`Remove ${chip.label}`"
                class="size-5 justify-center rounded-full p-0"
                :ui="{ leadingIcon: 'size-3' }"
                @click="chip.remove"
              />
            </template>
          </UBadge>

          <UButton
            label="Clear all"
            color="neutral"
            variant="link"
            size="sm"
            class="text-muted underline underline-offset-3"
            @click="clearAll"
          />
        </div>

        <!-- Mobile filters -->
        <div class="flex items-center justify-between gap-3 sm:hidden">
          <UButton
            label="Filters"
            icon="i-lucide-sliders-horizontal"
            color="neutral"
            variant="outline"
            size="lg"
            class="h-11"
            @click="sheetOpen = true"
          >
            <template
              v-if="hasFilters"
              #trailing
            >
              <UBadge
                :label="chips.length"
                size="sm"
                class="min-w-5 justify-center rounded-full"
              />
            </template>
          </UButton>

          <p class="text-[15px] text-muted">
            <template v-if="loading">
              Loading…
            </template>
            <template v-else>
              <strong class="font-semibold text-highlighted">{{ filtered.length.toLocaleString('en-US') }}</strong>
              {{ countLabel }}
            </template>
          </p>
        </div>

        <div
          v-if="hasFilters"
          class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:hidden"
        >
          <UButton
            v-for="chip in chips"
            :key="chip.key"
            :label="chip.label"
            :aria-label="`Remove ${chip.label}`"
            trailing-icon="i-lucide-x"
            color="neutral"
            variant="outline"
            class="h-9 shrink-0 rounded-full ps-3 pe-2.5 text-[13px]"
            :ui="{ trailingIcon: 'size-3 text-dimmed' }"
            @click="chip.remove"
          />
        </div>
      </UContainer>
    </div>

    <!-- Results -->
    <UContainer class="pt-1 pb-16">
      <div
        ref="resultsTop"
        class="
          flex min-h-13 flex-wrap items-center justify-between gap-x-4 gap-y-2
          sm:scroll-mt-(--filter-h)
        "
      >
        <p
          aria-live="polite"
          class="text-[15px] text-muted max-sm:sr-only"
        >
          <template v-if="error">
            Couldn't load teams
          </template>
          <template v-else-if="loading">
            Loading teams…
          </template>
          <template v-else>
            <strong class="font-semibold text-highlighted">{{ filtered.length.toLocaleString('en-US') }}</strong>
            {{ countLabel }}
            <span
              v-if="narrowed"
              class="text-dimmed"
            >of {{ teams.length.toLocaleString('en-US') }}</span>
          </template>
        </p>

        <div class="ms-auto flex items-center gap-4">
          <USwitch
            v-model="grouped"
            label="Group by major"
            :ui="{
              root: 'flex-row-reverse items-center',
              wrapper: 'me-2.5 ms-0',
              label: 'text-sm text-muted'
            }"
          />
          <ClientOnly>
            <span
              v-if="updatedLabel && !error"
              class="text-[13px] text-dimmed"
            >
              {{ updatedLabel }}
            </span>
          </ClientOnly>
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="refreshing"
            :disabled="refreshing"
            @click="refreshNow"
          />
        </div>
      </div>

      <!-- Desktop: table -->
      <div
        ref="tableWrapper"
        class="max-sm:hidden"
      >
        <UTable
          v-model:sorting="sorting"
          :data="tableData"
          :columns="columns"
          :sorting-options="{ manualSorting: true }"
          :loading="status === 'pending'"
          :meta="{
            class: {
              tr: row => detailsOpen && row.original.id === selectedTeam?.id ? 'bg-elevated/50' : ''
            }
          }"
          class="rounded-lg border border-default bg-default"
          :ui="{
            root: 'overflow-clip',
            base: 'w-full table-fixed',
            thead: 'sticky top-(--filter-h) z-10 bg-default',
            th: 'h-11 px-2 py-0',
            td: 'h-14 overflow-hidden px-2 py-0 text-[15px] text-ellipsis text-muted',
            tbody: '[&>tr]:cursor-pointer [&>tr]:scroll-mt-[calc(var(--filter-h)+2.75rem)] [&>tr]:scroll-mb-4',
            loading: 'p-0',
            empty: 'p-0'
          }"
          @select="(_, row) => selectEntry(row.original)"
        >
          <template
            v-for="key in SORTABLE"
            :key="key"
            #[`${key}-header`]="{ column }"
          >
            <UButton
              :label="String(column.columnDef.header)"
              :trailing-icon="sortIcon(column.getIsSorted())"
              :aria-label="`Sort by ${column.columnDef.header}`"
              color="neutral"
              variant="ghost"
              size="xs"
              class="
                -ms-1.5 h-7 px-1.5 text-[13px] font-medium tracking-[0.05em]
                uppercase
              "
              :class="column.getIsSorted() ? 'text-highlighted' : 'text-muted'"
              :ui="{ trailingIcon: column.getIsSorted() ? 'size-3.5' : 'size-3.5 opacity-45' }"
              @click="column.toggleSorting(column.getIsSorted() === 'asc')"
            />
          </template>

          <template #name-cell="{ row }">
            <UButton
              v-if="row.original.group"
              color="neutral"
              variant="ghost"
              :aria-expanded="!row.original.group.collapsed"
              class="
                h-8 w-full justify-start gap-2.5 px-1.5 text-highlighted
                hover:bg-transparent
              "
              @click="toggleGroup(row.original.group.key)"
            >
              <UIcon
                name="i-lucide-chevron-down"
                class="
                  size-4 text-dimmed transition-transform
                  motion-reduce:transition-none
                "
                :class="row.original.group.collapsed && '-rotate-90'"
              />
              <span
                aria-hidden="true"
                class="size-2 rounded-xs"
                :class="groupDot(row.original.group.key)"
              />
              <span class="text-[13px] font-semibold tracking-[0.06em] uppercase">
                {{ row.original.group.label }}
              </span>
              <span class="text-[13px] font-medium text-dimmed">
                · {{ row.original.group.teams.length.toLocaleString('en-US') }}
              </span>
            </UButton>
            <span
              v-else
              class="text-base font-semibold text-highlighted"
            >{{ row.original.name }}</span>
          </template>

          <template #conference-cell="{ row }">
            {{ row.original.conference || '—' }}
          </template>

          <template #major-cell="{ row }">
            <MajorLevel
              v-if="row.original.major"
              :level="row.original.major"
            />
            <template v-else>
              —
            </template>
          </template>

          <template #location-cell="{ row }">
            {{ row.original.location || '—' }}
          </template>

          <template #coach-cell="{ row }">
            <span :class="row.original.coach && 'text-default'">
              {{ row.original.coach || '—' }}
            </span>
          </template>

          <template #loading>
            <div class="divide-y divide-default">
              <div
                v-for="i in 8"
                :key="i"
                class="grid h-14 grid-cols-[32%_18%_15%_19%_16%] items-center pe-5"
              >
                <span class="flex h-full items-center border-s-4 border-(--surface-muted) ps-5">
                  <USkeleton class="h-3.5 w-3/5" />
                </span>
                <USkeleton class="ms-2 h-3 w-2/3" />
                <USkeleton class="ms-2 h-6 w-24 rounded-full" />
                <USkeleton class="ms-2 h-3 w-3/5" />
                <USkeleton class="ms-2 h-3 w-1/2" />
              </div>
            </div>
          </template>

          <template #empty>
            <UEmpty
              v-if="error"
              variant="naked"
              icon="i-lucide-cloud-off"
              title="Couldn't load teams"
              description="The spreadsheet didn't respond. Check your connection and try again."
              :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', size: 'lg', loading: status === 'pending', onClick: () => refresh() }]"
              class="pt-18 pb-20"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-search-x"
              :title="emptyTitle"
              description="Try a different spelling, or loosen your filters. Search covers college, conference, city, coach and notes."
              :actions="hasFilters || query ? [{ label: 'Clear filters', color: 'neutral', variant: 'outline', size: 'lg', onClick: clearAll }] : []"
              class="pt-18 pb-20"
            />
          </template>
        </UTable>
      </div>

      <!-- Mobile: cards -->
      <div class="flex flex-col gap-2 sm:hidden">
        <template v-if="loading">
          <UCard
            v-for="i in 6"
            :key="i"
            variant="outline"
            class="border-s-4 border-(--surface-muted)"
            :ui="{ body: 'flex flex-col gap-2.5' }"
          >
            <div class="flex justify-between">
              <USkeleton class="h-3.5 w-2/5" />
              <USkeleton class="h-5.5 w-20 rounded-full" />
            </div>
            <USkeleton class="h-3 w-3/5" />
            <USkeleton class="h-3 w-1/2" />
          </UCard>
        </template>

        <UCard
          v-else-if="!tableData.length"
          variant="outline"
        >
          <UEmpty
            v-if="error"
            variant="naked"
            title="Couldn't load teams"
            description="The spreadsheet didn't respond. Check your connection and try again."
            :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', size: 'xl', loading: status === 'pending', onClick: () => refresh() }]"
          />
          <UEmpty
            v-else
            variant="naked"
            :title="emptyTitle"
            description="Try a different spelling, or loosen your filters."
            :actions="hasFilters || query ? [{ label: 'Clear filters', color: 'neutral', variant: 'outline', size: 'xl', onClick: clearAll }] : []"
          />
        </UCard>

        <template
          v-for="team in tableData"
          v-else
          :key="team.id"
        >
          <UButton
            v-if="team.group"
            color="neutral"
            variant="ghost"
            :aria-expanded="!team.group.collapsed"
            class="
              sticky top-0 z-10 -mx-4 h-11 justify-start gap-2.5 rounded-none
              border-b border-default bg-(--bg) px-4 text-highlighted
              not-first:mt-2
              hover:bg-(--bg)
            "
            @click="toggleGroup(team.group.key)"
          >
            <span
              aria-hidden="true"
              class="size-2 rounded-xs"
              :class="groupDot(team.group.key)"
            />
            <span class="text-[13px] font-semibold tracking-[0.06em] uppercase">
              {{ team.group.label }}
            </span>
            <span class="flex-1 text-start text-[13px] font-medium text-dimmed">
              · {{ team.group.teams.length.toLocaleString('en-US') }}
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="
                size-4 text-dimmed transition-transform
                motion-reduce:transition-none
              "
              :class="team.group.collapsed && '-rotate-90'"
            />
          </UButton>

          <UCard
            v-else
            as="button"
            type="button"
            variant="outline"
            aria-haspopup="dialog"
            class="
            w-full text-start
            active:bg-elevated/50
          "
            :class="team.major && MAJOR_STYLES[team.major].edge"
            :ui="{ body: 'flex flex-col gap-1 py-3.5 ps-5 pe-3.5' }"
            @click="openTeam(team)"
          >
            <span class="flex items-center justify-between gap-3">
              <span class="truncate text-base font-semibold">{{ team.name }}</span>
              <MajorLevel
                v-if="team.major"
                :level="team.major"
                class="shrink-0"
              />
            </span>
            <span class="text-[15px] text-muted">
              {{ [team.conference, team.location].filter(Boolean).join(' · ') || '—' }}
            </span>
            <span
              v-if="team.coach"
              class="text-[15px]"
            >
              {{ team.coach }}
            </span>
          </UCard>
        </template>
      </div>

      <nav
        v-if="ordered.length"
        aria-label="Results pages"
        class="
          mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3
          text-[13px] text-muted
        "
      >
        <span>{{ rangeLabel }}</span>

        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label class="flex items-center gap-2">
            Rows per page
            <USelect
              v-model="pageSize"
              :items="PAGE_SIZES"
              size="sm"
              class="w-20"
            />
          </label>

          <UPagination
            v-if="pageCount > 1"
            :page="page"
            :total="ordered.length"
            :items-per-page="pageSize"
            :sibling-count="1"
            show-edges
            size="sm"
            @update:page="goToPage"
          />
        </div>
      </nav>

      <div
        class="
          mt-4 hidden flex-wrap gap-4 text-[13px] text-dimmed
          sm:flex
        "
      >
        <span class="flex items-center gap-1.5"><UKbd value="/" /> Search</span>
        <span class="flex items-center gap-1.5"><UKbd value="↑" /><UKbd value="↓" /> Move</span>
        <span class="flex items-center gap-1.5"><UKbd value="Enter" /> Open</span>
        <span class="flex items-center gap-1.5"><UKbd value="Esc" /> Close</span>
      </div>

      <p class="mt-6 text-[13px] text-dimmed">
        Data from Google Sheets. Updates automatically every 5 minutes, or use Refresh to load changes now.
      </p>
    </UContainer>

    <TeamDrawer
      v-model:open="detailsOpen"
      :team="selectedTeam"
      :position="selectedPosition"
      :has-prev="selectedIndex > 0"
      :has-next="selectedIndex >= 0 && selectedIndex < ordered.length - 1"
      @prev="step(-1)"
      @next="step(1)"
    />

    <!-- Mobile filter sheet -->
    <UDrawer
      v-model:open="sheetOpen"
      title="Filters"
      :ui="{
        content: 'max-h-[88dvh] rounded-t-2xl',
        container: 'min-h-0 gap-0 overflow-hidden p-0',
        header: 'py-1 ps-4 pe-2',
        title: 'text-lg font-[650]',
        body: 'flex min-h-0 flex-col gap-6 overflow-y-auto px-4 pt-1 pb-5',
        footer: 'border-t border-default p-4 pt-3'
      }"
    >
      <template #actions>
        <UButton
          label="Clear all"
          color="neutral"
          variant="link"
          size="lg"
          class="h-11 text-muted underline underline-offset-3"
          @click="clearFilters"
        />
      </template>

      <template #body>
        <fieldset class="flex flex-col gap-2.5">
          <legend class="mb-2.5 text-[13px] font-semibold tracking-[0.06em] text-dimmed uppercase">
            Major
          </legend>
          <div class="grid grid-cols-2 gap-2">
            <UButton
              v-for="item in majorItems"
              :key="item.value"
              :label="item.label"
              :aria-pressed="major === item.value"
              color="neutral"
              variant="outline"
              size="lg"
              class="h-11"
              :class="major === item.value && 'bg-elevated ring-inverted'"
              @click="major = item.value"
            >
              <template
                v-if="item.dot"
                #leading
              >
                <span
                  aria-hidden="true"
                  class="size-2 rounded-full"
                  :class="item.dot"
                />
              </template>
            </UButton>
          </div>
        </fieldset>

        <fieldset
          v-for="group in sheetGroups"
          :key="group.label"
        >
          <legend class="mb-2.5 text-[13px] font-semibold tracking-[0.06em] text-dimmed uppercase">
            {{ group.label }}
          </legend>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="item in group.items"
              :key="item.value"
              :label="item.label"
              :aria-pressed="group.selected.includes(item.value)"
              color="neutral"
              :variant="group.selected.includes(item.value) ? 'solid' : 'outline'"
              class="h-10 rounded-full px-3.5 text-sm"
              @click="group.toggle(item.value)"
            />
          </div>
        </fieldset>
      </template>

      <template #footer>
        <UButton
          :label="`Show ${filtered.length.toLocaleString('en-US')} ${countLabel}`"
          size="xl"
          block
          class="h-12 text-base"
          @click="sheetOpen = false"
        />
      </template>
    </UDrawer>
  </div>
</template>
