import { useBasicStore } from '@/store/basic';
function checkPermission(el, { value }) {
    if (value && Array.isArray(value)) {
        if (value.length > 0) {
            const permissionRoles = value;
            const hasPermission = useBasicStore().roles?.some((role) => permissionRoles.includes(role));
            if (!hasPermission)
                el.parentNode && el.parentNode.removeChild(el);
        }
    }
    else {
        throw new Error(`need roles! Like v-roles-permission="['admin','editor']"`);
    }
}
export default {
    mounted(el, binding) {
        checkPermission(el, binding);
    },
    componentUpdated(el, binding) {
        checkPermission(el, binding);
    }
};
