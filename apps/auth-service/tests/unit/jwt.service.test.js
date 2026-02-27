const jwtService = require('../../src/services/jwt.service');

describe('JWT Service - Basic Tests', () => {
  const mockUser = {
    id: 'test-uuid-123',
    email: 'test@example.com',
    role: 'client',
  };

  describe('generateAccessToken()', () => {
    it('should generate a valid token', () => {
      const token = jwtService.generateAccessToken(mockUser);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });
  });

  describe('verifyAccessToken()', () => {
    it('should verify valid token', () => {
      const token = jwtService.generateAccessToken(mockUser);
      const decoded = jwtService.verifyAccessToken(token);
      
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
    });

    it('should reject invalid token', () => {
      expect(() => {
        jwtService.verifyAccessToken('invalid.token.here');
      }).toThrow();
    });
  });

  describe('generateRefreshToken()', () => {
    it('should generate refresh token', () => {
      const token = jwtService.generateRefreshToken(mockUser);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('isTokenExpired()', () => {
    it('should return false for fresh token', () => {
      const token = jwtService.generateAccessToken(mockUser);
      expect(jwtService.isTokenExpired(token)).toBe(false);
    });

    it('should return true for malformed token', () => {
      expect(jwtService.isTokenExpired('malformed')).toBe(true);
    });
  });
});