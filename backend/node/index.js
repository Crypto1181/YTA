const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Load environment variables from backend/node/.env and root .env
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

// Disable buffering so unhandled DB ops do not hang when offline
mongoose.set('bufferCommands', false);

const userRoutes = require('./router/user.route');
const aiRoutes = require('./router/ai.route');
const paymentRoutes = require('./router/payment.route');
const supportRoutes = require('./router/support.route');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yta';

// Middlewares
app.use(cors({
  origin: '*', // Allow frontend development server
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/support', supportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'YTA YouTube Automation API',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully.');
})
.catch((err) => {
  console.warn('⚠️ MongoDB connection warning (you can set MONGODB_URI in backend/node/.env):', err.message);
});

// Start Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 YTA Backend API running on port http://localhost:${PORT}`);
    console.log(`   - Auth Routes: http://localhost:${PORT}/api/users`);
    console.log(`   - AI Routes:   http://localhost:${PORT}/api/ai`);
    console.log(`   - Support:     http://localhost:${PORT}/api/support`);
    console.log(`   - Bacs Payment enabled for subscriptions and purchases`);
  });
}

module.exports = app;
