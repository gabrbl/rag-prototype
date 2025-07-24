const express = require('express');
const { body, query, validationResult } = require('express-validator');

const auth = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimiter');
const chatService = require('../services/chatService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/chat/session
 * Crear una nueva sesión de chat
 */
router.post('/session', [
  auth.optionalAuth,
  body('metadata').optional().isObject().withMessage('Los metadatos deben ser un objeto')
], (req, res, next) => {
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

    const metadata = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      source: 'web',
      ...req.body.metadata
    };

    const session = chatService.createChatSession(req.user?.id, metadata);

    logger.logChatActivity(session.sessionId, 'session_created', {
      userId: req.user?.id || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      data: session
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chat/message
 * Enviar un mensaje en una sesión de chat
 */
router.post('/message', [
  chatLimiter,
  body('sessionId').notEmpty().withMessage('El ID de sesión es requerido'),
  body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('El mensaje debe tener entre 1 y 1000 caracteres'),
  body('maxResults').optional().isInt({ min: 1, max: 10 }).withMessage('maxResults debe ser entre 1 y 10')
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

    const { sessionId, message, maxResults = 5 } = req.body;

    logger.logChatActivity(sessionId, 'message_received', {
      messageLength: message.length,
      ip: req.ip
    });

    const response = await chatService.processMessage(sessionId, message, { maxResults });

    logger.logChatActivity(sessionId, 'message_processed', {
      intent: response.intent?.categoria,
      confidence: response.confidence,
      sourcesCount: response.sources.length
    });

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    if (error.message === 'Sesión de chat no encontrada') {
      return res.status(404).json({
        success: false,
        error: {
          message: error.message,
          status: 404,
          code: 'SESSION_NOT_FOUND'
        }
      });
    }
    next(error);
  }
});

/**
 * GET /api/chat/session/:sessionId
 * Obtener información de una sesión específica
 */
router.get('/session/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = chatService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sesión de chat no encontrada',
          status: 404
        }
      });
    }

    // Ocultar información sensible si no es el propietario
    const sessionData = {
      id: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      messageCount: session.messages.length,
      isActive: session.isActive
    };

    // Si es el propietario o admin, mostrar más detalles
    if (req.user && (req.user.id === session.userId || req.user.role === 'admin')) {
      sessionData.messages = session.messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        intent: msg.intent,
        sources: msg.sources
      }));
      sessionData.metadata = session.metadata;
    }

    res.json({
      success: true,
      data: {
        session: sessionData
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chat/session/:sessionId/end
 * Finalizar una sesión de chat
 */
router.post('/session/:sessionId/end', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const success = chatService.endChatSession(sessionId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sesión de chat no encontrada',
          status: 404
        }
      });
    }

    logger.logChatActivity(sessionId, 'session_ended', {
      userId: req.user?.id || 'anonymous',
      ip: req.ip
    });

    res.json({
      success: true,
      data: {
        message: 'Sesión de chat finalizada exitosamente',
        sessionId: sessionId
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/sessions
 * Obtener sesiones activas (requiere autenticación)
 */
router.get('/sessions', [
  auth.authenticateToken,
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe ser entre 1 y 100'),
  query('active').optional().isBoolean().withMessage('active debe ser true o false')
], (req, res, next) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Parámetros de consulta inválidos',
          details: errors.array()
        }
      });
    }

    const { limit = 50, active = true } = req.query;
    let sessions = chatService.getActiveSessions();

    // Filtrar por usuario si no es admin
    if (req.user.role !== 'admin') {
      sessions = sessions.filter(session => session.userId === req.user.id);
    }

    // Filtrar por estado activo si se especifica
    if (active !== undefined) {
      const isActive = active === 'true';
      sessions = sessions.filter(session => session.isActive === isActive);
    }

    // Limitar resultados
    sessions = sessions.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        sessions: sessions,
        count: sessions.length,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/stats
 * Obtener estadísticas del servicio de chat
 */
router.get('/stats', auth.authenticateToken, (req, res, next) => {
  try {
    const stats = chatService.getChatStats();

    res.json({
      success: true,
      data: {
        stats: stats,
        retrievedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/session/:sessionId/export
 * Exportar datos de una sesión específica
 */
router.get('/session/:sessionId/export', [
  auth.authenticateToken,
  auth.requireAdmin
], (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const sessionData = chatService.exportSessionData(sessionId);

    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sesión de chat no encontrada',
          status: 404
        }
      });
    }

    logger.logChatActivity(sessionId, 'session_exported', {
      adminId: req.user.id,
      adminUsername: req.user.username
    });

    res.json({
      success: true,
      data: {
        session: sessionData,
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.username
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/health
 * Verificar el estado del servicio de chat
 */
router.get('/health', (req, res) => {
  try {
    const stats = chatService.getChatStats();
    
    const health = {
      status: 'healthy',
      chatService: {
        active: true,
        activeSessions: stats.activeSessions,
        totalSessions: stats.totalSessions
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: health
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        message: 'Servicio de chat no disponible',
        status: 503
      },
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      }
    });
  }
});

module.exports = router;
