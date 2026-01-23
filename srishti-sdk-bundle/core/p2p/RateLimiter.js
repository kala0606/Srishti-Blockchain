/**
 * Srishti Blockchain - Rate Limiter
 * 
 * Implements sliding window rate limiting to prevent spam and DoS attacks.
 */

class RateLimiter {
    /**
     * Create a new rate limiter
     * @param {Object} options
     * @param {Function} options.onLimitExceeded - Callback when limit exceeded
     */
    constructor(options) {
        this.onLimitExceeded = options.onLimitExceeded || (() => {});
        
        this.config = window.SrishtiConfig?.RATE_LIMIT || {
            BLOCKS_PER_MINUTE: 10,
            BLOCKS_PER_HOUR: 100,
            NEW_NODE_MULTIPLIER: 0.1,
            WINDOW_SIZE: 60000
        };
        
        // Per-node rate tracking: Map<nodeId, Array<timestamp>>
        this.nodeRequests = new Map();
        
        // Per-connection rate tracking: Map<connectionId, Array<timestamp>>
        this.connectionRequests = new Map();
        
        // Node metadata: Map<nodeId, {createdAt, isNew}>
        this.nodeMetadata = new Map();
    }
    
    /**
     * Check if a request should be allowed
     * @param {string} nodeId - Node ID making the request
     * @param {string} connectionId - Optional connection ID
     * @param {string} type - Request type ('block', 'sync', etc.)
     * @returns {boolean} - True if allowed
     */
    check(nodeId, connectionId = null, type = 'block') {
        const now = Date.now();
        
        // Get node metadata
        const metadata = this.nodeMetadata.get(nodeId) || { createdAt: now, isNew: true };
        const isNewNode = metadata.isNew && (now - metadata.createdAt) < 3600000; // New if < 1 hour old
        
        // Get limits based on node type
        const limits = this.getLimits(isNewNode, type);
        
        // Check per-node limit
        if (!this.checkWindow(nodeId, this.nodeRequests, limits.perNode, now)) {
            this.onLimitExceeded(nodeId, 'node_limit', limits.perNode);
            return false;
        }
        
        // Check per-connection limit if connectionId provided
        if (connectionId) {
            if (!this.checkWindow(connectionId, this.connectionRequests, limits.perConnection, now)) {
                this.onLimitExceeded(nodeId, 'connection_limit', limits.perConnection);
                return false;
            }
        }
        
        // Record request
        this.recordRequest(nodeId, connectionId, now);
        
        return true;
    }
    
    /**
     * Check sliding window for a key
     * @param {string} key - Key to check
     * @param {Map} requestsMap - Map storing requests
     * @param {number} limit - Maximum requests allowed
     * @param {number} now - Current timestamp
     * @returns {boolean} - True if under limit
     */
    checkWindow(key, requestsMap, limit, now) {
        const window = this.config.WINDOW_SIZE;
        const requests = requestsMap.get(key) || [];
        
        // Remove requests outside window
        const recentRequests = requests.filter(timestamp => now - timestamp < window);
        
        // Check if under limit
        if (recentRequests.length >= limit) {
            return false;
        }
        
        // Update map
        requestsMap.set(key, recentRequests);
        
        return true;
    }
    
    /**
     * Record a request
     * @param {string} nodeId
     * @param {string} connectionId
     * @param {number} timestamp
     */
    recordRequest(nodeId, connectionId, timestamp) {
        // Record node request
        const nodeRequests = this.nodeRequests.get(nodeId) || [];
        nodeRequests.push(timestamp);
        this.nodeRequests.set(nodeId, nodeRequests);
        
        // Record connection request if provided
        if (connectionId) {
            const connRequests = this.connectionRequests.get(connectionId) || [];
            connRequests.push(timestamp);
            this.connectionRequests.set(connectionId, connRequests);
        }
    }
    
    /**
     * Get rate limits based on node type and request type
     * @param {boolean} isNewNode - Whether node is new
     * @param {string} type - Request type
     * @returns {Object} - Limits object
     */
    getLimits(isNewNode, type) {
        let baseLimit = this.config.BLOCKS_PER_MINUTE;
        
        // Adjust for new nodes
        if (isNewNode) {
            baseLimit = Math.floor(baseLimit * this.config.NEW_NODE_MULTIPLIER);
        }
        
        // Adjust for request type
        let perNode = baseLimit;
        let perConnection = Math.floor(baseLimit * 0.5); // Connection limit is half of node limit
        
        switch (type) {
            case 'block':
                perNode = baseLimit;
                break;
            case 'sync':
                perNode = baseLimit * 2; // Sync requests can be more frequent
                break;
            case 'heartbeat':
                perNode = baseLimit * 10; // Heartbeats are very frequent
                break;
        }
        
        return { perNode, perConnection };
    }
    
    /**
     * Register a node (call when node joins)
     * @param {string} nodeId
     */
    registerNode(nodeId) {
        this.nodeMetadata.set(nodeId, {
            createdAt: Date.now(),
            isNew: true
        });
    }
    
    /**
     * Mark node as established (no longer new)
     * @param {string} nodeId
     */
    markNodeEstablished(nodeId) {
        const metadata = this.nodeMetadata.get(nodeId);
        if (metadata) {
            metadata.isNew = false;
        }
    }
    
    /**
     * Remove node from tracking
     * @param {string} nodeId
     */
    removeNode(nodeId) {
        this.nodeRequests.delete(nodeId);
        this.nodeMetadata.delete(nodeId);
    }
    
    /**
     * Remove connection from tracking
     * @param {string} connectionId
     */
    removeConnection(connectionId) {
        this.connectionRequests.delete(connectionId);
    }
    
    /**
     * Get statistics for a node
     * @param {string} nodeId
     * @returns {Object}
     */
    getNodeStats(nodeId) {
        const requests = this.nodeRequests.get(nodeId) || [];
        const now = Date.now();
        const window = this.config.WINDOW_SIZE;
        const recent = requests.filter(t => now - t < window);
        
        const metadata = this.nodeMetadata.get(nodeId) || {};
        
        return {
            totalRequests: requests.length,
            recentRequests: recent.length,
            isNew: metadata.isNew || false,
            createdAt: metadata.createdAt || null
        };
    }
    
    /**
     * Clear all tracking data
     */
    clear() {
        this.nodeRequests.clear();
        this.connectionRequests.clear();
        this.nodeMetadata.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RateLimiter;
} else {
    window.SrishtiRateLimiter = RateLimiter;
}
