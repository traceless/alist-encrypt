<template>
  <div class="scroll-y">
    <h3 class="mb-20px">props operate demo of settings.js</h3>
    <div class="rowSS">
      <div class="mb-10px">
        <div class="font-bold text-20px">page layout related</div>
        <div class="mt-20px">
          sidebarLogo：
          <el-switch v-model="settings.sidebarLogo" />
        </div>
        <div class="mt-30px">
          showNavbarTitle：
          <el-switch v-model="settings.showNavbarTitle" />
        </div>
        <div class="mt-30px">
          ShowDropDown：
          <el-switch v-model="settings.ShowDropDown" />
        </div>
        <div class="mt-30px">
          showHamburger：
          <el-switch v-model="settings.showHamburger" />
        </div>
        <div class="mt-30px">
          showLeftMenu：
          <el-switch v-model="settings.showLeftMenu" />
        </div>
        <div class="mt-30px">
          showTagsView：
          <el-switch v-model="settings.showTagsView" />
        </div>
        <div class="mt-30px">
          showTopNavbar：
          <el-switch v-model="settings.showTopNavbar" />
        </div>
      </div>
      <div class="mb-10px ml-60px">
        <div class="font-bold text-20px">page animation related</div>
        <div class="mt-20px">mainNeedAnimation：places to "settings file" for setting</div>
        <div class="mt-30px">
          isNeedNprogress：
          <el-switch v-model="settings.isNeedNprogress" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const { settings } = storeToRefs(useBasicStore())
</script>
