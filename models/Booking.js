const mongoose = require('mongoose');

// A user can book up to 3 nights total (enforced in controller)
const BookingSchema = new mongoose.Schema({
  checkInDate: {
    type:     Date,
    required: [true, 'Please add a check-in date']
  },
  checkOutDate: {
    type:     Date,
    required: [true, 'Please add a check-out date']
  },
  user: {
    type:     mongoose.Schema.ObjectId,
    ref:      'User',
    required: true
  },
  campground: {
    type:     mongoose.Schema.ObjectId,
    ref:      'Campground',
    required: true
  },
  createdAt: {
    type:    Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Booking', BookingSchema);
