<script setup lang="ts">
import type { Team } from '#shared/types/team'

defineProps<{
  team?: Team
  /** e.g. "3 of 42", the team's place in the current results */
  position?: string
  hasPrev?: boolean
  hasNext?: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="team?.name"
    :description="team?.conference ? `${team.conference} · ${team.location}` : team?.location"
    :ui="{ content: 'w-full max-w-none shadow-(--shadow) sm:max-w-[480px]' }"
  >
    <template #content="{ close }">
      <div
        class="
          flex h-14 shrink-0 items-center justify-between border-b border-default
          ps-6 pe-3
        "
      >
        <span class="text-[13px] text-dimmed">{{ position }}</span>

        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-chevron-up"
            color="neutral"
            variant="ghost"
            aria-label="Previous team"
            class="size-11 justify-center rounded-lg text-muted sm:size-9"
            :disabled="!hasPrev"
            @click="emit('prev')"
          />
          <UButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            aria-label="Next team"
            class="size-11 justify-center rounded-lg text-muted sm:size-9"
            :disabled="!hasNext"
            @click="emit('next')"
          />
          <USeparator
            orientation="vertical"
            class="mx-1 h-5"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            aria-label="Close"
            class="size-11 justify-center rounded-lg text-muted sm:size-9"
            @click="close"
          />
        </div>
      </div>

      <div
        v-if="team"
        class="flex-1 overflow-y-auto px-5 pt-6 pb-10 sm:px-8 sm:pt-7"
      >
        <MajorLevel
          v-if="team.major"
          :level="team.major"
        />
        <h2
          class="
            text-[28px] leading-[1.15] font-[650] tracking-[-0.01em] text-balance
          "
          :class="team.major && 'mt-3.5'"
        >
          {{ team.name }}
        </h2>

        <dl class="mt-7 grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 gap-y-3.5 text-[15px]">
          <dt class="text-dimmed">
            Conference
          </dt>
          <dd :class="!team.conference && 'text-muted'">
            {{ team.conference || 'Not listed' }}
          </dd>

          <dt class="text-dimmed">
            Location
          </dt>
          <dd :class="!team.location && 'text-muted'">
            <template v-if="team.location">
              {{ team.location }}
              <span
                v-if="team.state && US_STATES[team.state]"
                class="text-muted"
              >· {{ US_STATES[team.state] }}</span>
            </template>
            <template v-else>
              Not listed
            </template>
          </dd>

          <dt class="text-dimmed">
            Coach
          </dt>
          <dd :class="team.coach ? 'font-semibold' : 'text-muted'">
            {{ team.coach || 'Not listed' }}
          </dd>

          <dt class="text-dimmed">
            Major
          </dt>
          <dd :class="!team.major && 'text-muted'">
            {{ team.major ? MAJOR_LABELS[team.major] : 'Not listed' }}
          </dd>
        </dl>

        <section class="mt-7 border-t border-default pt-6">
          <h3 class="mb-3 text-[13px] font-semibold tracking-[0.06em] text-dimmed uppercase">
            Notes
          </h3>
          <div
            class="max-w-[65ch] text-base/[1.6] text-pretty whitespace-pre-line"
            :class="!team.notes && 'text-muted'"
            v-html="team.notes || 'No notes yet.'"
          />
        </section>
      </div>

      <div
        class="
          hidden h-12 shrink-0 items-center gap-4 border-t border-default px-6
          text-[13px] text-dimmed
          sm:flex
        "
      >
        <span class="flex items-center gap-1.5">
          <UKbd value="↑" />
          <UKbd value="↓" />
          Previous / next
        </span>
        <span class="flex items-center gap-1.5">
          <UKbd value="Esc" />
          Close
        </span>
      </div>
    </template>
  </USlideover>
</template>
