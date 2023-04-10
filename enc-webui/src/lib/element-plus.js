import * as AllComponent from 'element-plus'
//element-plus中按需引入会引起首次加载过慢
const elementPlusComponentNameArr = ['ElButton']
export default function (app) {
  elementPlusComponentNameArr.forEach((component) => {
    app.component(component, AllComponent[component])
  })
}
