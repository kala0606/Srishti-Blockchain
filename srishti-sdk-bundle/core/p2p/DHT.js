/**
 * Srishti Blockchain - Distributed Hash Table (DHT)
 * 
 * Kademlia-based DHT for distributed peer discovery.
 * Provides scalable peer lookup without central signaling server.
 */

class DHT {
    /**
     * Create a new DHT instance
     * @param {Object} options
     * @param {string} options.nodeId - This node's ID
     * @param {Function} options.onPeerFound - Callback when peer is found
     * @param {Function} options.onPeerLost - Callback when peer is lost
     */
    constructor(options) {
        this.nodeId = options.nodeId;
        this.onPeerFound = options.onPeerFound || (() => {});
        this.onPeerLost = options.onPeerLost || (() => {});
        
        // Kademlia routing table: Map<bucketIndex, Set<nodeId>>
        this.routingTable = new Map();
        this.peerInfo = new Map(); // Map<nodeId, {publicKey, lastSeen, distance}>
        
        this.config = window.SrishtiConfig?.DHT || {
            BUCKET_SIZE: 20,
            ALPHA: 3,
            K: 20,
            REFRESH_INTERVAL: 3600000,
            PING_TIMEOUT: 5000
        };
        
        this.refreshInterval = null;
    }
    
    /**
     * Initialize the DHT
     */
    async init() {
        // Initialize routing table
        this.initializeRoutingTable();
        
        // Start periodic refresh
        this.startRefresh();
        
        console.log('🌐 DHT initialized');
    }
    
    /**
     * Initialize routing table structure
     */
    initializeRoutingTable() {
        // Create 160 buckets (for 160-bit node IDs)
        for (let i = 0; i < 160; i++) {
            this.routingTable.set(i, new Set());
        }
    }
    
    /**
     * Calculate XOR distance between two node IDs
     * @param {string} nodeId1
     * @param {string} nodeId2
     * @returns {string} - Hex string representing distance
     */
    distance(nodeId1, nodeId2) {
        // Extract hex part from node IDs (assuming format: "node_xxxxxxxx")
        const hex1 = nodeId1.replace('node_', '');
        const hex2 = nodeId2.replace('node_', '');
        
        // Pad to same length
        const maxLen = Math.max(hex1.length, hex2.length);
        const padded1 = hex1.padStart(maxLen, '0');
        const padded2 = hex2.padStart(maxLen, '0');
        
        // XOR
        let result = '';
        for (let i = 0; i < maxLen; i++) {
            const val1 = parseInt(padded1[i], 16);
            const val2 = parseInt(padded2[i], 16);
            result += (val1 ^ val2).toString(16);
        }
        
        return result;
    }
    
    /**
     * Calculate bucket index for a node ID
     * @param {string} targetNodeId
     * @returns {number} - Bucket index (0-159)
     */
    getBucketIndex(targetNodeId) {
        const dist = this.distance(this.nodeId, targetNodeId);
        
        // Find first non-zero hex digit (most significant bit)
        for (let i = 0; i < dist.length; i++) {
            const digit = parseInt(dist[i], 16);
            if (digit !== 0) {
                // Calculate bucket: 4 bits per hex digit, 160 total buckets
                const bitPos = i * 4;
                // Find highest set bit in this digit
                for (let bit = 3; bit >= 0; bit--) {
                    if (digit & (1 << bit)) {
                        return Math.min(bitPos + (3 - bit), 159);
                    }
                }
            }
        }
        
        return 159; // Same node or very close
    }
    
    /**
     * Add a peer to the routing table
     * @param {string} nodeId - Peer's node ID
     * @param {Object} info - Peer info {publicKey, lastSeen}
     * @returns {boolean} - Success status
     */
    addPeer(nodeId, info = {}) {
        if (nodeId === this.nodeId) {
            return false; // Don't add ourselves
        }
        
        const bucketIndex = this.getBucketIndex(nodeId);
        const bucket = this.routingTable.get(bucketIndex);
        
        // Check if already in bucket
        if (bucket.has(nodeId)) {
            // Update info
            this.peerInfo.set(nodeId, {
                ...this.peerInfo.get(nodeId),
                ...info,
                lastSeen: Date.now()
            });
            return true;
        }
        
        // If bucket is full, check if we should replace
        if (bucket.size >= this.config.BUCKET_SIZE) {
            // Find oldest peer in bucket
            let oldestNodeId = null;
            let oldestTime = Infinity;
            
            for (const peerId of bucket) {
                const peerInfo = this.peerInfo.get(peerId);
                if (peerInfo && peerInfo.lastSeen < oldestTime) {
                    oldestTime = peerInfo.lastSeen;
                    oldestNodeId = peerId;
                }
            }
            
            // Replace oldest if this peer is closer
            if (oldestNodeId) {
                const distOld = this.distance(this.nodeId, oldestNodeId);
                const distNew = this.distance(this.nodeId, nodeId);
                
                if (this.compareDistance(distNew, distOld) < 0) {
                    bucket.delete(oldestNodeId);
                    this.peerInfo.delete(oldestNodeId);
                    this.onPeerLost(oldestNodeId);
                } else {
                    return false; // Don't add, bucket is full
                }
            }
        }
        
        // Add to bucket
        bucket.add(nodeId);
        this.peerInfo.set(nodeId, {
            publicKey: info.publicKey || null,
            lastSeen: info.lastSeen || Date.now(),
            distance: this.distance(this.nodeId, nodeId)
        });
        
        this.onPeerFound(nodeId, this.peerInfo.get(nodeId));
        return true;
    }
    
    /**
     * Remove a peer from the routing table
     * @param {string} nodeId
     */
    removePeer(nodeId) {
        const bucketIndex = this.getBucketIndex(nodeId);
        const bucket = this.routingTable.get(bucketIndex);
        
        if (bucket.has(nodeId)) {
            bucket.delete(nodeId);
            this.peerInfo.delete(nodeId);
            this.onPeerLost(nodeId);
            return true;
        }
        
        return false;
    }
    
    /**
     * Compare two distance strings (for sorting)
     * @param {string} dist1
     * @param {string} dist2
     * @returns {number} - Negative if dist1 < dist2, positive if dist1 > dist2
     */
    compareDistance(dist1, dist2) {
        // Normalize lengths
        const maxLen = Math.max(dist1.length, dist2.length);
        const padded1 = dist1.padStart(maxLen, '0');
        const padded2 = dist2.padStart(maxLen, '0');
        
        // Compare lexicographically (XOR distance comparison)
        for (let i = 0; i < maxLen; i++) {
            const val1 = parseInt(padded1[i], 16);
            const val2 = parseInt(padded2[i], 16);
            if (val1 !== val2) {
                return val1 - val2;
            }
        }
        
        return 0;
    }
    
    /**
     * Find K closest nodes to a target node ID
     * @param {string} targetNodeId
     * @param {number} k - Number of nodes to return
     * @returns {Array<{nodeId: string, distance: string, info: Object}>}
     */
    findClosest(targetNodeId, k = null) {
        const kValue = k || this.config.K;
        const candidates = [];
        
        // Collect all peers with their distances
        for (const [nodeId, info] of this.peerInfo.entries()) {
            const dist = this.distance(targetNodeId, nodeId);
            candidates.push({
                nodeId,
                distance: dist,
                info
            });
        }
        
        // Sort by distance
        candidates.sort((a, b) => this.compareDistance(a.distance, b.distance));
        
        // Return K closest
        return candidates.slice(0, kValue);
    }
    
    /**
     * Lookup a node ID in the DHT
     * @param {string} targetNodeId
     * @returns {Promise<Array>} - Array of closest nodes
     */
    async lookup(targetNodeId) {
        // Start with our closest known nodes
        const closest = this.findClosest(targetNodeId);
        
        // In a full implementation, we would query these nodes for even closer nodes
        // For now, return what we have
        return closest;
    }
    
    /**
     * Get all known peers
     * @returns {Array<string>} - Array of node IDs
     */
    getAllPeers() {
        return Array.from(this.peerInfo.keys());
    }
    
    /**
     * Get peer info
     * @param {string} nodeId
     * @returns {Object|null}
     */
    getPeerInfo(nodeId) {
        return this.peerInfo.get(nodeId) || null;
    }
    
    /**
     * Update peer last seen timestamp
     * @param {string} nodeId
     */
    updatePeerSeen(nodeId) {
        const info = this.peerInfo.get(nodeId);
        if (info) {
            info.lastSeen = Date.now();
        }
    }
    
    /**
     * Start periodic refresh of routing table
     */
    startRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.refreshInterval = setInterval(() => {
            this.refreshRoutingTable();
        }, this.config.REFRESH_INTERVAL);
    }
    
    /**
     * Refresh routing table (remove stale peers)
     */
    refreshRoutingTable() {
        const now = Date.now();
        const STALE_TIMEOUT = 3600000; // 1 hour
        
        for (const [nodeId, info] of this.peerInfo.entries()) {
            if (now - info.lastSeen > STALE_TIMEOUT) {
                this.removePeer(nodeId);
            }
        }
    }
    
    /**
     * Get routing table statistics
     * @returns {Object}
     */
    getStats() {
        let totalPeers = 0;
        let nonEmptyBuckets = 0;
        
        for (const bucket of this.routingTable.values()) {
            if (bucket.size > 0) {
                nonEmptyBuckets++;
                totalPeers += bucket.size;
            }
        }
        
        return {
            totalPeers,
            nonEmptyBuckets,
            totalBuckets: 160
        };
    }
    
    /**
     * Close the DHT
     */
    close() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        this.routingTable.clear();
        this.peerInfo.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DHT;
} else {
    window.SrishtiDHT = DHT;
}
