/**
 * Jest Global Setup
 * 
 * Exécuté AVANT tous les tests
 * Configure environment variables et mocks globaux
 */

// Load test environment variables FIRST (avant imports)
require('dotenv').config({ path: '.env.test' });

// Vérifier que variables critiques sont définies
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET missing or too short in .env.test');
  process.exit(1);
}

if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
  console.error('❌ JWT_REFRESH_SECRET missing or too short in .env.test');
  process.exit(1);
}

// Mock console pour éviter pollution logs pendant tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup global timeout
jest.setTimeout(10000);

// =============================================
// MOCK EXTERNAL SERVICES
// =============================================

// Mock Kafka (pas de Kafka dans tests)
jest.mock('../src/config/kafka', () => ({
  kafka: {
    producer: jest.fn().mockReturnValue({
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true),
      send: jest.fn().mockResolvedValue([{ partition: 0, offset: '0' }]),
    }),
  },
  producer: {
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    send: jest.fn().mockResolvedValue([{ partition: 0, offset: '0' }]),
  },
  connectKafka: jest.fn().mockResolvedValue(true),
  disconnectKafka: jest.fn().mockResolvedValue(true),
}));

// Mock Email Service (pas d'envoi réel dans tests)
jest.mock('../src/services/email.service', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'test-123' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'test-456' }),
  verifyConnection: jest.fn().mockResolvedValue(true),
}));

// Mock Prometheus Metrics (pas de metrics dans tests)
jest.mock('../src/metrics/prometheus', () => ({
  metricsMiddleware: jest.fn((req, res, next) => next()),
  metricsEndpoint: jest.fn((req, res) => res.send('# Mocked metrics')),
  recordRegistration: jest.fn(),
  recordLogin: jest.fn(),
  recordFailedLogin: jest.fn(),
  recordPasswordReset: jest.fn(),
}));

// Mock Winston Logger (éviter logs pendant tests)
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

console.log('✅ Jest setup complete');