const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

/**
 * User Model - Représentation de la table 'users' dans PostgreSQL
 * 
 * Responsabilités :
 * - Définir schéma utilisateur (colonnes, types, contraintes)
 * - Hashing automatique password (hooks beforeCreate/beforeUpdate)
 * - Méthode de comparaison password (bcrypt.compare)
 * - Exclusion données sensibles dans toJSON (password, resetToken)
 * 
 * Colonnes :
 * - id : UUID (clé primaire)
 * - email : String unique (authentification)
 * - password : String hashed (bcrypt cost 12)
 * - name : String (nom complet)
 * - role : Enum('client', 'admin')
 * - isActive : Boolean (compte actif/suspendu)
 * - emailVerified : Boolean (email confirmé ou non)
 * - resetPasswordToken : String nullable (token reset)
 * - resetPasswordExpires : Date nullable (expiration token)
 * - lastLoginAt : Date nullable (dernière connexion)
 * - createdAt : Timestamp (création auto)
 * - updatedAt : Timestamp (MAJ auto)
 */

const User = sequelize.define(
  'User',
  {
    // Primary Key (UUID for scalability & security)
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Unique user identifier (UUID v4)',
    },

    // Authentication
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: {
        name: 'users_email_unique',
        msg: 'Email address already in use',
      },
      validate: {
        isEmail: {
          msg: 'Must be a valid email address',
        },
        notEmpty: {
          msg: 'Email cannot be empty',
        },
      },
      comment: 'User email (unique, used for authentication)',
    },

    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Password cannot be empty',
        },
        len: {
          args: [8, 255],
          msg: 'Password must be at least 8 characters long',
        },
      },
      comment: 'Hashed password (bcrypt)',
    },

    // Profile
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Name cannot be empty',
        },
        len: {
          args: [2, 100],
          msg: 'Name must be between 2 and 100 characters',
        },
      },
      comment: 'User full name',
    },

    // Authorization
    role: {
      type: DataTypes.ENUM('client', 'admin'),
      defaultValue: 'client',
      allowNull: false,
      comment: 'User role (client or admin)',
    },

    // Account Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Account active status (false = suspended)',
    },

    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Email verification status',
    },

    // Password Reset
    resetPasswordToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Hashed token for password reset',
    },

    resetPasswordExpires: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Password reset token expiration timestamp',
    },

    // Tracking
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last successful login timestamp',
    },
  },
  {
    tableName: 'users',
    underscored: true, // snake_case columns (created_at, updated_at)
    timestamps: true, // Auto-manage createdAt, updatedAt

    // Indexes for performance
    indexes: [
      {
        unique: true,
        fields: ['email'],
        name: 'users_email_index',
      },
      {
        fields: ['role'],
        name: 'users_role_index',
      },
      {
        fields: ['is_active'],
        name: 'users_is_active_index',
      },
    ],

    // Hooks (lifecycle events)
    hooks: {
      /**
       * Before Create Hook
       * Hash password before saving new user
       */
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(12); // Cost factor 12 (secure)
          user.password = await bcrypt.hash(user.password, salt);
        }
      },

      /**
       * Before Update Hook
       * Hash password if it was changed
       */
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },
  }
);

/**
 * Instance Method: Compare Password
 * 
 * @param {string} candidatePassword - Plain text password from login
 * @returns {Promise<boolean>} - True if password matches
 * 
 * Usage:
 * const user = await User.findOne({ where: { email } });
 * const isValid = await user.comparePassword(password);
 */
User.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Instance Method: toJSON Override
 * Exclude sensitive fields from JSON serialization
 * 
 * @returns {Object} - Safe user object (no password, no tokens)
 * 
 * Usage:
 * res.json({ user: user.toJSON() }); // No password in response
 */
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  
  // Remove sensitive fields
  delete values.password;
  delete values.resetPasswordToken;
  delete values.resetPasswordExpires;
  
  return values;
};

module.exports = User;
