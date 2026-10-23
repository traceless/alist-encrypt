/**
 * 公共类型定义（JSDoc）
 * 代替原 TypeScript 的 src/@types/index.d.ts，仅作为编辑器提示和文档用途
 */

/**
 * 加密路径配置项，对应 config.json 中 passwdList 的元素
 * @typedef {object} PasswdInfo
 * @property {string[]} encPath 需要加密的路径列表，支持正则表达式
 * @property {boolean} encFolder 是否加密目录名
 * @property {boolean} enable 是否启用加密
 * @property {string} password 加密密码
 * @property {string} encType 加密算法类型: aesctr | rc4 | chacha20 | mix
 */
export {}
