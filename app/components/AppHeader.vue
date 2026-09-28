<template>
  <header>
    <UContainer class="flex h-14 items-center justify-between gap-4 sm:h-16">
      <NuxtLink
        to="/"
        class="
          rounded-sm text-xl font-[650] tracking-[-0.015em]
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-primary
          sm:text-[22px]
        "
      >
        Koledzi
      </NuxtLink>

      <UColorModeButton
        color="neutral"
        variant="outline"
        class="
          size-11 justify-center text-muted
          hover:text-default
          sm:size-9
        "
      />
    </UContainer>
  </header>
</template>
