import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSuppliers } from '../src/demo.js';

test('演示供应商具有查询展示所需的字段及完整原始数据', () => {
  assert.ok(demoSuppliers.length > 0);
  for (const item of demoSuppliers) {
    for (const key of ['id','code','name','status','category','raw']) assert.ok(key in item);
    assert.equal(item.raw.code, item.code);
  }
});
