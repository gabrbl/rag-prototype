const logger = require('../utils/logger');
const chatService = require('./chatService');

/**
 * Maneja las conexiones de WebSocket para chat en tiempo real
 * @param {SocketIO} io - Instancia de Socket.IO
 */
function initializeChatSocket(io) {
  // Middleware de autenticación para sockets (opcional)
  io.use((socket, next) => {
    // Aquí podrías verificar autenticación si es necesario
    // Por ahora, permitimos conexiones anónimas para chat público
    socket.userId = socket.handshake.auth?.userId || null;
    socket.sessionId = socket.handshake.auth?.sessionId || null;
    next();
  });

  io.on('connection', (socket) => {
    logger.info('Socket connection established', {
      socketId: socket.id,
      userId: socket.userId,
      sessionId: socket.sessionId,
      ip: socket.handshake.address
    });

    /**
     * Cliente solicita crear una nueva sesión de chat
     */
    socket.on('create_chat_session', (data, callback) => {
      try {
        const metadata = {
          userAgent: socket.handshake.headers['user-agent'],
          ip: socket.handshake.address,
          source: 'websocket',
          ...data.metadata
        };

        const session = chatService.createChatSession(socket.userId, metadata);
        
        // Unir el socket a una sala específica de la sesión
        socket.join(`session_${session.sessionId}`);
        socket.currentSessionId = session.sessionId;

        logger.logChatActivity(session.sessionId, 'websocket_session_created', {
          socketId: socket.id,
          userId: socket.userId
        });

        if (callback) {
          callback({
            success: true,
            data: session
          });
        }

      } catch (error) {
        logger.error('Error creating chat session via websocket:', error);
        if (callback) {
          callback({
            success: false,
            error: error.message
          });
        }
      }
    });

    /**
     * Cliente se une a una sesión de chat existente
     */
    socket.on('join_chat_session', (data, callback) => {
      try {
        const { sessionId } = data;
        
        if (!sessionId) {
          throw new Error('Session ID is required');
        }

        const session = chatService.getSession(sessionId);
        
        if (!session) {
          throw new Error('Chat session not found');
        }

        // Unir el socket a la sala de la sesión
        socket.join(`session_${sessionId}`);
        socket.currentSessionId = sessionId;

        logger.logChatActivity(sessionId, 'websocket_session_joined', {
          socketId: socket.id,
          userId: socket.userId
        });

        if (callback) {
          callback({
            success: true,
            data: {
              sessionId: sessionId,
              messageCount: session.messages.length,
              isActive: session.isActive
            }
          });
        }

      } catch (error) {
        logger.error('Error joining chat session via websocket:', error);
        if (callback) {
          callback({
            success: false,
            error: error.message
          });
        }
      }
    });

    /**
     * Cliente envía un mensaje
     */
    socket.on('send_message', async (data, callback) => {
      try {
        const { sessionId, message, maxResults = 5 } = data;

        if (!sessionId || !message) {
          throw new Error('Session ID and message are required');
        }

        if (message.trim().length === 0 || message.length > 1000) {
          throw new Error('Message must be between 1 and 1000 characters');
        }

        logger.logChatActivity(sessionId, 'websocket_message_received', {
          socketId: socket.id,
          messageLength: message.length
        });

        // Emitir evento de "typing" para mostrar que se está procesando
        socket.to(`session_${sessionId}`).emit('assistant_typing', {
          sessionId: sessionId,
          isTyping: true
        });

        // Procesar el mensaje usando el servicio de chat
        const response = await chatService.processMessage(sessionId, message, { maxResults });

        // Detener indicador de "typing"
        socket.to(`session_${sessionId}`).emit('assistant_typing', {
          sessionId: sessionId,
          isTyping: false
        });

        // Emitir la respuesta a todos los clientes en la sesión
        io.to(`session_${sessionId}`).emit('new_message', {
          sessionId: sessionId,
          message: {
            id: response.messageId,
            role: 'assistant',
            content: response.response,
            timestamp: response.timestamp,
            sources: response.sources,
            confidence: response.confidence,
            intent: response.intent
          }
        });

        logger.logChatActivity(sessionId, 'websocket_message_processed', {
          socketId: socket.id,
          intent: response.intent?.categoria,
          confidence: response.confidence,
          sourcesCount: response.sources.length
        });

        if (callback) {
          callback({
            success: true,
            data: response
          });
        }

      } catch (error) {
        logger.error('Error processing message via websocket:', error);
        
        // Detener indicador de "typing" en caso de error
        if (data.sessionId) {
          socket.to(`session_${data.sessionId}`).emit('assistant_typing', {
            sessionId: data.sessionId,
            isTyping: false
          });
        }

        if (callback) {
          callback({
            success: false,
            error: error.message
          });
        }

        // Emitir error a la sesión
        if (data.sessionId) {
          socket.to(`session_${data.sessionId}`).emit('chat_error', {
            sessionId: data.sessionId,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    /**
     * Cliente solicita el historial de mensajes
     */
    socket.on('get_message_history', (data, callback) => {
      try {
        const { sessionId, limit = 50 } = data;

        if (!sessionId) {
          throw new Error('Session ID is required');
        }

        const session = chatService.getSession(sessionId);
        
        if (!session) {
          throw new Error('Chat session not found');
        }

        const messages = session.messages
          .slice(-limit)
          .map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            sources: msg.sources,
            intent: msg.intent
          }));

        if (callback) {
          callback({
            success: true,
            data: {
              messages: messages,
              sessionId: sessionId,
              total: session.messages.length
            }
          });
        }

      } catch (error) {
        logger.error('Error getting message history via websocket:', error);
        if (callback) {
          callback({
            success: false,
            error: error.message
          });
        }
      }
    });

    /**
     * Cliente termina la sesión de chat
     */
    socket.on('end_chat_session', (data, callback) => {
      try {
        const { sessionId } = data;

        if (!sessionId) {
          throw new Error('Session ID is required');
        }

        const success = chatService.endChatSession(sessionId);

        if (!success) {
          throw new Error('Chat session not found or already ended');
        }

        // Emitir a todos los clientes en la sesión que la sesión terminó
        io.to(`session_${sessionId}`).emit('session_ended', {
          sessionId: sessionId,
          timestamp: new Date().toISOString()
        });

        logger.logChatActivity(sessionId, 'websocket_session_ended', {
          socketId: socket.id,
          userId: socket.userId
        });

        if (callback) {
          callback({
            success: true,
            data: {
              message: 'Chat session ended successfully',
              sessionId: sessionId
            }
          });
        }

      } catch (error) {
        logger.error('Error ending chat session via websocket:', error);
        if (callback) {
          callback({
            success: false,
            error: error.message
          });
        }
      }
    });

    /**
     * Cliente se desconecta
     */
    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', {
        socketId: socket.id,
        userId: socket.userId,
        sessionId: socket.currentSessionId,
        reason: reason
      });

      // Opcionalmente, podrías marcar al usuario como "offline" en la sesión
      if (socket.currentSessionId) {
        socket.to(`session_${socket.currentSessionId}`).emit('user_disconnected', {
          sessionId: socket.currentSessionId,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Manejo de errores del socket
     */
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId: socket.userId,
        sessionId: socket.currentSessionId,
        error: error.message
      });
    });

    // Emitir evento de conexión exitosa
    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      message: 'Connected to chat service'
    });
  });

  // Manejo de errores globales de Socket.IO
  io.engine.on('connection_error', (err) => {
    logger.error('Socket.IO connection error', {
      error: err.message,
      code: err.code,
      description: err.description,
      context: err.context,
      type: err.type
    });
  });

  logger.info('Chat WebSocket service initialized');
}

module.exports = initializeChatSocket;
