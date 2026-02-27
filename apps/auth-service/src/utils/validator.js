const Joi = require('joi');
const logger = require('./logger');

/**
 * Validation Middleware Factory
 * 
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors, not just first
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path[0],
        message: detail.message.replace(/['"]/g, ''), // Remove quotes
      }));

      logger.warn('Validation failed:', { errors, body: req.body });

      return res.status(400).json({
        success: false,
        message: 'Erreur de validation.',
        errors, // ✅ Retourner le tableau errors
      });
    }

    // Replace req.body with validated & sanitized value
    req.body = value;
    next();
  };
};

// Schemas
const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Email invalide.',
      'any.required': 'Email requis.',
    }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Mot de passe minimum 8 caractères.',
      'string.pattern.base': 'Mot de passe doit contenir majuscule, minuscule et chiffre.',
      'any.required': 'Mot de passe requis.',
    }),
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Nom minimum 2 caractères.',
      'string.max': 'Nom maximum 100 caractères.',
      'any.required': 'Nom requis.',
    }),
});

const registerAdminSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required(),
  name: Joi.string().min(2).max(100).required(),
  adminSecret: Joi.string().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required(),
});

module.exports = {
  validate,
  registerSchema,
  registerAdminSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};