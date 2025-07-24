const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const logger = require('./src/utils/logger');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// Import routes
const authRoutes = require('./src/routes/auth');
const documentRoutes = require('./src/routes/documents');
const chatRoutes = require('./src/routes/chat');
const adminRoutes = require('./src/routes/admin');

// Import socket handlers
const chatSocket = require('./src/services/chatSocket');
const vectorDB = require('./src/config/database');

async function initializeServer() {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });

  // Inicializar base de datos vectorial
  logger.info('Inicializando base de datos vectorial...');
  const dbInitialized = await vectorDB.initialize();
  if (!dbInitialized) {
    logger.error('Error inicializando base de datos vectorial. Continuando sin ella...');
  }

  // Basic middleware
  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined', { stream: { write: message => logger.info(message) } }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate limiting
  app.use('/api/', apiLimiter);

  // Static files
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/admin', adminRoutes);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // Serve frontend (solo para rutas que no empiecen con /api)
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Socket.IO connection handling
  chatSocket(io);

  // 404 handler
  app.use(notFoundHandler);

  // Error handling middleware
  app.use(errorHandler);

  const PORT = process.env.PORT || 3000;

  server.listen(PORT, () => {
    logger.info(`🚀 Sistema RAG para Atención al Cliente iniciado en puerto ${PORT}`);
    logger.info(`🌐 Modo: ${process.env.NODE_ENV}`);
    logger.info(`📚 Documentación API: http://localhost:${PORT}/api/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('Process terminated');
    });
  });

  return app;
}

// Inicializar servidor
initializeServer().catch(error => {
  logger.error('Error inicializando servidor:', error);
  process.exit(1);
});

module.exports = { initializeServer };
