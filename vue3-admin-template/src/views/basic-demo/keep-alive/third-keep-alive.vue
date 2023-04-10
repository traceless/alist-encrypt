<template>
  <div>
    <div class="font-bold mb-10px">third-keep-alive demo</div>
    <el-input v-model="testInput" style="width: 400px" placeholder="input test keepAlive" />
    <!--  three level router   -->
    <router-view v-slot="{ Component }">
      <keep-alive :include="cachedViewsDeep">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>
</template>

<script setup lang="ts" name="ThirdKeepAlive">
const testInput = ref()
const { cachedViewsDeep } = useBasicStore()
</script>

<style scoped lang="scss"></style>
