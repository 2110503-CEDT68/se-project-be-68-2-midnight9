const mongoose = require('mongoose');

const CampgroundSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Please add a campground name'],
      trim:      true,
      maxlength: [50, 'Name cannot be more than 50 characters']
    },
    price: {
      type:    Number,
      required: [true, 'Please add a price per night'],
      min:      [0, 'Price must be a positive number']
    },
    picture: {
      type: String,
      required: [true, 'Please add a URL for the campground picture']
    },
    address: {
      type:     String,
      required: [true, 'Please add an address']
    },
    district: {
      type:     String,
      required: [true, 'Please add a district']
    },
    province: {
      type:     String,
      required: [true, 'Please add a province']
    },
    region: {
      type:     String,
      required: [true, 'Please add a region']
    },
    tel: {
      type:     String,
      required: [true, 'Please add a telephone number']
    },
    postalcode: {
      type:      String,
      required:  [true, 'Please add a postal code'],
      maxlength: [5, 'Postal code cannot be more than 5 digits']
    },
  },
  {
    toJSON:   { virtuals: true },
    toObject: { virtuals: true }
  }
);

CampgroundSchema.index(
  {
    name: 1,
    price: 1,
    picture: 1,
    address: 1,
    district: 1,
    province: 1,
    region: 1,
    tel: 1,
    postalcode: 1
  },
  {
    unique: true,
    name: 'unique_campground_all_fields'
  }
);

// Reverse populate bookings when querying a campground
CampgroundSchema.virtual('bookings', {
  ref:          'Booking',
  localField:   '_id',
  foreignField: 'campground',
  justOne:      false
});

module.exports = mongoose.model('Campground', CampgroundSchema);
