/**
 * Srishti Blockchain - P2P Network (WebSocket Relay)
 * 
 * Manages peer connections, chain synchronization, and block propagation.
 * Uses WebSocket relay server instead of WebRTC for simpler, more reliable P2P.
 * 
 * Architecture:
 *   Node A ←→ Relay Server ←→ Node B
 *   (All messages flow through server)
 */

class Network {
    /**
     * Create a new network instance
     * @param {Object} options
     * @param {string} options.nodeId - This node's ID
     * @param {CryptoKey} options.publicKey - This node's public key
     * @param {Chain} options.chain - Chain instance
     * @param {IndexedDBStore} options.storage - Storage instance
     * @param {string} options.relayServerUrl - Relay server WebSocket URL
     * @param {Function} options.onChainUpdate - Callback when chain updates
     * @param {Function} options.onPresenceUpdate - Callback for presence changes
     * @param {Function} options.onSyncProgress - Callback for sync progress
     */
    constructor(options) {
        this.nodeId = options.nodeId;
        this.publicKey = options.publicKey;
        this.chain = options.chain;
        this.storage = options.storage;
        this.relayServerUrl = options.relayServerUrl || options.signalingServerUrl; // Backward compat
        
        // Callbacks
        this.onChainUpdate = options.onChainUpdate || (() => {});
        this.onPresenceUpdate = options.onPresenceUpdate || null;
        this.onSyncProgress = options.onSyncProgress || null;
        this.onParentRequest = options.onParentRequest || null;
        this.onParentResponse = options.onParentResponse || null;
        
        // WebSocket client (replaces WebRTC)
        this.wsClient = null;
        
        // Peer info (presence, chain state)
        this.peerInfo = new Map(); // nodeId -> {chainLength, chainEpoch, isOnline, lastSeen}
        
        // State
        this.syncing = false;
        this.merging = false;
        this.heartbeatInterval = null;
        this.syncInterval = null;
        
        // Protocol version for compatibility
        this.protocolVersion = window.SrishtiConfig?.PROTOCOL_VERSION || 2;
        
        // Chain epoch for network reset compatibility
        this.chainEpoch = window.SrishtiConfig?.CHAIN_EPOCH || 1;
        
        // Stats
        this.compatiblePeerCount = 0;
        this.rejectedPeerCount = 0;
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
            this.chain.blocks = chain.blocks;
        } else {
            // Create genesis block if no chain exists
            await this.chain.createGenesisBlock();
            await this.saveChain();
        }
        
        // Initialize WebSocket client
        if (this.relayServerUrl && window.SrishtiWebSocketClient) {
            await this.initWebSocket();
        }
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Start periodic sync
        this.startSync();
        
        console.log(`🌐 Network initialized (Chain Epoch: ${this.chainEpoch})`);
        console.log(`   Transport: WebSocket Relay`);
        console.log(`   Peers with different epochs will be automatically rejected.`);
    }
    
    /**
     * Initialize WebSocket connection to relay server
     */
    async initWebSocket() {
        try {
            this.wsClient = new window.SrishtiWebSocketClient({
                serverUrl: this.relayServerUrl,
                nodeId: this.nodeId,
                chainLength: this.chain.getLength(),
                chainEpoch: this.chainEpoch,
                
                // Handle incoming P2P messages
                onMessage: (payload, fromNodeId) => {
                    this.handleMessage(payload, fromNodeId);
                },
                
                // Peer joined the network
                onPeerJoined: (nodeId, info) => {
                    console.log(`🟢 Peer joined: ${nodeId}`);
                    
                    // Check epoch compatibility
                    if (info.chainEpoch && info.chainEpoch !== this.chainEpoch) {
                        console.warn(`⚠️ Peer ${nodeId} has different epoch (${info.chainEpoch} vs ${this.chainEpoch}), ignoring`);
                        this.rejectedPeerCount++;
                        return;
                    }
                    
                    this.compatiblePeerCount++;
                    this.peerInfo.set(nodeId, {
                        chainLength: info.chainLength || 0,
                        chainEpoch: info.chainEpoch || this.chainEpoch,
                        isOnline: true,
                        lastSeen: Date.now()
                    });
                    
                    if (this.onPresenceUpdate) {
                        this.onPresenceUpdate(nodeId, { isOnline: true, lastSeen: Date.now() });
                    }
                    
                    // Send HELLO to new peer
                    this.sendHello(nodeId);
                },
                
                // Peer left the network
                onPeerLeft: (nodeId) => {
                    console.log(`🔴 Peer left: ${nodeId}`);
                    const info = this.peerInfo.get(nodeId);
                    if (info) {
                        this.peerInfo.set(nodeId, { ...info, isOnline: false, lastSeen: Date.now() });
                    }
                    if (this.onPresenceUpdate) {
                        this.onPresenceUpdate(nodeId, { isOnline: false, lastSeen: Date.now() });
                    }
                },
                
                // Initial peer list received
                onPeersUpdated: (peers) => {
                    // Update presence for all peers
                    for (const peer of peers) {
                        if (peer.chainEpoch && peer.chainEpoch !== this.chainEpoch) {
                            continue; // Skip incompatible peers
                        }
                        
                        this.peerInfo.set(peer.nodeId, {
                            chainLength: peer.chainLength || 0,
                            chainEpoch: peer.chainEpoch || this.chainEpoch,
                            isOnline: true,
                            lastSeen: Date.now()
                        });
                        
                        if (this.onPresenceUpdate) {
                            this.onPresenceUpdate(peer.nodeId, { isOnline: true, lastSeen: Date.now() });
                        }
                    }
                },
                
                // Connected to relay server
                onConnected: (peerIds) => {
                    console.log(`✅ Connected to relay. ${peerIds.length} peers online.`);
                    
                    // Send HELLO to all peers
                    for (const peerId of peerIds) {
                        this.sendHello(peerId);
                    }
                    
                    // Request sync from peers with longer chains
                    setTimeout(() => this.syncWithBestPeer(), 1000);
                },
                
                // Disconnected from relay server
                onDisconnected: () => {
                    console.log('⚠️ Disconnected from relay server');
                    // Mark all peers as potentially offline
                    for (const [nodeId, info] of this.peerInfo.entries()) {
                        if (info.isOnline) {
                            this.peerInfo.set(nodeId, { ...info, isOnline: false });
                            if (this.onPresenceUpdate) {
                                this.onPresenceUpdate(nodeId, { isOnline: false, lastSeen: info.lastSeen });
                            }
                        }
                    }
                }
            });
            
            await this.wsClient.connect();
            console.log('✅ WebSocket relay client connected');
        } catch (error) {
            console.warn('⚠️ Failed to connect to relay server:', error);
            this.wsClient = null;
        }
    }
    
    /**
     * Send HELLO message to a peer
     */
    sendHello(peerId) {
        if (!this.wsClient || !window.SrishtiProtocol) return;
        
        const hello = window.SrishtiProtocol.createHello({
            nodeId: this.nodeId,
            publicKey: null,
            chainLength: this.chain.getLength(),
            latestHash: this.chain.getLatestBlock()?.hash || null,
            protocolVersion: this.protocolVersion,
            chainEpoch: this.chainEpoch
        });
        
        this.wsClient.sendToPeer(peerId, hello);
    }
    
    /**
     * Handle incoming P2P message
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
        // Check epoch compatibility
        const theirEpoch = message.chainEpoch || 1;
        if (theirEpoch !== this.chainEpoch) {
            console.warn(`🚫 Rejecting peer ${peerId}: Chain epoch mismatch (ours: ${this.chainEpoch}, theirs: ${theirEpoch})`);
            this.rejectedPeerCount++;
            return;
        }
        
        this.compatiblePeerCount++;
        
        // Update peer info
        this.peerInfo.set(peerId, {
            publicKey: message.publicKey,
            chainLength: message.chainLength,
            latestHash: message.latestHash,
            protocolVersion: message.protocolVersion || 1,
            chainEpoch: theirEpoch,
            isOnline: true,
            lastSeen: Date.now()
        });
        
        if (this.onPresenceUpdate) {
            this.onPresenceUpdate(peerId, { isOnline: true, lastSeen: Date.now() });
        }
        
        // Check if we should sync
        const ourChainLength = this.chain.getLength();
        const shouldSync = message.chainLength > ourChainLength || 
                          (ourChainLength <= 1 && message.chainLength > 1);
        
        if (shouldSync) {
            console.log(`📥 Peer ${peerId} has longer chain (${message.chainLength} vs ${ourChainLength}), syncing...`);
            await this.requestSync(peerId);
        } else {
            // Even if same length, sync to merge unique nodes
            await this.requestSync(peerId);
        }
    }
    
    /**
     * Handle SYNC_REQUEST
     */
    async handleSyncRequest(message, peerId) {
        console.log(`📥 SYNC_REQUEST from ${peerId}`);
        
        const fromIndex = message.fromIndex || 0;
        const blocks = this.chain.blocks.slice(fromIndex);
        
        const response = window.SrishtiProtocol.createSyncResponse({
            blocks: blocks.map(b => b.toJSON()),
            chainLength: this.chain.getLength()
        });
        
        this.wsClient.sendToPeer(peerId, response);
        console.log(`📤 Sent ${blocks.length} blocks to ${peerId}`);
    }
    
    /**
     * Handle SYNC_RESPONSE
     */
    async handleSyncResponse(message, peerId) {
        console.log(`📥 SYNC_RESPONSE from ${peerId}: ${message.blocks?.length || 0} blocks`);
        
        if (this.syncing) {
            console.log('⏳ Already syncing, ignoring');
            return;
        }
        
        // Timeout protection
        const syncTimeout = setTimeout(() => {
            if (this.syncing) {
                console.warn('⚠️ Sync timeout - resetting');
                this.syncing = false;
                if (this.onSyncProgress) {
                    this.onSyncProgress({ status: 'idle', message: 'Sync timeout' });
                }
            }
        }, 30000);
        
        try {
            this.syncing = true;
            
            const receivedBlocks = message.blocks;
            if (!receivedBlocks || receivedBlocks.length === 0) {
                console.log('📭 No blocks received');
                if (this.onSyncProgress) this.onSyncProgress({ status: 'idle' });
                return;
            }
            
            const ourLength = this.chain.getLength();
            const theirLength = receivedBlocks.length;
            
            // Progress callback
            if (this.onSyncProgress) {
                this.onSyncProgress({
                    status: 'syncing',
                    current: ourLength,
                    total: theirLength,
                    message: `Syncing ${theirLength} blocks...`
                });
            }
            
            // Validate chain epoch
            if (theirLength > 0) {
                const theirGenesis = receivedBlocks[0];
                const theirChainEpoch = theirGenesis?.data?.chainEpoch || 1;
                
                if (theirChainEpoch !== this.chainEpoch) {
                    console.warn(`🚫 Rejecting chain: epoch mismatch (${theirChainEpoch} vs ${this.chainEpoch})`);
                    return;
                }
            }
            
            // Their chain is longer - replace ours
            if (theirLength > ourLength) {
                console.log(`📥 Replacing chain (${ourLength} → ${theirLength})`);
                
                const ourOldBlocks = this.chain.toJSON();
                await this.chain.replaceChain(receivedBlocks);
                await this.ensureLocalNodeInChain();
                await this.mergeUniqueNodes(ourOldBlocks, 'self');
                await this.saveChain();
                this.onChainUpdate(this.chain);
                
                // Update server with new chain length
                if (this.wsClient) {
                    this.wsClient.updateState({ chainLength: this.chain.getLength() });
                }
                
                console.log(`✅ Chain replaced: ${this.chain.getLength()} blocks`);
            }
            // Same length - merge unique nodes
            else if (theirLength === ourLength && theirLength > 1) {
                const ourGenesis = this.chain.blocks[0];
                const theirGenesis = receivedBlocks[0];
                
                // Earlier genesis wins tie
                if (theirGenesis.timestamp < ourGenesis.timestamp ||
                    (theirGenesis.timestamp === ourGenesis.timestamp && theirGenesis.hash < ourGenesis.hash)) {
                    const ourOldBlocks = this.chain.toJSON();
                    await this.chain.replaceChain(receivedBlocks);
                    await this.ensureLocalNodeInChain();
                    await this.mergeUniqueNodes(ourOldBlocks, 'self');
                    await this.saveChain();
                    this.onChainUpdate(this.chain);
                } else {
                    await this.mergeUniqueNodes(receivedBlocks, peerId);
                }
            } else {
                // Our chain is longer - just merge unique nodes
                await this.mergeUniqueNodes(receivedBlocks, peerId);
            }
            
            if (this.onSyncProgress) {
                this.onSyncProgress({
                    status: 'complete',
                    current: this.chain.getLength(),
                    total: this.chain.getLength(),
                    message: `Synced ${this.chain.getLength()} blocks`
                });
            }
            
        } catch (error) {
            console.error(`Sync failed:`, error);
            if (this.onSyncProgress) {
                this.onSyncProgress({ status: 'error', message: error.message });
            }
        } finally {
            clearTimeout(syncTimeout);
            this.syncing = false;
            
            if (this.onSyncProgress) {
                setTimeout(() => {
                    if (!this.syncing) this.onSyncProgress({ status: 'idle' });
                }, 2000);
            }
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
            
            if (!block.isValid()) {
                console.warn(`Invalid block from ${peerId}`);
                return;
            }
            
            // Block is behind or ahead
            if (block.index < expectedIndex) {
                return; // Stale block
            }
            
            if (block.index > expectedIndex) {
                await this.requestSync(peerId);
                return;
            }
            
            // Check previous hash
            const latestBlock = this.chain.getLatestBlock();
            if (latestBlock && block.previousHash !== latestBlock.hash) {
                await this.requestSync(peerId);
                return;
            }
            
            // Prevent duplicate NODE_JOIN
            if (block.data?.type === 'NODE_JOIN') {
                const nodeId = block.data.nodeId;
                const nodeMap = this.chain.buildNodeMap();
                if (nodeMap[nodeId] || this.chain.state?.nodeRoles?.[nodeId]) {
                    console.log(`🚫 Ignoring duplicate NODE_JOIN for ${nodeId}`);
                    return;
                }
            }
            
            const added = await this.chain.addBlock(block);
            if (!added) {
                console.log('⏭️ Block rejected');
                return;
            }
            
            await this.saveChain();
            
            // Broadcast to other peers (relay will handle this)
            this.broadcast(message, peerId);
            
            // Update server state
            if (this.wsClient) {
                this.wsClient.updateState({ chainLength: this.chain.getLength() });
            }
            
            this.onChainUpdate(this.chain);
            console.log(`✅ New block ${block.index} from ${peerId}`);
            
        } catch (error) {
            console.error(`Failed to process block:`, error);
            await this.requestSync(peerId);
        }
    }
    
    /**
     * Handle HEARTBEAT
     */
    handleHeartbeat(message, peerId) {
        this.peerInfo.set(peerId, {
            ...this.peerInfo.get(peerId),
            lastSeen: message.timestamp,
            isOnline: message.isOnline
        });
        
        if (this.onPresenceUpdate) {
            this.onPresenceUpdate(peerId, {
                isOnline: message.isOnline,
                lastSeen: message.timestamp
            });
        }
        
        // Gossip about known online nodes
        if (message.knownOnline && Array.isArray(message.knownOnline)) {
            for (const nodeId of message.knownOnline) {
                if (nodeId !== this.nodeId && !this.peerInfo.has(nodeId)) {
                    if (this.onPresenceUpdate) {
                        this.onPresenceUpdate(nodeId, { isOnline: true, lastSeen: Date.now() });
                    }
                }
            }
        }
    }
    
    /**
     * Handle PARENT_REQUEST
     */
    async handleParentRequest(message, peerId) {
        console.log(`📥 PARENT_REQUEST from ${peerId}`);
        
        if (message.parentId !== this.nodeId) return;
        
        if (this.onParentRequest) {
            this.onParentRequest({
                nodeId: message.nodeId || peerId,
                parentId: message.parentId,
                reason: message.reason,
                metadata: message.metadata
            });
        }
    }
    
    /**
     * Handle PARENT_RESPONSE
     */
    async handleParentResponse(message, peerId) {
        console.log(`📥 PARENT_RESPONSE from ${peerId}: ${message.approved ? 'approved' : 'rejected'}`);
        
        if (message.requestNodeId !== this.nodeId) return;
        
        if (this.onParentResponse) {
            this.onParentResponse({
                parentId: message.parentId,
                approved: message.approved,
                reason: message.reason
            });
        }
    }
    
    /**
     * Request sync from a peer
     */
    async requestSync(peerId) {
        if (!this.wsClient || !this.wsClient.isConnected()) {
            if (this.onSyncProgress) {
                this.onSyncProgress({ status: 'connecting', message: 'Connecting to peers...', progress: 10 });
            }
            return;
        }
        
        if (this.onSyncProgress) {
            this.onSyncProgress({ status: 'syncing', message: 'Requesting blockchain data...', progress: 30 });
        }
        
        const request = window.SrishtiProtocol.createSyncRequest({
            fromIndex: 0,
            chainLength: this.chain.getLength(),
            latestHash: this.chain.getLatestBlock()?.hash || null
        });
        
        this.wsClient.sendToPeer(peerId, request);
        console.log(`📤 SYNC_REQUEST sent to ${peerId}`);
    }
    
    /**
     * Sync with the peer that has the longest chain
     */
    async syncWithBestPeer() {
        if (!this.wsClient) return;
        
        let bestPeer = null;
        let bestLength = this.chain.getLength();
        
        for (const [nodeId, info] of this.peerInfo.entries()) {
            if (info.isOnline && info.chainLength > bestLength && info.chainEpoch === this.chainEpoch) {
                bestPeer = nodeId;
                bestLength = info.chainLength;
            }
        }
        
        if (bestPeer) {
            console.log(`🔄 Syncing with ${bestPeer} (${bestLength} blocks)`);
            await this.requestSync(bestPeer);
        }
    }
    
    /**
     * Broadcast message to all peers
     */
    broadcast(message, excludePeerId = null) {
        if (!this.wsClient || !this.wsClient.isConnected()) return;
        
        // Use server-side broadcast (more efficient)
        this.wsClient.broadcast(message);
    }
    
    /**
     * Send to specific peer
     */
    sendToPeer(peerId, message) {
        if (!this.wsClient || !this.wsClient.isConnected()) return false;
        return this.wsClient.sendToPeer(peerId, message);
    }
    
    /**
     * Propose a new block
     */
    async proposeBlock(block) {
        try {
            const added = await this.chain.addBlock(block);
            
            if (!added) {
                console.warn('⚠️ Block rejected');
                return false;
            }
            
            await this.saveChain();
            
            // Broadcast to network
            const message = window.SrishtiProtocol.createNewBlock(block.toJSON());
            this.broadcast(message);
            
            // Update server state
            if (this.wsClient) {
                this.wsClient.updateState({ chainLength: this.chain.getLength() });
            }
            
            this.onChainUpdate(this.chain);
            console.log(`✅ Block proposed: ${block.hash.substring(0, 16)}...`);
            return true;
            
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
     * Merge unique NODE_JOIN events from another chain
     */
    async mergeUniqueNodes(receivedBlocks, peerId) {
        if (!receivedBlocks || receivedBlocks.length === 0) return;
        
        if (this.merging) {
            console.log('⏳ Already merging, skipping');
            return;
        }
        
        try {
            this.merging = true;
            
            const ourNodeMap = this.chain.buildNodeMap();
            const ourNodeIds = new Set(Object.keys(ourNodeMap));
            const missingJoinsMap = new Map();
            
            for (const blockData of receivedBlocks) {
                const eventData = blockData.data;
                
                if (eventData?.type === 'NODE_JOIN') {
                    const nodeId = eventData.nodeId;
                    
                    if (!ourNodeIds.has(nodeId) && !missingJoinsMap.has(nodeId)) {
                        console.log(`🆕 Found missing node: ${eventData.name} (${nodeId})`);
                        missingJoinsMap.set(nodeId, eventData);
                    }
                }
            }
            
            const missingJoins = Array.from(missingJoinsMap.values());
            
            if (missingJoins.length === 0) return;
            
            console.log(`🔀 Merging ${missingJoins.length} unique nodes from ${peerId}`);
            
            let addedCount = 0;
            
            for (const joinEvent of missingJoins) {
                const nodeId = joinEvent.nodeId;
                
                // Triple-check
                const currentNodeMap = this.chain.buildNodeMap();
                if (currentNodeMap[nodeId] || this.chain.state?.nodeRoles?.[nodeId]) {
                    continue;
                }
                
                const updatedJoinEvent = {
                    ...joinEvent,
                    timestamp: Date.now(),
                    parentId: joinEvent.parentId && ourNodeIds.has(joinEvent.parentId) ? joinEvent.parentId : null
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
                
                const added = await this.chain.addBlock(newBlock);
                if (!added) continue;
                
                addedCount++;
                ourNodeIds.add(nodeId);
                
                // Broadcast
                const newBlockMessage = window.SrishtiProtocol.createNewBlock(newBlock.toJSON());
                this.broadcast(newBlockMessage, peerId);
                
                console.log(`✅ Added missing node ${joinEvent.name}`);
            }
            
            if (addedCount > 0) {
                await this.saveChain();
                
                if (this.wsClient) {
                    this.wsClient.updateState({ chainLength: this.chain.getLength() });
                }
                
                this.onChainUpdate(this.chain);
                console.log(`✅ Merged ${addedCount} nodes, chain now has ${this.chain.getLength()} blocks`);
            }
            
        } catch (error) {
            console.error('Failed to merge nodes:', error);
        } finally {
            this.merging = false;
        }
    }
    
    /**
     * Ensure our local node is in the chain
     */
    async ensureLocalNodeInChain() {
        if (!this.nodeId) return;
        
        const nodeMap = this.chain.buildNodeMap();
        if (nodeMap[this.nodeId] || this.chain.state?.nodeRoles?.[this.nodeId]) {
            return;
        }
        
        console.log(`⚠️ Our node not in chain, re-adding...`);
        
        const nodeName = localStorage.getItem('srishti_node_name');
        const publicKey = localStorage.getItem('srishti_public_key');
        
        if (!nodeName || !publicKey) {
            console.error('Cannot re-add: missing localStorage data');
            return;
        }
        
        const joinEvent = window.SrishtiEvent.createNodeJoin({
            nodeId: this.nodeId,
            name: nodeName,
            parentId: null,
            publicKey: publicKey
        });
        
        const latestBlock = this.chain.getLatestBlock();
        const newBlock = new window.SrishtiBlock({
            index: this.chain.getLength(),
            previousHash: latestBlock.hash,
            data: joinEvent,
            proposer: this.nodeId,
            participationProof: { nodeId: this.nodeId, score: 0.5, timestamp: Date.now() }
        });
        
        await newBlock.computeHash();
        
        const added = await this.chain.addBlock(newBlock);
        if (!added) return;
        
        const message = window.SrishtiProtocol.createNewBlock(newBlock.toJSON());
        this.broadcast(message);
        
        console.log(`✅ Re-added our node at index ${newBlock.index}`);
    }
    
    /**
     * Send heartbeat to all peers
     */
    sendHeartbeat() {
        if (!this.wsClient || !this.wsClient.isConnected()) return;
        
        // Collect online nodes
        const knownOnline = [this.nodeId];
        for (const [nodeId, info] of this.peerInfo.entries()) {
            if (info.isOnline) {
                knownOnline.push(nodeId);
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
     * Start heartbeat interval
     */
    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        this.sendHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 5000); // Every 5 seconds
    }
    
    /**
     * Start periodic sync
     */
    startSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        
        this.syncInterval = setInterval(async () => {
            await this.syncWithBestPeer();
        }, 15000); // Every 15 seconds
    }
    
    /**
     * Send parent request
     */
    async sendParentRequest(parentId, options = {}) {
        if (!this.wsClient || !this.wsClient.isConnected()) {
            console.warn('Cannot send parent request: not connected');
            return false;
        }
        
        const request = window.SrishtiProtocol.createParentRequest({
            nodeId: this.nodeId,
            parentId: parentId,
            reason: options.reason || null,
            metadata: options.metadata || {}
        });
        
        return this.wsClient.sendToPeer(parentId, request);
    }
    
    /**
     * Send parent response
     */
    async sendParentResponse(requestNodeId, approved, reason = null) {
        if (!this.wsClient || !this.wsClient.isConnected()) {
            return false;
        }
        
        const response = window.SrishtiProtocol.createParentResponse({
            requestNodeId: requestNodeId,
            parentId: this.nodeId,
            approved: approved,
            reason: reason
        });
        
        return this.wsClient.sendToPeer(requestNodeId, response);
    }
    
    /**
     * Get connected peers
     */
    getConnectedPeers() {
        if (!this.wsClient) return [];
        return Array.from(this.wsClient.peers.keys());
    }
    
    /**
     * Get peer count
     */
    getPeerCount() {
        if (!this.wsClient) return 0;
        return this.wsClient.getPeerCount();
    }
    
    /**
     * Close network
     */
    close() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.syncInterval) clearInterval(this.syncInterval);
        
        if (this.wsClient) {
            this.wsClient.disconnect();
            this.wsClient = null;
        }
        
        this.peerInfo.clear();
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BACKWARD COMPATIBILITY (legacy API)
    // ═══════════════════════════════════════════════════════════════════════════
    
    get peers() {
        // Fake peers map for backward compat
        const map = new Map();
        if (this.wsClient) {
            for (const nodeId of this.wsClient.peers.keys()) {
                map.set(nodeId, { isConnected: () => true });
            }
        }
        return map;
    }
    
    get signaling() {
        // Legacy signaling reference
        return this.wsClient ? {
            isConnected: () => this.wsClient.isConnected(),
            connected: this.wsClient.connected
        } : null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Network;
} else {
    window.SrishtiNetwork = Network;
}
