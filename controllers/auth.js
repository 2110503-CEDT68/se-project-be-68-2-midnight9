const User = require('../models/User');
const Booking = require('../models/Booking');
const connectDB  = require('../config/db');

const PROFILE_FIELDS = [
  'name',
  'email',
  'tel',
  'birthDate',
  'province',
  'emergencyName',
  'emergencyPhone',
  'medicalConditions'
];

const normalizePhone = (value) => (
  typeof value === 'string' ? value.replace(/[-\s]/g, '').trim() : value
);

const normalizeProfilePayload = (body = {}) => {
  const source = { ...body };

  if (source.birthDate === undefined && source.birthdate !== undefined) {
    source.birthDate = source.birthdate;
  }

  const payload = {};

  PROFILE_FIELDS.forEach((field) => {
    if (source[field] === undefined) return;

    if (field === 'tel' || field === 'emergencyPhone') {
      payload[field] = normalizePhone(source[field]);
      return;
    }

    if (field === 'birthDate') {
      payload[field] = source[field] || null;
      return;
    }

    payload[field] = typeof source[field] === 'string' ? source[field].trim() : source[field];
  });

  return payload;
};

const deleteUserAndBookings = async (userId) => {
  await Booking.deleteMany({ user: userId });
  await User.findByIdAndDelete(userId);
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  await connectDB();
  try {
    const {
      name,
      tel,
      email,
      password,
      role,
      birthdate,
      birthDate,
      province,
      emergencyName,
      emergencyPhone,
      medicalConditions
    } = req.body;

    const user = await User.create({
      name,
      tel: normalizePhone(tel),
      email,
      password,
      role,
      birthDate: birthDate || birthdate,
      province,
      emergencyName,
      emergencyPhone: normalizePhone(emergencyPhone),
      medicalConditions
    });
    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  await connectDB();
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide an email and password' });
  }

  // Check for user and include password field
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid credentials' });
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  sendTokenResponse(user, 200, res);
};

// @desc    Log out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  await connectDB();
  res.cookie('token', 'none', {
    expires:  new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({ success: true, data: {} });
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  await connectDB();
  const user = await User.findById(req.user.id);
  res.status(200).json({ success: true, data: user });
};

// Create token, set cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();

  const options = {
    expires:  new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') options.secure = true;

  res.status(statusCode).cookie('token', token, options).json({ success: true, token });
};

// @desc    Update user details
// @route   PUT /api/v1/auth/updatedetails
// @access  Private
exports.updateDetails = async (req, res, next) => {
  await connectDB();
    try {
        const fieldsToUpdate = normalizeProfilePayload(req.body);

        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one profile field to update'
            });
        }

        const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Delete current logged in user profile
// @route   DELETE /api/v1/auth/me
// @access  Private
exports.deleteMe = async (req, res, next) => {
  await connectDB();
    try {
        if (!req.body.password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide your password to delete this account'
            });
        }

        const user = await User.findById(req.user.id).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: `No user found with the id of ${req.user.id}`
            });
        }

        const isMatch = await user.matchPassword(req.body.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Password incorrect'
            });
        }

        await deleteUserAndBookings(req.user.id);

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res, next) => {
  await connectDB();
    try {
        const user = await User.findById(req.user.id).select('+password');

        if (!req.body.currentPassword || !req.body.newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide current and new password' 
            });
        }

        const isMatch = await user.matchPassword(req.body.currentPassword);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Password incorrect' 
            });
        }

        user.password = req.body.newPassword;
        await user.save();

        sendTokenResponse(user, 200, res);

    } catch (err) {
        console.log(err.stack);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get all users (Admin only)
// @route   GET /api/v1/auth/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  await connectDB();
    try {
        const users = await User.find();
        
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delete user (Admin only)
// @route   DELETE /api/v1/auth/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
  await connectDB();
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: `No user found with the id of ${req.params.id}`
            });
        }

        await deleteUserAndBookings(req.params.id);

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
