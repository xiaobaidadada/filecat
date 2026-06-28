import {Body, JsonController, Param, Post, Req} from "routing-controllers";
import {gcfgService} from "./gcfg.service";
import {Sucess} from "../../../other/Result";
import {GcfgExportConfig, GcfgFileContent} from "../../../../common/gcfg.pojo";

@JsonController("/gcfg")
export class GcfgController {

    /** 加载单个 gcfg 文件 */
    @Post('/load')
    async load(@Req() ctx, @Body() data: { path: string }) {
        return await gcfgService.loadGcfg(ctx.headers.authorization, decodeURIComponent(data.path));
    }

    /** 保存 gcfg 文件 */
    @Post('/save')
    async save(@Req() ctx, @Body() data: { path: string; content: GcfgFileContent }) {
        return await gcfgService.saveGcfg(ctx.headers.authorization, decodeURIComponent(data.path), data.content);
    }

    /** 加载目录下 gcfg 文件列表 */
    @Post('/list')
    async list(@Req() ctx, @Body() data: { dir: string; search?: string }) {
        return await gcfgService.loadGcfgList(ctx.headers.authorization, decodeURIComponent(data.dir), data.search);
    }

    /** 加载导出配置 */
    @Post('/export_config/load')
    async loadExportConfig(@Req() ctx, @Body() data: { dir: string }) {
        return await gcfgService.loadExportConfig(ctx.headers.authorization, decodeURIComponent(data.dir));
    }

    /** 保存导出配置 */
    @Post('/export_config/save')
    async saveExportConfig(@Req() ctx, @Body() data: { dir: string; config: GcfgExportConfig }) {
        return await gcfgService.saveExportConfig(ctx.headers.authorization,decodeURIComponent( data.dir), data.config);
    }

    /** 导出所有表 */
    @Post('/export')
    async exportAll(@Req() ctx, @Body() data: { dir: string }) {
        const dir = decodeURIComponent(data.dir);
        const cfg = await gcfgService.loadExportConfig(ctx.headers.authorization, dir);
        if (cfg.code !== 0) return cfg;
        return await gcfgService.exportAll(ctx.headers.authorization, dir, cfg.data);
    }
}
