const express = require('express');
const {
  getCampgrounds,
  getCampground,
  createCampground,
  updateCampground,
  deleteCampground
} = require('../controllers/campgrounds');

// Include booking router for nested route
const bookingRouter = require('./bookings');

const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// Re-route into booking router
router.use('/:campgroundId/bookings', bookingRouter);

router.route('/')
  .get(getCampgrounds)
  .post(protect, authorize('admin'), createCampground);

router.route('/:id')
  .get(getCampground)
  .put(protect,    authorize('admin'), updateCampground)
  .delete(protect, authorize('admin'), deleteCampground);

module.exports = router;
