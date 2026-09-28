// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Light by default instead of following the OS; the header toggle still switches and remembers the choice
  colorMode: {
    preference: 'light'
  },

  runtimeConfig: {
    // Set with NUXT_GOOGLE_SHEET_ID (see .env.example). The sheet must be shared as "Anyone with the link can view".
    // Reads are cached for 5 minutes in server/utils/teams.ts; the page itself is rendered per request.
    googleSheetId: ''
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
