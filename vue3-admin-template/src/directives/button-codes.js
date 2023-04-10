import { useBasicStore } from '@/store/basic'

function checkPermission(el, { value }) {
  if (value && Array.isArray(value)) {
    if (value.length) {
      const permissionRoles = value
      const hasPermission = useBasicStore().buttonCodes?.some((code) => permissionRoles.includes(code))
      if (!hasPermission) el.parentNode && el.parentNode.removeChild(el)
    }
  } else {
    throw new Error(`need roles! Like v-permission="['admin','editor']"`)
  }
}
export default {
  mounted(el, binding) {
    checkPermission(el, binding)
  },
  componentUpdated(el, binding) {
    checkPermission(el, binding)
  }
}
