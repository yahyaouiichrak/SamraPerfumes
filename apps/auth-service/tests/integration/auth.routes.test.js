const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const User = require('../../src/models/User');

beforeAll(async () => {
  try {
    console.log('🔄 Connecting to test database...');
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    console.log('✅ Test database ready');
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  }
}, 60000);

afterAll(async () => {
  try {
    await sequelize.close();
    console.log('✅ Test database closed');
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
  }
}, 30000);

beforeEach(async () => {
  try {
    await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
  } catch (error) {
    // Ignore
  }
}, 10000);

describe('Auth Routes - Integration Tests', () => {
  // ==============================================
  // SYSTEM ROUTES
  // ==============================================
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('service', 'auth-service');
    }, 30000);
  });



  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/unknown-route');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('non trouvée');
    }, 30000);
  });

  // ==============================================
  // REGISTRATION
  // ==============================================
  describe('POST /api/auth/register', () => {
    const validUser = {
      email: 'test@example.com',
      password: 'Password123',
      name: 'Test User',
    };

    it('should register new user with valid data', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.role).toBe('client');
      expect(res.body.data.user).not.toHaveProperty('password');
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');

      // Verify in database
      const user = await User.findOne({ where: { email: validUser.email } });
      expect(user).toBeTruthy();
      expect(user.name).toBe(validUser.name);
    }, 30000);

    it('should reject duplicate email', async () => {
      await request(app).post('/api/auth/register').send(validUser);

      const res = await request(app).post('/api/auth/register').send(validUser);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('déjà utilisé');
    }, 30000);

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Password123',
          name: 'Test User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      
      // ✅ Vérifier que errors existe ET n'est pas vide
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
      
      // Vérifier que l'erreur concerne l'email
      const emailError = res.body.errors.find(e => e.field === 'email');
      expect(emailError).toBeDefined();
    }, 30000);

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak', // No uppercase, no number
          name: 'Test User',
        });

      expect(res.status).toBe(400);
      
      // ✅ Vérifier que errors existe ET n'est pas vide
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
      
      // Vérifier que l'erreur concerne le password
      const passwordError = res.body.errors.find(e => e.field === 'password');
      expect(passwordError).toBeDefined();
    }, 30000);

    it('should reject short name', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123',
          name: 'A', // Too short
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      
      const nameError = res.body.errors.find(e => e.field === 'name');
      expect(nameError).toBeDefined();
    }, 30000);

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          // Missing password and name
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(1);
    }, 30000);
  });

  // ==============================================
  // LOGIN
  // ==============================================
  describe('POST /api/auth/login', () => {
    const testUser = {
      email: 'login@example.com',
      password: 'Password123',
      name: 'Login User',
    };

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
    }, 30000);

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');
    }, 30000);

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('incorrect');
    }, 30000);

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('incorrect');
    }, 30000);
  });

  // ==============================================
  // PROFILE
  // ==============================================
  describe('GET /api/auth/profile', () => {
    let accessToken;

    beforeEach(async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'profile@example.com',
          password: 'Password123',
          name: 'Profile User',
        });

      accessToken = registerRes.body.data.tokens.accessToken;
    }, 30000);

    it('should get profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('profile@example.com');
    }, 30000);

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/profile');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Token manquant');
    }, 30000);

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('invalide');
    }, 30000);
  });

  // ==============================================
  // PROFILE UPDATE
  // ==============================================
  describe('PUT /api/auth/profile', () => {
    let accessToken;

    beforeEach(async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'update@example.com',
          password: 'Password123',
          name: 'Original Name',
        });

      accessToken = registerRes.body.data.tokens.accessToken;
    }, 30000);

    it('should update profile name', async () => {
      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Updated Name');

      // Verify in database
      const user = await User.findOne({ where: { email: 'update@example.com' } });
      expect(user.name).toBe('Updated Name');
    }, 30000);
  });
});