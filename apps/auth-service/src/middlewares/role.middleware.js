const logger = require('../utils/logger');

/**
 * Middleware de Vérification de Rôle
 * 
 * Responsabilité :
 * - Vérifier que req.user a le rôle requis
 * - Protège routes admin (CRUD produits, gestion commandes)
 * 
 * Utilisation : Après authenticate
 * Exemple : router.delete('/users/:id', authenticate, requireAdmin, deleteUser)
 * 
 * Principe : Defense in depth (authentification + autorisation)
 */

const requireAdmin = (req, res, next) => {
  // Prérequis : authenticate middleware doit être appelé avant
  if (!req.user) {
    logger.error('requireAdmin called without authenticate middleware');
    return res.status(500).json({
      success: false,
      message: 'Erreur configuration serveur.',
    });
  }

  // Vérifier rôle admin
  if (req.user.role !== 'admin') {
    logger.warn(`User ${req.user.email} (role: ${req.user.role}) attempted admin access`);
    
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Privilèges administrateur requis.',
    });
  }

  // User est admin, autoriser
  logger.debug(`Admin ${req.user.email} granted access`);
  next();
};

/**
 * Factory pour rôles multiples (extensibilité future)
 * Exemple : requireRole(['admin', 'moderator'])
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(500).json({
        success: false,
        message: 'Erreur configuration serveur.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôles requis : ${roles.join(', ')}`,
      });
    }

    next();
  };
};

module.exports = { requireAdmin, requireRole };