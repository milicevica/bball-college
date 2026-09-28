export default defineAppConfig({
  ui: {
    colors: {
      primary: 'zinc',
      neutral: 'zinc'
    },
    // radius-lg (10px) for controls; Nuxt UI's rounded-md is 7.5px
    button: {
      slots: {
        base: 'rounded-lg'
      }
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
