/**
 * swagger.js — Swagger/OpenAPI setup
 *
 * ติดตั้ง: npm install swagger-ui-express yamljs
 *
 * ไฟล์นี้ export ฟังก์ชัน mountSwagger(app) ที่ mount Swagger UI
 * บน GET /api-docs  (ไม่แก้ไข code เดิมใน app.js)
 */

const path      = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML      = require('yamljs');

const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

/**
 * @param {import('express').Application} app
 */
function mountSwagger(app) {
  // 1) bypass express-rate-limit สำหรับ /api-docs
  //    rate limiter ใน app.js + trust proxy:1 บน localhost ทำให้อ่าน IP ผิด → 403
  //    แก้โดย skip limiter เฉพาะ route นี้
  const { rateLimit } = require('express-rate-limit');
  app.use('/api-docs', rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 0,
    skip: () => true   // ไม่นับ request ที่ path นี้เลย
  }));

  // 2) ปลด Content-Security-Policy ของ helmet เฉพาะ /api-docs
  //    helmet บล็อก inline script/style ซึ่ง Swagger UI ต้องใช้
  app.use('/api-docs', (req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self';"
    );
    next();
  });

  // 3) Mount Swagger UI
  const options = {
    swaggerOptions: {
      persistAuthorization: true   // จำ token ไว้หลัง refresh
    },
    customSiteTitle: 'Campground Booking API Docs'
  };

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

  // 4) JSON endpoint — import ลง Postman / Insomnia ได้เลย
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });

  console.log('[Swagger] UI → http://localhost:5000/api-docs');
}

module.exports = mountSwagger;