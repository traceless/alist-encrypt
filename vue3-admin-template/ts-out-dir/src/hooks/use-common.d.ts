export declare const sleepTimeout: (time: number) => Promise<unknown>;
export declare const useCommon: () => {
    totalPage: import("vue").Ref<number>;
    startEndArr: import("vue").Ref<never[]>;
    searchForm: import("vue").Ref<{}>;
    dialogTitle: import("vue").Ref<string>;
    detailDialog: import("vue").Ref<boolean>;
};
export declare function cloneDeep(value: any): any;
export declare const copyValueToClipboard: (value: any) => void;
