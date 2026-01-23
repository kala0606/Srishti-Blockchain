/**
 * Srishti Attendance - QR Code Generator and Verifier
 * 
 * Generates time-based signed QR codes for attendance sessions.
 * Prevents proxy attendance by using cryptographic signatures and expiration.
 */

class AttendanceQRCode {
    /**
     * Create a new QR code generator
     * @param {Object} options
     * @param {string} options.sessionId - Session ID
     * @param {string} options.professorNodeId - Professor's node ID
     * @param {CryptoKey} options.privateKey - Professor's private key for signing
     * @param {number} [options.refreshInterval=10000] - QR refresh interval in ms (default: 10 seconds)
     * @param {number} [options.expirationTime=30000] - QR expiration time in ms (default: 30 seconds)
     */
    constructor(options) {
        if (!options.sessionId || !options.professorNodeId || !options.privateKey) {
            throw new Error('AttendanceQRCode requires sessionId, professorNodeId, and privateKey');
        }
        
        this.sessionId = options.sessionId;
        this.professorNodeId = options.professorNodeId;
        this.privateKey = options.privateKey;
        this.refreshInterval = options.refreshInterval || 10000; // 10 seconds
        this.expirationTime = options.expirationTime || 30000; // 30 seconds
        
        this.currentQR = null;
        this.intervalId = null;
        this.onUpdateCallback = null;
    }
    
    /**
     * Start generating QR codes
     * @param {Function} onUpdate - Callback when QR code updates (receives qrData object)
     * @returns {Promise<void>}
     */
    async start(onUpdate = null) {
        this.onUpdateCallback = onUpdate;
        
        // Generate initial QR code
        await this._generateQR();
        
        // Set up interval to refresh QR code
        this.intervalId = setInterval(async () => {
            await this._generateQR();
        }, this.refreshInterval);
        
        console.log(`✅ QR code generation started (refreshes every ${this.refreshInterval}ms)`);
    }
    
    /**
     * Stop generating QR codes
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.onUpdateCallback = null;
        console.log('🛑 QR code generation stopped');
    }
    
    /**
     * Get current QR code data
     * @returns {Object|null} Current QR code data
     */
    getCurrentQR() {
        return this.currentQR;
    }
    
    /**
     * Generate a new QR code
     * @private
     */
    async _generateQR() {
        try {
            // Round timestamp to 10-second intervals for consistency
            const now = Date.now();
            const roundedTimestamp = Math.floor(now / 10000) * 10000;
            
            // Generate random nonce
            const nonceBytes = new Uint8Array(16);
            crypto.getRandomValues(nonceBytes);
            const nonce = btoa(String.fromCharCode(...nonceBytes));
            
            // Create QR data
            const qrData = {
                sessionId: this.sessionId,
                professorNodeId: this.professorNodeId,
                timestamp: roundedTimestamp,
                nonce: nonce,
                type: 'ATTENDANCE_QR'
            };
            
            // Create message to sign (exclude signature from signed data)
            const message = JSON.stringify({
                sessionId: qrData.sessionId,
                professorNodeId: qrData.professorNodeId,
                timestamp: qrData.timestamp,
                nonce: qrData.nonce,
                type: qrData.type
            });
            
            // Sign the message
            if (!window.SrishtiKeys) {
                throw new Error('SrishtiKeys not available');
            }
            
            // SrishtiKeys.sign() already returns base64 string
            const signatureBase64 = await window.SrishtiKeys.sign(this.privateKey, message);
            
            qrData.signature = signatureBase64;
            
            // Store current QR
            this.currentQR = qrData;
            
            // Notify callback
            if (this.onUpdateCallback) {
                this.onUpdateCallback(qrData);
            }
            
            console.log(`🔄 QR code generated for session: ${this.sessionId} (timestamp: ${roundedTimestamp})`);
        } catch (error) {
            console.error('❌ Failed to generate QR code:', error);
            throw error;
        }
    }
    
    /**
     * Parse QR code from JSON string
     * @param {string} jsonString - JSON string of QR code data
     * @returns {Object|null} Parsed QR code data or null if invalid
     */
    static parseQR(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            
            // Validate structure
            if (data.sessionId && data.professorNodeId && data.timestamp && data.signature && data.type === 'ATTENDANCE_QR') {
                return data;
            }
            
            return null;
        } catch (error) {
            console.warn('Failed to parse QR code:', error);
            return null;
        }
    }
    
    /**
     * Verify a QR code
     * @param {Object} qrData - QR code data object
     * @param {Chain} chain - Blockchain chain instance (to get professor's public key)
     * @param {number} maxAge - Maximum age in milliseconds (default: 30000 = 30 seconds)
     * @returns {Promise<Object>} Verification result { valid: boolean, error?: string }
     */
    static async verifyQR(qrData, chain, maxAge = 30000) {
        try {
            // Validate structure
            if (!qrData.sessionId || !qrData.professorNodeId || !qrData.timestamp || !qrData.signature) {
                return { valid: false, error: 'Invalid QR code structure' };
            }
            
            // Check expiration
            const age = Date.now() - qrData.timestamp;
            if (age > maxAge) {
                return { valid: false, error: `QR code expired (age: ${Math.round(age / 1000)}s, max: ${Math.round(maxAge / 1000)}s)` };
            }
            
            // Get professor's public key from chain
            if (!chain) {
                return { valid: false, error: 'Chain not available' };
            }
            
            const nodes = chain.buildNodeMap();
            const professorNode = nodes[qrData.professorNodeId];
            
            if (!professorNode || !professorNode.publicKey) {
                return { valid: false, error: 'Professor node not found on chain or missing public key' };
            }
            
            // Import public key
            if (!window.SrishtiKeys) {
                return { valid: false, error: 'SrishtiKeys not available' };
            }
            
            const publicKey = await window.SrishtiKeys.importPublicKey(professorNode.publicKey);
            
            // Recreate message (same as when signing)
            const message = JSON.stringify({
                sessionId: qrData.sessionId,
                professorNodeId: qrData.professorNodeId,
                timestamp: qrData.timestamp,
                nonce: qrData.nonce,
                type: qrData.type
            });
            
            // Verify signature (signature is already base64 string)
            const isValid = await window.SrishtiKeys.verify(publicKey, message, qrData.signature);
            
            if (!isValid) {
                return { valid: false, error: 'Invalid signature' };
            }
            
            return { valid: true };
        } catch (error) {
            console.error('QR code verification error:', error);
            return { valid: false, error: error.message || 'Verification failed' };
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttendanceQRCode;
} else {
    window.SrishtiAttendanceQRCode = AttendanceQRCode;
}
