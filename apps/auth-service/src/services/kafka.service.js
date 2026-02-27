
const { producer } = require('../config/kafka');
const logger = require('../utils/logger');

/**
 * Kafka Service - Event Publishing
 * 
 * Architecture Event-Driven :
 * - Auth-Service = Producer (publie événements métier)
 * - Autres services = Consumers (réagissent aux événements)
 * 
 * Pourquoi Kafka ?
 * - Découplage total : Auth ne connaît pas Email-Service
 * - Scalabilité : Multiple consumers peuvent traiter events en parallèle
 * - Résilience : Events persistés, retry automatique
 * - Audit trail : Log complet de tous événements métier
 * 
 * Topics Kafka :
 * - user-events : Événements utilisateurs (registered, logged_in, etc.)
 * - auth-events : Événements auth critiques (password_reset, account_locked)
 * 
 * Event Schema (exemple) :
 * {
 *   type: "user.registered",
 *   userId: "uuid",
 *   email: "user@example.com",
 *   role: "client",
 *   timestamp: "2024-02-19T10:30:00.000Z",
 *   metadata: { ip: "192.168.1.1", userAgent: "..." }
 * }
 */

class KafkaService {
  constructor() {
    this.producer = producer;
    this.isConnected = false;

    // Topic configuration
    this.topics = {
      USER_EVENTS: process.env.KAFKA_TOPIC_USER_EVENTS || 'user-events',
      AUTH_EVENTS: process.env.KAFKA_TOPIC_AUTH_EVENTS || 'auth-events',
    };

    logger.info('✅ Kafka Service initialized');
  }

  /**
   * Publier Événement Générique
   * 
   * @param {string} topic - Kafka topic name
   * @param {Object} event - Event payload
   * @param {string} event.type - Event type (ex: "user.registered")
   * @param {string} [key] - Partition key (défaut: event.userId)
   * 
   * Kafka Partitioning :
   * - Key fournie → événements même key → même partition → ordre garanti
   * - Pas de key → round-robin entre partitions → pas d'ordre garanti
   * 
   * Exemple :
   * await kafkaService.publishEvent('user-events', {
   *   type: 'user.registered',
   *   userId: 'abc',
   *   email: 'test@example.com'
   * });
   */
  async publishEvent(topic, event, key = null) {
    try {
      // Enrichir event avec metadata
      const enrichedEvent = {
        ...event,
        timestamp: new Date().toISOString(),
        service: 'auth-service',
        version: '1.0.0',
      };

      // Déterminer partition key (garantir ordre événements même user)
      const partitionKey = key || event.userId || event.email || event.type;

      // Publier vers Kafka
      const result = await this.producer.send({
        topic,
        messages: [
          {
            key: partitionKey,
            value: JSON.stringify(enrichedEvent),
            headers: {
              'event-type': event.type,
              'source-service': 'auth-service',
            },
          },
        ],
      });

      logger.info(`📤 Kafka event published: ${event.type} to ${topic}`, {
        topic,
        partition: result[0].partition,
        offset: result[0].offset,
      });

      return { success: true, ...result[0] };
    } catch (error) {
      logger.error(`❌ Failed to publish Kafka event: ${event.type}`, {
        error: error.message,
        topic,
        event,
      });

      // ⚠️ Ne pas throw error : Service continue même si Kafka down
      // Alternative : Implémenter retry queue (Redis) ou dead-letter topic
      return { success: false, error: error.message };
    }
  }

  /**
   * Publier Multiple Événements (Batch)
   * 
   * @param {string} topic - Kafka topic
   * @param {Array<Object>} events - Array d'événements
   * 
   * Avantage batch :
   * - Performance : 1 appel réseau vs N appels
   * - Atomicité : Tous événements publiés ou aucun
   * 
   * Usage :
   * await kafkaService.publishBatch('user-events', [
   *   { type: 'user.registered', userId: '1' },
   *   { type: 'user.registered', userId: '2' }
   * ]);
   */
  async publishBatch(topic, events) {
    try {
      const messages = events.map((event) => ({
        key: event.userId || event.email || event.type,
        value: JSON.stringify({
          ...event,
          timestamp: new Date().toISOString(),
          service: 'auth-service',
        }),
        headers: {
          'event-type': event.type,
          'source-service': 'auth-service',
        },
      }));

      const result = await this.producer.send({
        topic,
        messages,
      });

      logger.info(`📤 Kafka batch published: ${events.length} events to ${topic}`);
      return { success: true, count: events.length };
    } catch (error) {
      logger.error('❌ Failed to publish Kafka batch', {
        error: error.message,
        topic,
        count: events.length,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * ========================================
   * USER EVENTS - Événements Utilisateurs
   * ========================================
   */

  /**
   * Event : User Registered
   * Déclenché après création compte (client ou admin)
   * 
   * Consumers :
   * - Email-Service : Envoie email bienvenue
   * - Analytics-Service : Track nouvelle inscription
   * - CRM-Service : Crée contact dans CRM
   */
  async publishUserRegistered(user, metadata = {}) {
    return await this.publishEvent(this.topics.USER_EVENTS, {
      type: 'user.registered',
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      metadata: {
        registrationSource: metadata.source || 'web',
        referrer: metadata.referrer || null,
        ip: metadata.ip || null,
      },
    });
  }

  /**
   * Event : User Logged In
   * Déclenché à chaque login réussi
   * 
   * Consumers :
   * - Analytics-Service : Track activité utilisateur
   * - Security-Service : Détection connexions suspectes (géolocalisation)
   * - Notification-Service : Alerte si connexion nouveau device
   */
  async publishUserLoggedIn(user, metadata = {}) {
    return await this.publishEvent(this.topics.USER_EVENTS, {
      type: 'user.logged_in',
      userId: user.id,
      email: user.email,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
      metadata: {
        ip: metadata.ip || null,
        userAgent: metadata.userAgent || null,
        device: metadata.device || null,
        location: metadata.location || null,
      },
    });
  }

  /**
   * Event : User Profile Updated
   * Déclenché quand user modifie son profil
   * 
   * Consumers :
   * - Search-Service : Réindexer utilisateur
   * - Cache-Service : Invalider cache profil
   */
  async publishUserUpdated(user, changes = {}) {
    return await this.publishEvent(this.topics.USER_EVENTS, {
      type: 'user.updated',
      userId: user.id,
      email: user.email,
      changes, // Ex: { name: { old: 'John', new: 'Jane' } }
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Event : User Deleted/Deactivated
   * Déclenché quand compte supprimé ou désactivé
   * 
   * Consumers :
   * - Email-Service : Envoie confirmation suppression
   * - Order-Service : Anonymise commandes
   * - GDPR-Service : Suppression données personnelles
   */
  async publishUserDeleted(user, reason = 'user_request') {
    return await this.publishEvent(this.topics.USER_EVENTS, {
      type: 'user.deleted',
      userId: user.id,
      email: user.email,
      reason, // 'user_request', 'admin_action', 'gdpr_compliance'
      deletedAt: new Date().toISOString(),
    });
  }

  /**
   * ========================================
   * AUTH EVENTS - Événements Authentification
   * ========================================
   */

  /**
   * Event : Password Reset Requested
   * Déclenché quand user demande reset password
   * 
   * Consumers :
   * - Email-Service : Envoie email avec lien reset
   * - Security-Service : Monitor tentatives reset (détection spam)
   */
  async publishPasswordResetRequested(user, resetToken) {
    return await this.publishEvent(this.topics.AUTH_EVENTS, {
      type: 'password.reset_requested',
      userId: user.id,
      email: user.email,
      resetTokenExpires: user.resetPasswordExpires,
      // Ne PAS inclure resetToken (sensible)
    });
  }

  /**
   * Event : Password Reset Completed
   * Déclenché après reset password réussi
   * 
   * Consumers :
   * - Email-Service : Envoie confirmation changement password
   * - Security-Service : Invalide sessions actives (force re-login)
   */
  async publishPasswordReset(user) {
    return await this.publishEvent(this.topics.AUTH_EVENTS, {
      type: 'password.reset_completed',
      userId: user.id,
      email: user.email,
      resetAt: new Date().toISOString(),
    });
  }

  /**
   * Event : Failed Login Attempt
   * Déclenché après échec login (bruteforce detection)
   * 
   * Consumers :
   * - Security-Service : Track tentatives, bloquer IP après N échecs
   * - Analytics-Service : Alertes sécurité
   */
  async publishFailedLogin(email, reason, metadata = {}) {
    return await this.publishEvent(this.topics.AUTH_EVENTS, {
      type: 'login.failed',
      email,
      reason, // 'wrong_password', 'user_not_found', 'account_locked'
      metadata: {
        ip: metadata.ip || null,
        userAgent: metadata.userAgent || null,
        attemptCount: metadata.attemptCount || 1,
      },
    });
  }

  /**
   * Event : Account Locked
   * Déclenché quand compte bloqué (trop de tentatives)
   * 
   * Consumers :
   * - Email-Service : Alerte utilisateur
   * - Admin-Dashboard : Notification admin
   */
  async publishAccountLocked(user, reason) {
    return await this.publishEvent(this.topics.AUTH_EVENTS, {
      type: 'account.locked',
      userId: user.id,
      email: user.email,
      reason, // 'bruteforce', 'admin_action', 'fraud_detection'
      lockedAt: new Date().toISOString(),
    });
  }

  /**
   * Event : Account Unlocked
   * Déclenché quand compte débloqué
   */
  async publishAccountUnlocked(user) {
    return await this.publishEvent(this.topics.AUTH_EVENTS, {
      type: 'account.unlocked',
      userId: user.id,
      email: user.email,
      unlockedAt: new Date().toISOString(),
    });
  }

  /**
   * Event : Email Verification Sent
   * Déclenché quand email vérification envoyé
   */
  async publishEmailVerificationSent(user, verificationToken) {
    return await this.publishEvent(this.topics.AUTH_EVENTS, {
      type: 'email.verification_sent',
      userId: user.id,
      email: user.email,
      // Ne pas inclure token
    });
  }

  /**
   * Event : Email Verified
   * Déclenché après vérification email réussie
   * 
   * Consumers :
   * - Email-Service : Email confirmation
   * - User-Service : Activer fonctionnalités premium
   */
  async publishEmailVerified(user) {
    return await this.publishEvent(this.topics.USER_EVENTS, {
      type: 'email.verified',
      userId: user.id,
      email: user.email,
      verifiedAt: new Date().toISOString(),
    });
  }

  /**
   * ========================================
   * ADMIN EVENTS - Événements Admin
   * ========================================
   */

  /**
   * Event : Admin Action Performed
   * Déclenché quand admin effectue action sensible
   * 
   * Audit trail pour conformité
   */
  async publishAdminAction(admin, action, targetUser = null, metadata = {}) {
    return await this.publishEvent(this.topics.AUTH_EVENTS, {
      type: 'admin.action',
      adminId: admin.id,
      adminEmail: admin.email,
      action, // 'user_deleted', 'password_reset', 'role_changed'
      targetUserId: targetUser?.id || null,
      targetUserEmail: targetUser?.email || null,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * ========================================
   * UTILITY METHODS
   * ========================================
   */

  /**
   * Vérifier Santé Kafka Connection
   * 
   * @returns {Object} { connected: boolean, topics: Array }
   */
  async getHealth() {
    try {
      const admin = this.producer.kafka.admin();
      await admin.connect();
      const topics = await admin.listTopics();
      await admin.disconnect();

      return {
        connected: true,
        topics,
      };
    } catch (error) {
      logger.error('Kafka health check failed:', error);
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Créer Topic si n'existe pas
   * (utile pour setup initial)
   */
  async createTopicIfNotExists(topic, numPartitions = 3, replicationFactor = 1) {
    try {
      const admin = this.producer.kafka.admin();
      await admin.connect();

      const existingTopics = await admin.listTopics();

      if (!existingTopics.includes(topic)) {
        await admin.createTopics({
          topics: [
            {
              topic,
              numPartitions,
              replicationFactor,
            },
          ],
        });
        logger.info(`✅ Kafka topic created: ${topic}`);
      } else {
        logger.debug(`Kafka topic already exists: ${topic}`);
      }

      await admin.disconnect();
    } catch (error) {
      logger.error(`Failed to create Kafka topic ${topic}:`, error);
    }
  }
}

// Export singleton instance
module.exports = new KafkaService();