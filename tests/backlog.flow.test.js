jest.mock('../config/db', () => jest.fn());
jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    const userId = req.headers['x-user-id'];
    const role = req.headers['x-user-role'] || 'user';

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }

    req.user = { id: userId, role };
    next();
  },
  authorize: (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  }
}));
jest.mock('../models/User', () => ({
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn()
}));
jest.mock('../models/Campground', () => ({
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../models/Booking', () => ({
  deleteMany: jest.fn(),
  countDocuments: jest.fn()
}));

const request = require('supertest');
const express = require('express');

const User = require('../models/User');
const Campground = require('../models/Campground');
const Booking = require('../models/Booking');
const authRoutes = require('../routes/auth');
const campgroundRoutes = require('../routes/campgrounds');

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/campgrounds', campgroundRoutes);

describe('Sprint backlog route flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_COOKIE_EXPIRE = '1';
    process.env.NODE_ENV = 'test';
  });

  test('US1-3: updates profile details through the route and persists normalized data', async () => {
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'user-1',
      name: 'Alice',
      tel: '0812345678'
    });

    const res = await request(app)
      .put('/api/v1/auth/updatedetails')
      .set('x-user-id', 'user-1')
      .send({
        name: '  Alice  ',
        tel: '081-234-5678',
        emergencyPhone: '089 999 9999',
        birthdate: '2000-01-01'
      });

    expect(res.statusCode).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      {
        name: 'Alice',
        tel: '0812345678',
        emergencyPhone: '0899999999',
        birthDate: '2000-01-01'
      },
      {
        returnDocument: 'after',
        runValidators: true
      }
    );
  });

  test('US1-4: rejects deleting a profile when password confirmation is missing', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set('x-user-id', 'user-1')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Please provide your password to delete this account'
    });
  });

  test('US2-3: validates campground update data through the admin route', async () => {
    const res = await request(app)
      .put('/api/v1/campgrounds/camp-1')
      .set('x-user-id', 'admin-1')
      .set('x-user-role', 'admin')
      .send({ price: 'not-a-number' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Please add a valid price per night'
    });
    expect(Campground.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('US2-4: blocks campground deletion when active bookings exist', async () => {
    Campground.findById.mockResolvedValue({
      _id: 'camp-1',
      deleteOne: jest.fn()
    });
    Booking.countDocuments.mockResolvedValue(2);

    const res = await request(app)
      .delete('/api/v1/campgrounds/camp-1')
      .set('x-user-id', 'admin-1')
      .set('x-user-role', 'admin');

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: 'Cannot delete campground with 2 active or upcoming booking(s)'
    });
  });
});
