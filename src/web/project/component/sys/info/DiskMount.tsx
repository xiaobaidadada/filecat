import {useTranslation} from "react-i18next";
import React, {useEffect, useState} from "react";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {ws} from "../../../util/ws";
import {
    DiskCheckInfo,
    DiskDevicePojo,
    DiskFilePojo,
    staticSysPojo,
    SysCmd,
    SysPojo
} from "../../../../../common/req/sys.pojo";
import {sysHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {SysSoftware} from "../../../../../common/req/setting.req";
import {Card, CardFull, StatusCircle, TextTip} from "../../../../meta/component/Card";
import {ActionButton, ButtonLittle, ButtonLittleStatus} from "../../../../meta/component/Button";
import {NotyFail, NotySucess} from "../../../util/noty";
import Header from "../../../../meta/component/Header";
import {
    Column,
    Dashboard,
    FlexContainer,
    FullScreenContext,
    Row,
    RowColumn,
    TextLine
} from "../../../../meta/component/Dashboard";
import CircleChart from "../../../../meta/component/CircleChart";
import {Table} from "../../../../meta/component/Table";
import {FullScreenDiv} from "../../../../meta/component/Dashboard";
import {InputText} from "../../../../meta/component/Input";
import TreeView from "../../../../meta/component/TreeView";
import {vg_item} from "../../../../../common/req/common.pojo";
import {FileMenuData} from "../../../../../common/FileMenuType";
import {FileTypeEnum} from "../../../../../common/file.pojo";
import {PromptEnum} from "../../prompts/Prompt";
import {editor_data, user_click_file} from "../../../util/store.util";
import {getRouterPrePath} from "../../../util/WebPath";

// todo 需要优化做成通用组件
const Lvm = (props:{name:string,lvms:{name:string}[]}) => {

    return (
        <div style={{ border: '2px solid black', padding: '10px', width: '300px', height: '300px', position: 'relative' }}>
            {props.name}
            {props.lvms.map((bundle, index) => (
                <div
                    key={index}
                    style={{
                        margin: '5px',
                        height: `${40}px`, // 根据大小设置高度
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid ',
                    }}
                >
                    {bundle.name}
                </div>
            ))}
        </div>
    );
};

function  LvRow() {
    return <div style={{
        position: 'relative',
        height: '300px',
        margin: '10px',
        width: '30px', // 设置宽度以容纳箭头
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    }}>
        <div style={{
            width: 0,
            height: 0,
            borderTop: '10px solid transparent',
            borderBottom: '10px solid transparent',
            borderLeft: '10px solid black', // 箭头颜色
        }}/>
    </div>
}

export function DiskMount() {
    const {t} = useTranslation();
    const [disk_check, set_disk_check] = useRecoilState($stroe.disk);
    const [info, set_info] = useState({} as DiskCheckInfo);
    const [list, set_list] = useState([]);
    const [info_list, set_info_list] = useState([]);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);

    const [lvm_list,set_lvm_list] = useState([] as vg_item[]);

    const { click_file } = user_click_file();
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const diskheaders = [t("挂载点"),"uuid", t("类型"), t("文件系统类型"), t("文件系统容量"),t("卷容量"), t("设备路径"), t("分区表类型")];

    const get_blk = async () => {
        const rsq2 = await sysHttp.get("disk/blk");
        if (rsq2.code === RCode.Sucess) {
            set_list(rsq2.data)
        }
        return rsq2.code
    }

    const get_lvm = async  ()=> {
        const rsq2 = await sysHttp.get("disk/lvm");
        if (rsq2.code === RCode.Sucess) {
            set_lvm_list(rsq2.data)
        }
    }
    const init = async () => {
        get_blk();
        // todo linux上的 操作与展示待更新 文件系统格式化 磁盘分区 等功能
        // get_lvm();
    }

    useEffect(() => {
        init();
    }, [info]);

    const handleContextMenu = (event, data) => {
        event.preventDefault();
        const pojo = new FileMenuData();
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.type = FileTypeEnum.dev;
        pojo.extra_data = data;
        pojo.call = get_blk;
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };
    // 渲染节点
    const node_render_pd = (data:any)=> {
        let name = data.name;
        if (data.label) {
            name += `(${data.label})`;
        }
        if (data.mountpoint) {
            return (<span>
                {name}
                <span style={{
                    color: "green"
                }}>
                (已挂载)
            </span>
            </span>)
        }
        return name;
    }
    return <div>
        <Header>
            <ActionButton icon={"close"} title={t("关闭")} onClick={() => {
                set_disk_check({});
            }}/>
        </Header>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <Row>
                    <Column widthPer={40}>
                        <Card title={t("物理块(硬盘)设备、逻辑卷、物理卷")} titleCom={ <div>
                            <ActionButton icon={"file_open"} title={t("打开挂载文件")} onClick={async () => {
                                click_file({name:"fstab(谨慎修改，内容错误会导致系统无法启动)",model:"text",sys_path:"etc/fstab",menu_list:[
                                        <ActionButton icon={"info"} title={t("提示")} onClick={async () => {
                                            set_prompt_card({open:true,title:"信息",context_div : (
                                                    <div >
                                                        <ul>
                                                            <li>通用格式:{"<文件系统> <挂载点> <类型> <挂载选项> <dump> <fsck> "}</li>
                                                            <li>文件系统，有多种格式
                                                                <ul>
                                                                    <li>1(usb口默认名称)./dev/sda1</li>
                                                                    <li>2(唯一Id).UUID=123e4567-e89b-12d3-a456-426614174000</li>
                                                                    <li>3.LABEL=DATA</li>
                                                                </ul>
                                                            </li>
                                                            <li>挂载点，就是文件路径，例如 /mnt/data ，这个目录要提前创建，且为空</li>
                                                            <li>类型，就是文件系统类型，对于系统不支持的类型，例如ntfs需要额外前提安装ntfs-3g</li>
                                                            <li>挂载选项的值只能是以下这些，可以用 "," 同时使用多个选项
                                                                <ul>
                                                                    <li>defaults：使用默认挂载选项</li>
                                                                    <li>noatime：不更新访问时间，提高性能</li>
                                                                    <li>auto：系统启动时自动挂载</li>
                                                                    <li>rw：以读写方式挂载</li>
                                                                    <li>nofail：防止启动阻塞，挂载失败系统继续执行</li>
                                                                    <li>...等</li>
                                                                </ul>
                                                            </li>
                                                            <li>dump 0是需要备份 1是不需要备份</li>
                                                            <li>Fsck 整数值0是不检查，文件系统检查顺序越小越先检查</li>
                                                            <li>提示：只有含有文件系统的逻辑卷，或者分区才可以进行挂载。</li>
                                                        </ul>
                                                    </div>
                                                )})
                                        }}/>,
                                        <ActionButton key ={1} icon={"update"} title={t("更新挂载")} onClick={async () => {
                                            const rsq2 = await sysHttp.post("cmd/exe",{type:SysCmd.mount});
                                            if (rsq2.code === RCode.Sucess) {
                                                NotySucess("挂载文件已生效")
                                            }
                                        }}/>
                                    ]});
                            }}/>
                            <ActionButton icon={"update"} title={t("刷新")} onClick={async () => {
                                if (await get_blk() === RCode.Sucess) {
                                    NotySucess("刷新成功")
                                };
                            }}/>
                        </div>}>
                                <Table headers={diskheaders} rows={info_list} width={"10rem"}/>
                                <TreeView list={list} render={node_render_pd} onContextMenu={handleContextMenu} click={(item)=>{
                                    let mountpoint = "";
                                    if(item.mountpoint) {
                                        for (let i=0;i<item.mountpoints.length;i++) {
                                            mountpoint+=item.mountpoints[i]+";";
                                        }
                                    }
                                    // 物理类型的不存在文件系统的只有大小，不是物理类型的只有文件系统大小 通常如果一个分区对应着一块硬盘 这个分区也会有物理size字段
                                    set_info_list([[<TextTip>{mountpoint}</TextTip>,<TextTip>{item.uuid}</TextTip>,t(item.type),t(item.fstype),item.fssize ,item.size,<TextTip>{item.path}</TextTip>,item.pttype]]);
                                } } />
                            </Card>
                    </Column>
                    <Column widthPer={60}>
                        {
                            lvm_list.map((item,index)=> {
                                const pvs = [];
                                for (const item1 of item.pv_list) {
                                    pvs.push({
                                        name:`${item1.name}---(${item1.size})---(${item1.free_size})`
                                    })
                                }
                                const lvs = [];
                                for (const item1 of item.lv_list) {
                                    lvs.push({
                                        name:`${item1.name}---(${item1.size})`
                                    })
                                }
                                // @ts-ignore
                                return  <Card key={index}>
                                    <FlexContainer>
                                        <Lvm name={t("物理卷")} lvms={pvs}/>
                                        <LvRow />
                                        <Lvm name={`${t("逻辑卷")}---(${item.name})---size(${item.size})`} lvms={[]}/>
                                        <LvRow />
                                        <Lvm name={t("逻辑卷")} lvms={lvs}/>
                                    </FlexContainer>
                                </Card>
                            })
                        }

                    </Column>
                </Row>
            </FullScreenContext>
        </FullScreenDiv>
    </div>
}