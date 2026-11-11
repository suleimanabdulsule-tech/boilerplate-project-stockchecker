'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../server');
const { assert } = chai;

chai.use(chaiHttp);

function requestStock(query) {
  return chai.request(app).get(`/api/stock-prices/?${query}`);
}

function checkSingle(response, symbol) {
  assert.equal(response.status, 200);

  const data = response.body.stockData;
  assert.isObject(data);
  assert.equal(data.stock, symbol);
  assert.isTrue(Number.isFinite(data.price));
  assert.isTrue(Number.isInteger(data.likes) && data.likes >= 0);

  return data;
}

function checkPair(response, first, second) {
  assert.equal(response.status, 200);

  const data = response.body.stockData;
  assert.isArray(data);
  assert.lengthOf(data, 2);
  assert.deepEqual(data.map(item => item.stock), [first, second]);

  for (const item of data) {
    assert.isTrue(Number.isFinite(item.price));
    assert.isTrue(Number.isInteger(item.rel_likes));
    assert.notProperty(item, 'likes');
  }

  assert.equal(data[0].rel_likes, -data[1].rel_likes);
  return data;
}

suite('Functional Tests', function () {
  this.timeout(30000);

  test('Viewing one stock', async function () {
    const response = await requestStock('stock=GOOG');
    checkSingle(response, 'GOOG');
  });

  test('Viewing one stock and liking it', async function () {
    const before = checkSingle(await requestStock('stock=GOOG'), 'GOOG');
    const liked = checkSingle(await requestStock('stock=GOOG&like=true'), 'GOOG');

    assert.isAtLeast(liked.likes, 1);
    assert.include([before.likes, before.likes + 1], liked.likes);
  });

  test('Viewing the same stock and liking it again', async function () {
    const first = checkSingle(await requestStock('stock=GOOG&like=true'), 'GOOG');
    const again = checkSingle(await requestStock('stock=GOOG&like=true'), 'GOOG');

    assert.equal(again.likes, first.likes);
  });

  test('Viewing two stocks', async function () {
    const response = await requestStock('stock=GOOG&stock=MSFT');
    checkPair(response, 'GOOG', 'MSFT');
  });

  test('Viewing two stocks and liking them', async function () {
    const response = await requestStock('stock=GOOG&stock=MSFT&like=true');
    const pair = checkPair(response, 'GOOG', 'MSFT');

    const goog = checkSingle(await requestStock('stock=GOOG'), 'GOOG');
    const msft = checkSingle(await requestStock('stock=MSFT'), 'MSFT');

    assert.isAtLeast(goog.likes, 1);
    assert.isAtLeast(msft.likes, 1);
    assert.equal(pair[0].rel_likes, goog.likes - msft.likes);
  });
});