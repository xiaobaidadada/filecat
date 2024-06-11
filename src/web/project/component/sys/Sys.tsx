import React, {useEffect, useState} from 'react'
import { Column, Dashboard, Row, FlexContainer, TextLine, RowColumn} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import CircleChart from "../../../meta/component/CircleChart";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {staticSysPojo, SysPojo} from "../../../../common/req/sys.pojo";
import {sysHttp} from "../../util/config";


export function Sys(props) {
    const [memPercentage, setmemPercentage] = useState(0);
    const [memLeft,setMemLeft] = useState(0)
    const [memTotal,setMemTotal] = useState(0)
    const [currentLoad,setCurrentLoad] = useState(0)
    const [sys,setSys] = useState({})
    const init = async () => {
        const data = new WsData(CmdType.sys_get);
        await ws.send(data)
        ws.addMsg(CmdType.sys_getting,(wsData:WsData<SysPojo>)=>{
            setCurrentLoad(wsData.context?.cpu_currentLoad)
            const memLeft = wsData.context?.memLeft;
            const memTotal = wsData.context?.memTotal;
            setMemLeft(memLeft);
            setMemTotal(memTotal);
            setmemPercentage(((memTotal-memLeft)/memTotal)*100)
        })
        // ws.subscribeUnconnect(init);
        const rsq = await sysHttp.get();
        if (rsq.code === 0) {
            const data :staticSysPojo = rsq.data;
            setSys(data)
        }
    }
    useEffect( () => {
        init();
        return ()=>{
            (async ()=>{
                if (ws.isAilive()) {
                    ws.setPromise(async (resolve)=>{
                        const data = new WsData(CmdType.sys_cancel);
                        await ws.send(data)
                        await ws.unConnect();
                        resolve();
                    })

                }
            })();
        }
    }, []);
    return <Dashboard>
        <Row>
            <Column widthPer={33}>
                <Card title={"内存"}>
                    <Row>
                        <Column>
                            <CircleChart percentage={memPercentage}  />
                        </Column>
                        <Column>
                            <Row>
                                <Column widthPer={100}>
                                    <div>
                                        <TextLine left={"总容量"} center={`${memTotal}G`}/>
                                    </div>
                                </Column>
                                <Column widthPer={100}>
                                    <TextLine left={"剩余"} center={`${memLeft}G`}/>
                                </Column>
                            </Row>
                        </Column>
                    </Row>
                </Card>
            </Column>
            <Column widthPer={33}>
                <Card title={"cpu"}>
                    <Row>
                        <Column>
                            <CircleChart percentage={currentLoad}  />
                        </Column>
                        <Column>
                            <Row>
                                <TextLine left={"使用率"} center={currentLoad}/>
                            </Row>
                        </Column>
                    </Row>
                </Card>
            </Column>

        </Row>
        <RowColumn>
            <Card title={"物理信息"}>
                <TextLine left={"总内存"} right={sys.mem_total}/>
                <TextLine left={"cpu制造商"} right={sys.cpu_manufacturer}/>
                <TextLine left={"cpu品牌"} right={sys.cpu_brand}/>
                <TextLine left={"cpu逻辑核心"} right={sys.cpu_core_num}/>
                <TextLine left={"cpu物理核心"} right={sys.cpu_phy_core_num}/>
                <TextLine left={"cpu最大hz"} right={sys.cpu_speed_hz}/>
            </Card>
        </RowColumn>
    </Dashboard>
}
