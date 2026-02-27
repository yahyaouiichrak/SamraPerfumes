const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const logger = require('../utils/logger');

const isTestEnv = process.env.NODE_ENV === 'test';

/**
 * Middleware vide pour les tests
 */
const noopMiddleware = (req, res, next) => next();

/**
 * ==============================
 * MODE TEST → on désactive tout
 * ==============================
 */
if (isTestEnv) {
  module.exports = {
    generalLimiter: noopMiddleware,
    authLimiter: noopMiddleware,
    passwordResetLimiter: noopMiddleware,
  };
} else {
  /**
   * ==============================
   * Redis Setup (DEV / PROD)
   * ==============================
   */
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 200, 1000);
    },
  });

  redis.on('connect', () =>
    logger.info('✅ Redis connected for rate limiting')
  );

  redis.on('error', (err) =>
    logger.error('❌ Redis error:', err)
  );

  const redisStore = (prefix) =>
    new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    });

  /**
   * ==============================
   * 1. General API Rate Limiter
   * ==============================
   */
  const generalLimiter = rateLimit({
    store: redisStore('rl:general:'),
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        success: false,
        message: 'Trop de requêtes. Veuillez réessayer dans 15 minutes.',
      });
    },
  });

  /**
   * ==============================
   * 2. Auth Strict Limiter
   * ==============================
   */
  const authLimiter = rateLimit({
    store: redisStore('rl:auth:'),
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      logger.warn(
        `Auth rate limit exceeded for IP: ${req.ip}, Email: ${req.body.email}`
      );
      res.status(429).json({
        success: false,
        message: 'Trop de tentatives. Réessayez dans 15 minutes.',
      });
    },
  });

  /**
   * ==============================
   * 3. Password Reset Limiter
   * ==============================
   */
  const passwordResetLimiter = rateLimit({
    store: redisStore('rl:reset:'),
    windowMs: 60 * 60 * 1000,
    max: 3,
    handler: (req, res) => {
      logger.warn(
        `Password reset rate limit exceeded for IP: ${req.ip}`
      );
      res.status(429).json({
        success: false,
        message: 'Trop de demandes. Réessayez dans 1 heure.',
      });
    },
  });

  module.exports = {
    generalLimiter,
    authLimiter,
    passwordResetLimiter,
  };
}