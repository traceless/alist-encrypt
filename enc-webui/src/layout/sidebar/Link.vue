<template>
  <component :is="type" v-bind="linkProps(to)">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isExternal } from '@/hooks/use-layout'

const props = defineProps({
  to: { type: String, required: true }
})
//判断是否时外链，true: 使用 <a/>标签， false: <router-link/>
const type = computed(() => {
  if (isExternal(props.to)) return 'a'
  return 'router-link'
})
//判断是否时外链，true: 返回 <a/>标签跳转属性， false: 直接使用当前路径
const linkProps = (to) => {
  if (isExternal(props.to)) {
    return {
      href: to,
      target: '_blank',
      //没有rel=“noopener noreferrer”的情况下使用target=“_blank”是有安全风险，超链接a标签的rel="noopener noreferrer"属性是一种新特性，它能让网站更安全
      rel: 'noopener'
    }
  }
  return { to }
}
</script>
