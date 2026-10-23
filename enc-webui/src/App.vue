<template>
  <el-config-provider :locale="lang[language]" namespace="el" :size="size">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts" name="App">
import { onBeforeMount, onMounted } from 'vue'
//element-plus lang
import zh from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { storeToRefs } from 'pinia/dist/pinia'
import { useRoute } from 'vue-router'
import { useBasicStore } from '@/store/basic'
import { useConfigStore } from '@/store/config'
import { useErrorLog } from '@/hooks/use-error-log'

//reshow default setting
import { toggleHtmlClass } from '@/theme/utils'
const lang = { zh, en }

const { settings } = storeToRefs(useBasicStore())
const { size, language } = storeToRefs(useConfigStore())
onBeforeMount(() => {
  //set tmp token when setting isNeedLogin false
  if (!settings.value.isNeedLogin) useBasicStore().setToken(settings.value.tmpToken)
})
onMounted(() => {
  //lanch the errorLog collection
  useErrorLog()
})
const route = useRoute()
onMounted(() => {
  const { setTheme, theme, setSize, size, setLanguage, language } = useConfigStore()
  setTheme(theme)
  setLanguage(language, route.meta?.title)
  setSize(size)
  toggleHtmlClass(theme)
})
</script>
<style lang="scss">
//修改进度条样式
#nprogress .bar {
  background: var(--pregress-bar-color) !important;
}
</style>
