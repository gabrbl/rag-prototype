# Sistema RAG para Atención al Cliente

Un sistema completo de **Retrieval-Augmented Generation (RAG)** para atención al cliente, construido con Node.js. Permite cargar documentos de la empresa y proporcionar respuestas inteligentes a las consultas de los clientes usando IA.

<!-- ![Estado del Proyecto](https://img.shields.io/badge/Estado-Listo%20para%20Producción-green)
![Node.js](https://img.shields.io/badge/Node.js-18+-blue)
![License](https://img.shields.io/badge/License-MIT-yellow) -->

## Características Principales

### IA Avanzada
- **Procesamiento de documentos** automático (PDF, TXT, MD, DOCX)
- **Búsqueda vectorial** inteligente con Pinecone
- **Generación de respuestas** contextual con OpenAI GPT
- **Clasificación de intenciones** automática
- **Métricas de confianza** en las respuestas

### Chat en Tiempo Real
- **WebSockets** con Socket.io para chat instantáneo
- **Historial de conversaciones** persistente
- **Indicadores de escritura** en tiempo real
- **Acciones rápidas** predefinidas
- **Soporte para múltiples sesiones**

### Seguridad y Administración
- **Autenticación JWT** con roles (usuario/admin)
- **Rate limiting** avanzado por endpoint
- **Panel de administración** completo
- **Logging detallado** con Winston
- **Validación de entrada** robusta

### Interfaz Moderna
- **Diseño responsivo** con Tailwind CSS
- **Interfaz intuitiva** para chat
- **Panel de administración** con métricas
- **Notificaciones en tiempo real**
- **Indicadores de estado** del sistema

## Requisitos Previos

- **Node.js** 18+ 
- **Cuenta de OpenAI** con API key
- **Cuenta de Pinecone** con API key (plan gratuito disponible)
- **Git** para clonar el repositorio

## Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <url-del-repositorio>
   cd rag-customer-support
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   ```
   
   Editar `.env` con tus claves:
   ```env
   # OpenAI Configuration
   OPENAI_API_KEY=tu_openai_api_key_aqui
   
   # Pinecone Configuration
   PINECONE_API_KEY=tu_pinecone_api_key_aqui
   
   # JWT Secret (generar uno seguro)
   JWT_SECRET=tu_jwt_secret_super_seguro_aqui
   ```

4. **Inicializar base de datos vectorial**
   ```bash
   npm run setup
   ```

5. **Iniciar el servidor**
   ```bash
   # Desarrollo
   npm run dev
   
   # Producción
   npm start
   ```

6. **Abrir en el navegador**
   ```
   http://localhost:3000
   ```

## Uso del Sistema

### Para Usuarios Finales

1. **Abrir la aplicación** en el navegador
2. **Iniciar una conversación** escribiendo en el chat
3. **Hacer preguntas** sobre productos, servicios, soporte, etc.
4. **Recibir respuestas** inteligentes basadas en la documentación

### Para Administradores

1. **Iniciar sesión** con credenciales de admin
   - Usuario: `admin`
   - Contraseña: `admin123` (cambiar en producción)

2. **Subir documentos** desde el panel de administración
   - Formatos soportados: PDF, TXT, MD, DOCX
   - Categorización automática disponible

3. **Monitorear el sistema**
   - Ver estadísticas de uso
   - Revisar sesiones de chat
   - Consultar logs del sistema

## Estructura del Proyecto

```
├── src/
│   ├── config/           # Configuraciones
│   │   └── database.js   # Conexión a Pinecone
│   ├── middleware/       # Middleware
│   │   ├── auth.js       # Autenticación JWT
│   │   ├── rateLimiter.js # Rate limiting
│   │   └── errorHandler.js # Manejo de errores
│   ├── routes/           # Rutas de API
│   │   ├── auth.js       # Autenticación
│   │   ├── chat.js       # Chat y mensajes
│   │   ├── documents.js  # Gestión de documentos
│   │   └── admin.js      # Panel de administración
│   ├── services/         # Servicios principales
│   │   ├── chatService.js     # Lógica de chat
│   │   ├── documentService.js # Procesamiento docs
│   │   ├── openaiService.js   # Integración OpenAI
│   │   └── chatSocket.js      # WebSockets
│   └── utils/
│       └── logger.js     # Sistema de logging
├── public/               # Frontend
│   ├── index.html       # Interfaz principal
│   └── js/
│       └── app.js       # Aplicación frontend
├── uploads/             # Archivos subidos
├── logs/               # Logs del sistema
└── server.js           # Servidor principal
```

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario
- `GET /api/auth/me` - Información del usuario

### Chat
- `POST /api/chat/session` - Crear sesión de chat
- `POST /api/chat/message` - Enviar mensaje
- `GET /api/chat/sessions` - Listar sesiones

### Documentos
- `POST /api/documents/upload` - Subir documento
- `GET /api/documents/search` - Buscar en documentos
- `GET /api/documents/stats` - Estadísticas

### Administración
- `GET /api/admin/dashboard` - Dashboard
- `GET /api/admin/users` - Gestión de usuarios
- `GET /api/admin/system/health` - Estado del sistema

## Despliegue en Producción

### Variables de Entorno Importantes
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=clave_super_segura_para_produccion
OPENAI_API_KEY=tu_clave_openai
PINECONE_API_KEY=tu_clave_pinecone
PINECONE_ENVIRONMENT=tu_environment_pinecone
```

### Recomendaciones de Seguridad

1. **Cambiar credenciales por defecto**
   - Cambiar contraseña del admin
   - Usar JWT secret fuerte

2. **Configurar HTTPS**
   - Usar reverse proxy (nginx)
   - Certificados SSL/TLS

3. **Rate Limiting**
   - Ajustar límites según necesidades
   - Monitorear intentos de abuso

4. **Backup de datos**
   - Respaldar índices de Pinecone
   - Guardar logs importantes

## Contribuir

1. Fork del proyecto
2. Crear rama para feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit de cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## Soporte

Si encuentras algún problema o tienes preguntas:

1. **Revisa los logs** en `logs/app.log`
2. **Verifica la configuración** en `.env`
3. **Consulta la documentación** de OpenAI y Pinecone
4. **Crea un issue** en el repositorio

## Roadmap

- [ ] Base de datos SQL para persistencia
- [ ] Integración con más proveedores de IA
- [ ] Análisis de sentimientos
- [ ] Exportación de conversaciones
- [ ] API de métricas avanzadas
- [ ] Modo multi-idioma
- [ ] Integración con CRM

---
