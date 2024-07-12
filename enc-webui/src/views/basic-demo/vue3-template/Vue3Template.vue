<template>
  <div>vue3推荐模板可以集成在你们的vscode或webstorm中，有助于快速开发</div>
</template>

<script setup>
// 获取store和router

const props = defineProps({
  name: {
    require: true,
    default: 'fai',
    type: String
  }
})
const state = reactive({
  levelList: null
})

const routes = computed(() => 'value')
watch(
  () => props.name,
  (oldValue, newValue) => {},
  { immediate: true }
)

const router = useRouter()
onMounted(() => {
  console.log('页面挂载了')
})
const helloFunc = () => {
  console.log('helloFunc')
}
// 导出给父元素使用
defineExpose({ helloFunc })
// 导出属性到页面中使用
const { levelList } = toRefs(state)
</script>

<style scoped lang="scss"></style>
