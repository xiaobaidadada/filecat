import React from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";

export function UploadFile(props) {

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);

    return (
        <div>
            {showPrompt.data?.extra_data?.only_file ?
                <input
                    style={{"display": "none"}}
                    type="file"
                    id="upload-input"
                    onChange={(e) => {
                        showPrompt.data.call(e);
                    }}
                /> :
                <input
                    style={{"display": "none"}}
                    type="file"
                    id="upload-input"
                    multiple
                    onChange={(e) => {
                        showPrompt.data.call(e);
                    }}
                />}
            <input
                style={{"display": "none"}}
                type="file"
                id="upload-input-directory"
                webkitdirectory="true"
                multiple
                onChange={(e) => {
                    showPrompt.data.call(e);
                }}
            />
            <div className={"overlay"}></div>
            <div className="card floating">
                <div className="card-title">
                    <h2>上传</h2>
                </div>

                <div className="card-content">
                    <p>文件选项</p>
                </div>

                <div className="card-action full">
                    <div className="action" onClick={() => {
                        // @ts-ignore
                        // document.getElementById("upload-input-directory").value = "";
                        // @ts-ignore
                        document.getElementById("upload-input").click();
                    }}>
                        <i className="material-icons">insert_drive_file</i>
                        <div className="title">文件</div>
                    </div>
                    {!showPrompt.data?.extra_data?.only_file &&
                        <div className="action" onClick={() => {
                            // @ts-ignore
                            // document.getElementById("upload-input-directory").value = "";
                            // @ts-ignore
                            document.getElementById("upload-input-directory").click();
                        }}>
                            <i className="material-icons">folder</i>
                            <div className="title">文件夹</div>
                        </div>
                    }
                </div>
            </div>
        </div>
    )
}
