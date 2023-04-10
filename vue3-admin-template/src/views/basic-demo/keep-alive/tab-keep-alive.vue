<template>
  <div class="scroll-y">
    <div class="font-bold mb-10px">Tab KeepAlive Demo</div>
    <el-input v-model="searchForm.pageUrl" style="width: 200px" placeholder="input to test TabKeepAlive" />
  </div>
</template>
<script setup lang="ts" name="TabKeepAlive">
const searchForm = reactive({
  pageUrl: ''
})
const testRef = ref(1)
testRef.value = 2
onActivated(() => {
  console.log('onActivated')
})
onDeactivated(() => {
  console.log('onDeactivated')
})
</script>
