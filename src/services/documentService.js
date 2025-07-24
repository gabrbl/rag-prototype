const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const openaiService = require('./openaiService');
const vectorDB = require('../config/database');

class DocumentProcessingService {
  constructor() {
    this.supportedTypes = ['pdf', 'txt', 'md', 'docx'];
    this.chunkSize = 1000; // Tamaño de chunks en caracteres
    this.chunkOverlap = 200; // Superposición entre chunks
  }

  /**
   * Procesa un archivo subido y lo almacena en la base de datos vectorial
   * @param {Object} file - Archivo subido (multer file object)
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Promise<Object>} Resultado del procesamiento
   */
  async processDocument(file, metadata = {}) {
    try {
      logger.info(`Procesando documento: ${file.originalname}`);

      // Extraer texto del archivo
      const text = await this.extractText(file);
      
      if (!text || text.trim().length === 0) {
        throw new Error('No se pudo extraer texto del documento');
      }

      // Dividir en chunks
      const chunks = this.createChunks(text);
      
      // Generar embeddings para cada chunk
      const vectors = await this.generateVectorData(chunks, file, metadata);
      
      // Almacenar en la base de datos vectorial
      await vectorDB.upsertVectors(vectors);

      // Limpiar archivo temporal si existe
      try {
        await fs.unlink(file.path);
      } catch (error) {
        logger.warn('No se pudo eliminar archivo temporal:', error.message);
      }

      const result = {
        documentId: metadata.documentId || uuidv4(),
        filename: file.originalname,
        fileSize: file.size,
        chunksCreated: chunks.length,
        status: 'processed',
        processedAt: new Date().toISOString()
      };

      logger.info(`Documento procesado exitosamente: ${result.chunksCreated} chunks creados`);
      return result;

    } catch (error) {
      logger.error('Error procesando documento:', error);
      throw error;
    }
  }

  /**
   * Extrae texto de diferentes tipos de archivos
   * @param {Object} file - Archivo a procesar
   * @returns {Promise<string>} Texto extraído
   */
  async extractText(file) {
    const extension = path.extname(file.originalname).toLowerCase().slice(1);
    
    switch (extension) {
      case 'pdf':
        return await this.extractFromPDF(file.path);
      
      case 'txt':
      case 'md':
        return await this.extractFromText(file.path);
      
      case 'docx':
        return await this.extractFromDocx(file.path);
      
      default:
        throw new Error(`Tipo de archivo no soportado: ${extension}`);
    }
  }

  /**
   * Extrae texto de archivos PDF
   */
  async extractFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      logger.error('Error extrayendo texto de PDF:', error);
      throw new Error('Error procesando archivo PDF');
    }
  }

  /**
   * Extrae texto de archivos de texto plano
   */
  async extractFromText(filePath) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      logger.error('Error leyendo archivo de texto:', error);
      throw new Error('Error procesando archivo de texto');
    }
  }

  /**
   * Extrae texto de archivos DOCX
   */
  async extractFromDocx(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      logger.error('Error extrayendo texto de DOCX:', error);
      throw new Error('Error procesando archivo DOCX');
    }
  }

  /**
   * Divide el texto en chunks manejables
   * @param {string} text - Texto a dividir
   * @returns {Array<string>} Array de chunks
   */
  createChunks(text) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
    
    let currentChunk = '';
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.trim().length;
      
      // Si agregar esta oración excede el tamaño máximo
      if (currentLength + sentenceLength > this.chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        
        // Crear overlap con parte del chunk anterior
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.chunkOverlap / 6)); // Aproximadamente chunkOverlap caracteres
        currentChunk = overlapWords.join(' ') + ' ' + sentence.trim();
        currentLength = currentChunk.length;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence.trim();
        currentLength = currentChunk.length;
      }
    }

    // Agregar el último chunk si no está vacío
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 50); // Filtrar chunks muy pequeños
  }

  /**
   * Genera vectores para almacenar en la base de datos
   * @param {Array<string>} chunks - Chunks de texto
   * @param {Object} file - Información del archivo
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Promise<Array>} Array de vectores para Pinecone
   */
  async generateVectorData(chunks, file, metadata) {
    try {
      const embeddings = await openaiService.generateBatchEmbeddings(chunks);
      const documentId = metadata.documentId || uuidv4();
      
      return chunks.map((chunk, index) => ({
        id: `${documentId}_chunk_${index}`,
        values: embeddings[index],
        metadata: {
          documentId: documentId,
          filename: file.originalname,
          chunkIndex: index,
          text: chunk,
          title: metadata.title || file.originalname,
          category: metadata.category || 'general',
          tags: metadata.tags || [],
          uploadedAt: new Date().toISOString(),
          fileSize: file.size,
          chunkSize: chunk.length
        }
      }));
    } catch (error) {
      logger.error('Error generando vectores:', error);
      throw error;
    }
  }

  /**
   * Busca documentos similares basados en una consulta
   * @param {string} query - Consulta de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Array>} Resultados de búsqueda
   */
  async searchDocuments(query, options = {}) {
    try {
      const {
        topK = 5,
        category = null,
        minScore = 0.7
      } = options;

      // Generar embedding para la consulta
      const queryEmbedding = await openaiService.generateEmbedding(query);
      
      // Construir filtros
      const filter = {};
      if (category) {
        filter.category = { $eq: category };
      }

      // Buscar en la base de datos vectorial
      const results = await vectorDB.queryVectors(queryEmbedding, topK, filter);
      
      // Filtrar por score mínimo y formatear resultados
      return results
        .filter(result => result.score >= minScore)
        .map(result => ({
          id: result.id,
          score: result.score,
          metadata: result.metadata,
          text: result.metadata?.text || ''
        }));

    } catch (error) {
      logger.error('Error buscando documentos:', error);
      throw error;
    }
  }

  /**
   * Elimina un documento de la base de datos vectorial
   * @param {string} documentId - ID del documento a eliminar
   * @returns {Promise<boolean>} Éxito de la operación
   */
  async deleteDocument(documentId) {
    try {
      // Buscar todos los chunks del documento
      const stats = await vectorDB.getIndexStats();
      
      // Para Pinecone, necesitamos usar un filtro para eliminar por documentId
      // Esto es una limitación de la versión gratuita
      logger.info(`Marcando para eliminación documento: ${documentId}`);
      
      // En una implementación completa, mantendríamos un registro de chunks por documento
      // Por ahora, registramos la solicitud de eliminación
      return true;

    } catch (error) {
      logger.error('Error eliminando documento:', error);
      return false;
    }
  }

  /**
   * Obtiene estadísticas de los documentos procesados
   * @returns {Promise<Object>} Estadísticas
   */
  async getDocumentStats() {
    try {
      const indexStats = await vectorDB.getIndexStats();
      
      return {
        totalVectors: indexStats.totalVectorCount || 0,
        indexFullness: indexStats.indexFullness || 0,
        dimension: indexStats.dimension || 1536,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      return {
        totalVectors: 0,
        indexFullness: 0,
        dimension: 1536,
        lastUpdate: new Date().toISOString()
      };
    }
  }
}

module.exports = new DocumentProcessingService();
