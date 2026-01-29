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
     * Deterministic nonce from sessionId + timestamp (so we don't need to put it in the QR = shorter payload, easier to scan)
     * @param {string} sessionId
     * @param {number} timestamp
     * @returns {Promise<string>}
     */
    static async deriveNonce(sessionId, timestamp) {
        const input = `${sessionId}_${timestamp}`;
        const buf = new TextEncoder().encode(input);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        const arr = new Uint8Array(hash).slice(0, 16);
        return btoa(String.fromCharCode(...arr));
    }

    /**
     * Generate a new QR code
     * @private
     */
    async _generateQR() {
        try {
            const now = Date.now();
            const roundedTimestamp = Math.floor(now / 10000) * 10000;

            const nonce = await AttendanceQRCode.deriveNonce(this.sessionId, roundedTimestamp);

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

            // Store current QR (full format for verification; UI will use toCompactString for display)
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
     * Compact string for QR (no nonce = shorter = easier to scan; nonce is derived from s+ts when verifying)
     * Keys: t=type, s=sessionId, p=professorNodeId, ts=timestamp, g=signature
     */
    static toCompactString(qrData) {
        if (!qrData || !qrData.sessionId || !qrData.signature) return '';
        return JSON.stringify({
            t: 'a',
            s: qrData.sessionId,
            p: qrData.professorNodeId,
            ts: qrData.timestamp,
            g: qrData.signature
        });
    }

    /**
     * Parse QR code from JSON string (full or compact format)
     * Tolerates leading/trailing whitespace and numeric ts as string (some readers output that).
     * @param {string} jsonString - JSON string of QR code data
     * @returns {Object|null} Parsed QR code data (full format) or null if invalid
     */
    static parseQR(jsonString) {
        if (typeof jsonString !== 'string') return null;
        try {
            const raw = jsonString.trim();
            // Some scanners add trailing/leading junk; try to extract JSON (first { to last })
            const start = raw.indexOf('{');
            const end = raw.lastIndexOf('}');
            const toParse = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
            const data = JSON.parse(toParse);

            const num = (v) => (typeof v === 'number' ? v : (v != null && v !== '' ? Number(v) : NaN));
            const validNum = (v) => typeof v === 'number' && !Number.isNaN(v) && isFinite(v);

            // Compact format: t='a' and s, p, ts, g (no nonce = derived when verifying)
            const hasCompact = data.s && data.p && data.g && data.ts != null && data.ts !== '';
            if (hasCompact && (data.t === 'a' || (!data.sessionId && !data.professorNodeId))) {
                const ts = num(data.ts);
                if (!validNum(ts)) return null;
                return {
                    sessionId: String(data.s),
                    professorNodeId: String(data.p),
                    timestamp: ts,
                    nonce: data.n != null ? String(data.n) : '',
                    signature: String(data.g),
                    type: 'ATTENDANCE_QR'
                };
            }

            // Full format
            if (data.sessionId && data.professorNodeId && data.signature) {
                const ts = data.timestamp != null ? num(data.timestamp) : NaN;
                if (!validNum(ts)) return null;
                return {
                    sessionId: String(data.sessionId),
                    professorNodeId: String(data.professorNodeId),
                    timestamp: ts,
                    nonce: data.nonce != null ? String(data.nonce) : '',
                    signature: String(data.signature),
                    type: data.type || 'ATTENDANCE_QR'
                };
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

            // Nonce: use from QR or derive (compact format omits it)
            let nonce = qrData.nonce;
            if (!nonce) {
                nonce = await AttendanceQRCode.deriveNonce(qrData.sessionId, qrData.timestamp);
            }

            const message = JSON.stringify({
                sessionId: qrData.sessionId,
                professorNodeId: qrData.professorNodeId,
                timestamp: qrData.timestamp,
                nonce: nonce,
                type: qrData.type || 'ATTENDANCE_QR'
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
