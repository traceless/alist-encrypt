import { defineStore } from 'pinia'
export const usePageStore = defineStore('page', {
  state: () => {
    return {
      folderInfo: { folderPath: '/test', outPath: '/test/out' }
    }
  },
  persist: {
    storage: localStorage,
    paths: ['folderInfo']
  },
  actions: {
    setFolderInfo({ folderPath, outPath }) {
      this.$patch((state) => {
        state.folderInfo = { folderPath, outPath }
      })
    }
  }
})
