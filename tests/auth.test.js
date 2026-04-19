const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const auth = require('../controllers/auth');
const User = require('../models/User');

jest.mock('../config/db', () => jest.fn());

const app = express();
app.use(express.json());
app.post('/api/v1/auth/register', auth.register);

let mongoServer;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_secret';
  process.env.JWT_EXPIRE = '1d';
  process.env.JWT_COOKIE_EXPIRE = '1';
  process.env.NODE_ENV = 'test';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

describe('Registration Flow - Integration Test', () => {
  const validUser = {
    name: 'Test User',
    email: 'test@gmail.com',
    tel: '0812345678',
    password: 'password123',
    role: 'user',
    birthdate: '2000-01-01'
  };

  test('TC-01: Should successfully register and return a token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser);

    if (res.statusCode === 500) {
        console.log('Full Error details:', res.body);
    }

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  test('TC-02: Should fail if email is already registered', async () => {
    await User.create(validUser);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});