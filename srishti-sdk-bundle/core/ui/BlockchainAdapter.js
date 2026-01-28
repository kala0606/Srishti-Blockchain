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
        
        // Get current user's node ID (they're always online!)
        const currentUserNodeId = window.SrishtiApp?.nodeId || localStorage.getItem('srishti_node_id');
        
        // CLEAR old cache first (important for chain replacements!)
        this.nodeCache = {};
        
        // Merge with presence data
        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            
            // Get presence data if available
            const presence = this.presenceCache[nodeId] || {};
            
            // Current user is ALWAYS online (they're using the app!)
            const isCurrentUser = nodeId === currentUserNodeId;
            const isOnline = isCurrentUser || presence.isOnline || false;
            
            // Merge node data with presence
            this.nodeCache[nodeId] = {
                ...node,
                isOnline: isOnline,
                lastSeen: isCurrentUser ? Date.now() : (presence.lastSeen || node.createdAt)
            };
        }
        
        // Include relay peers we have presence for but aren't in chain yet (so online status syncs)
        for (const nodeId in this.presenceCache) {
            if (!this.nodeCache[nodeId]) {
                const p = this.presenceCache[nodeId];
                this.nodeCache[nodeId] = {
                    id: nodeId,
                    name: nodeId.length > 12 ? nodeId.substring(0, 8) + '...' : nodeId,
                    isOnline: p.isOnline || false,
                    lastSeen: p.lastSeen || Date.now(),
                    parentIds: [],
                    parentId: null
                };
            }
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
        
        if (nodesArray.length === 0) return null;
        
        // Find root nodes (no parents)
        const rootNodes = nodesArray.filter(n => {
            const parentIds = Array.isArray(n.parentIds) ? n.parentIds : (n.parentId ? [n.parentId] : []);
            return parentIds.length === 0;
        });
        
        if (rootNodes.length === 0) {
            // If no root, use the oldest node as root
            nodesArray.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            rootNodes.push(nodesArray[0]);
        }
        
        // Build children map (supporting multiple parents)
        // For visualization, we need to prevent duplicate nodes when a node has multiple parents
        // We'll build a tree using the FIRST parent for tree structure, but store all parents in metadata
        const childrenMap = {};
        const allParentsMap = {}; // Store ALL parents for each node (for multi-parent links)
        const seenNodes = new Set(); // Track nodes we've already added to tree
        
        nodesArray.forEach(node => {
            // Get parentIds array (support both old parentId and new parentIds)
            const parentIds = Array.isArray(node.parentIds) ? node.parentIds : (node.parentId ? [node.parentId] : []);
            
            // Store all parents for this node
            allParentsMap[node.id] = parentIds;
            
            // For tree structure, use FIRST parent only to prevent duplicates
            // But we'll use allParentsMap when creating links
            if (parentIds.length > 0) {
                const firstParentId = parentIds[0];
                if (!childrenMap[firstParentId]) {
                    childrenMap[firstParentId] = [];
                }
                // Only add if we haven't seen this node yet (prevent duplicates)
                if (!seenNodes.has(node.id)) {
                    childrenMap[firstParentId].push(node);
                    seenNodes.add(node.id);
                }
            }
        });
        
        // Add root nodes that haven't been added yet
        rootNodes.forEach(rootNode => {
            if (!seenNodes.has(rootNode.id)) {
                seenNodes.add(rootNode.id);
            }
        });
        
        // Recursive function to build tree (using first parent only to prevent duplicates)
        // But we'll attach allParentsMap to each node for link creation
        function buildTree(node) {
            const children = childrenMap[node.id] || [];
            return {
                ...node,
                name: node.name,
                // Store all parents in node data so visualization can create links to all parents
                allParentIds: allParentsMap[node.id] || [],
                children: children.length > 0 ? children.map(buildTree) : undefined
            };
        }
        
        // Build tree for each root
        const rootTrees = rootNodes.map(buildTree);
        
        // If multiple roots, create a virtual root
        if (rootNodes.length > 1) {
            return {
                id: 'srishti-root',
                name: 'Srishti',
                isVirtualRoot: true,
                allParentIds: [], // Virtual root has no parents
                children: rootTrees
            };
        }
        
        return rootTrees[0];
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
        
        // Call immediately with current nodes
        const currentNodes = this.getAllNodes();
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
        
        // Rebuild node cache from chain + presence so online status stays in sync
        this.updateNodeCache();
        
        // Notify listeners so UI (dashboard, node list, glows) updates
        this.notifyListeners();
    }
    
    /**
     * Handle chain update (called when chain changes)
     */
    onChainUpdate() {
        this.updateNodeCache();
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
