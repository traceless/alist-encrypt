import type { RouterTypes } from '~/basic';
export declare const useBasicStore: import("pinia").StoreDefinition<"basic", {
    token: string;
    getUserInfo: boolean;
    userInfo: {
        username: string;
        avatar: string;
    };
    allRoutes: RouterTypes;
    buttonCodes: never[];
    filterAsyncRoutes: never[];
    roles: string[];
    codes: number[];
    cachedViews: string[];
    cachedViewsDeep: string[];
    sidebar: {
        opened: boolean;
    };
    axiosPromiseArr: ObjKeys[];
    settings: import("~/basic").SettingsConfig;
}, {}, {
    setToken(data: any): void;
    setFilterAsyncRoutes(routes: any): void;
    setUserInfo({ userInfo, roles, codes }: {
        userInfo: any;
        roles: any;
        codes: any;
    }): void;
    resetState(): void;
    resetStateAndToLogin(): void;
    M_settings(data: any): void;
    setSidebarOpen(data: any): void;
    setToggleSideBar(): void;
    addCachedView(view: any): void;
    delCachedView(view: any): void;
    M_RESET_CACHED_VIEW(): void;
    addCachedViewDeep(view: any): void;
    setCacheViewDeep(view: any): void;
    M_RESET_CACHED_VIEW_DEEP(): void;
    A_sidebar_opened(data: any): void;
}>;
