const User = require('../models/User');
const jwtService = require('../services/jwt.service');
const emailService = require('../services/email.service');
const kafkaService = require('../services/kafka.service');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { 
  recordRegistration, 
  recordLogin, 
  recordFailedLogin, 
  recordPasswordReset 
} = require('../metrics/prometheus');
/**
 * Auth Controller
 * 
 * Responsabilité : Logique métier authentification
 * - Registration (client + admin)
 * - Login
 * - Profile management
 * - Password reset flow
 * 
 * Pattern : Fat Controller (logique métier ici, pas dans routes)
 * Alternative : Service Layer (extraire logique vers AuthService)
 */

class AuthController {
  /**
   * POST /api/auth/register
   * Registration Client
   */
  async register(req, res) {
    try {
      const { email, password, name } = req.body;

      // 1. Vérifier email unique
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Cet email est déjà utilisé.',
        });
      }

      // 2. Créer utilisateur (password hashé via hook beforeCreate)
      const user = await User.create({
        email,
        password,
        name,
        role: 'client', // Force role client
      });

      // 3. Générer tokens JWT
      const accessToken = jwtService.generateAccessToken(user);
      const refreshToken = jwtService.generateRefreshToken(user);

      // 4. Publier événement Kafka (async, non-bloquant)
      kafkaService.publishUserRegistered(user);

      // 5. Envoyer email bienvenue (async, non-bloquant)
      emailService.sendWelcomeEmail(user);

      // 6. Logger succès
      logger.info(`✅ User registered: ${user.email} (${user.id})`);

      // 7. Réponse au client
      res.status(201).json({
        success: true,
        message: 'Compte créé avec succès !',
        data: {
          user: user.toJSON(), // Exclut password (via toJSON override)
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du compte.',
      });
    }
  }

  /**
   * POST /api/auth/register-admin
   * Registration Admin (protégé par secret)
   */
  async registerAdmin(req, res) {
    try {
      const { email, password, name, adminSecret } = req.body;

      // 1. Vérifier secret admin
      if (adminSecret !== process.env.ADMIN_REGISTRATION_SECRET) {
        logger.warn(`❌ Invalid admin secret attempt: ${email}`);
        return res.status(403).json({
          success: false,
          message: 'Secret admin invalide.',
        });
      }

      // 2. Vérifier email unique
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Cet email est déjà utilisé.',
        });
      }

      // 3. Créer admin
      const user = await User.create({
        email,
        password,
        name,
        role: 'admin', // Force role admin
        emailVerified: true, // Admins pré-vérifiés
      });

      // 4. Tokens JWT
      const accessToken = jwtService.generateAccessToken(user);
      const refreshToken = jwtService.generateRefreshToken(user);

      // 5. Logger succès
      logger.info(`✅ Admin registered: ${user.email} (${user.id})`);

      // 6. Publier événement Kafka
      kafkaService.publishUserRegistered(user);

      res.status(201).json({
        success: true,
        message: 'Compte admin créé avec succès !',
        data: {
          user: user.toJSON(),
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (error) {
      logger.error('Admin registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du compte admin.',
      });
    }
  }

  /**
   * POST /api/auth/login
   * Login (client + admin)
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // 1. Trouver utilisateur
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Email ou mot de passe incorrect.',
        });
      }

      // 2. Vérifier mot de passe
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        logger.warn(`❌ Failed login attempt: ${email}`);
        return res.status(401).json({
          success: false,
          message: 'Email ou mot de passe incorrect.',
        });
      }

      // 3. Vérifier compte actif
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Compte désactivé. Contactez le support.',
        });
      }

      // 4. Mettre à jour lastLoginAt
      user.lastLoginAt = new Date();
      await user.save();

      // 5. Générer tokens
      const accessToken = jwtService.generateAccessToken(user);
      const refreshToken = jwtService.generateRefreshToken(user);

      // 6. Publier événement Kafka
      kafkaService.publishUserLoggedIn(user);

      // 7. Logger succès
      logger.info(`✅ User logged in: ${user.email} (${user.role})`);

      res.json({
        success: true,
        message: 'Connexion réussie !',
        data: {
          user: user.toJSON(),
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la connexion.',
      });
    }
  }

  /**
   * GET /api/auth/profile
   * Get current user profile (protégé)
   */
  async getProfile(req, res) {
    try {
      // req.user déjà chargé par authenticate middleware
      res.json({
        success: true,
        data: {
          user: req.user.toJSON(),
        },
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du profil.',
      });
    }
  }

  /**
   * PUT /api/auth/profile
   * Update profile (name uniquement, pas email)
   */
  async updateProfile(req, res) {
    try {
      const { name } = req.body;

      // Mise à jour
      req.user.name = name;
      await req.user.save();

      logger.info(`✅ Profile updated: ${req.user.email}`);

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès !',
        data: {
          user: req.user.toJSON(),
        },
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du profil.',
      });
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Initiate password reset
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      // 1. Trouver utilisateur
      const user = await User.findOne({ where: { email } });

      // Réponse générique (sécurité : ne pas révéler si email existe)
      const genericMessage = 'Si cet email existe, un lien de réinitialisation a été envoyé.';

      if (!user) {
        logger.info(`Password reset requested for non-existent email: ${email}`);
        return res.json({
          success: true,
          message: genericMessage,
        });
      }

      // 2. Générer token reset (crypto secure)
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      // 3. Sauvegarder token hashé + expiration (1h)
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure
      await user.save();

      // 4. Envoyer email avec token (non hashé)
      await emailService.sendPasswordResetEmail(user, resetToken);

      logger.info(`✅ Password reset email sent: ${user.email}`);

      res.json({
        success: true,
        message: genericMessage,
      });
    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la demande de réinitialisation.',
      });
    }
  }

  /**
   * POST /api/auth/reset-password
   * Reset password with token
   */
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      // 1. Hasher token reçu (même algo que sauvegarde)
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // 2. Trouver user avec token valide (non expiré)
      const user = await User.findOne({
        where: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: {
            [require('sequelize').Op.gt]: new Date(), // Expiration > maintenant
          },
        },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Token invalide ou expiré.',
        });
      }

      // 3. Mettre à jour password (hashé via beforeUpdate hook)
      user.password = newPassword;
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();

      // 4. Publier événement Kafka
      kafkaService.publishPasswordReset(user);

      logger.info(`✅ Password reset successful: ${user.email}`);

      res.json({
        success: true,
        message: 'Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter.',
      });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la réinitialisation du mot de passe.',
      });
    }
  }

  /**
   * POST /api/auth/refresh-token
   * Refresh access token using refresh token
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token requis.',
        });
      }

      // 1. Vérifier refresh token
      const decoded = jwtService.verifyRefreshToken(refreshToken);

      // 2. Charger user
      const user = await User.findByPk(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur invalide.',
        });
      }

      // 3. Générer nouveau access token
      const newAccessToken = jwtService.generateAccessToken(user);

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
        },
      });
    } catch (error) {
      logger.error('Refresh token error:', error);
      res.status(401).json({
        success: false,
        message: 'Refresh token invalide ou expiré.',
      });
    }
  }
}

module.exports = new AuthController();