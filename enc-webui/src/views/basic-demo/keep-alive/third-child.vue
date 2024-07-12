<template>
  <div class="scroll-y">
    <h2 class="font-bold mb-10px">third-level.vue</h2>
    <el-form ref="refsearchForm" :inline="true" class="mt-2">
      <el-form-item label-width="0px" label="" prop="errorLog" label-position="left">
        <el-input v-model="searchForm.errorLog" class="w-150px" placeholder="input to test keepAlive" />
      </el-form-item>
      <el-form-item label-width="0px" label="" prop="pageUrl" label-position="left">
        <el-input v-model="searchForm.pageUrl" class="w-150px" placeholder="input to test keepAlive" />
      </el-form-item>
    </el-form>
    <el-button type="primary" @click="backClick">返回</el-button>
  </div>
</template>

<script setup name="ThirdChild">
const searchForm = reactive({
  name: '',
  age: ''
})
const backClick = () => {
  routerBack()
}
onMounted(() => {
  //get page pass url data
  console.log(getQueryParam())
})
</script>

<style scoped lang="scss"></style>
