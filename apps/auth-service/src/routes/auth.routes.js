const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requireAdmin } = require('../middlewares/role.middleware');
const { validate } = require('../utils/validator');
const {
  registerSchema,
  registerAdminSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../utils/validator');
const {
  authLimiter,
  passwordResetLimiter,
} = require('../middlewares/rateLimiter');

/**
 * Routes Auth-Service
 * 
 * Architecture :
 * - Validation (Joi) → Rate Limiting → Auth Middleware → Controller
 * - Ordre middlewares critique
 * 
 * Patterns utilisés :
 * - Chaîne de middlewares Express
 * - Validation avant logique métier
 * - Rate limiting ciblé par endpoint
 */

const router = express.Router();

/**
 * Public Routes (non protégées)
 */

// POST /api/auth/register
// Registration client
router.post(
  '/register',
  authLimiter, // 5 tentatives/15min
  validate(registerSchema), // Validation Joi
  authController.register // Controller
);

// POST /api/auth/register-admin
// Registration admin (protégé par secret)
router.post(
  '/register-admin',
  authLimiter, // 5 tentatives/15min
  validate(registerAdminSchema),
  authController.registerAdmin
);

// POST /api/auth/login
// Login (client + admin)
router.post(
  '/login',
  authLimiter, // 5 tentatives/15min
  validate(loginSchema),
  authController.login
);

// POST /api/auth/forgot-password
// Demande reset password
router.post(
  '/forgot-password',
  passwordResetLimiter, // 3 tentatives/heure
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

// POST /api/auth/reset-password
// Reset password avec token
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword
);

// POST /api/auth/refresh-token
// Rafraîchir access token
router.post('/refresh-token', authController.refreshToken);

/**
 * Protected Routes (authentification requise)
 */

// GET /api/auth/profile
// Get current user profile
router.get(
  '/profile',
  authenticate, // JWT verification
  authController.getProfile
);

// PUT /api/auth/profile
// Update profile
router.put(
  '/profile',
  authenticate,
  validate(updateProfileSchema),
  authController.updateProfile
);

/**
 * Admin Only Routes
 * (exemple pour Sprint 5 - gestion utilisateurs)
 */

// GET /api/auth/users
// Liste tous utilisateurs (admin only)
// router.get('/users', authenticate, requireAdmin, adminController.listUsers);

module.exports = router;