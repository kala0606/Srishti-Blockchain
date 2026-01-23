/**
 * Srishti Blockchain - Node Types
 * 
 * Defines node types and their capabilities.
 */

class NodeType {
    /**
     * Node type constants
     */
    static TYPES = {
        FULL: 'FULL',       // Stores complete chain
        LIGHT: 'LIGHT',     // Stores pruned chain (last N blocks)
        ARCHIVE: 'ARCHIVE'  // Stores complete chain + historical data
    };
    
    /**
     * Get default node type
     * @returns {string}
     */
    static getDefault() {
        return window.SrishtiConfig?.NODE_TYPE?.DEFAULT || this.TYPES.LIGHT;
    }
    
    /**
     * Get storage limit for node type
     * @param {string} nodeType
     * @returns {number} - Storage limit in bytes
     */
    static getStorageLimit(nodeType) {
        const config = window.SrishtiConfig?.NODE_TYPE || {};
        
        switch (nodeType) {
            case this.TYPES.FULL:
                return config.FULL_STORAGE_LIMIT || 1073741824; // 1GB
            case this.TYPES.LIGHT:
                return config.LIGHT_STORAGE_LIMIT || 104857600; // 100MB
            case this.TYPES.ARCHIVE:
                return Infinity; // No limit
            default:
                return config.LIGHT_STORAGE_LIMIT || 104857600;
        }
    }
    
    /**
     * Check if node type supports full chain storage
     * @param {string} nodeType
     * @returns {boolean}
     */
    static supportsFullChain(nodeType) {
        return nodeType === this.TYPES.FULL || nodeType === this.TYPES.ARCHIVE;
    }
    
    /**
     * Check if node type should prune
     * @param {string} nodeType
     * @returns {boolean}
     */
    static shouldPrune(nodeType) {
        return nodeType === this.TYPES.LIGHT;
    }
    
    /**
     * Validate node type
     * @param {string} nodeType
     * @returns {boolean}
     */
    static isValid(nodeType) {
        return Object.values(this.TYPES).includes(nodeType);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NodeType;
} else {
    window.SrishtiNodeType = NodeType;
}
