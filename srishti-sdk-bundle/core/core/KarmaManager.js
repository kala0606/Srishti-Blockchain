/**
 * Srishti Blockchain - Karma Manager
 * 
 * Manages KARMA token balances, earning mechanisms, and UBI distribution.
 * KARMA is the fungible token currency of the chain.
 */

class KarmaManager {
    /**
     * Create a new Karma Manager
     * @param {Chain} chain - Chain instance
     * @param {Object} config - Configuration options
     */
    constructor(chain, config = {}) {
        this.chain = chain;
        
        // KARMA configuration
        this.config = {
            // Universal Basic Income (UBI)
            ubiDailyAmount: config.ubiDailyAmount || 100, // Daily UBI per user
            ubiDistributionHour: config.ubiDistributionHour || 0, // Hour of day to distribute (0 = midnight UTC)
            
            // Passive earning rates (per minute)
            onlinePresenceRate: config.onlinePresenceRate || 0.1, // KARMA per minute while online
            networkWatchingRate: config.networkWatchingRate || 0.05, // KARMA per minute watching network
            
            // Activity rewards
            activityRewards: {
                nodeJoin: config.nodeJoinReward || 50, // Reward for joining network
                blockProposal: config.blockProposalReward || 10, // Reward for proposing a block
                institutionVerify: config.institutionVerifyReward || 25, // Reward for verifying institution
                soulboundMint: config.soulboundMintReward || 15, // Reward for minting (institution)
                voteCast: config.voteCastReward || 5, // Reward for voting
                proposalCreate: config.proposalCreateReward || 20, // Reward for creating proposal
                childRecruited: config.childRecruitedReward || 30 // Reward when someone joins under you
            },
            
            // Passive earning intervals (milliseconds)
            presenceCheckInterval: config.presenceCheckInterval || 60000, // Check every minute
            ubiCheckInterval: config.ubiCheckInterval || 3600000, // Check UBI every hour
            
            // Minimum balance (can't go below this)
            minimumBalance: config.minimumBalance || 0
        };
        
        // Track last UBI distribution per node
        this.lastUbiDistribution = {}; // nodeId -> timestamp
        
        // Track last presence check per node
        this.lastPresenceCheck = {}; // nodeId -> timestamp
        
        // Track accumulated passive earnings (to batch into transactions)
        this.pendingEarnings = {}; // nodeId -> { amount, lastUpdate }
        
        // Interval handles
        this.presenceInterval = null;
        this.ubiInterval = null;
    }
    
    /**
     * Initialize the Karma Manager
     * Starts background processes for UBI and presence-based earning
     */
    async init() {
        // Load last UBI distribution times from storage if available
        if (this.chain.storage) {
            try {
                const saved = await this.chain.storage.getMetadata('karma_ubi_distribution');
                if (saved) {
                    this.lastUbiDistribution = saved;
                }
                
                const savedPresence = await this.chain.storage.getMetadata('karma_presence_checks');
                if (savedPresence) {
                    this.lastPresenceCheck = savedPresence;
                }
            } catch (error) {
                console.warn('Failed to load KARMA state:', error);
            }
        }
        
        // Start presence-based earning checks
        this.startPresenceEarning();
        
        // Start UBI distribution checks
        this.startUbiDistribution();
        
        console.log('✅ KarmaManager initialized');
    }
    
    /**
     * Start presence-based earning checks
     */
    startPresenceEarning() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
        }
        
        this.presenceInterval = setInterval(() => {
            this.checkPresenceEarnings();
        }, this.config.presenceCheckInterval);
        
        // Do initial check
        this.checkPresenceEarnings();
    }
    
    /**
     * Check and award presence-based earnings
     */
    async checkPresenceEarnings() {
        if (!this.chain || !this.chain.state) {
            return;
        }
        
        const now = Date.now();
        const nodes = this.chain.buildNodeMap();
        
        // Check each node for online presence
        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            const lastCheck = this.lastPresenceCheck[nodeId] || now;
            const timeSinceCheck = now - lastCheck;
            
            // Only process if at least 1 minute has passed
            if (timeSinceCheck < this.config.presenceCheckInterval) {
                continue;
            }
            
            // Check if node is online (from presence cache or adapter)
            const isOnline = node.isOnline || false;
            const lastSeen = node.lastSeen || 0;
            const timeSinceSeen = now - lastSeen;
            
            // Consider online if seen within last 5 minutes
            const consideredOnline = isOnline || timeSinceSeen < 300000;
            
            if (consideredOnline) {
                // Calculate minutes online since last check
                const minutesOnline = Math.floor(timeSinceCheck / 60000);
                
                if (minutesOnline > 0) {
                    // Award presence-based KARMA
                    const presenceEarning = minutesOnline * this.config.onlinePresenceRate;
                    
                    // Also award network watching bonus (if actively watching)
                    const watchingEarning = minutesOnline * this.config.networkWatchingRate;
                    
                    const totalEarning = presenceEarning + watchingEarning;
                    
                    if (totalEarning > 0) {
                        // Accumulate in pending earnings (will be batched)
                        if (!this.pendingEarnings[nodeId]) {
                            this.pendingEarnings[nodeId] = { amount: 0, lastUpdate: now };
                        }
                        
                        this.pendingEarnings[nodeId].amount += totalEarning;
                        this.pendingEarnings[nodeId].lastUpdate = now;
                    }
                }
            }
            
            this.lastPresenceCheck[nodeId] = now;
        }
        
        // Batch process pending earnings (award if accumulated >= 1 KARMA)
        await this.processPendingEarnings();
        
        // Save state
        if (this.chain.storage) {
            try {
                await this.chain.storage.saveMetadata('karma_presence_checks', this.lastPresenceCheck);
            } catch (error) {
                console.warn('Failed to save KARMA presence checks:', error);
            }
        }
    }
    
    /**
     * Process pending earnings and create transactions for accumulated amounts
     */
    async processPendingEarnings() {
        const now = Date.now();
        const minEarning = 1; // Minimum KARMA to batch into transaction
        
        for (const nodeId in this.pendingEarnings) {
            const pending = this.pendingEarnings[nodeId];
            
            // Only process if enough accumulated and hasn't been updated recently
            if (pending.amount >= minEarning && (now - pending.lastUpdate) > 60000) {
                const amount = Math.floor(pending.amount * 100) / 100; // Round to 2 decimals
                
                if (amount > 0) {
                    // Award KARMA directly (updates state without creating block for efficiency)
                    await this.awardKarma(nodeId, amount, 'PRESENCE', {
                        source: 'passive_earning',
                        minutes: Math.floor((pending.lastUpdate - (this.lastPresenceCheck[nodeId] || pending.lastUpdate)) / 60000)
                    });
                    
                    // Reset pending
                    this.pendingEarnings[nodeId] = { amount: 0, lastUpdate: now };
                }
            }
        }
    }
    
    /**
     * Start UBI distribution checks
     */
    startUbiDistribution() {
        if (this.ubiInterval) {
            clearInterval(this.ubiInterval);
        }
        
        // Check every hour
        this.ubiInterval = setInterval(() => {
            this.checkUbiDistribution();
        }, this.config.ubiCheckInterval);
        
        // Do initial check
        this.checkUbiDistribution();
    }
    
    /**
     * Check and distribute UBI if needed
     */
    async checkUbiDistribution() {
        if (!this.chain || !this.chain.state) {
            return;
        }
        
        const now = Date.now();
        const nodes = this.chain.buildNodeMap();
        const today = new Date(now);
        today.setUTCHours(this.config.ubiDistributionHour, 0, 0, 0);
        const todayMidnight = today.getTime();
        
        // Check each node for UBI eligibility
        for (const nodeId in nodes) {
            const lastUbi = this.lastUbiDistribution[nodeId] || 0;
            
            // Distribute UBI if:
            // 1. Never received UBI, OR
            // 2. Last UBI was before today's distribution time
            if (lastUbi < todayMidnight) {
                // Award daily UBI (directly updates state)
                await this.awardKarma(nodeId, this.config.ubiDailyAmount, 'UBI', {
                    distributionDate: new Date(todayMidnight).toISOString()
                });
                
                this.lastUbiDistribution[nodeId] = now;
            }
        }
        
        // Save state
        if (this.chain.storage) {
            try {
                await this.chain.storage.saveMetadata('karma_ubi_distribution', this.lastUbiDistribution);
            } catch (error) {
                console.warn('Failed to save KARMA UBI distribution:', error);
            }
        }
    }
    
    /**
     * Award KARMA to a node (creates KARMA_EARN transaction)
     * 
     * ⚠️ IMPORTANT: This method directly updates chain state without creating a block.
     * This is intentional for efficiency (passive earnings like UBI/presence), but means:
     * - These awards are NOT persisted in blocks
     * - Balances will be recalculated from blockchain transactions on chain load
     * - For persistent karma awards, use app.awardKarma() which creates blocks
     * 
     * @param {string} nodeId - Node to award KARMA to
     * @param {number} amount - Amount of KARMA to award
     * @param {string} activityType - Type of activity (PRESENCE, UBI, NODE_JOIN, etc.)
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Transaction result
     */
    async awardKarma(nodeId, amount, activityType, metadata = {}) {
        if (!nodeId || amount <= 0) {
            return { success: false, error: 'Invalid parameters' };
        }
        
        // Create KARMA_EARN transaction
        const tx = {
            type: 'KARMA_EARN',
            sender: 'SYSTEM', // System-generated
            recipient: nodeId,
            payload: {
                amount: amount,
                activityType: activityType,
                metadata: metadata
            },
            timestamp: Date.now(),
            signature: 'system_' + Math.random().toString(36).substring(2, 10)
        };
        
        // Directly update chain state (for system-generated transactions)
        // This bypasses block creation for efficiency
        // NOTE: These awards are temporary and will be recalculated from blockchain on load
        await this.chain.handleKarmaEarn(tx);
        
        return { success: true, transaction: tx };
    }
    
    /**
     * Get KARMA balance for a node
     * @param {string} nodeId - Node ID
     * @returns {number} KARMA balance
     */
    getBalance(nodeId) {
        if (!this.chain || !this.chain.state || !this.chain.state.karmaBalances) {
            return 0;
        }
        
        return this.chain.state.karmaBalances[nodeId] || 0;
    }
    
    /**
     * Get activity reward amount
     * @param {string} activityType - Activity type
     * @returns {number} Reward amount
     */
    getActivityReward(activityType) {
        return this.config.activityRewards[activityType] || 0;
    }
    
    /**
     * Cleanup intervals
     */
    destroy() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
        
        if (this.ubiInterval) {
            clearInterval(this.ubiInterval);
            this.ubiInterval = null;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KarmaManager;
} else {
    window.SrishtiKarmaManager = KarmaManager;
}
