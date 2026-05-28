import React, { ReactNode, createContext, useContext, useState, useEffect } from 'react';


const TabsContext = createContext<{
    activeKey: string;
    setActiveKey: (key: string) => void;
}>({ activeKey: '', setActiveKey: () => {} });

export interface TabsProps {
    activeKey?: string;
    defaultActiveKey?: string;
    onChange?: (key: string) => void;
    children?: ReactNode;
    width?: string;
}

export function Tabs(props: TabsProps) {
    const { children, activeKey: controlledKey, defaultActiveKey, onChange, width } = props;

    const [localActiveKey, setLocalActiveKey] = useState(() => {
        return controlledKey ?? defaultActiveKey ?? '';
    });

    useEffect(() => {
        if (controlledKey !== undefined) {
            setLocalActiveKey(controlledKey);
        }
    }, [controlledKey]);

    const handleTabChange = (key: string) => {
        if (controlledKey === undefined) {
            setLocalActiveKey(key);
        }
        if (onChange) {
            onChange(key);
        }
    };

    const tabsHeaders: { key: string; tab: ReactNode; disabled?: boolean }[] = [];

    React.Children.forEach(children, (child) => {
        if (React.isValidElement(child) && child.type === TabPanel) {
            tabsHeaders.push({
                key: child.props.itemKey,
                tab: child.props.tab,
                disabled: child.props.disabled,
            });
        }
    });

    useEffect(() => {
        if (!localActiveKey && tabsHeaders.length > 0) {
            setLocalActiveKey(tabsHeaders[0].key);
        }
    }, [tabsHeaders, localActiveKey]);

    return (
        <TabsContext.Provider value={{ activeKey: localActiveKey, setActiveKey: handleTabChange }}>
            {/* 🌟 外部宽度仍然推荐保留行内，方便在使用处动态传入定制 */}
            <div className="modern-tabs-container" style={{ width: width || '100%' }}>

                {/* 🌟 导航条 */}
                <div className="modern-tabs-nav">
                    {tabsHeaders.map((header) => {
                        const isActive = localActiveKey === header.key;

                        // 动态组合类名
                        const classNames = [
                            'input', // 保留你原有的 input 基础风格
                            'modern-tabs-tab',
                            isActive ? 'active' : '',
                            header.disabled ? 'disabled' : ''
                        ].filter(Boolean).join(' ');

                        return (
                            <div
                                key={header.key}
                                className={classNames}
                                onClick={() => !header.disabled && handleTabChange(header.key)}
                            >
                                {header.tab}
                            </div>
                        );
                    })}
                </div>

                {/* 🌟 内容承载区 */}
                <div className="modern-tabs-content">
                    {children}
                </div>
            </div>
        </TabsContext.Provider>
    );
}

export interface TabPanelProps {
    itemKey: string;
    tab: ReactNode;
    children?: ReactNode;
    disabled?: boolean;
}

export function TabPanel(props: TabPanelProps) {
    const { itemKey, children } = props;
    const { activeKey } = useContext(TabsContext);

    const isActive = activeKey === itemKey;

    return (
        <div className={`modern-tab-panel ${isActive ? 'active' : ''}`}>
            {children}
        </div>
    );
}