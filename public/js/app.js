// Sistema RAG - Aplicación Frontend
class RAGChatApp {
    constructor() {
        this.socket = null;
        this.currentSession = null;
        this.isConnected = false;
        this.user = null;
        this.token = null;
        
        this.initializeApp();
    }

    initializeApp() {
        this.initializeSocket();
        this.setupEventListeners();
        this.loadUserSession();
        this.createNewSession();
        
        console.log('🚀 Sistema RAG inicializado');
    }

    // === CONEXIÓN WEBSOCKET ===
    initializeSocket() {
        this.socket = io({
            auth: {
                userId: this.user?.id || null,
                sessionId: this.currentSession?.sessionId || null
            }
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            console.log('✅ Conectado al servidor');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            console.log('❌ Desconectado del servidor');
        });

        this.socket.on('connected', (data) => {
            console.log('Conexión establecida:', data);
        });

        this.socket.on('new_message', (data) => {
            this.handleNewMessage(data);
        });

        this.socket.on('assistant_typing', (data) => {
            this.showTypingIndicator(data.isTyping);
        });

        this.socket.on('chat_error', (data) => {
            this.showError('Error en el chat: ' + data.error);
        });

        this.socket.on('session_ended', (data) => {
            this.showNotification('La sesión de chat ha terminado', 'info');
        });
    }

    // === GESTIÓN DE SESIONES ===
    createNewSession() {
        if (!this.socket || !this.isConnected) {
            setTimeout(() => this.createNewSession(), 1000);
            return;
        }

        this.socket.emit('create_chat_session', {
            metadata: {
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            }
        }, (response) => {
            if (response.success) {
                this.currentSession = response.data;
                this.updateSessionInfo();
                this.clearChat();
                console.log('Nueva sesión creada:', this.currentSession.sessionId);
            } else {
                this.showError('Error creando sesión: ' + response.error);
            }
        });
    }

    // === MANEJO DE MENSAJES ===
    sendMessage(message) {
        if (!message.trim() || !this.currentSession) {
            return;
        }

        // Agregar mensaje del usuario al chat
        this.addMessageToChat('user', message);

        // Mostrar indicador de escritura
        this.showTypingIndicator(true);

        // Enviar mensaje via WebSocket
        this.socket.emit('send_message', {
            sessionId: this.currentSession.sessionId,
            message: message.trim(),
            maxResults: 5
        }, (response) => {
            this.showTypingIndicator(false);
            
            if (!response.success) {
                this.showError('Error enviando mensaje: ' + response.error);
                // Remover el mensaje del usuario si hubo error
                this.removeLastUserMessage();
            }
            // La respuesta del asistente llegará via evento 'new_message'
        });

        // Limpiar input
        this.clearMessageInput();
    }

    handleNewMessage(data) {
        if (data.message.role === 'assistant') {
            this.addMessageToChat('assistant', data.message.content, {
                sources: data.message.sources,
                confidence: data.message.confidence,
                intent: data.message.intent,
                timestamp: data.message.timestamp
            });
            
            // Reproducir sonido si está habilitado
            if (document.getElementById('soundEnabled').checked) {
                this.playNotificationSound();
            }
        }
    }

    addMessageToChat(role, content, metadata = {}) {
        const chatContainer = document.getElementById('chatContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message flex items-start space-x-3';

        const isUser = role === 'user';
        const time = metadata.timestamp ? new Date(metadata.timestamp).toLocaleTimeString() : 'Ahora';

        messageDiv.innerHTML = `
            <div class="flex-shrink-0">
                <div class="w-8 h-8 ${isUser ? 'bg-gray-600' : 'bg-blue-600'} rounded-full flex items-center justify-center">
                    <i class="fas ${isUser ? 'fa-user' : 'fa-robot'} text-white text-sm"></i>
                </div>
            </div>
            <div class="flex-1">
                <div class="bg-white rounded-lg shadow-sm p-4 border">
                    <p class="text-gray-800">${this.escapeHtml(content)}</p>
                    ${metadata.sources && metadata.sources.length > 0 ? this.renderSources(metadata.sources) : ''}
                    ${metadata.confidence ? this.renderConfidence(metadata.confidence) : ''}
                    <div class="text-xs text-gray-500 mt-2 flex items-center justify-between">
                        <span><i class="fas fa-clock"></i> ${time}</span>
                        ${metadata.intent ? `<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">${metadata.intent.categoria}</span>` : ''}
                    </div>
                </div>
            </div>
        `;

        chatContainer.appendChild(messageDiv);
        
        // Auto-scroll si está habilitado
        if (document.getElementById('autoScroll').checked) {
            this.scrollToBottom();
        }
        
        // Actualizar contador de mensajes
        this.updateMessageCount();
    }

    renderSources(sources) {
        if (!sources || sources.length === 0) return '';
        
        return `
            <div class="mt-3 p-2 bg-gray-50 rounded border-l-4 border-blue-500">
                <div class="text-xs font-medium text-gray-700 mb-2">Fuentes consultadas:</div>
                ${sources.map(source => `
                    <div class="text-xs text-gray-600 mb-1">
                        <i class="fas fa-file-alt text-blue-500"></i>
                        ${source.filename || 'Documento'}
                        <span class="text-gray-400">(relevancia: ${Math.round(source.score * 100)}%)</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderConfidence(confidence) {
        const percentage = Math.round(confidence * 100);
        const color = percentage >= 80 ? 'green' : percentage >= 60 ? 'yellow' : 'red';
        
        return `
            <div class="mt-2 flex items-center text-xs">
                <span class="text-gray-600 mr-2">Confianza:</span>
                <div class="w-16 bg-gray-200 rounded-full h-2">
                    <div class="bg-${color}-500 h-2 rounded-full" style="width: ${percentage}%"></div>
                </div>
                <span class="ml-2 text-gray-600">${percentage}%</span>
            </div>
        `;
    }

    // === UI HELPERS ===
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (connected) {
            statusElement.innerHTML = '<i class="fas fa-circle text-xs text-green-500"></i> Conectado';
            statusElement.className = 'text-sm text-green-600';
        } else {
            statusElement.innerHTML = '<i class="fas fa-circle text-xs text-red-500"></i> Desconectado';
            statusElement.className = 'text-sm text-red-600';
        }
    }

    updateSessionInfo() {
        if (this.currentSession) {
            document.getElementById('sessionId').textContent = this.currentSession.sessionId.substring(0, 8) + '...';
        }
    }

    updateMessageCount() {
        const messages = document.querySelectorAll('.chat-message').length - 1; // -1 para excluir mensaje de bienvenida
        document.getElementById('messageCount').textContent = Math.max(0, messages);
    }

    showTypingIndicator(show) {
        const indicator = document.getElementById('typingIndicator');
        if (show) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Crear notificación toast
        const toast = document.createElement('div');
        toast.className = `fixed top-20 right-4 p-4 rounded-lg shadow-lg z-50 ${
            type === 'error' ? 'bg-red-500 text-white' : 
            type === 'success' ? 'bg-green-500 text-white' : 
            'bg-blue-500 text-white'
        }`;
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${type === 'error' ? 'fa-exclamation-triangle' : type === 'success' ? 'fa-check' : 'fa-info-circle'} mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    clearChat() {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.innerHTML = `
            <div class="chat-message flex items-start space-x-3">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <i class="fas fa-robot text-white text-sm"></i>
                    </div>
                </div>
                <div class="flex-1">
                    <div class="bg-white rounded-lg shadow-sm p-4 border">
                        <p class="text-gray-800">${this.currentSession?.welcomeMessage || '¡Hola! Soy tu asistente virtual de atención al cliente. ¿En qué puedo ayudarte hoy?'}</p>
                        <div class="text-xs text-gray-500 mt-2">
                            <i class="fas fa-clock"></i> Ahora
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.updateMessageCount();
    }

    clearMessageInput() {
        const input = document.getElementById('messageInput');
        input.value = '';
        this.updateCharCount();
        this.updateSendButton();
    }

    scrollToBottom() {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    updateCharCount() {
        const input = document.getElementById('messageInput');
        const counter = document.getElementById('charCount');
        counter.textContent = input.value.length;
    }

    updateSendButton() {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        sendBtn.disabled = !input.value.trim() || !this.isConnected;
    }

    playNotificationSound() {
        // Crear un sonido simple usando Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('No se pudo reproducir sonido:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // === AUTENTICACIÓN ===
    loadUserSession() {
        const token = localStorage.getItem('rag_token');
        const user = localStorage.getItem('rag_user');
        
        if (token && user) {
            this.token = token;
            this.user = JSON.parse(user);
            this.updateAuthUI();
        }
    }

    async login(username, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.data.token;
                this.user = data.data.user;
                
                localStorage.setItem('rag_token', this.token);
                localStorage.setItem('rag_user', JSON.stringify(this.user));
                
                this.updateAuthUI();
                this.showNotification('Sesión iniciada correctamente', 'success');
                
                return true;
            } else {
                this.showError(data.error.message);
                return false;
            }
        } catch (error) {
            this.showError('Error de conexión al iniciar sesión');
            return false;
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('rag_token');
        localStorage.removeItem('rag_user');
        this.updateAuthUI();
        this.showNotification('Sesión cerrada', 'info');
    }

    updateAuthUI() {
        const loginBtn = document.getElementById('loginBtn');
        const adminBtn = document.getElementById('adminBtn');
        
        if (this.user) {
            loginBtn.innerHTML = `<i class="fas fa-user"></i> ${this.user.username}`;
            loginBtn.onclick = () => this.logout();
            
            if (this.user.role === 'admin') {
                adminBtn.classList.remove('hidden');
            }
        } else {
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
            loginBtn.onclick = () => this.showLoginModal();
            adminBtn.classList.add('hidden');
        }
    }

    // === MODALES ===
    showLoginModal() {
        document.getElementById('loginModal').classList.remove('hidden');
    }

    hideLoginModal() {
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('loginForm').reset();
    }

    async showAdminPanel() {
        if (!this.user || this.user.role !== 'admin') {
            this.showError('Acceso denegado');
            return;
        }

        try {
            const response = await fetch('/api/admin/dashboard', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('adminContent').innerHTML = this.renderAdminDashboard(data.data);
                document.getElementById('adminModal').classList.remove('hidden');
            } else {
                this.showError('Error cargando panel de administración');
            }
        } catch (error) {
            this.showError('Error de conexión al cargar admin panel');
        }
    }

    renderAdminDashboard(data) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Métricas generales -->
                <div class="bg-blue-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-blue-800">Usuarios</h4>
                    <div class="mt-2">
                        <div class="text-2xl font-bold text-blue-900">${data.overview.totalUsers}</div>
                        <div class="text-sm text-blue-600">Total de usuarios</div>
                        <div class="text-sm text-green-600 mt-1">${data.overview.activeUsers} activos</div>
                    </div>
                </div>
                
                <div class="bg-green-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-green-800">Documentos</h4>
                    <div class="mt-2">
                        <div class="text-2xl font-bold text-green-900">${data.overview.totalDocuments}</div>
                        <div class="text-sm text-green-600">Vectores almacenados</div>
                    </div>
                </div>
                
                <div class="bg-purple-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-purple-800">Chat</h4>
                    <div class="mt-2">
                        <div class="text-2xl font-bold text-purple-900">${data.overview.activeChatSessions}</div>
                        <div class="text-sm text-purple-600">Sesiones activas</div>
                        <div class="text-sm text-purple-600 mt-1">${data.overview.totalMessages} mensajes</div>
                    </div>
                </div>
            </div>
            
            <!-- Estado del sistema -->
            <div class="mt-6 bg-gray-50 p-4 rounded-lg">
                <h4 class="font-semibold text-gray-800 mb-3">Estado del Sistema</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600">Uptime:</span>
                        <span class="font-mono">${Math.floor(data.systemHealth.uptime / 3600)}h ${Math.floor((data.systemHealth.uptime % 3600) / 60)}m</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Memoria:</span>
                        <span class="font-mono">${Math.round(data.systemHealth.memoryUsage.heapUsed / 1024 / 1024)}MB</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Ambiente:</span>
                        <span class="font-mono">${data.systemHealth.environment}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Salud del índice:</span>
                        <span class="font-mono ${data.documentMetrics.indexHealth === 'good' ? 'text-green-600' : 'text-yellow-600'}">
                            ${data.documentMetrics.indexHealth}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    // === EVENT LISTENERS ===
    setupEventListeners() {
        // Input de mensaje
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('input', () => {
            this.updateCharCount();
            this.updateSendButton();
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage(messageInput.value);
            }
        });

        // Botón enviar
        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendMessage(messageInput.value);
        });

        // Botón limpiar
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearChat();
        });

        // Nueva sesión
        document.getElementById('newSessionBtn').addEventListener('click', () => {
            this.createNewSession();
        });

        // Acciones rápidas
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const message = btn.dataset.message;
                messageInput.value = message;
                this.updateCharCount();
                this.updateSendButton();
                this.sendMessage(message);
            });
        });

        // Toggle sidebar
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('mainContent');
            
            sidebar.classList.toggle('sidebar-collapsed');
            mainContent.classList.toggle('main-content-expanded');
        });

        // Login modal
        document.getElementById('closeLoginModal').addEventListener('click', () => {
            this.hideLoginModal();
        });

        document.getElementById('cancelLogin').addEventListener('click', () => {
            this.hideLoginModal();
        });

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            const success = await this.login(username, password);
            if (success) {
                this.hideLoginModal();
            }
        });

        // Admin modal
        document.getElementById('adminBtn').addEventListener('click', () => {
            this.showAdminPanel();
        });

        document.getElementById('closeAdminModal').addEventListener('click', () => {
            document.getElementById('adminModal').classList.add('hidden');
        });

        // Cerrar modales con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideLoginModal();
                document.getElementById('adminModal').classList.add('hidden');
            }
        });
    }
}

// Inicializar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.ragApp = new RAGChatApp();
});
