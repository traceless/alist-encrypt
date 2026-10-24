// 生成 dist 发布产物（替代原 webpack 链路），三步：
// 1. esbuild 将 ESM 源码打包为 CJS bundle（pkg 只认 CJS），双入口与原 webpack 一致：index(主服务) + PRGAThreadCom(rc4 worker)
// 2. 拷贝 public 静态资源到 dist/public（等价原 CopyPlugin）
// 3. 生成 dist/package.json（等价原 PkgConfig 插件：合并 package.json 的 name/version 与 pkgconfig.dist.json，供 pkg 读取）
import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const outdir = path.resolve('dist')

// 清理旧产物，保证 dist 干净
fs.rmSync(outdir, { recursive: true, force: true })

await esbuild.build({
  // 对象形式指定输出名：app.js -> index.js（pkgconfig.dist.json 的 bin 引用该名字）
  entryPoints: [
    { in: 'app.js', out: 'index' },
    { in: 'src/utils/PRGAThreadCom.js', out: 'PRGAThreadCom' },
  ],
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // PRGAThread.js 顶层的 import.meta.url 在 CJS 输出下不可用：
  // 不能用 supported:{'import-meta':false}（替换为空对象，顶层 new URL 会 throw）；
  // define 只接受标识符/字面量，故先经 banner 注入 helper 再引用该标识符，
  // 替换结果为基于 __filename 的等价 file URL（与原 webpack 行为一致，仅 DEV 分支消费）
  banner: {
    js: 'const IMPORT_META_URL = require("url").pathToFileURL(__filename).href;',
  },
  define: {
    'import.meta.url': 'IMPORT_META_URL',
  },
  minify: true,
  // 保留函数/类名（等价原 Terser 的 keep_fnames/keep_classnames，pkg 静态分析与错误堆栈需要）
  keepNames: true,
  sourcemap: false,
  logLevel: 'info',
})

// 拷贝前端静态资源
fs.cpSync(path.resolve('public'), path.join(outdir, 'public'), { recursive: true })

// 生成分发用 package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const distConf = JSON.parse(fs.readFileSync('pkgconfig.dist.json', 'utf8'))
distConf.name = pkg.name
distConf.version = pkg.version
const distPkgPath = path.join(outdir, 'package.json')
fs.writeFileSync(distPkgPath, JSON.stringify(distConf), 'utf8')
console.log(distPkgPath, distConf)
