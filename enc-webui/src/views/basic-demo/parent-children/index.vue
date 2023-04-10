<template>
  <div class="scroll-y">
    <div class="font-bold mb-10px">call child method</div>
    <el-button @click="childMethod">call childMethod</el-button>
    <!--v-model sync -->
    <Children ref="refChildren" v-model:childrenTitle="parentTitle" father-name="Vue3Template" @emitParent="emitParent">
      <!--默认插槽 v-slot -->
      <template #default>
        <div>默认插槽</div>
      </template>
      <!--具名插槽// v-slot:header -->
      <template #header>
        <div>具名插槽</div>
      </template>
      <!--作用域插槽  //v-slot:footer-->
      <template #footer="{ testProps }">
        {{ testProps }}
      </template>
    </Children>
  </div>
</template>

<script setup lang="ts">
import Children from './Children.vue'
const refChildren = ref()
onMounted(() => {
  /*获取子元素方法*/
  console.log(refChildren.value)
})
const childMethod = () => {
  console.log(refChildren.value.childMethod())
  console.log(refChildren.value.childRef)
}
const emitParent = (data) => {
  console.log('得到子组件的信息111', data)
}
const fartherMethod = () => {
  console.log('fartherMethod')
}
//provide
provide('title', 'provide value')

//v-model sync
const parentTitle = ref('parentTitle')

watch(
  () => parentTitle.value,
  (oldValue, newValue) => {
    console.log('触发parent更新了', oldValue, newValue)
  },
  { immediate: true }
)
defineExpose({ fartherMethod })
</script>
