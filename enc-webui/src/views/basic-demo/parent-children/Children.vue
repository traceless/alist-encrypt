<template>
  <div>
    <div class="font-bold mb-10px mt-20px">call father method</div>
    <el-button @click="emitFather">emitFather</el-button>
    <el-button @click="getFatherMethod">getFatherMethod</el-button>
    <SubChildren />
  </div>

  <div class="mt-20px font-bold mb-10px">slot using</div>
  <!-- 默认插槽 -->
  <slot>
    <!-- slot内为后备内容 -->
    <h3>没传内容</h3>
  </slot>
  <!-- 具名插槽 -->
  <slot name="header">
    <h3>没传header插槽</h3>
  </slot>
  <!-- 作用域插槽 -->
  <slot name="footer" test-props="子组件作用域传的值">
    <h3>没传footer插槽</h3>
  </slot>

  <div class="mt-20px mb-10px font-bold">v-model sync using</div>
  <div>{{ childrenTitle }}</div>
  <el-button @click="changeParentValue">changeParentValue</el-button>
</template>

<script setup lang="ts">
import SubChildren from './SubChildren.vue'
const props = defineProps({
  fatherName: {
    require: true,
    default: '',
    type: String
  },
  childrenTitle: {
    require: true,
    default: '',
    type: String
  }
})
const state = reactive({
  name: 'Children'
})
//导出给refs使用
const childRef = ref('childRef')
const childMethod = () => {
  return 'childMethod'
}

const vm = getCurrentInstance()?.proxy
const getFatherMethod = () => {
  vm?.$parent?.fartherMethod()
}
//emit
// 定义emit事件
const emit = defineEmits(['emitParent', 'update:childrenTitle'])
const emitFather = () => {
  emit('emitParent', { val: '子组件传递的信息' })
}
onMounted(() => {
  console.log('得到父元素的prop', props.fatherName)
})

//v-model sync
onMounted(() => {
  console.log(`this is v-model parent data:${props.childrenTitle}`)
})
const changeParentValue = () => {
  emit('update:childrenTitle', 'update it childrenTitle')
}
defineExpose({ childRef, childMethod })
//export to page for use
const { name } = toRefs(state)
</script>
