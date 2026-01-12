/**
 * Srishti Blockchain - Block
 * 
 * Represents a single block in the blockchain.
 * Each block contains events and links cryptographically to the previous block.
 */

class Block {
    /**
     * Create a new block
     * @param {Object} params
     * @param {number} params.index - Block index
     * @param {string} params.previousHash - Hash of previous block
     * @param {Object|Array} params.data - Event data (single event or array)
     * @param {string} params.proposer - Node ID of block proposer
     * @param {Object} params.participationProof - Proof of participation score
     * @param {number} params.timestamp - Block timestamp (defaults to now)
     */
    constructor(params) {
        this.index = params.index;
        this.timestamp = params.timestamp || Date.now();
        this.previousHash = params.previousHash || null;
        this.data = params.data; // Can be single event or array of events
        this.proposer = params.proposer || null;
        this.participationProof = params.participationProof || null;
        this.hash = params.hash || null; // Will be computed if not provided
    }
    
    /**
     * Compute the hash of this block
     * @returns {Promise<string>} Block hash
     */
    async computeHash() {
        if (!window.SrishtiHasher) {
            throw new Error('SrishtiHasher not loaded');
        }
        
        const blockData = {
            index: this.index,
            timestamp: this.timestamp,
            previousHash: this.previousHash,
            data: this.data,
            proposer: this.proposer,
            participationProof: this.participationProof
        };
        
        this.hash = await window.SrishtiHasher.hashBlock(blockData);
        return this.hash;
    }
    
    /**
     * Serialize block to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            index: this.index,
            timestamp: this.timestamp,
            previousHash: this.previousHash,
            data: this.data,
            proposer: this.proposer,
            participationProof: this.participationProof,
            hash: this.hash
        };
    }
    
    /**
     * Create a Block from JSON
     * @param {Object} json
     * @returns {Block}
     */
    static fromJSON(json) {
        const block = new Block({
            index: json.index,
            timestamp: json.timestamp,
            previousHash: json.previousHash,
            data: json.data,
            proposer: json.proposer,
            participationProof: json.participationProof
        });
        block.hash = json.hash;
        return block;
    }
    
    /**
     * Get the events in this block (normalizes to array)
     * @returns {Array}
     */
    getEvents() {
        if (Array.isArray(this.data)) {
            return this.data;
        }
        return [this.data];
    }
    
    /**
     * Validate block structure
     * @returns {boolean}
     */
    isValid() {
        // Check required fields
        if (this.index === undefined || this.index === null) return false;
        if (!this.timestamp) return false;
        if (this.index > 0 && !this.previousHash) return false;
        if (!this.data) return false;
        if (!this.hash) return false;
        
        return true;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Block;
} else {
    window.SrishtiBlock = Block;
}
