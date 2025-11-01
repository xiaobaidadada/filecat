import React, {useEffect, useRef, useState} from 'react'
import {InputText, Select} from "../../../meta/component/Input";
import {Card} from "../../../meta/component/Card";
import {Button, ButtonText} from "../../../meta/component/Button";
import {isNumeric} from "../../util/WebPath";
import {useTranslation} from "react-i18next";
import {NotyFail} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {sysHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";


export function TimeConverTer(props) {
    const {t} = useTranslation();

    const [type, setType] = useState(t('毫秒'));
    const [stamp, setStamp] = useState('');
    const [time, setTime] = useState('');
    const [serverTime, setServerTime] = useState(null);
    const [timezone, setTimezone] = useState(null);
    const [localNow, setLocalNow] = useState(Date.now());


    function changeType(type) {
        setType(type);
    }
    function switchTime() {
        if (!stamp && !time) {
            new Noty({
                type: 'error',
                text: '不能都为空',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
            return;
        }
        let stampp:number|string = 0;
        // @ts-ignore
        const isStamp :boolean = stamp!=='' && stamp!==0;
        if (isStamp) {
            if (!isNumeric(stamp)) {
                NotyFail('must be number !')
                return;
            }
            stampp = parseInt(stamp);
            if (type==='分秒') {
                stampp *= 1000;
            }
        }
        const date = new Date(isStamp?stampp:time);
        const formatter = new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false, // 使用 24 小时制
        });
        const formattedDate = formatter.format(date);
        setTime(formattedDate)
        if (!stamp) {
            const stamppp = date.getTime();
            // @ts-ignore
            setStamp(type==='毫秒'?stamppp:stamppp/1000)
        }
    }



    // 服务器时间
    const fetchServerTime = async () => {
        const response = await sysHttp.get("sys_time/get");
        if(response.code === RCode.Sucess) {
            const data = await response.data;
            setServerTime(data.timestamp);
            setTimezone(data.timezone);
            setLocalNow(data.timestamp); // ← 用服务器时间初始化
        }

    };
    useEffect(() => {
        fetchServerTime();
        const timer = setInterval(() => {
            setLocalNow(prev => prev + 1000); // 每秒钟+1秒
        }, 1000);

        return () => clearInterval(timer);
    }, []);


    return <Row>
        <Column>
            <Card title={t("时间转换器")} rightBottomCom={<ButtonText text={t('确定')} clickFun={switchTime}/>}>
                <Select options={[{title:t("毫秒"),value:"毫秒"},{title:t("分秒"),value:"分秒"}]} onChange={changeType}/>
                <InputText placeholder={type} value={stamp} handleInputChange={(value)=>{setStamp(value)}} />
                <InputText placeholder={t('格式化时间')}  value={time} handleInputChange={(value)=>{setTime(value)}}/>
            </Card>

        </Column>
        <Column>
            {(serverTime!==null && timezone!==null) &&
                <Card title={t("服务器时间")}>
                    <h1>{t("时区")}: {timezone}</h1>
                    <h1>{t("时间")}: {(new Date(localNow)).toLocaleString(navigator.language, { timeZone: timezone })}</h1>
                </Card>
            }
        </Column>
    </Row>
}
