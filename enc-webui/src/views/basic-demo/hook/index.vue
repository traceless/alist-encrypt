<template>
  <div>
    <div class="font-bold mb-20px">引入use-common.ts中的copyValueToClipboard</div>
    <el-button @click="hookExample">执行hook方法</el-button>
  </div>
</template>

<script setup lang="ts">
//由于使用了 AutoImport 插件 可以直接引入hooks里的api
//引入use-common.ts中的copyValueToClipboard
const hookExample = () => {
  copyValueToClipboard('执行hook方法')
}
</script>
