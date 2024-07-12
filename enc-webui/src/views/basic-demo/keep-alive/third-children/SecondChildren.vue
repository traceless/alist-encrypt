<template>
  <div class="mt-20px mb-10px font-bold">I Am SecondChildren.vue</div>
  <el-input v-model="testInput" placeholder="input test keepAlive" style="width: 400px" />
</template>

<script setup lang="ts" name="SecondChildren">
const testInput = ref('')
</script>

<style scoped lang="scss"></style>
