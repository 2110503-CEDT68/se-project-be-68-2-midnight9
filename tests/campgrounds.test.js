const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

jest.mock('../config/db', () => jest.fn());
jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'admin-user-id', role: 'admin' };
    next();
  },
  authorize: () => (req, res, next) => next()
}));

const campgroundsRouter = require('../routes/campgrounds');
const Campground = require('../models/Campground');
const Booking = require('../models/Booking');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/v1/campgrounds', campgroundsRouter);

let mongoServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
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

describe('Campground deletion rules', () => {
  const campgroundPayload = {
    name: 'Pine Valley',
    address: '12 Forest Road',
    district: 'Mae Rim',
    province: 'Chiang Mai',
    postalcode: '50180',
    tel: '0812345678',
    region: 'Northern',
    price: 750,
    picture: 'https://example.com/campground.jpg'
  };

  test('prevents deleting a campground with upcoming bookings', async () => {
    const user = await User.create({
      name: 'Guest User',
      email: 'guest@example.com',
      tel: '0899999999',
      password: 'password123',
      role: 'user'
    });

    const campground = await Campground.create(campgroundPayload);

    await Booking.create({
      user: user._id,
      campground: campground._id,
      checkInDate: new Date('2099-05-10'),
      checkOutDate: new Date('2099-05-12')
    });

    const res = await request(app).delete(`/api/v1/campgrounds/${campground._id}`);

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('This campground cannot be deleted while active or upcoming bookings exist.');

    const campgroundStillExists = await Campground.findById(campground._id);
    expect(campgroundStillExists).not.toBeNull();
  });

  test('allows deleting a campground when only past bookings exist', async () => {
    const user = await User.create({
      name: 'Past Guest',
      email: 'past@example.com',
      tel: '0888888888',
      password: 'password123',
      role: 'user'
    });

    const campground = await Campground.create({
      ...campgroundPayload,
      name: 'River Bend'
    });

    await Booking.create({
      user: user._id,
      campground: campground._id,
      checkInDate: new Date('2024-01-10'),
      checkOutDate: new Date('2024-01-12')
    });

    const res = await request(app).delete(`/api/v1/campgrounds/${campground._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const deletedCampground = await Campground.findById(campground._id);
    expect(deletedCampground).toBeNull();
  });
});
