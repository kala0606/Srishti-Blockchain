/**
 * Srishti SDK - Developer Kit for Building dApps on Srishti Blockchain
 * 
 * This SDK provides a clean interface for third-party developers to build
 * applications on the Srishti blockchain without modifying core blockchain code.
 * 
 * Architecture:
 * - On-chain: Only minimal proofs, hashes, and references (APP_EVENT)
 * - Off-chain: Full app data stored in IndexedDB, synced via P2P
 * 
 * @version 1.0.0
 * @author Srishti Blockchain Team
 */

class SrishtiSDK {
    /**
     * Create a new SDK instance
     * @param {Object} options - Configuration options
     * @param {string} [options.nodeId] - Node ID (defaults to localStorage value)
     * @param {Chain} [options.chain] - Chain instance (defaults to window.SrishtiApp.chain)
     * @param {Network} [options.network] - Network instance (defaults to window.SrishtiApp.network)
     */
    constructor(options = {}) {
        this.nodeId = options.nodeId || localStorage.getItem('srishti_node_id');
        this.chain = options.chain || null;
        this.network = options.network || null;
        
        // Off-chain data stores (per app)
        this.appStores = new Map();
        
        // Event listeners for app events
        this.eventListeners = new Map();
        
        // Connection state
        this.connected = false;
    }
    
    /**
     * Connect to the Srishti blockchain
     * Must be called before using other SDK methods
     * @returns {Promise<Object>} Connection info
     */
    async connect() {
        // Try to get chain and network from global app
        if (!this.chain) {
            this.chain = window.SrishtiApp?.chain;
        }
        if (!this.network) {
            this.network = window.SrishtiApp?.network;
        }
        
        if (!this.chain) {
            throw new Error('Srishti blockchain chain not initialized. Ensure the main app is running.');
        }
        
        if (!this.nodeId) {
            throw new Error('No node ID found. User must be registered on the network.');
        }
        
        // Network is optional for read-only operations, but required for submitting events
        if (!this.network) {
            console.warn('⚠️ Network not available. You can read data but cannot submit events.');
        }
        
        this.connected = true;
        
        // Hook into chain updates for event notifications (only if network exists)
        if (this.network) {
            this._setupEventListener();
        }
        
        return {
            nodeId: this.nodeId,
            chainLength: this.chain.getLength(),
            connected: true,
            networkAvailable: !!this.network
        };
    }
    
    /**
     * Set up listener for new app events
     * @private
     */
    _setupEventListener() {
        const originalCallback = this.network.onChainUpdate;
        this.network.onChainUpdate = (chain) => {
            // Call original callback
            if (originalCallback) {
                originalCallback(chain);
            }
            
            // Check latest block for app events
            const latestBlock = chain.getLatestBlock();
            if (latestBlock) {
                const events = latestBlock.getEvents();
                for (const event of events) {
                    if (event.type === 'APP_EVENT') {
                        this._notifyListeners(event.appId, event);
                    }
                }
            }
        };
    }
    
    /**
     * Notify listeners of a new app event
     * @private
     */
    _notifyListeners(appId, event) {
        const listeners = this.eventListeners.get(appId) || [];
        for (const callback of listeners) {
            try {
                callback(event);
            } catch (error) {
                console.error(`SDK: Error in app event listener for ${appId}:`, error);
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // APP EVENT API - Core methods for dApp development
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Submit an app event to the blockchain
     * 
     * @param {string} appId - Unique app identifier (e.g., "attendance.v1")
     * @param {string} action - App-specific action type (e.g., "SESSION_CREATE")
     * @param {Object} options - Event options
     * @param {string} [options.ref] - Reference ID (session ID, record ID, etc.)
     * @param {string} [options.target] - Target node ID (if applicable)
     * @param {string} [options.dataHash] - Hash of off-chain data
     * @param {Object} [options.metadata] - Small indexed metadata (keep minimal!)
     * @returns {Promise<boolean>} Success status
     * 
     * @example
     * // Create an attendance session
     * await sdk.submitAppEvent('attendance.v1', 'SESSION_CREATE', {
     *     ref: 'sess_123',
     *     dataHash: 'QmX...',  // IPFS hash of full session data
     *     metadata: { title: 'Lecture 5' }
     * });
     */
    async submitAppEvent(appId, action, options = {}) {
        this._ensureConnected();
        
        if (!appId || !action) {
            throw new Error('appId and action are required');
        }
        
        // Create the event using the blockchain's Event class
        const event = window.SrishtiEvent.createAppEvent({
            appId: appId,
            action: action,
            sender: this.nodeId,
            ref: options.ref,
            target: options.target,
            dataHash: options.dataHash,
            metadata: options.metadata || {}
        });
        
        // Create and propose block
        const latestBlock = this.chain.getLatestBlock();
        const block = new window.SrishtiBlock({
            index: this.chain.getLength(),
            previousHash: latestBlock.hash,
            data: event,
            proposer: this.nodeId,
            participationProof: {
                nodeId: this.nodeId,
                score: 0.5,
                timestamp: Date.now()
            }
        });
        
        await block.computeHash();
        
        if (!this.network) {
            throw new Error('Network not available. Cannot submit events. Please ensure you are connected to the blockchain network.');
        }
        
        return await this.network.proposeBlock(block);
    }
    
    /**
     * Query app events from the blockchain
     * 
     * @param {string} appId - App identifier
     * @param {string} [action] - Optional action filter
     * @param {Object} [filters] - Additional filters
     * @param {string} [filters.sender] - Filter by sender node ID
     * @param {string} [filters.ref] - Filter by reference ID
     * @param {string} [filters.target] - Filter by target node ID
     * @returns {Array} Matching events
     * 
     * @example
     * // Get all session creation events
     * const sessions = sdk.queryAppEvents('attendance.v1', 'SESSION_CREATE');
     * 
     * // Get events I created
     * const mySessions = sdk.queryAppEvents('attendance.v1', 'SESSION_CREATE', {
     *     sender: sdk.nodeId
     * });
     */
    queryAppEvents(appId, action = null, filters = {}) {
        this._ensureConnected();
        
        // Use chain's query method if available
        if (this.chain.queryAppEvents) {
            const chainFilters = { ...filters };
            if (action) chainFilters.action = action;
            return this.chain.queryAppEvents(appId, chainFilters);
        }
        
        // Fallback: manual filtering
        return this.chain.getEvents('APP_EVENT')
            .filter(e => {
                if (e.appId !== appId) return false;
                if (action && e.action !== action) return false;
                if (filters.sender && e.sender !== filters.sender) return false;
                if (filters.ref && e.payload?.ref !== filters.ref) return false;
                if (filters.target && e.payload?.target !== filters.target) return false;
                return true;
            });
    }
    
    /**
     * Subscribe to new app events
     * 
     * @param {string} appId - App identifier to listen for
     * @param {Function} callback - Called with each new event
     * @returns {Function} Unsubscribe function
     * 
     * @example
     * const unsubscribe = sdk.onAppEvent('attendance.v1', (event) => {
     *     console.log('New event:', event.action, event.payload);
     * });
     * 
     * // Later, to stop listening:
     * unsubscribe();
     */
    onAppEvent(appId, callback) {
        if (!this.eventListeners.has(appId)) {
            this.eventListeners.set(appId, []);
        }
        
        this.eventListeners.get(appId).push(callback);
        
        // Return unsubscribe function
        return () => {
            const listeners = this.eventListeners.get(appId);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // OFF-CHAIN DATA STORAGE
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get or create an off-chain data store for an app
     * 
     * @param {string} appId - App identifier
     * @returns {AppDataStore} Data store instance
     * 
     * @example
     * const store = sdk.getAppStore('attendance.v1');
     * await store.put('sess_123', { title: 'Lecture 5', ... });
     * const session = await store.get('sess_123');
     */
    getAppStore(appId) {
        if (!this.appStores.has(appId)) {
            if (!window.SrishtiAppDataStore) {
                throw new Error('AppDataStore not loaded. Include sdk/AppDataStore.js');
            }
            this.appStores.set(appId, new window.SrishtiAppDataStore(appId));
        }
        return this.appStores.get(appId);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Hash data for on-chain reference
     * @param {Object|string} data - Data to hash
     * @returns {Promise<string>} SHA-256 hash
     */
    async hashData(data) {
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(dataStr);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    /**
     * Generate a unique reference ID
     * @param {string} [prefix] - Optional prefix
     * @returns {string} Unique ID
     */
    generateId(prefix = 'ref') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
    
    /**
     * Get current user information
     * @returns {Object|null} User node data
     */
    getCurrentUser() {
        this._ensureConnected();
        const nodes = this.chain.buildNodeMap();
        return nodes[this.nodeId] || null;
    }
    
    /**
     * Get current user's role
     * @returns {string} Role (USER, INSTITUTION, GOVERNANCE_ADMIN, ROOT)
     */
    getNodeRole() {
        this._ensureConnected();
        return this.chain.getNodeRole(this.nodeId);
    }
    
    /**
     * Check if current user is a verified institution
     * @returns {boolean}
     */
    isInstitution() {
        this._ensureConnected();
        return this.chain.isVerifiedInstitution(this.nodeId);
    }
    
    /**
     * Check if current user is ROOT
     * @returns {boolean}
     */
    isRoot() {
        return this.getNodeRole() === 'ROOT';
    }
    
    /**
     * Get KARMA balance for current user
     * @returns {number}
     */
    getKarmaBalance() {
        this._ensureConnected();
        return this.chain.getKarmaBalance(this.nodeId);
    }
    
    /**
     * Get chain length
     * @returns {number}
     */
    getChainLength() {
        this._ensureConnected();
        return this.chain.getLength();
    }
    
    /**
     * Get connected peer count
     * @returns {number}
     */
    getPeerCount() {
        this._ensureConnected();
        return this.network.getPeerCount?.() || 0;
    }
    
    /**
     * Check if a node exists in the network
     * @param {string} nodeId - Node ID to check
     * @returns {boolean}
     */
    nodeExists(nodeId) {
        this._ensureConnected();
        const nodes = this.chain.buildNodeMap();
        return !!nodes[nodeId];
    }
    
    /**
     * Get all nodes in the network
     * @returns {Object} Nodes map
     */
    getAllNodes() {
        this._ensureConnected();
        return this.chain.buildNodeMap();
    }
    
    /**
     * Ensure SDK is connected
     * @private
     */
    _ensureConnected() {
        if (!this.connected) {
            throw new Error('SDK not connected. Call sdk.connect() first.');
        }
    }
    
    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this.connected = false;
        this.eventListeners.clear();
        this.appStores.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SrishtiSDK;
} else {
    window.SrishtiSDK = SrishtiSDK;
}
