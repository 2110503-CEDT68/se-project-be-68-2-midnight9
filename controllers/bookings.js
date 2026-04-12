const Booking    = require('../models/Booking');
const Campground = require('../models/Campground');
const User       = require('../models/User');
const connectDB  = require('../config/db');

// Calculate number of nights between two dates
const calcNights = (checkIn, checkOut) => {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(checkOut) - new Date(checkIn)) / msPerDay);
};

// @desc    Get all bookings
// @route   GET /api/v1/bookings
// @route   GET /api/v1/campgrounds/:campgroundId/bookings
// @access  Private
exports.getBookings = async (req, res, next) => {
  await connectDB();
  let query;

  // General users can see only their own bookings
  if (req.user.role !== 'admin') {
    query = Booking.find({ user: req.user.id }).populate({
      path:   'campground',
      select: 'name address tel'
    });
  } else {
    // Admin can see all bookings
    if (req.params.campgroundId) {
      query = Booking.find({ campground: req.params.campgroundId })
      .populate({
        path:   'campground',
        select: 'name address tel'
      })
      .populate({
        path: 'user',
        select: 'name email'
      });
    } else {
      query = Booking.find().populate({
        path:   'campground',
        select: 'name address tel'
      })
      .populate({
        path: 'user',
        select: 'name email'
      });
    }
  }

  try {
    query = query.sort('checkInDate');
    const bookings = await query;
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: 'Cannot find bookings' });
  }
};

// @desc    Get single booking
// @route   GET /api/v1/bookings/:id
// @access  Private
exports.getBooking = async (req, res, next) => {
  await connectDB();
  try {
    const booking = await Booking.findById(req.params.id)
      .populate({
        path:   'campground',
        select: 'name address tel'
      })
      .populate({
        path: 'user',
        select: 'name email'
      });

    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }

    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: 'Cannot find booking' });
  }
};

// @desc    Add booking
// @route   POST /api/v1/campgrounds/:campgroundId/bookings
// @access  Private
exports.addBooking = async (req, res, next) => {
  await connectDB();
  try {
    req.body = req.body || {};
    
    req.body.campground = req.params.campgroundId;
    req.body.user       = req.user.id;

    const { checkInDate, checkOutDate } = req.body;

    // Validate dates are present
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ success: false, message: 'Please provide both checkInDate and checkOutDate' });
    }

    const nightsRequested = calcNights(checkInDate, checkOutDate);

    // checkOut must be after checkIn
    if (nightsRequested <= 0) {
      return res.status(400).json({ success: false, message: 'checkOutDate must be after checkInDate' });
    }

    const campground = await Campground.findById(req.params.campgroundId);

    if (!campground) {
      return res.status(404).json({ success: false, message: `No campground with the id of ${req.params.campgroundId}` });
    }

    // Check total nights limit for normal users (max 3 nights across all bookings)
    if (req.user.role !== 'admin') {
      const existingBookings = await Booking.find({ user: req.user.id });

      const hasOverlap = existingBookings.some(b => {
          const isSameCampground = b.campground.toString() === req.params.campgroundId;
          
          const isOverlapping = new Date(b.checkInDate) < new Date(checkOutDate) && 
                                new Date(b.checkOutDate) > new Date(checkInDate);
          
          return isSameCampground && isOverlapping;
      });

      if (hasOverlap) {
          return res.status(400).json({
              success: false,
              message: 'You already have an overlapping booking at this campground.'
          });
      }

      const nightsAlreadyBooked = existingBookings.reduce((sum, b) => sum + calcNights(b.checkInDate, b.checkOutDate), 0);

      if (nightsAlreadyBooked + nightsRequested > 3) {
        return res.status(400).json({
          success: false,
          message: `Cannot book ${nightsRequested} night(s). You have used ${nightsAlreadyBooked}/3 nights.`
        });
      }
    }

    const booking = await Booking.create(req.body);
    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: 'Cannot create booking' });
  }
};

// @desc    Update booking
// @route   PUT /api/v1/bookings/:id
// @access  Private
exports.updateBooking = async (req, res, next) => {
  await connectDB()
  try {
    let booking = await Booking.findById(req.params.id);
 
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }
 
    // Make sure user is booking owner
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ success: false, message: `User ${req.user.id} is not authorized to update this booking` });
    }
 
    // Re-check total nights limit if dates are changed
    if (req.user.role !== 'admin') {
      const newCheckIn  = req.body.checkInDate  || booking.checkInDate;
      const newCheckOut = req.body.checkOutDate || booking.checkOutDate;
      const newNights   = calcNights(newCheckIn, newCheckOut);
 
      if (newNights <= 0) {
        return res.status(400).json({ success: false, message: 'checkOutDate must be after checkInDate' });
      }
 
      // Sum nights from all other bookings (exclude current one)
      const otherBookings = await Booking.find({ user: req.user.id, _id: { $ne: req.params.id } });
      const nightsOther   = otherBookings.reduce((sum, b) => sum + calcNights(b.checkInDate, b.checkOutDate), 0);
 
      if (nightsOther + newNights > 3) {
        return res.status(400).json({
          success: false,
          message: `Cannot update to ${newNights} night(s). Your other bookings use ${nightsOther}/3 nights.`
        });
      }
    }
 
    // If admin passes userEmail, resolve it to a user ObjectId
    if (req.user.role === 'admin' && req.body.userEmail) {
      const targetUser = await User.findOne({ email: req.body.userEmail.trim() });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: `No user found with email: ${req.body.userEmail}` });
      }
      req.body.user = targetUser._id;
      delete req.body.userEmail;
    }
 
    booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: 'Cannot update booking' });
  }
};

// @desc    Delete booking
// @route   DELETE /api/v1/bookings/:id
// @access  Private
exports.deleteBooking = async (req, res, next) => {
  await connectDB();
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }

    // Make sure user is booking owner
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ success: false, message: `User ${req.user.id} is not authorized to delete this booking` });
    }

    await booking.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: 'Cannot delete booking' });
  }
};