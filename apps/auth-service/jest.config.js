module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/config/**',
    '!**/node_modules/**',
    '!**/tests/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Timeouts augmentés pour PostgreSQL
  testTimeout: 30000, // 30 secondes par test (était 10000)
  
  verbose: true,
  detectOpenHandles: false, // Désactiver (sinon bloque à la fin)
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Tests en série (pas parallèle) pour éviter conflits DB
  maxWorkers: 1,
};