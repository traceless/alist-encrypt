import { watch } from 'vue'
import { storeToRefs } from 'pinia/dist/pinia'
import { langTitle } from '@/hooks/use-common'
import { useConfigStore } from '@/store/config'
//element-plus
const componentToProps = {
  ElInput: 'placeholder',
  ElTableColumn: 'label'
}

function checkPermission(el, { value }) {
  let saveOriginTitle = ''
  const { language } = storeToRefs(useConfigStore())
  //save the original title
  const name = el.__vueParentComponent?.type?.name
  const nameTitle = el.__vueParentComponent?.props[componentToProps[name]]
  saveOriginTitle = nameTitle || el.innerText
  watch(
    () => language.value,
    () => {
      //element tag or component
      if (name?.startsWith('EL')) {
        //self cunstrom
        if (Object.keys(componentToProps).includes(name)) {
          const props = el.__vueParentComponent.props
          props[componentToProps[name]] = langTitle(saveOriginTitle)
        } else {
          el.innerText = langTitle(saveOriginTitle)
        }
      } else {
        //common tag such as div span output so on;
        if (el.__vnode?.type) {
          el.innerText = langTitle(saveOriginTitle)
        }
      }
    },
    { immediate: true }
  )
}
export default {
  mounted(el, binding) {
    checkPermission(el, binding)
  }
}
