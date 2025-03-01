
const fs = require('fs');
const path = require('path');

// 这些文件只能用于记录一个表的数据 如果需要删除 可以再额外添加元数据文件
// const filecat_meta_filename = "filecat_meta_filename.db"; // 1. 四字节 最后一个元素的位置 2. 总元素数量
const filecat_meta_list_filename = "filecat_meta_list_filename.db"; //  list 数组(每个元素都是 四字节) （用于直接访问指针元素的下标) 不能破坏这个结构
const filecat_data_filename = "filecat_data.db"; // 每个元素的格式都是 ` 1字节版本 四字节mate长度 ; 四字节 data 长度 ; 实际内容
const version = 1; // 数据库文件的请求头 一个字节 数据版本 256 个版本
let version_buffer = Buffer.alloc(1);
version_buffer.writeUInt8(version, 0);

// 版本1相关常量
const skip_headers_version_num = 1;
const skip_headers_metalen_num = 5;
const skip_headers_metalen_datalen_num = 9;

// 放在磁盘上的而不是内存
export class Base_data_util {

    base_dir; // 数据库的目录
    constructor(config) {
        this.base_dir = config.base_dir;
    }

    async init() {
        try {
            await fs.promises.access(path.join(this.base_dir, filecat_meta_list_filename),fs.constants.F_OK);
            return true;
        } catch {
            // 不存在
            await fs.promises.writeFile(path.join(this.base_dir, filecat_meta_list_filename), '');
        }
        try {
            await fs.promises.access(path.join(this.base_dir, filecat_data_filename),fs.constants.F_OK);
            return true;
        } catch {
            // 不存在
            await fs.promises.writeFile(path.join(this.base_dir, filecat_data_filename), '');
        }
    }

    /**
     * 插入数据
     * @param str_data 数据 字符串
     * @param meta_str_data 元数据 字符串
     */
    async insert(str_data,meta_str_data) {
        const meta_list_stats = fs.promises.stat(path.join(this.base_dir, filecat_data_filename));

        const start_postion = meta_list_stats.size; // 目前使用追加 直接 写入到文件的底部 没有删除功能
        const fd = await fs.promises.open(path.join(this.base_dir, filecat_data_filename), 'r+');  // 'r+' 表示可读写

        // 元数据
        const meta = Buffer.from(meta_str_data);
        // 内容
        const buffer = Buffer.from(str_data);

        // 元数据 用于查询做索引的
        const meta_buffer_len = Buffer.alloc(4);
        meta_buffer_len.writeUInt32LE(meta.length, 0);
        // 内容大小
        const data_buffer_len = Buffer.alloc(4);  // 创建一个长度为4字节的缓冲区
        data_buffer_len.writeUInt32LE(buffer.length, 0); // 将数字写入缓冲区，采用大端模式

        const insert_buffer = Buffer.concat([version_buffer,meta_buffer_len,data_buffer_len,meta, buffer ]);

        await fd.write( insert_buffer, 0, insert_buffer.length,start_postion)
        // fs.writeSync(fd, insert_buffer, 0, insert_buffer.length,start_postion );
        // fs.closeSync(fd);
        await fd.close();

        // 记录添加
        let buffer_start = Buffer.alloc(4);
        buffer_start.writeUInt32LE(start_postion, 0);
        await fs.promises.appendFile(path.join(this.base_dir, filecat_meta_list_filename),buffer_start);
        // fs.appendFileSync(path.join(this.base_dir, filecat_meta_list_filename),buffer_start);
    }

    async find_num() {
        const meta_list_stats = await fs.promises.stat(path.join(this.base_dir, filecat_meta_list_filename));
        return meta_list_stats.size / 4;
    }

    /**
     *  根据mate查询一个数据
     * @param judge_handle 过滤函数 参数为 index ， meta
     * @returns {null}
     */
    async find_one(judge_handle) {
        const list = await this.find_list(judge_handle);
        if(list.size === 0) {
            return null;
        }
        return list[0];
    }

    // 从头到尾的搜索没有索引 索引功能以后再添加
    async find_list(judge_handle){
        let position = 0;
        let buffer = Buffer.alloc(4); // 每个元素 都是 4
        let num = 0; // 元素位置从1开始
        const list_fd = await fs.promises.open(path.join(this.base_dir,filecat_meta_list_filename), "r");
        const data_fd = await fs.promises.open(path.join(this.base_dir, filecat_data_filename), 'r');
        const r = [];
        while (1) {
            const {bytesRead} = await list_fd.read( buffer,
                0, // 相对于当前的偏移位置
                buffer.length, // 读取的长度
                position // 当前位置 往前推进了一点
            );
            if(bytesRead < 4) {
                return r;
            }
            num++;
            let start = buffer.readUInt32LE(0);
            const meta = await this.get_meata(start,data_fd);
            if(judge_handle(num,meta)) {
                r.push({meta: meta, data: await this.get_data(start,data_fd),index:num})
            }
            position+=4;
        }
        await list_fd.close();
        await data_fd.close();
        // fs.closeSync(list_fd);
        // fs.closeSync(data_fd);
        return r;
    }

    // 从1开始
    async find_one_by_index(index) {
        if( index > await this.find_num() ) {
            return null;
        }
        const list_fd = await fs.promises.open(path.join(this.base_dir,filecat_meta_list_filename), "r");
        const data_fd = await fs.promises.open(path.join(this.base_dir, filecat_data_filename), 'r');
        let data_postion_buffer = Buffer.alloc(4);
        const { bytesRead} = await list_fd.read( data_postion_buffer,
            0, // 相对于当前的偏移位置
            data_postion_buffer.length, // 读取的长度
            (index-1) *4 // 当前位置 往前推进了一点
        );
        await list_fd.close();
        if(bytesRead<4) {
            await data_fd.close();
            return null;
        }
        let start = data_postion_buffer.readUInt32LE(0);
        const result = {meta: await this.get_meata(start,data_fd),data: await this.get_data(start,data_fd)};
        await data_fd.close();
        return result;
    }

    /**
     *  分页查询数据
     * @param page_num 第几页 可以为负数 那就是从后往前
     * @param page_size 页数内的元素数量 -1 是全部
     * @param not_data 不要数据 只要元数据
     * @returns {*[]}
     */
    async find_page(page_num,page_size,not_data = false) {
        if(page_size <= 0 && page_size !== -1) {
            page_size = 1;
        }
        const total_size = await this.find_num();
        const list_fd = await fs.promises.open(path.join(this.base_dir,filecat_meta_list_filename), "r");
        const data_fd = await fs.promises.open(path.join(this.base_dir, filecat_data_filename), 'r');
        const r_list = [];
        if(page_num >= 0) {
            if(page_num === 0)page_num =1;
            const start_index = (page_num -1)*page_size*4 ; // 第一个元素的下标
            let total = page_num * page_size ; // 实际上是最后一个元素的下标
            if(page_size === -1) {
                total = total_size;
            } else if( total > total_size ) {
                total = total_size;
            }

            let buffer = Buffer.alloc(4);
            let position =0;
            for (let i=start_index; i<total;i++) {
                position = i*4;
                const  { bytesRead} = await list_fd.read(buffer,
                    0, // 相对于当前的偏移位置
                    buffer.length, // 读取的长度
                    position // 当前位置 往前推进了一点
                );
                if(bytesRead < 4) {
                    break;
                }
                let start = buffer.readUInt32LE(0);
                const meta = await this.get_meata(start,data_fd);
                if(not_data) {
                    r_list.push({index:i+1,meta: meta});
                } else {
                    r_list.push({index:i+1,meta: meta, data: await this.get_data(start,data_fd)});
                }
            }
        } else {
            page_num =Math.abs(page_num);
            let start_index = total_size - (page_num-1) * page_size;// 实际上是最后一个元素的下标
            if(start_index < 0) {
                return r_list;
            }

            let buffer = Buffer.alloc(4);
            start_index--;
            let position = 4*start_index;
            while (position>=0) {
                const {bytesRead} = await list_fd.read( buffer,
                    0, // 相对于当前的偏移位置
                    buffer.length, // 读取的长度
                    position // 当前位置 往前推进了一点
                );
                if(bytesRead < 4) {
                    break;
                }
                let start = buffer.readUInt32LE(0);
                const meta = await this.get_meata(start,data_fd);
                if(not_data) {
                    r_list.push({index:Math.abs(start_index)+1,meta: meta});
                } else {
                    r_list.push({index:Math.abs(start_index)+1,meta: meta, data: await this.get_data(start,data_fd)});
                }
                if(page_size !== -1 && r_list.length === page_size) {
                    break;
                }
                start_index--;
                if(start_index <0)break;
                position = start_index*4;
            }
        }
        await list_fd.close();
        await data_fd.close();
        // fs.closeSync(list_fd);
        // fs.closeSync(data_fd);
        return r_list;
    }

    async get_data(start,fd) {
        if(start === undefined) {
            return null;
        }
        let file_fd = fd;
        if(!fd) {
            file_fd = await fs.promises.open(path.join(this.base_dir, filecat_data_filename), 'r');  // 'r+' 表示可读写
        }
        // meta 大小数据
        let meta_buffer_len = Buffer.alloc(4);
        await file_fd.read( meta_buffer_len, 0, 4, start+skip_headers_version_num);
        let meta_len = meta_buffer_len.readUInt32LE(0);  // 从 buffer 中读取小端字节序的数字

        // 内容 大小数据
        let data_buffer_len = Buffer.alloc(4);
        await file_fd.read( data_buffer_len, 0, 4, start+skip_headers_metalen_num);
        let data_len = data_buffer_len.readUInt32LE(0);  // 从 buffer 中读取小端字节序的数字

        let data_buffer = Buffer.alloc(data_len);
        await file_fd.read(data_buffer,0,data_buffer.length,start+skip_headers_metalen_datalen_num+meta_len);
        if(!fd) // 自己创建的需要关闭
            await file_fd.close();
            // fs.closeSync(file_fd);
        return data_buffer.toString();
    }

    async get_meata(start,fd) {
        let file_fd = fd;
        if(start === undefined) {
            return null;
        }
        let readBuffer = Buffer.alloc(4);  // 创建一个 4 字节的 buffer 用来存储读取的数据
        if(fd === undefined)
            file_fd = await fs.promises.open(path.join(this.base_dir, filecat_data_filename), 'r+');  // 'r+' 表示可读写
        await file_fd.read( readBuffer, 0, 4, start+skip_headers_version_num);
        let data_len = readBuffer.readUInt32LE(0);  // 从 buffer 中读取小端字节序的数字

        let data_buffer = Buffer.alloc(data_len);
        await file_fd.read(data_buffer,0,data_buffer.length,start+skip_headers_metalen_datalen_num); // 跳过 内容的4个字节
        if(!fd) // 自己创建的需要关闭
            await file_fd.close();
            // fs.closeSync(file_fd);
        return data_buffer.toString();
    }

}

// const ok = new Base_data_util({base_dir:path.join(__dirname,"test")});
// ok.init();
// // ok.insert("不是测试的数据456",JSON.stringify({name:"456"}));
// // ok.insert("不是测试的数据3",JSON.stringify({name:"1"}));
// console.log(ok.find_num())
// console.log(ok.find_one((index,meta)=>{
//     return JSON.parse(meta).name === "1"
// }))
// console.log(ok.find_page(1,-1))
// console.log(ok.find_one_by_index(3))