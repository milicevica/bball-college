<script setup lang="ts">
defineProps<{
  level: Major
}>()
</script>

<template>
  <UBadge
    :label="MAJOR_LABELS[level]"
    color="neutral"
    variant="soft"
    size="lg"
    class="h-6 gap-1.5 rounded-full px-2.5 text-[13px] font-medium"
    :class="MAJOR_STYLES[level].pill"
  >
    <template #leading>
      <span
        aria-hidden="true"
        class="size-1.5 rounded-full"
        :class="MAJOR_STYLES[level].dot"
      />
    </template>
  </UBadge>
</template>
