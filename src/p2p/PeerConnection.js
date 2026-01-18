/**
 * Srishti Blockchain - Peer Connection (WebRTC)
 * 
 * Manages WebRTC connections between peers.
 * Handles connection setup, data channels, and message passing.
 */

class PeerConnection {
    /**
     * Create a new peer connection
     * @param {Object} options
     * @param {string} options.nodeId - This node's ID
     * @param {Function} options.onMessage - Callback for incoming messages
     * @param {Function} options.onConnectionStateChange - Callback for connection state changes
     */
    constructor(options) {
        this.nodeId = options.nodeId;
        this.onMessage = options.onMessage || (() => {});
        this.onConnectionStateChange = options.onConnectionStateChange || (() => {});
        this.onIceCandidate = options.onIceCandidate || (() => {});
        
        this.pc = null;
        this.dataChannel = null;
        this.remoteNodeId = null;
        this.connected = false;
    }
    
    /**
     * Create WebRTC configuration
     * @returns {RTCConfiguration}
     */
    getRTCConfiguration() {
        return {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }
    
    /**
     * Initialize as offerer (initiating connection)
     * @returns {Promise<RTCSessionDescriptionInit>} - Offer SDP
     */
    async initAsOfferer() {
        this.pc = new RTCPeerConnection(this.getRTCConfiguration());
        
        // Create data channel
        this.dataChannel = this.pc.createDataChannel('srishti', {
            ordered: true
        });
        
        this.setupDataChannel();
        this.setupPeerConnection();
        
        // Create offer
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        
        // Wait for ICE gathering
        return new Promise((resolve) => {
            if (this.pc.iceGatheringState === 'complete') {
                resolve(this.pc.localDescription);
            } else {
                this.pc.addEventListener('icegatheringstatechange', () => {
                    if (this.pc.iceGatheringState === 'complete') {
                        resolve(this.pc.localDescription);
                    }
                });
            }
        });
    }
    
    /**
     * Initialize as answerer (receiving connection)
     * @param {RTCSessionDescriptionInit} offer - Offer SDP from peer
     * @returns {Promise<RTCSessionDescriptionInit>} - Answer SDP
     */
    async initAsAnswerer(offer) {
        this.pc = new RTCPeerConnection(this.getRTCConfiguration());
        
        this.setupPeerConnection();
        
        // Set remote offer
        await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Create answer
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        
        return this.pc.localDescription;
    }
    
    /**
     * Set remote answer (for offerer)
     * @param {RTCSessionDescriptionInit} answer - Answer SDP from peer
     */
    async setRemoteAnswer(answer) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
    
    /**
     * Add ICE candidate
     * @param {RTCIceCandidateInit} candidate
     */
    async addIceCandidate(candidate) {
        if (this.pc && this.pc.remoteDescription) {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }
    
    /**
     * Setup data channel event handlers
     */
    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('📡 Data channel opened - ready to send/receive');
            this.connected = true;
            this.onConnectionStateChange('data_channel_open');
        };
        
        this.dataChannel.onclose = () => {
            console.log('📡 Data channel closed');
            this.connected = false;
            this.onConnectionStateChange('data_channel_closed');
        };
        
        this.dataChannel.onerror = (error) => {
            // Filter out expected errors (normal connection lifecycle)
            const errorInfo = error.error || error;
            const errorMessage = errorInfo?.message || errorInfo?.toString() || '';
            const errorReason = errorInfo?.reason || '';
            
            // These are expected errors during normal connection cleanup
            const isExpectedError = 
                errorMessage.includes('User-Initiated Abort') ||
                errorMessage.includes('Close called') ||
                errorReason.includes('Close called') ||
                errorMessage.includes('Connection closed') ||
                (this.dataChannel && this.dataChannel.readyState === 'closing');
            
            if (isExpectedError) {
                // Silently handle expected errors (just update state)
                this.connected = false;
                this.onConnectionStateChange('data_channel_closed');
            } else {
                // Log unexpected errors
                console.error('📡 Data channel error:', error);
                console.error('Error details:', {
                    message: errorMessage,
                    reason: errorReason,
                    readyState: this.dataChannel?.readyState,
                    connectionState: this.pc?.connectionState
                });
                this.connected = false;
                this.onConnectionStateChange('data_channel_error');
            }
        };
        
        this.dataChannel.onmessage = (event) => {
            try {
                if (!window.SrishtiProtocol) {
                    console.error('SrishtiProtocol not loaded');
                    return;
                }
                
                const message = window.SrishtiProtocol.deserialize(event.data);
                if (message) {
                    this.onMessage(message, this.remoteNodeId);
                } else {
                    console.warn('Invalid message received');
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        };
    }
    
    /**
     * Setup peer connection event handlers
     */
    setupPeerConnection() {
        // Handle ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Send ICE candidate to peer via signaling
                this.onIceCandidate(event.candidate);
            }
        };
        
        // Handle connection state changes
        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState;
            console.log(`📡 Connection state: ${state}`);
            this.onConnectionStateChange(state);
            
            if (state === 'connected' || state === 'completed') {
                this.connected = true;
            } else {
                this.connected = false;
            }
        };
        
        // Handle incoming data channel (for answerer)
        this.pc.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
    }
    
    /**
     * Send a message to the peer
     * @param {Object} message - Message object
     * @returns {boolean} - Success status
     */
    send(message) {
        console.log(`📤 PeerConnection.send called, connected=${this.connected}, dataChannel=${this.dataChannel?.readyState}`);
        
        if (!this.connected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.warn(`Cannot send: connected=${this.connected}, dataChannel=${this.dataChannel?.readyState}`);
            return false;
        }
        
        try {
            if (!window.SrishtiProtocol) {
                console.error('SrishtiProtocol not loaded');
                return false;
            }
            
            const serialized = window.SrishtiProtocol.serialize(message);
            console.log(`📤 Sending via data channel: ${message.type}`);
            this.dataChannel.send(serialized);
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }
    
    /**
     * Close the connection gracefully
     */
    close() {
        // Mark as closing to suppress expected errors
        this.connected = false;
        
        // Close data channel gracefully
        if (this.dataChannel) {
            try {
                // Only close if not already closing/closed
                if (this.dataChannel.readyState === 'open' || this.dataChannel.readyState === 'connecting') {
                    this.dataChannel.close();
                }
            } catch (error) {
                // Ignore errors during close (expected)
                console.debug('Data channel close error (expected):', error.message);
            }
        }
        
        // Close peer connection gracefully
        if (this.pc) {
            try {
                // Only close if not already closed
                if (this.pc.connectionState !== 'closed') {
                    this.pc.close();
                }
            } catch (error) {
                // Ignore errors during close (expected)
                console.debug('Peer connection close error (expected):', error.message);
            }
        }
    }
    
    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && 
               this.dataChannel && 
               this.dataChannel.readyState === 'open';
    }
    
    /**
     * Get connection state
     * @returns {string}
     */
    getConnectionState() {
        if (!this.pc) return 'disconnected';
        return this.pc.connectionState;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PeerConnection;
} else {
    window.SrishtiPeerConnection = PeerConnection;
}
