/**
 * Srishti Blockchain - P2P Protocol
 * 
 * Defines message types and protocol for peer-to-peer communication.
 */

class Protocol {
    /**
     * Message types
     */
    static MESSAGE_TYPES = {
        HELLO: 'HELLO',
        SYNC_REQUEST: 'SYNC_REQUEST',
        SYNC_RESPONSE: 'SYNC_RESPONSE',
        SYNC_CHECKPOINT: 'SYNC_CHECKPOINT',
        SYNC_INCREMENTAL: 'SYNC_INCREMENTAL',
        HEADER_SYNC_REQUEST: 'HEADER_SYNC_REQUEST',
        HEADER_SYNC_RESPONSE: 'HEADER_SYNC_RESPONSE',
        MERKLE_PROOF_REQUEST: 'MERKLE_PROOF_REQUEST',
        MERKLE_PROOF_RESPONSE: 'MERKLE_PROOF_RESPONSE',
        NEW_BLOCK: 'NEW_BLOCK',
        BLOCK_PROPOSAL: 'BLOCK_PROPOSAL',
        HEARTBEAT: 'HEARTBEAT',
        PEER_LIST: 'PEER_LIST',
        PING: 'PING',
        PONG: 'PONG',
        
        // Parent-child relationship management
        PARENT_REQUEST: 'PARENT_REQUEST',       // Request to become child of another node
        PARENT_RESPONSE: 'PARENT_RESPONSE'      // Response to parent request (approve/reject)
    };
    
    /**
     * Create a HELLO message (initial connection)
     * @param {Object} info - Node info
     * @returns {Object}
     */
    static createHello(info) {
        return {
            type: this.MESSAGE_TYPES.HELLO,
            timestamp: Date.now(),
            nodeId: info.nodeId,
            publicKey: info.publicKey,
            chainLength: info.chainLength || 0,
            latestHash: info.latestHash || null,
            protocolVersion: info.protocolVersion || 1,
            nodeType: info.nodeType || 'LIGHT',
            chainEpoch: info.chainEpoch || (window.SrishtiConfig?.CHAIN_EPOCH || 1) // Chain epoch for compatibility
        };
    }
    
    /**
     * Create a SYNC_REQUEST message
     * @param {Object} info - Sync request info
     * @returns {Object}
     */
    static createSyncRequest(info) {
        return {
            type: this.MESSAGE_TYPES.SYNC_REQUEST,
            timestamp: Date.now(),
            fromIndex: info.fromIndex || 0,
            chainLength: info.chainLength || 0,
            latestHash: info.latestHash || null
        };
    }
    
    /**
     * Create a SYNC_RESPONSE message
     * @param {Object} info - Sync response info
     * @returns {Object}
     */
    static createSyncResponse(info) {
        return {
            type: this.MESSAGE_TYPES.SYNC_RESPONSE,
            timestamp: Date.now(),
            blocks: info.blocks || [],
            chainLength: info.chainLength || 0,
            checkpoint: info.checkpoint || null // Optional checkpoint for incremental sync
        };
    }
    
    /**
     * Create a SYNC_CHECKPOINT message
     * @param {Object} info - Checkpoint info
     * @returns {Object}
     */
    static createSyncCheckpoint(info) {
        return {
            type: this.MESSAGE_TYPES.SYNC_CHECKPOINT,
            timestamp: Date.now(),
            checkpoint: info.checkpoint,
            chainLength: info.chainLength || 0
        };
    }
    
    /**
     * Create a SYNC_INCREMENTAL message (sync from checkpoint)
     * @param {Object} info - Incremental sync info
     * @returns {Object}
     */
    static createSyncIncremental(info) {
        return {
            type: this.MESSAGE_TYPES.SYNC_INCREMENTAL,
            timestamp: Date.now(),
            fromCheckpoint: info.fromCheckpoint,
            fromIndex: info.fromIndex || 0,
            chainLength: info.chainLength || 0
        };
    }
    
    /**
     * Create a NEW_BLOCK message (broadcast new block)
     * @param {Object} block - Block JSON object
     * @returns {Object}
     */
    static createNewBlock(block) {
        return {
            type: this.MESSAGE_TYPES.NEW_BLOCK,
            timestamp: Date.now(),
            block: block
        };
    }
    
    /**
     * Create a BLOCK_PROPOSAL message (propose new block)
     * @param {Object} block - Block JSON object
     * @returns {Object}
     */
    static createBlockProposal(block) {
        return {
            type: this.MESSAGE_TYPES.BLOCK_PROPOSAL,
            timestamp: Date.now(),
            block: block
        };
    }
    
    /**
     * Create a HEARTBEAT message
     * @param {Object} info - Node info
     * @returns {Object}
     */
    static createHeartbeat(info) {
        return {
            type: this.MESSAGE_TYPES.HEARTBEAT,
            timestamp: Date.now(),
            nodeId: info.nodeId,
            isOnline: info.isOnline !== undefined ? info.isOnline : true,
            knownOnline: info.knownOnline || [] // List of nodes this peer knows are online
        };
    }
    
    /**
     * Create a PEER_LIST message
     * @param {Array} peers - List of peer IDs
     * @returns {Object}
     */
    static createPeerList(peers) {
        return {
            type: this.MESSAGE_TYPES.PEER_LIST,
            timestamp: Date.now(),
            peers: peers
        };
    }
    
    /**
     * Create a PING message
     * @returns {Object}
     */
    static createPing() {
        return {
            type: this.MESSAGE_TYPES.PING,
            timestamp: Date.now()
        };
    }
    
    /**
     * Create a PONG message (response to PING)
     * @returns {Object}
     */
    static createPong() {
        return {
            type: this.MESSAGE_TYPES.PONG,
            timestamp: Date.now()
        };
    }
    
    /**
     * Create a PARENT_REQUEST message (request to become child)
     * @param {Object} info - Request info
     * @returns {Object}
     */
    static createParentRequest(info) {
        return {
            type: this.MESSAGE_TYPES.PARENT_REQUEST,
            timestamp: Date.now(),
            nodeId: info.nodeId,
            parentId: info.parentId,
            reason: info.reason || null,
            metadata: info.metadata || {}
        };
    }
    
    /**
     * Create a PARENT_RESPONSE message (response to parent request)
     * @param {Object} info - Response info
     * @returns {Object}
     */
    static createParentResponse(info) {
        return {
            type: this.MESSAGE_TYPES.PARENT_RESPONSE,
            timestamp: Date.now(),
            requestNodeId: info.requestNodeId,
            parentId: info.parentId,
            approved: info.approved !== undefined ? info.approved : false,
            reason: info.reason || null
        };
    }

    /**
     * Create a HEADER_SYNC_REQUEST message (light client requesting headers)
     * @param {Object} info - Header sync request info
     * @returns {Object}
     */
    static createHeaderSyncRequest(info) {
        return {
            type: this.MESSAGE_TYPES.HEADER_SYNC_REQUEST,
            timestamp: Date.now(),
            fromIndex: info.fromIndex || 0,
            count: info.count || 100 // Number of headers to request
        };
    }

    /**
     * Create a HEADER_SYNC_RESPONSE message (full node responding with headers)
     * @param {Object} info - Header sync response info
     * @returns {Object}
     */
    static createHeaderSyncResponse(info) {
        return {
            type: this.MESSAGE_TYPES.HEADER_SYNC_RESPONSE,
            timestamp: Date.now(),
            headers: info.headers || [],
            chainLength: info.chainLength || 0
        };
    }

    /**
     * Create a MERKLE_PROOF_REQUEST message (light client requesting proof)
     * @param {Object} info - Proof request info
     * @returns {Object}
     */
    static createMerkleProofRequest(info) {
        return {
            type: this.MESSAGE_TYPES.MERKLE_PROOF_REQUEST,
            timestamp: Date.now(),
            transactionId: info.transactionId,
            blockIndex: info.blockIndex || null // Optional: specify block, otherwise search all
        };
    }

    /**
     * Create a MERKLE_PROOF_RESPONSE message (full node responding with proof)
     * @param {Object} info - Proof response info
     * @returns {Object}
     */
    static createMerkleProofResponse(info) {
        return {
            type: this.MESSAGE_TYPES.MERKLE_PROOF_RESPONSE,
            timestamp: Date.now(),
            proof: info.proof || null,
            found: info.found || false
        };
    }
    
    /**
     * Validate a message structure
     * @param {Object} message
     * @returns {boolean}
     */
    static isValid(message) {
        if (!message || !message.type) return false;
        if (!message.timestamp) return false;
        
        // Check message type exists
        if (!Object.values(this.MESSAGE_TYPES).includes(message.type)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Serialize message to JSON string
     * @param {Object} message
     * @returns {string}
     */
    static serialize(message) {
        return JSON.stringify(message);
    }
    
    /**
     * Deserialize message from JSON string
     * @param {string} jsonString
     * @returns {Object|null}
     */
    static deserialize(jsonString) {
        try {
            const message = JSON.parse(jsonString);
            if (this.isValid(message)) {
                return message;
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Protocol;
} else {
    window.SrishtiProtocol = Protocol;
}
