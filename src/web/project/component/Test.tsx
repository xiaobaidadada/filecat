import React, {useEffect, useRef, useState} from 'react'

import {Column, Menu, Row, RowColumn} from "../../meta/component/Dashboard";

const menuRots = [{index: 1, name: "ok", rto: "a/"}, {index: 2, name: "ok2", rto: "b/"}, {
    index: 3,
    name: "ok2",
    rto: "c/"
}];

export function  Test() {

    return  <Menu optionList={menuRots}>
        <RowColumn >
            <div className={"card"}>
                <div className={"card-title"}>
                    测试
                </div>
                <div className={"card-content"}>
                    <select className={"input input--block"}>
                        <option>中文</option>
                    </select>
                </div>
                <div className={"card-action"}>
                    12
                </div>
            </div>
        </RowColumn>
        <RowColumn >
            <form className={"card"}>
                <div className={"card-title"}>123</div>
                <div className={"card-content"}>
                    <p>q</p>
                    <p>w</p>
                </div>
                <div className={"card-action"}>
                    <input type="submit" className="button button--flat" value="更新"/>
                </div>
            </form>
        </RowColumn>
        <Row >
            <Column className={"column"}>
                <form className={"card"}>
                    <div className={"card-title"}>123</div>
                    <div className={"card-content"}>
                        <div className="collapsible">
                            123456
                            <div className="collapse"><textarea
                                className="input input--block input--textarea"></textarea></div>
                        </div>
                    </div>
                    <div className={"card-action"}>
                        <input type="submit" className="button button--flat" value="更新"/>
                    </div>
                </form>
            </Column>
            <Column className={"column"}>
                <form className={"card"}>
                    <div className={"card-title"}>123</div>
                    <div className={"card-content"}>
                        <div className="collapsible">
                            123456
                            <div className="collapse"><textarea
                                className="input input--block input--textarea"></textarea></div>
                        </div>
                    </div>
                    <div className={"card-action"}>
                        <input type="submit" className="button button--flat" value="更新"/>
                    </div>
                </form>
            </Column>
        </Row>
    </Menu>
}
