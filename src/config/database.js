const { Pinecone } = require('@pinecone-database/pinecone');
const logger = require('../utils/logger');

class VectorDatabase {
  constructor() {
    this.pinecone = null;
    this.index = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!process.env.PINECONE_API_KEY) {
        throw new Error('PINECONE_API_KEY no está configurado');
      }

      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });

      // Verificar si el índice existe
      const indexName = process.env.PINECONE_INDEX_NAME || 'customer-support-rag';
      
      try {
        this.index = this.pinecone.index(indexName);
        
        // Probar la conexión
        await this.index.describeIndexStats();
        logger.info(`✅ Conectado a Pinecone index: ${indexName}`);
        
      } catch (error) {
        logger.warn(`Index ${indexName} no existe. Creándolo...`);
        
        // Crear el índice si no existe
        await this.pinecone.createIndex({
          name: indexName,
          dimension: 1536, // Dimensión para text-embedding-ada-002
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });

        // Esperar a que el índice esté listo
        let ready = false;
        while (!ready) {
          const description = await this.pinecone.describeIndex(indexName);
          ready = description.status?.ready;
          if (!ready) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        this.index = this.pinecone.index(indexName);
        logger.info(`✅ Index ${indexName} creado y listo`);
      }

      this.initialized = true;
      return true;

    } catch (error) {
      logger.error('Error inicializando Pinecone:', error);
      return false;
    }
  }

  async upsertVectors(vectors) {
    if (!this.initialized || !this.index) {
      throw new Error('Vector database no está inicializada');
    }

    try {
      const response = await this.index.upsert(vectors);
      logger.info(`Vectores insertados: ${vectors.length}`);
      return response;
    } catch (error) {
      logger.error('Error insertando vectores:', error);
      throw error;
    }
  }

  async queryVectors(vector, topK = 5, filter = {}) {
    if (!this.initialized || !this.index) {
      throw new Error('Vector database no está inicializada');
    }

    try {
      const queryRequest = {
        vector: vector,
        topK: topK,
        includeMetadata: true,
        includeValues: false
      };

      if (Object.keys(filter).length > 0) {
        queryRequest.filter = filter;
      }

      const response = await this.index.query(queryRequest);
      return response.matches || [];
    } catch (error) {
      logger.error('Error consultando vectores:', error);
      throw error;
    }
  }

  async deleteVectors(ids) {
    if (!this.initialized || !this.index) {
      throw new Error('Vector database no está inicializada');
    }

    try {
      await this.index.deleteOne(ids);
      logger.info(`Vectores eliminados: ${ids.length}`);
    } catch (error) {
      logger.error('Error eliminando vectores:', error);
      throw error;
    }
  }

  async getIndexStats() {
    if (!this.initialized || !this.index) {
      throw new Error('Vector database no está inicializada');
    }

    try {
      return await this.index.describeIndexStats();
    } catch (error) {
      logger.error('Error obteniendo estadísticas del índice:', error);
      throw error;
    }
  }
}

// Singleton instance
const vectorDB = new VectorDatabase();

module.exports = vectorDB;
