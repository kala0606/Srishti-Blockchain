/**
 * Srishti Blockchain - Chain Pruner
 * 
 * Implements checkpoint-based chain pruning to reduce storage requirements.
 * Keeps recent blocks and checkpoints for older blocks.
 */

class ChainPruner {
    /**
     * Create a new chain pruner
     * @param {Object} options
     * @param {Chain} options.chain - Chain instance
     * @param {IndexedDBStore} options.storage - Storage instance
     */
    constructor(options) {
        this.chain = options.chain;
        this.storage = options.storage;
        
        this.config = window.SrishtiConfig?.PRUNING || {
            DEFAULT_KEEP_BLOCKS: 1000,
            CHECKPOINT_INTERVAL: 100,
            ENABLED: true
        };
    }
    
    /**
     * Prune the chain, keeping only the last N blocks
     * @param {number} keepLastN - Number of blocks to keep (default from config)
     * @returns {Promise<Object>} - Pruning result {pruned: number, checkpoints: Array}
     */
    async prune(keepLastN = null) {
        const keepBlocks = keepLastN || this.config.DEFAULT_KEEP_BLOCKS;
        const totalBlocks = this.chain.getLength();
        
        if (totalBlocks <= keepBlocks) {
            return { pruned: 0, checkpoints: [] };
        }
        
        const pruneCount = totalBlocks - keepBlocks;
        const pruneFromIndex = keepBlocks;
        
        // Create checkpoints for pruned blocks
        const checkpoints = await this.createCheckpoints(pruneFromIndex, totalBlocks);
        
        // Remove blocks from chain (keep in memory for now)
        const prunedBlocks = this.chain.blocks.splice(0, pruneFromIndex);
        
        // Update block indices
        for (let i = 0; i < this.chain.blocks.length; i++) {
            this.chain.blocks[i].index = i;
        }
        
        // Save checkpoints to storage
        await this.storage.saveCheckpoints(checkpoints);
        
        // Remove pruned blocks from storage
        await this.storage.pruneBlocks(keepBlocks);
        
        console.log(`✂️ Pruned ${pruneCount} blocks, keeping last ${keepBlocks}`);
        
        return {
            pruned: pruneCount,
            checkpoints: checkpoints,
            keptBlocks: keepBlocks
        };
    }
    
    /**
     * Create checkpoints for a range of blocks
     * @param {number} fromIndex - Start index (inclusive)
     * @param {number} toIndex - End index (exclusive)
     * @returns {Promise<Array>} - Array of checkpoints
     */
    async createCheckpoints(fromIndex, toIndex) {
        const checkpoints = [];
        const interval = this.config.CHECKPOINT_INTERVAL;
        
        // Create checkpoints at intervals
        for (let i = fromIndex; i < toIndex; i += interval) {
            const block = this.chain.getBlock(i);
            if (block) {
                const checkpoint = {
                    index: i,
                    hash: block.hash,
                    timestamp: block.timestamp,
                    previousHash: block.previousHash,
                    proposer: block.proposer
                };
                checkpoints.push(checkpoint);
            }
        }
        
        // Always include the last block before pruning
        const lastPrunedBlock = this.chain.getBlock(fromIndex - 1);
        if (lastPrunedBlock && checkpoints.length > 0 && 
            checkpoints[checkpoints.length - 1].index !== fromIndex - 1) {
            checkpoints.push({
                index: fromIndex - 1,
                hash: lastPrunedBlock.hash,
                timestamp: lastPrunedBlock.timestamp,
                previousHash: lastPrunedBlock.previousHash,
                proposer: lastPrunedBlock.proposer
            });
        }
        
        return checkpoints;
    }
    
    /**
     * Validate chain integrity using checkpoints
     * @param {Array} checkpoints - Array of checkpoints
     * @returns {Promise<boolean>} - True if chain is valid
     */
    async validateWithCheckpoints(checkpoints) {
        if (!checkpoints || checkpoints.length === 0) {
            return true; // No checkpoints to validate
        }
        
        // Check that first block's previousHash matches last checkpoint
        const firstBlock = this.chain.getBlock(0);
        if (firstBlock && checkpoints.length > 0) {
            const lastCheckpoint = checkpoints[checkpoints.length - 1];
            if (firstBlock.previousHash !== lastCheckpoint.hash) {
                console.error('Chain integrity check failed: previousHash mismatch');
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Get checkpoint at or before a given index
     * @param {number} index
     * @returns {Promise<Object|null>} - Checkpoint or null
     */
    async getCheckpoint(index) {
        const checkpoints = await this.storage.getAllCheckpoints();
        
        // Find checkpoint at or before index
        let bestCheckpoint = null;
        for (const checkpoint of checkpoints) {
            if (checkpoint.index <= index) {
                if (!bestCheckpoint || checkpoint.index > bestCheckpoint.index) {
                    bestCheckpoint = checkpoint;
                }
            }
        }
        
        return bestCheckpoint;
    }
    
    /**
     * Check if pruning is needed
     * @returns {boolean}
     */
    needsPruning() {
        if (!this.config.ENABLED) {
            return false;
        }
        
        const totalBlocks = this.chain.getLength();
        const keepBlocks = this.config.DEFAULT_KEEP_BLOCKS;
        
        return totalBlocks > keepBlocks;
    }
    
    /**
     * Auto-prune if needed
     * @returns {Promise<Object|null>} - Pruning result or null
     */
    async autoPrune() {
        if (this.needsPruning()) {
            return await this.prune();
        }
        return null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChainPruner;
} else {
    window.SrishtiChainPruner = ChainPruner;
}
