<template>
  <div id="Sidebar" class="reset-menu-style">
    <!--logo-->
    <Logo v-if="settings.sidebarLogo" :collapse="!sidebar.opened" />
    <!--router menu-->
    <el-scrollbar>
      <el-menu
        class="el-menu-vertical"
        :collapse="!sidebar.opened"
        :default-active="activeMenu"
        :collapse-transition="false"
        mode="vertical"
      >
        <sidebar-item v-for="route in allRoutes" :key="route.path" :item="route" :base-path="route.path" />
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia/dist/pinia'
import { useRoute } from 'vue-router'
import Logo from './Logo.vue'
import SidebarItem from './SidebarItem.vue'
import { useBasicStore } from '@/store/basic'
const { settings, allRoutes, sidebar } = storeToRefs(useBasicStore())
const routeInstance = useRoute()
const activeMenu = computed(() => {
  const { meta, path } = routeInstance
  // if set path, the sidebar will highlight the path you set
  if (meta.activeMenu) {
    return meta.activeMenu
  }
  return path
})
</script>
<style lang="scss">
//fix open the item style issue
.el-menu-vertical {
  width: var(--side-bar-width);
}
.reset-menu-style {
  border-right: 1px solid var(--side-bar-border-right-color);
}
</style>
