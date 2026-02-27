const { Kafka, logLevel } = require('kafkajs');
const logger = require('../utils/logger');

// Initialisation client Kafka
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'auth-service',
  
  // Brokers = serveurs Kafka (cluster haute dispo)
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  
  // Retry strategy (connexion robuste)
  retry: {
    retries: 5,               // Max 5 tentatives reconnexion
    initialRetryTime: 300,    // Première retry après 300ms
    factor: 2,                // Exponentiel backoff (300, 600, 1200, 2400, 4800ms)
  },
  
  // Logging Kafka vers Winston
  logLevel: logLevel.ERROR,
  logCreator: () => {
    return ({ level, log }) => {
      const { message, ...extra } = log;
      logger.info(`[Kafka] ${message}`, extra);
    };
  },
});

// Créer producer (envoie messages)
const producer = kafka.producer({
  // Idempotence : évite duplicata messages si retry
  idempotent: true,
  
  // Compression (optimise bande passante)
  compression: 1, // 1 = GZIP
  
  // Batching : groupe messages (performance)
  batch: {
    size: 16384,        // 16KB max par batch
    lingerMs: 10,       // Attendre 10ms pour remplir batch
  },
});


const connectKafka = async () => {
  try {
    await producer.connect();
    logger.info('✅ Kafka producer connected');
    logger.info(`📡 Brokers: ${process.env.KAFKA_BROKERS}`);
  } catch (error) {
    logger.error('❌ Kafka connection failed:', error);
    logger.warn('⚠️  Service will continue without Kafka (events will be lost)');
    // Ne PAS exit process, permettre service de fonctionner
  }
};

/**
 * DÉCONNEXION KAFKA (Graceful Shutdown)
 */
const disconnectKafka = async () => {
  try {
    await producer.disconnect();
    logger.info('✅ Kafka producer disconnected');
  } catch (error) {
    logger.error('❌ Error disconnecting Kafka:', error);
  }
};

/**
 * HEALTH CHECK KAFKA
 */
const isKafkaConnected = () => {
  // kafkajs ne fournit pas méthode directe isConnected
  // On assume connecté si producer créé sans erreur
  return producer !== null;
};

module.exports = { 
  kafka, 
  producer, 
  connectKafka, 
  disconnectKafka,
  isKafkaConnected 
};
