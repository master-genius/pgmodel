'use strict';

class pqmodel {

  constructor (pqorm = null) {
    if (pqorm) {
      this.orm = pqorm;
      this.db = pqorm.db;
    }

    this.autoId = true;

    this.selectField = '*';

    this.tableName = null;

    this.primaryKey = 'id';

    this.lastError = null;

    this.idCount = parseInt(Math.random() * 100) + 1;

    this.idPre = '';

    this.pagesize = 20;

    this.dataTypeMap = {
      'varchar':    'character varying',
      'char':       'character',
      'text':       'text',

      'decimal':    'numeric',
      'numeric':    'numeric',
      'integer':    'integer',
      'smallint':   'smallint',
      'bigint':     'bigint',
      
      'boolean':    'boolean',

      //二进制类型
      'bytea':      'bytea',

      'date':       'date',
      'time':       'time without time zone',
      'timestamp':  'timestamp without time zone',
      'timestamptz': 'timestamp with time zone',
    };

    this.numerics = [
      'smallint','bigint','integer','decimal','numeric'
    ];

    this.strings = [
      'char', 'varchar', 'text'
    ];

    this.times = [
      'date','time','timestamp','timestampz'
    ];

    //需要携带括号的类型
    this.typeWithBrackets = [
      'character varying', 'character', 'decimal', 'numeric'
    ];

    this.defaultWithType = [
      'varchar', 'char', 'text', 'bytea', 'timestamp', 'timestampz', 'date', 'time'
    ];

  }

  relateCache = {};

  /**
   * 关联一个模型并返回，要求m必须是已经初始化好的。
   * 名称是必须要有的，后续会通过名称查询缓存。
   * 路径可以不传，此时如果name没有查询到，会返回null。
   */

  relate (name, path = '') {
    
    if (this.relateCache[name]) {
      return this.relateCache[name];
    }

    if (!path) {
      return null;
    }

    try {
      let m = require(path);
      this.relateCache[name] = new m(this.orm);
      return this.relateCache[name];
    } catch (err) {
      console.error(err);
      return null;
    }

  }

  model (tableName = null, schema = null) {
    return this.orm.model(tableName || this.tableName, schema);
  }

  makeId (cint = 0) {
    let tm = Date.now() * (parseInt(Math.random() * 4) + 1) + 1010101010111;

    let rand = parseInt( (Math.random() * 10240) + 11111 );
  
    let id = `${tm.toString(16)}${rand.toString(16)}`;
  
    if (cint > 0) {
      id += `${cint.toString(16)}`;
    }
  
    return `${this.idPre}${id}`;
  }

  async insert (data) {
    this.idCount += 1;
    if (this.idCount > 1001) {
      this.idCount = 1;
    }

    if (data[this.primaryKey] === undefined && this.autoId) {
      data[this.primaryKey] = this.makeId(this.idCount + 1011);
    }

    let r = await this.model().insert(data);

    if (r.rowCount <= 0) {
      return false;
    }

    return data[this.primaryKey];
  }

  async insertAll (data) {
    if (!(data instanceof Array)) {
      return false;
    }
    let idlist = [];
    if (this.autoId) {
      for (let i=0; i < data.length; i++) {
        if (data[i][this.primaryKey] === undefined) {
          data[i].id = this.makeId(i+1000);
        }
        idlist.push(data[i].id);
      }
    }

    let r = await this.model().insertAll(data);
    if (r.rowCount <= 0) {
      return false;
    }

    return idlist || r.rowCount;
  }

  async update (cond, data) {
    let r = await this.model().where(cond).update(data);
    return r.rowCount;
  }

  async list (cond, args = {pagesize:20, offset:0, order: ''}) {
    let t = this.model().where(cond);
    if (args.pagesize && args.offset !== undefined) {
      t = t.limit(args.pagesize, args.offset);
    } else {
      t = t.limit(this.pagesize, 0);
    }
    
    if (args.order) {
      t = t.order(args.order);
    }
    
    let r = await t.select(args.selectField || this.selectField);

    return r.rows;

  }

  async get (cond, fields = null) {
    let r = await this.model().where(cond).select(fields || this.selectField);
    if (r.rowCount <= 0) {
      return null;
    }
    return r.rows[0];
  }

  async delete (cond) {
    let r = await this.model().where(cond).delete();
    return r.rowCount;
  }

  async count (cond = {}) {
    let total = await this.model().count(cond);
    return total;
  }

  async transaction (callback) {
    
    if (typeof callback !== 'function' || callback.constructor.name !== 'AsyncFunction') {
      throw new Error('callback must be async function');
    }

    let self = this;

    return await this.model().transaction(async (db) => {
      let ret = {
        failed: false,
        errmsg : ''
      };

      //只有db才是事物安全的，可以保证原子操作，self只是为了方便访问其他数据。
      await callback(db, self, ret);

      return ret;
    });
  }

  /**
   * 
   * Sync仅支持一种操作：从模型同步到数据库，方便在修改程序后，直接同步到数据库，
   * 而如果要从数据库同步到程序文件，则需要独立出模型文件，这很麻烦，而且双向操作容易出问题。
   * 因为Postgresql的复杂度，并且此工具主要作为Web服务场景，所以类型支持不会很全面，只支持常用几种类型，
   * 而对于索引，不做复杂的支持，可以通过数据库完成。
   * 目前来说，索引是为了简单化处理存在的，所以默认的，index字段使用数组。数组中的值就是要创建索引的字段。
   * 而对于复杂的索引以及其他情况则需要自己处理。
   * 这里创建的索引采用自动化的形式，也就是交给postgresql自行处理。
   * 
   * table结构：
   * 
   * {
   *    column : {
   *      id : {
   *          type : 'varchar(20)',
   *          notNull : true,
   *          default : ''
   *      },
   *      username : {
   *          type : 'varchar(40)',
   *          notNull : true,
   *          default : ''
   *      },
   *      passwd : {
   *          type : 'varchar(200)',
   *          notNull : true,
   *          default : ''
   *      }
   *    },
   *    index : [
   *    ],
   *    //唯一索引
   *    unique : [
   *    ]
   * 
   * }
   * 
   * 为了数据安全，检测到数据库没有字段会添加，但是如果程序没有编写字段，数据库有字段不会删除。
   * 确定是否为字段重命名，需要提供一个oldName字段，只要存在此字段并且检测到当前oldName确实和存在的字段相同，则会进行重命名处理。
   * 这时候，如果需要再次重命名，则可以修改字段的key值，并让oldName保存之前的key值。
   * 
   */
  
  async CreateSchema (schema) {
    return await this.db.query(`create schema if not exists ${schema}`);
  }

  async Sync (debug=false) {

    if (!this.table) {
      console.error('没有table对象');
      return false;
    }

    if (this.table.column === undefined || typeof this.table.column !== 'object') {
      console.error('column属性必须为object类型');
      return false;
    }

    if (Object.keys(this.table.column).length <= 0) {
      console.error('column没有定义字段');
      return false;
    }

    let database = this.db.options.database;
    let curTableName = `${this.orm.schema}.${this.tableName}`;

    let sql = `select * from information_schema.tables where table_catalog=$1 and table_schema=$2 and table_name=$3`;

    let r = await this.db.query(sql, [
      database, this.orm.schema, this.tableName
    ]);

    //没有表，需要创建
    if (r.rowCount <= 0) {

      sql = `create table if not exists ${curTableName} (`;

      let tmp = '';
      let pt = '';

      for (let k in this.table.column) {
        if (this.primaryKey === k) {
          sql += `${k} ${this.table.column[k].type} primary key,`;
        } else {
          sql += `${k} ${this.table.column[k].type} `;
          tmp = this.table.column[k];
          if (tmp.notNull !== false) {
            sql += `not null `;
          }

          //自动检测默认值
          pt = this._parseType(tmp.type);
          if (tmp.default === undefined) {
            if (this.numerics.indexOf(pt) >= 0) {
              tmp.default = 0;
            } else if (this.strings.indexOf(pt) >= 0) {
              tmp.default = '';
            }
          }

          if (tmp.default !== undefined) {
            sql += `default $$${tmp.default}$$ `;
          }
          sql += `,`;
        }

      }

      sql = `${sql.trim().substring(0, sql.length-1)})`;
      
      if (debug) {
        console.log(sql);
      }

      await this.db.query(sql);
      await this._syncIndex(curTableName, debug);
      await this._syncUnique(curTableName, debug);

      return;
    }

    let fields = 'column_name,data_type,column_default,character_maximum_length,'
                  +'numeric_precision,numeric_scale';

    r = await this.db.query(
      `select ${fields} from information_schema.columns where table_name=$1 AND table_schema=$2 AND table_catalog=$3`, 
      [this.tableName, this.orm.schema, database]
    );

    let inf = {};
    for (let i=0; i < r.rows.length; i++) {
      inf[r.rows[i].column_name] = r.rows[i];
    }

    await this._syncColumn(inf, curTableName, debug);

    await this._syncIndex(curTableName, debug);

    await this._syncUnique(curTableName, debug);

    if (debug) {
      console.log('OK');
    }

  }

    /**
     * 检测字段的执行流程：
     *    检测是否需要重命名，如果重命名但是可能用户已经
     *        通过数据库客户端进行操作并在这之后更改的程序，这时候不会进行更新。
     *    检测是否存在，不存在则创建。
     *    检测类型是否需要更改。
     *    检测not null和default是否需要更改，必须在类型检测之后。
     * 
     *    typeLock 为true表示不进行类型更新。
     */
  async _syncColumn (inf, curTableName, debug = false) {
    
    let pt = '';
    let real_type = '';
    let col = null;
    let sql = '';

    if (debug) {
      console.log('-- checking columns...');
    }

    for (let k in this.table.column) {
      col = this.table.column[k];
      if (col.oldName) {
        if (inf[k] === undefined && inf[col.oldName]) {
          await this.db.query(`alter table ${curTableName} rename ${col.oldName} to ${k}`);
          //保证后续的检测不会错误的创建字段。
          inf[k] = inf[col.oldName];
        }
      }

      pt = this._parseType(col.type);
      real_type = this._realType(pt);

      if (inf[k] === undefined) {
        sql = `alter table ${curTableName} add ${k} ${col.type}`;
        if (col.notNull !== false) {
          sql += ` not null`;
        }
        
        if (col.default === undefined) {
          if (this.numerics.indexOf(pt) >= 0) {
            col.default = 0;
          } else if (this.strings.indexOf(pt) >= 0) {
            col.default = '';
          }
        }

        if (col.default !== undefined) {
          sql += ` default $$${col.default}$$`;
        }
        if (debug) {
          console.log(sql);
        }
        await this.db.query(sql);
        continue;
      }

      if (col.typeLock) {
        continue;
      }
      /**
       * 如果没有在支持的类型中，则相当于是typeLock为true的结果，
       * 因为这时候，无法判断真实的类型名称和默认值格式。
       */
      if (real_type === null) {
        continue;
      }
      
      if (this._compareType(inf[k], col, real_type) === false) {

        /**
         * 在涉及到隐含类型转换时，会自动转换，否则需要指定转换规则。
         * 比如遇到问题是字符串类型 => 时间 | 数字
         * 但是目前测试varchar转换任何其他非字符串类型都会出问题，根本就不支持，
         * 可能需要自己实现转换函数，目前本人对数据库了解还不够深入，暂时不清楚原因。
         * 对于确实需要转换类型的情况，请自己实现转换程序，在设计数据库结构时，应该从一开始就考虑清楚。
         * 如果要设计运行良好的，可扩展并且支持程序动态处理的系统，无论数据库功能多丰富，都考虑清楚再使用。
         * 通常来说，基本的数据类型：数字、文本、二进制足够。
         * 如果你还明白，说明你还不具备设计整体结构的能力，请教专业架构师后再做。
        */

        sql = `alter table ${curTableName} alter ${k} type ${col.type}`;

        /* if (inf[k].data_type === 'text' || inf[k].data_type.indexOf('character') >= 0) {
          if (this.strings.indexOf(this._parseType(col.type)) < 0) {
            sql += ` using ${k}::${col.type}`;
          }
        } */

        if (debug) {
          console.log(sql);
        }

        try {
          await this.db.query(sql);
        } catch (err) {
          console.error('Error:',err.message);
          continue;
        }
        
      }

      if (col.default) {
        let real_default = this._realDefault(k, col.default);

        if (real_default !== inf[k].column_default) {
          sql = `alter table ${curTableName} alter column ${k} set default $$${col.default}$$`;
          await this.db.query(sql);
        }
      }

      if (col.notNull === undefined || col.notNull) {
        if (inf[k].is_nullable === 'YES') {
          await this.db.query(`alter table ${curTableName} alter column ${k} set not null`);
        }
      }
    }

  }

  async _checkIndex (indname, debug = false) {

    let indtext = indname;

    if (indname.indexOf(',') > 0) {
      indtext = indname.replace(',', '_');
    }

    //在pg_indexes中不能带上schema
    let sql = `select * from pg_indexes where `
        + `tablename='${this.tableName}' and schemaname = '${this.orm.schema}' `
        + `and indexname = '${this.tableName}_${indtext}_idx'`;
    
  
    let r = await this.db.query(sql);
    if (r.rowCount > 0) {
      return false;
    }

    return true;
  }

  async _syncIndex (curTableName, debug = false) {
    if (!this.table.index || !(this.table.index instanceof Array) ) {
      console.error('index 属性必须为数组类型，其中值为字符串');
      return;
    }

    if (debug) {
      console.log('-- checking index...');
    }

    let indname = '';
    let indchk = null;

    for (let i = 0; i < this.table.index.length; i++) {
      
      indname = this.table.index[i];

      if (this.table.column[indname] === undefined ) {
        console.error(`-- ${indname} ： 没有此字段，无法创建索引。`);
        continue;
      }

      indchk = await this._checkIndex(indname, debug);

      if (indchk === false) {
        continue;
      }

      await this.db.query(`create index on ${curTableName} (${indname})`);

    }

  }

  async _syncUnique (curTableName, debug = false) {

    if (!this.table.unique || !(this.table.unique instanceof Array) ) {
      console.error('unique 属性必须为数组类型，其中值为字符串');
      return;
    }

    if (debug) {
      console.log('-- checking unique index...');
    }

    if (!this.table.unique || !(this.table.unique instanceof Array) ) {
      return;
    }

    let indname = '';
    let indchk = null;

    let checkIndexField = (iname) => {
      if (iname.indexOf(',') > 0) {
        iname = iname.split(',').filter(p => p.length > 0);
      } else {
        iname = [iname];
      }

      for (let i = 0; i < iname.length; i++) {
        if (this.table.column[ iname[i].trim() ] === undefined) {
          console.error(`-- ${iname[i]} ： 没有此字段，无法创建索引。`);
          return false;
        }
      }

      return true;
    };

    for (let i = 0; i < this.table.unique.length; i++) {

      indname = this.table.unique[i];

      if (checkIndexField(indname) === false) {
        continue;
      }

      indchk = await this._checkIndex(indname, debug);

      if (indchk === false) {
        continue;
      }

      await this.db.query(`create unique index on ${curTableName} (${indname})`);

    }

  }

  _compareType (f, col, real_type) {
    if (this.typeWithBrackets.indexOf(real_type) < 0) {
      return (f.data_type === real_type);
    }
    
    //获取括号以及包含的字符串
    let btstr = this._parseBrackets(col.type);

    //字符串类型
    if (f.data_type.indexOf('character') == 0) {
      return (`${f.data_type}(${f.character_maximum_length})` === `${real_type}${btstr}`);
    }

    return (`${f.data_type}(${f.numeric_precision},${f.numeric_scale})` === `${real_type}${btstr}`);
  }

  _parseType (t) {
    let br = t.indexOf('(');
    if (br > 0) {
      return t.substring(0,br);
    }
    
    br = t.indexOf('[');
    if (br > 0) {
      return t.substring(0,br);
    }

    return t;
  }

  _parseBrackets (t) {
    let ind = t.indexOf('(');
    if (ind < 0) {
      return '';
    }
    return t.substring(ind);
  }

  _realType (t) {
    return this.dataTypeMap[t] || null;
  }

  _realDefault (t, val) {

    if (t === 'boolean') {
      return (val === 't' ? 'true' : 'false');
    }

    if (this.defaultWithType.indexOf(t) < 0) {
      return val;
    }

    let rt = this.dataTypeMap[t];
    return `${val === '' ? "''" : val}::${rt}`;
  }


}

module.exports = pqmodel;
