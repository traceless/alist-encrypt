<template>
  <div>
    <el-button v-RolesPermission="['admin']">showing when then role of admin</el-button>
    <el-button v-RolesPermission="['editor']">editor</el-button>
    <el-button v-RolesPermission="['admin', 'editor']">editor and admin</el-button>
  </div>
</template>
