<template>
  <div class="app-main" :class="{ 'show-tag-view': settings.showTagsView }">
    <router-view v-slot="{ Component }">
      <!--has transition  setting by settings.mainNeedAnimation-->
      <transition v-if="settings.mainNeedAnimation" name="fade-transform" mode="out-in">
        <keep-alive :include="cachedViews">
          <component :is="Component" :key="key" />
        </keep-alive>
      </transition>
      <!-- no transition -->
      <keep-alive v-else :include="cachedViews">
        <component :is="Component" :key="key" />
      </keep-alive>
    </router-view>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia/dist/pinia'
import { useRoute } from 'vue-router'

import { useBasicStore } from '@/store/basic'
import { cloneDeep } from '@/hooks/use-common'
const { settings, cachedViews } = storeToRefs(useBasicStore())
const route = useRoute()
const key = computed(() => route.path)
/*listen the component name changing, then to keep-alive the page*/
// cachePage: is true, keep-alive this Page
// leaveRmCachePage: is true, keep-alive remote when page leave
let oldRoute = {}
let cacheGroup = []
let deepOldRouter = null
const basicStore = useBasicStore()
const removeDeepChildren = (deepOldRouter) => {
  deepOldRouter.children?.forEach((fItem) => {
    basicStore.delCacheViewDeep(fItem.name)
  })
}
watch(
  () => route.name,
  () => {
    const routerLevel = route.matched.length
    //缓存组处理
    //first judge cacheGroup and then  remove
    if (cacheGroup.length) {
      if (!cacheGroup.includes(route.name)) {
        cacheGroup.forEach((item) => {
          basicStore.delCachedView(item)
        })
      }
    }
    //and then cache the current router config page
    if (route.meta?.cacheGroup) {
      cacheGroup = route.meta?.cacheGroup || []
      cacheGroup.forEach((fItem) => {
        basicStore.addCachedView(fItem)
      })
    }

    //二级路由处理
    if (routerLevel === 2) {
      if (deepOldRouter?.name) {
        if (deepOldRouter.meta?.leaveRmCachePage && deepOldRouter.meta?.cachePage) {
          basicStore.delCachedView(deepOldRouter.name)
          //remove the deepOldRouter‘s children component
          removeDeepChildren(deepOldRouter)
        }
      } else {
        if (oldRoute?.name) {
          if (oldRoute.meta?.leaveRmCachePage && oldRoute.meta?.cachePage) {
            basicStore.delCachedView(oldRoute.name)
          }
        }
      }

      if (route.name) {
        if (route.meta?.cachePage) {
          basicStore.addCachedView(route.name)
        }
      }
      deepOldRouter = null
    }

    //三级路由处理
    if (routerLevel === 3) {
      //三级时存储当前路由对象的上一级
      const parentRoute = route.matched[1]
      //deepOldRouter不为空，且deepOldRouter不是当前路由的父对象，则需要清除deepOldRouter缓存
      //一般为三级路由跳转三级路由的情况
      if (deepOldRouter?.name && deepOldRouter.name !== parentRoute.name) {
        if (deepOldRouter.meta?.leaveRmCachePage && deepOldRouter.meta?.cachePage) {
          basicStore.delCachedView(deepOldRouter.name)
          //remove the deepOldRouter‘s children component
          removeDeepChildren(deepOldRouter)
        }
      } else {
        //否则走正常两级路由处理流程
        if (oldRoute?.name) {
          if (oldRoute.meta?.leaveRmCachePage && oldRoute.meta?.cachePage) {
            basicStore.delCacheViewDeep(oldRoute.name)
          }
        }
      }
      //取的是第二级的name
      if (parentRoute.name && parentRoute.meta?.cachePage) {
        deepOldRouter = parentRoute
        basicStore.addCachedView(deepOldRouter.name)
        if (route.name) {
          if (route.meta?.cachePage) {
            //和第三级的name进行缓存
            basicStore.addCachedViewDeep(route.name)
          }
        }
      }
    }
    oldRoute = cloneDeep({ name: route.name, meta: route.meta })
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.app-main {
  padding: var(--app-main-padding);
  /*50 = navbar  */
  position: relative;
  overflow: hidden;
  background-color: var(--app-main-background);
}
.show-tag-view {
  height: calc(100vh - #{var(--nav-bar-height)} - #{var(--tag-view-height)}) !important;
}
.fixed-header + .app-main {
  padding-top: 50px;
}
</style>
