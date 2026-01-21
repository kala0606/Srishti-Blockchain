/**
 * Srishti Blockchain - P2P Network
 * 
 * Manages peer connections, chain synchronization, and block propagation.
 * This is the central coordinator that ties everything together.
 */

class Network {
    /**
     * Create a new network instance
     * @param {Object} options
     * @param {string} options.nodeId - This node's ID
     * @param {CryptoKey} options.publicKey - This node's public key
     * @param {Chain} options.chain - Chain instance
     * @param {IndexedDBStore} options.storage - Storage instance
     * @param {Function} options.onChainUpdate - Callback when chain updates
     */
    constructor(options) {
        this.nodeId = options.nodeId;
        this.publicKey = options.publicKey;
        this.chain = options.chain;
        this.storage = options.storage;
        this.onChainUpdate = options.onChainUpdate || (() => {});
        this.onPresenceUpdate = options.onPresenceUpdate || null;
        this.onSyncProgress = options.onSyncProgress || null;
        this.signalingServerUrl = options.signalingServerUrl || null;
        
        // Legacy peer management (maintained for backward compatibility)
        this.peers = new Map(); // Map<nodeId, PeerConnection>
        this.peerInfo = new Map(); // Map<nodeId, {publicKey, chainLength, latestHash}>
        this.pendingConnections = new Map(); // Map<nodeId, {publicKey, timestamp}> - Nodes we want to connect to
        this.pendingOffers = new Map(); // Map<nodeId, PeerConnection> - Connections waiting for answer
        this.pendingAnswers = new Map(); // Map<nodeId, {answer, connection}> - Answers waiting to be sent
        
        // New scalable components
        this.dht = null; // DHT for peer discovery
        this.connectionManager = null; // Connection pool manager
        
        // Queue for ICE candidates that arrive before connection is established
        this.pendingIceCandidates = new Map(); // Map<nodeId, Array<candidate>>
        
        this.signaling = null;
        this.syncing = false;
        this.heartbeatInterval = null;
        this.syncInterval = null;
        
        // Protocol version for compatibility
        this.protocolVersion = window.SrishtiConfig?.PROTOCOL_VERSION || 1;
    }
    
    /**
     * Initialize the network
     * @returns {Promise<void>}
     */
    async init() {
        // Load chain from storage
        const blocks = await this.storage.getAllBlocks();
        if (blocks.length > 0) {
            if (!window.SrishtiChain || !window.SrishtiBlock) {
                throw new Error('Required dependencies not loaded');
            }
            
            const chain = window.SrishtiChain.fromJSON(blocks);
            // Replace current chain
            this.chain.blocks = chain.blocks;
        } else {
            // Create genesis block if no chain exists
            await this.chain.createGenesisBlock();
            await this.saveChain();
        }
        
        // Initialize DHT if available (new scalable peer discovery)
        if (window.SrishtiDHT) {
            await this.initDHT();
        }
        
        // Initialize ConnectionManager if available (new connection pool management)
        if (window.SrishtiConnectionManager) {
            await this.initConnectionManager();
        }
        
        // Initialize signaling client if URL provided (backward compatibility)
        if (this.signalingServerUrl) {
            await this.initSignaling();
        }
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Start periodic sync
        this.startSync();
        
        // Attempt pending connections (nodes we want to connect to)
        this.attemptPendingConnections();
        
        console.log('🌐 Network initialized');
    }
    
    /**
     * Initialize DHT for distributed peer discovery
     */
    async initDHT() {
        try {
            this.dht = new window.SrishtiDHT({
                nodeId: this.nodeId,
                onPeerFound: (nodeId, info) => {
                    // Add peer to connection manager as candidate
                    if (this.connectionManager) {
                        const priority = this.connectionManager.calculatePriority(nodeId, {
                            dhtDistance: info.distance,
                            lastSeen: info.lastSeen,
                            publicKey: info.publicKey
                        });
                        this.connectionManager.addCandidate(nodeId, priority, 'DHT discovery');
                    } else {
                        // Fallback: add to pending connections
                        this.addPendingConnection(nodeId, info.publicKey);
                    }
                },
                onPeerLost: (nodeId) => {
                    // Remove from connection manager
                    if (this.connectionManager) {
                        this.connectionManager.removeCandidate(nodeId);
                    }
                }
            });
            
            await this.dht.init();
            console.log('✅ DHT initialized');
        } catch (error) {
            console.warn('⚠️ Failed to initialize DHT:', error);
            this.dht = null;
        }
    }
    
    /**
     * Initialize ConnectionManager for connection pool management
     */
    async initConnectionManager() {
        try {
            this.connectionManager = new window.SrishtiConnectionManager({
                onConnectionNeeded: async (nodeId, priority, reason) => {
                    // Request connection to this node
                    const peerInfo = this.peerInfo.get(nodeId);
                    const publicKey = peerInfo?.publicKey || null;
                    
                    if (this.signaling && this.signaling.isConnected()) {
                        await this.attemptConnection(nodeId, publicKey);
                    } else if (this.dht) {
                        // Try to find peer via DHT
                        const closest = await this.dht.lookup(nodeId);
                        if (closest.length > 0) {
                            // Use DHT-discovered peer info
                            const dhtInfo = this.dht.getPeerInfo(nodeId);
                            if (dhtInfo) {
                                await this.attemptConnection(nodeId, dhtInfo.publicKey);
                            }
                        }
                    }
                },
                onConnectionClose: (nodeId, connection) => {
                    // Connection manager wants to close this connection
                    this.disconnectPeer(nodeId);
                }
            });
            
            await this.connectionManager.init();
            console.log('✅ ConnectionManager initialized');
        } catch (error) {
            console.warn('⚠️ Failed to initialize ConnectionManager:', error);
            this.connectionManager = null;
        }
    }
    
    /**
     * Initialize signaling client
     */
    async initSignaling() {
        if (!window.SrishtiSignalingClient) {
            console.warn('SignalingClient not loaded, P2P connections will not work');
            return;
        }
        
        try {
            this.signaling = new window.SrishtiSignalingClient({
                serverUrl: this.signalingServerUrl,
                nodeId: this.nodeId,
                onOffer: (data) => this.handleSignalingOffer(data),
                onAnswer: (data) => this.handleSignalingAnswer(data),
                onIceCandidate: (data) => this.handleSignalingIceCandidate(data),
                onPeerConnected: (peers) => {
                    console.log(`📡 Available peers: ${peers.length}`, peers);
                    // When we get the peer list, try to connect to available peers
                    // But only initiate if our nodeId is "lower" to avoid glare (both sides offering)
                    for (const peerId of peers) {
                        if (!this.peers.has(peerId) && !this.pendingOffers.has(peerId)) {
                            // Only initiate connection if our nodeId is lower (to avoid both sides offering)
                            if (this.nodeId < peerId) {
                                console.log(`🔌 Initiating connection to peer: ${peerId} (we have lower ID)`);
                                this.attemptConnection(peerId, null);
                            } else {
                                console.log(`⏳ Waiting for peer ${peerId} to initiate (they have lower ID)`);
                            }
                        }
                    }
                }
            });
            
            await this.signaling.connect();
            console.log('✅ Signaling client connected');
        } catch (error) {
            console.warn('⚠️ Failed to connect to signaling server:', error);
            this.signaling = null;
        }
    }
    
    /**
     * Handle signaling offer
     */
    async handleSignalingOffer(data) {
        const { fromNodeId, offer } = data;
        
        console.log(`📥 Received WebRTC offer from ${fromNodeId}`);
        
        if (this.peers.has(fromNodeId)) {
            console.log(`⏭️ Already connected to ${fromNodeId}`);
            return;
        }
        
        // Handle glare: if we also sent an offer to this peer, the peer with higher ID should back off
        if (this.pendingOffers.has(fromNodeId)) {
            if (this.nodeId > fromNodeId) {
                // We have higher ID, so we back off - close our pending offer and accept theirs
                console.log(`🔄 Glare detected with ${fromNodeId} - we back off (higher ID)`);
                const ourConnection = this.pendingOffers.get(fromNodeId);
                if (ourConnection) {
                    ourConnection.close();
                }
                this.pendingOffers.delete(fromNodeId);
            } else {
                // We have lower ID, so we win - ignore their offer
                console.log(`🔄 Glare detected with ${fromNodeId} - they should back off (we have lower ID)`);
                return;
            }
        }
        
        try {
            console.log(`📝 Creating answer for ${fromNodeId}...`);
            
            const connection = new window.SrishtiPeerConnection({
                nodeId: this.nodeId,
                onMessage: (message, peerId) => this.handleMessage(message, peerId),
                onConnectionStateChange: (state) => {
                    console.log(`📶 Connection state from ${fromNodeId}: ${state}`);
                    if (state === 'data_channel_open') {
                        console.log(`🎉 Data channel open with ${fromNodeId}! Syncing...`);
                        // Mark as online immediately
                        const info = this.peerInfo.get(fromNodeId) || {};
                        this.peerInfo.set(fromNodeId, {
                            ...info,
                            isOnline: true,
                            lastSeen: Date.now()
                        });
                        if (this.onPresenceUpdate) {
                            this.onPresenceUpdate(fromNodeId, {
                                isOnline: true,
                                lastSeen: Date.now()
                            });
                        }
                        // Send immediate heartbeat
                        this.sendHeartbeat();
                        
                        // Send rapid heartbeats for first 10 seconds to ensure presence is synced
                        let rapidHeartbeatCount = 0;
                        const rapidHeartbeat = setInterval(() => {
                            if (!this.peers.has(fromNodeId)) {
                                clearInterval(rapidHeartbeat);
                                return;
                            }
                            this.sendHeartbeat();
                            rapidHeartbeatCount++;
                            if (rapidHeartbeatCount >= 10) {
                                clearInterval(rapidHeartbeat);
                            }
                        }, 1000); // Every 1 second for first 10 seconds
                        
                        // Request sync
                        this.requestSync(fromNodeId);
                    } else if (state === 'data_channel_closed' || state === 'data_channel_error' || 
                               state === 'disconnected' || state === 'failed') {
                        // Retry if the connection failed before data channel opened
                        const shouldRetry = state === 'failed';
                        console.log(`🔌 Connection ${state} for ${fromNodeId}, retry=${shouldRetry}`);
                        this.disconnectPeer(fromNodeId, shouldRetry);
                    }
                },
                onIceCandidate: (candidate) => {
                    if (this.signaling && candidate) {
                        console.log(`🧊 Sending ICE candidate to ${fromNodeId}`);
                        this.signaling.sendIceCandidate(fromNodeId, candidate);
                    }
                }
            });
            
            // Set remote node ID
            connection.remoteNodeId = fromNodeId;
            
            const answer = await connection.initAsAnswerer(offer);
            this.peers.set(fromNodeId, connection);
            this.pendingConnections.delete(fromNodeId);
            
            // Apply any ICE candidates that arrived before the connection was ready
            await this.applyQueuedIceCandidates(fromNodeId, connection);
            
            // Send answer via signaling
            if (this.signaling) {
                console.log(`📤 Sending answer to ${fromNodeId}...`);
                this.signaling.sendAnswer(fromNodeId, answer);
            }
            
            console.log(`✅ WebRTC connection established with ${fromNodeId} (as answerer)`);
            console.log(`⏳ Waiting for data channel to open before sync...`);
            // Don't request sync here - wait for data channel to open
            // The sync will be triggered by onConnectionStateChange when state is 'connected'
        } catch (error) {
            console.error(`❌ Failed to handle offer from ${fromNodeId}:`, error);
        }
    }
    
    /**
     * Handle signaling answer
     */
    async handleSignalingAnswer(data) {
        const { fromNodeId, answer } = data;
        
        console.log(`📥 Received WebRTC answer from ${fromNodeId}`);
        
        const connection = this.pendingOffers.get(fromNodeId);
        if (!connection) {
            console.warn(`⚠️ No pending offer for ${fromNodeId}`);
            return;
        }
        
        try {
            console.log(`📝 Setting remote answer from ${fromNodeId}...`);
            await connection.setRemoteAnswer(answer);
            this.pendingOffers.delete(fromNodeId);
            this.pendingConnections.delete(fromNodeId);
            
            // Add to peers if not already there
            if (!this.peers.has(fromNodeId)) {
                this.peers.set(fromNodeId, connection);
                console.log(`➕ Added ${fromNodeId} to peers map`);
            }
            
            // Apply any ICE candidates that arrived before the answer was processed
            await this.applyQueuedIceCandidates(fromNodeId, connection);
            
            console.log(`📊 Current peers:`, Array.from(this.peers.keys()));
            console.log(`✅ WebRTC connection established with ${fromNodeId} (as offerer)`);
            console.log(`⏳ Waiting for data channel to open before sync...`);
            // Don't request sync here - wait for data channel to open
        } catch (error) {
            console.error(`❌ Failed to handle answer from ${fromNodeId}:`, error);
            this.pendingOffers.delete(fromNodeId);
        }
    }
    
    /**
     * Handle signaling ICE candidate
     */
    async handleSignalingIceCandidate(data) {
        const { fromNodeId, candidate } = data;
        
        console.log(`🧊 Received ICE candidate from ${fromNodeId}`);
        
        // Check if we have a connection (either in peers or pendingOffers)
        let connection = this.peers.get(fromNodeId) || this.pendingOffers.get(fromNodeId);
        
        if (connection) {
            try {
                await connection.addIceCandidate(candidate);
            } catch (err) {
                // If adding fails (e.g., remote description not set yet), queue it
                if (err.message?.includes('remote description') || !connection.pc?.remoteDescription) {
                    console.log(`⏳ Queueing ICE candidate from ${fromNodeId} (remote description not ready)`);
                    this.queueIceCandidate(fromNodeId, candidate);
                } else {
                    console.warn(`⚠️ Failed to add ICE candidate from ${fromNodeId}:`, err.message);
                }
            }
        } else {
            // Queue the ICE candidate for when the connection is established
            console.log(`⏳ Queueing ICE candidate from ${fromNodeId} (no connection yet)`);
            this.queueIceCandidate(fromNodeId, candidate);
        }
    }
    
    /**
     * Queue an ICE candidate for later processing
     * @param {string} nodeId - Peer node ID
     * @param {RTCIceCandidateInit} candidate - ICE candidate
     */
    queueIceCandidate(nodeId, candidate) {
        if (!this.pendingIceCandidates.has(nodeId)) {
            this.pendingIceCandidates.set(nodeId, []);
        }
        this.pendingIceCandidates.get(nodeId).push(candidate);
        console.log(`📦 Queued ICE candidate for ${nodeId}, total queued: ${this.pendingIceCandidates.get(nodeId).length}`);
    }
    
    /**
     * Apply queued ICE candidates to a connection
     * @param {string} nodeId - Peer node ID
     * @param {PeerConnection} connection - The peer connection
     */
    async applyQueuedIceCandidates(nodeId, connection) {
        const queued = this.pendingIceCandidates.get(nodeId);
        if (!queued || queued.length === 0) {
            return;
        }
        
        console.log(`🧊 Applying ${queued.length} queued ICE candidates to ${nodeId}`);
        
        for (const candidate of queued) {
            try {
                await connection.addIceCandidate(candidate);
            } catch (err) {
                console.warn(`⚠️ Failed to apply queued ICE candidate to ${nodeId}:`, err.message);
            }
        }
        
        // Clear the queue
        this.pendingIceCandidates.delete(nodeId);
    }
    
    /**
     * Connect to a peer (initiate connection)
     * @param {Object} peerInfo - Peer connection info
     * @param {string} peerInfo.nodeId - Peer's node ID
     * @param {string} peerInfo.offer - WebRTC offer SDP
     * @returns {Promise<boolean>} - Success status
     */
    async connectToPeer(peerInfo) {
        if (this.peers.has(peerInfo.nodeId)) {
            console.log(`Already connected to ${peerInfo.nodeId}`);
            return true;
        }
        
        if (!window.SrishtiPeerConnection || !window.SrishtiProtocol) {
            throw new Error('Required dependencies not loaded');
        }
        
        try {
            const connection = new window.SrishtiPeerConnection({
                nodeId: this.nodeId,
                onMessage: (message, peerId) => this.handleMessage(message, peerId),
                onConnectionStateChange: (state) => {
                    if (state === 'disconnected' || state === 'failed') {
                        const shouldRetry = state === 'failed';
                        this.disconnectPeer(peerInfo.nodeId, shouldRetry);
                    }
                }
            });
            
            // Initialize as answerer (we received an offer)
            if (peerInfo.offer) {
                const answer = await connection.initAsAnswerer(peerInfo.offer);
                this.peers.set(peerInfo.nodeId, connection);
                
                // Send answer back (this would go through signaling/QR)
                return { answer, connection };
            } else {
                // Initialize as offerer
                const offer = await connection.initAsOfferer();
                this.peers.set(peerInfo.nodeId, connection);
                
                // Send offer (this would go through signaling/QR)
                return { offer, connection };
            }
        } catch (error) {
            console.error(`Failed to connect to peer ${peerInfo.nodeId}:`, error);
            return false;
        }
    }
    
    /**
     * Add a peer connection (peer connected to us)
     * @param {string} nodeId - Peer's node ID
     * @param {PeerConnection} connection - Peer connection instance
     */
    addPeer(nodeId, connection) {
        this.peers.set(nodeId, connection);
        
        // Check if there are any queued parent requests for this peer
        if (this.queuedParentRequests && this.queuedParentRequests.length > 0) {
            const requests = this.queuedParentRequests.filter(req => req.parentId === nodeId);
            if (requests.length > 0) {
                console.log(`📤 Delivering ${requests.length} queued parent request(s) to newly connected ${nodeId}`);
                // Deliver with a small delay to allow connection to stabilize
                setTimeout(async () => {
                    for (const req of requests) {
                        await this.sendParentRequest(req.parentId, req.options);
                    }
                }, 1000);
            }
        }
        
        // Register with connection manager if available
        if (this.connectionManager) {
            const peerInfo = this.peerInfo.get(nodeId) || {};
            const priority = this.connectionManager.calculatePriority(nodeId, {
                chainLength: peerInfo.chainLength,
                lastSeen: Date.now(),
                publicKey: peerInfo.publicKey
            });
            this.connectionManager.registerConnection(nodeId, connection, priority);
        }
        
        // Add to DHT if available
        if (this.dht) {
            const peerInfo = this.peerInfo.get(nodeId) || {};
            this.dht.addPeer(nodeId, {
                publicKey: peerInfo.publicKey,
                lastSeen: Date.now()
            });
        }
        
        // Send HELLO message
        const hello = window.SrishtiProtocol.createHello({
            nodeId: this.nodeId,
            publicKey: null, // TODO: encode public key
            chainLength: this.chain.getLength(),
            latestHash: this.chain.getLatestBlock()?.hash || null,
            protocolVersion: this.protocolVersion // Include protocol version
        });
        
        connection.send(hello);
        
        // When a peer connects, always check if we need to sync chains
        // This ensures we get new blocks (like INSTITUTION_REGISTER) even if chains have same length
        const ourChainLength = this.chain.getLength();
        const ourLatestHash = this.chain.getLatestBlock()?.hash || null;
        
        // Wait a bit for HELLO exchange, then always sync to ensure we have all nodes
        // This is important because nodes might have been added concurrently
        setTimeout(async () => {
            if (!this.peers.has(nodeId)) {
                return; // Peer disconnected
            }
            
            const peerInfo = this.peerInfo.get(nodeId);
            if (!peerInfo) {
                // If we don't have peer info yet, request sync anyway - it will help discover new nodes
                console.log(`🔄 Requesting sync from ${nodeId} (peer info not yet available)...`);
                await this.requestSync(nodeId);
                return;
            }
            
            const theirChainLength = peerInfo.chainLength || 0;
            const theirLatestHash = peerInfo.latestHash || null;
            
            // Always sync when peer connects to ensure we discover all nodes
            // The sync response handler will merge unique nodes even if chains have same length
            console.log(`🔄 Auto-requesting sync from ${nodeId} (ours: ${ourChainLength}/${ourLatestHash?.substring(0, 8)}, theirs: ${theirChainLength}/${theirLatestHash?.substring(0, 8)})`);
            await this.requestSync(nodeId);
        }, 500); // Reduced from 1000ms for faster sync
    }
    
    /**
     * Disconnect from a peer
     * @param {string} nodeId - Peer's node ID
     * @param {boolean} shouldRetry - Whether to attempt reconnection
     */
    disconnectPeer(nodeId, shouldRetry = false) {
        const connection = this.peers.get(nodeId);
        if (connection) {
            connection.close();
            this.peers.delete(nodeId);
            
            // Clean up any pending ICE candidates
            this.pendingIceCandidates.delete(nodeId);
            
            // Mark as offline before deleting
            const info = this.peerInfo.get(nodeId);
            if (info) {
                this.peerInfo.set(nodeId, {
                    ...info,
                    isOnline: false,
                    lastSeen: Date.now()
                });
                // Notify UI that peer went offline
                if (this.onPresenceUpdate) {
                    this.onPresenceUpdate(nodeId, {
                        isOnline: false,
                        lastSeen: Date.now()
                    });
                }
            }
            
            this.peerInfo.delete(nodeId);
            
            // Unregister from connection manager
            if (this.connectionManager) {
                this.connectionManager.unregisterConnection(nodeId);
            }
            
            // Remove from DHT
            if (this.dht) {
                this.dht.removePeer(nodeId);
            }
            
            console.log(`📡 Disconnected from ${nodeId}`);
            
            // Schedule reconnection attempt if we should retry
            if (shouldRetry && this.signaling?.connected) {
                this.scheduleReconnect(nodeId);
            }
        }
    }
    
    /**
     * Schedule a reconnection attempt to a peer
     * @param {string} nodeId - Peer's node ID
     */
    scheduleReconnect(nodeId) {
        // Track retry count
        this.reconnectAttempts = this.reconnectAttempts || {};
        this.reconnectAttempts[nodeId] = (this.reconnectAttempts[nodeId] || 0) + 1;
        
        const attempts = this.reconnectAttempts[nodeId];
        const maxAttempts = 3;
        
        if (attempts > maxAttempts) {
            console.log(`⚠️ Max reconnect attempts reached for ${nodeId}`);
            delete this.reconnectAttempts[nodeId];
            return;
        }
        
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempts) * 1000;
        console.log(`🔄 Scheduling reconnect to ${nodeId} in ${delay/1000}s (attempt ${attempts}/${maxAttempts})`);
        
        setTimeout(() => {
            // Only reconnect if we're still not connected and signaling is available
            if (!this.peers.has(nodeId) && this.signaling?.connected) {
                console.log(`🔄 Attempting reconnect to ${nodeId}...`);
                // Check if they're in available peers
                if (this.signaling.availablePeers?.includes(nodeId)) {
                    // Let the peer with lower ID initiate
                    if (this.nodeId < nodeId) {
                        this.initiatePeerConnection(nodeId);
                    } else {
                        console.log(`⏳ Waiting for ${nodeId} to initiate reconnection`);
                    }
                }
            } else if (this.peers.has(nodeId)) {
                // Successfully reconnected
                delete this.reconnectAttempts[nodeId];
            }
        }, delay);
    }
    
    /**
     * Handle incoming message from peer
     * @param {Object} message - Message object
     * @param {string} peerId - Peer's node ID
     */
    async handleMessage(message, peerId) {
        console.log(`📨 Received message from ${peerId}:`, message.type);
        
        if (!window.SrishtiProtocol) return;
        
        switch (message.type) {
            case window.SrishtiProtocol.MESSAGE_TYPES.HELLO:
                await this.handleHello(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.SYNC_REQUEST:
                await this.handleSyncRequest(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.SYNC_RESPONSE:
                await this.handleSyncResponse(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.HEADER_SYNC_REQUEST:
                await this.handleHeaderSyncRequest(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.HEADER_SYNC_RESPONSE:
                await this.handleHeaderSyncResponse(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.MERKLE_PROOF_REQUEST:
                await this.handleMerkleProofRequest(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.MERKLE_PROOF_RESPONSE:
                await this.handleMerkleProofResponse(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.NEW_BLOCK:
                await this.handleNewBlock(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.HEARTBEAT:
                this.handleHeartbeat(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.PARENT_REQUEST:
                await this.handleParentRequest(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.PARENT_RESPONSE:
                await this.handleParentResponse(message, peerId);
                break;
            default:
                console.warn(`Unknown message type: ${message.type}`);
        }
    }
    
    /**
     * Handle HELLO message
     */
    async handleHello(message, peerId) {
        // Update activity in connection manager
        if (this.connectionManager) {
            this.connectionManager.updateActivity(peerId);
        }
        
        // Update DHT
        if (this.dht) {
            this.dht.updatePeerSeen(peerId);
        }
        
        // Mark peer as online immediately when we receive HELLO
        this.peerInfo.set(peerId, {
            publicKey: message.publicKey,
            chainLength: message.chainLength,
            latestHash: message.latestHash,
            protocolVersion: message.protocolVersion || 1,
            nodeType: message.nodeType || 'LIGHT',
            isOnline: true,
            lastSeen: Date.now()
        });
        
        // Notify UI immediately that this peer is online
        if (this.onPresenceUpdate) {
            this.onPresenceUpdate(peerId, {
                isOnline: true,
                lastSeen: Date.now()
            });
        }
        
        // Send immediate heartbeat so peer knows we're online too
        this.sendHeartbeat();
        
        // Add to connection manager as candidate if not already connected
        if (this.connectionManager && !this.peers.has(peerId)) {
            const priority = this.connectionManager.calculatePriority(peerId, {
                chainLength: message.chainLength,
                lastSeen: Date.now(),
                publicKey: message.publicKey,
                nodeType: message.nodeType
            });
            this.connectionManager.addCandidate(peerId, priority, 'HELLO message');
        }
        
        // Request sync if peer has longer chain, different latest hash (divergent chains), 
        // OR if we only have genesis (1 block) and they have more
        const ourChainLength = this.chain.getLength();
        const ourLatestHash = this.chain.getLatestBlock()?.hash || null;
        const theirLatestHash = message.latestHash || null;
        const onlyHasGenesis = ourChainLength <= 1;
        
        const shouldSync = message.chainLength > ourChainLength || 
                          (message.chainLength === ourChainLength && theirLatestHash && ourLatestHash && theirLatestHash !== ourLatestHash) ||
                          (onlyHasGenesis && message.chainLength > 1);
        
        if (shouldSync) {
            console.log(`📥 Requesting sync: our chain=${ourChainLength}/${ourLatestHash?.substring(0, 8)}, their chain=${message.chainLength}/${theirLatestHash?.substring(0, 8)}`);
            await this.requestSync(peerId);
        } else {
            // Even if chains appear in sync, always do a sync request to ensure we have all nodes
            // This is important because nodes might have been added concurrently and we need to merge unique nodes
            console.log(`🔍 Chains appear in sync with ${peerId} (${ourChainLength} blocks), but verifying all nodes are present...`);
            await this.requestSync(peerId);
        }
    }
    
    /**
     * Handle SYNC_REQUEST
     */
    async handleSyncRequest(message, peerId) {
        console.log(`📥 Received SYNC_REQUEST from ${peerId}:`, message);
        
        const connection = this.peers.get(peerId);
        if (!connection) {
            console.log(`❌ No connection for ${peerId} to send response`);
            return;
        }
        
        const fromIndex = message.fromIndex || 0;
        const totalBlocks = this.chain.getLength();
        const blocks = this.chain.blocks.slice(fromIndex);
        
        console.log(`📊 Our chain has ${totalBlocks} blocks, sending ${blocks.length} (from index ${fromIndex})`);
        console.log(`📤 Sending SYNC_RESPONSE to ${peerId}: ${blocks.length} blocks`);
        
        const response = window.SrishtiProtocol.createSyncResponse({
            blocks: blocks.map(b => b.toJSON()),
            chainLength: totalBlocks
        });
        
        const sent = connection.send(response);
        console.log(`📤 SYNC_RESPONSE sent: ${sent}`);
    }
    
    /**
     * Handle SYNC_RESPONSE
     */
    async handleSyncResponse(message, peerId) {
        console.log(`📥 Received SYNC_RESPONSE from ${peerId}: ${message.blocks?.length || 0} blocks`);
        
        if (this.syncing) {
            console.log(`⏳ Already syncing, ignoring response`);
            return;
        }
        
        // Add timeout protection to prevent stuck syncing flag
        const syncTimeout = setTimeout(() => {
            if (this.syncing) {
                console.warn('⚠️ Sync timeout after 30s - resetting flag');
                this.syncing = false;
                if (this.onSyncProgress) {
                    this.onSyncProgress({ status: 'idle', message: 'Sync timeout' });
                }
            }
        }, 30000); // 30 second max sync time
        
        try {
            this.syncing = true;
            
            const receivedBlocks = message.blocks;
            if (!receivedBlocks || receivedBlocks.length === 0) {
                console.log(`📭 No blocks received`);
                if (this.onSyncProgress) {
                    this.onSyncProgress({ status: 'idle' });
                }
                return;
            }
            
            const ourLength = this.chain.getLength();
            const theirLength = receivedBlocks.length;
            
            console.log(`📊 Chain comparison: ours=${ourLength}, theirs=${theirLength}`);
            
            // Emit sync start event
            if (this.onSyncProgress) {
                this.onSyncProgress({
                    status: 'syncing',
                    current: ourLength,
                    total: theirLength,
                    message: `Syncing ${theirLength} blocks...`
                });
            }
            
            // Validate genesis signature to prevent syncing old chains after reset
            // Only validate if both chains have at least one block (genesis)
            if (ourLength > 0 && theirLength > 0) {
                const ourGenesis = this.chain.blocks[0];
                const theirGenesis = receivedBlocks[0];
                
                // If we have different genesis blocks, check if theirs is from an old chain
                // Genesis blocks with different hashes indicate different chains (after reset)
                if (ourGenesis && theirGenesis) {
                    // Extract uniqueId from genesis event if available
                    const ourUniqueId = ourGenesis.data?.uniqueId || null;
                    const theirUniqueId = theirGenesis.data?.uniqueId || null;
                    
                    // If genesis hashes are different, they're from different chains
                    if (ourGenesis.hash !== theirGenesis.hash) {
                        // If both have uniqueIds and they're different, reject old chain
                        if (ourUniqueId && theirUniqueId && ourUniqueId !== theirUniqueId) {
                            console.warn(`⚠️ Rejecting chain from ${peerId}: Different genesis signature (ours: ${ourUniqueId?.substring(0, 8)}, theirs: ${theirUniqueId?.substring(0, 8)})`);
                            return; // Don't sync old chain
                        }
                        
                        // If we have a uniqueId but they don't, prefer ours (newer chain with signature)
                        if (ourUniqueId && !theirUniqueId) {
                            console.warn(`⚠️ Rejecting chain from ${peerId}: Our chain has unique signature, theirs doesn't (likely old chain)`);
                            return; // Don't sync old chain
                        }
                        
                        // If neither has uniqueId but hashes differ, be more cautious
                        // Only sync if their chain is significantly longer (might be legitimate fork)
                        if (!ourUniqueId && !theirUniqueId && theirLength <= ourLength) {
                            console.warn(`⚠️ Rejecting chain from ${peerId}: Different genesis hash but no unique signatures (likely old chain after reset)`);
                            return; // Don't sync old chain
                        }
                    }
                }
            }
            
            // If their chain is longer, replace ours
            if (theirLength > ourLength) {
                console.log(`📥 Their chain is longer, replacing ours...`);
                
                // Update progress: starting replacement
                if (this.onSyncProgress) {
                    this.onSyncProgress({
                        status: 'syncing',
                        current: ourLength,
                        total: theirLength,
                        message: `Replacing chain with ${theirLength} blocks...`,
                        progress: Math.min((ourLength / theirLength) * 100, 50)
                    });
                }
                
                // IMPORTANT: Save our current nodes BEFORE replacing chain
                // We might have unique nodes they don't have
                const ourOldBlocks = this.chain.toJSON();
                
                // Update progress: replacing chain
                if (this.onSyncProgress) {
                    this.onSyncProgress({
                        status: 'syncing',
                        current: ourLength,
                        total: theirLength,
                        message: `Processing blocks...`,
                        progress: 60
                    });
                }
                
                await this.chain.replaceChain(receivedBlocks);
                
                // Update progress: merging nodes
                if (this.onSyncProgress) {
                    this.onSyncProgress({
                        status: 'syncing',
                        current: this.chain.getLength(),
                        total: theirLength,
                        message: `Merging unique nodes...`,
                        progress: 80
                    });
                }
                
                // Ensure our local node is in the chain (for returning users)
                await this.ensureLocalNodeInChain();
                
                // Merge back any unique nodes we had
                await this.mergeUniqueNodes(ourOldBlocks, 'self');
                
                await this.saveChain();
                this.onChainUpdate(this.chain);
                console.log(`✅ Chain replaced with ${this.chain.getLength()} blocks from ${peerId}`);
                
                // Update progress: complete
                if (this.onSyncProgress) {
                    this.onSyncProgress({
                        status: 'complete',
                        current: this.chain.getLength(),
                        total: this.chain.getLength(),
                        message: `Synced ${this.chain.getLength()} blocks`,
                        progress: 100
                    });
                }
            } 
            // If same length, use deterministic tie-breaker (earlier genesis timestamp wins)
            else if (theirLength === ourLength && theirLength > 1) {
                // Get genesis blocks for comparison
                const ourGenesis = this.chain.blocks[0];
                const theirGenesis = receivedBlocks[0];
                
                if (!ourGenesis || !theirGenesis) {
                    console.warn(`⚠️ Cannot compare chains: missing genesis blocks`);
                    return;
                }
                
                // If genesis hashes are different, don't sync (different chains after reset)
                if (ourGenesis.hash !== theirGenesis.hash) {
                    const ourUniqueId = ourGenesis.data?.uniqueId || null;
                    const theirUniqueId = theirGenesis.data?.uniqueId || null;
                    
                    if (ourUniqueId && theirUniqueId && ourUniqueId !== theirUniqueId) {
                        console.warn(`⚠️ Rejecting chain from ${peerId}: Different genesis signature (same length but different chains)`);
                        return; // Don't sync old chain
                    }
                }
                
                // Compare genesis timestamps (earlier wins) or hash as tie-breaker
                if (theirGenesis.timestamp < ourGenesis.timestamp ||
                    (theirGenesis.timestamp === ourGenesis.timestamp && 
                     theirGenesis.hash < ourGenesis.hash)) {
                    console.log(`📥 Their chain has earlier genesis, replacing ours...`);
                    
                    // IMPORTANT: Save our current nodes BEFORE replacing chain
                    // We'll need to merge them back after adopting their chain
                    const ourOldBlocks = this.chain.toJSON();
                    
                    await this.chain.replaceChain(receivedBlocks);
                    
                    // Check if our node's join block is in the new chain
                    await this.ensureLocalNodeInChain();
                    
                    // Now merge back any nodes we had that they didn't have
                    await this.mergeUniqueNodes(ourOldBlocks, 'self');
                    
                    await this.saveChain();
                    this.onChainUpdate(this.chain);
                    console.log(`✅ Chain replaced (earlier genesis) with ${this.chain.getLength()} blocks from ${peerId}`);
                    
                    // Update progress: complete
                    if (this.onSyncProgress) {
                        this.onSyncProgress({
                            status: 'complete',
                            current: this.chain.getLength(),
                            total: this.chain.getLength(),
                            message: `Synced ${this.chain.getLength()} blocks`,
                            progress: 100
                        });
                    }
                } else {
                    console.log(`📭 Our chain wins tie-breaker, keeping ours`);
                    
                    // Merge unique NODE_JOIN events from their chain that we don't have
                    await this.mergeUniqueNodes(receivedBlocks, peerId);
                }
            } else {
                console.log(`📭 Our chain is longer or equal, keeping ours`);
                
                // Even though our chain is longer, check if they have unique nodes we're missing
                // This handles the case where chains diverged and we need to include all valid nodes
                await this.mergeUniqueNodes(receivedBlocks, peerId);
            }
        } catch (error) {
            console.error(`Sync failed from ${peerId}:`, error);
            if (this.onSyncProgress) {
                this.onSyncProgress({
                    status: 'error',
                    message: `Sync failed: ${error.message}`,
                    progress: 0
                });
            }
        } finally {
            clearTimeout(syncTimeout);
            this.syncing = false;
            // Hide progress bar after a delay if no new sync starts
            if (this.onSyncProgress) {
                setTimeout(() => {
                    if (!this.syncing) {
                        this.onSyncProgress({ status: 'idle' });
                    }
                }, 2000);
            }
        }
    }
    
    /**
     * Handle HEADER_SYNC_REQUEST (light client requesting headers)
     */
    async handleHeaderSyncRequest(message, peerId) {
        console.log(`📥 Received HEADER_SYNC_REQUEST from ${peerId}:`, message);

        const connection = this.peers.get(peerId);
        if (!connection) {
            console.log(`❌ No connection for ${peerId} to send header response`);
            return;
        }

        if (!window.SrishtiBlockHeader) {
            console.error('SrishtiBlockHeader not loaded');
            return;
        }

        const fromIndex = message.fromIndex || 0;
        const count = message.count || 100;
        const totalBlocks = this.chain.getLength();
        const toIndex = Math.min(fromIndex + count, totalBlocks);

        // Extract headers from blocks
        const headers = [];
        for (let i = fromIndex; i < toIndex; i++) {
            const block = this.chain.getBlock(i);
            if (block) {
                // Ensure block has header computed
                if (!block.header) {
                    await block.computeHash();
                }
                const header = block.getHeader();
                if (header) {
                    headers.push(header.toJSON());
                }
            }
        }

        console.log(`📤 Sending ${headers.length} headers to ${peerId} (from index ${fromIndex})`);

        const response = window.SrishtiProtocol.createHeaderSyncResponse({
            headers: headers,
            chainLength: totalBlocks
        });

        connection.send(response);
    }

    /**
     * Handle HEADER_SYNC_RESPONSE (light client receiving headers)
     */
    async handleHeaderSyncResponse(message, peerId) {
        console.log(`📥 Received HEADER_SYNC_RESPONSE from ${peerId}: ${message.headers?.length || 0} headers`);

        // This is typically handled by LightClient, but we can log it here
        if (this.lightClient) {
            try {
                const synced = await this.lightClient.syncHeaders(
                    async (fromIndex) => message.headers,
                    message.headers.length > 0 ? 0 : null
                );
                console.log(`✅ Synced ${synced} headers from ${peerId}`);
            } catch (error) {
                console.error(`Failed to sync headers from ${peerId}:`, error);
            }
        }
    }

    /**
     * Handle MERKLE_PROOF_REQUEST (light client requesting Merkle proof)
     */
    async handleMerkleProofRequest(message, peerId) {
        console.log(`📥 Received MERKLE_PROOF_REQUEST from ${peerId}:`, message);

        const connection = this.peers.get(peerId);
        if (!connection) {
            console.log(`❌ No connection for ${peerId} to send proof response`);
            return;
        }

        try {
            let proof = null;

            if (message.blockIndex !== null && message.blockIndex !== undefined) {
                // Specific block requested
                proof = await this.chain.generateMerkleProof(message.blockIndex, message.transactionId);
            } else {
                // Search all blocks
                proof = await this.chain.findTransactionAndGenerateProof(message.transactionId);
            }

            const response = window.SrishtiProtocol.createMerkleProofResponse({
                proof: proof,
                found: proof !== null
            });

            connection.send(response);
            console.log(`📤 Sent Merkle proof to ${peerId}: ${proof ? 'found' : 'not found'}`);
        } catch (error) {
            console.error(`Failed to generate Merkle proof for ${peerId}:`, error);
            const response = window.SrishtiProtocol.createMerkleProofResponse({
                proof: null,
                found: false
            });
            connection.send(response);
        }
    }

    /**
     * Handle MERKLE_PROOF_RESPONSE (light client receiving proof)
     */
    async handleMerkleProofResponse(message, peerId) {
        console.log(`📥 Received MERKLE_PROOF_RESPONSE from ${peerId}: ${message.found ? 'proof found' : 'not found'}`);

        // This is typically handled by LightClient, but we can log it here
        if (this.onMerkleProofReceived) {
            this.onMerkleProofReceived(message.proof, peerId);
        }
    }

    /**
     * Handle NEW_BLOCK
     */
    async handleNewBlock(message, peerId) {
        if (!window.SrishtiBlock) return;
        
        try {
            const block = window.SrishtiBlock.fromJSON(message.block);
            const expectedIndex = this.chain.getLength();
            
            // Validate block structure
            if (!block.isValid()) {
                console.warn(`Invalid block structure from ${peerId}`);
                return;
            }
            
            // Check block index
            if (block.index < expectedIndex) {
                // Block is behind our chain - check if it has a NODE_JOIN we don't have
                console.log(`📦 Block ${block.index} from ${peerId} is behind our chain (we have ${expectedIndex})`);
                
                // Extract any unique nodes from this block
                if (block.data && block.data.type === 'NODE_JOIN') {
                    const nodeMap = this.chain.buildNodeMap();
                    if (!nodeMap[block.data.nodeId]) {
                        console.log(`🆕 Block contains node ${block.data.nodeId} we don't have, merging...`);
                        await this.mergeUniqueNodes([message.block], peerId);
                    }
                }
                return;
            }
            
            if (block.index > expectedIndex) {
                // Block is ahead - we're missing blocks, request sync
                console.log(`📦 Block ${block.index} from ${peerId} is ahead of our chain (we have ${expectedIndex}), syncing...`);
                await this.requestSync(peerId);
                return;
            }
            
            // Block index matches - verify previous hash
            const latestBlock = this.chain.getLatestBlock();
            if (latestBlock && block.previousHash !== latestBlock.hash) {
                console.warn(`Block ${block.index} has wrong previousHash, requesting sync`);
                await this.requestSync(peerId);
                return;
            }
            
            // Add to chain
            await this.chain.addBlock(block);
            
            // Save to storage
            await this.saveChain();
            
            // Broadcast to other peers
            this.broadcast(message, peerId);
            
            // Notify listeners
            this.onChainUpdate(this.chain);
            
            console.log(`✅ New block ${block.index} received from ${peerId}`);
        } catch (error) {
            console.error(`Failed to add block from ${peerId}:`, error);
            // On any error, try to sync with this peer
            await this.requestSync(peerId);
        }
    }
    
    /**
     * Handle HEARTBEAT
     */
    handleHeartbeat(message, peerId) {
        // Update peer info (for presence tracking)
        this.peerInfo.set(peerId, {
            ...this.peerInfo.get(peerId),
            lastSeen: message.timestamp,
            isOnline: message.isOnline
        });
        
        // Notify the UI about this peer's online status
        if (this.onPresenceUpdate) {
            this.onPresenceUpdate(peerId, {
                isOnline: message.isOnline,
                lastSeen: message.timestamp
            });
        }
        
        // If the heartbeat includes info about other nodes, update them too
        if (message.knownOnline && Array.isArray(message.knownOnline)) {
            for (const nodeId of message.knownOnline) {
                if (nodeId !== this.nodeId && !this.peerInfo.has(nodeId)) {
                    // We learned about another online node through gossip
                    if (this.onPresenceUpdate) {
                        this.onPresenceUpdate(nodeId, {
                            isOnline: true,
                            lastSeen: Date.now()
                        });
                    }
                }
            }
        }
    }
    
    /**
     * Handle PARENT_REQUEST message
     * @param {Object} message - Parent request message
     * @param {string} peerId - Peer's node ID (the node requesting to be child)
     */
    async handleParentRequest(message, peerId) {
        console.log(`📥 Received PARENT_REQUEST from ${peerId} to become child of ${message.parentId}`);
        
        // Check if the request is for us to be the parent
        if (message.parentId !== this.nodeId) {
            console.log(`⏭️ Parent request not for us (requested: ${message.parentId}, we are: ${this.nodeId})`);
            return;
        }
        
        // This is a callback - the actual approval happens in the UI/app layer
        // We'll just notify that a request was received
        if (this.onParentRequest) {
            this.onParentRequest({
                nodeId: message.nodeId || peerId,
                parentId: message.parentId,
                reason: message.reason,
                metadata: message.metadata
            });
        } else {
            console.log(`ℹ️ Parent request received from ${peerId}, but no handler registered`);
        }
    }
    
    /**
     * Handle PARENT_RESPONSE message
     * @param {Object} message - Parent response message
     * @param {string} peerId - Peer's node ID (the parent who responded)
     */
    async handleParentResponse(message, peerId) {
        console.log(`📥 Received PARENT_RESPONSE from ${peerId}: ${message.approved ? 'approved' : 'rejected'}`);
        
        // Check if the response is for our request
        if (message.requestNodeId !== this.nodeId) {
            console.log(`⏭️ Parent response not for us (requested: ${message.requestNodeId}, we are: ${this.nodeId})`);
            return;
        }
        
        // Notify the app layer
        if (this.onParentResponse) {
            this.onParentResponse({
                parentId: message.parentId,
                approved: message.approved,
                reason: message.reason
            });
        } else {
            console.log(`ℹ️ Parent response received from ${peerId}, but no handler registered`);
        }
    }
    
    /**
     * Send parent request to a node with retry logic
     * @param {string} parentId - Node ID of the parent we want to connect to
     * @param {Object} options - Request options
     * @param {number} retryCount - Current retry attempt (internal)
     * @returns {Promise<boolean>} - Success status
     */
    async sendParentRequest(parentId, options = {}, retryCount = 0) {
        const maxRetries = 5;
        console.log(`📤 Sending PARENT_REQUEST to ${parentId}... (attempt ${retryCount + 1}/${maxRetries + 1})`);
        
        const connection = this.peers.get(parentId);
        if (!connection || !connection.isConnected()) {
            console.warn(`❌ Cannot send parent request: not connected to ${parentId}`);
            
            // Try to connect first
            const nodeMap = this.chain.buildNodeMap();
            const parentNode = nodeMap[parentId];
            if (parentNode && parentNode.publicKey) {
                await this.addPendingConnection(parentId, parentNode.publicKey);
                await this.attemptConnection(parentId, parentNode.publicKey);
                // Wait longer for connection to establish
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Retry after connection
                if (this.peers.has(parentId) && this.peers.get(parentId).isConnected()) {
                    return await this.sendParentRequest(parentId, options, retryCount);
                }
            }
            
            // If still not connected and we have retries left, queue for later
            if (retryCount < maxRetries) {
                console.log(`🔄 Connection not established, retrying in 3s (${retryCount + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, 3000));
                return this.sendParentRequest(parentId, options, retryCount + 1);
            }
            
            // Max retries reached - queue request for delivery when peer connects
            console.warn(`⚠️ Max retries reached. Queuing parent request for ${parentId}`);
            this.queuedParentRequests = this.queuedParentRequests || [];
            this.queuedParentRequests.push({ 
                parentId, 
                options, 
                timestamp: Date.now(),
                nodeId: this.nodeId 
            });
            
            // Set up a listener to send when peer connects
            this.setupQueuedRequestDelivery(parentId);
            
            return false;
        }
        
        const request = window.SrishtiProtocol.createParentRequest({
            nodeId: this.nodeId,
            parentId: parentId,
            reason: options.reason || null,
            metadata: options.metadata || {}
        });
        
        const sent = connection.send(request);
        if (sent) {
            console.log(`✅ Parent request sent to ${parentId}`);
            // Remove from queue if it was queued
            if (this.queuedParentRequests) {
                this.queuedParentRequests = this.queuedParentRequests.filter(
                    req => req.parentId !== parentId || req.nodeId !== this.nodeId
                );
            }
        } else {
            console.error(`❌ Failed to send parent request to ${parentId}`);
            // Queue for retry if send failed
            if (retryCount < maxRetries) {
                await new Promise(r => setTimeout(r, 2000));
                return this.sendParentRequest(parentId, options, retryCount + 1);
            }
        }
        
        return sent;
    }
    
    /**
     * Set up delivery of queued requests when peer connects
     * @param {string} parentId - Parent node ID to watch for
     */
    setupQueuedRequestDelivery(parentId) {
        // Check periodically if peer connected and deliver queued requests
        const deliveryCheck = setInterval(async () => {
            if (!this.queuedParentRequests || this.queuedParentRequests.length === 0) {
                clearInterval(deliveryCheck);
                return;
            }
            
            const connection = this.peers.get(parentId);
            if (connection && connection.isConnected()) {
                // Find and send queued requests for this parent
                const requests = this.queuedParentRequests.filter(req => req.parentId === parentId);
                for (const req of requests) {
                    console.log(`📤 Delivering queued parent request to ${parentId}`);
                    const sent = await this.sendParentRequest(req.parentId, req.options);
                    if (sent) {
                        // Remove from queue
                        this.queuedParentRequests = this.queuedParentRequests.filter(
                            r => r !== req
                        );
                    }
                }
                clearInterval(deliveryCheck);
            }
            
            // Remove old queued requests (older than 5 minutes)
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
            this.queuedParentRequests = this.queuedParentRequests.filter(
                req => req.timestamp > fiveMinutesAgo
            );
            
            if (this.queuedParentRequests.length === 0) {
                clearInterval(deliveryCheck);
            }
        }, 5000); // Check every 5 seconds
        
        // Stop checking after 5 minutes
        setTimeout(() => clearInterval(deliveryCheck), 5 * 60 * 1000);
    }
    
    /**
     * Send parent response (approve/reject) to a requesting node
     * @param {string} requestNodeId - Node ID that requested to be child
     * @param {boolean} approved - Whether to approve the request
     * @param {string} reason - Optional reason
     * @returns {Promise<boolean>} - Success status
     */
    async sendParentResponse(requestNodeId, approved, reason = null) {
        console.log(`📤 Sending PARENT_RESPONSE to ${requestNodeId}: ${approved ? 'approved' : 'rejected'}`);
        
        const connection = this.peers.get(requestNodeId);
        if (!connection || !connection.isConnected()) {
            console.warn(`❌ Cannot send parent response: not connected to ${requestNodeId}`);
            return false;
        }
        
        const response = window.SrishtiProtocol.createParentResponse({
            requestNodeId: requestNodeId,
            parentId: this.nodeId,
            approved: approved,
            reason: reason
        });
        
        const sent = connection.send(response);
        if (sent) {
            console.log(`✅ Parent response sent to ${requestNodeId}`);
        } else {
            console.error(`❌ Failed to send parent response to ${requestNodeId}`);
        }
        
        return sent;
    }
    
    /**
     * Request chain sync from peer
     * @param {string} peerId - Peer's node ID
     */
    async requestSync(peerId) {
        console.log(`📤 requestSync called for ${peerId}`);
        
        const connection = this.peers.get(peerId);
        if (!connection) {
            console.log(`❌ No connection found for ${peerId} in peers map`);
            console.log(`📊 Current peers:`, Array.from(this.peers.keys()));
            if (this.onSyncProgress) {
                this.onSyncProgress({
                    status: 'connecting',
                    message: `Connecting to peers...`,
                    progress: 10
                });
            }
            return;
        }
        
        if (!connection.isConnected()) {
            console.log(`❌ Connection to ${peerId} is not open`);
            if (this.onSyncProgress) {
                this.onSyncProgress({
                    status: 'connecting',
                    message: `Establishing connection...`,
                    progress: 20
                });
            }
            return;
        }
        
        // Emit progress: requesting sync
        if (this.onSyncProgress) {
            this.onSyncProgress({
                status: 'syncing',
                message: `Requesting blockchain data...`,
                progress: 30
            });
        }
        
        // Always request full chain to compare and merge
        const request = window.SrishtiProtocol.createSyncRequest({
            fromIndex: 0,  // Request entire chain for comparison
            chainLength: this.chain.getLength(),
            latestHash: this.chain.getLatestBlock()?.hash || null
        });
        
        console.log(`📤 Sending SYNC_REQUEST to ${peerId}:`, { ourChainLength: this.chain.getLength() });
        const sent = connection.send(request);
        console.log(`📤 SYNC_REQUEST sent: ${sent}`);
    }
    
    /**
     * Broadcast message to all peers (except sender)
     * @param {Object} message - Message to broadcast
     * @param {string} excludePeerId - Peer ID to exclude
     */
    broadcast(message, excludePeerId = null) {
        console.log(`📢 Broadcasting ${message.type} to ${this.peers.size} peers (excluding ${excludePeerId || 'none'})`);
        
        for (const [peerId, connection] of this.peers.entries()) {
            if (peerId !== excludePeerId) {
                const isConnected = connection.isConnected();
                console.log(`📤 Broadcasting to ${peerId}: connected=${isConnected}`);
                if (isConnected) {
                    const sent = connection.send(message);
                    console.log(`📤 Broadcast to ${peerId}: sent=${sent}`);
                } else {
                    console.log(`⏭️ Skipping ${peerId} - not connected`);
                }
            }
        }
    }
    
    /**
     * Propose a new block
     * @param {Block} block - Block to propose
     */
    async proposeBlock(block) {
        try {
            // Add to chain
            await this.chain.addBlock(block);
            
            // Save to storage
            await this.saveChain();
            
            // Broadcast to peers
            const message = window.SrishtiProtocol.createNewBlock(block.toJSON());
            this.broadcast(message);
            
            // Notify listeners
            this.onChainUpdate(this.chain);
            
            console.log(`✅ Block proposed: ${block.hash.substring(0, 16)}...`);
        } catch (error) {
            console.error('Failed to propose block:', error);
            throw error;
        }
    }
    
    /**
     * Save chain to storage
     */
    async saveChain() {
        const blocks = this.chain.toJSON();
        await this.storage.saveBlocks(blocks);
    }
    
    /**
     * Merge unique NODE_JOIN events from peer's chain that we don't have
     * This handles the case where chains diverged and both have valid nodes
     * @param {Array} receivedBlocks - Blocks from peer's chain
     * @param {string} peerId - Peer's node ID
     */
    async mergeUniqueNodes(receivedBlocks, peerId) {
        if (!receivedBlocks || receivedBlocks.length === 0) return;
        
        try {
            // Build map of nodes we already have
            const ourNodeMap = this.chain.buildNodeMap();
            const ourNodeIds = new Set(Object.keys(ourNodeMap));
            
            console.log(`🔀 Checking for unique nodes from ${peerId}. Our nodes:`, Array.from(ourNodeIds));
            
            // Find NODE_JOIN events in their chain that we don't have
            const missingJoins = [];
            
            for (const blockData of receivedBlocks) {
                const eventData = blockData.data;
                
                // Check if this is a NODE_JOIN event
                if (eventData && eventData.type === 'NODE_JOIN') {
                    const nodeId = eventData.nodeId;
                    
                    // If we don't have this node, add it to missing list
                    if (!ourNodeIds.has(nodeId)) {
                        console.log(`🆕 Found missing node: ${eventData.name} (${nodeId})`);
                        missingJoins.push(eventData);
                    }
                }
            }
            
            if (missingJoins.length === 0) {
                console.log(`✅ No missing nodes to merge from ${peerId}`);
                return;
            }
            
            console.log(`🔀 Merging ${missingJoins.length} unique nodes from ${peerId}`);
            
            // Add each missing node as a new block
            for (const joinEvent of missingJoins) {
                const nodeId = joinEvent.nodeId;
                
                // Triple-check the node doesn't exist (race condition protection)
                // Check both nodeMap and state.nodeRoles to be absolutely sure
                const currentNodeMap = this.chain.buildNodeMap();
                const existingInState = this.chain.state?.nodeRoles?.[nodeId];
                
                if (currentNodeMap[nodeId] || existingInState) {
                    console.log(`⏭️ Node ${nodeId} already exists (map: ${!!currentNodeMap[nodeId]}, state: ${!!existingInState}), skipping merge`);
                    continue;
                }
                
                // Update timestamp to now (it's being added to our chain now)
                const updatedJoinEvent = {
                    ...joinEvent,
                    timestamp: Date.now(),
                    // Reset parentId if it points to a node we don't have
                    parentId: joinEvent.parentId && ourNodeIds.has(joinEvent.parentId) 
                        ? joinEvent.parentId 
                        : null
                };
                
                const latestBlock = this.chain.getLatestBlock();
                const newBlock = new window.SrishtiBlock({
                    index: this.chain.getLength(),
                    previousHash: latestBlock.hash,
                    data: updatedJoinEvent,
                    proposer: peerId,
                    participationProof: { nodeId: nodeId, score: 0.5, timestamp: Date.now() }
                });
                
                await newBlock.computeHash();
                await this.chain.addBlock(newBlock);
                
                // Add to our known nodes for next iteration
                ourNodeIds.add(nodeId);
                
                // Broadcast the new block to other peers (exclude the peer we got it from)
                const newBlockMessage = window.SrishtiProtocol.createNewBlock(newBlock.toJSON());
                this.broadcast(newBlockMessage, peerId);
                
                console.log(`✅ Added missing node ${joinEvent.name} (${nodeId}) at index ${newBlock.index}`);
            }
            
            // Save updated chain
            await this.saveChain();
            
            // Notify UI of chain update
            this.onChainUpdate(this.chain);
            
            console.log(`✅ Merged ${missingJoins.length} nodes from ${peerId}, chain now has ${this.chain.getLength()} blocks`);
            
        } catch (error) {
            console.error(`Failed to merge nodes from ${peerId}:`, error);
        }
    }
    
    /**
     * Ensure our local node is in the chain after a chain replacement
     * If not, add our join block to the end
     */
    async ensureLocalNodeInChain() {
        if (!this.nodeId) return;
        
        // Check if our node is in the chain
        const nodeMap = this.chain.buildNodeMap();
        if (nodeMap[this.nodeId]) {
            console.log(`✅ Our node ${this.nodeId} is in the chain`);
            return;
        }
        
        console.log(`⚠️ Our node ${this.nodeId} not in chain, re-adding join block...`);
        
        // Get our node info from localStorage
        const nodeName = localStorage.getItem('srishti_node_name');
        const publicKey = localStorage.getItem('srishti_public_key');
        
        if (!nodeName || !publicKey) {
            console.error('Cannot re-add node: missing localStorage data');
            return;
        }
        
        // Create a new join event
        const joinEvent = window.SrishtiEvent.createNodeJoin({
            nodeId: this.nodeId,
            name: nodeName,
            parentId: null, // Re-joining as root (could be improved)
            publicKey: publicKey
        });
        
        // Create and add the block
        const latestBlock = this.chain.getLatestBlock();
        const newBlock = new window.SrishtiBlock({
            index: this.chain.getLength(),
            previousHash: latestBlock.hash,
            data: joinEvent,
            proposer: this.nodeId,
            participationProof: { nodeId: this.nodeId, score: 0.5, timestamp: Date.now() }
        });
        
        await newBlock.computeHash();
        await this.chain.addBlock(newBlock);
        
        // Broadcast our re-join to peers
        const message = window.SrishtiProtocol.createNewBlock(newBlock.toJSON());
        this.broadcast(message);
        
        console.log(`✅ Re-added our node to chain at index ${newBlock.index}`);
    }
    
    /**
     * Send heartbeat to all connected peers
     */
    sendHeartbeat() {
        // Collect list of nodes we know are online (including ourselves and connected peers)
        const knownOnline = [this.nodeId];
        for (const [peerId, connection] of this.peers.entries()) {
            if (connection.isConnected()) {
                knownOnline.push(peerId);
                // Mark connected peers as online in peerInfo
                const info = this.peerInfo.get(peerId) || {};
                this.peerInfo.set(peerId, {
                    ...info,
                    isOnline: true,
                    lastSeen: Date.now()
                });
                // Notify UI about this peer being online
                if (this.onPresenceUpdate) {
                    this.onPresenceUpdate(peerId, {
                        isOnline: true,
                        lastSeen: Date.now()
                    });
                }
            }
        }
        
        const heartbeat = window.SrishtiProtocol.createHeartbeat({
            nodeId: this.nodeId,
            isOnline: true,
            knownOnline: knownOnline
        });
        
        this.broadcast(heartbeat);
    }
    
    /**
     * Start heartbeat (send periodic heartbeats to peers)
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Send initial heartbeat immediately
        this.sendHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 5000); // Every 5 seconds (reduced from 30s for faster updates)
    }
    
    /**
     * Start periodic chain sync
     */
    startSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        this.syncInterval = setInterval(async () => {
            const ourChainLength = this.chain.getLength();
            const onlyHasGenesis = ourChainLength <= 1;
            
            // Request sync from peers with longer chains, OR if we only have genesis and they have more
            for (const [peerId, info] of this.peerInfo.entries()) {
                if (info.chainLength > ourChainLength || (onlyHasGenesis && info.chainLength > 1)) {
                    // Only request if we have a connection to this peer
                    if (this.peers.has(peerId)) {
                        await this.requestSync(peerId);
                    }
                }
            }
            
            // Also attempt pending connections periodically
            this.attemptPendingConnections();
        }, 10000); // Every 10 seconds for responsive sync
    }
    
    /**
     * Add a pending connection (a node we want to connect to)
     * @param {string} nodeId - Node ID to connect to
     * @param {string} publicKey - Node's public key (base64)
     */
    addPendingConnection(nodeId, publicKey) {
        if (this.peers.has(nodeId)) {
            console.log(`⏭️ Already connected to ${nodeId}`);
            return;
        }
        
        this.pendingConnections.set(nodeId, {
            publicKey: publicKey,
            timestamp: Date.now()
        });
        console.log(`📝 Added pending connection to ${nodeId}`);
        
        // Attempt connection immediately if signaling is ready
        if (this.signaling && this.signaling.isConnected()) {
            this.attemptConnection(nodeId, publicKey);
        } else {
            console.log(`⏳ Signaling not ready, will connect when available`);
        }
    }
    
    /**
     * Attempt all pending connections
     */
    async attemptPendingConnections() {
        if (!this.signaling || !this.signaling.isConnected()) {
            return; // Wait for signaling to be ready
        }
        
        for (const [nodeId, info] of this.pendingConnections.entries()) {
            if (!this.peers.has(nodeId) && !this.pendingOffers.has(nodeId)) {
                await this.attemptConnection(nodeId, info.publicKey);
            }
        }
    }
    
    /**
     * Attempt to connect to a specific node
     * @param {string} nodeId - Node ID to connect to
     * @param {string} publicKey - Node's public key
     */
    async attemptConnection(nodeId, publicKey) {
        console.log(`🔄 attemptConnection called for ${nodeId}`);
        
        if (this.peers.has(nodeId)) {
            console.log(`⏭️ Already connected to ${nodeId}`);
            return;
        }
        
        if (this.pendingOffers.has(nodeId)) {
            console.log(`⏭️ Already have pending offer to ${nodeId}`);
            return;
        }
        
        if (!this.signaling || !this.signaling.isConnected()) {
            console.log(`⏳ Cannot connect to ${nodeId}: signaling not ready`);
            return;
        }
        
        if (!window.SrishtiPeerConnection) {
            console.error('❌ PeerConnection not loaded');
            return;
        }
        
        console.log(`🔌 Creating WebRTC connection to ${nodeId}...`);
        
        try {
            const connection = new window.SrishtiPeerConnection({
                nodeId: this.nodeId,
                onMessage: (message, peerId) => this.handleMessage(message, peerId),
                onConnectionStateChange: (state) => {
                    console.log(`📶 Connection state to ${nodeId}: ${state}`);
                    if (state === 'data_channel_open') {
                        this.pendingOffers.delete(nodeId);
                        this.pendingConnections.delete(nodeId);
                        console.log(`🎉 Data channel open with ${nodeId}! Syncing...`);
                        // Mark as online immediately
                        const info = this.peerInfo.get(nodeId) || {};
                        this.peerInfo.set(nodeId, {
                            ...info,
                            isOnline: true,
                            lastSeen: Date.now()
                        });
                        if (this.onPresenceUpdate) {
                            this.onPresenceUpdate(nodeId, {
                                isOnline: true,
                                lastSeen: Date.now()
                            });
                        }
                        // Send immediate heartbeat
                        this.sendHeartbeat();
                        
                        // Send rapid heartbeats for first 10 seconds to ensure presence is synced
                        let rapidHeartbeatCount = 0;
                        const rapidHeartbeat = setInterval(() => {
                            if (!this.peers.has(nodeId)) {
                                clearInterval(rapidHeartbeat);
                                return;
                            }
                            this.sendHeartbeat();
                            rapidHeartbeatCount++;
                            if (rapidHeartbeatCount >= 10) {
                                clearInterval(rapidHeartbeat);
                            }
                        }, 1000); // Every 1 second for first 10 seconds
                        
                        // Wait a moment for HELLO exchange before requesting sync
                        // This ensures we have accurate chain info from the peer
                        setTimeout(async () => {
                            if (this.peers.has(nodeId) && this.peers.get(nodeId).isConnected()) {
                                console.log(`🔄 Requesting sync from ${nodeId} after connection established...`);
                                await this.requestSync(nodeId);
                            }
                        }, 500);
                    } else if (state === 'data_channel_closed' || state === 'data_channel_error' ||
                               state === 'disconnected' || state === 'failed') {
                        this.pendingOffers.delete(nodeId);
                        // Retry if the connection failed before data channel opened
                        const shouldRetry = state === 'failed';
                        console.log(`🔌 Connection ${state} for ${nodeId} (offerer), retry=${shouldRetry}`);
                        this.disconnectPeer(nodeId, shouldRetry);
                    }
                },
                onIceCandidate: (candidate) => {
                    if (this.signaling && candidate) {
                        console.log(`🧊 Sending ICE candidate to ${nodeId}`);
                        this.signaling.sendIceCandidate(nodeId, candidate);
                    }
                }
            });
            
            // Set remote node ID for message handling
            connection.remoteNodeId = nodeId;
            
            // Create offer
            console.log(`📝 Creating WebRTC offer for ${nodeId}...`);
            const offer = await connection.initAsOfferer();
            this.pendingOffers.set(nodeId, connection);
            
            // Send offer via signaling
            console.log(`📤 Sending offer to ${nodeId} via signaling...`);
            this.signaling.sendOffer(nodeId, offer);
            
            console.log(`✅ Offer sent to ${nodeId}`);
        } catch (error) {
            console.error(`Failed to connect to ${nodeId}:`, error);
            this.pendingOffers.delete(nodeId);
        }
    }
    
    /**
     * Get connected peers
     * @returns {Array<string>} - Array of peer IDs
     */
    getConnectedPeers() {
        return Array.from(this.peers.keys());
    }
    
    /**
     * Get peer count
     * @returns {number}
     */
    getPeerCount() {
        return this.peers.size;
    }
    
    /**
     * Close all connections
     */
    close() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        if (this.signaling) {
            this.signaling.disconnect();
        }
        
        if (this.dht) {
            this.dht.close();
        }
        
        if (this.connectionManager) {
            this.connectionManager.close();
        }
        
        for (const [peerId, connection] of this.peers.entries()) {
            connection.close();
        }
        
        this.peers.clear();
        this.peerInfo.clear();
        this.pendingOffers.clear();
        this.pendingIceCandidates.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Network;
} else {
    window.SrishtiNetwork = Network;
}
