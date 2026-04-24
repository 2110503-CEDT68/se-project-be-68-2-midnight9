const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  tel: {
    type: String,
    required: [true, 'Please add a telephone number'],
    trim: true,
    validate: {
      validator: (value) => /^\d{9,10}$/.test(value),
      message: 'Please add a valid telephone number'
    }
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      'Please add a valid email'
    ]
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  password: {
    type:      String,
    required:  [true, 'Please add a password'],
    minlength: 6,
    select:    false  // Not returned in queries by default
  },
  resetPasswordToken:  String,
  resetPasswordExpire: Date,
  birthDate: Date,
  province: {
    type: String,
    trim: true,
    default: ''
  },
  emergencyName: {
    type: String,
    trim: true,
    default: ''
  },
  emergencyPhone: {
    type: String,
    trim: true,
    default: '',
    validate: {
      validator: (value) => !value || /^\d{9,10}$/.test(value),
      message: 'Please add a valid emergency telephone number'
    }
  },
  medicalConditions: {
    type: String,
    trim: true,
    default: ''
  },
  createdAt: {
    type:    Date,
    default: Date.now
  }
});

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt    = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign and return JWT token
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// Compare entered password with hashed password in DB
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
