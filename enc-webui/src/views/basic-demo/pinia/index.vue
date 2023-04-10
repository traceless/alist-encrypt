<template>
  <div>
    <div class="font-bold mb-20px">由于使用了 AutoImport 插件 可以直接引入pinia里的api</div>
    <el-button @click="sidebar.opened = !sidebar.opened">switch sidebar.opened</el-button>
  </div>
</template>

<script setup lang="ts">
//由于使用了 AutoImport 插件 可以直接引入pinia里的api
//storeToRefs:引入的store属性具备响应式
const { sidebar } = storeToRefs(useBasicStore())
</script>

<style scoped lang="scss"></style>
