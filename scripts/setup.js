const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const vectorDB = require('../src/config/database');
const logger = require('../src/utils/logger');

async function setupSystem() {
    console.log('🚀 Configurando Sistema RAG para Atención al Cliente...\n');

    try {
        // 1. Verificar variables de entorno
        console.log('1. Verificando configuración...');
        const requiredEnvVars = [
            'OPENAI_API_KEY',
            'PINECONE_API_KEY',
            'JWT_SECRET'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.error('❌ Variables de entorno faltantes:');
            missingVars.forEach(varName => {
                console.error(`   - ${varName}`);
            });
            console.error('\n📝 Por favor, completa el archivo .env con todas las variables requeridas.');
            process.exit(1);
        }
        console.log('   ✅ Todas las variables de entorno están configuradas');

        // 2. Crear directorios necesarios
        console.log('\n2. Creando directorios...');
        const directories = ['uploads', 'logs'];
        
        for (const dir of directories) {
            const dirPath = path.join(__dirname, '..', dir);
            try {
                await fs.access(dirPath);
                console.log(`   ✅ Directorio ${dir} ya existe`);
            } catch {
                await fs.mkdir(dirPath, { recursive: true });
                console.log(`   ✅ Directorio ${dir} creado`);
            }
        }

        // 3. Inicializar base de datos vectorial
        console.log('\n3. Inicializando base de datos vectorial...');
        const dbInitialized = await vectorDB.initialize();
        
        if (!dbInitialized) {
            console.error('   ❌ Error inicializando Pinecone');
            console.error('   📝 Verifica tu PINECONE_API_KEY y configuración');
            process.exit(1);
        }
        console.log('   ✅ Base de datos vectorial inicializada');

        // 4. Verificar conexión con OpenAI
        console.log('\n4. Verificando conexión con OpenAI...');
        try {
            const OpenAI = require('openai');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            
            // Hacer una llamada simple para verificar la conexión
            await openai.embeddings.create({
                model: 'text-embedding-ada-002',
                input: 'test connection'
            });
            console.log('   ✅ Conexión con OpenAI verificada');
        } catch (error) {
            console.error('   ❌ Error conectando con OpenAI:', error.message);
            console.error('   📝 Verifica tu OPENAI_API_KEY');
            process.exit(1);
        }

        // 5. Crear archivo de configuración de ejemplo
        console.log('\n5. Creando documentos de ejemplo...');
        const exampleDocs = [
            {
                filename: 'horarios_atencion.txt',
                content: `HORARIOS DE ATENCIÓN AL CLIENTE

Nuestro equipo de atención al cliente está disponible en los siguientes horarios:

HORARIOS REGULARES:
- Lunes a Viernes: 8:00 AM - 8:00 PM
- Sábados: 9:00 AM - 5:00 PM
- Domingos: 10:00 AM - 3:00 PM

HORARIOS FESTIVOS:
Durante los días festivos nacionales, nuestros horarios pueden verse modificados. 
Por favor, consulta nuestro sitio web para horarios específicos durante fechas especiales.

CANALES DE CONTACTO:
- Chat en línea: Disponible durante horarios regulares
- Email: support@empresa.com (respuesta en 24 horas)
- Teléfono: +1-800-123-4567
- WhatsApp: +1-800-123-4567

SOPORTE URGENTE:
Para emergencias fuera de horario, contáctanos por email marcando como "URGENTE" en el asunto.`
            },
            {
                filename: 'politicas_devolucion.txt',
                content: `POLÍTICAS DE DEVOLUCIÓN Y REEMBOLSO

PERÍODO DE DEVOLUCIÓN:
- Productos físicos: 30 días desde la fecha de recepción
- Productos digitales: 14 días desde la fecha de compra
- Servicios: 7 días desde la contratación

CONDICIONES PARA DEVOLUCIÓN:
1. El producto debe estar en su estado original
2. Debe incluir todos los accesorios y documentación
3. El empaque original debe estar en buenas condiciones
4. Presentar comprobante de compra

PROCESO DE DEVOLUCIÓN:
1. Contactar a atención al cliente
2. Obtener número de autorización de devolución (RMA)
3. Empacar el producto siguiendo las instrucciones
4. Enviar a la dirección proporcionada

REEMBOLSOS:
- Los reembolsos se procesan en 5-7 días hábiles
- Se reembolsará el monto pagado menos gastos de envío
- Para compras con tarjeta de crédito, puede tomar hasta 2 ciclos de facturación

EXCEPCIONES:
- Productos personalizados no son elegibles para devolución
- Productos en oferta final sale no son reembolsables
- Productos dañados por mal uso no califican para reembolso`
            },
            {
                filename: 'soporte_tecnico.txt',
                content: `GUÍA DE SOPORTE TÉCNICO

PROBLEMAS COMUNES Y SOLUCIONES:

1. PROBLEMAS DE ACCESO:
   - Verificar usuario y contraseña
   - Intentar restablecer contraseña
   - Limpiar caché y cookies del navegador
   - Probar en modo incógnito

2. PROBLEMAS DE RENDIMIENTO:
   - Verificar conexión a internet
   - Cerrar otras aplicaciones
   - Actualizar navegador web
   - Reiniciar dispositivo

3. ERRORES DE PAGO:
   - Verificar datos de tarjeta
   - Confirmar fondos disponibles
   - Probar con otro método de pago
   - Contactar al banco emisor

4. PROBLEMAS DE SINCRONIZACIÓN:
   - Verificar conexión estable
   - Forzar sincronización manual
   - Cerrar y reabrir aplicación
   - Verificar espacio de almacenamiento

ESCALAMIENTO DE SOPORTE:
- Nivel 1: Chat en línea o email
- Nivel 2: Llamada telefónica con especialista
- Nivel 3: Sesión de soporte remoto
- Nivel 4: Visita técnica en sitio (casos especiales)

INFORMACIÓN NECESARIA PARA SOPORTE:
- Descripción detallada del problema
- Pasos para reproducir el error
- Sistema operativo y versión
- Navegador web utilizado
- Capturas de pantalla del error`
            }
        ];

        const examplesDir = path.join(__dirname, '..', 'uploads', 'examples');
        try {
            await fs.mkdir(examplesDir, { recursive: true });
        } catch {}

        for (const doc of exampleDocs) {
            const filePath = path.join(examplesDir, doc.filename);
            await fs.writeFile(filePath, doc.content, 'utf8');
            console.log(`   ✅ Documento ejemplo creado: ${doc.filename}`);
        }

        // 6. Información final
        console.log('\n🎉 ¡Configuración completada exitosamente!');
        console.log('\n📋 PRÓXIMOS PASOS:');
        console.log('1. Ejecutar: npm run dev');
        console.log('2. Abrir: http://localhost:3000');
        console.log('3. Iniciar sesión con:');
        console.log('   - Usuario: admin');
        console.log('   - Contraseña: admin123');
        console.log('4. Subir documentos desde el panel de administración');
        console.log('5. ¡Comenzar a chatear con tu asistente!');
        
        console.log('\n⚠️  IMPORTANTE PARA PRODUCCIÓN:');
        console.log('- Cambia la contraseña del administrador');
        console.log('- Usa un JWT_SECRET más seguro');
        console.log('- Configura HTTPS');
        console.log('- Ajusta los rate limits según tu uso');

        console.log('\n📚 Los documentos de ejemplo están en: uploads/examples/');
        console.log('   Puedes subirlos desde el panel de admin para comenzar a probar.');

    } catch (error) {
        console.error('\n❌ Error durante la configuración:', error.message);
        logger.error('Setup error:', error);
        process.exit(1);
    }
}

// Ejecutar setup si es llamado directamente
if (require.main === module) {
    setupSystem();
}

module.exports = setupSystem;
