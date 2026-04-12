const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return mongoose.connection;

  const conn = await mongoose.connect(process.env.MONGO_URI);
  isConnected = conn.connections[0].readyState === 1;
  console.log(`MongoDB Connected: ${conn.connection.host}`);
  return conn;
};

module.exports = connectDB;
