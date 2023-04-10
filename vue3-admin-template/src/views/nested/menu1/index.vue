<template>
  <div>
    <router-view v-slot="{ Component }">
      <el-alert :closable="false" title="menu 1">
        <component :is="Component" />
      </el-alert>
    </router-view>
  </div>
</template>
