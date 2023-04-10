import { reactive, ref, toRefs } from 'vue'
import { ElLoading, ElMessage, ElMessageBox, ElNotification } from 'element-plus'
export const useElement = () => {
  // 正整数
  const upZeroInt = (rule, value, callback, msg) => {
    if (!value) {
      callback(new Error(`${msg}不能为空`))
    }
    if (/^\+?[1-9]\d*$/.test(value)) {
      callback()
    } else {
      callback(new Error(`${msg}输入有误`))
    }
  }

  // 正整数（包括0）
  const zeroInt = (rule, value, callback, msg) => {
    if (!value) {
      callback(new Error(`${msg}不能为空`))
    }
    if (/^\+?[0-9]\d*$/.test(value)) {
      callback()
    } else {
      callback(new Error(`${msg}输入有误`))
    }
  }

  // 金额
  const money = (rule, value, callback, msg) => {
    if (!value) {
      callback(new Error(`${msg}不能为空`))
    }
    if (/((^[1-9]\d*)|^0)(\.\d{0,2}){0,1}$/.test(value)) {
      callback()
    } else {
      callback(new Error(`${msg}输入有误`))
    }
  }

  // 手机号
  const phone = (rule, value, callback, msg) => {
    if (!value) {
      callback(new Error(`${msg}不能为空`))
    }
    if (/^0?1[0-9]{10}$/.test(value)) {
      callback()
    } else {
      callback(new Error(`${msg}输入有误`))
    }
  }

  // 邮箱
  const email = (rule, value, callback, msg) => {
    if (!value) {
      callback(new Error(`${msg}不能为空`))
    }
    if (/(^([a-zA-Z]|[0-9])(\w|-)+@[a-zA-Z0-9]+\.([a-zA-Z]{2,4}))$/.test(value)) {
      callback()
    } else {
      callback(new Error(`${msg}`))
    }
  }
  const state = reactive({
    /* table*/
    tableData: [],
    rowDeleteIdArr: [],
    loadingId: null,
    /* 表单*/
    formModel: {},
    subForm: {},
    searchForm: {},
    /* 表单校验*/
    formRules: {
      //非空
      isNull: (msg) => [{ required: false, message: `${msg}`, trigger: 'blur' }],
      isNotNull: (msg) => [{ required: true, message: `${msg}`, trigger: 'blur' }],
      // 正整数
      upZeroInt: (msg) => [
        { required: true, validator: (rule, value, callback) => upZeroInt(rule, value, callback, msg), trigger: 'blur' }
      ],
      // 正整数（包括0）
      zeroInt: (msg) => [
        { required: true, validator: (rule, value, callback) => zeroInt(rule, value, callback, msg), trigger: 'blur' }
      ],
      // 金额
      money: (msg) => [
        { required: true, validator: (rule, value, callback) => money(rule, value, callback, msg), trigger: 'blur' }
      ],
      // 手机号
      phone: (msg) => [
        { required: true, validator: (rule, value, callback) => phone(rule, value, callback, msg), trigger: 'blur' }
      ],
      // 邮箱
      email: (msg) => [
        { required: true, validator: (rule, value, callback) => email(rule, value, callback, msg), trigger: 'blur' }
      ]
    },
    /* 时间packing相关*/
    datePickerOptions: {
      //选择今天以后的日期，包括今天
      disabledDate: (time) => {
        return time.getTime() < Date.now() - 86400000
      }
    },
    startEndArr: [],
    /* dialog相关*/
    dialogTitle: '添加',
    detailDialog: false,
    isDialogEdit: false,
    dialogVisible: false,
    tableLoading: false,
    /* 树相关*/
    treeData: [],
    defaultProps: {
      children: 'children',
      label: 'label'
    }
  })
  return {
    ...toRefs(state)
  }
}

/*
 * 通知弹框
 * message：通知的内容
 * type：通知类型
 * duration：通知显示时长（ms）
 * */
export const elMessage = (message, type) => {
  ElMessage({
    showClose: true,
    message: message || '成功',
    type: type || 'success',
    center: false
  })
}
/*
 * loading加载框
 * 调用后通过 loadingId.close() 进行关闭
 * */
let loadingId = null
export const elLoading = (msg) => {
  loadingId = ElLoading.service({
    lock: true,
    text: msg || '数据载入中',
    // spinner: 'el-icon-loading',
    background: 'rgba(0, 0, 0, 0.1)'
  })
}
export const closeElLoading = () => {
  loadingId.close()
}
/*
 * 提示
 * message: 提示内容
 * type：提示类型
 * title：提示标题
 * duration：提示时长（ms）
 * */
export const elNotify = (message, type, title, duration) => {
  ElNotification({
    title: title || '提示',
    type: type || 'success',
    message: message || '请传入提示消息',
    position: 'top-right',
    duration: duration || 2500,
    offset: 40
  })
}
/*
  确认弹框(没有取消按钮)
* title:提示的标题
* message:提示的内容
* return Promise
* */
export const elConfirmNoCancelBtn = (title, message) => {
  return ElMessageBox({
    message: message || '你确定要删除吗',
    title: title || '确认框',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    showCancelButton: false,
    type: 'warning'
  })
}
/*
 * 确认弹框
 * title:提示的标题
 * message:提示的内容
 * return Promise
 * */
export const elConfirm = (title, message) => {
  return ElMessageBox({
    message: message || '你确定要删除吗',
    title: title || '确认框',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
}

/* 级联*/
const cascaderKey = ref()
export const casHandleChange = () => {
  // 解决目前级联选择器搜索输入报错问题
  cascaderKey.value += cascaderKey.value
}
