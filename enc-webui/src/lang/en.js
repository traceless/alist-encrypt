export default {
  router: {
    Dashboard: '',
    'Setting Switch': '',
    'Error Log': '',
    'Error Index': '',
    'Error Generator': '',

    Nested: '',
    Menu1: '',
    'Menu1-1': '',
    'Menu1-2': '',
    'Menu1-2-1': '',
    'Menu1-2-2': '',
    'Menu1-3': '',
    menu2: '',

    'External Link': '',

    'Basic Demo': '',
    Hook: '',
    Pinia: '',
    Mock: '',
    'Svg Icon': '',
    'Parent Children': '',
    'KeepAlive Group': '',
    'Tab KeepAlive': '',
    'Third KeepAlive': '',
    SecondChild: '',
    ThirdChild: '',
    SecondChildren: '',
    ThirdChildren: '',
    Worker: '',

    Permission: '',

    'Permission Switch': '',
    'Role Index': '',
    'Code Index': '',
    'Button Permission': ''
  },
  navbar: {
    Home: '',
    Github: '',
    Docs: '',
    'login out': ''
  },

  //page
  dashboard: {
    'switch theme': '',
    'switch size': '',
    'switch language': '',
    en: 'English',
    zh: '中文',
    'Button Group': '',
    'unocss using': '',
    'global var': ''
  },
  'error-log': {
    log: '',
    pageUrl: '',
    startDate: '',
    endDate: '',
    github: '',
    search: '',
    reset: '',
    multiDel: ''
  },
  permission: {
    addRole: '',
    editPermission: '',
    roles: '',
    switchRoles: '',
    tips:
      '在某些情况下，不适合使用 v-permission。例如：Element-UI 的 el-tab 或 el-table-column 以及其它动态渲染 dom 的场景。你只能通过手动设置 v-if 来实现。',
    delete: '删除',
    confirm: '确定',
    cancel: '取消'
  },
  guide: {
    description: '引导页对于一些第一次进入项目的人很有用，你可以简单介绍下项目的功能。本 Demo 是基于',
    button: '打开引导'
  },
  components: {
    documentation: '文档',
    tinymceTips:
      '富文本是管理后台一个核心的功能，但同时又是一个有很多坑的地方。在选择富文本的过程中我也走了不少的弯路，市面上常见的富文本都基本用过了，最终权衡了一下选择了Tinymce。更详细的富文本比较和介绍见',
    dropzoneTips:
      '由于我司业务有特殊需求，而且要传七牛 所以没用第三方，选择了自己封装。代码非常的简单，具体代码你可以在这里看到 @/components/Dropzone',
    stickyTips: '当页面滚动到预设的位置会吸附在顶部',
    backToTopTips1: '页面滚动到指定位置会在右下角出现返回顶部按钮',
    backToTopTips2:
      '可自定义按钮的样式、show/hide、出现的高度、返回的位置 如需文字提示，可在外部使用Element的el-tooltip元素',
    imageUploadTips:
      '由于我在使用时它只有vue@1版本，而且和mockjs不兼容，所以自己改造了一下，如果大家要使用的话，优先还是使用官方版本。'
  },
  table: {
    dynamicTips1: '固定表头, 按照表头顺序排序',
    dynamicTips2: '不固定表头, 按照点击顺序排序',
    dragTips1: '默认顺序',
    dragTips2: '拖拽后顺序',
    title: '标题',
    importance: '重要性',
    type: '类型',
    remark: '点评',
    search: '搜索',
    add: '添加',
    export: '导出',
    reviewer: '审核人',
    id: '序号',
    date: '时间',
    author: '作者',
    readings: '阅读数',
    status: '状态',
    actions: '操作',
    edit: '编辑',
    publish: '发布',
    draft: '草稿',
    delete: '删除',
    cancel: '取 消',
    confirm: '确 定'
  }
}
