jest.mock('../config/db', () => jest.fn());
jest.mock('../models/Booking', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));
jest.mock('../models/Campground', () => ({
  findById: jest.fn()
}));
jest.mock('../models/User', () => ({
  findOne: jest.fn()
}));

const connectDB = require('../config/db');
const Booking = require('../models/Booking');
const Campground = require('../models/Campground');
const User = require('../models/User');
const bookingsController = require('../controllers/bookings');

const createResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createQueryChain = (data) => {
  const resolved = Promise.resolve(data);

  return {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved)
  };
};

describe('bookings controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectDB.mockResolvedValue(undefined);
  });

  describe('getBookings', () => {
    test('returns only current user bookings for non-admin users', async () => {
      const data = [{ _id: 'bk-1' }];
      const queryChain = createQueryChain(data);
      Booking.find.mockReturnValue(queryChain);

      const req = {
        user: { id: 'user-1', role: 'user' },
        params: {}
      };
      const res = createResponse();

      await bookingsController.getBookings(req, res);

      expect(Booking.find).toHaveBeenCalledWith({ user: 'user-1' });
      expect(queryChain.populate).toHaveBeenCalledWith({
        path: 'campground',
        select: 'name address tel'
      });
      expect(queryChain.sort).toHaveBeenCalledWith('checkInDate');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, count: 1, data });
    });

    test('returns bookings for one campground when admin passes campgroundId', async () => {
      const data = [{ _id: 'bk-2' }];
      const queryChain = createQueryChain(data);
      Booking.find.mockReturnValue(queryChain);

      const req = {
        user: { id: 'admin-1', role: 'admin' },
        params: { campgroundId: 'camp-1' }
      };
      const res = createResponse();

      await bookingsController.getBookings(req, res);

      expect(Booking.find).toHaveBeenCalledWith({ campground: 'camp-1' });
      expect(queryChain.populate).toHaveBeenNthCalledWith(1, {
        path: 'campground',
        select: 'name address tel'
      });
      expect(queryChain.populate).toHaveBeenNthCalledWith(2, {
        path: 'user',
        select: 'name email'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('returns all bookings when admin does not pass campgroundId', async () => {
      const data = [{ _id: 'bk-3' }, { _id: 'bk-4' }];
      const queryChain = createQueryChain(data);
      Booking.find.mockReturnValue(queryChain);

      const req = {
        user: { id: 'admin-1', role: 'admin' },
        params: {}
      };
      const res = createResponse();

      await bookingsController.getBookings(req, res);

      expect(Booking.find).toHaveBeenCalledWith();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, count: 2, data });
    });

    test('returns 500 when fetching bookings fails', async () => {
      const queryChain = createQueryChain([]);
      queryChain.sort.mockImplementation(() => {
        throw new Error('query failed');
      });
      Booking.find.mockReturnValue(queryChain);

      const req = {
        user: { id: 'admin-1', role: 'admin' },
        params: {}
      };
      const res = createResponse();

      await bookingsController.getBookings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Cannot find bookings' });
    });
  });

  describe('getBooking', () => {
    test('returns a single booking when found', async () => {
      const booking = { _id: 'bk-1' };
      const queryChain = createQueryChain(booking);
      Booking.findById.mockReturnValue(queryChain);

      const req = { params: { id: 'bk-1' } };
      const res = createResponse();

      await bookingsController.getBooking(req, res);

      expect(Booking.findById).toHaveBeenCalledWith('bk-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: booking });
    });

    test('returns 404 when booking is not found', async () => {
      const queryChain = createQueryChain(null);
      Booking.findById.mockReturnValue(queryChain);

      const req = { params: { id: 'missing-id' } };
      const res = createResponse();

      await bookingsController.getBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No booking with the id of missing-id'
      });
    });

    test('returns 500 when booking lookup fails', async () => {
      Booking.findById.mockImplementation(() => {
        throw new Error('lookup failed');
      });

      const req = { params: { id: 'bk-1' } };
      const res = createResponse();

      await bookingsController.getBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Cannot find booking' });
    });
  });

  describe('addBooking', () => {
    test('returns 400 when request is missing check-in or check-out', async () => {
      const req = {
        body: undefined,
        params: { campgroundId: 'camp-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide both checkInDate and checkOutDate'
      });
    });

    test('returns 400 when checkOutDate is not after checkInDate', async () => {
      const req = {
        body: { checkInDate: '2026-01-05', checkOutDate: '2026-01-05' },
        params: { campgroundId: 'camp-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'checkOutDate must be after checkInDate'
      });
    });

    test('returns 404 when campground is not found', async () => {
      Campground.findById.mockResolvedValue(null);

      const req = {
        body: { checkInDate: '2026-01-05', checkOutDate: '2026-01-06' },
        params: { campgroundId: 'camp-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No campground with the id of camp-1'
      });
    });

    test('returns 400 for overlapping booking at the same campground', async () => {
      Campground.findById.mockResolvedValue({ _id: 'camp-1' });
      Booking.find.mockResolvedValue([
        {
          campground: { toString: () => 'camp-1' },
          checkInDate: '2026-01-05',
          checkOutDate: '2026-01-07'
        }
      ]);

      const req = {
        body: { checkInDate: '2026-01-06', checkOutDate: '2026-01-08' },
        params: { campgroundId: 'camp-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'You already have an overlapping booking at this campground.'
      });
    });

    test('returns 400 when normal user exceeds total night limit', async () => {
      Campground.findById.mockResolvedValue({ _id: 'camp-1' });
      Booking.find.mockResolvedValue([
        {
          campground: { toString: () => 'camp-2' },
          checkInDate: '2026-01-01',
          checkOutDate: '2026-01-03'
        }
      ]);

      const req = {
        body: { checkInDate: '2026-01-05', checkOutDate: '2026-01-07' },
        params: { campgroundId: 'camp-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot book 2 night(s). You have used 2/3 nights.'
      });
    });

    test('creates booking successfully for a normal user within limits', async () => {
      const booking = { _id: 'bk-1' };
      Campground.findById.mockResolvedValue({ _id: 'camp-1' });
      Booking.find.mockResolvedValue([
        {
          campground: { toString: () => 'camp-2' },
          checkInDate: '2026-01-01',
          checkOutDate: '2026-01-02'
        }
      ]);
      Booking.create.mockResolvedValue(booking);

      const req = {
        body: { checkInDate: '2026-01-05', checkOutDate: '2026-01-07' },
        params: { campgroundId: 'camp-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(Booking.create).toHaveBeenCalledWith({
        checkInDate: '2026-01-05',
        checkOutDate: '2026-01-07',
        campground: 'camp-1',
        user: 'user-1'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: booking });
    });

    test('creates booking successfully for admin without normal-user restrictions', async () => {
      const booking = { _id: 'bk-admin' };
      Campground.findById.mockResolvedValue({ _id: 'camp-1' });
      Booking.create.mockResolvedValue(booking);

      const req = {
        body: { checkInDate: '2026-01-05', checkOutDate: '2026-01-09' },
        params: { campgroundId: 'camp-1' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(Booking.find).not.toHaveBeenCalledWith({ user: 'admin-1' });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('returns 500 when creating booking throws', async () => {
      Campground.findById.mockRejectedValue(new Error('create failed'));

      const req = {
        body: { checkInDate: '2026-01-05', checkOutDate: '2026-01-06' },
        params: { campgroundId: 'camp-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.addBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Cannot create booking' });
    });
  });

  describe('updateBooking', () => {
    test('returns 404 when booking to update is not found', async () => {
      Booking.findById.mockResolvedValue(null);

      const req = {
        params: { id: 'missing-id' },
        body: {},
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No booking with the id of missing-id'
      });
    });

    test('returns 401 when non-owner tries to update booking', async () => {
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'owner-1' }
      });

      const req = {
        params: { id: 'bk-1' },
        body: {},
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User user-1 is not authorized to update this booking'
      });
    });

    test('returns 400 when updated dates are invalid for normal user', async () => {
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'user-1' },
        checkInDate: '2026-01-05',
        checkOutDate: '2026-01-06'
      });

      const req = {
        params: { id: 'bk-1' },
        body: { checkInDate: '2026-01-06', checkOutDate: '2026-01-06' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'checkOutDate must be after checkInDate'
      });
    });

    test('returns 400 when updated nights exceed the total limit for normal user', async () => {
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'user-1' },
        checkInDate: '2026-01-05',
        checkOutDate: '2026-01-06'
      });
      Booking.find.mockResolvedValue([
        { checkInDate: '2026-01-01', checkOutDate: '2026-01-03' }
      ]);

      const req = {
        params: { id: 'bk-1' },
        body: { checkInDate: '2026-01-05', checkOutDate: '2026-01-07' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot update to 2 night(s). Your other bookings use 2/3 nights.'
      });
    });

    test('returns 404 when admin updates by userEmail that does not exist', async () => {
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'owner-1' },
        checkInDate: '2026-01-05',
        checkOutDate: '2026-01-06'
      });
      User.findOne.mockResolvedValue(null);

      const req = {
        params: { id: 'bk-1' },
        body: { userEmail: 'missing@example.com' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No user found with email: missing@example.com'
      });
    });

    test('updates booking successfully for admin and resolves userEmail', async () => {
      const updated = { _id: 'bk-1' };
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'owner-1' },
        checkInDate: '2026-01-05',
        checkOutDate: '2026-01-06'
      });
      User.findOne.mockResolvedValue({ _id: 'user-2' });
      Booking.findByIdAndUpdate.mockResolvedValue(updated);

      const req = {
        params: { id: 'bk-1' },
        body: { userEmail: ' guest@example.com ', checkOutDate: '2026-01-07' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'guest@example.com' });
      expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith(
        'bk-1',
        { checkOutDate: '2026-01-07', user: 'user-2' },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
    });

    test('updates booking successfully for normal user within limits', async () => {
      const updated = { _id: 'bk-2' };
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'user-1' },
        checkInDate: '2026-01-05',
        checkOutDate: '2026-01-06'
      });
      Booking.find.mockResolvedValue([]);
      Booking.findByIdAndUpdate.mockResolvedValue(updated);

      const req = {
        params: { id: 'bk-2' },
        body: { checkOutDate: '2026-01-07' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith(
        'bk-2',
        { checkOutDate: '2026-01-07' },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('updates booking successfully when only checkInDate changes and existing checkOutDate is reused', async () => {
      const updated = { _id: 'bk-3' };
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'user-1' },
        checkInDate: '2026-01-05',
        checkOutDate: '2026-01-07'
      });
      Booking.find.mockResolvedValue([]);
      Booking.findByIdAndUpdate.mockResolvedValue(updated);

      const req = {
        params: { id: 'bk-3' },
        body: { checkInDate: '2026-01-06' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith(
        'bk-3',
        { checkInDate: '2026-01-06' },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
    });

    test('returns 500 when updateBooking throws', async () => {
      Booking.findById.mockRejectedValue(new Error('update failed'));

      const req = {
        params: { id: 'bk-1' },
        body: {},
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.updateBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Cannot update booking' });
    });
  });

  describe('deleteBooking', () => {
    test('returns 404 when booking to delete is not found', async () => {
      Booking.findById.mockResolvedValue(null);

      const req = {
        params: { id: 'missing-id' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.deleteBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No booking with the id of missing-id'
      });
    });

    test('returns 401 when non-owner tries to delete booking', async () => {
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'owner-1' }
      });

      const req = {
        params: { id: 'bk-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.deleteBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User user-1 is not authorized to delete this booking'
      });
    });

    test('deletes booking successfully for owner', async () => {
      const deleteOne = jest.fn().mockResolvedValue(undefined);
      Booking.findById.mockResolvedValue({
        user: { toString: () => 'user-1' },
        deleteOne
      });

      const req = {
        params: { id: 'bk-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.deleteBooking(req, res);

      expect(deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: {} });
    });

    test('returns 500 when deleteBooking throws', async () => {
      Booking.findById.mockRejectedValue(new Error('delete failed'));

      const req = {
        params: { id: 'bk-1' },
        user: { id: 'user-1', role: 'user' }
      };
      const res = createResponse();

      await bookingsController.deleteBooking(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Cannot delete booking' });
    });
  });
});
