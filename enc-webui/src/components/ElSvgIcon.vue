<template>
  <el-icon :size="size" :color="color">
    <component :is="ElSvg[name]" />
  </el-icon>
</template>

<script setup lang="ts">
import * as ElSvg from '@element-plus/icons-vue'
const props = defineProps({
  name: {
    require: true,
    default: 'Fold',
    type: String
  },
  size: {
    require: false,
    default: 18,
    type: Number
  },
  color: {
    require: false,
    default: '',
    type: String
  }
})
</script>

<style scoped lang="scss">
//.el-svg-icon {
//  width: 1em;
//  height: 1em;
//  margin-left: -2px; //el-svg-icon has some margin
//  font-size: 20px !important;
//  text-align: left !important;
//}
</style>
