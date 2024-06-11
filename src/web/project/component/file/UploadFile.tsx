import React from 'react';

export function UploadFile(props) {
    return (
        <div>
            <input
                style={{"display": "none"}}
                type="file"
                id="upload-input"
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
                        document.getElementById("upload-input").value = "";
                        // @ts-ignore
                        document.getElementById("upload-input").click();
                    }}>
                        <i className="material-icons">insert_drive_file</i>
                        <div className="title">文件</div>
                    </div>
                    <div className="action">
                        <i className="material-icons">folder</i>
                        <div className="title">文件夹</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
