const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// Almacén en memoria para usuarios (en producción usar base de datos)
const users = new Map();

// Usuario administrador por defecto
const defaultAdmin = {
  id: 'admin-001',
  username: 'admin',
  email: 'admin@empresa.com',
  password: bcrypt.hashSync('admin123', 10), // Cambiar en producción
  role: 'admin',
  createdAt: new Date(),
  isActive: true
};

users.set('admin', defaultAdmin);

/**
 * Genera un token JWT
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username, 
      role: user.role 
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '7d' 
    }
  );
};

/**
 * Middleware de autenticación
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token de acceso requerido',
        status: 401
      }
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        token: token.substring(0, 20) + '...'
      });

      return res.status(403).json({
        success: false,
        error: {
          message: 'Token inválido o expirado',
          status: 403
        }
      });
    }

    req.user = user;
    next();
  });
};

/**
 * Middleware para verificar rol de administrador
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Acceso denegado. Se requieren permisos de administrador.',
        status: 403
      }
    });
  }
  next();
};

/**
 * Middleware opcional de autenticación (no falla si no hay token)
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
};

/**
 * Autentica un usuario
 */
const authenticateUser = async (username, password) => {
  try {
    const user = users.get(username);
    
    if (!user || !user.isActive) {
      return { success: false, message: 'Usuario no encontrado o inactivo' };
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return { success: false, message: 'Credenciales inválidas' };
    }

    const token = generateToken(user);
    
    logger.info('User authenticated', {
      userId: user.id,
      username: user.username,
      role: user.role
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      },
      token
    };

  } catch (error) {
    logger.error('Authentication error:', error);
    return { success: false, message: 'Error interno de autenticación' };
  }
};

/**
 * Registra un nuevo usuario
 */
const registerUser = async (userData) => {
  try {
    const { username, email, password, role = 'user' } = userData;

    // Verificar si el usuario ya existe
    if (users.has(username)) {
      return { success: false, message: 'El nombre de usuario ya existe' };
    }

    // Verificar si el email ya existe
    for (const user of users.values()) {
      if (user.email === email) {
        return { success: false, message: 'El email ya está registrado' };
      }
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear nuevo usuario
    const newUser = {
      id: `user-${Date.now()}`,
      username,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date(),
      isActive: true
    };

    users.set(username, newUser);

    logger.info('New user registered', {
      userId: newUser.id,
      username: newUser.username,
      role: newUser.role
    });

    return {
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt
      }
    };

  } catch (error) {
    logger.error('Registration error:', error);
    return { success: false, message: 'Error interno de registro' };
  }
};

/**
 * Obtiene información de un usuario
 */
const getUserInfo = (userId) => {
  for (const user of users.values()) {
    if (user.id === userId) {
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        isActive: user.isActive
      };
    }
  }
  return null;
};

/**
 * Lista todos los usuarios (solo para admins)
 */
const getAllUsers = () => {
  return Array.from(users.values()).map(user => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    isActive: user.isActive
  }));
};

/**
 * Actualiza un usuario
 */
const updateUser = async (userId, updateData) => {
  try {
    let userToUpdate = null;
    let userKey = null;

    // Encontrar el usuario
    for (const [key, user] of users.entries()) {
      if (user.id === userId) {
        userToUpdate = user;
        userKey = key;
        break;
      }
    }

    if (!userToUpdate) {
      return { success: false, message: 'Usuario no encontrado' };
    }

    // Actualizar campos permitidos
    const allowedFields = ['email', 'role', 'isActive'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        userToUpdate[field] = updateData[field];
      }
    });

    // Si se actualiza la contraseña
    if (updateData.password) {
      userToUpdate.password = await bcrypt.hash(updateData.password, 10);
    }

    userToUpdate.updatedAt = new Date();

    logger.info('User updated', {
      userId: userToUpdate.id,
      updatedFields: Object.keys(updateData)
    });

    return {
      success: true,
      user: {
        id: userToUpdate.id,
        username: userToUpdate.username,
        email: userToUpdate.email,
        role: userToUpdate.role,
        createdAt: userToUpdate.createdAt,
        updatedAt: userToUpdate.updatedAt,
        isActive: userToUpdate.isActive
      }
    };

  } catch (error) {
    logger.error('User update error:', error);
    return { success: false, message: 'Error actualizando usuario' };
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuth,
  authenticateUser,
  registerUser,
  getUserInfo,
  getAllUsers,
  updateUser,
  generateToken
};
