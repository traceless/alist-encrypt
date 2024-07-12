import type { RouterTypes } from '~/basic';
import 'nprogress/nprogress.css';
export declare const filterAsyncRoutesByMenuList: (menuList: any) => RouterTypes;
export declare function filterAsyncRoutesByRoles(routes: any, roles: any): RouterTypes;
export declare function filterAsyncRouterByCodes(codesRoutes: any, codes: any): RouterTypes;
export declare function filterAsyncRouter({ menuList, roles, codes }: {
    menuList: any;
    roles: any;
    codes: any;
}): void;
export declare function resetRouter(): void;
export declare function resetState(): void;
export declare function freshRouter(data: any): void;
export declare const progressStart: () => void;
export declare const progressClose: () => void;
