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
        // Core events
        GENESIS: 'GENESIS',
        NODE_JOIN: 'NODE_JOIN',
        NODE_ATTEST: 'NODE_ATTEST',
        PRESENCE_UPDATE: 'PRESENCE_UPDATE',
        
        // Parent-child relationship management
        NODE_PARENT_REQUEST: 'NODE_PARENT_REQUEST',   // Request to become child of another node
        NODE_PARENT_UPDATE: 'NODE_PARENT_UPDATE',     // Update parent-child relationship (after approval)
        
        // Institution management
        INSTITUTION_REGISTER: 'INSTITUTION_REGISTER',   // Request to become an issuer
        INSTITUTION_VERIFY: 'INSTITUTION_VERIFY',       // Approve institution (by ROOT/governance)
        INSTITUTION_REVOKE: 'INSTITUTION_REVOKE',       // Remove institution status
        
        // Soulbound tokens (credentials)
        SOULBOUND_MINT: 'SOULBOUND_MINT',               // Issue non-transferable token
        
        // Governance
        GOV_PROPOSAL: 'GOV_PROPOSAL',                   // Create governance proposal
        VOTE_CAST: 'VOTE_CAST',                         // Cast vote on proposal
        
        // Account management
        SOCIAL_RECOVERY_UPDATE: 'SOCIAL_RECOVERY_UPDATE' // Update recovery guardians
    };
    
    /**
     * Node role constants - defines what actions a node can perform
     */
    static ROLES = {
        USER: 'USER',                       // Regular participant
        INSTITUTION: 'INSTITUTION',         // Verified institution - can issue soulbound tokens
        GOVERNANCE_ADMIN: 'GOVERNANCE_ADMIN', // Can create system-wide proposals
        ROOT: 'ROOT'                        // Genesis authority - can verify institutions
    };
    
    /**
     * Institution category constants
     */
    static INSTITUTION_CATEGORIES = {
        EDUCATION: 'EDUCATION',             // Universities, colleges, schools
        CERTIFICATION: 'CERTIFICATION',     // Professional certifications
        GOVERNMENT: 'GOVERNMENT',           // Government agencies
        EMPLOYER: 'EMPLOYER',               // Companies issuing work credentials
        HEALTHCARE: 'HEALTHCARE',           // Medical institutions
        COMMUNITY: 'COMMUNITY'              // Community organizations
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
     * Create an INSTITUTION_REGISTER event
     * @param {Object} options
     * @returns {Object} Institution registration event
     */
    static createInstitutionRegister(options) {
        if (!options.nodeId || !options.name || !options.category) {
            throw new Error('INSTITUTION_REGISTER requires nodeId, name, and category');
        }
        
        return {
            type: this.TYPES.INSTITUTION_REGISTER,
            timestamp: Date.now(),
            sender: options.nodeId,
            payload: {
                name: options.name,
                category: options.category,
                description: options.description || '',
                proofUrl: options.proofUrl || null,
                contactEmail: options.contactEmail || null
            }
        };
    }
    
    /**
     * Create an INSTITUTION_VERIFY event (only ROOT/GOVERNANCE can create)
     * @param {Object} options
     * @returns {Object} Institution verification event
     */
    static createInstitutionVerify(options) {
        if (!options.verifierId || !options.targetNodeId) {
            throw new Error('INSTITUTION_VERIFY requires verifierId and targetNodeId');
        }
        
        return {
            type: this.TYPES.INSTITUTION_VERIFY,
            timestamp: Date.now(),
            sender: options.verifierId,
            payload: {
                targetNodeId: options.targetNodeId,
                approved: options.approved !== undefined ? options.approved : true,
                reason: options.reason || null
            }
        };
    }
    
    /**
     * Create an INSTITUTION_REVOKE event
     * @param {Object} options
     * @returns {Object} Institution revocation event
     */
    static createInstitutionRevoke(options) {
        if (!options.revokerId || !options.targetNodeId) {
            throw new Error('INSTITUTION_REVOKE requires revokerId and targetNodeId');
        }
        
        return {
            type: this.TYPES.INSTITUTION_REVOKE,
            timestamp: Date.now(),
            sender: options.revokerId,
            payload: {
                targetNodeId: options.targetNodeId,
                reason: options.reason || 'No reason provided'
            }
        };
    }
    
    /**
     * Create a SOULBOUND_MINT event (only INSTITUTION can create)
     * @param {Object} options
     * @returns {Object} Soulbound mint event
     */
    static createSoulboundMint(options) {
        if (!options.issuerId || !options.recipientId || !options.achievementId) {
            throw new Error('SOULBOUND_MINT requires issuerId, recipientId, and achievementId');
        }
        
        return {
            type: this.TYPES.SOULBOUND_MINT,
            timestamp: Date.now(),
            sender: options.issuerId,
            recipient: options.recipientId,
            payload: {
                achievementId: options.achievementId,
                title: options.title || options.achievementId,
                description: options.description || '',
                ipfsProof: options.ipfsProof || null,
                isTransferable: false, // Always false for soulbound
                revocable: options.revocable !== undefined ? options.revocable : true,
                metadata: options.metadata || {}
            }
        };
    }
    
    /**
     * Create a GOV_PROPOSAL event
     * @param {Object} options
     * @returns {Object} Governance proposal event
     */
    static createGovProposal(options) {
        if (!options.proposerId || !options.description) {
            throw new Error('GOV_PROPOSAL requires proposerId and description');
        }
        
        return {
            type: this.TYPES.GOV_PROPOSAL,
            timestamp: Date.now(),
            sender: options.proposerId,
            payload: {
                proposalId: options.proposalId || `PROP_${Date.now()}`,
                title: options.title || 'Untitled Proposal',
                description: options.description,
                votingPeriodBlocks: options.votingPeriodBlocks || 5000,
                quorumThreshold: options.quorumThreshold || '20%',
                ipfsManifesto: options.ipfsManifesto || null
            }
        };
    }
    
    /**
     * Create a VOTE_CAST event
     * @param {Object} options
     * @returns {Object} Vote cast event
     */
    static createVoteCast(options) {
        if (!options.voterId || !options.proposalId || !options.vote) {
            throw new Error('VOTE_CAST requires voterId, proposalId, and vote');
        }
        
        const validVotes = ['YES', 'NO', 'ABSTAIN'];
        if (!validVotes.includes(options.vote.toUpperCase())) {
            throw new Error(`Vote must be one of: ${validVotes.join(', ')}`);
        }
        
        return {
            type: this.TYPES.VOTE_CAST,
            timestamp: Date.now(),
            sender: options.voterId,
            payload: {
                proposalId: options.proposalId,
                vote: options.vote.toUpperCase(),
                weight: options.weight || 'EQUAL'
            }
        };
    }
    
    /**
     * Create a NODE_PARENT_REQUEST event (request to become child of another node)
     * @param {Object} options
     * @returns {Object} Parent request event
     */
    static createNodeParentRequest(options) {
        if (!options.nodeId || !options.parentId) {
            throw new Error('NODE_PARENT_REQUEST requires nodeId and parentId');
        }
        
        return {
            type: this.TYPES.NODE_PARENT_REQUEST,
            timestamp: Date.now(),
            sender: options.nodeId,
            payload: {
                parentId: options.parentId,
                reason: options.reason || null,
                metadata: options.metadata || {}
            }
        };
    }
    
    /**
     * Create a NODE_PARENT_UPDATE event (update parent-child relationship)
     * Supports multiple parents with ADD/REMOVE actions
     * @param {Object} options
     * @returns {Object} Parent update event
     */
    static createNodeParentUpdate(options) {
        if (!options.nodeId || (options.action !== 'ADD' && options.action !== 'REMOVE' && !options.newParentId)) {
            throw new Error('NODE_PARENT_UPDATE requires nodeId and either (action and parentId) or newParentId for backward compatibility');
        }
        
        // For backward compatibility, if newParentId is provided without action, use SET action
        const action = options.action || (options.newParentId ? 'SET' : null);
        const parentId = options.parentId || options.newParentId;
        
        return {
            type: this.TYPES.NODE_PARENT_UPDATE,
            timestamp: Date.now(),
            sender: options.approverId || options.nodeId, // Can be approved by parent or self-updated
            payload: {
                nodeId: options.nodeId,
                action: action, // 'ADD', 'REMOVE', or 'SET' (for backward compatibility)
                parentId: parentId, // The parent being added/removed/set
                newParentId: options.newParentId || null, // For backward compatibility
                oldParentId: options.oldParentId || null, // For backward compatibility
                reason: options.reason || null
            }
        };
    }
    
    /**
     * Create a SOCIAL_RECOVERY_UPDATE event
     * @param {Object} options
     * @returns {Object} Social recovery update event
     */
    static createSocialRecoveryUpdate(options) {
        if (!options.nodeId || !options.guardians || !options.threshold) {
            throw new Error('SOCIAL_RECOVERY_UPDATE requires nodeId, guardians, and threshold');
        }
        
        if (!Array.isArray(options.guardians) || options.guardians.length === 0) {
            throw new Error('Guardians must be a non-empty array');
        }
        
        if (options.threshold < 1 || options.threshold > options.guardians.length) {
            throw new Error(`Threshold must be between 1 and ${options.guardians.length}`);
        }
        
        return {
            type: this.TYPES.SOCIAL_RECOVERY_UPDATE,
            timestamp: Date.now(),
            sender: options.nodeId,
            payload: {
                recoveryThreshold: options.threshold,
                guardians: options.guardians
            }
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
            case this.TYPES.INSTITUTION_REGISTER:
                return !!(event.sender && event.payload?.name && event.payload?.category);
            case this.TYPES.INSTITUTION_VERIFY:
                return !!(event.sender && event.payload?.targetNodeId);
            case this.TYPES.INSTITUTION_REVOKE:
                return !!(event.sender && event.payload?.targetNodeId);
            case this.TYPES.SOULBOUND_MINT:
                return !!(event.sender && event.recipient && event.payload?.achievementId);
            case this.TYPES.GOV_PROPOSAL:
                return !!(event.sender && event.payload?.proposalId && event.payload?.description);
            case this.TYPES.VOTE_CAST:
                return !!(event.sender && event.payload?.proposalId && event.payload?.vote);
            case this.TYPES.SOCIAL_RECOVERY_UPDATE:
                return !!(event.sender && event.payload?.guardians && event.payload?.recoveryThreshold);
            case this.TYPES.NODE_PARENT_REQUEST:
                return !!(event.sender && event.payload?.parentId);
            case this.TYPES.NODE_PARENT_UPDATE:
                return !!(event.sender && event.payload?.nodeId && 
                         (event.payload?.parentId || event.payload?.newParentId || 
                          (event.payload?.action && (event.payload?.action === 'ADD' || event.payload?.action === 'REMOVE'))));
            default:
                // Allow unknown types for forward compatibility
                return !!event.timestamp;
        }
    }
    
    /**
     * Check if a role has authority to perform an action
     * @param {string} role - The role to check
     * @param {string} action - The action type
     * @returns {boolean}
     */
    static hasAuthority(role, action) {
        const permissions = {
            [this.ROLES.ROOT]: [
                this.TYPES.INSTITUTION_VERIFY,
                this.TYPES.INSTITUTION_REVOKE,
                this.TYPES.GOV_PROPOSAL,
                this.TYPES.VOTE_CAST
            ],
            [this.ROLES.GOVERNANCE_ADMIN]: [
                this.TYPES.INSTITUTION_VERIFY,
                this.TYPES.GOV_PROPOSAL,
                this.TYPES.VOTE_CAST
            ],
            [this.ROLES.INSTITUTION]: [
                this.TYPES.SOULBOUND_MINT,
                this.TYPES.GOV_PROPOSAL,
                this.TYPES.VOTE_CAST
            ],
            [this.ROLES.USER]: [
                this.TYPES.INSTITUTION_REGISTER,
                this.TYPES.VOTE_CAST,
                this.TYPES.SOCIAL_RECOVERY_UPDATE
            ]
        };
        
        return permissions[role]?.includes(action) || false;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Event;
} else {
    window.SrishtiEvent = Event;
}
