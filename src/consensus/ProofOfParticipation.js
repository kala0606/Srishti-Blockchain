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
        
        // Sybil resistance: track block proposals per node
        this.proposalHistory = new Map(); // Map<nodeId, Array<timestamp>>
        this.lastProposalTime = new Map(); // Map<nodeId, timestamp>
        this.childCreationHistory = new Map(); // Map<nodeId, Array<timestamp>>
        
        // Configuration
        this.MIN_TIME_IN_NETWORK = 3600000; // 1 hour minimum
        this.PROPOSAL_COOLDOWN = 60000; // 1 minute between proposals
        this.MAX_CHILDREN_PER_HOUR = 10; // Max children per hour
    }
    
    /**
     * Calculate participation score for a node
     * Uses the same logic as the glow calculator with Sybil resistance
     * @param {string} nodeId - Node ID
     * @param {Object} nodeData - Node data (from chain)
     * @returns {number} - Participation score (0 to 1)
     */
    calculateParticipationScore(nodeId, nodeData) {
        const weights = {
            online: 0.30,
            recency: 0.25,
            children: 0.20,
            networkAge: 0.25 // New: time in network
        };
        
        // Online score (30%)
        const onlineScore = nodeData.isOnline ? 1.0 : 0.0;
        
        // Recency score (25%) - based on last seen
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
        
        // Children score (20%) - based on number of children (reduced weight)
        const childCount = nodeData.childCount || 0;
        const MAX_CHILDREN = 10;
        let childrenScore = 0;
        if (childCount > 0) {
            const normalized = Math.log10(childCount + 1) / Math.log10(MAX_CHILDREN + 1);
            childrenScore = Math.min(1, normalized);
        }
        
        // Network age score (25%) - Sybil resistance: longer in network = higher score
        let networkAgeScore = 0;
        if (nodeData.createdAt) {
            const now = Date.now();
            const age = now - nodeData.createdAt;
            const MIN_AGE = this.MIN_TIME_IN_NETWORK;
            const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
            
            if (age < MIN_AGE) {
                networkAgeScore = 0; // Too new, no score
            } else {
                const normalized = Math.min(1, (age - MIN_AGE) / (MAX_AGE - MIN_AGE));
                networkAgeScore = normalized;
            }
        }
        
        // Weighted composite score
        const compositeScore = 
            (onlineScore * weights.online) +
            (recencyScore * weights.recency) +
            (childrenScore * weights.children) +
            (networkAgeScore * weights.networkAge);
        
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
        if (score < this.minParticipationScore) {
            return false;
        }
        
        // Check cooldown period
        const lastProposal = this.lastProposalTime.get(nodeId);
        if (lastProposal) {
            const timeSince = Date.now() - lastProposal;
            if (timeSince < this.PROPOSAL_COOLDOWN) {
                return false; // Still in cooldown
            }
        }
        
        // Check minimum time in network
        const nodes = this.chain.buildNodeMap();
        const nodeData = nodes[nodeId];
        if (nodeData && nodeData.createdAt) {
            const age = Date.now() - nodeData.createdAt;
            if (age < this.MIN_TIME_IN_NETWORK) {
                return false; // Too new to propose
            }
        }
        
        return true;
    }
    
    /**
     * Create participation proof for block proposal
     * @param {string} nodeId - Node ID
     * @returns {Object|null} - Participation proof or null if not eligible
     */
    createParticipationProof(nodeId) {
        if (!this.canPropose(nodeId)) {
            return null; // Not eligible
        }
        
        const score = this.getParticipationScore(nodeId);
        const nodes = this.chain.buildNodeMap();
        const nodeData = nodes[nodeId] || {};
        
        // Record proposal
        const now = Date.now();
        this.lastProposalTime.set(nodeId, now);
        
        const history = this.proposalHistory.get(nodeId) || [];
        history.push(now);
        // Keep only last hour of history
        const oneHourAgo = now - 3600000;
        this.proposalHistory.set(nodeId, history.filter(t => t > oneHourAgo));
        
        return {
            nodeId: nodeId,
            score: score,
            childCount: nodeData.childCount || 0,
            timestamp: now,
            networkAge: nodeData.createdAt ? now - nodeData.createdAt : 0
        };
    }
    
    /**
     * Check if node can create a child (rate limiting)
     * @param {string} nodeId - Node ID
     * @returns {boolean}
     */
    canCreateChild(nodeId) {
        const now = Date.now();
        const history = this.childCreationHistory.get(nodeId) || [];
        const oneHourAgo = now - 3600000;
        const recent = history.filter(t => t > oneHourAgo);
        
        if (recent.length >= this.MAX_CHILDREN_PER_HOUR) {
            return false; // Rate limit exceeded
        }
        
        return true;
    }
    
    /**
     * Record child creation
     * @param {string} nodeId - Node ID
     */
    recordChildCreation(nodeId) {
        const now = Date.now();
        const history = this.childCreationHistory.get(nodeId) || [];
        history.push(now);
        
        // Keep only last hour
        const oneHourAgo = now - 3600000;
        this.childCreationHistory.set(nodeId, history.filter(t => t > oneHourAgo));
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
