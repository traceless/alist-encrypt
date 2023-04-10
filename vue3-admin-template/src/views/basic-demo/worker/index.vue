<template>
  <div>
    <div>the recommend using way of worker</div>
    <div>计算结果：{{ showPageRef }}</div>
  </div>
</template>
<script setup lang="ts">
/*推荐worker使用方式*/
// 方式，函数直接转换
const workerCode = () => {
  onmessage = (e) => {
    console.time('加载时间')
    console.log(`接收到主线程的信息${e.data}`)
    //处理复杂的js逻辑
    let countNum = 0
    for (let i = 0; i < e.data; i++) {
      countNum = i + countNum
    }
    //处理完毕返回主线程
    console.log('子线程数据处理完毕返回主线程')
    console.timeEnd('加载时间')
    postMessage(countNum)
  }
}

//change func to url for worker using
const changeFuncToUrl = (func) => {
  const workBlob = new Blob([`(${func.toString()})()`]) // 把函数转成一个自执行函数
  const url = URL.createObjectURL(workBlob)
  return new Worker(url)
}

//主线程逻辑
const worker = changeFuncToUrl(workerCode)
worker.postMessage(30000000)
const showPageRef = ref()
elLoading('数据计算中')
worker.onmessage = (e) => {
  console.log(`主进程收到了子进程发出的信息：${e.data}`)
  showPageRef.value = e.data
  //停止线程（注:用完后一定要停止）
  closeElLoading()
  worker.terminate()
}
</script>
