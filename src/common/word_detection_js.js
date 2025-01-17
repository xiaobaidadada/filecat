class Node {
    char; // 也是key
    children;
    is_end;

    constructor() {
        this.children = new Map();
        this.char = "";
        this.is_end = false;
    }
}


export class word_detection_js {
    root;
    size;

    constructor() {
        this.root = new Node(); // 根节点的字符是空的
        this.size = 0;
    }

    add(str) {
        if (!str) {
            return;
        }
        str = str.trim();
        let node = this.root;
        for (const char of str) {
            // 不断的给子节点添加子节点
            let ret = node.children.get(char);
            if (ret == null) {
                ret = new Node();
                ret.char = char;
                node.children.set(char, ret);
            }
            node = ret;
        }
        node.is_end = true;
    }

    clear() {
        this.root = undefined;
    }

    /**
     * 与detection_next_one_word作用一样但是是返回一个数组多个
     * @param word
     * @param dif_char 允许有多个不一样的，但是这多个不一样的字符是从这个字符开始的 一般设置为 . 设置为空的话会全部返回
     */
    detection_next_list_word(word,dif_char = undefined) {
        const r_list = [];
        if (!word || !this.root) r_list;
        let now_node = this.root;
        for (let i = 0; i < word.length; i++) {
            const v = now_node.children.get(word[i]);
            if (v == null) {
                continue;
            }
            now_node = v;
        }
        // 基本字符都匹配上了现在来看看有没有多余的
        if (now_node.is_end) {
            r_list.push(word);
        }
        if(!now_node.children) {
            return  r_list;
        }
        const ok_children_list = [];// 前面的都匹配上了
        if(dif_char!==undefined) {
            const dif_char_node = now_node.children.get(dif_char);
            if(dif_char_node !== undefined && dif_char_node.children !== undefined) {
                for (const node of dif_char_node.children.values()) {
                    node.word = word+dif_char;
                    ok_children_list.push(node);
                }
            }
        } else {
            for (const node of now_node.children.values()) {
                node.word = word;
                ok_children_list.push(node);
            }
        }
        // 剩下的必须唯一 不然就太多了
        for (let i = 0; i < ok_children_list.length; i++) {
            let node = ok_children_list[i];
            let str = node.word;
            while (node != null) {
                if (node.is_end) {
                    str += node.char;
                    r_list.push(str);
                    break;
                }
                if (node.children !== undefined) {
                    // 还有子节点
                    if (node.children.size === 1) {
                        str += node.char;
                        node = node.children.values().next().value; // 获取唯一的元素值
                    } else {
                        break; // 不唯一返回吧
                    }
                } else {
                    if (node.is_end) {
                        // 没有子节点了 is_end 也是true 不做判断了 直接返回吧
                        str += node.char;
                        r_list.push(str);
                        break;
                    } else {
                        // 既没有子节点 也不是最后一个字节 数据是有问题的只能忽略了
                        break;
                    }
                }
            }
        }

        return r_list;
    }

    /**
     * 如果接下来只剩一个匹配(尽可能的往前匹配) 会把这个直接返回 探测接下来是不是就剩一个单词了
     * 如果结果一样就不返回了
     * @param word 单词 而不是被检测的文本
     * @param prefer_char 优先字符 添加这个词后 最后匹配到多个 会优先匹配一下这样的词 再看看是否唯一 不支持词语 一般设置为 .
     * @return str or undefined
     */
    detection_next_one_word(word, prefer_char=undefined) {
        if (!word || !this.root) return;
        let now_node = this.root;
        for (let i = 0; i < word.length; i++) {
            const v = now_node.children.get(word[i]);
            if (v == null) {
                return;
            }
            now_node = v;
        }
        if (now_node.is_end) {
            return undefined; // 一样的话就不返回了
        }
        if (now_node.children !== undefined) {
            if (now_node.children.size === 1) {
                // 只有一个元素 跳过最后一个字符
                now_node = now_node.children.values().next().value;
            } else if (prefer_char !== undefined) {
                // 有优先字符查找是否有优先字符
                now_node = now_node.children.get(prefer_char);
            }
        }
        // 前面的都匹配的有了
        while (now_node != null) {
            if (now_node.is_end) {
                word += now_node.char;
                return word;
            }
            if (now_node.children !== undefined) {
                // 还有子节点
                if (now_node.children.size === 1) {
                    word += now_node.char;
                    now_node = now_node.children.values().next().value; // 获取唯一的元素值
                } else {
                    return; // 不唯一返回吧
                }
            } else {
                if (now_node.is_end) {
                    // 没有子节点了 is_end 也是true 不做判断了 直接返回吧
                    return word;
                } else {
                    // 既没有子节点 也不是最后一个字节 数据是有问题的只能忽略了
                    return;
                }
            }

        }
        // 返回特殊的return
    }

}

// const test = new word_detection_js();
// test.add("node.exe")
// test.add("node")
// test.add("cmd.exe")
// test.add("powershell.exe")
//
// console.log(test.detection_next_list_word("node",))