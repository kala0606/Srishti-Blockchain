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
        
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 3000;
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
                if (this.onPeerConnected) {
                    this.onPeerConnected(data.peers);
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
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached. Signaling unavailable.');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        
        console.log(`🔄 Reconnecting to signaling server in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connect().catch(error => {
                console.error('Reconnection failed:', error);
            });
        }, delay);
    }
    
    /**
     * Disconnect from signaling server
     */
    disconnect() {
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
