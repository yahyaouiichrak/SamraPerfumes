const authController = require('../../src/controllers/auth.controller');
const User = require('../../src/models/User');
const jwtService = require('../../src/services/jwt.service');

// Mock User model
jest.mock('../../src/models/User');

describe('Auth Controller - Basic Tests', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      user: null,
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('register()', () => {
    it('should register new user successfully', async () => {
      // Arrange
      req.body = {
        email: 'test@example.com',
        password: 'Password123',
        name: 'Test User',
      };

      const mockUser = {
        id: 'uuid-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'client',
        toJSON: jest.fn().mockReturnValue({
          id: 'uuid-123',
          email: 'test@example.com',
          role: 'client',
        }),
      };

      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue(mockUser);

      // Act
      await authController.register(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalled();
      expect(User.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should reject existing email', async () => {
      // Arrange
      req.body = {
        email: 'existing@example.com',
        password: 'Password123',
        name: 'Test User',
      };

      User.findOne.mockResolvedValue({ email: 'existing@example.com' });

      // Act
      await authController.register(req, res);

      // Assert
      expect(User.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('getProfile()', () => {
    it('should return user profile', async () => {
      // Arrange
      req.user = {
        id: 'uuid-123',
        email: 'test@example.com',
        toJSON: jest.fn().mockReturnValue({
          id: 'uuid-123',
          email: 'test@example.com',
        }),
      };

      // Act
      await authController.getProfile(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            user: expect.any(Object),
          }),
        })
      );
    });
  });
});