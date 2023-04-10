<template>
  <div>
    page test TestTableQuery.vue
    <div>
      <el-button @click="vueRouter.push({ name: 'TestDetail' })">toTestDetail.vue</el-button>
      <el-button @click="vueRouter.push({ name: 'TestAddEdit' })">TestAddEdit.vue</el-button>
    </div>

    <div class="mt-20px">
      <el-button type="primary" @click="goToConfig">去配置</el-button>
    </div>
  </div>
</template>

<script setup>
const vueRouter = useRouter()
const goToConfig = () => {
  location.href = 'https://github.jzfai.top/low-code-platform/#/permission-center/user-table-query'
}
</script>

<style scoped lang="scss"></style>
