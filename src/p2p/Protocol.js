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
        NEW_BLOCK: 'NEW_BLOCK',
        BLOCK_PROPOSAL: 'BLOCK_PROPOSAL',
        HEARTBEAT: 'HEARTBEAT',
        PEER_LIST: 'PEER_LIST',
        PING: 'PING',
        PONG: 'PONG'
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
            latestHash: info.latestHash || null
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
            isOnline: info.isOnline !== undefined ? info.isOnline : true
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
