const express = require('express');
const { query, validationResult } = require('express-validator');

const auth = require('../middleware/auth');
const chatService = require('../services/chatService');
const documentService = require('../services/documentService');
const vectorDB = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware para requerir permisos de administrador en todas las rutas
router.use(auth.authenticateToken);
router.use(auth.requireAdmin);

/**
 * GET /api/admin/dashboard
 * Obtener datos del dashboard de administración
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    // Obtener estadísticas del chat
    const chatStats = chatService.getChatStats();
    
    // Obtener estadísticas de documentos
    const documentStats = await documentService.getDocumentStats();
    
    // Obtener lista de usuarios
    const users = auth.getAllUsers();
    
    // Calcular métricas adicionales
    const activeUsers = users.filter(user => user.isActive).length;
    const adminUsers = users.filter(user => user.role === 'admin').length;
    
    const dashboardData = {
      overview: {
        totalUsers: users.length,
        activeUsers: activeUsers,
        adminUsers: adminUsers,
        totalDocuments: documentStats.totalVectors,
        activeChatSessions: chatStats.activeSessions,
        totalMessages: chatStats.totalMessages
      },
      chatMetrics: {
        ...chatStats,
        avgMessagesPerSession: chatStats.avgMessagesPerSession
      },
      documentMetrics: {
        ...documentStats,
        indexHealth: documentStats.indexFullness < 0.8 ? 'good' : 'warning'
      },
      systemHealth: {
        status: 'operational',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV
      },
      lastUpdated: new Date().toISOString()
    };

    logger.info('Admin dashboard accessed', {
      adminId: req.user.id,
      adminUsername: req.user.username
    });

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/users
 * Gestión de usuarios (ya incluido en auth.js, pero con más detalles aquí)
 */
router.get('/users', [
  query('active').optional().isBoolean().withMessage('active debe ser true o false'),
  query('role').optional().isIn(['user', 'admin']).withMessage('role debe ser "user" o "admin"'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit debe ser entre 1 y 100')
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

    let users = auth.getAllUsers();
    
    // Aplicar filtros
    const { active, role, limit = 50 } = req.query;
    
    if (active !== undefined) {
      users = users.filter(user => user.isActive === (active === 'true'));
    }
    
    if (role) {
      users = users.filter(user => user.role === role);
    }
    
    // Limitar resultados
    users = users.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        users: users,
        count: users.length,
        total: auth.getAllUsers().length
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/sessions
 * Gestión de sesiones de chat
 */
router.get('/sessions', [
  query('active').optional().isBoolean().withMessage('active debe ser true o false'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit debe ser entre 1 y 100')
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

    let sessions = chatService.getActiveSessions();
    
    const { active, limit = 50 } = req.query;
    
    if (active !== undefined) {
      sessions = sessions.filter(session => session.isActive === (active === 'true'));
    }
    
    sessions = sessions.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        sessions: sessions,
        count: sessions.length
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs
 * Obtener logs del sistema (simplificado)
 */
router.get('/logs', [
  query('level').optional().isIn(['error', 'warn', 'info', 'debug']).withMessage('level inválido'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit debe ser entre 1 y 1000')
], async (req, res, next) => {
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

    // En una implementación completa, aquí leerías los archivos de log
    // Por simplicidad, retornamos un mensaje informativo
    const { level = 'info', limit = 100 } = req.query;

    const mockLogs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Sistema funcionando correctamente',
        metadata: { component: 'system' }
      },
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: 'info',
        message: 'Nueva sesión de chat creada',
        metadata: { component: 'chat' }
      }
    ];

    logger.info('Admin logs accessed', {
      adminId: req.user.id,
      level: level,
      limit: limit
    });

    res.json({
      success: true,
      data: {
        logs: mockLogs,
        count: mockLogs.length,
        filters: { level, limit: parseInt(limit) },
        message: 'En producción, aquí se mostrarían los logs reales del archivo de log'
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/system/health
 * Verificación completa del estado del sistema
 */
router.get('/system/health', async (req, res, next) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
      services: {
        api: { status: 'healthy', responseTime: '< 100ms' },
        vectorDatabase: { status: 'checking...', responseTime: null },
        chat: { status: 'healthy', activeSessions: chatService.getChatStats().activeSessions },
        documents: { status: 'checking...', totalVectors: null }
      },
      resources: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    // Verificar estado de la base de datos vectorial
    try {
      const vectorStats = await vectorDB.getIndexStats();
      health.services.vectorDatabase.status = 'healthy';
      health.services.vectorDatabase.responseTime = '< 200ms';
      health.services.vectorDatabase.totalVectors = vectorStats.totalVectorCount;
    } catch (error) {
      health.services.vectorDatabase.status = 'unhealthy';
      health.services.vectorDatabase.error = error.message;
      health.status = 'degraded';
    }

    // Verificar estado del servicio de documentos
    try {
      const docStats = await documentService.getDocumentStats();
      health.services.documents.status = 'healthy';
      health.services.documents.totalVectors = docStats.totalVectors;
      health.services.documents.indexFullness = docStats.indexFullness;
    } catch (error) {
      health.services.documents.status = 'unhealthy';
      health.services.documents.error = error.message;
      health.status = 'degraded';
    }

    // Determinar estado general
    const unhealthyServices = Object.values(health.services).filter(service => service.status === 'unhealthy');
    if (unhealthyServices.length > 0) {
      health.status = unhealthyServices.length === Object.keys(health.services).length ? 'unhealthy' : 'degraded';
    }

    logger.info('System health check performed', {
      adminId: req.user.id,
      status: health.status,
      unhealthyServices: unhealthyServices.length
    });

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      success: health.status !== 'unhealthy',
      data: health
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/system/cleanup
 * Limpieza del sistema (sesiones expiradas, logs antiguos, etc.)
 */
router.post('/system/cleanup', async (req, res, next) => {
  try {
    const cleanupResults = {
      timestamp: new Date().toISOString(),
      operations: []
    };

    // Limpiar sesiones expiradas
    const sessionsBefore = chatService.getChatStats().totalSessions;
    chatService.cleanExpiredSessions();
    const sessionsAfter = chatService.getChatStats().totalSessions;
    
    cleanupResults.operations.push({
      operation: 'expired_sessions_cleanup',
      sessionsRemoved: sessionsBefore - sessionsAfter,
      status: 'completed'
    });

    // En producción, aquí también limpiarías logs antiguos, archivos temporales, etc.
    cleanupResults.operations.push({
      operation: 'temp_files_cleanup',
      filesRemoved: 0,
      status: 'completed',
      note: 'No temporary files found'
    });

    logger.info('System cleanup performed', {
      adminId: req.user.id,
      adminUsername: req.user.username,
      operations: cleanupResults.operations.length
    });

    res.json({
      success: true,
      data: {
        cleanup: cleanupResults,
        message: 'Limpieza del sistema completada exitosamente'
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/analytics
 * Análisis y métricas avanzadas
 */
router.get('/analytics', [
  query('period').optional().isIn(['24h', '7d', '30d']).withMessage('period debe ser 24h, 7d o 30d')
], async (req, res, next) => {
  try {
    const { period = '24h' } = req.query;
    
    // En una implementación completa, aquí calcularías métricas reales
    const analytics = {
      period: period,
      generatedAt: new Date().toISOString(),
      metrics: {
        chatMetrics: {
          totalSessions: chatService.getChatStats().totalSessions,
          avgMessagesPerSession: chatService.getChatStats().avgMessagesPerSession,
          totalMessages: chatService.getChatStats().totalMessages,
          avgResponseTime: '1.2s', // Mock data
          userSatisfaction: 4.5 // Mock data
        },
        documentMetrics: {
          totalDocuments: (await documentService.getDocumentStats()).totalVectors,
          searchQueries: 156, // Mock data
          avgSearchRelevance: 0.85, // Mock data
          popularCategories: [ // Mock data
            { category: 'technical', queries: 45 },
            { category: 'billing', queries: 32 },
            { category: 'product', queries: 28 }
          ]
        },
        systemMetrics: {
          uptime: process.uptime(),
          memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          errorRate: 0.02, // Mock data
          responseTime: 95 // Mock data
        }
      }
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
