require('dotenv').config();
const app = require('./app');
const { connectDatabase } = require('./config/database');
const { connectKafka, disconnectKafka } = require('./config/kafka');
const logger = require('./utils/logger');

/**
 * Server Startup (seulement si exécuté directement)
 * 
 * Ne s'exécute PAS pendant les tests (require('./app') suffit)
 */

const PORT = process.env.PORT || 4001;

const startServer = async () => {
  try {
    // Connecter à la base de données uniquement si pas en mode test
    if (process.env.NODE_ENV !== 'test') {
      await connectDatabase();
      await connectKafka();
    }

    // Démarrer le serveur HTTP
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Auth-Service running on port ${PORT}`);
      logger.info(`📊 Metrics: http://localhost:${PORT}/metrics`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });

    // ==============================================
    // GRACEFUL SHUTDOWN
    // ==============================================
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // Stop accepting new requests
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Disconnect services (seulement si connectés)
          if (process.env.NODE_ENV !== 'test') {
            await disconnectKafka();
            logger.info('Kafka disconnected');

            await require('./config/database').sequelize.close();
            logger.info('Database connection closed');
          }

          logger.info('✅ Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30s if graceful fails
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// Start server (seulement si exécuté directement, pas via require())
if (require.main === module) {
  startServer();
}

module.exports = app;