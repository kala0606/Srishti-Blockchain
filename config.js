/**
 * Srishti Blockchain - Configuration
 * 
 * Tunable parameters for population-scale blockchain operation
 */

const Config = {
    // DHT Configuration
    DHT: {
        BUCKET_SIZE: 20,              // Number of peers per DHT bucket
        ALPHA: 3,                     // Concurrency parameter for lookups
        K: 20,                        // Number of closest nodes to return
        REFRESH_INTERVAL: 3600000,    // Refresh routing table every hour (ms)
        PING_TIMEOUT: 5000            // Ping timeout (ms)
    },
    
    // Connection Management
    CONNECTION: {
        MAX_CONNECTIONS: 50,          // Maximum WebRTC connections per node
        MIN_CONNECTIONS: 5,            // Minimum connections to maintain
        CONNECTION_TIMEOUT: 30000,     // Connection timeout (ms)
        HEALTH_CHECK_INTERVAL: 60000, // Health check interval (ms)
        ROTATION_INTERVAL: 300000      // Connection rotation interval (5 min)
    },
    
    // Chain Pruning
    PRUNING: {
        DEFAULT_KEEP_BLOCKS: 1000,     // Default number of blocks to keep
        CHECKPOINT_INTERVAL: 100,      // Create checkpoint every N blocks
        ENABLED: true                  // Enable pruning by default
    },
    
    // Rate Limiting
    RATE_LIMIT: {
        BLOCKS_PER_MINUTE: 10,         // Max blocks per minute per node
        BLOCKS_PER_HOUR: 100,          // Max blocks per hour per node
        NEW_NODE_MULTIPLIER: 0.1,       // New nodes get 10% of normal rate
        WINDOW_SIZE: 60000              // Sliding window size (ms)
    },
    
    // Gossip Protocol
    GOSSIP: {
        FANOUT: 3,                     // Number of neighbors to forward to
        TTL: 10,                       // Time to live (hops)
        DEDUP_WINDOW: 60000            // Message deduplication window (ms)
    },
    
    // Node Types
    NODE_TYPE: {
        DEFAULT: 'LIGHT',              // Default node type
        FULL_STORAGE_LIMIT: 1073741824, // 1GB limit for full nodes
        LIGHT_STORAGE_LIMIT: 104857600   // 100MB limit for light nodes
    },
    
    // Cache Configuration
    CACHE: {
        MAX_SIZE: 100,                  // Max cached blocks
        TTL: 300000                    // Cache TTL (5 minutes)
    },
    
    // Protocol Version
    PROTOCOL_VERSION: 2,               // Protocol version for compatibility
    
    // Performance
    BATCH: {
        WRITE_SIZE: 50,                 // Batch write size
        READ_SIZE: 100                  // Batch read size
    },
    
    // KARMA Token System
    KARMA: {
        // Universal Basic Income (UBI)
        UBI_DAILY_AMOUNT: 100,          // Daily UBI per user
        UBI_DISTRIBUTION_HOUR: 0,        // Hour of day to distribute (0 = midnight UTC)
        
        // Passive earning rates (per minute)
        ONLINE_PRESENCE_RATE: 0.1,       // KARMA per minute while online
        NETWORK_WATCHING_RATE: 0.05,     // KARMA per minute watching network
        
        // Activity rewards
        REWARDS: {
            NODE_JOIN: 50,               // Reward for joining network
            BLOCK_PROPOSAL: 10,          // Reward for proposing a block
            INSTITUTION_VERIFY: 25,      // Reward for verifying institution
            SOULBOUND_MINT: 15,          // Reward for minting (institution)
            VOTE_CAST: 5,                // Reward for voting
            PROPOSAL_CREATE: 20,          // Reward for creating proposal
            CHILD_RECRUITED: 30          // Reward when someone joins under you
        },
        
        // Passive earning intervals (milliseconds)
        PRESENCE_CHECK_INTERVAL: 60000,  // Check every minute
        UBI_CHECK_INTERVAL: 3600000,     // Check UBI every hour
        
        // Minimum balance (can't go below this)
        MINIMUM_BALANCE: 0
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
} else {
    window.SrishtiConfig = Config;
}
