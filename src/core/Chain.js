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
            nodeRoles: {},           // nodeId -> role (USER, INSTITUTION, GOVERNANCE_ADMIN, ROOT)
            
            // Parent-child requests: parentId -> { childId -> { nodeId, parentId, reason, requestedAt, status } }
            pendingParentRequests: {}, // parentId -> Map of pending requests from children
            
            // KARMA token balances
            karmaBalances: {} // nodeId -> balance (number)
        };
        
        // Only add genesis block if explicitly provided
        // No automatic genesis block creation - must be created manually or loaded from storage
        if (genesisBlock) {
            this.blocks.push(genesisBlock);
        }
    }
    
    /**
     * Clear the chain and reset state
     * @returns {Promise<void>}
     */
    async clearChain() {
        this.blocks = [];
        
        // Reset all state
        this.state = {
            activeProposals: {},
            accountStates: {},
            soulboundTokens: {},
            institutions: {},
            pendingInstitutions: {},
            nodeRoles: {},
            pendingParentRequests: {},
            karmaBalances: {}
        };
        
        // Clear from storage if available
        if (this.storage) {
            await this.storage.saveMetadata('node_roles', {});
            await this.storage.saveMetadata('institutions', {});
            await this.storage.saveMetadata('pending_institutions_list', []);
        }
        
        console.log('🗑️ Chain cleared');
    }
    
    /**
     * Create the genesis (first) block
     * @param {Object} options - Optional genesis data
     * @returns {Promise<Block>} The genesis block
     */
    async createGenesisBlock(options = {}) {
        if (!window.SrishtiEvent || !window.SrishtiBlock || !window.SrishtiHasher) {
            throw new Error('Required dependencies not loaded');
        }
        
        // Clear existing chain first
        await this.clearChain();
        
        // Generate unique message to ensure each genesis block is different
        // This prevents nodes from syncing old chains after reset
        const uniqueId = options.uniqueId || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now();
        const uniqueMessage = options.message 
            ? `${options.message} [${uniqueId}]` 
            : `Srishti timeline begins - ${timestamp} [${uniqueId}]`;
        
        const genesisEvent = window.SrishtiEvent.createGenesis({
            message: uniqueMessage,
            creatorId: options.creatorId || 'genesis',
            uniqueId: uniqueId // Store unique ID for reference
        });
        
        const genesisBlock = new window.SrishtiBlock({
            index: 0,
            timestamp: timestamp, // Use the timestamp we generated
            previousHash: null,
            data: genesisEvent,
            proposer: 'genesis',
            nonce: Math.floor(Math.random() * 1000000) // Add random nonce for extra uniqueness
        });
        
        await genesisBlock.computeHash();
        this.blocks = [genesisBlock];
        
        // Save to storage if available
        if (this.storage) {
            await this.storage.saveBlock(genesisBlock.toJSON());
        }
        
        console.log('🌱 Genesis block created with unique signature:', genesisBlock.hash.substring(0, 16) + '...');
        console.log('   Unique ID:', uniqueId);
        return genesisBlock;
    }
    
    /**
     * Reset chain and create a new genesis block
     * WARNING: This will delete all existing blocks and state!
     * @param {Object} options - Optional genesis data
     * @returns {Promise<Block>} The new genesis block
     */
    async resetChain(options = {}) {
        console.warn('⚠️ RESETTING CHAIN - All data will be lost!');
        return await this.createGenesisBlock(options);
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
                    
                case 'NODE_PARENT_REQUEST':
                    await this.handleNodeParentRequest(tx);
                    // Notify listeners that a parent request was processed
                    if (this.onParentRequestProcessed) {
                        this.onParentRequestProcessed(tx);
                    }
                    break;
                    
                case 'NODE_PARENT_UPDATE':
                    await this.handleNodeParentUpdate(tx);
                    break;
                    
                case 'KARMA_EARN':
                    await this.handleKarmaEarn(tx);
                    break;
                    
                case 'KARMA_TRANSFER':
                    await this.handleKarmaTransfer(tx);
                    break;
                    
                case 'KARMA_UBI':
                    await this.handleKarmaUbi(tx);
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
        
        // Award KARMA for joining (if karma manager is available)
        if (window.SrishtiKarmaManager && this.karmaManager) {
            const joinReward = this.karmaManager.getActivityReward('nodeJoin');
            if (joinReward > 0) {
                // Create KARMA_EARN transaction
                const karmaTx = {
                    type: 'KARMA_EARN',
                    sender: 'SYSTEM',
                    recipient: nodeId,
                    payload: {
                        amount: joinReward,
                        activityType: 'NODE_JOIN',
                        metadata: { blockIndex: block.index }
                    },
                    timestamp: Date.now(),
                    signature: 'system_' + Math.random().toString(36).substring(2, 10)
                };
                await this.handleKarmaEarn(karmaTx);
            }
        }
        
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
            
            // Award KARMA to verifier
            if (this.karmaManager) {
                const verifyReward = this.karmaManager.getActivityReward('institutionVerify');
                if (verifyReward > 0) {
                    const karmaTx = {
                        type: 'KARMA_EARN',
                        sender: 'SYSTEM',
                        recipient: tx.sender,
                        payload: {
                            amount: verifyReward,
                            activityType: 'INSTITUTION_VERIFY',
                            metadata: { targetNodeId: targetNodeId }
                        },
                        timestamp: Date.now(),
                        signature: 'system_' + Math.random().toString(36).substring(2, 10)
                    };
                    await this.handleKarmaEarn(karmaTx);
                }
            }
            
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
        
        // Award KARMA for voting
        if (this.karmaManager) {
            const voteReward = this.karmaManager.getActivityReward('voteCast');
            if (voteReward > 0) {
                const karmaTx = {
                    type: 'KARMA_EARN',
                    sender: 'SYSTEM',
                    recipient: tx.sender,
                    payload: {
                        amount: voteReward,
                        activityType: 'VOTE_CAST',
                        metadata: { proposalId: proposalId }
                    },
                    timestamp: Date.now(),
                    signature: 'system_' + Math.random().toString(36).substring(2, 10)
                };
                await this.handleKarmaEarn(karmaTx);
            }
        }
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata(`proposal_${proposalId}`, proposal);
        }
    }
    
    /**
     * Handle NODE_PARENT_REQUEST - request to become child of another node
     * @param {Object} tx - Transaction object
     */
    async handleNodeParentRequest(tx) {
        if (!tx.sender || !tx.payload?.parentId) {
            console.warn('Invalid NODE_PARENT_REQUEST: missing required fields');
            return;
        }
        
        const { parentId, reason, metadata } = tx.payload;
        const nodeId = tx.sender;
        
        console.log(`📝 Parent request: ${nodeId} wants to become child of ${parentId}${reason ? ` (${reason})` : ''}`);
        
        // Store parent request for approval
        if (!this.state.pendingParentRequests[parentId]) {
            this.state.pendingParentRequests[parentId] = {};
        }
        
        // Check if request already exists
        if (this.state.pendingParentRequests[parentId][nodeId]) {
            console.warn(`⚠️ Parent request already exists: ${nodeId} -> ${parentId}`);
            return;
        }
        
        // Add request
        this.state.pendingParentRequests[parentId][nodeId] = {
            nodeId: nodeId,
            parentId: parentId,
            reason: reason || null,
            metadata: metadata || {},
            requestedAt: tx.timestamp || Date.now(),
            status: 'PENDING'
        };
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata(
                `pending_parent_requests_${parentId}`,
                this.state.pendingParentRequests[parentId]
            );
        }
        
        console.log(`✅ Parent request stored: ${nodeId} -> ${parentId}`);
        
        // Trigger callback if set (for UI updates)
        if (this.onParentRequestProcessed) {
            this.onParentRequestProcessed({
                nodeId: nodeId,
                parentId: parentId,
                reason: reason,
                requestedAt: tx.timestamp || Date.now()
            });
        }
    }
    
    /**
     * Handle NODE_PARENT_UPDATE - update parent-child relationship
     * Supports multiple parents with ADD/REMOVE actions
     * @param {Object} tx - Transaction object
     */
    async handleNodeParentUpdate(tx) {
        if (!tx.sender || !tx.payload?.nodeId) {
            console.warn('Invalid NODE_PARENT_UPDATE: missing required fields');
            return;
        }
        
        const { nodeId, action, parentId, newParentId, oldParentId, reason } = tx.payload;
        
        // Verify the node exists
        const nodeMap = this.buildNodeMap();
        if (!nodeMap[nodeId]) {
            console.warn(`NODE_PARENT_UPDATE: Node ${nodeId} does not exist`);
            return;
        }
        
        // Determine which parent ID to validate
        const targetParentId = parentId || newParentId;
        
        // Verify the parent exists (if not null and not REMOVE action)
        if (targetParentId && action !== 'REMOVE' && !nodeMap[targetParentId]) {
            console.warn(`NODE_PARENT_UPDATE: Parent ${targetParentId} does not exist`);
            return;
        }
        
        const actionDesc = action || 'SET';
        console.log(`🔗 Parent update (${actionDesc}): ${nodeId} ${actionDesc === 'ADD' ? 'adding' : actionDesc === 'REMOVE' ? 'removing' : 'setting'} parent ${targetParentId || 'none'}${reason ? ` (${reason})` : ''}`);
        
        // Award KARMA to parent when child is added (if this is a new relationship)
        if (targetParentId && (action === 'ADD' || actionDesc === 'SET')) {
            const childNode = nodeMap[nodeId];
            const wasAlreadyParent = Array.isArray(childNode.parentIds) && childNode.parentIds.includes(targetParentId);
            
            if (!wasAlreadyParent && this.karmaManager) {
                const childReward = this.karmaManager.getActivityReward('childRecruited');
                if (childReward > 0) {
                    const karmaTx = {
                        type: 'KARMA_EARN',
                        sender: 'SYSTEM',
                        recipient: targetParentId,
                        payload: {
                            amount: childReward,
                            activityType: 'CHILD_RECRUITED',
                            metadata: { childId: nodeId }
                        },
                        timestamp: Date.now(),
                        signature: 'system_' + Math.random().toString(36).substring(2, 10)
                    };
                    await this.handleKarmaEarn(karmaTx);
                }
            }
        }
        
        // Remove pending request when relationship is established (ADD or SET with parentId)
        if (targetParentId && (action === 'ADD' || actionDesc === 'SET')) {
            if (this.state.pendingParentRequests[targetParentId] && 
                this.state.pendingParentRequests[targetParentId][nodeId]) {
                // Mark as approved and remove from pending
                delete this.state.pendingParentRequests[targetParentId][nodeId];
                
                // Clean up if no more pending requests for this parent
                if (Object.keys(this.state.pendingParentRequests[targetParentId]).length === 0) {
                    delete this.state.pendingParentRequests[targetParentId];
                }
                
                // Persist to storage
                if (this.storage) {
                    if (this.state.pendingParentRequests[targetParentId]) {
                        await this.storage.saveMetadata(
                            `pending_parent_requests_${targetParentId}`,
                            this.state.pendingParentRequests[targetParentId]
                        );
                    } else {
                        // Delete metadata if no pending requests remain
                        await this.storage.deleteMetadata(`pending_parent_requests_${targetParentId}`);
                    }
                }
                
                console.log(`✅ Removed pending parent request: ${nodeId} -> ${targetParentId}`);
            }
        }
        
        // Note: The actual parentIds in the node map is updated during buildNodeMap()
        // which reads NODE_PARENT_UPDATE events. This handler is for validation and logging.
    }
    
    /**
     * Get pending parent requests for a specific parent node
     * @param {string} parentId - Parent node ID
     * @returns {Object} - Map of pending requests (childId -> request data)
     */
    getPendingParentRequests(parentId) {
        return this.state.pendingParentRequests[parentId] || {};
    }
    
    /**
     * Add a pending parent request (for P2P requests that haven't been added to chain yet)
     * @param {string} parentId - Parent node ID
     * @param {Object} requestData - Request data
     */
    async addPendingParentRequest(parentId, requestData) {
        if (!this.state.pendingParentRequests[parentId]) {
            this.state.pendingParentRequests[parentId] = {};
        }
        
        this.state.pendingParentRequests[parentId][requestData.nodeId] = {
            ...requestData,
            requestedAt: requestData.requestedAt || Date.now(),
            status: 'PENDING'
        };
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata(
                `pending_parent_requests_${parentId}`,
                this.state.pendingParentRequests[parentId]
            );
        }
        
        console.log(`✅ Added pending parent request: ${requestData.nodeId} -> ${parentId}`);
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
        
        // ═══════════════════════════════════════════════════════════════
        // VERIFY PARENT-CHILD RELATIONSHIP: Recipient must be a child of the institution
        // ═══════════════════════════════════════════════════════════════
        const recipientNode = nodes[tx.recipient];
        const recipientParentIds = Array.isArray(recipientNode.parentIds) 
            ? recipientNode.parentIds 
            : (recipientNode.parentId ? [recipientNode.parentId] : []);
        
        if (!recipientParentIds.includes(tx.sender)) {
            console.warn(`❌ SOULBOUND_MINT REJECTED: Recipient ${tx.recipient} is not a registered child of institution ${tx.sender}`);
            console.warn(`   To receive tokens from an institution, the recipient must:`);
            console.warn(`   1. Request to become a child of the institution via NODE_PARENT_REQUEST`);
            console.warn(`   2. Be approved by the institution (via NODE_PARENT_UPDATE)`);
            console.warn(`   Current parents of ${tx.recipient}: ${recipientParentIds.length > 0 ? recipientParentIds.join(', ') : 'none'}`);
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
        
        // Award KARMA to institution for minting
        if (this.karmaManager) {
            const mintReward = this.karmaManager.getActivityReward('soulboundMint');
            if (mintReward > 0) {
                const karmaTx = {
                    type: 'KARMA_EARN',
                    sender: 'SYSTEM',
                    recipient: tx.sender,
                    payload: {
                        amount: mintReward,
                        activityType: 'SOULBOUND_MINT',
                        metadata: { recipient: tx.recipient, achievementId: achievementId }
                    },
                    timestamp: Date.now(),
                    signature: 'system_' + Math.random().toString(36).substring(2, 10)
                };
                await this.handleKarmaEarn(karmaTx);
            }
        }
        
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
     * Check if a node is a child of another node (has parent-child relationship)
     * @param {string} childId - Child node ID
     * @param {string} parentId - Parent node ID
     * @returns {boolean}
     */
    isChildOf(childId, parentId) {
        const nodes = this.buildNodeMap();
        const childNode = nodes[childId];
        
        if (!childNode) {
            return false;
        }
        
        const parentIds = Array.isArray(childNode.parentIds) 
            ? childNode.parentIds 
            : (childNode.parentId ? [childNode.parentId] : []);
        
        return parentIds.includes(parentId);
    }
    
    /**
     * Handle KARMA_EARN transaction
     * @param {Object} tx - Transaction object
     */
    async handleKarmaEarn(tx) {
        if (!tx.recipient || !tx.payload?.amount || tx.payload.amount <= 0) {
            console.warn('Invalid KARMA_EARN: missing required fields');
            return;
        }
        
        const recipient = tx.recipient;
        const amount = tx.payload.amount;
        
        // Initialize balance if needed
        if (!this.state.karmaBalances[recipient]) {
            this.state.karmaBalances[recipient] = 0;
        }
        
        // Add KARMA to balance
        this.state.karmaBalances[recipient] += amount;
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata('karma_balances', this.state.karmaBalances);
        }
        
        console.log(`💰 KARMA earned: ${recipient} +${amount} (${tx.payload.activityType || 'UNKNOWN'})`);
    }
    
    /**
     * Handle KARMA_TRANSFER transaction
     * @param {Object} tx - Transaction object
     */
    async handleKarmaTransfer(tx) {
        if (!tx.sender || !tx.recipient || !tx.payload?.amount || tx.payload.amount <= 0) {
            console.warn('Invalid KARMA_TRANSFER: missing required fields');
            return;
        }
        
        const sender = tx.sender;
        const recipient = tx.recipient;
        const amount = tx.payload.amount;
        
        // Initialize balances if needed
        if (!this.state.karmaBalances[sender]) {
            this.state.karmaBalances[sender] = 0;
        }
        if (!this.state.karmaBalances[recipient]) {
            this.state.karmaBalances[recipient] = 0;
        }
        
        // Check sender has sufficient balance
        if (this.state.karmaBalances[sender] < amount) {
            console.warn(`❌ KARMA_TRANSFER rejected: ${sender} has insufficient balance (${this.state.karmaBalances[sender]} < ${amount})`);
            return;
        }
        
        // Transfer KARMA
        this.state.karmaBalances[sender] -= amount;
        this.state.karmaBalances[recipient] += amount;
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata('karma_balances', this.state.karmaBalances);
        }
        
        console.log(`💸 KARMA transferred: ${sender} -> ${recipient} (${amount})`);
    }
    
    /**
     * Handle KARMA_UBI transaction (Universal Basic Income)
     * @param {Object} tx - Transaction object
     */
    async handleKarmaUbi(tx) {
        if (!tx.recipient || !tx.payload?.amount || tx.payload.amount <= 0) {
            console.warn('Invalid KARMA_UBI: missing required fields');
            return;
        }
        
        const recipient = tx.recipient;
        const amount = tx.payload.amount;
        
        // Initialize balance if needed
        if (!this.state.karmaBalances[recipient]) {
            this.state.karmaBalances[recipient] = 0;
        }
        
        // Add UBI to balance
        this.state.karmaBalances[recipient] += amount;
        
        // Persist to storage
        if (this.storage) {
            await this.storage.saveMetadata('karma_balances', this.state.karmaBalances);
        }
        
        console.log(`🌍 UBI distributed: ${recipient} +${amount} (${tx.payload.period || 'DAILY'})`);
    }
    
    /**
     * Get KARMA balance for a node
     * @param {string} nodeId - Node ID
     * @returns {number} KARMA balance
     */
    getKarmaBalance(nodeId) {
        return this.state.karmaBalances[nodeId] || 0;
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
        
        // Award KARMA for creating proposal
        if (this.karmaManager) {
            const proposalReward = this.karmaManager.getActivityReward('proposalCreate');
            if (proposalReward > 0) {
                const karmaTx = {
                    type: 'KARMA_EARN',
                    sender: 'SYSTEM',
                    recipient: tx.sender,
                    payload: {
                        amount: proposalReward,
                        activityType: 'PROPOSAL_CREATE',
                        metadata: { proposalId: proposalId }
                    },
                    timestamp: Date.now(),
                    signature: 'system_' + Math.random().toString(36).substring(2, 10)
                };
                await this.handleKarmaEarn(karmaTx);
            }
        }
        
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
            
            // Load KARMA balances
            const karmaBalances = await this.storage.getMetadata('karma_balances');
            if (karmaBalances) {
                this.state.karmaBalances = karmaBalances;
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
     * Get all NODE_PARENT_REQUEST events
     * @returns {Array}
     */
    getNodeParentRequests() {
        return this.getEvents(window.SrishtiEvent?.TYPES?.NODE_PARENT_REQUEST || 'NODE_PARENT_REQUEST');
    }
    
    /**
     * Get all NODE_PARENT_UPDATE events
     * @returns {Array}
     */
    getNodeParentUpdates() {
        return this.getEvents(window.SrishtiEvent?.TYPES?.NODE_PARENT_UPDATE || 'NODE_PARENT_UPDATE');
    }
    
    /**
     * Build node hierarchy from chain
     * Supports multiple parents per node
     * @returns {Object} - Nodes object with node data indexed by nodeId
     */
    buildNodeMap() {
        const nodes = {};
        const joins = this.getNodeJoins();
        const seenNodeIds = new Set(); // Track nodes we've already processed
        
        // First, initialize nodes from NODE_JOIN events
        // Process in order and skip duplicates (use first occurrence)
        for (const joinEvent of joins) {
            const nodeId = joinEvent.nodeId;
            
            // Skip if we've already seen this node (prevent duplicates)
            if (seenNodeIds.has(nodeId)) {
                console.warn(`⚠️ Duplicate NODE_JOIN detected for ${nodeId}, skipping`);
                continue;
            }
            
            seenNodeIds.add(nodeId);
            
            // Initialize with parentIds as an array (backward compatible with single parentId)
            const initialParentIds = joinEvent.parentId ? [joinEvent.parentId] : [];
            nodes[nodeId] = {
                id: nodeId,
                name: joinEvent.name,
                parentId: joinEvent.parentId || null, // Keep for backward compatibility
                parentIds: initialParentIds, // New: array of parent IDs
                createdAt: joinEvent.timestamp,
                publicKey: joinEvent.publicKey,
                recoveryPhraseHash: joinEvent.recoveryPhraseHash || null
            };
        }
        
        // Get all NODE_PARENT_UPDATE events and process them chronologically
        const parentUpdates = this.getEvents(window.SrishtiEvent?.TYPES?.NODE_PARENT_UPDATE || 'NODE_PARENT_UPDATE');
        
        // Sort by timestamp to process in chronological order
        parentUpdates.sort((a, b) => a.timestamp - b.timestamp);
        
        // Process all parent updates in order
        for (const updateEvent of parentUpdates) {
            const nodeId = updateEvent.payload?.nodeId;
            if (!nodeId || !nodes[nodeId]) continue;
            
            const action = updateEvent.payload?.action || 
                          (updateEvent.payload?.newParentId ? 'SET' : null);
            const parentId = updateEvent.payload?.parentId || updateEvent.payload?.newParentId;
            
            if (!parentId && action !== 'REMOVE') continue;
            
            // Ensure parentIds array exists
            if (!Array.isArray(nodes[nodeId].parentIds)) {
                nodes[nodeId].parentIds = nodes[nodeId].parentId ? [nodes[nodeId].parentId] : [];
            }
            
            switch (action) {
                case 'ADD':
                    // Add parent if not already present
                    if (!nodes[nodeId].parentIds.includes(parentId)) {
                        nodes[nodeId].parentIds.push(parentId);
                        console.log(`➕ Added parent ${parentId} to ${nodeId}`);
                    }
                    break;
                    
                case 'REMOVE':
                    // Remove parent from array
                    const index = nodes[nodeId].parentIds.indexOf(parentId);
                    if (index > -1) {
                        nodes[nodeId].parentIds.splice(index, 1);
                        console.log(`➖ Removed parent ${parentId} from ${nodeId}`);
                    }
                    break;
                    
                case 'SET':
                default:
                    // For backward compatibility: SET replaces all parents with a single parent
                    nodes[nodeId].parentIds = parentId ? [parentId] : [];
                    console.log(`🔗 Set parent for ${nodeId}: ${parentId || 'independent'}`);
                    break;
            }
            
            // Update backward-compatible parentId (use first parent or null)
            nodes[nodeId].parentId = nodes[nodeId].parentIds.length > 0 ? nodes[nodeId].parentIds[0] : null;
            
            // Award KARMA to parent when child is added (if this is a new parent relationship)
            if (action === 'ADD' && parentId && this.karmaManager) {
                const childReward = this.karmaManager.getActivityReward('childRecruited');
                if (childReward > 0) {
                    // Check if this is a new relationship (not already a parent)
                    const childNode = nodes[nodeId];
                    const wasAlreadyParent = childNode.parentIds && childNode.parentIds.includes(parentId);
                    
                    if (!wasAlreadyParent) {
                        const karmaTx = {
                            type: 'KARMA_EARN',
                            sender: 'SYSTEM',
                            recipient: parentId,
                            payload: {
                                amount: childReward,
                                activityType: 'CHILD_RECRUITED',
                                metadata: { childId: nodeId }
                            },
                            timestamp: Date.now(),
                            signature: 'system_' + Math.random().toString(36).substring(2, 10)
                        };
                        // Note: This will be processed when the block is added
                        // We'll handle it in handleNodeParentUpdate
                    }
                }
            }
        }
        
        // Calculate child counts (count nodes that have this node as a parent)
        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            node.childCount = Object.values(nodes).filter(n => 
                Array.isArray(n.parentIds) && n.parentIds.includes(nodeId)
            ).length;
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
            nodeRoles: {},
            pendingParentRequests: {},
            karmaBalances: {}
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
