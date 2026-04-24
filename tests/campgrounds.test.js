const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../config/db', () => jest.fn());

const campgroundsRouter = require('../routes/campgrounds');
const Campground = require('../models/Campground');
const Booking = require('../models/Booking');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/v1/campgrounds', campgroundsRouter);

let mongoServer;

const validCampground = (name = 'Test Campground') => ({
  name,
  price: 500,
  picture: 'https://example.com/camp.jpg',
  address: '99 Test Road',
  district: 'Pathum Wan',
  province: 'Bangkok',
  region: 'Central',
  tel: '0812345678',
  postalcode: '10330'
});

const createUser = async (role = 'admin') => {
  return User.create({
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    tel: '0812345678',
    password: 'password123',
    role
  });
};

const authHeader = (user) => `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_secret';
  process.env.JWT_EXPIRE = '1d';
  process.env.JWT_COOKIE_EXPIRE = '1';
  process.env.NODE_ENV = 'test';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Campground.syncIndexes();
  await User.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Booking.deleteMany({});
  await Campground.deleteMany({});
  await User.deleteMany({});
});

describe('Campground update flow', () => {
  test('admin can update campground details with validated values', async () => {
    const admin = await createUser('admin');
    const campground = await Campground.create(validCampground('Original Camp'));

    const res = await request(app)
      .put(`/api/v1/campgrounds/${campground._id}`)
      .set('Authorization', authHeader(admin))
      .send({
        name: '  Updated Camp  ',
        price: '750',
        picture: 'https://example.com/updated.jpg',
        address: '100 Updated Road',
        district: 'Muang',
        province: 'Chiang Mai',
        region: 'Northern',
        tel: '0899999999',
        postalcode: '50000'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Camp');
    expect(res.body.data.price).toBe(750);
    expect(res.body.data.tel).toBe('0899999999');
  });

  test.each([
    [{ price: '-1' }, /valid price/i],
    [{ picture: 'not-a-url' }, /valid picture url/i],
    [{ tel: '12345' }, /valid thai telephone number/i],
    [{ postalcode: 'abcde' }, /valid postal code/i]
  ])('rejects invalid update payload %p', async (payload, message) => {
    const admin = await createUser('admin');
    const campground = await Campground.create(validCampground('Invalid Update Camp'));

    const res = await request(app)
      .put(`/api/v1/campgrounds/${campground._id}`)
      .set('Authorization', authHeader(admin))
      .send(payload);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(message);
  });

  test('non-admin users cannot update a campground', async () => {
    const user = await createUser('user');
    const campground = await Campground.create(validCampground('Protected Camp'));

    const res = await request(app)
      .put(`/api/v1/campgrounds/${campground._id}`)
      .set('Authorization', authHeader(user))
      .send({ price: 600 });

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('Campground deletion flow', () => {
  test('admin can delete a campground when only past bookings exist', async () => {
    const admin = await createUser('admin');
    const user = await createUser('user');
    const campground = await Campground.create(validCampground('Past Booking Camp'));

    await Booking.create({
      campground: campground._id,
      user: user._id,
      checkInDate: new Date('2024-01-01T00:00:00.000Z'),
      checkOutDate: new Date('2024-01-02T00:00:00.000Z')
    });

    const res = await request(app)
      .delete(`/api/v1/campgrounds/${campground._id}`)
      .set('Authorization', authHeader(admin));

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await Campground.findById(campground._id)).toBeNull();
    expect(await Booking.countDocuments({ campground: campground._id })).toBe(0);
  });

  test('admin cannot delete a campground with active or upcoming bookings', async () => {
    const admin = await createUser('admin');
    const user = await createUser('user');
    const campground = await Campground.create(validCampground('Active Booking Camp'));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    await Booking.create({
      campground: campground._id,
      user: user._id,
      checkInDate: tomorrow,
      checkOutDate: nextWeek
    });

    const res = await request(app)
      .delete(`/api/v1/campgrounds/${campground._id}`)
      .set('Authorization', authHeader(admin));

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/active or upcoming booking/i);
    expect(await Campground.findById(campground._id)).not.toBeNull();
    expect(await Booking.countDocuments({ campground: campground._id })).toBe(1);
  });
});
