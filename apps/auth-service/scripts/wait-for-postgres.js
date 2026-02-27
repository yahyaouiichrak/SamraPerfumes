const { Client } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5433,
  user: process.env.DB_USER || 'test_user',
  password: process.env.DB_PASSWORD || 'test_password',
  database: process.env.DB_NAME || 'test_db',
};

const maxRetries = 30;
const retryDelay = 1000;

async function waitForPostgres() {
  console.log('⏳ Waiting for PostgreSQL...');
  console.log(`   ${config.host}:${config.port}/${config.database}`);

  for (let i = 1; i <= maxRetries; i++) {
    try {
      const client = new Client(config);
      await client.connect();
      await client.query('SELECT 1');
      await client.end();

      console.log('✅ PostgreSQL is ready!');
      return true;
    } catch (error) {
      if (i === maxRetries) {
        console.error('❌ PostgreSQL failed to start');
        console.error('Error:', error.message);
        process.exit(1);
      }

      process.stdout.write(`.`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

waitForPostgres();