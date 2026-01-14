/**
 * Srishti Blockchain - Connection Manager
 * 
 * Manages WebRTC connection pool with prioritization and rotation.
 * Ensures efficient use of limited browser connection resources.
 */

class ConnectionManager {
    /**
     * Create a new connection manager
     * @param {Object} options
     * @param {Function} options.onConnectionNeeded - Callback when connection should be established
     * @param {Function} options.onConnectionClose - Callback when connection should be closed
     */
    constructor(options) {
        this.onConnectionNeeded = options.onConnectionNeeded || (() => {});
        this.onConnectionClose = options.onConnectionClose || (() => {});
        
        this.config = window.SrishtiConfig?.CONNECTION || {
            MAX_CONNECTIONS: 50,
            MIN_CONNECTIONS: 5,
            CONNECTION_TIMEOUT: 30000,
            HEALTH_CHECK_INTERVAL: 60000,
            ROTATION_INTERVAL: 300000
        };
        
        // Active connections: Map<nodeId, {connection, priority, lastActivity, health}>
        this.connections = new Map();
        
        // Pending connections: Set<nodeId>
        this.pending = new Set();
        
        // Connection candidates: Array<{nodeId, priority, reason}>
        this.candidates = [];
        
        this.healthCheckInterval = null;
        this.rotationInterval = null;
    }
    
    /**
     * Initialize the connection manager
     */
    async init() {
        this.startHealthCheck();
        this.startRotation();
        console.log('🔌 ConnectionManager initialized');
    }
    
    /**
     * Add a connection candidate (node we might want to connect to)
     * @param {string} nodeId
     * @param {number} priority - Higher = more important (0-100)
     * @param {string} reason - Why we want to connect
     */
    addCandidate(nodeId, priority = 50, reason = '') {
        // Remove if already exists
        this.candidates = this.candidates.filter(c => c.nodeId !== nodeId);
        
        // Add new candidate
        this.candidates.push({
            nodeId,
            priority,
            reason,
            timestamp: Date.now()
        });
        
        // Sort by priority (descending)
        this.candidates.sort((a, b) => b.priority - a.priority);
        
        // Try to establish connection if we have capacity
        this.manageConnections();
    }
    
    /**
     * Remove a candidate
     * @param {string} nodeId
     */
    removeCandidate(nodeId) {
        this.candidates = this.candidates.filter(c => c.nodeId !== nodeId);
    }
    
    /**
     * Register an active connection
     * @param {string} nodeId
     * @param {Object} connection - Connection object
     * @param {number} priority - Connection priority
     */
    registerConnection(nodeId, connection, priority = 50) {
        if (this.connections.has(nodeId)) {
            // Update existing
            const existing = this.connections.get(nodeId);
            existing.connection = connection;
            existing.priority = priority;
            existing.lastActivity = Date.now();
            existing.health = 'good';
        } else {
            // Add new
            this.connections.set(nodeId, {
                connection,
                priority,
                lastActivity: Date.now(),
                health: 'good',
                createdAt: Date.now()
            });
            
            this.pending.delete(nodeId);
        }
    }
    
    /**
     * Unregister a connection
     * @param {string} nodeId
     */
    unregisterConnection(nodeId) {
        if (this.connections.has(nodeId)) {
            const conn = this.connections.get(nodeId);
            if (conn.connection && this.onConnectionClose) {
                this.onConnectionClose(nodeId, conn.connection);
            }
            this.connections.delete(nodeId);
        }
        this.pending.delete(nodeId);
    }
    
    /**
     * Update connection activity
     * @param {string} nodeId
     */
    updateActivity(nodeId) {
        const conn = this.connections.get(nodeId);
        if (conn) {
            conn.lastActivity = Date.now();
            conn.health = 'good';
        }
    }
    
    /**
     * Get active connections
     * @returns {Array<string>} - Array of node IDs
     */
    getActiveConnections() {
        return Array.from(this.connections.keys());
    }
    
    /**
     * Get connection count
     * @returns {number}
     */
    getConnectionCount() {
        return this.connections.size;
    }
    
    /**
     * Check if we can add more connections
     * @returns {boolean}
     */
    canAddConnection() {
        return this.connections.size < this.config.MAX_CONNECTIONS;
    }
    
    /**
     * Manage connections (establish new, close old)
     */
    manageConnections() {
        const currentCount = this.connections.size;
        
        // If below minimum, try to establish connections
        if (currentCount < this.config.MIN_CONNECTIONS) {
            const needed = this.config.MIN_CONNECTIONS - currentCount;
            this.establishConnections(needed);
        }
        
        // If at capacity and have higher priority candidates, rotate
        if (currentCount >= this.config.MAX_CONNECTIONS) {
            this.rotateConnections();
        } else {
            // We have capacity, establish high-priority connections
            const available = this.config.MAX_CONNECTIONS - currentCount;
            this.establishConnections(available);
        }
    }
    
    /**
     * Establish connections to top candidates
     * @param {number} count - Number of connections to establish
     */
    establishConnections(count) {
        let established = 0;
        
        for (const candidate of this.candidates) {
            if (established >= count) break;
            
            const nodeId = candidate.nodeId;
            
            // Skip if already connected or pending
            if (this.connections.has(nodeId) || this.pending.has(nodeId)) {
                continue;
            }
            
            // Skip if we're at capacity
            if (this.connections.size >= this.config.MAX_CONNECTIONS) {
                break;
            }
            
            // Mark as pending and request connection
            this.pending.add(nodeId);
            if (this.onConnectionNeeded) {
                this.onConnectionNeeded(nodeId, candidate.priority, candidate.reason);
            }
            
            established++;
        }
    }
    
    /**
     * Rotate connections (replace low-priority with high-priority)
     */
    rotateConnections() {
        // Find lowest priority connections
        const connections = Array.from(this.connections.entries())
            .map(([nodeId, conn]) => ({
                nodeId,
                priority: conn.priority,
                lastActivity: conn.lastActivity,
                health: conn.health
            }))
            .sort((a, b) => a.priority - b.priority); // Sort ascending (lowest first)
        
        // Find high-priority candidates we're not connected to
        const highPriorityCandidates = this.candidates
            .filter(c => !this.connections.has(c.nodeId) && !this.pending.has(c.nodeId))
            .sort((a, b) => b.priority - a.priority); // Sort descending (highest first)
        
        // Replace low-priority connections with high-priority candidates
        let replaced = 0;
        const maxReplace = Math.min(5, highPriorityCandidates.length); // Replace up to 5 at a time
        
        for (let i = 0; i < connections.length && replaced < maxReplace; i++) {
            const lowConn = connections[i];
            const highCandidate = highPriorityCandidates[replaced];
            
            if (highCandidate && highCandidate.priority > lowConn.priority) {
                // Close low-priority connection
                this.unregisterConnection(lowConn.nodeId);
                
                // Establish high-priority connection
                this.pending.add(highCandidate.nodeId);
                if (this.onConnectionNeeded) {
                    this.onConnectionNeeded(highCandidate.nodeId, highCandidate.priority, highCandidate.reason);
                }
                
                replaced++;
            }
        }
    }
    
    /**
     * Start health check interval
     */
    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, this.config.HEALTH_CHECK_INTERVAL);
    }
    
    /**
     * Check connection health
     */
    checkHealth() {
        const now = Date.now();
        const INACTIVE_TIMEOUT = 300000; // 5 minutes
        
        for (const [nodeId, conn] of this.connections.entries()) {
            const inactiveTime = now - conn.lastActivity;
            
            if (inactiveTime > INACTIVE_TIMEOUT) {
                conn.health = 'stale';
            } else if (inactiveTime > INACTIVE_TIMEOUT / 2) {
                conn.health = 'degraded';
            } else {
                conn.health = 'good';
            }
        }
        
        // Remove stale connections
        for (const [nodeId, conn] of this.connections.entries()) {
            if (conn.health === 'stale') {
                console.log(`🔌 Removing stale connection: ${nodeId}`);
                this.unregisterConnection(nodeId);
            }
        }
        
        // Try to fill gaps
        this.manageConnections();
    }
    
    /**
     * Start connection rotation interval
     */
    startRotation() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }
        
        this.rotationInterval = setInterval(() => {
            this.manageConnections();
        }, this.config.ROTATION_INTERVAL);
    }
    
    /**
     * Calculate priority for a node
     * @param {string} nodeId
     * @param {Object} nodeInfo - Node information
     * @returns {number} - Priority score (0-100)
     */
    calculatePriority(nodeId, nodeInfo = {}) {
        let priority = 50; // Base priority
        
        // Higher priority for:
        // - Closer DHT distance (if provided)
        if (nodeInfo.dhtDistance) {
            // Closer = higher priority (inverse relationship)
            priority += 20;
        }
        
        // - Higher participation score
        if (nodeInfo.participationScore) {
            priority += nodeInfo.participationScore * 30;
        }
        
        // - Full nodes (for light nodes)
        if (nodeInfo.nodeType === 'FULL') {
            priority += 10;
        }
        
        // - Longer chain (for syncing)
        if (nodeInfo.chainLength) {
            const chainLengthBonus = Math.min(nodeInfo.chainLength / 100, 10);
            priority += chainLengthBonus;
        }
        
        // - Recent activity
        if (nodeInfo.lastSeen) {
            const age = Date.now() - nodeInfo.lastSeen;
            const recentBonus = Math.max(0, 10 - (age / 60000)); // Bonus for recent activity
            priority += recentBonus;
        }
        
        return Math.min(100, Math.max(0, priority));
    }
    
    /**
     * Get connection statistics
     * @returns {Object}
     */
    getStats() {
        let good = 0;
        let degraded = 0;
        let stale = 0;
        
        for (const conn of this.connections.values()) {
            if (conn.health === 'good') good++;
            else if (conn.health === 'degraded') degraded++;
            else if (conn.health === 'stale') stale++;
        }
        
        return {
            total: this.connections.size,
            pending: this.pending.size,
            candidates: this.candidates.length,
            health: { good, degraded, stale },
            capacity: {
                current: this.connections.size,
                max: this.config.MAX_CONNECTIONS,
                min: this.config.MIN_CONNECTIONS
            }
        };
    }
    
    /**
     * Close the connection manager
     */
    close() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
        }
        
        // Close all connections
        for (const nodeId of this.connections.keys()) {
            this.unregisterConnection(nodeId);
        }
        
        this.connections.clear();
        this.pending.clear();
        this.candidates = [];
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionManager;
} else {
    window.SrishtiConnectionManager = ConnectionManager;
}
