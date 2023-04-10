<template>
  <div class="scroll-y">
    <div class="font-bold mb-20px">svg-icon使用示例</div>
    <svg-icon icon-class="sidebar-logo" class="svg-class" />
  </div>
</template>

<script setup lang="ts">
//配置了 Components.dirs自动扫描组件，无需引入
// import SvgIcon from '@/icons/SvgIcon.vue'
</script>

<style scoped lang="scss">
.svg-class {
  font-size: 100px;
  color: var(--sidebar-logo-color);
}
</style>
