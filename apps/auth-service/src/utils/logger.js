const winston = require('winston');

const logFormat = winston.format.combine(
  // 1. Timestamp ISO 8601
  winston.format.timestamp({ 
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  
  // 2. Stack traces pour erreurs
  winston.format.errors({ stack: true }),
  
  // 3. Support string interpolation (%s, %d)
  winston.format.splat(),
  
  // 4. Format JSON final
  winston.format.json()
);

/**
 * CRÉATION LOGGER
 */
const logger = winston.createLogger({
  // Niveau minimum (info par défaut)
  level: process.env.LOG_LEVEL || 'info',
  
  // Format
  format: logFormat,
  
  // Métadonnées par défaut (ajoutées à chaque log)
  defaultMeta: { 
    service: 'auth-service',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  },
  
  // Transports (destinations logs)
  transports: [
    // 1. CONSOLE (toujours actif)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Couleurs (dev only)
        winston.format.simple(),   // Format lisible humain
      ),
    }),
    
    // 2. FICHIER ERREURS (errors.log)
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,      // Garde 5 fichiers (rotation)
    }),
    
    // 3. FICHIER COMBINÉ (all.log)
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  
  // Ne pas exit process après erreur loggée
  exitOnError: false,
});

/**
 * CONFIGURATION ENVIRONNEMENT
 */

// Développement : plus verbeux
if (process.env.NODE_ENV === 'development') {
  logger.level = 'debug';
  logger.debug('🔧 Logger initialized in DEVELOPMENT mode (debug level)');
}

// Production : JSON strict, pas de couleurs
if (process.env.NODE_ENV === 'production') {
  logger.level = process.env.LOG_LEVEL || 'info';
  // Retire transport console coloré, garde JSON pur
  logger.clear();
  logger.add(new winston.transports.Console({
    format: winston.format.json(),
  }));
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error' 
  }));
}

logger.logRequest = function (req, message, meta = {}) {
  this.info(message, {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    ...meta,
  });
};

/**
 * logError - Log erreur avec stack trace
 * 
 * Usage :
 *   try { ... } catch (error) { logger.logError(error, 'Login failed', { userId }); }
 */
logger.logError = function (error, message, meta = {}) {
  this.error(message, {
    error: error.message,
    stack: error.stack,
    ...meta,
  });
};


logger.logPerformance = function (operation, durationMs, meta = {}) {
  const level = durationMs > 1000 ? 'warn' : 'info'; // Warn si >1s
  this[level](`Performance: ${operation}`, {
    durationMs,
    durationSec: (durationMs / 1000).toFixed(2),
    ...meta,
  });
};

module.exports = logger;