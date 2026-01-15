/**
 * Srishti Blockchain - Main Application
 * 
 * Connects blockchain, P2P network, and Three.js visualization
 */

class SrishtiApp {
    constructor() {
        this.chain = null;
        this.storage = null;
        this.network = null;
        this.adapter = null;
        this.consensus = null;
        this.currentUser = null;
        this.nodeId = null;
        this.keyPair = null;
        this.publicKeyBase64 = null;
        this.nodesData = {};
        this.initialized = false;
    }
    
    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('🌱 Initializing Srishti Blockchain...');
            
            // Initialize storage
            this.storage = new window.SrishtiIndexedDBStore('srishti_blockchain');
            await this.storage.open();
            console.log('✅ Storage initialized');
            
            // Initialize chain
            this.chain = new window.SrishtiChain();
            
            // Load chain from storage
            const blocks = await this.storage.getAllBlocks();
            if (blocks.length > 0) {
                await this.chain.replaceChain(blocks);
                console.log(`✅ Chain loaded: ${blocks.length} blocks`);
            } else {
                // DON'T create genesis yet - wait to sync with peers first
                // This ensures all devices converge on the same genesis
                console.log('📝 No local chain - will sync or create genesis during node creation');
                this.needsGenesis = true;
            }
            
            // Initialize consensus
            this.consensus = new window.SrishtiProofOfParticipation({ chain: this.chain });
            console.log('✅ Consensus initialized');
            
            // Check for existing node
            const savedNodeId = localStorage.getItem('srishti_node_id');
            const savedNodeName = localStorage.getItem('srishti_node_name');
            const savedPublicKey = localStorage.getItem('srishti_public_key');
            const savedPrivateKey = localStorage.getItem('srishti_private_key');
            
            if (savedNodeId && savedPublicKey && savedPrivateKey) {
                // Load existing keys
                this.nodeId = savedNodeId;
                this.currentUser = { id: savedNodeId, name: savedNodeName };
                this.publicKeyBase64 = savedPublicKey;
                this.keyPair = {
                    publicKey: await window.SrishtiKeys.importPublicKey(savedPublicKey),
                    privateKey: await window.SrishtiKeys.importPrivateKey(savedPrivateKey)
                };
                console.log('✅ Existing node loaded:', savedNodeName);
            } else {
                // Will create node during onboarding
                console.log('📝 No existing node found');
            }
            
            // Initialize blockchain adapter
            this.adapter = new window.SrishtiBlockchainAdapter({ chain: this.chain });
            await this.adapter.init();
            console.log('✅ Blockchain adapter initialized');
            
            // Initialize network (if we have a node)
            if (this.nodeId && this.keyPair) {
                await this.initNetwork();
            }
            
            this.initialized = true;
            console.log('🎉 Srishti Blockchain initialized!');
            
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Initialize P2P network
     * @param {boolean} guestMode - If true, create temporary identity for guest viewing
     */
    async initNetwork(guestMode = false) {
        // If guest mode, create temporary identity just for viewing
        if (guestMode && (!this.nodeId || !this.keyPair)) {
            try {
                const tempKeyPair = await window.SrishtiKeys.generateKeyPair();
                const tempNodeId = await window.SrishtiKeys.generateNodeId(tempKeyPair.publicKey);
                const tempPublicKeyBase64 = await window.SrishtiKeys.exportPublicKeyBase64(tempKeyPair.publicKey);
                
                this.nodeId = tempNodeId;
                this.keyPair = tempKeyPair;
                this.publicKeyBase64 = tempPublicKeyBase64;
                this.isGuest = true; // Mark as guest mode
                console.log('👁️ Guest mode: Created temporary identity for viewing');
            } catch (error) {
                console.warn('⚠️ Failed to create guest identity:', error);
                return;
            }
        }
        
        if (!this.nodeId || !this.keyPair) {
            return;
        }
        
        try {
            // Get signaling server URL (default to localhost for development)
            // In production, this should be your Fly.io deployment URL
            const signalingUrl = window.SRISHTI_SIGNALING_URL || 
                                 (window.location.protocol === 'https:' 
                                     ? 'wss://srishti-signaling.fly.dev' 
                                     : 'ws://localhost:8080');
            
            this.network = new window.SrishtiNetwork({
                nodeId: this.nodeId,
                publicKey: this.keyPair.publicKey,
                chain: this.chain,
                storage: this.storage,
                signalingServerUrl: signalingUrl,
                onChainUpdate: () => {
                    this.adapter.onChainUpdate();
                    // Only update presence if not in guest mode
                    if (!this.isGuest && this.nodeId) {
                        this.updatePresence(this.nodeId, { isOnline: true, lastSeen: Date.now() });
                    }
                },
                onPresenceUpdate: (nodeId, presenceData) => {
                    // Update presence for peer nodes (works in guest mode too)
                    this.adapter.updatePresence(nodeId, presenceData);
                }
            });
            
            await this.network.init();
            console.log(this.isGuest ? '✅ Network initialized (guest mode)' : '✅ Network initialized');
        } catch (error) {
            console.warn('⚠️ Network initialization failed (will work offline):', error);
        }
    }
    
    /**
     * Create a new node (join network)
     */
    async createNode(name, parentId = null) {
        try {
            // Generate key pair FIRST
            this.keyPair = await window.SrishtiKeys.generateKeyPair();
            this.publicKeyBase64 = await window.SrishtiKeys.exportPublicKeyBase64(this.keyPair.publicKey);
            this.nodeId = await window.SrishtiKeys.generateNodeId(this.keyPair.publicKey);
            
            // Save keys first
            const privateKeyBase64 = await window.SrishtiKeys.exportPrivateKeyBase64(this.keyPair.privateKey);
            await this.storage.saveKeys(this.nodeId, {
                publicKey: this.publicKeyBase64,
                privateKey: privateKeyBase64
            });
            
            // Save to localStorage
            localStorage.setItem('srishti_node_id', this.nodeId);
            localStorage.setItem('srishti_node_name', name);
            localStorage.setItem('srishti_public_key', this.publicKeyBase64);
            localStorage.setItem('srishti_private_key', privateKeyBase64);
            
            this.currentUser = { id: this.nodeId, name: name };
            
            // Initialize network FIRST and sync with existing peers
            if (!this.network) {
                await this.initNetwork();
            }
            
            // Wait for initial sync if there are peers
            if (this.network && this.network.signaling) {
                console.log('⏳ Waiting for initial peer sync...');
                await this.waitForInitialSync();
            }
            
            // If we still need genesis (no chain synced from peers), create it now
            if (this.needsGenesis && this.chain.getLength() === 0) {
                console.log('🌱 No peers found - creating genesis block as first node');
                await this.chain.createGenesisBlock();
                await this.saveChain();
                this.needsGenesis = false;
            }
            
            // Generate recovery phrase and hash it
            const recoveryPhrase = window.SrishtiRecovery.generatePhrase(privateKeyBase64);
            const recoveryPhraseHash = await window.SrishtiRecovery.hashPhrase(recoveryPhrase);
            
            // NOW create the join block (after syncing, so we have the correct chain state)
            const joinEvent = window.SrishtiEvent.createNodeJoin({
                nodeId: this.nodeId,
                name: name,
                parentId: parentId,
                publicKey: this.publicKeyBase64,
                recoveryPhraseHash: recoveryPhraseHash
            });
            
            // Get participation proof
            const participationProof = this.consensus.createParticipationProof(this.nodeId) || {
                nodeId: this.nodeId,
                score: 0.5,
                timestamp: Date.now()
            };
            
            // Create block on top of the (potentially synced) chain
            const latestBlock = this.chain.getLatestBlock();
            console.log(`📦 Creating block at index ${this.chain.getLength()} (after sync)`);
            
            const newBlock = new window.SrishtiBlock({
                index: this.chain.getLength(),
                previousHash: latestBlock.hash,
                data: joinEvent,
                proposer: parentId || 'genesis',
                participationProof: participationProof
            });
            
            await newBlock.computeHash();
            
            // Add block to chain and broadcast
            if (this.network) {
                await this.network.proposeBlock(newBlock);
                
                // If we joined under a parent, attempt to connect to them
                if (parentId) {
                    setTimeout(async () => {
                        const parentNode = this.chain.buildNodeMap()[parentId];
                        if (parentNode && parentNode.publicKey) {
                            console.log(`🔗 Adding pending connection to parent: ${parentId}`);
                            this.network.addPendingConnection(parentId, parentNode.publicKey);
                            if (this.network.signaling && this.network.signaling.isConnected()) {
                                await this.network.attemptConnection(parentId, parentNode.publicKey);
                            }
                        } else {
                            console.warn(`⚠️ Parent node ${parentId} not found in chain`);
                        }
                    }, 1000);
                }
            } else {
                // If no network, just add to chain locally
                await this.chain.addBlock(newBlock);
                await this.saveChain();
            }
            
            console.log('✅ Node created:', name, this.nodeId);
            
            return { nodeId: this.nodeId, recoveryPhrase };
        } catch (error) {
            console.error('Failed to create node:', error);
            throw error;
        }
    }
    
    /**
     * Wait for initial sync with peers (with timeout)
     */
    async waitForInitialSync() {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const shortTimeout = 3000; // 3 seconds if no peers available
            const longTimeout = 8000;  // 8 seconds if peers ARE available (wait for P2P)
            
            const checkSync = () => {
                const connectedPeers = this.network.peers?.size || 0;
                const availablePeers = this.network.signaling?.availablePeers?.length || 0;
                const pendingConnections = this.network.pendingConnections?.size || 0;
                const chainLength = this.chain.getLength();
                const elapsed = Date.now() - startTime;
                
                // Determine timeout based on whether peers exist
                const hasKnownPeers = availablePeers > 0 || pendingConnections > 0;
                const timeout = hasKnownPeers ? longTimeout : shortTimeout;
                
                console.log(`🔄 Sync check: elapsed=${elapsed}ms, connected=${connectedPeers}, available=${availablePeers}, chain=${chainLength}`);
                
                // If we have connected peers and chain has been updated beyond genesis - success!
                if (connectedPeers > 0 && chainLength > 1) {
                    console.log(`✅ Initial sync complete. Chain length: ${chainLength}`);
                    resolve();
                    return;
                }
                
                // If timeout reached
                if (elapsed >= timeout) {
                    if (hasKnownPeers && connectedPeers === 0) {
                        console.log(`⏰ Sync timeout - peers available but P2P connection not established`);
                    } else {
                        console.log(`⏰ Sync timeout after ${timeout}ms. Chain: ${chainLength}, Connected: ${connectedPeers}`);
                    }
                    resolve();
                    return;
                }
                
                // Keep waiting
                setTimeout(checkSync, 300);
            };
            
            // Start checking after signaling has time to register
            setTimeout(checkSync, 800);
        });
    }
    
    /**
     * Save chain to storage
     */
    async saveChain() {
        const blocks = this.chain.toJSON();
        await this.storage.saveBlocks(blocks);
    }
    
    /**
     * Update presence data
     */
    updatePresence(nodeId, presenceData) {
        this.adapter.updatePresence(nodeId, presenceData);
    }
    
    /**
     * Get nodes
     */
    getNodes() {
        if (!this.adapter) {
            console.warn('⚠️ Adapter not initialized. Call SrishtiApp.init() first.');
            return {};
        }
        return this.adapter.getAllNodes();
    }
    
    /**
     * Subscribe to node updates
     */
    subscribeToNodes(callback) {
        return this.adapter.subscribeToNodes(callback);
    }
    
    /**
     * Build hierarchy
     */
    buildHierarchy() {
        return this.adapter.buildHierarchy();
    }
    
    /**
     * Get node by ID
     */
    getNode(nodeId) {
        return this.adapter.getNode(nodeId);
    }
    
    /**
     * Check if node exists
     */
    nodeExists(nodeId) {
        return this.adapter.nodeExists(nodeId);
    }
    
    /**
     * Debug: Get chain info for verification
     * Call from console: SrishtiApp.getChainInfo()
     */
    getChainInfo() {
        if (!this.chain) {
            console.warn('⚠️ Chain not initialized. Call SrishtiApp.init() first.');
            return {
                chainLength: 0,
                initialized: false,
                error: 'Chain not initialized'
            };
        }
        
        const genesis = this.chain.blocks?.[0];
        const latest = this.chain.getLatestBlock();
        const nodes = this.chain.buildNodeMap();
        const nodeNames = Object.values(nodes).map(n => n.name);
        
        const info = {
            chainLength: this.chain.getLength(),
            genesisHash: genesis?.hash?.substring(0, 16) + '...',
            genesisTimestamp: genesis?.timestamp,
            latestHash: latest?.hash?.substring(0, 16) + '...',
            nodeCount: Object.keys(nodes).length,
            nodeNames: nodeNames,
            myNodeId: this.nodeId,
            initialized: this.initialized
        };
        
        console.log('📊 Chain Info:', info);
        console.table([
            { key: 'Chain Length', value: info.chainLength },
            { key: 'Genesis Hash', value: info.genesisHash },
            { key: 'Genesis Time', value: genesis?.timestamp ? new Date(info.genesisTimestamp).toISOString() : 'N/A' },
            { key: 'Node Count', value: info.nodeCount },
            { key: 'Nodes', value: info.nodeNames.join(', ') },
            { key: 'Initialized', value: info.initialized }
        ]);
        
        return info;
    }
    
    /**
     * Download chain data as JSON file
     */
    async downloadChainData() {
        if (!this.chain) {
            console.warn('⚠️ Chain not initialized. Call SrishtiApp.init() first.');
            return;
        }
        
        try {
            // Get chain data as JSON
            const chainData = this.chain.toJSON();
            
            // Add metadata
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                chainLength: chainData.length,
                nodeId: this.nodeId,
                nodeName: this.currentUser?.name || 'Unknown',
                blocks: chainData
            };
            
            // Convert to JSON string with pretty formatting
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // Create blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `srishti-chain-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Chain data downloaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to download chain data:', error);
            throw error;
        }
    }
}

// Create global instance
try {
    window.SrishtiApp = new SrishtiApp();
    
    // Verify instance was created and methods exist (for debugging)
    if (typeof window.SrishtiApp === 'undefined' || !window.SrishtiApp) {
        console.error('❌ Failed to create SrishtiApp instance');
    } else {
        const hasGetChainInfo = typeof window.SrishtiApp.getChainInfo === 'function';
        const hasGetNodes = typeof window.SrishtiApp.getNodes === 'function';
        
        console.log('✅ SrishtiApp instance created', {
            hasGetChainInfo,
            hasGetNodes,
            instanceType: typeof window.SrishtiApp,
            isInstance: window.SrishtiApp instanceof SrishtiApp
        });
        
        // If methods are missing, something went wrong
        if (!hasGetChainInfo || !hasGetNodes) {
            console.error('❌ Methods missing on SrishtiApp instance!', {
                availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(window.SrishtiApp)),
                ownProperties: Object.keys(window.SrishtiApp)
            });
        }
    }
} catch (error) {
    console.error('❌ Error creating SrishtiApp instance:', error);
    // Create a minimal fallback object so the app doesn't completely break
    window.SrishtiApp = {
        getChainInfo: () => {
            console.error('❌ SrishtiApp not properly initialized');
            return { error: 'SrishtiApp not initialized' };
        },
        getNodes: () => {
            console.error('❌ SrishtiApp not properly initialized');
            return {};
        }
    };
}
