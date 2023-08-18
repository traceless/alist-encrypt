const fs = require('fs')

module.exports = {
  env: {
    browser: true,
    node: true,
    es6: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-var-requires': 0, // 允许require语句
    'prettier/prettier': [1, prettierrc()],
    'no-empty': [2, { allowEmptyCatch: true }], //允许空catch子句
  },
}

function prettierrc() {
  const prettierrc_id = require.resolve('./.prettierrc')
  var stat = fs.statSync(prettierrc_id)
  if (stat.mtimeMs > (process.prettierrc_file_mtimeMs || 0)) {
    process.prettierrc_file_mtimeMs = stat.mtimeMs
    require.cache[prettierrc_id] = undefined
  }
  const conf = require('./.prettierrc')
  return conf
}
