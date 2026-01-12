/**
 * Srishti Blockchain - Event Types
 * 
 * Defines the types of events that can be recorded on the blockchain.
 * Events are the "transactions" of Srishti - they represent actions in time.
 */

class Event {
    /**
     * Event type constants
     */
    static TYPES = {
        GENESIS: 'GENESIS',
        NODE_JOIN: 'NODE_JOIN',
        NODE_ATTEST: 'NODE_ATTEST',
        PRESENCE_UPDATE: 'PRESENCE_UPDATE'
    };
    
    /**
     * Create a GENESIS event
     * @param {Object} options
     * @returns {Object} Genesis event
     */
    static createGenesis(options = {}) {
        return {
            type: this.TYPES.GENESIS,
            timestamp: Date.now(),
            message: options.message || 'Srishti timeline begins',
            creator: options.creatorId || 'genesis'
        };
    }
    
    /**
     * Create a NODE_JOIN event
     * @param {Object} options
     * @returns {Object} Node join event
     */
    static createNodeJoin(options) {
        if (!options.nodeId || !options.name) {
            throw new Error('NODE_JOIN requires nodeId and name');
        }
        
        return {
            type: this.TYPES.NODE_JOIN,
            timestamp: Date.now(),
            nodeId: options.nodeId,
            name: options.name,
            parentId: options.parentId || null,
            publicKey: options.publicKey || null,
            recoveryPhraseHash: options.recoveryPhraseHash || null
        };
    }
    
    /**
     * Create a NODE_ATTEST event (a statement/attestation)
     * @param {Object} options
     * @returns {Object} Attestation event
     */
    static createAttest(options) {
        if (!options.nodeId || !options.content) {
            throw new Error('NODE_ATTEST requires nodeId and content');
        }
        
        return {
            type: this.TYPES.NODE_ATTEST,
            timestamp: Date.now(),
            nodeId: options.nodeId,
            content: options.content,
            metadata: options.metadata || {}
        };
    }
    
    /**
     * Create a PRESENCE_UPDATE event
     * @param {Object} options
     * @returns {Object} Presence event
     */
    static createPresenceUpdate(options) {
        if (!options.nodeId) {
            throw new Error('PRESENCE_UPDATE requires nodeId');
        }
        
        return {
            type: this.TYPES.PRESENCE_UPDATE,
            timestamp: Date.now(),
            nodeId: options.nodeId,
            isOnline: options.isOnline !== undefined ? options.isOnline : true,
            lastSeen: options.lastSeen || Date.now()
        };
    }
    
    /**
     * Validate an event structure
     * @param {Object} event
     * @returns {boolean}
     */
    static isValid(event) {
        if (!event || !event.type) return false;
        
        switch (event.type) {
            case this.TYPES.GENESIS:
                return !!event.timestamp;
            case this.TYPES.NODE_JOIN:
                return !!(event.nodeId && event.name && event.timestamp);
            case this.TYPES.NODE_ATTEST:
                return !!(event.nodeId && event.content && event.timestamp);
            case this.TYPES.PRESENCE_UPDATE:
                return !!(event.nodeId && event.timestamp);
            default:
                return false;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Event;
} else {
    window.SrishtiEvent = Event;
}
