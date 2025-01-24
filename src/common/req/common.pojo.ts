import {running_type} from "./file.req";

export interface NavIndexItem {
    name:string;
    url:string;
    index?:number
}


export interface tree_item<T=any> {
    name: string;
    children?: tree_item<T>[];
    extra_data?:T; // 额外的字段数据
}

export type tree_list = tree_item[];

export type workflow_realtime_tree_list = tree_item<{
    running_type?: running_type;
}>[];

// 逻辑卷
export class lv_item {
    name:string;
    size:string; // 格式化展示大小
}

// 物理卷
export class pv_item {
    name:string;
    size:string; // 格式化展示大小
    free_size:string; // 可使用大小
}

// 卷组
export class vg_item {
    name:string;
    pv_cout:any; // 拥有的pv数量
    lv_count:any; // 拥有的逻辑卷数量
    size:string; // 格式化展示大小
    free_size:string; // 可使用大小
    lv_list:lv_item[] = [];
    pv_list:pv_item[] = [];
}