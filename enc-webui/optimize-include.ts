// const fs = require('fs')
// const files = fs.readdirSync(
//   'D:\\github\\vue3-admin-ts\\node_modules\\.pnpm\\element-plus@2.2.9_vue@3.2.37\\node_modules\\element-plus\\es\\components\\'
// )
// console.log(111, JSON.stringify(files))
// console.log(console.dir(files))
// console.log(console.dir(files.slice(20)))

import { resolve } from 'path'

const elementPlusComponentNameArr = [
  'affix',
  'alert',
  'aside',
  'autocomplete',
  'avatar',
  'backtop',
  'badge',
  'base',
  'breadcrumb',
  'breadcrumb-item',
  'button',
  'button-group',
  'calendar',
  'card',
  'carousel',
  'carousel-item',
  'cascader',
  'cascader-panel',
  'check-tag',
  'checkbox',
  'checkbox-button',
  'checkbox-group',
  'col',
  'collapse',
  'collapse-item',
  'collapse-transition',
  'color-picker',
  'config-provider',
  'container',
  'date-picker',
  'descriptions',
  'descriptions-item',
  'dialog',
  'divider',
  'drawer',
  'dropdown',
  'dropdown-item',
  'dropdown-menu',
  'empty',
  'footer',
  'form',
  'form-item',
  'header',
  'icon',
  'image',
  'image-viewer',
  'infinite-scroll',
  'input',
  'input-number',
  'link',
  'loading',
  'main',
  'menu',
  'menu-item',
  'menu-item-group',
  'message',
  'message-box',
  'notification',
  'option',
  'option-group',
  'overlay',
  'page-header',
  'pagination',
  'popconfirm',
  'popover',
  'popper',
  'progress',
  'radio',
  'radio-button',
  'radio-group',
  'rate',
  'result',
  'row',
  'scrollbar',
  'select',
  'select-v2',
  'skeleton',
  'skeleton-item',
  'slider',
  'space',
  'step',
  'steps',
  'sub-menu',
  'switch',
  'tab-pane',
  'table',
  'table-column',
  'table-v2',
  'tabs',
  'tag',
  'teleport',
  'time-picker',
  'time-select',
  'timeline',
  'timeline-item',
  'tooltip',
  'transfer',
  'tree',
  'tree-select',
  'tree-v2',
  'upload',
  'virtual-list'
]

export const pkgPath = resolve(__dirname, './package.json')

// eslint-disable-next-line @typescript-eslint/no-var-requires
let { dependencies } = require(pkgPath)
dependencies = Object.keys(dependencies).filter((dep) => !dep.startsWith('@types/'))

const EPDepsArr = () => {
  const depsArr = [] as string[]
  elementPlusComponentNameArr.forEach((feItem) => {
    depsArr.push(`element-plus/es/components/${feItem}/style/index`)
  })
  return depsArr
}

export const optimizeElementPlus = EPDepsArr()
export const optimizeDependencies = dependencies

export default []
