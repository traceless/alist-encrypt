import { defineStore } from 'pinia'
import { langTitle } from '@/hooks/use-common'
import settings from '@/settings'
import { toggleHtmlClass } from '@/theme/utils'
import { i18n } from '@/lang'
import router from '@/router'
const { locale } = i18n.global
export const useConfigStore = defineStore('config', {
  state: () => {
    return {
      language: settings.defaultLanguage,
      theme: settings.defaultTheme,
      size: settings.defaultSize
    }
  },
  persist: {
    storage: localStorage,
    paths: ['language', 'theme', 'size']
  },
  actions: {
    setTheme(data) {
      this.theme = data
      toggleHtmlClass(data)
    },
    setSize(data) {
      this.size = data
    },
    setLanguage(lang) {
      this.language = lang
      locale.value = lang
      const route = router.currentRoute
      document.title = langTitle(route.value.meta?.title) // i18 page title
    }
  }
})
