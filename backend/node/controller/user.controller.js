const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../model/user.model');

const JWT_SECRET = process.env.JWT_SECRET || 'yta_super_secret_jwt_key_2026';
const FALLBACK_DB_PATH = path.join(__dirname, '../.users_fallback.json');

// Helper for persistent JSON fallback storage when MongoDB is not connected
function getFallbackUsers() {
  try {
    if (fs.existsSync(FALLBACK_DB_PATH)) {
      const data = fs.readFileSync(FALLBACK_DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}
  return [];
}

function saveFallbackUsers(users) {
  try {
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {}
}

const isDbConnected = () => mongoose.connection.readyState === 1;

// Helper to generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Register a new user
 * Body: { email, password, channelName (optional), bacsDetails (optional) }
 */
exports.register = async (req, res) => {
  try {
    const { email, password, channelName, bacsDetails } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    if (isDbConnected()) {
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Please log in.'
        });
      }
    } else {
      const fallbackUsers = getFallbackUsers();
      if (fallbackUsers.some(u => u.email === normalizedEmail)) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Please log in.'
        });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Bacs details if provided
    let bacsPayment = {
      accountHolderName: '',
      sortCode: '',
      accountNumberMasked: '',
      mandateReference: '',
      status: 'none'
    };

    if (bacsDetails && bacsDetails.accountNumber) {
      const maskedAcc = '••••' + bacsDetails.accountNumber.slice(-4);
      bacsPayment = {
        accountHolderName: bacsDetails.accountHolderName || '',
        sortCode: bacsDetails.sortCode || '20-00-00',
        accountNumberMasked: maskedAcc,
        mandateReference: 'BACS-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        status: 'active'
      };
    }

    const userData = {
      email: normalizedEmail,
      password: hashedPassword,
      channelName: channelName ? channelName.trim() : '',
      role: 'creator',
      bacsPayment,
      subscription: {
        plan: 'Free Starter',
        status: 'none',
        amount: 0,
        currency: 'USD',
        paymentMethod: 'None',
        nextBillingDate: null
      },
      purchases: [],
      createdAt: new Date()
    };

    let userResponse;
    let userId;

    if (isDbConnected()) {
      const newUser = await User.create(userData);
      userId = newUser._id;
      userResponse = {
        id: newUser._id,
        email: newUser.email,
        channelName: newUser.channelName,
        role: newUser.role,
        subscription: newUser.subscription,
        bacsPayment: newUser.bacsPayment,
        purchases: newUser.purchases
      };
    } else {
      userId = 'usr_' + Date.now() + Math.random().toString(36).substring(2, 6);
      userData._id = userId;
      userData.id = userId;
      const fallbackUsers = getFallbackUsers();
      fallbackUsers.push(userData);
      saveFallbackUsers(fallbackUsers);

      userResponse = {
        id: userId,
        email: userData.email,
        channelName: userData.channelName,
        role: userData.role,
        subscription: userData.subscription,
        bacsPayment: userData.bacsPayment,
        purchases: userData.purchases
      };
    }

    const token = generateToken(userId);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error occurred during registration'
    });
  }
};

/**
 * Log in an existing user
 * Body: { email, password }
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user;

    if (isDbConnected()) {
      user = await User.findOne({ email: normalizedEmail });
    } else {
      const fallbackUsers = getFallbackUsers();
      user = fallbackUsers.find(u => u.email === normalizedEmail);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const userId = user._id || user.id;
    const token = generateToken(userId);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: {
        id: userId,
        email: user.email,
        channelName: user.channelName,
        role: user.role,
        subscription: user.subscription,
        bacsPayment: user.bacsPayment,
        purchases: user.purchases || []
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error occurred during login'
    });
  }
};

/**
 * Get current user profile
 */
exports.getProfile = async (req, res) => {
  try {
    let user;
    if (isDbConnected()) {
      user = await User.findById(req.userId).select('-password');
    } else {
      const fallbackUsers = getFallbackUsers();
      user = fallbackUsers.find(u => (u._id === req.userId || u.id === req.userId));
      if (user) {
        const { password, ...rest } = user;
        user = rest;
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { channelName, bacsPayment, location, timezone } = req.body;
    const updateFields = {};

    if (channelName !== undefined) updateFields.channelName = channelName.trim();
    // Email is immutable for security
    if (bacsPayment) updateFields.bacsPayment = bacsPayment;
    if (location !== undefined) updateFields.location = location.trim();
    if (timezone !== undefined) updateFields.timezone = timezone.trim();

    let user;
    if (isDbConnected()) {
      user = await User.findByIdAndUpdate(
        req.userId,
        { $set: updateFields },
        { new: true, runValidators: true }
      ).select('-password');
    } else {
      const fallbackUsers = getFallbackUsers();
      const idx = fallbackUsers.findIndex(u => (u._id === req.userId || u.id === req.userId));
      if (idx !== -1) {
        Object.assign(fallbackUsers[idx], updateFields);
        saveFallbackUsers(fallbackUsers);
        const { password, ...rest } = fallbackUsers[idx];
        user = rest;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Process purchase with Bacs Payment / Bachs
 */
exports.processBacsPurchase = async (req, res) => {
  try {
    const { itemId, itemName, itemType, price, currency, bacsDetails } = req.body;

    let user;
    if (isDbConnected()) {
      user = await User.findById(req.userId);
    } else {
      const fallbackUsers = getFallbackUsers();
      user = fallbackUsers.find(u => (u._id === req.userId || u.id === req.userId));
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const bacsRef = 'BACS-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

    const newPurchase = {
      itemId: itemId || 'prod_' + Date.now(),
      itemName: itemName || 'Masterclass / Software License',
      itemType: itemType || 'software',
      price: price || 0,
      currency: currency || 'USD',
      paymentMethod: 'Bachs / Bacs Payment',
      bacsReference: bacsRef,
      purchasedAt: new Date()
    };

    if (!user.purchases) user.purchases = [];
    user.purchases.push(newPurchase);

    if (bacsDetails && bacsDetails.accountNumber) {
      user.bacsPayment = {
        accountHolderName: bacsDetails.accountHolderName || user.bacsPayment?.accountHolderName || '',
        sortCode: bacsDetails.sortCode || user.bacsPayment?.sortCode || '20-00-00',
        accountNumberMasked: '••••' + bacsDetails.accountNumber.slice(-4),
        mandateReference: bacsRef,
        status: 'active'
      };
      if (user.subscription) {
        user.subscription.paymentMethod = 'Bacs Direct Debit';
      }
    }

    if (isDbConnected()) {
      await user.save();
    } else {
      const fallbackUsers = getFallbackUsers();
      const idx = fallbackUsers.findIndex(u => (u._id === req.userId || u.id === req.userId));
      if (idx !== -1) {
        fallbackUsers[idx] = user;
        saveFallbackUsers(fallbackUsers);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Purchase confirmed for ${itemName}!`,
      purchase: newPurchase,
      bacsReference: bacsRef
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// In-memory reset tokens store: { email: { code, expiresAt } }
const resetTokens = new Map();

/**
 * Request Password Reset Code
 * POST /api/users/forgot-password
 * Body: { email }
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user;

    if (isDbConnected()) {
      user = await User.findOne({ email: normalizedEmail });
    } else {
      const fallbackUsers = getFallbackUsers();
      user = fallbackUsers.find(u => u.email === normalizedEmail);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address.'
      });
    }

    // Generate 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    resetTokens.set(normalizedEmail, {
      code: resetCode,
      expiresAt: Date.now() + 15 * 60 * 1000 // 15 mins
    });

    console.log(`[Auth] Password reset code for ${normalizedEmail}: ${resetCode}`);

    return res.status(200).json({
      success: true,
      message: `Password reset verification code sent to ${normalizedEmail}`,
      resetCode
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Reset Password with Code
 * POST /api/users/reset-password
 * Body: { email, resetCode, newPassword }
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, verification code, and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const tokenRecord = resetTokens.get(normalizedEmail);

    if (!tokenRecord || tokenRecord.code !== resetCode.trim() || tokenRecord.expiresAt < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code. Please request a new one.'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    if (isDbConnected()) {
      await User.findOneAndUpdate(
        { email: normalizedEmail },
        { $set: { password: hashedPassword } }
      );
    } else {
      const fallbackUsers = getFallbackUsers();
      const user = fallbackUsers.find(u => u.email === normalizedEmail);
      if (user) {
        user.password = hashedPassword;
        saveFallbackUsers(fallbackUsers);
      }
    }

    resetTokens.delete(normalizedEmail);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
