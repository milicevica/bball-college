export default defineAppConfig({
  ui: {
    colors: {
      primary: 'gold',
      neutral: 'sand'
    },
    // radius-md (8px) for controls; Nuxt UI's rounded-md is 6px
    button: {
      slots: {
        base: 'rounded-lg'
      },
      compoundVariants: [{
        // White on gold is 2.4:1 — use on-primary (near-black) instead
        color: 'primary',
        variant: 'solid',
        class: 'text-(--on-primary) hover:bg-(--primary-hover) active:bg-(--primary-hover)'
      }]
    },
    input: {
      slots: {
        base: 'rounded-lg'
      }
    },
    select: {
      slots: {
        base: 'rounded-lg'
      }
    },
    selectMenu: {
      slots: {
        base: 'rounded-lg'
      }
    }
  }
})
