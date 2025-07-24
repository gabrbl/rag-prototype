const express = require('express');
require('dotenv').config();

const logger = require('./src/utils/logger');

async function testRoutes() {
  const app = express();
  
  logger.info('Probando rutas individualmente...');
  
  try {
    logger.info('Probando auth routes...');
    const authRoutes = require('./src/routes/auth');
    app.use('/api/auth', authRoutes);
    logger.info('✅ Auth routes OK');
  } catch (error) {
    logger.error('❌ Error en auth routes:', error);
  }
  
  try {
    logger.info('Probando document routes...');
    const documentRoutes = require('./src/routes/documents');
    app.use('/api/documents', documentRoutes);
    logger.info('✅ Document routes OK');
  } catch (error) {
    logger.error('❌ Error en document routes:', error);
  }
  
  try {
    logger.info('Probando chat routes...');
    const chatRoutes = require('./src/routes/chat');
    app.use('/api/chat', chatRoutes);
    logger.info('✅ Chat routes OK');
  } catch (error) {
    logger.error('❌ Error en chat routes:', error);
  }
  
  try {
    logger.info('Probando admin routes...');
    const adminRoutes = require('./src/routes/admin');
    app.use('/api/admin', adminRoutes);
    logger.info('✅ Admin routes OK');
  } catch (error) {
    logger.error('❌ Error en admin routes:', error);
  }
  
  logger.info('Prueba de rutas completada');
}

testRoutes();
