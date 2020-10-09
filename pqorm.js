'use strict';

const mo = require ('./model.js');
const pqmodel = require('./pqmodel');

var pqorm = function (db) {
  if (!(this instanceof pqorm)) {
    return new pqorm(db);
  }

  this.db = db;

  this.schema = 'public';

  this.setdb = (db) => {
    this.db = db;
  };

};

pqorm.prototype.setSchema = function (name) {
  this.schema = name;
};

pqorm.prototype.model = function (tablename, schema = '') {
  return new mo(this.db, tablename, schema || this.schema);
};

pqorm.prototype.transaction = async function (callback, schema = '') {
  return (new mo(this.db, '', schema || this.schema)).transaction(callback);
};

pq.Model = pqmodel;


module.exports = pqorm;
