const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const openaiService = require('./openaiService');
const documentService = require('./documentService');

class ChatService {
  constructor() {
    // Almacén en memoria para las sesiones de chat
    // En producción, esto debería estar en una base de datos persistente
    this.chatSessions = new Map();
    this.maxHistoryLength = 20; // Máximo de mensajes en el historial
    this.sessionTimeout = 1000 * 60 * 60; // 1 hora de timeout
  }

  /**
   * Crea una nueva sesión de chat
   * @param {string} userId - ID del usuario (opcional)
   * @param {Object} metadata - Metadatos de la sesión
   * @returns {Object} Información de la sesión creada
   */
  createChatSession(userId = null, metadata = {}) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      userId: userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      messages: [],
      metadata: {
        userAgent: metadata.userAgent || '',
        ip: metadata.ip || '',
        source: metadata.source || 'web',
        ...metadata
      },
      isActive: true
    };

    this.chatSessions.set(sessionId, session);
    logger.info(`Nueva sesión de chat creada: ${sessionId}`);
    
    return {
      sessionId: sessionId,
      createdAt: session.createdAt,
      welcomeMessage: "¡Hola! Soy tu asistente de atención al cliente. ¿En qué puedo ayudarte hoy?"
    };
  }

  /**
   * Procesa un mensaje del usuario y genera una respuesta
   * @param {string} sessionId - ID de la sesión
   * @param {string} message - Mensaje del usuario
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Respuesta del sistema
   */
  async processMessage(sessionId, message, options = {}) {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        throw new Error('Sesión de chat no encontrada');
      }

      // Limpiar sesiones expiradas periódicamente
      this.cleanExpiredSessions();

      // Actualizar actividad de la sesión
      session.lastActivity = new Date();

      // Clasificar la intención del mensaje
      const intent = await openaiService.classifyIntent(message);
      
      // Buscar documentos relevantes
      const searchOptions = {
        topK: options.maxResults || 5,
        category: this.mapIntentToCategory(intent.categoria),
        minScore: 0.6
      };

      const relevantDocs = await documentService.searchDocuments(message, searchOptions);
      
      // Obtener historial de conversación
      const chatHistory = this.getChatHistory(session);

      // Generar respuesta usando RAG
      const response = await openaiService.generateRAGResponse(
        message, 
        relevantDocs, 
        chatHistory
      );

      // Agregar mensajes al historial
      const userMessage = {
        id: uuidv4(),
        role: 'user',
        content: message,
        timestamp: new Date(),
        intent: intent
      };

      const assistantMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        sources: relevantDocs.map(doc => ({
          documentId: doc.metadata?.documentId,
          filename: doc.metadata?.filename,
          score: doc.score
        })),
        confidence: this.calculateConfidence(relevantDocs, intent)
      };

      session.messages.push(userMessage, assistantMessage);

      // Limitar el tamaño del historial
      if (session.messages.length > this.maxHistoryLength * 2) {
        session.messages = session.messages.slice(-this.maxHistoryLength * 2);
      }

      logger.info(`Mensaje procesado en sesión ${sessionId}. Intent: ${intent.categoria}`);

      return {
        messageId: assistantMessage.id,
        response: response,
        sources: assistantMessage.sources,
        intent: intent,
        confidence: assistantMessage.confidence,
        timestamp: assistantMessage.timestamp
      };

    } catch (error) {
      logger.error('Error procesando mensaje:', error);
      throw error;
    }
  }

  /**
   * Obtiene una sesión de chat
   * @param {string} sessionId - ID de la sesión
   * @returns {Object|null} Sesión o null si no existe
   */
  getSession(sessionId) {
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Verificar si la sesión ha expirado
    const now = new Date();
    const timeDiff = now - session.lastActivity;
    
    if (timeDiff > this.sessionTimeout) {
      this.chatSessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Obtiene el historial de una sesión
   * @param {Object} session - Sesión de chat
   * @returns {Array} Historial de mensajes
   */
  getChatHistory(session) {
    return session.messages.slice(-10); // Últimos 10 mensajes
  }

  /**
   * Obtiene todas las sesiones activas (para administración)
   * @returns {Array} Lista de sesiones activas
   */
  getActiveSessions() {
    const activeSessions = [];
    
    for (const [sessionId, session] of this.chatSessions.entries()) {
      const now = new Date();
      const timeDiff = now - session.lastActivity;
      
      if (timeDiff <= this.sessionTimeout) {
        activeSessions.push({
          sessionId: sessionId,
          userId: session.userId,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          messageCount: session.messages.length,
          isActive: session.isActive
        });
      }
    }

    return activeSessions;
  }

  /**
   * Finaliza una sesión de chat
   * @param {string} sessionId - ID de la sesión
   * @returns {boolean} Éxito de la operación
   */
  endChatSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.isActive = false;
    session.endedAt = new Date();
    
    logger.info(`Sesión de chat finalizada: ${sessionId}`);
    return true;
  }

  /**
   * Limpia sesiones expiradas
   */
  cleanExpiredSessions() {
    const now = new Date();
    const expiredSessions = [];

    for (const [sessionId, session] of this.chatSessions.entries()) {
      const timeDiff = now - session.lastActivity;
      if (timeDiff > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.chatSessions.delete(sessionId);
      logger.info(`Sesión expirada eliminada: ${sessionId}`);
    });
  }

  /**
   * Mapea intenciones a categorías de documentos
   * @param {string} intent - Intención clasificada
   * @returns {string|null} Categoría correspondiente
   */
  mapIntentToCategory(intent) {
    const intentToCategory = {
      'soporte_tecnico': 'technical',
      'facturacion': 'billing',
      'producto_info': 'product',
      'cuenta_usuario': 'account',
      'devolucion_reembolso': 'returns',
      'general': null
    };

    return intentToCategory[intent] || null;
  }

  /**
   * Calcula la confianza de la respuesta
   * @param {Array} relevantDocs - Documentos relevantes encontrados
   * @param {Object} intent - Intención clasificada
   * @returns {number} Nivel de confianza (0-1)
   */
  calculateConfidence(relevantDocs, intent) {
    if (relevantDocs.length === 0) {
      return 0.1;
    }

    // Promedio de scores de los documentos
    const avgScore = relevantDocs.reduce((sum, doc) => sum + doc.score, 0) / relevantDocs.length;
    
    // Factor de confianza de la clasificación de intención
    const intentConfidence = intent.confianza || 0.5;
    
    // Combinar ambos factores
    return Math.min((avgScore * 0.7) + (intentConfidence * 0.3), 1.0);
  }

  /**
   * Obtiene estadísticas del servicio de chat
   * @returns {Object} Estadísticas
   */
  getChatStats() {
    const sessions = Array.from(this.chatSessions.values());
    const activeSessions = sessions.filter(s => s.isActive);
    
    const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);
    const avgMessagesPerSession = sessions.length > 0 ? totalMessages / sessions.length : 0;

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      totalMessages: totalMessages,
      avgMessagesPerSession: Math.round(avgMessagesPerSession * 100) / 100,
      lastActivity: sessions.length > 0 ? Math.max(...sessions.map(s => s.lastActivity)) : null
    };
  }

  /**
   * Exporta el historial de una sesión (para análisis o respaldo)
   * @param {string} sessionId - ID de la sesión
   * @returns {Object|null} Datos exportados de la sesión
   */
  exportSessionData(sessionId) {
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      isActive: session.isActive,
      metadata: session.metadata,
      messages: session.messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        intent: msg.intent,
        sources: msg.sources
      }))
    };
  }
}

module.exports = new ChatService();
