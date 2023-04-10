import { createRouter, createWebHashHistory } from 'vue-router';
import Layout from '@/layout/index.vue';
export const constantRoutes = [
    {
        path: '/redirect',
        component: Layout,
        hidden: true,
        children: [
            {
                path: '/redirect/:path(.*)',
                component: () => import('@/views/redirect')
            }
        ]
    },
    {
        path: '/login',
        component: () => import('@/views/login/index.vue'),
        hidden: true
    },
    {
        path: '/404',
        component: () => import('@/views/error-page/404.vue'),
        hidden: true
    },
    {
        path: '/401',
        component: () => import('@/views/error-page/401.vue'),
        hidden: true
    },
    {
        path: '/',
        component: Layout,
        redirect: '/dashboard',
        children: [
            {
                path: 'dashboard',
                name: 'Dashboard',
                component: () => import('@/views/dashboard/index.vue'),
                meta: { title: 'Dashboard', elSvgIcon: 'Fold' }
            }
        ]
    },
    {
        path: '/setting-switch',
        component: Layout,
        children: [
            {
                path: 'index',
                component: () => import('@/views/setting-switch/index.vue'),
                name: 'SettingSwitch',
                meta: { title: 'Setting Switch', icon: 'example', affix: true }
            }
        ]
    },
    {
        path: '/error-collection',
        component: Layout,
        meta: { title: 'Error Collection', icon: 'eye' },
        alwaysShow: true,
        children: [
            {
                path: 'error-collection-table-query',
                component: () => import('@/views/error-collection/ErrorCollectionTableQuery.vue'),
                name: 'ErrorCollectionTableQuery',
                meta: { title: 'Index' }
            },
            {
                path: 'error-log-test',
                component: () => import('@/views/error-log/ErrorLogTest.vue'),
                name: 'ErrorLogTest',
                meta: { title: 'ErrorLog Test' }
            }
        ]
    },
    {
        path: '/nested',
        component: Layout,
        redirect: '/nested/menu1',
        name: 'Nested',
        meta: {
            title: 'Nested',
            icon: 'nested'
        },
        children: [
            {
                path: 'menu1',
                component: () => import('@/views/nested/menu1/index.vue'),
                name: 'Menu1',
                meta: { title: 'Menu1' },
                children: [
                    {
                        path: 'menu1-1',
                        component: () => import('@/views/nested/menu1/menu1-1/index.vue'),
                        name: 'Menu1-1',
                        meta: { title: 'Menu1-1' }
                    },
                    {
                        path: 'menu1-2',
                        component: () => import('@/views/nested/menu1/menu1-2/index.vue'),
                        name: 'Menu1-2',
                        meta: { title: 'Menu1-2' },
                        children: [
                            {
                                path: 'menu1-2-1',
                                component: () => import('@/views/nested/menu1/menu1-2/menu1-2-1/index.vue'),
                                name: 'Menu1-2-1',
                                meta: { title: 'Menu1-2-1' }
                            },
                            {
                                path: 'menu1-2-2',
                                component: () => import('@/views/nested/menu1/menu1-2/menu1-2-2/index.vue'),
                                name: 'Menu1-2-2',
                                meta: { title: 'Menu1-2-2' }
                            }
                        ]
                    },
                    {
                        path: 'menu1-3',
                        component: () => import('@/views/nested/menu1/menu1-3/index.vue'),
                        name: 'Menu1-3',
                        meta: { title: 'Menu1-3' }
                    }
                ]
            },
            {
                path: 'menu2',
                component: () => import('@/views/nested/menu2/index.vue'),
                name: 'Menu2',
                meta: { title: 'menu2' }
            }
        ]
    },
    {
        path: '/external-link',
        component: Layout,
        children: [
            {
                component: () => { },
                path: 'https://github.com/jzfai/vue3-admin-ts.git',
                meta: { title: 'External Link', icon: 'link' }
            }
        ]
    }
];
export const roleCodeRoutes = [
    {
        path: '/roles-codes',
        component: Layout,
        redirect: '/roles-codes/page',
        alwaysShow: true,
        name: 'Permission',
        meta: {
            title: 'Permission',
            icon: 'lock',
            roles: ['admin', 'editor']
        },
        children: [
            {
                path: 'index',
                component: () => import('@/views/roles-codes/index.vue'),
                name: 'RolesCodes',
                meta: {
                    title: 'index'
                }
            },
            {
                path: 'roleIndex',
                component: () => import('@/views/roles-codes/role-index.vue'),
                name: 'RoleIndex',
                meta: {
                    title: 'Role Index',
                    roles: ['admin']
                }
            },
            {
                path: 'code-index',
                component: () => import('@/views/roles-codes/code-index.vue'),
                name: 'CodeIndex',
                meta: {
                    title: 'Code Index',
                    code: 16
                }
            },
            {
                path: 'button-permission',
                component: () => import('@/views/roles-codes/button-permission.vue'),
                name: 'ButtonPermission',
                meta: {
                    title: 'Button Permission'
                }
            }
        ]
    }
];
export const asyncRoutes = [
    { path: '/:catchAll(.*)', name: 'CatchAll', redirect: '/404', hidden: true }
];
const router = createRouter({
    history: createWebHashHistory(),
    scrollBehavior: () => ({ top: 0 }),
    routes: constantRoutes
});
export default router;
