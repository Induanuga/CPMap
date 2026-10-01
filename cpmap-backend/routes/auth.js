const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const VALID_ROLES = ['user', 'collector', 'moderator', 'admin'];

// Helper: generate JWT (includes role)
const signToken = (user) =>
  jwt.sign(
    { id: user._id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

// GET /api/auth/profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ message: 'Server error fetching profile.' });
  }
});

// PATCH /api/auth/profile
router.patch('/profile', protect, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (name !== undefined) {
      const normalizedName = String(name).trim();
      if (!normalizedName) {
        return res.status(400).json({ message: 'Name cannot be empty.' });
      }
      user.name = normalizedName;
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: 'Please provide a valid email.' });
      }
      if (normalizedEmail !== user.email) {
        const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
        if (existingEmail) {
          return res.status(409).json({ message: 'Email already registered.' });
        }
        user.email = normalizedEmail;
      }
    }

    if (phone !== undefined) {
      const normalizedPhone = String(phone).trim();
      if (!/^\d{10}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: 'Phone number must be 10 digits.' });
      }
      if (normalizedPhone !== user.phone) {
        const existingPhone = await User.findOne({ phone: normalizedPhone, _id: { $ne: user._id } });
        if (existingPhone) {
          return res.status(409).json({ message: 'Phone number already registered.' });
        }
        user.phone = normalizedPhone;
      }
    }

    if (password !== undefined && password !== '') {
      if (String(password).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      }
      user.password = password;
    }

    await user.save();

    const token = signToken(user);

    res.json({
      message: 'Profile updated successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    if (err.code === 11000) {
      if (err.keyPattern?.email) {
        return res.status(409).json({ message: 'Email already registered.' });
      }
      if (err.keyPattern?.phone) {
        return res.status(409).json({ message: 'Phone number already registered.' });
      }
      return res.status(409).json({ message: 'Email or phone already registered.' });
    }
    if (err.name === 'ValidationError') {
      const firstMessage = Object.values(err.errors)[0]?.message || 'Invalid profile data.';
      return res.status(400).json({ message: firstMessage });
    }
    res.status(500).json({ message: 'Server error updating profile.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const {
      name = '',
      email = '',
      phone = '',
      password = '',
      confirmPassword = '',
      role,
    } = req.body;
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = String(phone).trim();

    // Validation
    if (!normalizedName || !normalizedEmail || !normalizedPhone || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }
    if (!/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Phone number must be 10 digits.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // Validate role
    const assignedRole = role && VALID_ROLES.includes(role) ? role : 'user';

    // Check duplicate email
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const existingPhone = await User.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return res.status(409).json({ message: 'Phone number already registered.' });
    }

    // Create user (password hashed via pre-save hook)
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      role: assignedRole,
    });

    res.status(201).json({
      message: 'Registration successful.',
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    if (err.code === 11000) {
      if (err.keyPattern?.email) {
        return res.status(409).json({ message: 'Email already registered.' });
      }
      if (err.keyPattern?.phone) {
        return res.status(409).json({ message: 'Phone number already registered.' });
      }
      return res.status(409).json({ message: 'User already registered.' });
    }
    if (err.name === 'ValidationError') {
      const firstMessage = Object.values(err.errors)[0]?.message || 'Invalid registration data.';
      return res.status(400).json({ message: firstMessage });
    }
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);

    res.json({
      message: 'Login successful.',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

module.exports = router;
