<template>
  <div class="scroll-y">
    <div class="font-bold mb-10px">Second Page KeepAlive Demo</div>

    <el-form ref="refsearchForm" :inline="true" class="mt-2">
      <el-form-item label-width="0px" label="" prop="errorLog" label-position="left">
        <el-input v-model="searchForm.name" class="w-150px" placeholder="input to test keepAlive" />
      </el-form-item>
      <el-form-item label-width="0px" label="" prop="pageUrl" label-position="left">
        <el-input v-model="searchForm.age" class="w-150px" placeholder="input to test keepAlive" />
      </el-form-item>
    </el-form>
    <el-button type="primary" @click="routerDemoF">to SecondChild.vue</el-button>
  </div>
</template>
<script setup lang="ts" name="KeepAliveGroup">
//使用keep-alive 1.设置name（必须） 2.在路由配置处设置cachePage：即可缓存
const searchForm = reactive({
  name: '',
  age: ''
})
const testRef = ref(1)
//赋值
testRef.value = 2
console.log(testRef.value)
onActivated(() => {
  console.log('onActivated')
})
onDeactivated(() => {
  console.log('onDeactivated')
})

const routerDemoF = () => {
  //推荐路由跳转根据router的name,这样在你修改路径时，只要不修改name，就没有影响。
  //推荐传递的是query参数，好处是刷新时可以回显，传入的obj对象会反序列化。
  routerPush('SecondChild', { name: 'SecondKeepAlive' })
}
</script>
