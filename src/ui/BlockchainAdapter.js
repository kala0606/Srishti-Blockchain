/**
 * Srishti Blockchain - Blockchain Adapter
 * 
 * Provides a unified interface for the UI to interact with the blockchain.
 * Bridges the blockchain data model with the Three.js visualization layer.
 */

class BlockchainAdapter {
    /**
     * Create a new blockchain adapter
     * @param {Object} options
     * @param {Chain} options.chain - Chain instance
     * @param {Network} options.network - Network instance (optional)
     */
    constructor(options) {
        this.chain = options.chain;
        this.network = options.network || null;
        this.listeners = new Map(); // Map<eventType, callbacks[]>
        this.nodeCache = {}; // Cache of node data
        this.presenceCache = {}; // Cache of presence data
    }
    
    /**
     * Initialize the adapter
     * @returns {Promise<void>}
     */
    async init() {
        // Build initial node map
        this.updateNodeCache();
        
        // Set up chain update listener if network is available
        if (this.network) {
            // Network will call onChainUpdate when chain changes
            // We'll handle this via the subscribeToNodes callback
        }
    }
    
    /**
     * Update node cache from chain
     */
    updateNodeCache() {
        const nodes = this.chain.buildNodeMap();
        
        // CLEAR old cache first (important for chain replacements!)
        this.nodeCache = {};
        
        // Merge with presence data
        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            
            // Get presence data if available
            const presence = this.presenceCache[nodeId] || {};
            
            // Merge node data with presence
            this.nodeCache[nodeId] = {
                ...node,
                isOnline: presence.isOnline || false,
                lastSeen: presence.lastSeen || node.createdAt
            };
        }
    }
    
    /**
     * Build hierarchy from nodes (D3 format)
     * Compatible with existing UI code
     * @returns {Object} Hierarchy tree
     */
    buildHierarchy() {
        const nodes = this.nodeCache;
        const nodesArray = Object.values(nodes);
        
        console.log(`🌳 buildHierarchy called with ${nodesArray.length} nodes`);
        
        if (nodesArray.length === 0) {
            console.log('🌳 No nodes to build hierarchy');
            return null;
        }
        
        // Find root nodes (no parent)
        const rootNodes = nodesArray.filter(n => !n.parentId);
        
        if (rootNodes.length === 0) {
            // If no root, use the oldest node as root
            nodesArray.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            rootNodes.push(nodesArray[0]);
        }
        
        // Build children map
        const childrenMap = {};
        nodesArray.forEach(node => {
            if (node.parentId) {
                if (!childrenMap[node.parentId]) {
                    childrenMap[node.parentId] = [];
                }
                childrenMap[node.parentId].push(node);
            }
        });
        
        // Recursive function to build tree
        function buildTree(node) {
            const children = childrenMap[node.id] || [];
            return {
                ...node,
                name: node.name,
                children: children.length > 0 ? children.map(buildTree) : undefined
            };
        }
        
        // If multiple roots, create a virtual root
        if (rootNodes.length > 1) {
            return {
                id: 'srishti-root',
                name: 'Srishti',
                isVirtualRoot: true,
                children: rootNodes.map(buildTree)
            };
        }
        
        return buildTree(rootNodes[0]);
    }
    
    /**
     * Get all nodes
     * @returns {Object} Nodes object
     */
    getAllNodes() {
        return { ...this.nodeCache };
    }
    
    /**
     * Get a node by ID
     * @param {string} nodeId
     * @returns {Object|null}
     */
    getNode(nodeId) {
        return this.nodeCache[nodeId] || null;
    }
    
    /**
     * Check if node exists
     * @param {string} nodeId
     * @returns {boolean}
     */
    nodeExists(nodeId) {
        return !!this.nodeCache[nodeId];
    }
    
    /**
     * Subscribe to node updates
     * @param {Function} callback - Called with nodes object on updates
     * @returns {Function} Unsubscribe function
     */
    subscribeToNodes(callback) {
        // Create listener ID
        const listenerId = `nodes_${Date.now()}_${Math.random()}`;
        
        // Store callback
        if (!this.listeners.has('nodes')) {
            this.listeners.set('nodes', []);
        }
        this.listeners.get('nodes').push({ id: listenerId, callback });
        
        console.log(`📝 New subscriber added, total listeners: ${this.listeners.get('nodes').length}`);
        
        // Call immediately with current nodes
        const currentNodes = this.getAllNodes();
        console.log(`📝 Calling subscriber immediately with ${Object.keys(currentNodes).length} nodes`);
        callback(currentNodes);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get('nodes');
            if (callbacks) {
                const index = callbacks.findIndex(cb => cb.id === listenerId);
                if (index !== -1) {
                    callbacks.splice(index, 1);
                }
            }
        };
    }
    
    /**
     * Notify listeners of updates
     */
    notifyListeners() {
        const nodes = this.getAllNodes();
        const callbacks = this.listeners.get('nodes') || [];
        console.log(`📣 Notifying ${callbacks.length} listeners with ${Object.keys(nodes).length} nodes`);
        callbacks.forEach(({ callback }) => {
            try {
                callback(nodes);
            } catch (error) {
                console.error('Error in node update callback:', error);
            }
        });
    }
    
    /**
     * Update presence data (called by presence tracker)
     * @param {string} nodeId
     * @param {Object} presenceData
     */
    updatePresence(nodeId, presenceData) {
        this.presenceCache[nodeId] = {
            ...this.presenceCache[nodeId],
            ...presenceData
        };
        
        // Update node cache
        if (this.nodeCache[nodeId]) {
            this.nodeCache[nodeId] = {
                ...this.nodeCache[nodeId],
                isOnline: presenceData.isOnline !== undefined ? presenceData.isOnline : this.nodeCache[nodeId].isOnline,
                lastSeen: presenceData.lastSeen || this.nodeCache[nodeId].lastSeen
            };
        }
        
        // Notify listeners
        this.notifyListeners();
    }
    
    /**
     * Handle chain update (called when chain changes)
     */
    onChainUpdate() {
        console.log('🔄 BlockchainAdapter.onChainUpdate called');
        
        // Update node cache
        this.updateNodeCache();
        
        console.log('📊 Node cache updated:', Object.keys(this.nodeCache).length, 'nodes');
        console.log('📊 Nodes:', Object.values(this.nodeCache).map(n => n.name));
        
        // Notify listeners
        this.notifyListeners();
    }
    
    /**
     * Generate node ID
     * @returns {string}
     */
    generateNodeId() {
        return 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * Create a node (creates a NODE_JOIN event on the blockchain)
     * This is async and requires network/consensus
     * @param {Object} nodeData
     * @returns {Promise<string>} Node ID
     */
    async createNode(nodeData) {
        // This would need to be handled by the blockchain network
        // For now, return the node ID (actual creation happens elsewhere)
        const nodeId = nodeData.id || this.generateNodeId();
        return nodeId;
    }
    
    /**
     * Get chain length
     * @returns {number}
     */
    getChainLength() {
        return this.chain.getLength();
    }
    
    /**
     * Get latest block hash
     * @returns {string|null}
     */
    getLatestHash() {
        const latestBlock = this.chain.getLatestBlock();
        return latestBlock ? latestBlock.hash : null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlockchainAdapter;
} else {
    window.SrishtiBlockchainAdapter = BlockchainAdapter;
}
