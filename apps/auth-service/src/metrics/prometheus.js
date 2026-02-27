const client = require('prom-client');

const isTestEnv = process.env.NODE_ENV === 'test';

if (!isTestEnv) {
  client.collectDefaultMetrics();
}

const metricsEndpoint = async (req, res) => {
  if (isTestEnv) {
    return res.status(200).send('# test metrics');
  }

  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
};

module.exports = {
  metricsEndpoint,
};