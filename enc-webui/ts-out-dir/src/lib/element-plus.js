import * as AllComponent from 'element-plus';
const elementPlusComponentNameArr = ['ElButton'];
export default function (app) {
    elementPlusComponentNameArr.forEach((component) => {
        app.component(component, AllComponent[component]);
    });
}
