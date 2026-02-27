const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Email Service
 * 
 * Responsabilité : Envoi emails transactionnels
 * - Welcome email après registration
 * - Password reset email
 * 
 * Architecture :
 * - Service découplé (peut être remplacé par SendGrid/Mailgun)
 * - Templates HTML simples (futur : Handlebars pour templates complexes)
 * - Retry logic si échec (via Kafka dans Email-Service Sprint 4)
 */

class EmailService {
  constructor() {
    // Configuration transport SMTP
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // true pour port 465, false pour 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Vérifier connexion SMTP au démarrage
    this.verifyConnection();
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info('✅ Email service connected');
    } catch (error) {
      logger.error('❌ Email service connection failed:', error);
      // Ne pas crasher le service, continuer sans emails
    }
  }

  async sendEmail(to, subject, html) {
    try {
      const info = await this.transporter.sendMail({
        from: `"Perfume Platform" <${process.env.SMTP_FROM}>`,
        to,
        subject,
        html,
      });

      logger.info(`📧 Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`❌ Failed to send email to ${to}:`, error);
      // Ne pas throw error, continuer (email non critique pour auth)
      return { success: false, error: error.message };
    }
  }

  /**
   * Email de bienvenue après registration
   */
  async sendWelcomeEmail(user) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Bienvenue sur Perfume Platform !</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${user.name}</strong>,</p>
            <p>Nous sommes ravis de vous accueillir parmi nous ! Votre compte a été créé avec succès.</p>
            <p>Vous pouvez dès maintenant explorer notre catalogue de parfums et profiter de recommandations personnalisées grâce à notre IA.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/catalog" class="button">
              Explorer le Catalogue
            </a>
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Si vous n'avez pas créé ce compte, veuillez ignorer cet email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(user.email, 'Bienvenue sur Perfume Platform 🌸', html);
  }

  /**
   * Email de réinitialisation mot de passe
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f44336; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #f44336; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Réinitialisation de Mot de Passe</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${user.name}</strong>,</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            <a href="${resetUrl}" class="button">
              Réinitialiser mon Mot de Passe
            </a>
            <div class="warning">
              ⚠️ Ce lien est valide pendant <strong>1 heure</strong>.
            </div>
            <p style="margin-top: 20px; font-size: 14px; color: #666;">
              Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe actuel reste inchangé.
            </p>
            <p style="font-size: 12px; color: #999; margin-top: 30px;">
              Si le bouton ne fonctionne pas, copiez ce lien : <br>
              <code style="background: #e0e0e0; padding: 5px;">${resetUrl}</code>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(user.email, 'Réinitialisation de votre Mot de Passe', html);
  }
}

module.exports = new EmailService();
