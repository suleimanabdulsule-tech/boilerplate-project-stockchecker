'use strict';

require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const apiRoutes = require('./routes/api.js');
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner');

const app = express();

app.use(cors({ origin: '*' }));
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
  },
}));

app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/_api/app-info', (req, res) => {
  res.json({ headers: res.getHeaders() });
});

fccTestingRoutes(app);
apiRoutes(app);

app.use((req, res) => {
  res.status(404).type('text').send('Not Found');
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port);

  if (process.env.NODE_ENV === 'test') {
    runner.run();
  }
});

module.exports = app;