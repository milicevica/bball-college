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

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
    const age = now.value - Date.parse(data.value.updatedAt)
    if (age >= AUTO_REFRESH_INTERVAL && document.visibilityState === 'visible' && !refreshing.value) {
      refresh()
    }
  }, 30_000)
})

onBeforeUnmount(() => clearInterval(ticker))

const updatedLabel = computed(() => {
  if (!data.value.updatedAt) return ''
  const minutes = Math.floor((now.value - Date.parse(data.value.updatedAt)) / 60_000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  return `Updated ${Math.floor(minutes / 60)} h ago`
})

const query = ref('')
const conference = ref(ALL)
const state = ref(ALL)
const sorting = ref([{ id: 'name', desc: false }])

const searchInput = useTemplateRef('searchInput')

defineShortcuts({
  '/': () => searchInput.value?.inputRef?.focus()
})

function uniqueSorted(values: (string | undefined)[]) {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b))
}

const conferenceItems = computed(() => [
  { label: 'All conferences', value: ALL },
  ...uniqueSorted(teams.value.map(t => t.conference)).map(c => ({ label: c, value: c }))
])

const stateItems = computed(() => [
  { label: 'All states', value: ALL },
  ...uniqueSorted(teams.value.map(t => t.state))
    .map(s => ({ label: US_STATES[s] ?? s, value: s }))
    .sort((a, b) => a.label.localeCompare(b.label))
])

const hasFilters = computed(() => conference.value !== ALL || state.value !== ALL)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()

  return teams.value.filter((t) => {
    if (conference.value !== ALL && t.conference !== conference.value) return false
    if (state.value !== ALL && t.state !== state.value) return false
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
    return x.localeCompare(y, 'en', { sensitivity: 'base', numeric: true }) * direction
  })
})

const PAGE_SIZES = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: 'All', value: 0 }
]

const pageSize = ref(25)
const page = ref(1)

const pageCount = computed(() =>
  pageSize.value ? Math.max(1, Math.ceil(sorted.value.length / pageSize.value)) : 1
)

const paged = computed(() => {
  if (!pageSize.value) return sorted.value
  const start = (page.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})

const rangeLabel = computed(() => {
  const total = sorted.value.length
  if (!total) return ''
  const start = pageSize.value ? (page.value - 1) * pageSize.value + 1 : 1
  const end = start + paged.value.length - 1
  return `Showing ${start.toLocaleString('en-US')}–${end.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} teams`
})

// A new search, filter, sort or page size starts again from page 1
watch([query, conference, state, sorting, pageSize], () => {
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
  if (resultsTop.value && resultsTop.value.getBoundingClientRect().top < 0) {
    resultsTop.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const resultsLabel = computed(() => {
  const n = filtered.value.length
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'team' : 'teams'}`
})

const contextLabel = computed(() => {
  const parts: string[] = []
  if (query.value.trim()) parts.push(`matching “${query.value.trim()}”`)
  if (conference.value !== ALL) parts.push(`in the ${conference.value}`)
  if (state.value !== ALL) parts.push(`in ${US_STATES[state.value] ?? state.value}`)
  return parts.join(' ')
})

function clearFilters() {
  conference.value = ALL
  state.value = ALL
}

function clearAll() {
  query.value = ''
  clearFilters()
}

const columns: TableColumn<Team>[] = [
  { accessorKey: 'name', header: 'College' },
  { accessorKey: 'conference', header: 'Conference' },
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'coach', header: 'Coach' }
]

// The team shown in the details modal; kept after closing so the modal doesn't empty mid-animation
const selectedTeam = ref<Team>()
const detailsOpen = ref(false)

function openTeam(team: Team) {
  selectedTeam.value = team
  detailsOpen.value = true
}

const SORTABLE = ['name', 'conference', 'location', 'coach']

function sortIcon(sorted: false | 'asc' | 'desc') {
  if (sorted === 'asc') return 'i-lucide-arrow-up'
  if (sorted === 'desc') return 'i-lucide-arrow-down'
  return 'i-lucide-chevrons-up-down'
}
</script>

<template>
  <div>
    <!-- Search hero -->
    <section class="border-b border-default">
      <UContainer class="py-12 sm:py-16">
        <div class="max-w-3xl">
          <UInput
            ref="searchInput"
            v-model="query"
            enterkeyhint="search"
            size="xl"
            icon="i-lucide-search"
            placeholder="Search by college, coach or city"
            aria-label="Search teams"
            class="w-full"
            :ui="{ base: 'h-13 rounded-lg bg-(--surface) text-base shadow-(--shadow-sm)' }"
          >
            <template #trailing>
              <UButton
                v-if="query"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-x"
                aria-label="Clear search"
                @click="query = ''"
              />
              <UKbd
                v-else
                value="/"
                class="max-sm:hidden"
              />
            </template>
          </UInput>

          <div class="mt-4 flex flex-wrap items-end gap-3">
            <UFormField
              label="Conference"
              :ui="{ label: 'text-xs font-semibold tracking-[0.08em] text-muted uppercase' }"
            >
              <USelect
                v-model="conference"
                :items="conferenceItems"
                class="w-48 rounded-lg bg-(--surface)"
                :ui="{ base: 'h-10' }"
              />
            </UFormField>

            <UFormField
              label="State"
              :ui="{ label: 'text-xs font-semibold tracking-[0.08em] text-muted uppercase' }"
            >
              <USelectMenu
                v-model="state"
                :items="stateItems"
                value-key="value"
                :search-input="{ placeholder: 'Find a state…' }"
                class="w-48 rounded-lg bg-(--surface)"
                :ui="{ base: 'h-10' }"
              />
            </UFormField>

            <UButton
              v-if="hasFilters"
              label="Clear filters"
              color="neutral"
              variant="link"
              class="
                mb-2 text-(--primary-text) underline underline-offset-3
                hover:text-(--primary-text)
              "
              @click="clearFilters"
            />
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Results -->
    <UContainer class="py-8 sm:py-12">
      <div
        ref="resultsTop"
        class="mb-4 flex scroll-mt-4 flex-wrap items-end justify-between gap-x-6 gap-y-3"
      >
        <div
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          aria-live="polite"
        >
          <h2 class="font-display text-[44px] leading-11 font-extrabold">
            {{ error ? 'Teams' : resultsLabel }}
          </h2>
          <p
            v-if="contextLabel && !error"
            class="text-[15px] text-muted"
          >
            {{ contextLabel }}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <ClientOnly>
            <span
              v-if="updatedLabel && !error"
              class="text-[13px] text-muted"
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
            class="bg-(--surface)"
            :loading="refreshing"
            :disabled="refreshing"
            @click="refreshNow"
          />
        </div>
      </div>

      <UTable
        v-model:sorting="sorting"
        :data="paged"
        :columns="columns"
        :sorting-options="{ manualSorting: true }"
        :loading="status === 'pending'"
        class="
          rounded-xl border border-default bg-(--surface) shadow-(--shadow-sm)
        "
        :ui="{
          thead: 'bg-(--surface-muted)',
          th: 'px-4 py-3 text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-muted uppercase',
          td: 'px-4 py-3 text-[13px] leading-5 text-default',
          tbody: '[&>tr]:transition-colors [&>tr:hover]:bg-(--bg)'
        }"
      >
        <template
          v-for="key in SORTABLE"
          :key="key"
          #[`${key}-header`]="{ column }"
        >
          <button
            type="button"
            class="
              -mx-1 inline-flex items-center gap-1 rounded-sm p-1 uppercase
              hover:text-default
              focus-visible:outline-2 focus-visible:outline-(--focus-ring)
            "
            :class="column.getIsSorted() && 'text-default'"
            :aria-label="`Sort by ${column.columnDef.header}`"
            @click="column.toggleSorting(column.getIsSorted() === 'asc')"
          >
            {{ column.columnDef.header }}
            <UIcon
              :name="sortIcon(column.getIsSorted())"
              class="size-4"
            />
          </button>
        </template>

        <template #name-cell="{ row }">
          <button
            type="button"
            aria-haspopup="dialog"
            class="
              -mx-1 rounded-sm px-1 text-left text-[15px] leading-5 font-semibold
              underline decoration-(--border-strong) underline-offset-4
              hover:decoration-current
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-(--focus-ring)
            "
            @click="openTeam(row.original)"
          >
            {{ row.original.name }}
          </button>
        </template>

        <template #conference-cell="{ row }">
          <span
            v-if="row.original.conference"
            class="
              inline-flex h-5.5 items-center rounded-sm bg-(--primary-soft) px-2
              text-xs font-semibold tracking-[0.02em] whitespace-nowrap
            "
          >
            {{ row.original.conference }}
          </span>
          <span
            v-else
            class="text-muted"
          >—</span>
        </template>

        <template #coach-cell="{ row }">
          <span :class="!row.original.coach && 'text-muted'">
            {{ row.original.coach || '—' }}
          </span>
        </template>

        <template #empty>
          <div class="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div
              class="
                mb-2 grid size-12 place-items-center rounded-full
                bg-(--surface-muted) text-muted
              "
            >
              <UIcon
                :name="error ? 'i-lucide-cloud-off' : 'i-lucide-search-x'"
                class="size-5"
              />
            </div>

            <template v-if="error">
              <p class="text-lg font-semibold text-default">
                Couldn't load teams
              </p>
              <p class="mb-3 max-w-[42ch] text-[15px] text-muted">
                The spreadsheet didn't respond. Check your connection and try again.
              </p>
              <UButton
                label="Try again"
                color="neutral"
                variant="outline"
                class="bg-(--surface)"
                :loading="status === 'pending'"
                @click="refresh()"
              />
            </template>

            <template v-else-if="status !== 'pending'">
              <p class="text-lg font-semibold text-default">
                No teams {{ contextLabel || 'found' }}
              </p>
              <p class="mb-3 max-w-[42ch] text-[15px] text-muted">
                Try a different spelling, or remove a filter to widen the search.
              </p>
              <UButton
                v-if="query || hasFilters"
                label="Clear search and filters"
                color="neutral"
                variant="outline"
                class="bg-(--surface)"
                @click="clearAll"
              />
            </template>
          </div>
        </template>
      </UTable>

      <nav
        v-if="sorted.length"
        aria-label="Results pages"
        class="
          mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3
          text-[13px] text-muted tabular-nums
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
              class="w-20 bg-(--surface)"
            />
          </label>

          <UPagination
            v-if="pageCount > 1"
            :page="page"
            :total="sorted.length"
            :items-per-page="pageSize"
            :sibling-count="1"
            show-edges
            size="sm"
            @update:page="goToPage"
          />
        </div>
      </nav>

      <p class="mt-6 text-[13px] text-muted">
        Data from Google Sheets. Updates automatically every 5 minutes, or use Refresh to load changes now.
      </p>
    </UContainer>

    <TeamModal
      v-model:open="detailsOpen"
      :team="selectedTeam"
    />
  </div>
</template>
