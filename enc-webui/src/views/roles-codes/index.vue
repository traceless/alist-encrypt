<template>
  <div class="mt-10px">
    <div class="mb-20px text-20px font-bold">notice: setting the permissionMode of settings file before you test</div>

    <div class="mb-20px">roles 页面权限控制</div>
    <div>{{ roles }}</div>
    <el-button @click="freshRoles(['editor'])">roles切换为editor</el-button>
    <el-button @click="freshRoles(['admin'])">roles切换为admin</el-button>

    <div class="mb-10px">codes 页面权限控制</div>
    <div>{{ codes }}</div>
    <el-button @click="freshCodes([1])">Codes切换为[1]</el-button>
    <el-button @click="freshCodes([16, 9, 10, 11, 12, 13, 15])">C odes切换为[16]</el-button>
  </div>
</template>

<script setup lang="ts">
let { codes, roles } = storeToRefs(useBasicStore())
const freshRoles = (rolesArr) => {
  roles = rolesArr
  freshRouter({ roles: rolesArr })
}
const freshCodes = (codesArr) => {
  codes = codesArr
  freshRouter({ codes: codesArr })
}
</script>

<style scoped lang="scss"></style>
