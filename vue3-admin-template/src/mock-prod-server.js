import { createProdMockServer } from 'vite-plugin-mock/es/createProdMockServer'
//https://cn.vitejs.dev/guide/features.html#glob-import
const modulesFiles = import.meta.glob('../mock/*', { eager: true })
let modules = []
for (const filePath in modulesFiles) {
  //读取文件内容到 modules
  modules = modules.concat(modulesFiles[filePath].default)
}
export function setupProdMockServer() {
  //创建prod mock server
  createProdMockServer([...modules])
}
