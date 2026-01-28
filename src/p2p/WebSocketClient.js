/**
 * Srishti Blockchain - WebSocket P2P Client
 * 
 * Connects to the relay server for all P2P communication.
 * Replaces WebRTC with simpler, more reliable WebSocket relay.
 * 
 * Architecture:
 *   Node A ←→ Relay Server ←→ Node B
 *   (All messages flow through server, no direct P2P)
 */

class WebSocketClient {
    /**
     * Create a new WebSocket client
     * @param {Object} options
     * @param {string} options.serverUrl - Relay server WebSocket URL
     * @param {string} options.nodeId - This node's ID
     * @param {number} options.chainLength - Current chain length
     * @param {number} options.chainEpoch - Chain epoch for compatibility
     * @param {Function} options.onMessage - Callback for incoming P2P messages
     * @param {Function} options.onPeerJoined - Callback when peer joins
     * @param {Function} options.onPeerLeft - Callback when peer leaves
     * @param {Function} options.onPeersUpdated - Callback when peer list updates
     * @param {Function} options.onConnected - Callback when connected to server
     * @param {Function} options.onDisconnected - Callback when disconnected
     */
    constructor(options) {
        this.serverUrl = options.serverUrl;
        this.nodeId = options.nodeId;
        this.chainLength = options.chainLength || 0;
        this.chainEpoch = options.chainEpoch || 1;
        
        // Callbacks
        this.onMessage = options.onMessage || (() => {});
        this.onPeerJoined = options.onPeerJoined || (() => {});
        this.onPeerLeft = options.onPeerLeft || (() => {});
        this.onPeersUpdated = options.onPeersUpdated || (() => {});
        this.onConnected = options.onConnected || (() => {});
        this.onDisconnected = options.onDisconnected || (() => {});
        
        // State
        this.ws = null;
        this.connected = false;
        this.registered = false;
        this.peers = new Map(); // connectionId -> { chainLength, chainEpoch, lastSeen }
        
        // Per-tab unique ID so multiple tabs (same nodeId) are separate relay connections
        // and can see each other as peers and sync. sessionStorage is tab-specific.
        this.relayConnectionId = this.getOrCreateTabConnectionId(options.nodeId);
        
        // Reconnection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimer = null;
        
        // Keep-alive
        this.pingInterval = null;
        this.lastPong = Date.now();
    }
    
    /**
     * Get or create a stable connection ID for this tab (so multiple tabs = multiple peers)
     * @param {string} nodeId - Blockchain node ID
     * @returns {string} - nodeId_tab_<uuid> for relay registration
     */
    getOrCreateTabConnectionId(nodeId) {
        try {
            const key = 'srishti_relay_tab_id';
            let tabId = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key);
            if (!tabId) {
                tabId = typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem(key, tabId);
                }
            }
            const connectionId = nodeId + '_tab_' + tabId;
            console.log(`🔗 Relay connection ID (this tab): ${connectionId.slice(0, 30)}...`);
            return connectionId;
        } catch (e) {
            return nodeId + '_tab_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        }
    }
    
    /**
     * Connect to the relay server
     * @returns {Promise<void>}
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`🔌 Connecting to relay server: ${this.serverUrl}`);
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    console.log('✅ Connected to relay server');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.lastPong = Date.now();
                    
                    // Start keep-alive
                    this.startKeepAlive();
                    
                    // Register with server
                    this.register();
                    
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleServerMessage(data);
                    } catch (error) {
                        console.error('Error parsing server message:', error);
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    if (!this.connected) {
                        reject(error);
                    }
                };
                
                this.ws.onclose = () => {
                    console.log('🔌 Disconnected from relay server');
                    const wasConnected = this.connected;
                    this.connected = false;
                    this.registered = false;
                    this.stopKeepAlive();
                    
                    if (wasConnected) {
                        this.onDisconnected();
                    }
                    
                    // Attempt reconnection
                    this.scheduleReconnect();
                };
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Register with the relay server (using per-tab connection ID so multiple tabs sync)
     */
    register() {
        this.send({
            type: 'register',
            nodeId: this.relayConnectionId,
            chainLength: this.chainLength,
            chainEpoch: this.chainEpoch
        });
    }
    
    /**
     * Handle incoming server messages
     */
    handleServerMessage(data) {
        switch (data.type) {
            case 'welcome':
                console.log('📨', data.message);
                break;
            
            case 'registered':
                console.log(`✅ Registered with relay server. ${data.peers?.length || 0} peers online.`);
                this.registered = true;
                
                // Add ALL peers - let Network layer filter by epoch after HELLO exchange
                // (Server's epoch info might be stale; HELLO has the actual epoch)
                if (data.peers && Array.isArray(data.peers)) {
                    this.peers.clear();
                    for (const peer of data.peers) {
                        this.peers.set(peer.nodeId, {
                            chainLength: peer.chainLength || 0,
                            chainEpoch: peer.chainEpoch || 1,
                            lastSeen: Date.now()
                        });
                    }
                }
                
                this.onConnected(Array.from(this.peers.keys()));
                this.onPeersUpdated(this.getPeerList());
                break;
            
            case 'peer_joined':
                // Add peer - let Network layer filter by epoch after HELLO exchange
                const joinedPeerEpoch = data.chainEpoch || 1;
                console.log(`🆕 Peer joined: ${data.nodeId} (server epoch: ${joinedPeerEpoch})`);
                this.peers.set(data.nodeId, {
                    chainLength: data.chainLength || 0,
                    chainEpoch: joinedPeerEpoch,
                    lastSeen: Date.now()
                });
                this.onPeerJoined(data.nodeId, {
                    chainLength: data.chainLength || 0,
                    chainEpoch: joinedPeerEpoch
                });
                this.onPeersUpdated(this.getPeerList());
                break;
            
            case 'peer_left':
                console.log(`👋 Peer left: ${data.nodeId}`);
                this.peers.delete(data.nodeId);
                this.onPeerLeft(data.nodeId);
                this.onPeersUpdated(this.getPeerList());
                break;
            
            case 'peers':
                // Response to get_peers request - add all, let Network filter by HELLO
                if (data.peers && Array.isArray(data.peers)) {
                    this.peers.clear();
                    for (const peer of data.peers) {
                        this.peers.set(peer.nodeId, {
                            chainLength: peer.chainLength || 0,
                            chainEpoch: peer.chainEpoch || 1,
                            lastSeen: Date.now()
                        });
                    }
                    this.onPeersUpdated(this.getPeerList());
                }
                break;
            
            case 'message':
                // Relayed P2P message from another peer
                const fromNodeId = data.fromNodeId;
                const payload = data.payload;
                
                if (fromNodeId && payload) {
                    // Update peer's last seen if we know them
                    const peer = this.peers.get(fromNodeId);
                    if (peer) {
                        peer.lastSeen = Date.now();
                    }
                    // Note: Don't add unknown peers here - wait for proper HELLO exchange
                    // This prevents adding incompatible peers that just send us messages
                    
                    // Forward to message handler (let Network layer handle epoch validation)
                    this.onMessage(payload, fromNodeId);
                }
                break;
            
            case 'peer_offline':
                // Target peer is not connected
                console.log(`⚠️ Peer offline: ${data.nodeId}`);
                this.peers.delete(data.nodeId);
                this.onPeerLeft(data.nodeId);
                break;
            
            case 'server_ping':
                // Server keep-alive ping
                this.send({ type: 'pong', timestamp: data.timestamp });
                break;
            
            case 'pong':
                // Response to our ping
                this.lastPong = Date.now();
                break;
            
            case 'server_shutdown':
                console.log('⚠️ Server is shutting down');
                break;
            
            case 'error':
                console.error('Server error:', data.message);
                break;
            
            default:
                console.warn(`Unknown server message type: ${data.type}`);
        }
    }
    
    /**
     * Send message to a specific peer via relay
     * @param {string} targetNodeId - Target peer's node ID
     * @param {Object} payload - Message payload
     * @returns {boolean} - Success status
     */
    sendToPeer(targetNodeId, payload) {
        if (!this.isConnected()) {
            console.warn('Cannot send: not connected to relay server');
            return false;
        }
        
        return this.send({
            type: 'relay',
            targetNodeId: targetNodeId,
            payload: payload
        });
    }
    
    /**
     * Broadcast message to all peers via relay
     * @param {Object} payload - Message payload
     * @returns {boolean} - Success status
     */
    broadcast(payload) {
        if (!this.isConnected()) {
            console.warn('Cannot broadcast: not connected to relay server');
            return false;
        }
        
        return this.send({
            type: 'broadcast',
            payload: payload
        });
    }
    
    /**
     * Update node state on server
     * @param {Object} state - State to update (chainLength, chainEpoch)
     */
    updateState(state) {
        if (!this.isConnected()) return;
        
        this.send({
            type: 'update',
            ...state
        });
        
        // Update local state too
        if (state.chainLength !== undefined) this.chainLength = state.chainLength;
        if (state.chainEpoch !== undefined) this.chainEpoch = state.chainEpoch;
    }
    
    /**
     * Request current peer list from server
     */
    requestPeers() {
        if (!this.isConnected()) return;
        this.send({ type: 'get_peers' });
    }
    
    /**
     * Send raw message to server
     * @param {Object} data - Message data
     * @returns {boolean} - Success status
     */
    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }
    
    /**
     * Start keep-alive ping
     */
    startKeepAlive() {
        this.stopKeepAlive();
        
        this.pingInterval = setInterval(() => {
            if (this.isConnected()) {
                // Check if we've received a pong recently
                const pongAge = Date.now() - this.lastPong;
                if (pongAge > 60000) {
                    // No pong in 60 seconds - connection is dead
                    console.warn('Connection stale, reconnecting...');
                    this.ws.close();
                    return;
                }
                
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, 25000); // Every 25 seconds
    }
    
    /**
     * Stop keep-alive ping
     */
    stopKeepAlive() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        
        // Fast reconnect for first 3 attempts, then exponential backoff
        let delay;
        if (this.reconnectAttempts <= 3) {
            delay = this.reconnectAttempts * 1000;
        } else {
            delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts - 3), 30000);
        }
        
        console.log(`🔄 Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(err => {
                console.error('Reconnect failed:', err);
            });
        }, delay);
    }
    
    /**
     * Get list of online peers
     * @returns {Array<{nodeId, chainLength, chainEpoch}>}
     */
    getPeerList() {
        const list = [];
        for (const [nodeId, info] of this.peers.entries()) {
            list.push({
                nodeId,
                chainLength: info.chainLength,
                chainEpoch: info.chainEpoch,
                lastSeen: info.lastSeen
            });
        }
        return list;
    }
    
    /**
     * Get number of connected peers
     * @returns {number}
     */
    getPeerCount() {
        return this.peers.size;
    }
    
    /**
     * Check if a specific peer is online
     * @param {string} nodeId - Peer's node ID
     * @returns {boolean}
     */
    isPeerOnline(nodeId) {
        return this.peers.has(nodeId);
    }
    
    /**
     * Check if connected to relay server
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    /**
     * Check if registered with relay server
     * @returns {boolean}
     */
    isRegistered() {
        return this.registered;
    }
    
    /**
     * Disconnect from relay server
     */
    disconnect() {
        this.stopKeepAlive();
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // Prevent auto-reconnect
        this.reconnectAttempts = this.maxReconnectAttempts;
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.connected = false;
        this.registered = false;
        this.peers.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketClient;
} else {
    window.SrishtiWebSocketClient = WebSocketClient;
}
