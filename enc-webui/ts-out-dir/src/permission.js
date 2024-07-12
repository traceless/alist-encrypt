import router from '@/router';
import { filterAsyncRouter, progressClose, progressStart } from '@/hooks/use-permission';
import { useBasicStore } from '@/store/basic';
import { userInfoReq } from '@/api/user';
const whiteList = ['/login', '/404', '/401'];
router.beforeEach(async (to) => {
    progressStart();
    const basicStore = useBasicStore();
    if (basicStore.token) {
        if (to.path === '/login') {
            return '/';
        }
        else {
            if (!basicStore.getUserInfo) {
                try {
                    const userData = await userInfoReq();
                    filterAsyncRouter(userData);
                    basicStore.setUserInfo(userData);
                    return { ...to, replace: true };
                }
                catch (e) {
                    console.error(`route permission error${e}`);
                    basicStore.resetState();
                    progressClose();
                    return `/login?redirect=${to.path}`;
                }
            }
            else {
                return true;
            }
        }
    }
    else {
        if (!whiteList.includes(to.path)) {
            return `/login?redirect=${to.path}`;
        }
        else {
            return true;
        }
    }
});
router.afterEach(() => {
    progressClose();
});
