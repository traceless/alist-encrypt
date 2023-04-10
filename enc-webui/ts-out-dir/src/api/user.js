import axiosReq from '@/utils/axios-req';
export const userInfoReq = () => {
    return new Promise((resolve) => {
        const reqConfig = {
            url: '/basis-func/user/getUserInfo',
            params: { plateFormId: 2 },
            method: 'post'
        };
        axiosReq(reqConfig).then(({ data }) => {
            resolve(data);
        });
    });
};
export const loginReq = (subForm) => {
    return axiosReq({
        url: '/basis-func/user/loginValid',
        params: subForm,
        method: 'post'
    });
};
export const loginOutReq = () => {
    return axiosReq({
        url: '/basis-func/user/loginValid',
        method: 'post'
    });
};
