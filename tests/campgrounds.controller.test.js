jest.mock('../config/db', () => jest.fn());
jest.mock('../models/Campground', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));
jest.mock('../models/Booking', () => ({
  countDocuments: jest.fn(),
  deleteMany: jest.fn()
}));

const connectDB = require('../config/db');
const Campground = require('../models/Campground');
const Booking = require('../models/Booking');
const campgroundsController = require('../controllers/campgrounds');

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
    find: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved)
  };
};

describe('campgrounds controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectDB.mockResolvedValue(undefined);
  });

  describe('getCampgrounds', () => {
    test('returns filtered campgrounds with next and previous pagination', async () => {
      const data = [{ _id: 'cg-1', name: 'Forest Camp' }];
      const queryChain = createQueryChain(data);

      Campground.find.mockReturnValue(queryChain);
      Campground.countDocuments.mockResolvedValue(20);

      const req = {
        query: {
          name: 'forest',
          select: 'name,price',
          sort: 'price,-name',
          page: '2',
          limit: '5',
          price: { gte: 100 }
        }
      };
      const res = createResponse();

      await campgroundsController.getCampgrounds(req, res);

      expect(connectDB).toHaveBeenCalled();
      expect(Campground.find).toHaveBeenCalledWith({ name: 'forest', price: { $gte: 100 } });
      expect(queryChain.populate).toHaveBeenCalledWith('bookings');
      expect(queryChain.find).toHaveBeenCalledWith({ name: { $regex: 'forest', $options: 'i' } });
      expect(queryChain.select).toHaveBeenCalledWith('name price');
      expect(queryChain.sort).toHaveBeenCalledWith('price -name');
      expect(queryChain.skip).toHaveBeenCalledWith(5);
      expect(queryChain.limit).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        pagination: {
          next: { page: 3, limit: 5 },
          prev: { page: 1, limit: 5 }
        },
        data
      });
    });

    test('uses default sort and empty pagination when optional query params are missing', async () => {
      const data = [{ _id: 'cg-2', name: 'Lakeside' }];
      const queryChain = createQueryChain(data);

      Campground.find.mockReturnValue(queryChain);
      Campground.countDocuments.mockResolvedValue(1);

      const req = { query: {} };
      const res = createResponse();

      await campgroundsController.getCampgrounds(req, res);

      expect(Campground.find).toHaveBeenCalledWith({});
      expect(queryChain.find).not.toHaveBeenCalled();
      expect(queryChain.select).not.toHaveBeenCalled();
      expect(queryChain.sort).toHaveBeenCalledWith('name');
      expect(queryChain.skip).toHaveBeenCalledWith(0);
      expect(queryChain.limit).toHaveBeenCalledWith(25);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        pagination: {},
        data
      });
    });

    test('returns 400 when fetching campgrounds fails', async () => {
      Campground.find.mockImplementation(() => {
        throw new Error('query failed');
      });

      const req = { query: {} };
      const res = createResponse();

      await campgroundsController.getCampgrounds(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('getCampground', () => {
    test('returns a single campground when found', async () => {
      const campground = { _id: 'cg-1', name: 'Forest Camp' };
      Campground.findById.mockResolvedValue(campground);

      const req = { params: { id: 'cg-1' } };
      const res = createResponse();

      await campgroundsController.getCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: campground });
    });

    test('returns 404 when campground is not found', async () => {
      Campground.findById.mockResolvedValue(null);

      const req = { params: { id: 'missing-id' } };
      const res = createResponse();

      await campgroundsController.getCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Campground not found with id of missing-id'
      });
    });

    test('returns 400 when campground lookup throws', async () => {
      Campground.findById.mockRejectedValue(new Error('lookup failed'));

      const req = { params: { id: 'cg-1' } };
      const res = createResponse();

      await campgroundsController.getCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('createCampground', () => {
    test('creates a campground successfully with a trimmed string price', async () => {
      const payload = {
        name: 'Forest Camp',
        price: ' 500 ',
        picture: 'https://example.com/camp.jpg',
        address: '12 Forest Road',
        district: 'Mae Rim',
        province: 'Chiang Mai',
        region: 'North',
        tel: '0812345678',
        postalcode: '50180'
      };
      const created = { _id: 'cg-1', ...payload, price: 500 };

      Campground.create.mockResolvedValue(created);

      const req = { body: payload };
      const res = createResponse();

      await campgroundsController.createCampground(req, res);

      expect(Campground.create).toHaveBeenCalledWith({ ...payload, price: 500 });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: created });
    });

    test('returns 400 when price is invalid before create is called', async () => {
      const req = { body: { price: -1 } };
      const res = createResponse();

      await campgroundsController.createCampground(req, res);

      expect(Campground.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please add a valid price per night'
      });
    });

    test('returns 400 when request body is missing and normalizePrice uses its default object', async () => {
      const req = {};
      const res = createResponse();

      await campgroundsController.createCampground(req, res);

      expect(Campground.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please add a valid price per night'
      });
    });

    test('returns first validation error message from mongoose', async () => {
      Campground.create.mockRejectedValue({
        name: 'ValidationError',
        errors: {
          name: { message: 'Please add a campground name' },
          tel: { message: 'Please add a telephone number' }
        }
      });

      const req = {
        body: {
          price: 500
        }
      };
      const res = createResponse();

      await campgroundsController.createCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please add a campground name'
      });
    });

    test('returns duplicate campground message for duplicate-key error', async () => {
      Campground.create.mockRejectedValue({
        code: 11000,
        keyPattern: { name: 1 }
      });

      const req = { body: { price: 500 } };
      const res = createResponse();

      await campgroundsController.createCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'This campground already exists with the exact same details'
      });
    });

    test('returns a generic invalid data message for other create errors', async () => {
      Campground.create.mockRejectedValue(new Error('unexpected'));

      const req = { body: { price: 500 } };
      const res = createResponse();

      await campgroundsController.createCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid data submitted'
      });
    });
  });

  describe('updateCampground', () => {
    test('updates a campground successfully when price is omitted', async () => {
      const updated = { _id: 'cg-1', name: 'Updated Camp' };
      Campground.findByIdAndUpdate.mockResolvedValue(updated);

      const req = {
        params: { id: 'cg-1' },
        body: { name: 'Updated Camp' }
      };
      const res = createResponse();

      await campgroundsController.updateCampground(req, res);

      expect(Campground.findByIdAndUpdate).toHaveBeenCalledWith(
        'cg-1',
        { name: 'Updated Camp' },
        { returnDocument: 'after', runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
    });

    test('returns 400 when update price is invalid', async () => {
      const req = {
        params: { id: 'cg-1' },
        body: { price: 'not-a-number' }
      };
      const res = createResponse();

      await campgroundsController.updateCampground(req, res);

      expect(Campground.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please add a valid price per night'
      });
    });

    test('returns 404 when campground to update is not found', async () => {
      Campground.findByIdAndUpdate.mockResolvedValue(null);

      const req = {
        params: { id: 'missing-id' },
        body: { price: 500 }
      };
      const res = createResponse();

      await campgroundsController.updateCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Campground not found with id of missing-id'
      });
    });

    test('returns first validation error message when update validation fails', async () => {
      Campground.findByIdAndUpdate.mockRejectedValue({
        name: 'ValidationError',
        errors: {
          postalcode: { message: 'Postal code cannot be more than 5 digits' }
        }
      });

      const req = {
        params: { id: 'cg-1' },
        body: { price: 500 }
      };
      const res = createResponse();

      await campgroundsController.updateCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Postal code cannot be more than 5 digits'
      });
    });

    test('returns duplicate campground message for duplicate update errors', async () => {
      Campground.findByIdAndUpdate.mockRejectedValue({
        code: 11000,
        keyPattern: { name: 1 }
      });

      const req = {
        params: { id: 'cg-1' },
        body: { price: 500 }
      };
      const res = createResponse();

      await campgroundsController.updateCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'This campground already exists with the exact same details'
      });
    });

    test('returns a generic invalid data message for other update errors', async () => {
      Campground.findByIdAndUpdate.mockRejectedValue(new Error('unexpected'));

      const req = {
        params: { id: 'cg-1' },
        body: { price: 500 }
      };
      const res = createResponse();

      await campgroundsController.updateCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid data submitted'
      });
    });
  });

  describe('deleteCampground', () => {
    test('deletes campground successfully when there are no active or upcoming bookings', async () => {
      const deleteOne = jest.fn().mockResolvedValue(undefined);
      Campground.findById.mockResolvedValue({ _id: 'cg-1', deleteOne });
      Booking.countDocuments.mockResolvedValue(0);
      Booking.deleteMany.mockResolvedValue(undefined);

      const req = { params: { id: 'cg-1' } };
      const res = createResponse();

      await campgroundsController.deleteCampground(req, res);

      expect(Booking.countDocuments).toHaveBeenCalledWith({
        campground: 'cg-1',
        checkOutDate: { $gte: expect.any(Date) }
      });
      expect(Booking.deleteMany).toHaveBeenCalledWith({ campground: 'cg-1' });
      expect(deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: {} });
    });

    test('returns 404 when campground to delete is not found', async () => {
      Campground.findById.mockResolvedValue(null);

      const req = { params: { id: 'missing-id' } };
      const res = createResponse();

      await campgroundsController.deleteCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Campground not found with id of missing-id'
      });
    });

    test('returns 409 when active or upcoming bookings exist', async () => {
      Campground.findById.mockResolvedValue({ _id: 'cg-1', deleteOne: jest.fn() });
      Booking.countDocuments.mockResolvedValue(2);

      const req = { params: { id: 'cg-1' } };
      const res = createResponse();

      await campgroundsController.deleteCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot delete campground with 2 active or upcoming booking(s)'
      });
    });

    test('returns 400 when deleting campground throws', async () => {
      Campground.findById.mockRejectedValue(new Error('delete failed'));

      const req = { params: { id: 'cg-1' } };
      const res = createResponse();

      await campgroundsController.deleteCampground(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });
});
