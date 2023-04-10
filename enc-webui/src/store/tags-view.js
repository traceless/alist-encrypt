import { defineStore } from 'pinia'
import setting from '@/settings'
export const useTagsViewStore = defineStore('tagsView', {
  state: () => {
    return {
      visitedViews: [] //tag标签数组
    }
  },
  actions: {
    addVisitedView(view) {
      this.$patch((state) => {
        //判断添加的标签存在直接返回
        if (state.visitedViews.some((v) => v.path === view.path)) return
        //添加的数量如果大于 setting.tagsViewNum,则替换最后一个元素，否则在visitedViews数组后插入一个元素
        if (state.visitedViews.length >= setting.tagsViewNum) {
          state.visitedViews.pop()
          state.visitedViews.push(
            Object.assign({}, view, {
              title: view.meta.title || 'no-name'
            })
          )
        } else {
          state.visitedViews.push(
            Object.assign({}, view, {
              title: view.meta.title || 'no-name'
            })
          )
        }
      })
    },
    delVisitedView(view) {
      return new Promise((resolve) => {
        this.$patch((state) => {
          //匹配view.path元素将其删除
          for (const [i, v] of state.visitedViews.entries()) {
            if (v.path === view.path) {
              state.visitedViews.splice(i, 1)
              break
            }
          }
          resolve([...state.visitedViews])
        })
      })
    },
    delOthersVisitedViews(view) {
      return new Promise((resolve) => {
        this.$patch((state) => {
          state.visitedViews = state.visitedViews.filter((v) => {
            return v.meta.affix || v.path === view.path
          })
          resolve([...state.visitedViews])
        })
      })
    },
    delAllVisitedViews() {
      return new Promise((resolve) => {
        this.$patch((state) => {
          // keep affix tags
          state.visitedViews = state.visitedViews.filter((tag) => tag.meta?.affix)
          resolve([...state.visitedViews])
        })
      })
    }
  }
})
