'use strict';

const { createHmac, randomBytes } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', '.stock-data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'stocks.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS likes (
    stock TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    PRIMARY KEY (stock, fingerprint)
  );
`);

db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)')
  .run('ip-key', randomBytes(32).toString('hex'));

const ipKey = db.prepare('SELECT value FROM settings WHERE name = ?')
  .get('ip-key').value;

const addLike = db.prepare(
  'INSERT OR IGNORE INTO likes (stock, fingerprint) VALUES (?, ?)'
);
const countLikes = db.prepare(
  'SELECT COUNT(*) AS total FROM likes WHERE stock = ?'
);

async function getPrice(stock) {
  const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${encodeURIComponent(stock)}/quote`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Quote proxy returned ${response.status}`);
  }

  const { latestPrice } = await response.json();
  return Number.isFinite(latestPrice) ? latestPrice : null;
}

module.exports = function (app) {
  app.get('/api/stock-prices', async (req, res) => {
    const { stock, like } = req.query;
    const requested = Array.isArray(stock) ? stock : [stock];

    if (
      requested.length > 2 ||
      requested.some(value => typeof value !== 'string' ||
        !/^[A-Z0-9.-]{1,15}$/i.test(value.trim()))
    ) {
      return res.status(400).json({ error: 'Enter one or two stock symbols.' });
    }

    const symbols = requested.map(value => value.trim().toUpperCase());

    let prices;
    try {
      prices = await Promise.all(symbols.map(getPrice));
    } catch {
      return res.status(502).json({ error: 'The quote service is unavailable.' });
    }

    if (prices.includes(null)) {
      return res.status(404).json({ error: 'Stock price unavailable.' });
    }

    if (like === 'true') {
      const ip = req.ip.replace(/^::ffff:/i, '');
      const fingerprint = createHmac('sha256', ipKey).update(ip).digest('hex');

      for (const symbol of symbols) {
        addLike.run(symbol, fingerprint);
      }
    }

    const stocks = symbols.map((symbol, index) => ({
      stock: symbol,
      price: prices[index],
      likes: countLikes.get(symbol).total,
    }));

    if (stocks.length === 1) {
      return res.json({ stockData: stocks[0] });
    }

    return res.json({
      stockData: stocks.map(({ stock, price, likes }, index) => ({
        stock,
        price,
        rel_likes: likes - stocks[1 - index].likes,
      })),
    });
  });
};