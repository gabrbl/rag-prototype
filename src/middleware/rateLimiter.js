const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Rate limiter principal para la API
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos por defecto
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests por ventana por defecto
  message: {
    error: 'Demasiadas solicitudes desde esta IP, por favor intenta de nuevo más tarde.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true, // Incluir headers de rate limit en las respuestas
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
    
    res.status(429).json({
      error: 'Demasiadas solicitudes desde esta IP, por favor intenta de nuevo más tarde.',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    });
  },
  skip: (req) => {
    // Saltar rate limiting para ciertos endpoints o en desarrollo
    if (process.env.NODE_ENV === 'development' && req.path === '/api/health') {
      return true;
    }
    return false;
  }
});

// Rate limiter específico para chat (más restrictivo)
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // 20 mensajes por minuto
  message: {
    error: 'Demasiados mensajes enviados. Por favor espera un momento antes de enviar otro mensaje.',
    retryAfter: 60
  },
  handler: (req, res) => {
    logger.warn('Chat rate limit exceeded', {
      ip: req.ip,
      sessionId: req.body?.sessionId || 'unknown',
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      error: 'Demasiados mensajes enviados. Por favor espera un momento antes de enviar otro mensaje.',
      retryAfter: 60
    });
  }
});

// Rate limiter para subida de documentos (muy restrictivo)
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5, // 5 uploads por cada 5 minutos
  message: {
    error: 'Demasiados archivos subidos. Por favor espera antes de subir más documentos.',
    retryAfter: 300
  },
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      fileName: req.file?.originalname || 'unknown'
    });
    
    res.status(429).json({
      error: 'Demasiados archivos subidos. Por favor espera antes de subir más documentos.',
      retryAfter: 300
    });
  }
});

// Rate limiter para búsquedas
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // 30 búsquedas por minuto
  message: {
    error: 'Demasiadas búsquedas realizadas. Por favor espera un momento.',
    retryAfter: 60
  }
});

module.exports = {
  apiLimiter,
  chatLimiter,
  uploadLimiter,
  searchLimiter
};
