jest.mock('../config/db', () => jest.fn());
jest.mock('../models/User', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  find: jest.fn()
}));
jest.mock('../models/Booking', () => ({
  deleteMany: jest.fn()
}));

const connectDB = require('../config/db');
const User = require('../models/User');
const Booking = require('../models/Booking');
const authController = require('../controllers/auth');

const createResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

const createUserWithToken = (overrides = {}) => ({
  _id: 'user-1',
  getSignedJwtToken: jest.fn().mockReturnValue('signed-token'),
  ...overrides
});

describe('auth controller', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCookieExpire = process.env.JWT_COOKIE_EXPIRE;

  beforeEach(() => {
    jest.clearAllMocks();
    connectDB.mockResolvedValue(undefined);
    process.env.NODE_ENV = 'test';
    process.env.JWT_COOKIE_EXPIRE = '1';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_COOKIE_EXPIRE = originalCookieExpire;
  });

  describe('register', () => {
    test('registers user successfully and normalizes phone fields', async () => {
      const user = createUserWithToken();
      User.create.mockResolvedValue(user);

      const req = {
        body: {
          name: 'John Doe',
          tel: '081-234-5678',
          email: 'john@example.com',
          password: 'password123',
          role: 'user',
          birthdate: '2000-01-01',
          province: 'Chiang Mai',
          emergencyName: 'Jane Doe',
          emergencyPhone: '089 999 9999',
          medicalConditions: 'none'
        }
      };
      const res = createResponse();

      await authController.register(req, res);

      expect(User.create).toHaveBeenCalledWith({
        name: 'John Doe',
        tel: '0812345678',
        email: 'john@example.com',
        password: 'password123',
        role: 'user',
        birthDate: '2000-01-01',
        province: 'Chiang Mai',
        emergencyName: 'Jane Doe',
        emergencyPhone: '0899999999',
        medicalConditions: 'none'
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'signed-token',
        expect.objectContaining({ httpOnly: true })
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, token: 'signed-token' });
    });

    test('sets secure cookie in production', async () => {
      process.env.NODE_ENV = 'production';
      const user = createUserWithToken();
      User.create.mockResolvedValue(user);

      const req = {
        body: {
          name: 'John Doe',
          tel: '0812345678',
          email: 'john@example.com',
          password: 'password123'
        }
      };
      const res = createResponse();

      await authController.register(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'signed-token',
        expect.objectContaining({ httpOnly: true, secure: true })
      );
    });

    test('returns 400 when registration fails', async () => {
      User.create.mockRejectedValue(new Error('Validation failed'));

      const req = { body: { tel: 812345678 } };
      const res = createResponse();

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed'
      });
    });
  });

  describe('login', () => {
    test('returns 400 when email or password is missing', async () => {
      const req = { body: { email: 'john@example.com' } };
      const res = createResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        msg: 'Please provide an email and password'
      });
    });

    test('returns 400 when user is not found', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const req = { body: { email: 'john@example.com', password: 'password123' } };
      const res = createResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        msg: 'Invalid credentials'
      });
    });

    test('returns 401 when password does not match', async () => {
      const user = {
        matchPassword: jest.fn().mockResolvedValue(false)
      };
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      const req = { body: { email: 'john@example.com', password: 'wrong' } };
      const res = createResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        msg: 'Invalid credentials'
      });
    });

    test('logs in successfully when credentials match', async () => {
      const user = createUserWithToken({
        matchPassword: jest.fn().mockResolvedValue(true)
      });
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      const req = { body: { email: 'john@example.com', password: 'password123' } };
      const res = createResponse();

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, token: 'signed-token' });
    });
  });

  describe('logout', () => {
    test('clears auth cookie', async () => {
      const req = {};
      const res = createResponse();

      await authController.logout(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'none',
        expect.objectContaining({ httpOnly: true, expires: expect.any(Date) })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: {} });
    });
  });

  describe('getMe', () => {
    test('returns current user profile', async () => {
      const user = { _id: 'user-1', name: 'John Doe' };
      User.findById.mockResolvedValue(user);

      const req = { user: { id: 'user-1' } };
      const res = createResponse();

      await authController.getMe(req, res);

      expect(User.findById).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: user });
    });
  });

  describe('updateDetails', () => {
    test('updates normalized profile fields successfully', async () => {
      const updatedUser = { _id: 'user-1', name: 'John' };
      User.findByIdAndUpdate.mockResolvedValue(updatedUser);

      const req = {
        user: { id: 'user-1' },
        body: {
          name: '  John  ',
          tel: '081-234-5678',
          emergencyPhone: '089 999 9999',
          birthDate: '',
          province: 123
        }
      };
      const res = createResponse();

      await authController.updateDetails(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        {
          name: 'John',
          tel: '0812345678',
          birthDate: null,
          province: 123,
          emergencyPhone: '0899999999'
        },
        {
          returnDocument: 'after',
          runValidators: true
        }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updatedUser });
    });

    test('maps birthdate alias and trims emergency name', async () => {
      const updatedUser = { _id: 'user-1' };
      User.findByIdAndUpdate.mockResolvedValue(updatedUser);

      const req = {
        user: { id: 'user-1' },
        body: {
          birthdate: '2000-01-01',
          emergencyName: '  Jane Doe  '
        }
      };
      const res = createResponse();

      await authController.updateDetails(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        {
          birthDate: '2000-01-01',
          emergencyName: 'Jane Doe'
        },
        {
          returnDocument: 'after',
          runValidators: true
        }
      );
    });

    test('returns 400 when no profile fields are provided', async () => {
      const req = {
        user: { id: 'user-1' },
        body: undefined
      };
      const res = createResponse();

      await authController.updateDetails(req, res);

      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide at least one profile field to update'
      });
    });

    test('returns 400 when updating details fails', async () => {
      User.findByIdAndUpdate.mockRejectedValue(new Error('Validation failed'));

      const req = {
        user: { id: 'user-1' },
        body: { email: 'bad-email' }
      };
      const res = createResponse();

      await authController.updateDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed'
      });
    });
  });

  describe('deleteMe', () => {
    test('returns 400 when password is missing', async () => {
      const req = {
        user: { id: 'user-1' },
        body: {}
      };
      const res = createResponse();

      await authController.deleteMe(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide your password to delete this account'
      });
    });

    test('returns 404 when current user is not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const req = {
        user: { id: 'missing-user' },
        body: { password: 'password123' }
      };
      const res = createResponse();

      await authController.deleteMe(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No user found with the id of missing-user'
      });
    });

    test('returns 401 when delete password is incorrect', async () => {
      const user = {
        matchPassword: jest.fn().mockResolvedValue(false)
      };
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      const req = {
        user: { id: 'user-1' },
        body: { password: 'wrong-password' }
      };
      const res = createResponse();

      await authController.deleteMe(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Password incorrect'
      });
    });

    test('deletes current user and their bookings successfully', async () => {
      const user = {
        matchPassword: jest.fn().mockResolvedValue(true)
      };
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });
      Booking.deleteMany.mockResolvedValue(undefined);
      User.findByIdAndDelete.mockResolvedValue(undefined);

      const req = {
        user: { id: 'user-1' },
        body: { password: 'password123' }
      };
      const res = createResponse();

      await authController.deleteMe(req, res);

      expect(Booking.deleteMany).toHaveBeenCalledWith({ user: 'user-1' });
      expect(User.findByIdAndDelete).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: {} });
    });

    test('returns 500 when deleteMe throws', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('DB failed');
      });

      const req = {
        user: { id: 'user-1' },
        body: { password: 'password123' }
      };
      const res = createResponse();

      await authController.deleteMe(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error'
      });
    });
  });

  describe('updatePassword', () => {
    test('returns 400 when password fields are missing', async () => {
      const user = { matchPassword: jest.fn() };
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      const req = {
        user: { id: 'user-1' },
        body: { currentPassword: 'password123' }
      };
      const res = createResponse();

      await authController.updatePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide current and new password'
      });
    });

    test('returns 401 when current password is incorrect', async () => {
      const user = {
        matchPassword: jest.fn().mockResolvedValue(false)
      };
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      const req = {
        user: { id: 'user-1' },
        body: { currentPassword: 'wrong', newPassword: 'newpass123' }
      };
      const res = createResponse();

      await authController.updatePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Password incorrect'
      });
    });

    test('updates password successfully and sends a new token', async () => {
      const user = createUserWithToken({
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(undefined)
      });
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      const req = {
        user: { id: 'user-1' },
        body: { currentPassword: 'password123', newPassword: 'newpass123' }
      };
      const res = createResponse();

      await authController.updatePassword(req, res);

      expect(user.password).toBe('newpass123');
      expect(user.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, token: 'signed-token' });
    });

    test('returns 500 when updatePassword throws', async () => {
      User.findById.mockImplementation(() => {
        throw new Error('DB failed');
      });

      const req = {
        user: { id: 'user-1' },
        body: { currentPassword: 'password123', newPassword: 'newpass123' }
      };
      const res = createResponse();

      await authController.updatePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error'
      });
    });
  });

  describe('getUsers', () => {
    test('returns all users', async () => {
      const users = [{ _id: 'user-1' }, { _id: 'user-2' }];
      User.find.mockResolvedValue(users);

      const req = {};
      const res = createResponse();

      await authController.getUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: users
      });
    });

    test('returns 500 when getUsers fails', async () => {
      User.find.mockRejectedValue(new Error('DB failed'));

      const req = {};
      const res = createResponse();

      await authController.getUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error'
      });
    });
  });

  describe('deleteUser', () => {
    test('returns 404 when admin deletes a missing user', async () => {
      User.findById.mockResolvedValue(null);

      const req = { params: { id: 'missing-user' } };
      const res = createResponse();

      await authController.deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No user found with the id of missing-user'
      });
    });

    test('deletes selected user and bookings successfully', async () => {
      User.findById.mockResolvedValue({ _id: 'user-2' });
      Booking.deleteMany.mockResolvedValue(undefined);
      User.findByIdAndDelete.mockResolvedValue(undefined);

      const req = { params: { id: 'user-2' } };
      const res = createResponse();

      await authController.deleteUser(req, res);

      expect(Booking.deleteMany).toHaveBeenCalledWith({ user: 'user-2' });
      expect(User.findByIdAndDelete).toHaveBeenCalledWith('user-2');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: {} });
    });

    test('returns 500 when deleteUser fails', async () => {
      User.findById.mockRejectedValue(new Error('DB failed'));

      const req = { params: { id: 'user-2' } };
      const res = createResponse();

      await authController.deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error'
      });
    });
  });
});
