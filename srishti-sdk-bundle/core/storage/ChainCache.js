/**
 * Srishti Blockchain - Chain Cache
 * 
 * In-memory LRU cache for recent blocks to reduce IndexedDB reads.
 */

class ChainCache {
    /**
     * Create a new chain cache
     * @param {Object} options
     */
    constructor(options = {}) {
        this.config = window.SrishtiConfig?.CACHE || {
            MAX_SIZE: 100,
            TTL: 300000 // 5 minutes
        };
        
        // Cache: Map<blockIndex, {block, timestamp}>
        this.cache = new Map();
        
        // Access order for LRU: Array<blockIndex>
        this.accessOrder = [];
    }
    
    /**
     * Get a block from cache
     * @param {number} index - Block index
     * @returns {Object|null} - Block JSON or null
     */
    get(index) {
        const entry = this.cache.get(index);
        
        if (!entry) {
            return null;
        }
        
        // Check TTL
        const age = Date.now() - entry.timestamp;
        if (age > this.config.TTL) {
            this.remove(index);
            return null;
        }
        
        // Update access order (move to end)
        this.updateAccessOrder(index);
        
        return entry.block;
    }
    
    /**
     * Put a block in cache
     * @param {number} index - Block index
     * @param {Object} block - Block JSON
     */
    put(index, block) {
        // Remove if already exists
        if (this.cache.has(index)) {
            this.remove(index);
        }
        
        // Check if cache is full
        if (this.cache.size >= this.config.MAX_SIZE) {
            // Remove least recently used
            const lru = this.accessOrder[0];
            if (lru !== undefined) {
                this.remove(lru);
            }
        }
        
        // Add to cache
        this.cache.set(index, {
            block,
            timestamp: Date.now()
        });
        
        // Update access order
        this.updateAccessOrder(index);
    }
    
    /**
     * Remove a block from cache
     * @param {number} index - Block index
     */
    remove(index) {
        this.cache.delete(index);
        const orderIndex = this.accessOrder.indexOf(index);
        if (orderIndex !== -1) {
            this.accessOrder.splice(orderIndex, 1);
        }
    }
    
    /**
     * Update access order (move to end)
     * @param {number} index
     */
    updateAccessOrder(index) {
        const orderIndex = this.accessOrder.indexOf(index);
        if (orderIndex !== -1) {
            this.accessOrder.splice(orderIndex, 1);
        }
        this.accessOrder.push(index);
    }
    
    /**
     * Clear all cached blocks
     */
    clear() {
        this.cache.clear();
        this.accessOrder = [];
    }
    
    /**
     * Clear expired entries
     */
    cleanup() {
        const now = Date.now();
        const expired = [];
        
        for (const [index, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.config.TTL) {
                expired.push(index);
            }
        }
        
        for (const index of expired) {
            this.remove(index);
        }
    }
    
    /**
     * Get cache statistics
     * @returns {Object}
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.config.MAX_SIZE,
            hitRate: this.hits / (this.hits + this.misses) || 0
        };
    }
    
    /**
     * Initialize cache (start cleanup interval)
     */
    init() {
        // Cleanup expired entries every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
        
        this.hits = 0;
        this.misses = 0;
    }
    
    /**
     * Close cache (stop cleanup interval)
     */
    close() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChainCache;
} else {
    window.SrishtiChainCache = ChainCache;
}
