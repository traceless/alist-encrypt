import { reactive, ref, toRefs } from 'vue';
import { ElLoading, ElMessage, ElMessageBox, ElNotification } from 'element-plus';
export const useElement = () => {
    const upZeroInt = (rule, value, callback, msg) => {
        if (!value) {
            callback(new Error(`${msg}不能为空`));
        }
        if (/^\+?[1-9]\d*$/.test(value)) {
            callback();
        }
        else {
            callback(new Error(`${msg}输入有误`));
        }
    };
    const zeroInt = (rule, value, callback, msg) => {
        if (!value) {
            callback(new Error(`${msg}不能为空`));
        }
        if (/^\+?[0-9]\d*$/.test(value)) {
            callback();
        }
        else {
            callback(new Error(`${msg}输入有误`));
        }
    };
    const money = (rule, value, callback, msg) => {
        if (!value) {
            callback(new Error(`${msg}不能为空`));
        }
        if (/((^[1-9]\d*)|^0)(\.\d{0,2}){0,1}$/.test(value)) {
            callback();
        }
        else {
            callback(new Error(`${msg}输入有误`));
        }
    };
    const phone = (rule, value, callback, msg) => {
        if (!value) {
            callback(new Error(`${msg}不能为空`));
        }
        if (/^0?1[0-9]{10}$/.test(value)) {
            callback();
        }
        else {
            callback(new Error(`${msg}输入有误`));
        }
    };
    const email = (rule, value, callback, msg) => {
        if (!value) {
            callback(new Error(`${msg}不能为空`));
        }
        if (/(^([a-zA-Z]|[0-9])(\w|-)+@[a-zA-Z0-9]+\.([a-zA-Z]{2,4}))$/.test(value)) {
            callback();
        }
        else {
            callback(new Error(`${msg}`));
        }
    };
    const state = reactive({
        tableData: [],
        rowDeleteIdArr: [],
        loadingId: null,
        formModel: {},
        subForm: {},
        searchForm: {},
        formRules: {
            isNull: (msg) => [{ required: false, message: `${msg}`, trigger: 'blur' }],
            isNotNull: (msg) => [{ required: true, message: `${msg}`, trigger: 'blur' }],
            upZeroInt: (msg) => [
                { required: true, validator: (rule, value, callback) => upZeroInt(rule, value, callback, msg), trigger: 'blur' }
            ],
            zeroInt: (msg) => [
                { required: true, validator: (rule, value, callback) => zeroInt(rule, value, callback, msg), trigger: 'blur' }
            ],
            money: (msg) => [
                { required: true, validator: (rule, value, callback) => money(rule, value, callback, msg), trigger: 'blur' }
            ],
            phone: (msg) => [
                { required: true, validator: (rule, value, callback) => phone(rule, value, callback, msg), trigger: 'blur' }
            ],
            email: (msg) => [
                { required: true, validator: (rule, value, callback) => email(rule, value, callback, msg), trigger: 'blur' }
            ]
        },
        datePickerOptions: {
            disabledDate: (time) => {
                return time.getTime() < Date.now() - 86400000;
            }
        },
        startEndArr: [],
        dialogTitle: '添加',
        detailDialog: false,
        isDialogEdit: false,
        dialogVisible: false,
        tableLoading: false,
        treeData: [],
        defaultProps: {
            children: 'children',
            label: 'label'
        }
    });
    return {
        ...toRefs(state)
    };
};
export const elMessage = (message, type) => {
    ElMessage({
        showClose: true,
        message: message || '成功',
        type: type || 'success',
        center: false
    });
};
let loadingId = null;
export const elLoading = () => {
    loadingId = ElLoading.service({
        lock: true,
        text: '数据载入中',
        spinner: 'el-icon-loading',
        background: 'rgba(0, 0, 0, 0.1)'
    });
};
export const closeLoading = () => {
    loadingId.close();
};
export const elNotify = (message, type, title, duration) => {
    ElNotification({
        title: title || '提示',
        type: type || 'success',
        message: message || '请传入提示消息',
        position: 'top-right',
        duration: duration || 2500,
        offset: 40
    });
};
export const elConfirmNoCancelBtn = (title, message) => {
    return ElMessageBox({
        message: message || '你确定要删除吗',
        title: title || '确认框',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        showCancelButton: false,
        type: 'warning'
    });
};
export const elConfirm = (title, message) => {
    return ElMessageBox({
        message: message || '你确定要删除吗',
        title: title || '确认框',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
    });
};
const cascaderKey = ref();
export const casHandleChange = () => {
    cascaderKey.value += cascaderKey.value;
};
