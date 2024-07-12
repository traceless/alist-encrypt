<template>
  <el-breadcrumb class="app-breadcrumb" separator="/">
    <!--  mainNeedAnimation：控制该面包屑是否需要动画  -->
    <transition-group v-if="settings.mainNeedAnimation" name="breadcrumb">
      <!--  根据过滤后的数组生成面包屑  -->
      <el-breadcrumb-item v-for="(item, index) in levelList" :key="item.path">
        <span v-if="item.redirect === 'noRedirect' || index === levelList.length - 1" class="no-redirect">
          {{ langTitle(item.meta?.title) }}
        </span>
        <a v-else @click.prevent="handleLink(item)">{{ langTitle(item.meta?.title) }}</a>
      </el-breadcrumb-item>
    </transition-group>
    <!--no transition-->
    <template v-else>
      <el-breadcrumb-item v-for="(item, index) in levelList" :key="item.path">
        <span v-if="item.redirect === 'noRedirect' || index === levelList.length - 1" class="no-redirect">
          {{ langTitle(item.meta?.title) }}
        </span>
        <a v-else @click.prevent="handleLink(item)">{{ langTitle(item.meta?.title) }}</a>
      </el-breadcrumb-item>
    </template>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { compile } from 'path-to-regexp'
import { useRoute, useRouter } from 'vue-router'
import type { RouterTypes } from '~/basic'
import { useBasicStore } from '@/store/basic'
import { langTitle } from '@/hooks/use-common'
const levelList = ref()
const { settings } = useBasicStore()
const route = useRoute()
const getBreadcrumb = () => {
  // only show routes with has  meta.title
  let matched: RouterTypes = route.matched.filter((item) => item.meta?.title)
  //如果首页Dashboard,如果没有，添加Dashboard路由到第一个路由
  const isHasDashboard = matched[0]?.name?.toLocaleLowerCase() === 'Dashboard'.toLocaleLowerCase()
  if (!isHasDashboard) {
    matched = [{ path: '/dashboard', meta: { title: 'Dashboard' } }].concat(matched)
  }
  //过滤面包屑显示的数组
  levelList.value = matched.filter((item) => item.meta && item.meta.title && item.meta.breadcrumb !== false)
}

//页面跳转处理
//compile函数将返回一个用于将参数转换为有效路径的函数：
//const  toPath =  compile ( "/user/:id" ,  {  encode : encodeURIComponent  } ) ;
//toPath ( {  id : 123  } ) ; //=> "/user/123"
const pathCompile = (path) => {
  const { params } = route
  const toPath = compile(path)
  return toPath(params)
}
const router = useRouter()
//如果有redirect地址直接跳转，没有跳转path
const handleLink = (item) => {
  const { redirect, path } = item
  if (redirect) {
    router.push(redirect)
    return
  }
  if (path) router.push(pathCompile(path))
}
//监听路由路径刷新 面包屑显示数组
watch(
  () => route.path,
  () => getBreadcrumb(),
  { immediate: true }
)
</script>

<style lang="scss" scoped>
.app-breadcrumb.el-breadcrumb {
  display: inline-block;
  font-size: 14px;
  line-height: 50px;
  margin-left: 8px;

  .no-redirect {
    color: var(--breadcrumb-no-redirect);
    cursor: text;
  }
}
</style>
