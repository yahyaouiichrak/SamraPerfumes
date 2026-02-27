const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Construction DATABASE_URL depuis variables séparées
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

// Construire URL
let databaseUrl;
if (process.env.DATABASE_URL) {
  databaseUrl = process.env.DATABASE_URL;
} else if (dbUser && dbPassword && dbName) {
  const encodedPassword = encodeURIComponent(dbPassword);
  databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
} else {
  throw new Error('Database configuration missing');
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? (msg) => logger.debug(msg) : false,
  pool: {
    max: process.env.NODE_ENV === 'test' ? 5 : 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
  },
});

const connectDatabase = async () => {
  try {
    if (process.env.NODE_ENV === 'test') {
      logger.info('🔄 Connecting to test database...');
    } else {
      logger.info('🔄 Attempting database connection...');
    }

    logger.debug('Database config:', {
      host: dbHost,
      port: dbPort,
      user: dbUser,
      database: dbName,
      dialect: sequelize.options.dialect,
    });

    await sequelize.authenticate();
    logger.info('✅ Database connection established successfully');

    // Sync models
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('✅ Database models synchronized');
    } else if (process.env.NODE_ENV === 'test') {
      await sequelize.sync({ force: true }); // Reset DB pour chaque test run
      logger.info('✅ Test database initialized');
    }
  } catch (error) {
    logger.error('❌ Unable to connect to database:', error.message);

    if (error.original) {
      logger.error('Database Error Code:', error.original.code);
    }

    logger.error('\n💡 TROUBLESHOOTING:');
    logger.error('1. Check DB_* variables in .env.test');
    logger.error('2. Verify PostgreSQL test is running: docker ps | grep postgres-test');
    logger.error('3. Test connection: docker exec -it perfume-postgres-test psql -U test_user -d test_db');

    throw error;
  }
};

module.exports = { sequelize, connectDatabase };