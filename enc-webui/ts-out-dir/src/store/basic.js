import { nextTick } from 'vue';
import { defineStore } from 'pinia';
import defaultSettings from '@/settings';
import router, { constantRoutes } from '@/router';
export const useBasicStore = defineStore('basic', {
    state: () => {
        return {
            token: '',
            getUserInfo: false,
            userInfo: {
                username: '',
                avatar: ''
            },
            allRoutes: [],
            buttonCodes: [],
            filterAsyncRoutes: [],
            roles: [],
            codes: [],
            cachedViews: [],
            cachedViewsDeep: [],
            sidebar: { opened: true },
            axiosPromiseArr: [],
            settings: defaultSettings
        };
    },
    persist: {
        storage: localStorage,
        paths: ['token']
    },
    actions: {
        setToken(data) {
            this.token = data;
        },
        setFilterAsyncRoutes(routes) {
            this.$patch((state) => {
                state.filterAsyncRoutes = routes;
                state.allRoutes = constantRoutes.concat(routes);
            });
        },
        setUserInfo({ userInfo, roles, codes, version }) {
            const { username, avatar } = userInfo;
            this.$patch((state) => {
                state.roles = roles;
                state.codes = codes;
                state.getUserInfo = true;
                state.userInfo.username = username;
                state.userInfo.version = version;
                state.userInfo.avatar = avatar;
            });
        },
        resetState() {
            this.$patch((state) => {
                state.token = '';
                state.roles = [];
                state.codes = [];
                state.allRoutes = [];
                state.buttonCodes = [];
                state.filterAsyncRoutes = [];
                state.userInfo.username = '';
                state.userInfo.avatar = '';
            });
            this.getUserInfo = false;
        },
        resetStateAndToLogin() {
            this.resetState();
            nextTick(() => {
                router.push({ path: '/login' });
            });
        },
        M_settings(data) {
            this.$patch((state) => {
                state.settings = { ...state.settings, ...data };
            });
        },
        setSidebarOpen(data) {
            this.$patch((state) => {
                state.sidebar.opened = data;
            });
        },
        setToggleSideBar() {
            this.$patch((state) => {
                state.sidebar.opened = !state.sidebar.opened;
            });
        },
        addCachedView(view) {
            this.$patch((state) => {
                if (state.cachedViews.includes(view))
                    return;
                state.cachedViews.push(view);
            });
        },
        delCachedView(view) {
            this.$patch((state) => {
                const index = state.cachedViews.indexOf(view);
                index > -1 && state.cachedViews.splice(index, 1);
            });
        },
        M_RESET_CACHED_VIEW() {
            this.$patch((state) => {
                state.cachedViews = [];
            });
        },
        addCachedViewDeep(view) {
            this.$patch((state) => {
                if (state.cachedViewsDeep.includes(view))
                    return;
                state.cachedViewsDeep.push(view);
            });
        },
        setCacheViewDeep(view) {
            this.$patch((state) => {
                const index = state.cachedViewsDeep.indexOf(view);
                index > -1 && state.cachedViewsDeep.splice(index, 1);
            });
        },
        M_RESET_CACHED_VIEW_DEEP() {
            this.$patch((state) => {
                state.cachedViewsDeep = [];
            });
        },
        A_sidebar_opened(data) {
            this.setSidebarOpen(data);
        }
    }
});
