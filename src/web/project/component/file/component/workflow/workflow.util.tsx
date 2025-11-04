import React from 'react'

import {StatusCircle} from "../../../../../meta/component/Card";
import {job_item, running_type, step_item} from "../../../../../../common/req/file.req";
import {useTranslation} from "react-i18next";
import {tree_list} from "../../../../../../common/req/common.pojo";


export function WorkFlowStatus({item}) {
    const {t} = useTranslation();

    let success
    let running
    if (item.code != null) {
        success = item.code === 0
    } else if (item.extra_data?.running_type === running_type.running) {
        running = true
    }

    return (
        <div>
            <StatusCircle
                success={success}
                running={running}
            />
            {success ? t("成功") : t("失败")}
        </div>
    );
}

export const get_children_list = (r_list: tree_list, list?: step_item[], job_list?: job_item[]) => {
    if (list) {
        for (const item of list ?? []) {
            let name;
            const children: tree_list = [];
            if (item['use-yml']) {
                get_children_list(children, undefined, item.use_job_children_list)
                name = `${item['use-yml']}  ;${item.duration ?? -1}`
            } else if (item['runs']) {
                name = JSON.stringify(item['runs']);
            } else if (item['run']) {
                name = item['run'];
            } else if (item['run-js']) {
                name = item['run-js'];
            } else if (item['sleep']) {
                name = `sleep ${item['sleep']}`;
            }
            name = <div><StatusCircle
                success={item.code === undefined ? undefined : item.code === 0}/> {name + " ;" + (item.duration ?? '')}
            </div>
            r_list.push({
                name: name,
                children,
                extra_data: {
                    code: item.code,
                    context: item.message
                }
            })
        }
    } else if (job_list) {
        for (const item of job_list ?? []) {
            const name = <div><StatusCircle
                success={item.code === undefined ? undefined : item.code === 0}/>${item.name}</div>
            r_list.push({
                name: name,
                extra_data: {code: item.code, is_job: true, job_data: item}
            })
        }
    }

}

