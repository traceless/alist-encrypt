<template>
  <div class="scroll-y">
    <div class="font-bold mb-20px">second-level.vue</div>
    <el-form ref="refsearchForm" :inline="true" class="mt-2">
      <el-form-item label-width="0px" label="" prop="errorLog" label-position="left">
        <el-input v-model="searchForm.name" class="w-150px" placeholder="input to test keepAlive" />
      </el-form-item>
      <el-form-item label-width="0px" label="" prop="pageUrl" label-position="left">
        <el-input v-model="searchForm.age" class="w-150px" placeholder="demo1" />
      </el-form-item>
    </el-form>
    <el-button type="primary" @click="routerDemoS">to ThirdChild.vue</el-button>
    <el-button type="primary" @click="backClick">返回</el-button>
  </div>
</template>
<script setup lang="ts" name="SecondChild">
const searchForm = reactive({
  name: '',
  age: ''
})
onMounted(() => {
  //get page pass url data
  console.log(getQueryParam())
})
const backClick = () => {
  routerBack()
}
const routerDemoS = () => {
  routerPush('ThirdChild', { name: 'SecondChild' })
}
</script>

<style scoped lang="scss"></style>
