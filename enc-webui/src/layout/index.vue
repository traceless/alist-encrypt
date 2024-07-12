<template>
  <div :class="classObj" class="layout-wrapper">
    <!--left side-->
    <Sidebar v-if="settings.showLeftMenu" class="sidebar-container" />
    <!--right container-->
    <div class="main-container">
      <Navbar v-if="settings.showTopNavbar" />
      <TagsView v-if="settings.showTagsView" />
      <AppMain />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import Sidebar from './sidebar/index.vue'
import AppMain from './app-main/index.vue'
import Navbar from './app-main/Navbar.vue'
import TagsView from './app-main/TagsView.vue'
import { useBasicStore } from '@/store/basic'
import { resizeHandler } from '@/hooks/use-layout'
const { sidebar, settings } = useBasicStore()
const classObj = computed(() => {
  return {
    closeSidebar: !sidebar.opened,
    hideSidebar: !settings.showLeftMenu
  }
})
resizeHandler()
</script>

<style lang="scss" scoped>
.main-container {
  min-height: 100%;
  transition: margin-left var(--sideBar-switch-duration);
  margin-left: var(--side-bar-width);
  position: relative;
}
.sidebar-container {
  transition: width var(--sideBar-switch-duration);
  width: var(--side-bar-width) !important;
  background-color: var(--el-menu-bg-color);
  height: 100%;
  position: fixed;
  font-size: 0;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 1001;
  overflow: hidden;
  border-right: 0.5px solid var(--side-bar-border-right-color);
}
.closeSidebar {
  .sidebar-container {
    width: 54px !important;
  }
  .main-container {
    margin-left: 54px !important;
  }
}
.hideSidebar {
  .sidebar-container {
    width: 0 !important;
  }
  .main-container {
    margin-left: 0;
  }
}
</style>
