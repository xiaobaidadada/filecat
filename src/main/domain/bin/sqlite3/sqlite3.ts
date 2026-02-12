const path = require('path');
const sqlite3 = require("sqlite3/build/Release/node_sqlite3.node");
// npm 的时候直接有  exe的时候也有
const EventEmitter = require('events').EventEmitter;
module.exports = exports = sqlite3;

function normalizeMethod(fn: Function) {
    return function(sql: string, ...args: any[]) {
        let errBack;
        if (typeof args[args.length - 1] === 'function') {
            const callback = args[args.length - 1];
            errBack = function(err: any) {
                if (err) callback(err);
            };
        }
        const statement = new sqlite3.Statement(this, sql, errBack);
        return fn.call(this, statement, args);
    };
}

function inherits(target: any, source: any) {
    for (const k in source.prototype) target.prototype[k] = source.prototype[k];
}

const Database = sqlite3.Database;

// ==== Database 缓存功能 ====
sqlite3.cached = {
    objects: {},
    Database: function(file: string, a?: any, b?: any) {
        if (file === '' || file === ':memory:') {
            return new Database(file, a, b);
        }

        file = path.resolve(file);

        if (!sqlite3.cached.objects[file]) {
            sqlite3.cached.objects[file] = new Database(file, a, b);
        } else {
            const db = sqlite3.cached.objects[file];
            const callback = (typeof a === 'number') ? b : a;
            if (typeof callback === 'function') {
                function cb() { callback.call(db, null); }
                if (db.open) process.nextTick(cb);
                else db.once('open', cb);
            }
        }

        return sqlite3.cached.objects[file];
    }
};

// ==== 继承 EventEmitter ====
inherits(Database, EventEmitter);

// ==== Database 方法包装 ====
Database.prototype.prepare = normalizeMethod(function(statement: any, params: any[]) {
    return params.length ? statement.bind.apply(statement, params) : statement;
});

Database.prototype.run = normalizeMethod(function(statement: any, params: any[]) {
    statement.run.apply(statement, params).finalize();
    return this;
});

Database.prototype.get = normalizeMethod(function(statement: any, params: any[]) {
    statement.get.apply(statement, params).finalize();
    return this;
});

Database.prototype.all = normalizeMethod(function(statement: any, params: any[]) {
    statement.all.apply(statement, params).finalize();
    return this;
});

Database.prototype.each = normalizeMethod(function(statement: any, params: any[]) {
    statement.each.apply(statement, params).finalize();
    return this;
});

Database.prototype.map = normalizeMethod(function(statement: any, params: any[]) {
    statement.map.apply(statement, params).finalize();
    return this;
});

// ==== Database 事件支持 ====
const supportedEvents = ['trace', 'profile', 'change'];

Database.prototype.addListener = Database.prototype.on = function(type: string, listener: Function) {
    const val = EventEmitter.prototype.addListener.apply(this, arguments);
    if (supportedEvents.indexOf(type) >= 0) {
        this.configure(type, true);
    }
    return val;
};

Database.prototype.removeListener = function(type: string) {
    const val = EventEmitter.prototype.removeListener.apply(this, arguments);
    if (supportedEvents.indexOf(type) >= 0 && !this._events[type]) {
        this.configure(type, false);
    }
    return val;
};

Database.prototype.removeAllListeners = function(type: string) {
    const val = EventEmitter.prototype.removeAllListeners.apply(this, arguments);
    if (supportedEvents.indexOf(type) >= 0) {
        this.configure(type, false);
    }
    return val;
};
