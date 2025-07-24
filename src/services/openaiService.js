const OpenAI = require('openai');
const logger = require('../utils/logger');

class OpenAIService {
  constructor() {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY no está configurado en las variables de entorno');
      }

      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      this.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
      this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
      
      logger.info('OpenAI service initialized successfully');
    } catch (error) {
      logger.error('Error initializing OpenAI service:', error);
      throw error;
    }
  }

  /**
   * Genera embeddings para texto usando OpenAI
   * @param {string} text - Texto para generar embedding
   * @returns {Promise<Array>} Vector de embedding
   */
  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generando embedding:', error);
      throw new Error(`Error generando embedding: ${error.message}`);
    }
  }

  /**
   * Genera embeddings para múltiples textos
   * @param {Array<string>} texts - Array de textos
   * @returns {Promise<Array>} Array de vectores de embedding
   */
  async generateBatchEmbeddings(texts) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: texts,
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      logger.error('Error generando embeddings en lote:', error);
      throw new Error(`Error generando embeddings: ${error.message}`);
    }
  }

  /**
   * Genera respuesta usando RAG (Retrieval-Augmented Generation)
   * @param {string} query - Pregunta del usuario
   * @param {Array} context - Contexto relevante obtenido de la búsqueda
   * @param {Array} chatHistory - Historial de conversación
   * @returns {Promise<string>} Respuesta generada
   */
  async generateRAGResponse(query, context, chatHistory = []) {
    try {
      // Construir el contexto desde los documentos relevantes
      const contextText = context
        .map(item => `Documento: ${item.metadata?.title || 'Sin título'}\nContenido: ${item.metadata?.text || ''}`)
        .join('\n\n');

      // Construir el historial de chat
      const chatHistoryText = chatHistory
        .slice(-10) // Solo los últimos 10 mensajes
        .map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}`)
        .join('\n');

      const systemPrompt = `Eres un asistente de atención al cliente especializado y útil. Tu objetivo es proporcionar respuestas precisas y útiles basándote en la información de la base de conocimientos de la empresa.

INSTRUCCIONES:
1. Usa SOLO la información proporcionada en el contexto para responder
2. Si no tienes información suficiente, indícalo claramente
3. Sé conciso pero completo en tus respuestas
4. Mantén un tono profesional y amigable
5. Si la pregunta no está relacionada con atención al cliente, redirige cortésmente
6. Considera el historial de conversación para mantener contexto

CONTEXTO DE LA BASE DE CONOCIMIENTOS:
${contextText}

${chatHistoryText ? `HISTORIAL DE CONVERSACIÓN RECIENTE:\n${chatHistoryText}\n` : ''}

Responde de manera útil y precisa a la siguiente consulta del cliente:`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: 500,
        temperature: 0.3,
        top_p: 0.9,
      });

      return response.choices[0].message.content.trim();

    } catch (error) {
      logger.error('Error generando respuesta RAG:', error);
      throw new Error(`Error generando respuesta: ${error.message}`);
    }
  }

  /**
   * Genera un resumen de un documento
   * @param {string} text - Texto del documento
   * @param {number} maxLength - Longitud máxima del resumen
   * @returns {Promise<string>} Resumen generado
   */
  async generateSummary(text, maxLength = 200) {
    try {
      const prompt = `Resume el siguiente texto en español, manteniendo los puntos clave y información importante. El resumen debe ser claro y conciso, máximo ${maxLength} palabras:\n\n${text}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: Math.floor(maxLength * 1.5),
        temperature: 0.3,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Error generando resumen:', error);
      throw new Error(`Error generando resumen: ${error.message}`);
    }
  }

  /**
   * Clasifica la intención de una consulta de cliente
   * @param {string} query - Consulta del cliente
   * @returns {Promise<Object>} Clasificación con categoría y confianza
   */
  async classifyIntent(query) {
    try {
      const prompt = `Clasifica la siguiente consulta de atención al cliente en una de estas categorías:
- soporte_tecnico: Problemas técnicos, errores, configuración
- facturacion: Preguntas sobre facturas, pagos, precios
- producto_info: Información sobre productos o servicios
- cuenta_usuario: Gestión de cuenta, perfil, acceso
- devolucion_reembolso: Devoluciones, reembolsos, garantías
- general: Consultas generales que no encajan en otras categorías

Responde solo con el formato JSON: {"categoria": "nombre_categoria", "confianza": 0.95}

Consulta: "${query}"`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.1,
      });

      try {
        return JSON.parse(response.choices[0].message.content.trim());
      } catch (parseError) {
        logger.warn('Error parseando clasificación de intención:', parseError);
        return { categoria: 'general', confianza: 0.5 };
      }

    } catch (error) {
      logger.error('Error clasificando intención:', error);
      return { categoria: 'general', confianza: 0.0 };
    }
  }
}

module.exports = new OpenAIService();
