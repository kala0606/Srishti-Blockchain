/**
 * Srishti Attendance - Dynamic QR Code System
 * 
 * Generates time-based QR codes for attendance sessions.
 * QR codes change every 10 seconds and contain signed messages from the professor's private key.
 * This prevents students from marking attendance remotely (proxy attendance).
 * 
 * Architecture:
 * - Professor's device generates a new QR code every 10 seconds
 * - QR contains: sessionId, timestamp, nonce, and signature from professor's private key
 * - Student scans QR code and submits it with attendance request
 * - System verifies signature and timestamp to ensure student is physically present
 */

class AttendanceQRCode {
    /**
     * Create a new Attendance QR Code generator
     * @param {Object} options
     * @param {string} options.sessionId - Session ID
     * @param {string} options.professorNodeId - Professor's node ID
     * @param {CryptoKey} options.privateKey - Professor's private key for signing
     * @param {number} [options.refreshInterval=10000] - QR refresh interval in ms (default: 10 seconds)
     */
    constructor(options) {
        if (!options.sessionId || !options.professorNodeId || !options.privateKey) {
            throw new Error('sessionId, professorNodeId, and privateKey are required');
        }
        
        this.sessionId = options.sessionId;
        this.professorNodeId = options.professorNodeId;
        this.privateKey = options.privateKey;
        this.refreshInterval = options.refreshInterval || 10000; // 10 seconds
        
        this.currentQR = null;
        this.refreshTimer = null;
        this.onQRUpdate = null; // Callback when QR updates
    }
    
    /**
     * Generate a new QR code data (signed message)
     * @returns {Promise<Object>} QR code data with signature
     */
    async generateQRData() {
        if (!window.SrishtiKeys) {
            throw new Error('SrishtiKeys library not loaded');
        }
        
        // Create time-based message (changes every 10 seconds)
        const timestamp = Math.floor(Date.now() / this.refreshInterval) * this.refreshInterval;
        const nonce = crypto.getRandomValues(new Uint8Array(16));
        const nonceBase64 = btoa(String.fromCharCode(...nonce));
        
        const message = {
            sessionId: this.sessionId,
            professorNodeId: this.professorNodeId,
            timestamp: timestamp,
            nonce: nonceBase64,
            type: 'ATTENDANCE_QR'
        };
        
        // Sign the message with professor's private key
        const messageString = JSON.stringify(message);
        const signature = await window.SrishtiKeys.sign(this.privateKey, messageString);
        
        const qrData = {
            ...message,
            signature: signature
        };
        
        return qrData;
    }
    
    /**
     * Start generating QR codes (auto-refresh every 10 seconds)
     * @param {Function} onUpdate - Callback when QR updates (receives QR data)
     * @returns {Promise<void>}
     */
    async start(onUpdate = null) {
        if (onUpdate) {
            this.onQRUpdate = onUpdate;
        }
        
        // Generate initial QR
        await this.refresh();
        
        // Set up auto-refresh
        this.refreshTimer = setInterval(async () => {
            await this.refresh();
        }, this.refreshInterval);
    }
    
    /**
     * Refresh the QR code
     * @returns {Promise<void>}
     */
    async refresh() {
        try {
            this.currentQR = await this.generateQRData();
            
            if (this.onQRUpdate) {
                this.onQRUpdate(this.currentQR);
            }
        } catch (error) {
            console.error('Failed to refresh QR code:', error);
        }
    }
    
    /**
     * Stop generating QR codes
     */
    stop() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
    
    /**
     * Get current QR code data
     * @returns {Object|null}
     */
    getCurrentQR() {
        return this.currentQR;
    }
    
    /**
     * Generate QR code as JSON string (for QR code library)
     * @returns {Promise<string>}
     */
    async generateQRString() {
        const qrData = await this.generateQRData();
        return JSON.stringify(qrData);
    }
    
    /**
     * Verify a scanned QR code
     * @param {Object} qrData - Scanned QR code data
     * @param {Chain} chain - Chain instance to get professor's public key
     * @param {number} [maxAge=30000] - Maximum age in ms (default: 30 seconds)
     * @returns {Promise<{valid: boolean, error?: string}>}
     */
    static async verifyQR(qrData, chain, maxAge = 30000) {
        try {
            // Validate structure
            if (!qrData.sessionId || !qrData.professorNodeId || !qrData.timestamp || !qrData.signature) {
                return { valid: false, error: 'Invalid QR code structure' };
            }
            
            // Check timestamp (must be recent)
            const now = Date.now();
            const qrTimestamp = qrData.timestamp;
            const age = now - qrTimestamp;
            
            if (age > maxAge) {
                return { valid: false, error: `QR code expired (age: ${Math.round(age / 1000)}s, max: ${Math.round(maxAge / 1000)}s)` };
            }
            
            if (age < 0) {
                return { valid: false, error: 'QR code timestamp is in the future' };
            }
            
            // Get professor's public key from chain
            const nodes = chain.buildNodeMap();
            const professorNode = nodes[qrData.professorNodeId];
            
            if (!professorNode || !professorNode.publicKey) {
                return { valid: false, error: 'Professor node not found or missing public key' };
            }
            
            // Import public key
            let publicKey;
            if (typeof professorNode.publicKey === 'string') {
                // Base64 string
                publicKey = await window.SrishtiKeys.importPublicKey(professorNode.publicKey);
            } else if (professorNode.publicKey instanceof CryptoKey) {
                // Already a CryptoKey
                publicKey = professorNode.publicKey;
            } else {
                return { valid: false, error: 'Invalid public key format' };
            }
            
            // Reconstruct message (without signature)
            const message = {
                sessionId: qrData.sessionId,
                professorNodeId: qrData.professorNodeId,
                timestamp: qrData.timestamp,
                nonce: qrData.nonce,
                type: qrData.type || 'ATTENDANCE_QR'
            };
            
            // Verify signature
            const isValid = await window.SrishtiKeys.verify(
                publicKey,
                message,
                qrData.signature
            );
            
            if (!isValid) {
                return { valid: false, error: 'Invalid signature' };
            }
            
            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
    
    /**
     * Parse QR code from JSON string (from scanner)
     * @param {string} jsonString - JSON string from QR scanner
     * @returns {Object|null}
     */
    static parseQR(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('Failed to parse QR code:', error);
            return null;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttendanceQRCode;
} else {
    window.SrishtiAttendanceQRCode = AttendanceQRCode;
}
