const jwtService = require('../services/jwt.service');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware d'Authentification
 * 
 * Responsabilité :
 * 1. Extraire token JWT du header Authorization
 * 2. Vérifier validité du token (signature, expiration)
 * 3. Charger utilisateur depuis DB
 * 4. Ajouter user à req.user (disponible dans contrôleurs)
 * 
 * Utilisation : Protéger routes nécessitant authentification
 * Exemple : router.get('/profile', authenticate, getProfile)
 */

const authenticate = async (req, res, next) => {
  try {
    // 1. Extraire token du header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token manquant. Veuillez vous connecter.',
      });
    }

    const token = authHeader.split(' ')[1]; // "Bearer TOKEN" → TOKEN

    // 2. Vérifier token JWT
    let decoded;
    try {
      decoded = jwtService.verifyAccessToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré. Veuillez vous reconnecter.',
      });
    }

    // 3. Charger utilisateur depuis DB (vérifier existence)
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur introuvable.',
      });
    }

    // 4. Vérifier que compte est actif
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Compte désactivé. Contactez le support.',
      });
    }

    // 5. Ajouter user à req (disponible dans contrôleurs)
    req.user = user;

    // 6. Logger l'action (observabilité)
    logger.debug(`User ${user.email} authenticated`);

    next(); // Passer au contrôleur
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification.',
    });
  }
};

module.exports = authenticate;