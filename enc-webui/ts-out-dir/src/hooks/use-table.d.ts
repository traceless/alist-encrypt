export declare const useTable: (searchForm: any, selectPageReq: any) => {
    pageNum: import("vue").Ref<number>;
    pageSize: import("vue").Ref<number>;
    totalPage: import("vue").Ref<number>;
    tableListData: import("vue").Ref<never[]>;
    tableListReq: (config: any) => import("axios").AxiosPromise<any>;
    dateRangePacking: (timeArr: any) => void;
    multipleSelection: import("vue").Ref<ObjKeys[]>;
    handleSelectionChange: (val: any) => void;
    handleCurrentChange: (val: any) => void;
    handleSizeChange: (val: any) => void;
    resetPageReq: () => void;
    multiDelBtnDill: (reqConfig: any) => void;
    tableDelDill: (row: any, reqConfig: any) => void;
};
