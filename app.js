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
                await this.chain.createGenesisBlock();
                await this.saveChain();
                console.log('✅ Genesis block created');
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
     */
    async initNetwork() {
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
                    this.updatePresence(this.nodeId, { isOnline: true, lastSeen: Date.now() });
                }
            });
            
            await this.network.init();
            console.log('✅ Network initialized');
        } catch (error) {
            console.warn('⚠️ Network initialization failed (will work offline):', error);
        }
    }
    
    /**
     * Create a new node (join network)
     */
    async createNode(name, parentId = null) {
        try {
            // Generate key pair
            this.keyPair = await window.SrishtiKeys.generateKeyPair();
            this.publicKeyBase64 = await window.SrishtiKeys.exportPublicKeyBase64(this.keyPair.publicKey);
            this.nodeId = await window.SrishtiKeys.generateNodeId(this.keyPair.publicKey);
            
            // Create node join event
            const joinEvent = window.SrishtiEvent.createNodeJoin({
                nodeId: this.nodeId,
                name: name,
                parentId: parentId,
                publicKey: this.publicKeyBase64
            });
            
            // Get participation proof
            const participationProof = this.consensus.createParticipationProof(this.nodeId) || {
                nodeId: this.nodeId,
                score: 0.5,
                timestamp: Date.now()
            };
            
            // Create block
            const latestBlock = this.chain.getLatestBlock();
            const newBlock = new window.SrishtiBlock({
                index: this.chain.getLength(),
                previousHash: latestBlock.hash,
                data: joinEvent,
                proposer: parentId || 'genesis',
                participationProof: participationProof
            });
            
            await newBlock.computeHash();
            
            // Save keys first (before network initialization)
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
            
            // Initialize network if not already initialized
            if (!this.network) {
                await this.initNetwork();
            }
            
            // Add block to chain and broadcast (proposeBlock handles both)
            if (this.network) {
                await this.network.proposeBlock(newBlock);
                
                // If we joined under a parent, attempt to connect to them
                if (parentId) {
                    // Get parent's public key from the chain
                    const parentNode = this.chain.buildNodeMap()[parentId];
                    if (parentNode && parentNode.publicKey) {
                        this.network.addPendingConnection(parentId, parentNode.publicKey);
                    }
                }
            } else {
                // If no network, just add to chain locally
                await this.chain.addBlock(newBlock);
                await this.saveChain();
            }
            
            console.log('✅ Node created:', name, this.nodeId);
            
            return this.nodeId;
        } catch (error) {
            console.error('Failed to create node:', error);
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
     * Update presence data
     */
    updatePresence(nodeId, presenceData) {
        this.adapter.updatePresence(nodeId, presenceData);
    }
    
    /**
     * Get nodes (compatible with Firebase interface)
     */
    getNodes() {
        return this.adapter.getAllNodes();
    }
    
    /**
     * Subscribe to node updates (compatible with Firebase interface)
     */
    subscribeToNodes(callback) {
        return this.adapter.subscribeToNodes(callback);
    }
    
    /**
     * Build hierarchy (compatible with Firebase interface)
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
}

// Create global instance
window.SrishtiApp = new SrishtiApp();
