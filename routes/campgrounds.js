const express = require('express');
const {
  getCampgrounds,
  getCampground,
  createCampground,
  updateCampground,
  deleteCampground
} = require('../controllers/campgrounds');
const {
  getBookings,
  addBooking
} = require('../controllers/bookings');

const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

router.route('/:campgroundId/bookings')
  .get(protect, getBookings)
  .post(protect, authorize('admin', 'user'), addBooking);

router.route('/')
  .get(getCampgrounds)
  .post(protect, authorize('admin'), createCampground);

router.route('/:id')
  .get(getCampground)
  .put(protect,    authorize('admin'), updateCampground)
  .delete(protect, authorize('admin'), deleteCampground);

module.exports = router;
