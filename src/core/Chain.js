/**
 * Srishti Blockchain - Chain
 * 
 * Manages the blockchain: adding blocks, validating integrity,
 * querying events, and maintaining chain state.
 */

class Chain {
    /**
     * Create a new chain
     * @param {Block} genesisBlock - Optional genesis block (creates one if not provided)
     */
    constructor(genesisBlock = null) {
        this.blocks = [];
        
        if (genesisBlock) {
            this.blocks.push(genesisBlock);
        } else {
            // Create default genesis block
            this.createGenesisBlock();
        }
    }
    
    /**
     * Create the genesis (first) block
     * @param {Object} options - Optional genesis data
     */
    async createGenesisBlock(options = {}) {
        if (!window.SrishtiEvent || !window.SrishtiBlock || !window.SrishtiHasher) {
            throw new Error('Required dependencies not loaded');
        }
        
        const genesisEvent = window.SrishtiEvent.createGenesis({
            message: options.message || 'Srishti timeline begins',
            creatorId: options.creatorId || 'genesis'
        });
        
        const genesisBlock = new window.SrishtiBlock({
            index: 0,
            timestamp: Date.now(),
            previousHash: null,
            data: genesisEvent,
            proposer: 'genesis'
        });
        
        await genesisBlock.computeHash();
        this.blocks = [genesisBlock];
        
        return genesisBlock;
    }
    
    /**
     * Add a new block to the chain
     * @param {Block} block - Block to add
     * @returns {Promise<boolean>} - Success status
     */
    async addBlock(block) {
        // Validate block
        if (!block.isValid()) {
            throw new Error('Invalid block structure');
        }
        
        // Verify block index
        const expectedIndex = this.blocks.length;
        if (block.index !== expectedIndex) {
            throw new Error(`Block index mismatch: expected ${expectedIndex}, got ${block.index}`);
        }
        
        // Verify previous hash
        if (block.index > 0) {
            const previousBlock = this.blocks[this.blocks.length - 1];
            if (block.previousHash !== previousBlock.hash) {
                throw new Error('Previous hash mismatch');
            }
        }
        
        // Verify block hash
        const computedHash = await block.computeHash();
        if (block.hash !== computedHash) {
            throw new Error('Block hash verification failed');
        }
        
        // Add block
        this.blocks.push(block);
        return true;
    }
    
    /**
     * Validate the entire chain
     * @returns {Promise<{valid: boolean, errors: Array}>}
     */
    async validateChain() {
        const errors = [];
        
        // Check genesis block
        if (this.blocks.length === 0) {
            errors.push('Chain has no blocks');
            return { valid: false, errors };
        }
        
        const genesis = this.blocks[0];
        if (genesis.index !== 0 || genesis.previousHash !== null) {
            errors.push('Invalid genesis block');
        }
        
        // Check each block
        for (let i = 1; i < this.blocks.length; i++) {
            const block = this.blocks[i];
            const previous = this.blocks[i - 1];
            
            // Check index sequence
            if (block.index !== i) {
                errors.push(`Block ${i} has wrong index: ${block.index}`);
            }
            
            // Check hash chain
            if (block.previousHash !== previous.hash) {
                errors.push(`Block ${i} previous hash mismatch`);
            }
            
            // Verify block hash
            const computedHash = await block.computeHash();
            if (block.hash !== computedHash) {
                errors.push(`Block ${i} hash verification failed`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Get the latest block
     * @returns {Block|null}
     */
    getLatestBlock() {
        if (this.blocks.length === 0) return null;
        return this.blocks[this.blocks.length - 1];
    }
    
    /**
     * Get block by index
     * @param {number} index
     * @returns {Block|null}
     */
    getBlock(index) {
        if (index < 0 || index >= this.blocks.length) return null;
        return this.blocks[index];
    }
    
    /**
     * Get block by hash
     * @param {string} hash
     * @returns {Block|null}
     */
    getBlockByHash(hash) {
        return this.blocks.find(block => block.hash === hash) || null;
    }
    
    /**
     * Get all events from the chain
     * @param {string} eventType - Optional filter by event type
     * @returns {Array}
     */
    getEvents(eventType = null) {
        const events = [];
        
        for (const block of this.blocks) {
            const blockEvents = block.getEvents();
            for (const event of blockEvents) {
                if (!eventType || event.type === eventType) {
                    events.push(event);
                }
            }
        }
        
        return events;
    }
    
    /**
     * Get all NODE_JOIN events (builds the node network)
     * @returns {Array}
     */
    getNodeJoins() {
        return this.getEvents(window.SrishtiEvent?.TYPES?.NODE_JOIN || 'NODE_JOIN');
    }
    
    /**
     * Build node hierarchy from chain
     * @returns {Object} - Nodes object (similar to your Firebase structure)
     */
    buildNodeMap() {
        const nodes = {};
        const joins = this.getNodeJoins();
        
        for (const joinEvent of joins) {
            nodes[joinEvent.nodeId] = {
                id: joinEvent.nodeId,
                name: joinEvent.name,
                parentId: joinEvent.parentId,
                createdAt: joinEvent.timestamp,
                publicKey: joinEvent.publicKey,
                recoveryPhraseHash: joinEvent.recoveryPhraseHash || null
            };
        }
        
        // Calculate child counts
        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            node.childCount = Object.values(nodes).filter(n => n.parentId === nodeId).length;
        }
        
        return nodes;
    }
    
    /**
     * Get chain length
     * @returns {number}
     */
    getLength() {
        return this.blocks.length;
    }
    
    /**
     * Serialize chain to JSON
     * @returns {Array}
     */
    toJSON() {
        return this.blocks.map(block => block.toJSON());
    }
    
    /**
     * Create Chain from JSON
     * @param {Array} json
     * @returns {Chain}
     */
    static fromJSON(json) {
        if (!window.SrishtiBlock) {
            throw new Error('SrishtiBlock not loaded');
        }
        
        const chain = new Chain();
        chain.blocks = json.map(blockData => window.SrishtiBlock.fromJSON(blockData));
        return chain;
    }
    
    /**
     * Replace chain (used when syncing from peers)
     * Validates before replacing
     * @param {Array} newBlocks - Array of block JSON objects
     * @returns {Promise<boolean>} - Success status
     */
    async replaceChain(newBlocks) {
        if (!window.SrishtiBlock) {
            throw new Error('SrishtiBlock not loaded');
        }
        
        // Convert to Block objects
        const blocks = newBlocks.map(blockData => window.SrishtiBlock.fromJSON(blockData));
        
        // Create temporary chain
        const tempChain = new Chain(blocks[0]);
        for (let i = 1; i < blocks.length; i++) {
            await tempChain.addBlock(blocks[i]);
        }
        
        // Validate
        const validation = await tempChain.validateChain();
        if (!validation.valid) {
            throw new Error('Invalid chain: ' + validation.errors.join(', '));
        }
        
        // Replace if valid
        this.blocks = blocks;
        return true;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Chain;
} else {
    window.SrishtiChain = Chain;
}
