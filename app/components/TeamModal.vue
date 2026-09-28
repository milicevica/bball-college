<script setup lang="ts">
import type { Team } from '#shared/types/team'

defineProps<{
  team?: Team
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <UModal
    v-model:open="open"
    :title="team?.name"
    :description="team?.conference ? `${team.conference} · ${team.location}` : team?.location"
    :ui="{
      content: 'rounded-xl bg-(--surface) shadow-(--shadow-lg) divide-(--border)',
      header: 'min-h-0 items-start px-6 pt-6 pb-5',
      title: 'font-display text-[32px] leading-9 font-extrabold',
      description: 'mt-1 text-[15px] text-muted',
      close: 'top-5 end-5',
      body: 'p-6'
    }"
  >
    <template #body>
      <dl
        v-if="team"
        class="grid gap-x-6 gap-y-5 sm:grid-cols-2"
      >
        <div>
          <dt class="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Conference
          </dt>
          <dd class="mt-1.5">
            <span
              v-if="team.conference"
              class="
                inline-flex h-5.5 items-center rounded-sm bg-(--primary-soft) px-2
                text-xs font-semibold tracking-[0.02em]
              "
            >
              {{ team.conference }}
            </span>
            <span
              v-else
              class="text-muted"
            >—</span>
          </dd>
        </div>

        <div>
          <dt class="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Location
          </dt>
          <dd class="mt-1.5 text-[15px] leading-6">
            <template v-if="team.location">
              {{ team.location }}
              <span
                v-if="team.state && US_STATES[team.state]"
                class="text-muted"
              >· {{ US_STATES[team.state] }}</span>
            </template>
            <span
              v-else
              class="text-muted"
            >—</span>
          </dd>
        </div>

        <div class="sm:col-span-2">
          <dt class="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Coach
          </dt>
          <dd
            class="mt-1.5 text-[15px] leading-6"
            :class="!team.coach && 'text-muted'"
          >
            {{ team.coach || 'Not listed' }}
          </dd>
        </div>

        <div class="border-t border-(--border) pt-5 sm:col-span-2">
          <dt class="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Notes
          </dt>
          <dd
            v-html="team.notes || 'No notes yet.'"
            class="mt-1.5 text-[15px] leading-6 whitespace-pre-line"
            :class="!team.notes && 'text-muted'"
          />
        </div>
      </dl>
    </template>
  </UModal>
</template>
