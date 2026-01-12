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
        
        this.peers = new Map(); // Map<nodeId, PeerConnection>
        this.peerInfo = new Map(); // Map<nodeId, {publicKey, chainLength, latestHash}>
        
        this.syncing = false;
        this.heartbeatInterval = null;
        this.syncInterval = null;
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
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Start periodic sync
        this.startSync();
        
        console.log('🌐 Network initialized');
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
        
        // Send HELLO message
        const hello = window.SrishtiProtocol.createHello({
            nodeId: this.nodeId,
            publicKey: null, // TODO: encode public key
            chainLength: this.chain.getLength(),
            latestHash: this.chain.getLatestBlock()?.hash || null
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
            this.peerInfo.delete(nodeId);
            console.log(`📡 Disconnected from ${nodeId}`);
        }
    }
    
    /**
     * Handle incoming message from peer
     * @param {Object} message - Message object
     * @param {string} peerId - Peer's node ID
     */
    async handleMessage(message, peerId) {
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
        this.peerInfo.set(peerId, {
            publicKey: message.publicKey,
            chainLength: message.chainLength,
            latestHash: message.latestHash
        });
        
        // Request sync if peer has longer chain
        if (message.chainLength > this.chain.getLength()) {
            await this.requestSync(peerId);
        }
    }
    
    /**
     * Handle SYNC_REQUEST
     */
    async handleSyncRequest(message, peerId) {
        const connection = this.peers.get(peerId);
        if (!connection) return;
        
        const fromIndex = message.fromIndex || 0;
        const blocks = this.chain.blocks.slice(fromIndex);
        
        const response = window.SrishtiProtocol.createSyncResponse({
            blocks: blocks.map(b => b.toJSON()),
            chainLength: this.chain.getLength()
        });
        
        connection.send(response);
    }
    
    /**
     * Handle SYNC_RESPONSE
     */
    async handleSyncResponse(message, peerId) {
        if (this.syncing) return; // Avoid concurrent syncs
        
        try {
            this.syncing = true;
            
            const receivedBlocks = message.blocks;
            if (receivedBlocks.length === 0) return;
            
            // Validate and replace chain
            await this.chain.replaceChain(receivedBlocks);
            
            // Save to storage
            await this.saveChain();
            
            // Notify listeners
            this.onChainUpdate(this.chain);
            
            console.log(`✅ Synced chain from ${peerId}: ${receivedBlocks.length} blocks`);
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
            
            // Validate block
            if (!block.isValid()) {
                console.warn(`Invalid block from ${peerId}`);
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
            
            console.log(`✅ New block received from ${peerId}`);
        } catch (error) {
            console.error(`Failed to add block from ${peerId}:`, error);
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
    }
    
    /**
     * Request chain sync from peer
     * @param {string} peerId - Peer's node ID
     */
    async requestSync(peerId) {
        const connection = this.peers.get(peerId);
        if (!connection) return;
        
        const request = window.SrishtiProtocol.createSyncRequest({
            fromIndex: this.chain.getLength(),
            chainLength: this.chain.getLength(),
            latestHash: this.chain.getLatestBlock()?.hash || null
        });
        
        connection.send(request);
    }
    
    /**
     * Broadcast message to all peers (except sender)
     * @param {Object} message - Message to broadcast
     * @param {string} excludePeerId - Peer ID to exclude
     */
    broadcast(message, excludePeerId = null) {
        for (const [peerId, connection] of this.peers.entries()) {
            if (peerId !== excludePeerId && connection.isConnected()) {
                connection.send(message);
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
     * Start heartbeat (send periodic heartbeats to peers)
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            const heartbeat = window.SrishtiProtocol.createHeartbeat({
                nodeId: this.nodeId,
                isOnline: true
            });
            
            this.broadcast(heartbeat);
        }, 30000); // Every 30 seconds
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
        }, 60000); // Every minute
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
        
        for (const [peerId, connection] of this.peers.entries()) {
            connection.close();
        }
        
        this.peers.clear();
        this.peerInfo.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Network;
} else {
    window.SrishtiNetwork = Network;
}
