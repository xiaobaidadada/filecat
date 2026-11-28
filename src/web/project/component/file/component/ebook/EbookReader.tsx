import React from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import OfficeEditorShell from "../office/OfficeEditorShell";
import EbookView from "./EbookView";

/**
 * 电子书全屏阅读器：外壳走 OfficeEditorShell，阅读逻辑在 EbookView。
 */
export default function EbookReader() {
    const [reader, setReader] = useAtom($stroe.ebook_reader);

    const close = () => {
        const fn = reader.close;
        setReader({});
        fn?.();
    };

    return (
        <OfficeEditorShell name={reader.name} on_close={close}>
            <EbookView url={reader.url as string} name={reader.name}/>
        </OfficeEditorShell>
    );
}
