import { parse } from '@vue/compiler-sfc'
import { render } from 'ejs'
export default ({ inject }) => {
  // let viteConfig
  return {
    name: 'vite-plugin-setup-extend',
    enforce: 'pre',
    // configResolved(resolvedConfig) {
    //   viteConfig = resolvedConfig
    // },
    async transformIndexHtml(html) {
      const result = await render(html, { ...inject })
      return result
    },
    transform(code, id) {
      if (/\.vue$/.test(id)) {
        const { descriptor } = parse(code)
        if (!descriptor?.scriptSetup?.setup) {
          return null
        }
        const { lang, name } = descriptor.scriptSetup?.attrs || {}
        const dillStr = headString(lang, name)
        code += dillStr
        return code
      }
    }
  }
}

const headString = (lang, name) => {
  return `<script ${lang ? `lang="${lang}"` : ''}>
import { defineComponent } from 'vue'
export default defineComponent({
  ${name ? `name: "${name}",` : ''}
})
</script>\n`
}
