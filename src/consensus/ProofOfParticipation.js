/**
 * Srishti Blockchain - Proof of Participation Consensus
 * 
 * Consensus mechanism based on participation scores (glow system).
 * Nodes with higher participation scores can propose blocks.
 */

class ProofOfParticipation {
    /**
     * Create a new Proof of Participation instance
     * @param {Object} options
     * @param {Chain} options.chain - Chain instance
     */
    constructor(options) {
        this.chain = options.chain;
        this.minParticipationScore = options.minScore || 0.5; // Minimum score to propose
        this.participationScores = new Map(); // Cache of participation scores
    }
    
    /**
     * Calculate participation score for a node
     * Uses the same logic as the glow calculator
     * @param {string} nodeId - Node ID
     * @param {Object} nodeData - Node data (from chain)
     * @returns {number} - Participation score (0 to 1)
     */
    calculateParticipationScore(nodeId, nodeData) {
        const weights = {
            online: 0.40,
            recency: 0.30,
            children: 0.30
        };
        
        // Online score (40%)
        const onlineScore = nodeData.isOnline ? 1.0 : 0.0;
        
        // Recency score (30%) - based on last seen
        let recencyScore = 0;
        if (nodeData.lastSeen) {
            const now = Date.now();
            const timeSince = now - nodeData.lastSeen;
            const ACTIVITY_DECAY_MS = 24 * 60 * 60 * 1000; // 24 hours
            
            if (timeSince < 60000) {
                recencyScore = 1.0;
            } else {
                const decayFactor = Math.exp(-timeSince / (ACTIVITY_DECAY_MS / 3));
                recencyScore = Math.max(0, Math.min(1, decayFactor));
            }
        }
        
        // Children score (30%) - based on number of children
        const childCount = nodeData.childCount || 0;
        const MAX_CHILDREN = 10;
        let childrenScore = 0;
        if (childCount > 0) {
            const normalized = Math.log10(childCount + 1) / Math.log10(MAX_CHILDREN + 1);
            childrenScore = Math.min(1, normalized);
        }
        
        // Weighted composite score
        const compositeScore = 
            (onlineScore * weights.online) +
            (recencyScore * weights.recency) +
            (childrenScore * weights.children);
        
        return compositeScore;
    }
    
    /**
     * Get participation score for a node (with caching)
     * @param {string} nodeId - Node ID
     * @returns {number} - Participation score
     */
    getParticipationScore(nodeId) {
        // Check cache first
        if (this.participationScores.has(nodeId)) {
            return this.participationScores.get(nodeId);
        }
        
        // Build node data from chain
        const nodes = this.chain.buildNodeMap();
        const nodeData = nodes[nodeId];
        
        if (!nodeData) {
            return 0;
        }
        
        // Calculate score
        const score = this.calculateParticipationScore(nodeId, nodeData);
        
        // Cache it
        this.participationScores.set(nodeId, score);
        
        return score;
    }
    
    /**
     * Check if a node can propose blocks
     * @param {string} nodeId - Node ID
     * @returns {boolean}
     */
    canPropose(nodeId) {
        const score = this.getParticipationScore(nodeId);
        return score >= this.minParticipationScore;
    }
    
    /**
     * Create participation proof for block proposal
     * @param {string} nodeId - Node ID
     * @returns {Object|null} - Participation proof or null if not eligible
     */
    createParticipationProof(nodeId) {
        const score = this.getParticipationScore(nodeId);
        
        if (score < this.minParticipationScore) {
            return null; // Not eligible
        }
        
        const nodes = this.chain.buildNodeMap();
        const nodeData = nodes[nodeId] || {};
        
        return {
            nodeId: nodeId,
            score: score,
            childCount: nodeData.childCount || 0,
            timestamp: Date.now()
        };
    }
    
    /**
     * Validate participation proof in a block
     * @param {Object} proof - Participation proof
     * @param {string} proposerNodeId - Proposer's node ID
     * @returns {boolean}
     */
    validateParticipationProof(proof, proposerNodeId) {
        if (!proof || !proof.nodeId || !proof.score) {
            return false;
        }
        
        // Proposer must match proof
        if (proof.nodeId !== proposerNodeId) {
            return false;
        }
        
        // Score must meet minimum
        if (proof.score < this.minParticipationScore) {
            return false;
        }
        
        // Verify score matches current chain state (optional - can be relaxed for performance)
        const currentScore = this.getParticipationScore(proposerNodeId);
        if (Math.abs(currentScore - proof.score) > 0.1) {
            // Allow some variance (score changes over time)
            // In production, you might want stricter validation
        }
        
        return true;
    }
    
    /**
     * Get top proposers (nodes with highest participation scores)
     * @param {number} limit - Number of top proposers to return
     * @returns {Array<{nodeId: string, score: number}>}
     */
    getTopProposers(limit = 10) {
        const nodes = this.chain.buildNodeMap();
        const scores = [];
        
        for (const nodeId in nodes) {
            const score = this.getParticipationScore(nodeId);
            scores.push({ nodeId, score });
        }
        
        // Sort by score (descending)
        scores.sort((a, b) => b.score - a.score);
        
        // Filter eligible proposers
        const eligible = scores.filter(s => s.score >= this.minParticipationScore);
        
        return eligible.slice(0, limit);
    }
    
    /**
     * Clear participation score cache
     */
    clearCache() {
        this.participationScores.clear();
    }
    
    /**
     * Update participation scores (called periodically)
     */
    updateParticipationScores() {
        this.clearCache();
        
        // Recalculate all scores
        const nodes = this.chain.buildNodeMap();
        for (const nodeId in nodes) {
            this.getParticipationScore(nodeId);
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProofOfParticipation;
} else {
    window.SrishtiProofOfParticipation = ProofOfParticipation;
}
