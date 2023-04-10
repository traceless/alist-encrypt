<template>
  <div>
    <router-view v-slot="{ Component }">
      <div style="padding: 15px">
        <el-alert :closable="false" title="menu 1-1" type="success">
          <component :is="Component" />
        </el-alert>
      </div>
    </router-view>
  </div>
</template>
