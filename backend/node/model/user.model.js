const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long']
    },
    channelName: {
      type: String,
      trim: true,
      default: ''
    },
    location: {
      type: String,
      trim: true,
      default: ''
    },
    timezone: {
      type: String,
      trim: true,
      default: ''
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'creator'],
      default: 'user'
    },
    // Bacs Payment Details
    bacsPayment: {
      accountHolderName: { type: String, default: '' },
      sortCode: { type: String, default: '' },
      accountNumberMasked: { type: String, default: '' },
      mandateReference: { type: String, default: '' },
      status: { type: String, enum: ['none', 'pending', 'active'], default: 'none' }
    },
    subscription: {
      plan: { type: String, default: 'Free Starter' },
      status: { type: String, default: 'none' },
      amount: { type: Number, default: 0 },
      paymentMethod: { type: String, default: 'None' },
      nextBillingDate: { type: Date, default: null }
    },
    purchases: [
      {
        itemId: String,
        itemName: String,
        itemType: { type: String, enum: ['course', 'software', 'license', 'subscription'] },
        price: Number,
        currency: { type: String, default: 'GBP' },
        paymentMethod: { type: String, default: 'Bacs Payment' },
        bacsReference: String,
        purchasedAt: { type: Date, default: Date.now }
      }
    ],
    aiCredits: {
      used: { type: Number, default: 14 },
      total: { type: Number, default: 20 }
    }
  },
  {
    timestamps: true
  }
);

const User = mongoose.model('User', userSchema);
module.exports = User;
