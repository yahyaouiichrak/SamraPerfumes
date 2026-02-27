const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * JWT Service - Gestion des JSON Web Tokens
 * 
 * Architecture JWT :
 * - Access Token : Court (24h), contient userId + email + role
 * - Refresh Token : Long (7 jours), permet renouveler Access Token
 * 
 * Pourquoi deux tokens ?
 * - Sécurité : Access Token court limite fenêtre d'exploitation si volé
 * - UX : Refresh Token long évite re-login constant
 * 
 * Secrets :
 * - JWT_SECRET : Signature Access Tokens
 * - JWT_REFRESH_SECRET : Signature Refresh Tokens (secret différent = sécurité)
 * 
 * Payload Structure :
 * {
 *   userId: "uuid",
 *   email: "user@example.com",
 *   role: "client" | "admin",
 *   iat: timestamp,
 *   exp: timestamp,
 *   iss: "perfume-auth-service"
 * }
 */

class JWTService {
  constructor() {
    // Validation secrets au démarrage
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      logger.error('JWT_SECRET must be at least 32 characters long');
      throw new Error('Invalid JWT_SECRET configuration');
    }

    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
      logger.error('JWT_REFRESH_SECRET must be at least 32 characters long');
      throw new Error('Invalid JWT_REFRESH_SECRET configuration');
    }

    logger.info('✅ JWT Service initialized');
  }

  /**
   * Générer Access Token
   * 
   * @param {Object} user - User Sequelize model instance
   * @returns {string} JWT Access Token
   * 
   * Usage :
   * const token = jwtService.generateAccessToken(user);
   * // Token valide 24h, contient userId, email, role
   */
  generateAccessToken(user) {
    try {
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        // Éviter d'inclure données sensibles (password, resetToken, etc.)
      };

      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES_IN || '24h',
          issuer: 'perfume-auth-service',
          audience: 'perfume-platform',
          subject: user.id,
        }
      );

      logger.debug(`Access token generated for user ${user.email}`);
      return token;
    } catch (error) {
      logger.error('Failed to generate access token:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Générer Refresh Token
   * 
   * @param {Object} user - User Sequelize model instance
   * @returns {string} JWT Refresh Token
   * 
   * Différences avec Access Token :
   * - Durée plus longue (7 jours vs 24h)
   * - Secret différent (rotation indépendante)
   * - Payload minimaliste (seulement userId + email, pas role)
   * 
   * Usage :
   * const refreshToken = jwtService.generateRefreshToken(user);
   * // Stocker côté client (httpOnly cookie ou localStorage)
   */
  generateRefreshToken(user) {
    try {
      const payload = {
        userId: user.id,
        email: user.email,
        // Pas de role : refresh token ne donne pas accès direct aux ressources
      };

      const token = jwt.sign(
        payload,
        process.env.JWT_REFRESH_SECRET,
        {
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
          issuer: 'perfume-auth-service',
          audience: 'perfume-platform',
          subject: user.id,
        }
      );

      logger.debug(`Refresh token generated for user ${user.email}`);
      return token;
    } catch (error) {
      logger.error('Failed to generate refresh token:', error);
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Vérifier Access Token
   * 
   * @param {string} token - JWT Access Token
   * @returns {Object} Decoded payload { userId, email, role, iat, exp, iss }
   * @throws {Error} Si token invalide, expiré, ou signature incorrecte
   * 
   * Vérifications effectuées :
   * 1. Signature valide (HMAC SHA256)
   * 2. Token non expiré
   * 3. Issuer correct
   * 4. Audience correcte
   * 
   * Erreurs possibles :
   * - TokenExpiredError : Token expiré (client doit refresh)
   * - JsonWebTokenError : Signature invalide (token modifié)
   * - NotBeforeError : Token utilisé avant nbf claim
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          issuer: 'perfume-auth-service',
          audience: 'perfume-platform',
        }
      );

      logger.debug(`Access token verified for user ${decoded.email}`);
      return decoded;
    } catch (error) {
      // Log selon type d'erreur
      if (error.name === 'TokenExpiredError') {
        logger.debug(`Access token expired: ${error.message}`);
        throw new Error('Token expiré. Veuillez vous reconnecter.');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn(`Invalid access token: ${error.message}`);
        throw new Error('Token invalide.');
      } else {
        logger.error('Access token verification failed:', error);
        throw new Error('Erreur de vérification du token.');
      }
    }
  }

  /**
   * Vérifier Refresh Token
   * 
   * @param {string} token - JWT Refresh Token
   * @returns {Object} Decoded payload { userId, email, iat, exp, iss }
   * @throws {Error} Si token invalide ou expiré
   * 
   * Usage :
   * try {
   *   const decoded = jwtService.verifyRefreshToken(refreshToken);
   *   const newAccessToken = jwtService.generateAccessToken(user);
   * } catch (error) {
   *   // Redirect to login
   * }
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET,
        {
          issuer: 'perfume-auth-service',
          audience: 'perfume-platform',
        }
      );

      logger.debug(`Refresh token verified for user ${decoded.email}`);
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.debug(`Refresh token expired: ${error.message}`);
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn(`Invalid refresh token: ${error.message}`);
        throw new Error('Token de rafraîchissement invalide.');
      } else {
        logger.error('Refresh token verification failed:', error);
        throw new Error('Erreur de vérification du refresh token.');
      }
    }
  }

  /**
   * Décoder Token sans Vérification (inspection)
   * 
   * @param {string} token - JWT
   * @returns {Object|null} Decoded payload ou null si invalide
   * 
   * ⚠️ ATTENTION : Ne vérifie PAS la signature !
   * Usage : Debug uniquement, JAMAIS pour authentification
   * 
   * Cas d'usage :
   * - Logs (inspecter contenu token sans crasher)
   * - Debug (voir payload token invalide)
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      logger.error('Failed to decode token:', error);
      return null;
    }
  }

  /**
   * Extraire Token du Header Authorization
   * 
   * @param {string} authHeader - Header Authorization complet
   * @returns {string|null} Token ou null si format invalide
   * 
   * Format attendu : "Bearer eyJhbGciOiJIUzI1NiIs..."
   * 
   * Usage :
   * const token = jwtService.extractTokenFromHeader(req.headers.authorization);
   * if (!token) return res.status(401).json({ error: 'Token manquant' });
   */
  extractTokenFromHeader(authHeader) {
    if (!authHeader) {
      return null;
    }

    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('Authorization header does not start with "Bearer "');
      return null;
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    
    if (!token || token.trim() === '') {
      return null;
    }

    return token;
  }

  /**
   * Vérifier si Token est Expiré (sans exception)
   * 
   * @param {string} token - JWT
   * @returns {boolean} true si expiré, false sinon
   * 
   * Usage :
   * if (jwtService.isTokenExpired(token)) {
   *   // Rafraîchir token
   * }
   */
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return true;
      }

      const now = Math.floor(Date.now() / 1000);
      return decoded.exp < now;
    } catch (error) {
      return true;
    }
  }

  /**
   * Obtenir Temps Restant avant Expiration
   * 
   * @param {string} token - JWT
   * @returns {number} Secondes restantes, ou 0 si expiré
   * 
   * Usage :
   * const remaining = jwtService.getTokenRemainingTime(token);
   * if (remaining < 300) { // Moins de 5 minutes
   *   // Préventive refresh
   * }
   */
  getTokenRemainingTime(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return 0;
      }

      const now = Math.floor(Date.now() / 1000);
      const remaining = decoded.exp - now;
      return remaining > 0 ? remaining : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Générer Paire de Tokens (Access + Refresh)
   * 
   * @param {Object} user - User instance
   * @returns {Object} { accessToken, refreshToken }
   * 
   * Usage pratique :
   * const tokens = jwtService.generateTokenPair(user);
   * res.json({ tokens });
   */
  generateTokenPair(user) {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user),
    };
  }

  /**
   * Blacklist Token (nécessite Redis - implémentation future)
   * 
   * Pour logout sécurisé :
   * 1. Client envoie token à invalider
   * 2. Server ajoute token à blacklist Redis (TTL = temps restant)
   * 3. Middleware vérifie blacklist avant accepter token
   * 
   * Limitation actuelle : Pas de blacklist (JWT stateless)
   * Workaround : Refresh token rotation (invalide anciens tokens)
   */
  async blacklistToken(token) {
    // TODO Sprint 2 : Implémenter avec Redis
    logger.warn('Token blacklisting not yet implemented');
    throw new Error('Feature not implemented');
  }
}

// Export singleton instance
module.exports = new JWTService();