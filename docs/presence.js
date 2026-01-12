/**
 * Srishti Blockchain - Presence System
 * 
 * Tracks online status and activity of nodes using Firebase's
 * presence system with .info/connected reference.
 */

class PresenceTracker {
    constructor() {
        this.nodeId = null;
        this.database = null;
        this.presenceRef = null;
        this.connectedRef = null;
        this.heartbeatInterval = null;
        this.activityTimeout = null;
        this.isConnected = false;
    }
    
    /**
     * Initialize presence tracking for a node
     * @param {string} nodeId - The current user's node ID
     */
    async init(nodeId) {
        if (!window.SrishtiFirebase) {
            console.error('Firebase not initialized');
            return;
        }
        
        this.nodeId = nodeId;
        this.database = window.SrishtiFirebase.getDatabase();
        
        if (!this.database) {
            console.error('Database not available');
            return;
        }
        
        // Reference to the node's online status
        this.presenceRef = this.database.ref(`nodes/${nodeId}/isOnline`);
        this.lastSeenRef = this.database.ref(`nodes/${nodeId}/lastSeen`);
        
        // Firebase's special reference that tells us if we're connected
        this.connectedRef = this.database.ref('.info/connected');
        
        // Set up presence detection
        this.setupPresenceDetection();
        
        // Set up activity tracking
        this.setupActivityTracking();
        
        // Start heartbeat
        this.startHeartbeat();
        
        console.log('👁️ Presence tracking initialized for:', nodeId);
    }
    
    /**
     * Set up Firebase presence detection
     */
    setupPresenceDetection() {
        this.connectedRef.on('value', (snapshot) => {
            if (snapshot.val() === true) {
                this.isConnected = true;
                
                // When we disconnect, update the status
                this.presenceRef.onDisconnect().set(false);
                this.lastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
                
                // Set online status
                this.presenceRef.set(true);
                this.lastSeenRef.set(firebase.database.ServerValue.TIMESTAMP);
                
                console.log('🟢 Connected to Firebase');
            } else {
                this.isConnected = false;
                console.log('🔴 Disconnected from Firebase');
            }
        });
    }
    
    /**
     * Set up activity tracking (mouse, keyboard, touch)
     */
    setupActivityTracking() {
        const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
        
        const handleActivity = () => {
            this.recordActivity();
        };
        
        // Throttle activity recording to once per 10 seconds
        let lastActivity = 0;
        const throttledActivity = () => {
            const now = Date.now();
            if (now - lastActivity > 10000) {
                lastActivity = now;
                handleActivity();
            }
        };
        
        activityEvents.forEach(event => {
            window.addEventListener(event, throttledActivity, { passive: true });
        });
        
        // Also track visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.setOnline(true);
                this.recordActivity();
            } else {
                // Don't immediately set offline when tab is hidden
                // Let the heartbeat handle it
            }
        });
    }
    
    /**
     * Record user activity (updates lastSeen)
     */
    async recordActivity() {
        if (!this.nodeId || !this.isConnected) return;
        
        try {
            await this.lastSeenRef.set(firebase.database.ServerValue.TIMESTAMP);
        } catch (error) {
            console.error('Error recording activity:', error);
        }
    }
    
    /**
     * Set online status
     * @param {boolean} online 
     */
    async setOnline(online) {
        if (!this.nodeId || !this.isConnected) return;
        
        try {
            await this.presenceRef.set(online);
            if (online) {
                await this.lastSeenRef.set(firebase.database.ServerValue.TIMESTAMP);
            }
        } catch (error) {
            console.error('Error setting online status:', error);
        }
    }
    
    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        // Clear any existing heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Send heartbeat every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && document.visibilityState === 'visible') {
                this.recordActivity();
            }
        }, 30000);
    }
    
    /**
     * Stop presence tracking
     */
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        if (this.connectedRef) {
            this.connectedRef.off();
        }
        
        // Set offline before leaving
        if (this.presenceRef && this.isConnected) {
            this.presenceRef.set(false);
            this.lastSeenRef.set(firebase.database.ServerValue.TIMESTAMP);
        }
        
        console.log('👁️ Presence tracking stopped');
    }
    
    /**
     * Get the current node ID being tracked
     * @returns {string|null}
     */
    getNodeId() {
        return this.nodeId;
    }
    
    /**
     * Check if currently connected
     * @returns {boolean}
     */
    getConnectionStatus() {
        return this.isConnected;
    }
}

// Create global instance
window.SrishtiPresence = new PresenceTracker();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.SrishtiPresence) {
        window.SrishtiPresence.stop();
    }
});
