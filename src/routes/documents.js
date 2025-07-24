const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, query, validationResult } = require('express-validator');

const auth = require('../middleware/auth');
const { uploadLimiter, searchLimiter } = require('../middleware/rateLimiter');
const documentService = require('../services/documentService');
const logger = require('../utils/logger');

const router = express.Router();

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'pdf,txt,md,docx').split(',');
  const fileExtension = path.extname(file.originalname).toLowerCase().slice(1);
  
  if (allowedTypes.includes(fileExtension)) {
    cb(null, true);
  } else {
    const error = new Error('Tipo de archivo no permitido');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB por defecto
  },
  fileFilter: fileFilter
});

/**
 * POST /api/documents/upload
 * Subir y procesar un nuevo documento
 */
router.post('/upload', [
  auth.authenticateToken,
  uploadLimiter,
  upload.single('document'),
  body('title').optional().trim().isLength({ max: 200 }).withMessage('El título no puede exceder 200 caracteres'),
  body('category').optional().isIn(['general', 'technical', 'billing', 'product', 'account', 'returns']).withMessage('Categoría inválida'),
  body('tags').optional().isArray().withMessage('Las etiquetas deben ser un array')
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

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No se ha subido ningún archivo',
          status: 400
        }
      });
    }

    // Metadata del documento
    const metadata = {
      title: req.body.title || req.file.originalname,
      category: req.body.category || 'general',
      tags: req.body.tags || [],
      uploadedBy: req.user.id,
      uploadedByUsername: req.user.username
    };

    logger.logDocumentActivity(req.file.originalname, 'upload_started', {
      userId: req.user.id,
      fileSize: req.file.size,
      filename: req.file.originalname
    });

    // Procesar el documento
    const result = await documentService.processDocument(req.file, metadata);

    logger.logDocumentActivity(result.documentId, 'upload_completed', {
      userId: req.user.id,
      chunksCreated: result.chunksCreated,
      filename: result.filename
    });

    res.status(201).json({
      success: true,
      data: {
        document: result,
        message: 'Documento procesado y almacenado exitosamente'
      }
    });

  } catch (error) {
    logger.logDocumentActivity('unknown', 'upload_failed', {
      userId: req.user?.id,
      error: error.message,
      filename: req.file?.originalname
    });
    next(error);
  }
});

/**
 * GET /api/documents/search
 * Buscar documentos por consulta
 */
router.get('/search', [
  auth.optionalAuth,
  searchLimiter,
  query('q').notEmpty().withMessage('El parámetro de búsqueda "q" es requerido'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('El límite debe ser entre 1 y 20'),
  query('category').optional().isIn(['general', 'technical', 'billing', 'product', 'account', 'returns']).withMessage('Categoría inválida'),
  query('minScore').optional().isFloat({ min: 0, max: 1 }).withMessage('minScore debe ser entre 0 y 1')
], async (req, res, next) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Parámetros de búsqueda inválidos',
          details: errors.array()
        }
      });
    }

    const {
      q: query,
      limit = 5,
      category,
      minScore = 0.6
    } = req.query;

    const searchOptions = {
      topK: parseInt(limit),
      category: category || null,
      minScore: parseFloat(minScore)
    };

    logger.info('Document search performed', {
      query: query,
      userId: req.user?.id || 'anonymous',
      options: searchOptions
    });

    const results = await documentService.searchDocuments(query, searchOptions);

    res.json({
      success: true,
      data: {
        query: query,
        results: results,
        count: results.length,
        searchOptions: searchOptions
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/documents/stats
 * Obtener estadísticas de documentos
 */
router.get('/stats', auth.authenticateToken, async (req, res, next) => {
  try {
    const stats = await documentService.getDocumentStats();

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
 * DELETE /api/documents/:documentId
 * Eliminar un documento específico
 */
router.delete('/:documentId', [
  auth.authenticateToken,
  auth.requireAdmin
], async (req, res, next) => {
  try {
    const { documentId } = req.params;

    logger.logDocumentActivity(documentId, 'delete_requested', {
      userId: req.user.id,
      adminUsername: req.user.username
    });

    const success = await documentService.deleteDocument(documentId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Documento no encontrado o error al eliminar',
          status: 404
        }
      });
    }

    logger.logDocumentActivity(documentId, 'delete_completed', {
      userId: req.user.id,
      adminUsername: req.user.username
    });

    res.json({
      success: true,
      data: {
        message: 'Documento eliminado exitosamente',
        documentId: documentId
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/documents/categories
 * Obtener lista de categorías disponibles
 */
router.get('/categories', (req, res) => {
  const categories = [
    { id: 'general', name: 'General', description: 'Información general y miscelánea' },
    { id: 'technical', name: 'Soporte Técnico', description: 'Documentación técnica y resolución de problemas' },
    { id: 'billing', name: 'Facturación', description: 'Información sobre facturación, pagos y precios' },
    { id: 'product', name: 'Productos', description: 'Información sobre productos y servicios' },
    { id: 'account', name: 'Cuenta de Usuario', description: 'Gestión de cuentas y perfiles de usuario' },
    { id: 'returns', name: 'Devoluciones', description: 'Políticas de devolución y reembolsos' }
  ];

  res.json({
    success: true,
    data: {
      categories: categories,
      total: categories.length
    }
  });
});

/**
 * GET /api/documents/health
 * Verificar el estado del servicio de documentos
 */
router.get('/health', async (req, res, next) => {
  try {
    const stats = await documentService.getDocumentStats();
    
    const health = {
      status: 'healthy',
      vectorDatabase: {
        connected: true,
        totalVectors: stats.totalVectors,
        indexFullness: stats.indexFullness
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
        message: 'Servicio de documentos no disponible',
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
