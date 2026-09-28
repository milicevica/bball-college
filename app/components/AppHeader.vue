<template>
  <header class="bg-(--inverse) text-(--on-inverse)">
    <UContainer class="flex h-14 items-center justify-between">
      <NuxtLink
        to="/"
        class="
          rounded-sm font-display text-2xl leading-none font-extrabold
          tracking-[0.01em]
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-(--on-inverse)
        "
      >
        <span class="text-(--inverse-accent)">Koledzi</span>
      </NuxtLink>

      <UColorModeButton
        color="neutral"
        variant="ghost"
        class="
          text-(--on-inverse) opacity-80
          hover:bg-transparent hover:opacity-100
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-(--on-inverse)
        "
      />
    </UContainer>
  </header>
</template>
