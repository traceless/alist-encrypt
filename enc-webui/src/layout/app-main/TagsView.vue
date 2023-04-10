<template>
  <div id="tags-view-container" class="tags-view-container">
    <div class="tags-view-wrapper">
      <router-link
        v-for="tag in visitedViews"
        ref="refTag"
        :key="tag.path"
        v-slot="{ navigate }"
        :to="{ path: tag.path, query: tag.query, fullPath: tag.fullPath }"
        custom
      >
        <div
          class="tags-view-item"
          :class="isActive(tag) ? 'active' : ''"
          @click.middle="!isAffix(tag) ? closeSelectedTag(tag) : ''"
          @contextmenu.prevent="openMenu(tag, $event)"
          @click="navigate"
        >
          {{ langTitle(tag.title) }}
          <Close v-if="!isAffix(tag)" class="el-icon-close" @click.prevent.stop="closeSelectedTag(tag)" />
        </div>
      </router-link>
    </div>
    <ul v-show="visible" :style="{ left: left + 'px', top: top + 'px' }" class="contextmenu">
      <li @click="refreshSelectedTag(selectedTag)">{{ langTitle('Refresh') }}</li>
      <li v-if="!isAffix(selectedTag)" @click="closeSelectedTag(selectedTag)">{{ langTitle('Close') }}</li>
      <li @click="closeOthersTags">{{ langTitle('Close Others') }}</li>
      <li @click="closeAllTags(selectedTag)">{{ langTitle('Close All') }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, reactive, toRefs, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { resolve } from 'path-browserify'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia/dist/pinia'
import type { RouterTypes } from '~/basic'
import { useBasicStore } from '@/store/basic'
import { useTagsViewStore } from '@/store/tags-view'
import { langTitle } from '@/hooks/use-common'
const route = useRoute()
const router = useRouter()
const state = reactive({
  visible: false,
  top: 0,
  left: 0,
  selectedTag: {},
  affixTags: [] as RouterTypes
})

const { visitedViews } = storeToRefs(useTagsViewStore())

watch(
  () => route.path,
  () => {
    addTags()
  }
)

watch(
  () => state.visible,
  (value) => {
    if (value) {
      document.body.addEventListener('click', closeMenu)
    } else {
      document.body.removeEventListener('click', closeMenu)
    }
  }
)
onMounted(() => {
  initTags()
  addTags()
})

//判断当前点击的item项，是不是当前显示的路由项，如果是则高亮
const isActive = (param) => {
  return route.path === param.path
}
//当路由设置meta.affix=true,关闭按钮消失
const isAffix = (tag) => {
  return tag.meta && tag.meta.affix
}

const filterAffixTags = (routes, basePath = '/') => {
  let tags: RouterTypes = []
  routes.forEach((route) => {
    if (route.meta && route.meta.affix) {
      const tagPath = resolve(basePath, route.path)
      tags.push({
        fullPath: tagPath,
        path: tagPath,
        name: route.name,
        meta: { ...route.meta }
      })
    }
    if (route.children) {
      const tempTags = filterAffixTags(route.children, route.path)
      if (tempTags.length >= 1) {
        tags = [...tags, ...tempTags]
      }
    }
  })
  return tags
}

//初始
const tagsViewStore = useTagsViewStore()
const { allRoutes } = useBasicStore()
const initTags = () => {
  //过滤affix=true的tags数组并赋值给state.affixTags，挂载到页面上
  const affixTags = (state.affixTags = filterAffixTags(allRoutes))
  for (const tag of affixTags) {
    // Must have tag name
    if (tag.name) {
      tagsViewStore.addVisitedView(tag)
    }
  }
}
const addTags = () => {
  if (route?.name) {
    tagsViewStore.addVisitedView(route)
  }
  return false
}

/*右键菜单部分*/
const vm = getCurrentInstance()?.proxy
//右键打开菜单
const openMenu = (tag, e) => {
  const menuMinWidth = 105
  const offsetLeft = vm?.$el.getBoundingClientRect().left // container margin left
  const offsetWidth = vm?.$el.offsetWidth // container width
  const maxLeft = offsetWidth - menuMinWidth // left boundary
  const left = e.clientX - offsetLeft + 15 // 15: margin right

  if (left > maxLeft) {
    state.left = maxLeft
  } else {
    state.left = left
  }
  state.top = e.clientY
  state.visible = true
  state.selectedTag = tag
}

const basicStore = useBasicStore()

//关闭当前标签
const closeSelectedTag = (view) => {
  tagsViewStore.delVisitedView(view).then((visitedViews) => {
    if (isActive(view)) {
      toLastView(visitedViews, view)
    }
    //remove keep-alive by the closeTabRmCache
    if (view.meta?.closeTabRmCache) {
      const routerLevel = view.matched.length
      if (routerLevel === 2) {
        basicStore.delCachedView(view.name)
      }
      if (routerLevel === 3) {
        basicStore.setCacheViewDeep(view.name)
      }
    }
  })
}

//刷新标签
const refreshSelectedTag = (view) => {
  const { fullPath } = view
  nextTick(() => {
    router.replace({
      path: `/redirect${fullPath}`
    })
  })
}

//右键关闭菜单
const closeMenu = () => {
  state.visible = false
}
//关闭其他标签
const closeOthersTags = () => {
  router.push(state.selectedTag)
  tagsViewStore.delOthersVisitedViews(state.selectedTag)
}
//关闭所有标签
const closeAllTags = (view) => {
  tagsViewStore.delAllVisitedViews().then((visitedViews) => {
    if (state.affixTags.some((tag) => tag.path === view.path)) {
      return
    }
    toLastView(visitedViews, view)
  })
}
//跳转最后一个标签
const toLastView = (visitedViews, view) => {
  //visitedViews.at(-1)获取数组最后一个元素
  const latestView = visitedViews.at(-1)
  if (latestView) {
    router.push(latestView.fullPath)
  } else {
    if (view.name === 'Dashboard') {
      // to reload home page
      router.replace({ path: `/redirect${view.fullPath}` })
    } else {
      router.push('/')
    }
  }
}

//export to page use
const { visible, top, left, selectedTag } = toRefs(state)
</script>

<style lang="scss" scoped>
.tags-view-container {
  height: var(--tag-view-height);
  width: 100%;
  background: var(--tags-view-background);
  border-bottom: 1px solid var(--tags-view-border-bottom);
  box-shadow: var(--tags-view-box-shadow);
  .tags-view-wrapper {
    .tags-view-item {
      display: inline-block;
      position: relative;
      cursor: pointer;
      height: 27px;
      line-height: 26px;
      border: 1px solid var(--tags-view-item-border-color);
      color: var(--tags-view-item-color);
      background: var(--tags-view-item-background);
      padding: 0 8px;
      font-size: 12px;
      margin-left: 5px;
      margin-top: 3px;
      &:first-of-type {
        margin-left: 10px;
      }
      &:last-of-type {
        margin-right: 15px;
      }
      &.active {
        background-color: var(--tags-view-item-active-background);
        color: var(--tags-view-item-active-color);
        border-color: var(--tags-view-item-active-border-color);
        &::before {
          content: '';
          background: var(--tags-view-background);
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          position: relative;
          margin-right: 2px;
        }
      }
    }
  }
  .contextmenu {
    margin: 0;
    background: var(--tags-view-contextmenu-background);
    z-index: 3000;
    position: absolute;
    list-style-type: none;
    padding: 5px 0;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 400;
    color: var(--tags-view-contextmenu-color);
    box-shadow: var(--tags-view-contextmenu-box-shadow);
    li {
      margin: 0;
      padding: 7px 16px;
      cursor: pointer;
      &:hover {
        background: var(--tags-view-contextmenu-hover-background);
      }
    }
  }
}
</style>

<style lang="scss">
//reset element css of el-icon-close
.tags-view-wrapper {
  .tags-view-item {
    border-radius: 3px;
    .el-icon-close {
      border-radius: 6px;
      width: 12px;
      height: 12px;
      transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
      transform-origin: 100% 50%;
      vertical-align: -2px;

      &:hover {
        background-color: var(--tags-view-close-icon-hover-background);
        color: var(--tags-view-close-icon-hover-color);
      }
    }
  }
}
</style>
