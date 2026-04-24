const Campground = require('../models/Campground');
const connectDB  = require('../config/db');
const Booking    = require('../models/Booking');

const normalizePrice = (body = {}) => {
  if (body.price === undefined) return body;

  const normalizedPrice =
    typeof body.price === 'number' ? body.price : Number(String(body.price).trim());

  return {
    ...body,
    price: normalizedPrice
  };
};

const isDuplicateCampgroundError = (err) =>
  err && err.code === 11000 && err.keyPattern && err.keyPattern.name === 1;

// @desc    Get all campgrounds
// @route   GET /api/v1/campgrounds
// @access  Public
exports.getCampgrounds = async (req, res, next) => {
  await connectDB();
  try {
    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude from DB filter
    const removeFields = ['select', 'sort', 'page', 'limit'];
    removeFields.forEach(param => delete reqQuery[param]);

    // Create operators ($gt, $gte, $lt, $lte, $in)
    let queryStr = JSON.stringify(reqQuery);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    // Find campgrounds and populate bookings
    let query = Campground.find(JSON.parse(queryStr)).populate('bookings');

    // Find by campground name
    if (req.query.name) {
        query = query.find({ name: { $regex: req.query.name, $options: 'i' } });
    }

    // Select fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('name');
    }

    // Pagination
    const page       = parseInt(req.query.page,  10) || 1;
    const limit      = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex   = page * limit;
    const total      = await Campground.countDocuments();

    query = query.skip(startIndex).limit(limit);

    const campgrounds = await query;

    // Pagination result
    const pagination = {};
    if (endIndex < total) pagination.next = { page: page + 1, limit };
    if (startIndex > 0)   pagination.prev = { page: page - 1, limit };

    res.status(200).json({ success: true, count: campgrounds.length, pagination, data: campgrounds });
  } catch (err) {
    res.status(400).json({ success: false });
  }
};

// @desc    Get single campground
// @route   GET /api/v1/campgrounds/:id
// @access  Public
exports.getCampground = async (req, res, next) => {
  await connectDB();
  try {
    const campground = await Campground.findById(req.params.id);

    if (!campground) {
      return res.status(404).json({ success: false, message: `Campground not found with id of ${req.params.id}` });
    }

    res.status(200).json({ success: true, data: campground });
  } catch (err) {
    res.status(400).json({ success: false });
  }
};

// @desc    Create new campground
// @route   POST /api/v1/campgrounds
// @access  Private (admin)
exports.createCampground = async (req, res, next) => {
  await connectDB();
  try {
    const payload = normalizePrice(req.body);

    if (!Number.isFinite(payload.price) || payload.price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Please add a valid price per night'
      });
    }

    const campground = await Campground.create(payload);
    res.status(201).json({ success: true, data: campground });
    
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }

    if (isDuplicateCampgroundError(err)) {
      return res.status(400).json({
        success: false,
        message: 'This campground already exists with the exact same details'
      });
    }
    
    res.status(400).json({ success: false, message: 'Invalid data submitted' });
  }
};

// @desc    Update campground
// @route   PUT /api/v1/campgrounds/:id
// @access  Private (admin)
exports.updateCampground = async (req, res, next) => {
  await connectDB();
  try {
    const payload = normalizePrice(req.body);

    if (payload.price !== undefined && (!Number.isFinite(payload.price) || payload.price < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please add a valid price per night'
      });
    }

    const campground = await Campground.findByIdAndUpdate(req.params.id, payload, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!campground) {
      return res.status(404).json({ success: false, message: `Campground not found with id of ${req.params.id}` });
    }

    res.status(200).json({ success: true, data: campground });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }

    if (isDuplicateCampgroundError(err)) {
      return res.status(400).json({
        success: false,
        message: 'This campground already exists with the exact same details'
      });
    }

    res.status(400).json({ success: false, message: 'Invalid data submitted' });
  }
};

// @desc    Delete campground
// @route   DELETE /api/v1/campgrounds/:id
// @access  Private (admin)
exports.deleteCampground = async (req, res, next) => {
  await connectDB();
  try {
    const campground = await Campground.findById(req.params.id);

    if (!campground) {
      return res.status(404).json({ success: false, message: `Campground not found with id of ${req.params.id}` });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeBookings = await Booking.countDocuments({
      campground: req.params.id,
      checkOutDate: { $gte: today }
    });

    if (activeBookings > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete campground with ${activeBookings} active or upcoming booking(s)`
      });
    }

    // Delete only past related bookings before removing the campground
    await Booking.deleteMany({ campground: req.params.id });
    await campground.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false });
  }
};
