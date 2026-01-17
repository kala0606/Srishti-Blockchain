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
     * @param {IndexedDBStore} storage - Optional storage instance for state persistence
     */
    constructor(genesisBlock = null, storage = null) {
        this.blocks = [];
        this.storage = storage;
        
        // In-memory state (fallback if storage not available)
        this.state = {
            activeProposals: {}, // proposalId -> proposal data
            accountStates: {}, // sender address -> { guardians: [], recoveryThreshold: number }
            soulboundTokens: {}, // recipient address -> { tokens: [{ achievementId, ipfsProof, ... }] }
            
            // Institution management
            institutions: {},       // nodeId -> { name, category, verified, verifiedAt, verifiedBy }
            pendingInstitutions: {}, // nodeId -> { name, category, requestedAt, status }
            
            // Role assignments (ROOT is assigned to first node)
            nodeRoles: {}           // nodeId -> role (USER, INSTITUTION, GOVERNANCE_ADMIN, ROOT)
        };
        
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
        
        // Process transactions before adding block
        await this.processTransactions(block);
        
        // Add block
        this.blocks.push(block);
        return true;
    }
    
    /**
     * Process transactions in a block
     * Handles different transaction types and updates chain state
     * @param {Block} block - Block containing transactions to process
     * @returns {Promise<void>}
     */
    async processTransactions(block) {
        const transactions = block.getEvents();
        
        for (const tx of transactions) {
            if (!tx || !tx.type) {
                continue; // Skip invalid transactions
            }
            
            switch (tx.type) {
                case 'NODE_JOIN':
                    await this.handleNodeJoin(tx, block);
                    break;
                    
                case 'INSTITUTION_REGISTER':
                    await this.handleInstitutionRegister(tx);
                    break;
                    
                case 'INSTITUTION_VERIFY':
                    await this.handleInstitutionVerify(tx);
                    break;
                    
                case 'INSTITUTION_REVOKE':
                    await this.handleInstitutionRevoke(tx);
                    break;
                    
                case 'SOULBOUND_MINT':
                    await this.handleSoulboundMint(tx);
                    break;
                    
                case 'GOV_PROPOSAL':
                    await this.handleGovProposal(tx, block);
                    break;
                    
                case 'SOCIAL_RECOVERY_UPDATE':
                    await this.handleSocialRecoveryUpdate(tx);
                    break;
                    
                case 'VOTE_CAST':
                    await this.handleVoteCast(tx);
                    break;
                    
                default:
                    // Unknown transaction type - skip silently for forward compatibility
                    break;
            }
        }
    }
    
    /**
     * Handle NODE_JOIN - assign roles (first node gets ROOT)
     * @param {Object} tx - Transaction object
     * @param {Block} block - Block containing the transaction
     */
    async handleNodeJoin(tx, block) {
        const nodeId = tx.nodeId;
        
        // First non-genesis node join gets ROOT role
        // Check if this is the first NODE_JOIN in the chain
        const existingRoles = Object.keys(this.state.nodeRoles);
        
        // More flexible ROOT assignment:
        // - First NODE_JOIN event in the chain gets ROOT
        // - Check if existingRoles is empty (no other NODE_JOINs processed yet)
        if (existingRoles.length === 0) {
            // This is the first node to join - assign ROOT role
            this.state.nodeRoles[nodeId] = 'ROOT';
            console.log(`👑 ROOT role assigned to first node: ${nodeId} (block ${block.index})`);
        } else if (!this.state.nodeRoles[nodeId]) {
            // New node that doesn't have a role yet - assign USER
            this.state.nodeRoles[nodeId] = 'USER';
            console.log(`👤 USER role assigned to: ${nodeId} (block ${block.index})`);
        }
        // If nodeId already has a role, don't change it (e.g., might be INSTITUTION)
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata('node_roles', this.state.nodeRoles);
        }
    }
    
    /**
     * Handle INSTITUTION_REGISTER - request to become an institution
     * @param {Object} tx - Transaction object
     */
    async handleInstitutionRegister(tx) {
        if (!tx.sender || !tx.payload) {
            console.warn('Invalid INSTITUTION_REGISTER: missing required fields');
            return;
        }
        
        const { name, category, description, proofUrl, contactEmail } = tx.payload;
        
        // Check if already registered or verified
        if (this.state.institutions[tx.sender]) {
            console.warn(`INSTITUTION_REGISTER rejected: ${tx.sender} is already a verified institution`);
            return;
        }
        
        if (this.state.pendingInstitutions[tx.sender]) {
            console.warn(`INSTITUTION_REGISTER rejected: ${tx.sender} already has a pending registration`);
            return;
        }
        
        // Add to pending registrations
        this.state.pendingInstitutions[tx.sender] = {
            name: name,
            category: category,
            description: description || '',
            proofUrl: proofUrl || null,
            contactEmail: contactEmail || null,
            requestedAt: tx.timestamp || Date.now(),
            status: 'PENDING'
        };
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata(`pending_institution_${tx.sender}`, this.state.pendingInstitutions[tx.sender]);
            await this.storage.saveMetadata('pending_institutions_list', Object.keys(this.state.pendingInstitutions));
        }
        
        console.log(`📋 Institution registration request: ${name} (${category}) from ${tx.sender}`);
        console.log(`📊 Pending institutions now:`, Object.keys(this.state.pendingInstitutions));
    }
    
    /**
     * Handle INSTITUTION_VERIFY - approve/reject an institution (only ROOT/GOVERNANCE_ADMIN)
     * @param {Object} tx - Transaction object
     */
    async handleInstitutionVerify(tx) {
        if (!tx.sender || !tx.payload?.targetNodeId) {
            console.warn('Invalid INSTITUTION_VERIFY: missing required fields');
            return;
        }
        
        // Authorization check - only ROOT or GOVERNANCE_ADMIN can verify
        const senderRole = this.state.nodeRoles[tx.sender];
        if (senderRole !== 'ROOT' && senderRole !== 'GOVERNANCE_ADMIN') {
            console.warn(`❌ INSTITUTION_VERIFY rejected: ${tx.sender} lacks authority (role: ${senderRole})`);
            return;
        }
        
        const { targetNodeId, approved, reason } = tx.payload;
        const pending = this.state.pendingInstitutions[targetNodeId];
        
        if (!pending) {
            console.warn(`INSTITUTION_VERIFY: No pending registration for ${targetNodeId}`);
            return;
        }
        
        if (approved) {
            // Approve institution
            this.state.institutions[targetNodeId] = {
                ...pending,
                verified: true,
                verifiedAt: tx.timestamp || Date.now(),
                verifiedBy: tx.sender,
                status: 'VERIFIED'
            };
            
            // Update role to INSTITUTION
            this.state.nodeRoles[targetNodeId] = 'INSTITUTION';
            
            // Remove from pending
            delete this.state.pendingInstitutions[targetNodeId];
            
            console.log(`✅ Institution VERIFIED: ${pending.name} (${targetNodeId})`);
        } else {
            // Reject institution
            this.state.pendingInstitutions[targetNodeId].status = 'REJECTED';
            this.state.pendingInstitutions[targetNodeId].rejectedAt = tx.timestamp || Date.now();
            this.state.pendingInstitutions[targetNodeId].rejectedBy = tx.sender;
            this.state.pendingInstitutions[targetNodeId].rejectionReason = reason || 'Not specified';
            
            console.log(`❌ Institution REJECTED: ${pending.name} (${targetNodeId}) - ${reason || 'No reason'}`);
        }
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata('institutions', this.state.institutions);
            await this.storage.saveMetadata('node_roles', this.state.nodeRoles);
            await this.storage.saveMetadata('pending_institutions_list', Object.keys(this.state.pendingInstitutions));
        }
    }
    
    /**
     * Handle INSTITUTION_REVOKE - remove institution status
     * @param {Object} tx - Transaction object
     */
    async handleInstitutionRevoke(tx) {
        if (!tx.sender || !tx.payload?.targetNodeId) {
            console.warn('Invalid INSTITUTION_REVOKE: missing required fields');
            return;
        }
        
        // Authorization check - only ROOT can revoke
        const senderRole = this.state.nodeRoles[tx.sender];
        if (senderRole !== 'ROOT') {
            console.warn(`❌ INSTITUTION_REVOKE rejected: ${tx.sender} lacks authority (only ROOT can revoke)`);
            return;
        }
        
        const { targetNodeId, reason } = tx.payload;
        const institution = this.state.institutions[targetNodeId];
        
        if (!institution) {
            console.warn(`INSTITUTION_REVOKE: ${targetNodeId} is not a verified institution`);
            return;
        }
        
        // Revoke institution status
        institution.verified = false;
        institution.revokedAt = tx.timestamp || Date.now();
        institution.revokedBy = tx.sender;
        institution.revocationReason = reason;
        institution.status = 'REVOKED';
        
        // Downgrade role to USER
        this.state.nodeRoles[targetNodeId] = 'USER';
        
        console.log(`🚫 Institution REVOKED: ${institution.name} (${targetNodeId}) - ${reason}`);
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata('institutions', this.state.institutions);
            await this.storage.saveMetadata('node_roles', this.state.nodeRoles);
        }
    }
    
    /**
     * Handle VOTE_CAST - record a vote on a proposal
     * @param {Object} tx - Transaction object
     */
    async handleVoteCast(tx) {
        if (!tx.sender || !tx.payload?.proposalId || !tx.payload?.vote) {
            console.warn('Invalid VOTE_CAST: missing required fields');
            return;
        }
        
        const { proposalId, vote, weight } = tx.payload;
        const proposal = this.state.activeProposals[proposalId];
        
        if (!proposal) {
            console.warn(`VOTE_CAST: Proposal ${proposalId} not found`);
            return;
        }
        
        // Check if already voted
        if (proposal.voters.includes(tx.sender)) {
            console.warn(`VOTE_CAST: ${tx.sender} has already voted on ${proposalId}`);
            return;
        }
        
        // Record vote
        const voteWeight = weight === 'QUADRATIC' ? Math.sqrt(1) : 1; // Simplified for now
        proposal.votes[vote] = (proposal.votes[vote] || 0) + voteWeight;
        proposal.voters.push(tx.sender);
        
        console.log(`🗳️ Vote recorded: ${tx.sender} voted ${vote} on ${proposalId}`);
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata(`proposal_${proposalId}`, proposal);
        }
    }
    
    /**
     * Handle SOULBOUND_MINT transaction
     * Enforces non-transferability by storing soulbound token data
     * @param {Object} tx - Transaction object
     * @returns {Promise<void>}
     */
    async handleSoulboundMint(tx) {
        if (!tx.sender || !tx.recipient || !tx.payload) {
            console.warn('Invalid SOULBOUND_MINT transaction: missing required fields');
            return;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // AUTHORIZATION CHECK: Only verified INSTITUTIONS can mint
        // ═══════════════════════════════════════════════════════════════
        if (!this.isVerifiedInstitution(tx.sender)) {
            console.warn(`❌ SOULBOUND_MINT REJECTED: ${tx.sender} is not a verified institution`);
            console.warn(`   To mint soulbound tokens, the sender must:`);
            console.warn(`   1. Register as institution via INSTITUTION_REGISTER`);
            console.warn(`   2. Be verified by ROOT/GOVERNANCE via INSTITUTION_VERIFY`);
            return;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PREVENT SELF-MINTING: Cannot issue credentials to yourself
        // ═══════════════════════════════════════════════════════════════
        if (tx.sender === tx.recipient) {
            console.warn(`❌ SOULBOUND_MINT REJECTED: Cannot mint to self (${tx.sender})`);
            return;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // VERIFY RECIPIENT EXISTS: Must be a registered node
        // ═══════════════════════════════════════════════════════════════
        const nodes = this.buildNodeMap();
        if (!nodes[tx.recipient]) {
            console.warn(`❌ SOULBOUND_MINT REJECTED: Recipient ${tx.recipient} not found in network`);
            return;
        }
        
        const { achievementId, title, description, ipfsProof, revocable, metadata } = tx.payload;
        
        // Initialize recipient's soulbound tokens if needed
        if (!this.state.soulboundTokens[tx.recipient]) {
            this.state.soulboundTokens[tx.recipient] = { tokens: [] };
        }
        
        // Get institution details for the token
        const institution = this.state.institutions[tx.sender];
        
        // Add soulbound token to recipient's account
        const tokenData = {
            achievementId: achievementId,
            title: title || achievementId,
            description: description || '',
            ipfsProof: ipfsProof || null,
            isTransferable: false, // Always non-transferable
            revocable: revocable !== undefined ? revocable : true,
            issuer: tx.sender,
            issuerName: institution?.name || 'Unknown Institution',
            issuerCategory: institution?.category || 'UNKNOWN',
            mintedAt: tx.timestamp || Date.now(),
            metadata: metadata || {}
        };
        
        this.state.soulboundTokens[tx.recipient].tokens.push(tokenData);
        
        // Persist to storage if available
        if (this.storage) {
            await this.storage.saveMetadata(
                `soulbound_${tx.recipient}`,
                this.state.soulboundTokens[tx.recipient]
            );
        }
        
        console.log(`✅ Soulbound token minted: "${title || achievementId}" -> ${tx.recipient} (issued by ${institution?.name || tx.sender})`);
    }
    
    /**
     * Check if a node is a verified institution
     * @param {string} nodeId - Node ID to check
     * @returns {boolean}
     */
    isVerifiedInstitution(nodeId) {
        const institution = this.state.institutions[nodeId];
        return institution?.verified === true;
    }
    
    /**
     * Get node role
     * @param {string} nodeId - Node ID
     * @returns {string} - Role (USER, INSTITUTION, GOVERNANCE_ADMIN, ROOT)
     */
    getNodeRole(nodeId) {
        return this.state.nodeRoles[nodeId] || 'USER';
    }
    
    /**
     * Get all institutions (verified and pending)
     * @returns {Object}
     */
    getInstitutions() {
        return {
            verified: { ...this.state.institutions },
            pending: { ...this.state.pendingInstitutions }
        };
    }
    
    /**
     * Get pending institution registrations
     * @returns {Object}
     */
    getPendingInstitutions() {
        return { ...this.state.pendingInstitutions };
    }
    
    /**
     * Handle GOV_PROPOSAL transaction
     * Adds proposal to active proposals list
     * @param {Object} tx - Transaction object
     * @param {Block} block - Block containing the transaction
     * @returns {Promise<void>}
     */
    async handleGovProposal(tx) {
        if (!tx.sender || !tx.payload || !tx.payload.proposalId) {
            console.warn('Invalid GOV_PROPOSAL transaction: missing required fields');
            return;
        }
        
        const { proposalId, description, votingPeriodBlocks, quorumThreshold, ipfsManifesto } = tx.payload;
        
        // Create proposal data
        const proposalData = {
            proposalId: proposalId,
            sender: tx.sender,
            description: description || '',
            votingPeriodBlocks: votingPeriodBlocks || 5000,
            quorumThreshold: quorumThreshold || '20%',
            ipfsManifesto: ipfsManifesto || null,
            createdAt: tx.timestamp || Date.now(),
            blockNumber: this.blocks.length, // Will be the current block index after adding
            status: 'ACTIVE',
            votes: {
                YES: 0,
                NO: 0,
                ABSTAIN: 0
            },
            voters: []
        };
        
        // Add to active proposals
        this.state.activeProposals[proposalId] = proposalData;
        
        // Persist to storage if available
        if (this.storage) {
            await this.storage.saveMetadata(
                `proposal_${proposalId}`,
                proposalData
            );
            
            // Also update the active proposals list
            await this.storage.saveMetadata(
                'active_proposals',
                Object.keys(this.state.activeProposals)
            );
        }
        
        console.log(`✅ Governance proposal added: ${proposalId} by ${tx.sender}`);
    }
    
    /**
     * Handle SOCIAL_RECOVERY_UPDATE transaction
     * Maps guardian addresses to sender's account state
     * @param {Object} tx - Transaction object
     * @returns {Promise<void>}
     */
    async handleSocialRecoveryUpdate(tx) {
        if (!tx.sender || !tx.payload) {
            console.warn('Invalid SOCIAL_RECOVERY_UPDATE transaction: missing required fields');
            return;
        }
        
        const { recoveryThreshold, guardians } = tx.payload;
        
        if (!Array.isArray(guardians) || guardians.length === 0) {
            console.warn('Invalid SOCIAL_RECOVERY_UPDATE: guardians must be a non-empty array');
            return;
        }
        
        if (!recoveryThreshold || recoveryThreshold < 1 || recoveryThreshold > guardians.length) {
            console.warn(`Invalid SOCIAL_RECOVERY_UPDATE: recoveryThreshold (${recoveryThreshold}) must be between 1 and ${guardians.length}`);
            return;
        }
        
        // Initialize account state if needed
        if (!this.state.accountStates[tx.sender]) {
            this.state.accountStates[tx.sender] = {
                guardians: [],
                recoveryThreshold: 0,
                updatedAt: null
            };
        }
        
        // Update account state with guardian addresses
        this.state.accountStates[tx.sender].guardians = guardians;
        this.state.accountStates[tx.sender].recoveryThreshold = recoveryThreshold;
        this.state.accountStates[tx.sender].updatedAt = tx.timestamp || Date.now();
        
        // Persist to storage if available
        if (this.storage) {
            await this.storage.saveMetadata(
                `account_${tx.sender}`,
                this.state.accountStates[tx.sender]
            );
        }
        
        console.log(`✅ Social recovery updated for ${tx.sender}: ${guardians.length} guardians, threshold: ${recoveryThreshold}`);
    }
    
    /**
     * Get active proposals
     * @returns {Object} - Object of active proposals indexed by proposalId
     */
    getActiveProposals() {
        return { ...this.state.activeProposals };
    }
    
    /**
     * Get account state for a given address
     * @param {string} address - Account address
     * @returns {Object|null} - Account state or null if not found
     */
    getAccountState(address) {
        return this.state.accountStates[address] || null;
    }
    
    /**
     * Get soulbound tokens for a given recipient
     * @param {string} recipient - Recipient address
     * @returns {Array} - Array of soulbound tokens
     */
    getSoulboundTokens(recipient) {
        return this.state.soulboundTokens[recipient]?.tokens || [];
    }
    
    /**
     * Load state from storage (call this after chain is loaded)
     * @returns {Promise<void>}
     */
    async loadState() {
        if (!this.storage) {
            return; // No storage available
        }
        
        try {
            // Load active proposals
            const activeProposalIds = await this.storage.getMetadata('active_proposals') || [];
            for (const proposalId of activeProposalIds) {
                const proposal = await this.storage.getMetadata(`proposal_${proposalId}`);
                if (proposal) {
                    this.state.activeProposals[proposalId] = proposal;
                }
            }
            
            // Note: Account states and soulbound tokens are loaded on-demand
            // when needed, as there could be many addresses
            console.log(`✅ Chain state loaded: ${activeProposalIds.length} active proposals`);
        } catch (error) {
            console.warn('Failed to load chain state from storage:', error);
        }
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
     * @returns {Object} - Nodes object with node data indexed by nodeId
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
    static fromJSON(json, storage = null) {
        if (!window.SrishtiBlock) {
            throw new Error('SrishtiBlock not loaded');
        }
        
        const chain = new Chain(null, storage);
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
        
        // Reset state before rebuilding
        this.state = {
            activeProposals: {},
            accountStates: {},
            soulboundTokens: {},
            institutions: {},
            pendingInstitutions: {},
            nodeRoles: {}
        };
        
        // Rebuild state by reprocessing all transactions
        for (const block of this.blocks) {
            await this.processTransactions(block);
        }
        
        return true;
    }
    
    /**
     * Prune the chain, keeping only the last N blocks
     * @param {number} keepLastN - Number of blocks to keep
     * @returns {Promise<Array>} - Array of pruned block indices
     */
    async prune(keepLastN) {
        if (this.blocks.length <= keepLastN) {
            return []; // Nothing to prune
        }
        
        const pruneCount = this.blocks.length - keepLastN;
        const prunedIndices = [];
        
        // Store indices of blocks to be pruned
        for (let i = 0; i < pruneCount; i++) {
            prunedIndices.push(i);
        }
        
        // Remove blocks from chain
        this.blocks.splice(0, pruneCount);
        
        // Update block indices
        for (let i = 0; i < this.blocks.length; i++) {
            this.blocks[i].index = i;
        }
        
        return prunedIndices;
    }
    
    /**
     * Generate Merkle proof for a transaction in a specific block
     * @param {number} blockIndex - Index of the block containing the transaction
     * @param {string} transactionId - Hash/ID of the transaction to prove
     * @returns {Promise<Object|null>} - Merkle proof object or null if not found
     */
    async generateMerkleProof(blockIndex, transactionId) {
        if (!window.SrishtiMerkleTree) {
            throw new Error('SrishtiMerkleTree not loaded');
        }

        const block = this.getBlock(blockIndex);
        if (!block) {
            return null;
        }

        // Ensure block has body
        if (!block.body) {
            // Initialize body from legacy data
            const transactions = block.getEvents();
            block.body = new window.SrishtiBlockBody(transactions);
        }

        // Find transaction in block
        const result = await block.body.findTransaction(transactionId);
        if (!result) {
            return null;
        }

        // Generate proof
        const transactions = block.body.getTransactions();
        const proof = await window.SrishtiMerkleTree.generateProof(transactions, result.index);

        // Include block header for verification
        const header = block.getHeader();
        if (!header) {
            // Ensure header is computed
            await block.computeHash();
        }

        return {
            blockIndex: blockIndex,
            blockHash: block.hash,
            transaction: result.transaction,
            transactionIndex: result.index,
            proof: proof,
            header: block.getHeader().toJSON()
        };
    }

    /**
     * Generate Merkle proof for a transaction by searching all blocks
     * @param {string} transactionId - Hash/ID of the transaction to prove
     * @returns {Promise<Object|null>} - Merkle proof object or null if not found
     */
    async findTransactionAndGenerateProof(transactionId) {
        for (let i = 0; i < this.blocks.length; i++) {
            const proof = await this.generateMerkleProof(i, transactionId);
            if (proof) {
                return proof;
            }
        }
        return null;
    }

    /**
     * Validate chain integrity with checkpoints
     * @param {Array} checkpoints - Array of checkpoint objects
     * @returns {Promise<boolean>} - True if valid
     */
    async validateWithCheckpoints(checkpoints) {
        if (!checkpoints || checkpoints.length === 0) {
            return true; // No checkpoints to validate against
        }
        
        // Check that first block's previousHash matches last checkpoint
        if (this.blocks.length > 0) {
            const firstBlock = this.blocks[0];
            const lastCheckpoint = checkpoints[checkpoints.length - 1];
            
            if (firstBlock.previousHash !== lastCheckpoint.hash) {
                console.error('Chain integrity check failed: previousHash mismatch with checkpoint');
                return false;
            }
        }
        
        return true;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Chain;
} else {
    window.SrishtiChain = Chain;
}
