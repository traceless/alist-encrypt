<template>
  <!-- 如果有 elSvgIcon 显示 elSvgIcon 没有显示 icon-->
  <el-icon v-if="meta?.elSvgIcon" class="el-svg-icon">
    <component :is="ElSvg[meta.elSvgIcon]" />
  </el-icon>
  <svg-icon v-else-if="meta?.icon" :icon-class="meta?.icon" class="nav-icon" />
</template>

<script setup lang="ts">
import * as ElSvg from '@element-plus/icons-vue'
defineProps({
  meta: { type: Object, default: null }
})
</script>

<style scoped lang="scss">
.el-svg-icon {
  width: 1em;
  height: 1em;
  position: relative;
  right: 3px;
  font-size: var(--sidebar-el-icon-size);
  text-align: left !important;
}
</style>
