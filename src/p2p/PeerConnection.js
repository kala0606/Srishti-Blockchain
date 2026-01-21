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
     * Create WebRTC configuration with redundant STUN servers
     * @returns {RTCConfiguration}
     */
    getRTCConfiguration() {
        return {
            iceServers: [
                // Google STUN servers (most reliable)
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                // Alternative public STUN servers for redundancy
                { urls: 'stun:stun.stunprotocol.org:3478' },
                // Free TURN servers - multiple providers for redundancy
                // Metered.ca TURN (free tier)
                {
                    urls: [
                        'turn:a.relay.metered.ca:80',
                        'turn:a.relay.metered.ca:80?transport=tcp',
                        'turn:a.relay.metered.ca:443',
                        'turn:a.relay.metered.ca:443?transport=tcp'
                    ],
                    username: 'e7e6c4c3a0c9c0b7f8d5a2e1',
                    credential: 'qwertyuiopasdfgh'
                },
                // Twilio TURN (free testing servers)
                {
                    urls: 'turn:global.turn.twilio.com:3478?transport=udp',
                    username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
                    credential: 'w1uxM55V9yVoqyVFjt+mxDBV0F5HJlH3lVcqMhkq6GM='
                },
                // ExpressTURN servers
                {
                    urls: 'turn:turn.expressturn.com:3478',
                    username: 'efV3BHKLUFTDWG1234',
                    credential: 'T8P6nq9jYj0bXxyz'
                }
            ],
            // Pre-gather candidates to speed up connection
            iceCandidatePoolSize: 10,
            // Bundle all media to reduce ICE candidates
            bundlePolicy: 'max-bundle',
            // Require multiplexing to reduce port usage
            rtcpMuxPolicy: 'require'
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
     * @throws {Error} If remote description is not set yet
     */
    async addIceCandidate(candidate) {
        if (!this.pc) {
            throw new Error('PeerConnection not initialized');
        }
        
        if (!this.pc.remoteDescription) {
            throw new Error('Cannot add ICE candidate: remote description not set');
        }
        
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
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
            console.error('📡 Data channel error:', error);
            this.connected = false;
            this.onConnectionStateChange('data_channel_error');
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
        // Handle ICE candidates - send to peer via signaling
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.onIceCandidate(event.candidate);
            }
        };
        
        // Handle ICE connection state (only log failures)
        this.pc.oniceconnectionstatechange = () => {
            if (this.pc.iceConnectionState === 'failed') {
                console.error('❌ ICE connection failed - NAT traversal issue');
            }
        };
        
        // Handle connection state changes
        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState;
            if (state === 'connected') {
                console.log(`✅ WebRTC connected`);
                this.connected = true;
            } else if (state === 'failed') {
                console.log(`❌ WebRTC connection failed`);
                this.connected = false;
            } else {
                this.connected = false;
            }
            this.onConnectionStateChange(state);
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
        if (!this.connected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
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
     * Close the connection
     */
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.pc) {
            this.pc.close();
        }
        this.connected = false;
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
