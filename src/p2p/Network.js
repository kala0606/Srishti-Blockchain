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
                        // Request sync
                        this.requestSync(fromNodeId);
                    } else if (state === 'data_channel_closed' || state === 'data_channel_error' || 
                               state === 'disconnected' || state === 'failed') {
                        this.disconnectPeer(fromNodeId);
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
        
        const connection = this.peers.get(fromNodeId);
        if (connection) {
            await connection.addIceCandidate(candidate);
        }
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
                        this.disconnectPeer(peerInfo.nodeId);
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
    }
    
    /**
     * Disconnect from a peer
     * @param {string} nodeId - Peer's node ID
     */
    disconnectPeer(nodeId) {
        const connection = this.peers.get(nodeId);
        if (connection) {
            connection.close();
            this.peers.delete(nodeId);
            
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
        }
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
            case window.SrishtiProtocol.MESSAGE_TYPES.NEW_BLOCK:
                await this.handleNewBlock(message, peerId);
                break;
            case window.SrishtiProtocol.MESSAGE_TYPES.HEARTBEAT:
                this.handleHeartbeat(message, peerId);
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
        
        // Request sync if peer has longer chain
        if (message.chainLength > this.chain.getLength()) {
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
        
        try {
            this.syncing = true;
            
            const receivedBlocks = message.blocks;
            if (!receivedBlocks || receivedBlocks.length === 0) {
                console.log(`📭 No blocks received`);
                return;
            }
            
            const ourLength = this.chain.getLength();
            const theirLength = receivedBlocks.length;
            
            console.log(`📊 Chain comparison: ours=${ourLength}, theirs=${theirLength}`);
            
            // If their chain is longer, replace ours
            if (theirLength > ourLength) {
                console.log(`📥 Their chain is longer, replacing ours...`);
                
                // IMPORTANT: Save our current nodes BEFORE replacing chain
                // We might have unique nodes they don't have
                const ourOldBlocks = this.chain.toJSON();
                
                await this.chain.replaceChain(receivedBlocks);
                
                // Ensure our local node is in the chain (for returning users)
                await this.ensureLocalNodeInChain();
                
                // Merge back any unique nodes we had
                await this.mergeUniqueNodes(ourOldBlocks, 'self');
                
                await this.saveChain();
                this.onChainUpdate(this.chain);
                console.log(`✅ Chain replaced with ${this.chain.getLength()} blocks from ${peerId}`);
            } 
            // If same length, use deterministic tie-breaker (earlier genesis timestamp wins)
            else if (theirLength === ourLength && theirLength > 1) {
                const ourGenesis = this.chain.blocks[0];
                const theirGenesis = receivedBlocks[0];
                
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
        } finally {
            this.syncing = false;
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
     * Request chain sync from peer
     * @param {string} peerId - Peer's node ID
     */
    async requestSync(peerId) {
        console.log(`📤 requestSync called for ${peerId}`);
        
        const connection = this.peers.get(peerId);
        if (!connection) {
            console.log(`❌ No connection found for ${peerId} in peers map`);
            console.log(`📊 Current peers:`, Array.from(this.peers.keys()));
            return;
        }
        
        if (!connection.isConnected()) {
            console.log(`❌ Connection to ${peerId} is not open`);
            return;
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
                    participationProof: { nodeId: joinEvent.nodeId, score: 0.5, timestamp: Date.now() }
                });
                
                await newBlock.computeHash();
                await this.chain.addBlock(newBlock);
                
                // Add to our known nodes for next iteration
                ourNodeIds.add(joinEvent.nodeId);
                
                // Broadcast the new block to other peers (exclude the peer we got it from)
                const newBlockMessage = window.SrishtiProtocol.createNewBlock(newBlock.toJSON());
                this.broadcast(newBlockMessage, peerId);
                
                console.log(`✅ Added missing node ${joinEvent.name} (${joinEvent.nodeId}) at index ${newBlock.index}`);
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
            // Request sync from peers with longer chains
            for (const [peerId, info] of this.peerInfo.entries()) {
                if (info.chainLength > this.chain.getLength()) {
                    await this.requestSync(peerId);
                }
            }
            
            // Also attempt pending connections periodically
            this.attemptPendingConnections();
        }, 15000); // Every 15 seconds (reduced from 60s for faster sync)
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
                        // Request sync
                        this.requestSync(nodeId);
                    } else if (state === 'data_channel_closed' || state === 'data_channel_error' ||
                               state === 'disconnected' || state === 'failed') {
                        this.pendingOffers.delete(nodeId);
                        this.disconnectPeer(nodeId);
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
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Network;
} else {
    window.SrishtiNetwork = Network;
}
