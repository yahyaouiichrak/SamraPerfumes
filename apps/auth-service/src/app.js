require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth.routes');
const { generalLimiter } = require('./middlewares/rateLimiter');
const {
  metricsMiddleware,
  metricsEndpoint,
} = require('./metrics/prometheus');
const logger = require('./utils/logger');

/**
 * Express Application (sans démarrage serveur)
 * Exporté pour :
 * - Tests (supertest)
 * - index.js (démarrage serveur)
 */

const app = express();

// ==============================================
// MIDDLEWARES GLOBAUX
// ==============================================

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🚨 IMPORTANT : Désactiver rate limit + metrics en test
if (process.env.NODE_ENV !== 'test') {
  app.use(generalLimiter);
  app.use(metricsMiddleware);
}

// ==============================================
// ROUTES
// ==============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Prometheus metrics endpoint

app.get('/metrics', metricsEndpoint);


// API Routes
app.use('/api/auth', authRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée.',
  });
});

// ==============================================
// ERROR HANDLING
// ==============================================
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur serveur interne.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;