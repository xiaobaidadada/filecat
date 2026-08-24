import React, {useEffect, useState} from 'react'
import {useTranslation} from "react-i18next"
import {sysHttp} from "../../util/config"
import {RCode} from "../../../../common/Result.pojo"
import {NotySuccess, NotyFail} from "../../util/noty"
import {useAtom} from "jotai"
import {$stroe} from "../../util/store"
import {InputRow, InputText, Select} from '../../../meta/component/Input'

/**
 * systemd 服务可视化编辑面板内容（新建 / 编辑共用）。
 *
 * 本项目使用 set_prompt_card 弹框组件承载弹窗外壳，因此本组件只负责渲染内容区：
 *   - 「表单 / 文本」两种编辑形态，可随时切换且内容双向同步；
 *   - 表单模式：结构化填写常用字段，按模板拼装成 .service 内容（适合快速新建）；
 *   - 文本模式：直接编辑完整 .service 文本（适合微调 / 自定义复杂配置）；
 *   - 底部「保存」按钮（保存成功后关闭并触发 onDone）。
 *
 * 复用方式（配合 set_prompt_card）：
 *   set_prompt_card({
 *     open: true,
 *     title: t('新建 systemd 服务'),
 *     context_div: <SystemdEditor mode={mode} unit_name={...} onClose={close} onDone={refresh}/>,
 *   })
 *
 * 保存行为：
 *   新建：写 /etc/systemd/system/{unit}.service（systemd/sys/save 已支持新建文件+daemon-reload），
 *        再调用 systemd/add 自动加入实时监控；
 *   编辑：直接覆盖写回原有文件（绝对路径由 get/context 返回）。
 */

// .service 配置的常用字段，表单模式下的受控状态
interface ServiceForm {
    description: string;   // [Unit] Description= 服务描述
    type: string;          // Type= simple|forking|oneshot 等
    exec_start: string;    // ExecStart= 启动命令（必填）
    working_dir: string;   // WorkingDirectory= 工作目录（可选）
    user_: string;         // User= 运行用户（可选）
    restart: string;       // Restart= 重启策略
    wanted: string;        // [Install] WantedBy= 安装目标
}

const RESTART_OPTIONS = [
    {title: 'no（不自动重启）', value: 'no'},
    {title: 'always（总是重启）', value: 'always'},
    {title: 'on-failure（失败才重启）', value: 'on-failure'},
    {title: 'on-abnormal（异常才重启）', value: 'on-abnormal'},
]

const TYPE_OPTIONS = [
    {title: 'simple', value: 'simple'},
    {title: 'forking', value: 'forking'},
    {title: 'oneshot', value: 'oneshot'},
    {title: 'notify', value: 'notify'},
]

const WANTED_OPTIONS = [
    {title: 'multi-user.target', value: 'multi-user.target'},
    {title: 'network.target', value: 'network.target'},
]

// 空表单默认值
const defaultForm = (): ServiceForm => ({
    description: '',
    type: 'simple',
    exec_start: '',
    working_dir: '',
    user_: 'root',
    restart: 'no',
    wanted: 'multi-user.target',
})

// 根据表单字段生成 .service 内容
function buildService(unitName: string, form: ServiceForm): string {
    const lines: string[] = []
    lines.push('[Unit]')
    if (form.description.trim()) {
        lines.push(`Description=${form.description.trim()}`)
    } else {
        lines.push(`Description=${unitName}`)
    }
    lines.push('')
    lines.push('[Service]')
    lines.push(`Type=${form.type.trim() || 'simple'}`)
    if (form.exec_start.trim()) {
        lines.push(`ExecStart=${form.exec_start.trim()}`)
    }
    if (form.working_dir.trim()) {
        lines.push(`WorkingDirectory=${form.working_dir.trim()}`)
    }
    if (form.user_.trim()) {
        lines.push(`User=${form.user_.trim()}`)
    }
    if (form.restart && form.restart !== 'no') {
        lines.push(`Restart=${form.restart.trim()}`)
    }
    lines.push('')
    lines.push('[Install]')
    lines.push(`WantedBy=${form.wanted.trim() || 'multi-user.target'}`)
    lines.push('')
    return lines.join('\n')
}

// 解析已有 .service 文本回到表单字段（找不到的字段留空/默认）
function parseService(text: string): ServiceForm {
    const form = defaultForm()
    const get = (section: string, key: string): string => {
        // 匹配 target 小节后的 key=value；只取首个匹配
        const segs = text.split(/\r?\n/)
        let inSection = false
        for (const line of segs) {
            const trimmed = line.trim()
            const secMatch = trimmed.match(/^\[(.*)\]$/)
            if (secMatch) {
                inSection = (secMatch[1] || '').trim() === section
                continue
            }
            if (!inSection) continue
            const kv = trimmed.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'i'))
            if (kv) return kv[1].trim()
        }
        return ''
    }
    form.description = get('Unit', 'Description')
    form.type = get('Service', 'Type') || 'simple'
    form.exec_start = get('Service', 'ExecStart')
    form.working_dir = get('Service', 'WorkingDirectory')
    form.user_ = get('Service', 'User')
    form.restart = get('Service', 'Restart') || 'no'
    form.wanted = get('Install', 'WantedBy') || 'multi-user.target'
    return form
}

// 规范化服务名：统一带 .service 后缀
function normalizeUnit(name: string): string {
    return name.trim().endsWith('.service') ? name.trim() : `${name.trim()}.service`
}

export function SystemdEditor(props: {
    mode: 'create' | 'edit',
    unit_name?: string,          // edit 模式必填；create 模式可选作为初始名
    onClose: () => void,         // 关闭弹框（取消）
    onDone?: () => void,         // 保存成功后回调（父组件刷新列表/监控并关闭）
}) {
    const {t} = useTranslation()

    // 面板两种编辑形态切换：form=表单 / text=文本
    const [tab, setTab] = useState<'form' | 'text'>('form')
    // 服务名（不带 .service；create 模式可编辑修改，edit 模式由外部 unit_name 固定）
    const [unitName, setUnitName] = useState(() => (props.unit_name || '').replace(/\.service$/i, ''))
    const [form, setForm] = useState<ServiceForm>(defaultForm())
    const [text, setText] = useState('')
    // edit 模式已存在的文件绝对路径（由 get/context 返回），保存时原样写回
    const [path, setPath] = useState('')
    const [loading, setLoading] = useState(false)

    // 编辑模式：先拉取现有内容 + 绝对路径，预填到文本/表单
    useEffect(() => {
        if (props.mode !== 'edit' || !props.unit_name) return
        ;(async () => {
            setLoading(true)
            try {
                const rsq = await sysHttp.post('systemd/get/context', {unit_name: props.unit_name})
                if (rsq.code !== RCode.Success) return
                const content: string = rsq.data.context ?? ''
                const filePath: string = rsq.data.path ?? ''
                setPath(filePath)
                setText(content)
                setForm(parseService(content))
            } finally {
                setLoading(false)
            }
        })()
    }, [props.mode, props.unit_name])

    // 切换 tab 时做双向同步：表单 → 文本 / 文本 → 表单
    const switchTab = (next: 'form' | 'text') => {
        if (next === tab) return
        if (next === 'text') {
            setText(buildService(unitName, form))
        } else {
            setForm(parseService(text))
        }
        setTab(next)
    }

    // 表单通用更新函数
    const setField = (key: keyof ServiceForm) => (value: string) => {
        setForm(prev => ({...prev, [key]: value}))
    }

    // 校验并执行保存
    const doSave = async () => {
        if (!unitName.trim()) {
            NotyFail(t('请填写服务名称'))
            return
        }
        const unit = normalizeUnit(unitName)
        // 最终内容：始终以文本 tab 为准（切换时已由表单生成）
        const context = tab === 'text' ? text : buildService(unit, form)
        if (!context.includes('ExecStart=')) {
            NotyFail(t('请至少填写 ExecStart 启动命令'))
            return
        }
        setLoading(true)
        try {
            if (props.mode === 'create') {
                // 新建：写文件到 /etc/systemd/system/ + reload
                // （Http.post 对 code=Fail 会自动弹错并 throw，失败会走下方 catch）
                const savePath = `/etc/systemd/system/${unit}`
                await sysHttp.post('systemd/sys/save', {unit_name: unit, path: savePath, context})
                // 自动加入实时监控
                await sysHttp.post('systemd/add', {unit_name: unit})
                NotySuccess(t('添加成功'))
            } else {
                // 编辑：写回原有文件（绝对路径）+ reload
                await sysHttp.post('systemd/sys/save', {unit_name: unit, path, context})
                NotySuccess(t('保存成功'))
            }
            props.onClose()
            props.onDone?.()
        } catch (e) {
            // Http.post 内部已弹失败提示，这里仅阻止关闭即可
            console.error('systemd 保存失败', e)
        } finally {
            setLoading(false)
        }
    }

    // 渲染表单 tab：每一行用通用 InputRow（label + 控件）布局
    const renderForm = () => {
        return (
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.6rem'}}>
                <InputRow label={t('服务名称')}>
                    <InputText placeholder={t('服务名称')} value={unitName} disabled={props.mode === 'edit'}
                               handleInputChange={(v) => setUnitName(v)} width={'100%'}/>
                </InputRow>
                <InputRow label={t('服务描述')}>
                    <InputText placeholder={t('服务描述')} value={form.description}
                               handleInputChange={setField('description')} width={'100%'}/>
                </InputRow>
                <InputRow label={t('启动命令')} required>
                    <InputText placeholder={t('ExecStart 启动命令，必填')} value={form.exec_start}
                               handleInputChange={setField('exec_start')} width={'100%'}/>
                </InputRow>
                <InputRow label={t('运行类型')}>
                    <Select options={TYPE_OPTIONS} value={form.type} onChange={setField('type')}/>
                </InputRow>
                <InputRow label={t('工作目录')}>
                    <InputText placeholder={t('工作目录（可选）')} value={form.working_dir}
                               handleInputChange={setField('working_dir')} width={'100%'}/>
                </InputRow>
                <InputRow label={t('运行用户')}>
                    <InputText placeholder={t('运行用户（可选）')} value={form.user_}
                               handleInputChange={setField('user_')} width={'100%'}/>
                </InputRow>
                <InputRow label={t('重启策略')}>
                    <Select options={RESTART_OPTIONS} value={form.restart} onChange={setField('restart')}/>
                </InputRow>
                <InputRow label={t('安装目标')}>
                    <Select options={WANTED_OPTIONS} value={form.wanted} onChange={setField('wanted')}/>
                </InputRow>
            </div>
        )
    }

    // 渲染文本 tab：可直接编辑完整 .service 内容
    const renderText = () => {
        return (
            <textarea
                className="input--textarea input--no_border"
                style={{width: '100%', minHeight: '16rem', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box'}}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
            />
        )
    }

    return (
        <div>
            {/* 表单 / 文本 切换 */}
            <div style={{display: 'flex', gap: '0.4rem', marginBottom: '0.6rem'}}>
                <button className={`button button--flat ${tab === 'form' ? '' : 'button--grey'}`}
                        onClick={() => switchTab('form')}>{t('表单')}</button>
                <button className={`button button--flat ${tab === 'text' ? '' : 'button--grey'}`}
                        onClick={() => switchTab('text')}>{t('文本')}</button>
            </div>

            {/* 编辑区：表单 / 文本 */}
            {loading ? <div>{t('加载中...')}</div> : (tab === 'form' ? renderForm() : renderText())}

            {/* 底部操作：保存按钮 */}
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.6rem'}}>
                <button className="button button--flat button--grey" disabled={loading} onClick={props.onClose}>
                    {t('取消')}
                </button>
                <button className="button button--flat" disabled={loading} onClick={doSave}>
                    {t('保存')}
                </button>
            </div>
        </div>
    )
}
