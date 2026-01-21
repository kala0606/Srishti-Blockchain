/**
 * Srishti Blockchain - Signaling Client
 * 
 * WebSocket client for connecting to the signaling server.
 * Handles WebRTC offer/answer exchange between peers.
 */

class SignalingClient {
    /**
     * Create a new signaling client
     * @param {Object} options
     * @param {string} options.serverUrl - Signaling server WebSocket URL
     * @param {string} options.nodeId - This node's ID
     * @param {Function} options.onOffer - Callback when receiving offer
     * @param {Function} options.onAnswer - Callback when receiving answer
     * @param {Function} options.onIceCandidate - Callback when receiving ICE candidate
     * @param {Function} options.onPeerConnected - Callback when peer list updates
     */
    constructor(options) {
        this.serverUrl = options.serverUrl;
        this.nodeId = options.nodeId;
        this.onOffer = options.onOffer || (() => {});
        this.onAnswer = options.onAnswer || (() => {});
        this.onIceCandidate = options.onIceCandidate || (() => {});
        this.onPeerConnected = options.onPeerConnected || (() => {});
        this.onPeerJoined = options.onPeerJoined || (() => {});
        
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 3000;
        this.availablePeers = []; // Track known peers from signaling
        this.pingInterval = null; // Keep-alive ping interval
    }
    
    /**
     * Connect to the signaling server
     * @returns {Promise<void>}
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);
                
                this.ws.onopen = () => {
                    console.log('🔌 Connected to signaling server');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    
                    // Start keep-alive ping to prevent server from sleeping
                    this.startKeepAlive();
                    
                    // Register with server
                    this.register();
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('Error parsing signaling message:', error);
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('Signaling server error:', error);
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    console.log('🔌 Disconnected from signaling server');
                    this.connected = false;
                    this.stopKeepAlive();
                    this.reconnect();
                };
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Register this node with the signaling server
     */
    register() {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        this.send({
            type: 'register',
            nodeId: this.nodeId
        });
    }
    
    /**
     * Handle incoming messages from signaling server
     * @param {Object} data - Message data
     */
    handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                console.log('📨 Signaling server:', data.message);
                break;
                
            case 'registered':
                console.log(`✅ Registered with signaling server. Peers: ${data.peers.length}`);
                this.availablePeers = data.peers || [];
                if (this.onPeerConnected) {
                    this.onPeerConnected(data.peers);
                }
                break;
                
            case 'peer_joined':
                console.log(`🆕 New peer joined: ${data.nodeId}`);
                // Add to available peers if not already there
                if (!this.availablePeers.includes(data.nodeId)) {
                    this.availablePeers.push(data.nodeId);
                }
                if (this.onPeerJoined) {
                    this.onPeerJoined(data.nodeId);
                }
                if (this.onPeerConnected) {
                    this.onPeerConnected([data.nodeId]);
                }
                break;
                
            case 'offer':
                console.log(`📥 Received offer from ${data.fromNodeId}`);
                if (this.onOffer) {
                    this.onOffer({
                        fromNodeId: data.fromNodeId,
                        offer: data.offer
                    });
                }
                break;
                
            case 'answer':
                console.log(`📥 Received answer from ${data.fromNodeId}`);
                if (this.onAnswer) {
                    this.onAnswer({
                        fromNodeId: data.fromNodeId,
                        answer: data.answer
                    });
                }
                break;
                
            case 'ice-candidate':
                if (this.onIceCandidate) {
                    this.onIceCandidate({
                        fromNodeId: data.fromNodeId,
                        candidate: data.candidate
                    });
                }
                break;
                
            case 'pending':
                console.log(`⏳ ${data.message}`);
                break;
                
            case 'error':
                console.error('Signaling error:', data.message);
                break;
                
            case 'pong':
                // Heartbeat response
                break;
                
            default:
                console.warn(`Unknown signaling message type: ${data.type}`);
        }
    }
    
    /**
     * Send offer to target node
     * @param {string} targetNodeId - Target node ID
     * @param {RTCSessionDescriptionInit} offer - WebRTC offer
     */
    sendOffer(targetNodeId, offer) {
        this.send({
            type: 'offer',
            targetNodeId: targetNodeId,
            offer: offer
        });
    }
    
    /**
     * Send answer to target node
     * @param {string} targetNodeId - Target node ID
     * @param {RTCSessionDescriptionInit} answer - WebRTC answer
     */
    sendAnswer(targetNodeId, answer) {
        this.send({
            type: 'answer',
            targetNodeId: targetNodeId,
            answer: answer
        });
    }
    
    /**
     * Send ICE candidate to target node
     * @param {string} targetNodeId - Target node ID
     * @param {RTCIceCandidateInit} candidate - ICE candidate
     */
    sendIceCandidate(targetNodeId, candidate) {
        this.send({
            type: 'ice-candidate',
            targetNodeId: targetNodeId,
            candidate: candidate
        });
    }
    
    /**
     * Send message to signaling server
     * @param {Object} data - Message data
     */
    send(data) {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('Cannot send: not connected to signaling server');
            return;
        }
        
        try {
            this.ws.send(JSON.stringify(data));
        } catch (error) {
            console.error('Error sending message to signaling server:', error);
        }
    }
    
    /**
     * Attempt to reconnect to signaling server
     * Uses exponential backoff but starts fast for cold-start recovery
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached. Signaling unavailable.');
            return;
        }
        
        this.reconnectAttempts++;
        
        // Fast reconnect for first 3 attempts (1s, 2s, 3s) to handle cold starts
        // Then exponential backoff for subsequent attempts
        let delay;
        if (this.reconnectAttempts <= 3) {
            delay = this.reconnectAttempts * 1000; // 1s, 2s, 3s
        } else {
            delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 3), 30000);
        }
        
        console.log(`🔄 Reconnecting to signaling server in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.connect().catch(error => {
                console.error('Reconnection failed:', error);
            });
        }, delay);
    }
    
    /**
     * Start keep-alive ping interval to prevent server from sleeping
     */
    startKeepAlive() {
        this.stopKeepAlive(); // Clear any existing interval
        
        // Send ping every 25 seconds to keep connection alive
        // Fly.io free tier can sleep after 30 seconds of inactivity
        this.pingInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send({ type: 'ping' });
            }
        }, 25000);
        
        console.log('🏓 Keep-alive ping started (every 25s)');
    }
    
    /**
     * Stop keep-alive ping interval
     */
    stopKeepAlive() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    /**
     * Disconnect from signaling server
     */
    disconnect() {
        this.stopKeepAlive();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
    
    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SignalingClient;
} else {
    window.SrishtiSignalingClient = SignalingClient;
}
