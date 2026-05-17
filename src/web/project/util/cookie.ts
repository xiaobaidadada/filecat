const CookieUtils = {
    /**
     * 1. 增 / 改 (Set / Update)
     * @param {string} name - Cookie 的名称
     * @param {string} value - Cookie 的值
     * @param {number} [days] - 有效天数 (不传则为 Session Cookie，关闭浏览器即失效)
     * @param {string} [path='/'] - 作用路径，默认为全局根路径 '/'
     */
    set(name, value, days, path = '/') {
        let expires = '';
        if (days) {
            const date = new Date();
            // 将天数转换为毫秒数并累加
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = `; expires=${date.toUTCString()}`;
        }
        // 使用 encodeURIComponent 编码，防止特殊字符（如分号、空格、中文）破坏 Cookie 结构
        document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${expires}; path=${path}`;
    },

    /**
     * 2. 查 (Get)
     * @param {string} name - Cookie 的名称
     * @returns {string|null} - 返回对应的值，若不存在则返回 null
     */
    get(name) {
        const nameEQ = `${encodeURIComponent(name)}=`;
        // 将 document.cookie 字符串按分号拆分成数组
        const ca = document.cookie.split(';');

        for (let i = 0; i < ca.length; i++) {
            let c = ca[i].trim(); // 清除前导空格
            // 如果找到了对应的键名
            if (c.indexOf(nameEQ) === 0) {
                // 截取键值并解码返回
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    },

    /**
     * 3. 判断是否存在 (Has)
     * @param {string} name - Cookie 的名称
     * @returns {boolean} - 是否存在
     */
    has(name) {
        return this.get(name) !== null;
    },

    /**
     * 4. 删 (Delete)
     * @param {string} name - Cookie 的名称
     * @param {string} [path='/'] - 写入时指定的路径 (必须保持一致才能删除成功)
     */
    delete(name, path = '/') {
        // 核心原理：将其过期时间设置为 1970 年的绝对过去时间，强迫浏览器立即清理
        this.set(name, '', -1, path);
    },

    /**
     * 5. 清空全部 (Clear All)
     * 注意：此方法只能清空“当前作用域/当前路径”下前端 JS 有权限读取的所有 Cookie
     */
    clearAll() {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf('=');
            const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();

            // 尝试用根路径和当前路径双重保险进行删除
            this.delete(decodeURIComponent(name), '/');
            this.delete(decodeURIComponent(name), '');
        }
    }
};

// 如果是 ES6 模块环境，可以取消下行的注释进行导出
export default CookieUtils;