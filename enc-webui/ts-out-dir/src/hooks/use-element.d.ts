import type { EpPropMergeType } from 'element-plus/es/utils';
export declare const useElement: () => {
    tableData: import("vue").Ref<never[]>;
    rowDeleteIdArr: import("vue").Ref<never[]>;
    loadingId: import("vue").Ref<null>;
    formModel: import("vue").Ref<{}>;
    subForm: import("vue").Ref<{}>;
    searchForm: import("vue").Ref<{}>;
    formRules: import("vue").Ref<{
        isNull: (msg: string) => {
            required: boolean;
            message: string;
            trigger: string;
        }[];
        isNotNull: (msg: string) => {
            required: boolean;
            message: string;
            trigger: string;
        }[];
        upZeroInt: (msg: string) => {
            required: boolean;
            validator: (rule: any, value: any, callback: any) => void;
            trigger: string;
        }[];
        zeroInt: (msg: string) => {
            required: boolean;
            validator: (rule: any, value: any, callback: any) => void;
            trigger: string;
        }[];
        money: (msg: string) => {
            required: boolean;
            validator: (rule: any, value: any, callback: any) => void;
            trigger: string;
        }[];
        phone: (msg: string) => {
            required: boolean;
            validator: (rule: any, value: any, callback: any) => void;
            trigger: string;
        }[];
        email: (msg: string) => {
            required: boolean;
            validator: (rule: any, value: any, callback: any) => void;
            trigger: string;
        }[];
    }>;
    datePickerOptions: import("vue").Ref<{
        disabledDate: (time: any) => boolean;
    }>;
    startEndArr: import("vue").Ref<never[]>;
    dialogTitle: import("vue").Ref<string>;
    detailDialog: import("vue").Ref<boolean>;
    isDialogEdit: import("vue").Ref<boolean>;
    dialogVisible: import("vue").Ref<boolean>;
    tableLoading: import("vue").Ref<boolean>;
    treeData: import("vue").Ref<never[]>;
    defaultProps: import("vue").Ref<{
        children: string;
        label: string;
    }>;
};
export declare const elMessage: (message: string, type?: any) => void;
export declare const elLoading: () => void;
export declare const closeLoading: () => void;
export declare const elNotify: (message: string, type: EpPropMergeType<any, any, any> | undefined, title: string, duration: number) => void;
export declare const elConfirmNoCancelBtn: (title: string, message: string) => Promise<import("element-plus").MessageBoxData>;
export declare const elConfirm: (title: string, message: string) => Promise<import("element-plus").MessageBoxData>;
export declare const casHandleChange: () => void;
