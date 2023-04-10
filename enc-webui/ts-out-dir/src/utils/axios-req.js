import axios from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useBasicStore } from '@/store/basic';
const service = axios.create();
service.interceptors.request.use((req) => {
    const { token, axiosPromiseArr } = useBasicStore();
    req.cancelToken = new axios.CancelToken((cancel) => {
        axiosPromiseArr.push({
            url: req.url,
            cancel
        });
    });
    req.headers['AUTHORIZE_TOKEN'] = token;
    if ('get'.includes(req.method?.toLowerCase()))
        req.params = req.data;
    return req;
}, (err) => {
    Promise.reject(err);
});
service.interceptors.response.use((res) => {
    const { code } = res.data;
    const successCode = '0,200,20000';
    const noAuthCode = '401,403';
    if (successCode.includes(code)) {
        return res.data;
    }
    else {
        if (noAuthCode.includes(code) && !location.href.includes('/login')) {
            ElMessageBox.confirm('请重新登录', {
                confirmButtonText: '重新登录',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                useBasicStore().resetStateAndToLogin();
            });
        }
        return Promise.reject(res.data);
    }
}, (err) => {
    ElMessage.error({
        message: err,
        duration: 2 * 1000
    });
    return Promise.reject(err);
});
export default function axiosReq(config) {
    return service({
        baseURL: import.meta.env.VITE_APP_BASE_URL,
        timeout: 8000,
        ...config
    });
}
