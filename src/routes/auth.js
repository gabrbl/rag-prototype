const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/login
 * Autenticar usuario
 */
router.post('/login', [
  body('username').trim().notEmpty().withMessage('El nombre de usuario es requerido'),
  body('password').notEmpty().withMessage('La contraseña es requerida')
], async (req, res, next) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Datos de entrada inválidos',
          details: errors.array()
        }
      });
    }

    const { username, password } = req.body;

    const result = await auth.authenticateUser(username, password);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: {
          message: result.message,
          status: 401
        }
      });
    }

    logger.info('User login successful', {
      userId: result.user.id,
      username: result.user.username,
      ip: req.ip
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
        expiresIn: process.env.JWT_EXPIRE || '7d'
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 */
router.post('/register', [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('El nombre de usuario debe tener entre 3 y 20 caracteres')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('El nombre de usuario solo puede contener letras, números y guiones bajos'),
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('El rol debe ser "user" o "admin"')
], async (req, res, next) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Datos de entrada inválidos',
          details: errors.array()
        }
      });
    }

    const result = await auth.registerUser(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: result.message,
          status: 400
        }
      });
    }

    logger.info('User registration successful', {
      userId: result.user.id,
      username: result.user.username,
      ip: req.ip
    });

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        message: 'Usuario registrado exitosamente'
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Obtener información del usuario actual
 */
router.get('/me', auth.authenticateToken, async (req, res, next) => {
  try {
    const userInfo = auth.getUserInfo(req.user.id);

    if (!userInfo) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Usuario no encontrado',
          status: 404
        }
      });
    }

    res.json({
      success: true,
      data: {
        user: userInfo
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/me
 * Actualizar información del usuario actual
 */
router.put('/me', [
  auth.authenticateToken,
  body('email').optional().isEmail().withMessage('Debe proporcionar un email válido'),
  body('password').optional().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
], async (req, res, next) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Datos de entrada inválidos',
          details: errors.array()
        }
      });
    }

    // No permitir cambio de rol desde esta ruta
    const { role, ...updateData } = req.body;

    const result = await auth.updateUser(req.user.id, updateData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: result.message,
          status: 400
        }
      });
    }

    logger.info('User profile updated', {
      userId: req.user.id,
      updatedFields: Object.keys(updateData)
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        message: 'Perfil actualizado exitosamente'
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Cerrar sesión (en este caso, solo log del evento)
 */
router.post('/logout', auth.authenticateToken, (req, res) => {
  logger.info('User logout', {
    userId: req.user.id,
    username: req.user.username,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      message: 'Sesión cerrada exitosamente'
    }
  });
});

/**
 * GET /api/auth/users
 * Listar todos los usuarios (solo administradores)
 */
router.get('/users', [auth.authenticateToken, auth.requireAdmin], (req, res, next) => {
  try {
    const users = auth.getAllUsers();

    res.json({
      success: true,
      data: {
        users,
        total: users.length
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/users/:userId
 * Actualizar usuario específico (solo administradores)
 */
router.put('/users/:userId', [
  auth.authenticateToken,
  auth.requireAdmin,
  body('email').optional().isEmail().withMessage('Debe proporcionar un email válido'),
  body('password').optional().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('role').optional().isIn(['user', 'admin']).withMessage('El rol debe ser "user" o "admin"'),
  body('isActive').optional().isBoolean().withMessage('isActive debe ser true o false')
], async (req, res, next) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Datos de entrada inválidos',
          details: errors.array()
        }
      });
    }

    const { userId } = req.params;
    const result = await auth.updateUser(userId, req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: result.message,
          status: 400
        }
      });
    }

    logger.info('User updated by admin', {
      adminId: req.user.id,
      targetUserId: userId,
      updatedFields: Object.keys(req.body)
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        message: 'Usuario actualizado exitosamente'
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
