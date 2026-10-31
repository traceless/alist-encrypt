const fs = require('fs')

module.exports = {
  env: {
    browser: true,
    node: true,
    es6: true,
    es2021: true,
  },
  globals: {
    tjs: 'readonly', // txiki.js 运行时全局（src/runtime 双运行时探测用）
  },
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['warn', { args: 'none' }], // 保持原有warn级别，koa的(ctx, next)签名参数不检查
    'prettier/prettier': [1, prettierrc()],
    'no-empty': [2, { allowEmptyCatch: true }], //允许空catch子句
  },
}

function prettierrc() {
  const prettierrc_id = require.resolve('./.prettierrc.cjs')
  var stat = fs.statSync(prettierrc_id)
  if (stat.mtimeMs > (process.prettierrc_file_mtimeMs || 0)) {
    process.prettierrc_file_mtimeMs = stat.mtimeMs
    require.cache[prettierrc_id] = undefined
  }
  const conf = require('./.prettierrc.cjs')
  return conf
}
