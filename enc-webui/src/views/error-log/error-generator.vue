<template>
  <div class="scroll-y">
    <div class="mt-20px mb-5px font-bold">throw unhandledrejection</div>
    <el-button type="primary" @click="handle">unhandledrejection</el-button>

    <div class="mt-20px mb-5px font-bold">throw console.error</div>
    <el-button type="primary" @click="consoleErrorFun">console.error</el-button>

    <div class="mt-20px mb-5px font-bold">throw normalError</div>
    <el-button type="primary" @click="normalError">normalError</el-button>

    <!--req relative-->
    <div class="mt-20px mb-5px font-bold">throw req cross origin</div>
    <el-button type="primary" @click="reqCrossOrigin">reqCrossOrigin</el-button>
    <div class="mt-20px mb-5px font-bold">throw req 404 error</div>
    <el-button type="primary" @click="req404">req404</el-button>
    <!-- resource load error   -->
    <div class="mt-20px mb-5px font-bold">throw image load error</div>
    <el-button type="primary" @click="errorLogImg">imageLoadError</el-button>
    <!--image load error demo-->
    <img v-if="imgShow" src="http://img.png" />
  </div>
</template>

<script setup>
const basicStore = useBasicStore()
const settings = computed(() => {
  return basicStore.settings || {}
})

const handle = () => {
  new Promise((resolve, reject) => {
    reject('reject promise')
  }).then((res) => {
    console.log('ok')
  })
}

const flag = ref(null)

const consoleErrorFun = () => {
  console.error('console.error')
}

const normalError = () => {
  throw new Error(' throw new Error("")\n')
}
const reqCrossOrigin = () => {
  axiosReq({
    baseURL: 'https://github.jzfai.top/micro-service-test',
    url: '/integration-front/brand/updateBy',
    data: { id: 'fai' },
    method: 'put',
    isParams: true,
    bfLoading: true
  }).then(() => {})
}

const req404 = () => {
  axiosReq({
    // baseURL: 'https://github.jzfai.top/micro-service-test',
    url: '/integration-front/brand/updateBy1',
    data: { id: 'fai' },
    method: 'put',
    isParams: true,
    bfLoading: true
  }).then((res) => {})
  //the error will collection to unhandledrejection if you  no catch
  // .catch((err) => {})
}

//img loader err test
const imgShow = ref(false)
const errorLogImg = () => {
  imgShow.value = !imgShow.value
}
</script>

<style scoped lang="scss"></style>
