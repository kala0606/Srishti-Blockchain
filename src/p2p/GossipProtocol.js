/**
 * Srishti Blockchain - Gossip Protocol
 * 
 * Implements epidemic/gossip protocol for efficient block propagation.
 * Prevents network flooding while ensuring message delivery.
 */

class GossipProtocol {
    /**
     * Create a new gossip protocol instance
     * @param {Object} options
     * @param {Function} options.onMessage - Callback to send message to peer
     * @param {Function} options.getPeers - Function to get list of peer IDs
     */
    constructor(options) {
        this.onMessage = options.onMessage || (() => {});
        this.getPeers = options.getPeers || (() => []);
        
        this.config = window.SrishtiConfig?.GOSSIP || {
            FANOUT: 3,
            TTL: 10,
            DEDUP_WINDOW: 60000
        };
        
        // Message deduplication: Map<messageId, timestamp>
        this.seenMessages = new Map();
        
        // Cleanup old messages periodically
        this.cleanupInterval = setInterval(() => {
            this.cleanupSeenMessages();
        }, this.config.DEDUP_WINDOW);
    }
    
    /**
     * Generate message ID from message content
     * @param {Object} message - Message object
     * @returns {string} - Message ID
     */
    generateMessageId(message) {
        // Use block hash for NEW_BLOCK messages, otherwise use type + timestamp
        if (message.type === 'NEW_BLOCK' && message.block) {
            return `block_${message.block.hash}`;
        }
        return `${message.type}_${message.timestamp}_${JSON.stringify(message).substring(0, 50)}`;
    }
    
    /**
     * Check if message has been seen
     * @param {string} messageId
     * @returns {boolean}
     */
    hasSeen(messageId) {
        return this.seenMessages.has(messageId);
    }
    
    /**
     * Mark message as seen
     * @param {string} messageId
     */
    markSeen(messageId) {
        this.seenMessages.set(messageId, Date.now());
    }
    
    /**
     * Propagate message using gossip protocol
     * @param {Object} message - Message to propagate
     * @param {string} excludePeerId - Peer ID to exclude (sender)
     * @param {number} ttl - Time to live (hops remaining)
     */
    propagate(message, excludePeerId = null, ttl = null) {
        const messageId = this.generateMessageId(message);
        
        // Check if we've seen this message
        if (this.hasSeen(messageId)) {
            return false; // Already propagated
        }
        
        // Mark as seen
        this.markSeen(messageId);
        
        // Get available peers
        const allPeers = this.getPeers();
        const peers = allPeers.filter(peerId => peerId !== excludePeerId);
        
        if (peers.length === 0) {
            return false; // No peers to propagate to
        }
        
        // Use TTL from config or parameter
        const messageTtl = ttl !== null ? ttl : this.config.TTL;
        
        // Select random subset of peers (fanout)
        const fanout = Math.min(this.config.FANOUT, peers.length);
        const selectedPeers = this.selectRandomPeers(peers, fanout);
        
        // Add TTL to message if not present
        if (!message._gossip) {
            message._gossip = { ttl: messageTtl, messageId };
        }
        
        // Send to selected peers
        for (const peerId of selectedPeers) {
            this.onMessage(peerId, message);
        }
        
        return true;
    }
    
    /**
     * Handle incoming gossip message
     * @param {Object} message - Received message
     * @param {string} senderId - Sender's node ID
     * @param {Function} onReceive - Callback when message should be processed
     * @returns {boolean} - True if message should be processed
     */
    handleMessage(message, senderId, onReceive) {
        const messageId = message._gossip?.messageId || this.generateMessageId(message);
        
        // Check if we've seen this message
        if (this.hasSeen(messageId)) {
            return false; // Already processed
        }
        
        // Mark as seen
        this.markSeen(messageId);
        
        // Check TTL
        const ttl = message._gossip?.ttl || this.config.TTL;
        if (ttl <= 0) {
            return false; // TTL expired
        }
        
        // Process message
        if (onReceive) {
            onReceive(message, senderId);
        }
        
        // Continue propagation if TTL > 1
        if (ttl > 1) {
            const newTtl = ttl - 1;
            message._gossip = { ...message._gossip, ttl: newTtl };
            this.propagate(message, senderId, newTtl);
        }
        
        return true;
    }
    
    /**
     * Select random peers from list
     * @param {Array<string>} peers - List of peer IDs
     * @param {number} count - Number to select
     * @returns {Array<string>}
     */
    selectRandomPeers(peers, count) {
        const shuffled = [...peers].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }
    
    /**
     * Cleanup old seen messages
     */
    cleanupSeenMessages() {
        const now = Date.now();
        const window = this.config.DEDUP_WINDOW;
        
        for (const [messageId, timestamp] of this.seenMessages.entries()) {
            if (now - timestamp > window) {
                this.seenMessages.delete(messageId);
            }
        }
    }
    
    /**
     * Get statistics
     * @returns {Object}
     */
    getStats() {
        return {
            seenMessages: this.seenMessages.size,
            config: this.config
        };
    }
    
    /**
     * Close the gossip protocol
     */
    close() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.seenMessages.clear();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GossipProtocol;
} else {
    window.SrishtiGossipProtocol = GossipProtocol;
}
