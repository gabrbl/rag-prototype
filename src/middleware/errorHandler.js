const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log del error
  logger.logError(err, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Error por defecto
  let error = {
    message: 'Error interno del servidor',
    status: 500
  };

  // Errores específicos de validación
  if (err.name === 'ValidationError') {
    error.message = 'Datos de entrada inválidos';
    error.status = 400;
    error.details = Object.values(err.errors).map(e => e.message);
  }

  // Errores de JWT
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Token de autenticación inválido';
    error.status = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token de autenticación expirado';
    error.status = 401;
  }

  // Errores de archivo muy grande
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'El archivo es demasiado grande. Tamaño máximo permitido: 10MB';
    error.status = 413;
  }

  // Errores de tipo de archivo no permitido
  if (err.code === 'INVALID_FILE_TYPE') {
    error.message = 'Tipo de archivo no permitido. Formatos soportados: PDF, TXT, MD, DOCX';
    error.status = 400;
  }

  // Errores de OpenAI
  if (err.message.includes('OpenAI') || err.message.includes('embedding')) {
    error.message = 'Error en el servicio de inteligencia artificial. Por favor intenta de nuevo.';
    error.status = 503;
  }

  // Errores de Pinecone/Vector Database
  if (err.message.includes('Pinecone') || err.message.includes('vector')) {
    error.message = 'Error en la base de datos. Por favor intenta de nuevo.';
    error.status = 503;
  }

  // Errores de red/conexión
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    error.message = 'Error de conexión. Por favor verifica tu conexión a internet.';
    error.status = 503;
  }

  // En desarrollo, incluir stack trace
  if (process.env.NODE_ENV === 'development') {
    error.stack = err.stack;
  }

  // Respuesta del error
  res.status(error.status).json({
    success: false,
    error: {
      message: error.message,
      status: error.status,
      ...(error.details && { details: error.details }),
      ...(error.stack && { stack: error.stack })
    },
    timestamp: new Date().toISOString()
  });
};

// Middleware para manejar rutas no encontradas
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Ruta no encontrada',
      status: 404,
      path: req.url
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
