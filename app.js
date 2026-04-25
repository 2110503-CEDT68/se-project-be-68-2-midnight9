const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('@exortek/express-mongo-sanitize');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const cors = require('cors');

// โหลด env จาก local ตอน dev; บน Vercel จะอ่านจาก Project Environment Variables เอง
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: './config/config.env' });
}

connectDB();

const campgrounds = require('./routes/campgrounds');
const auth = require('./routes/auth');
const bookings = require('./routes/bookings');

const app = express();

app.set('query parser', 'extended');

// Vercel sits behind a proxy — trust it so express-rate-limit
// can read the real client IP from X-Forwarded-For correctly
app.set('trust proxy', 1);

// Parse body FIRST — must come before cors and everything else
// on Vercel serverless, req.body is undefined if this is too late
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors());
app.use(cookieParser());
app.use(mongoSanitize());
app.use(helmet());
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  skip: (req) => req.path.startsWith('/api-docs')
});
app.use(limiter);

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Campground Booking API is running'
  });
});

app.use('/api/v1/campgrounds', campgrounds);
app.use('/api/v1/auth', auth);
app.use('/api/v1/bookings', bookings);

// ── Swagger UI (เพิ่มต่อท้าย — ไม่แก้โค้ดเดิม) ──────────────────────────
// ติดตั้ง dependency ก่อน: npm install swagger-ui-express yamljs
// เข้าใช้งาน: http://localhost:5000/api-docs
const mountSwagger = require('./swagger');
mountSwagger(app);
// ─────────────────────────────────────────────────────────────────────────

module.exports = app;