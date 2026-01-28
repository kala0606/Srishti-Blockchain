/**
 * Srishti Blockchain - QR Code Scanner (Blockchain-compatible)
 * 
 * Uses html5-qrcode library for camera-based QR scanning.
 * Parses blockchain QR codes and extracts node IDs.
 */

class QRScanner {
    constructor() {
        this.scanner = null;
        this.isScanning = false;
        this.onScanCallback = null;
        /** Optional: when set, every scan is passed to this callback with raw decodedText; if it returns true, default handling is skipped */
        this.onRawScanCallback = null;
        this.scannerContainerId = 'qr-scanner-container';
    }
    
    /**
     * Initialize the scanner
     * @param {Function} onScan - Callback when QR is successfully scanned (receives nodeId)
     */
    init(onScan) {
        this.onScanCallback = onScan;
    }
    
    /**
     * Set a one-time callback for raw scan data (e.g. attendance QR). When a QR is scanned,
     * this callback receives (decodedText). If it returns true (or a Promise that resolves to true),
     * the default blockchain-join handling is skipped.
     * @param {Function} callback - (decodedText) => boolean|Promise<boolean>
     */
    setRawScanCallback(callback) {
        this.onRawScanCallback = callback;
    }
    
    clearRawScanCallback() {
        this.onRawScanCallback = null;
    }
    
    /**
     * Create the scanner modal UI
     * @returns {HTMLElement} - The modal element
     */
    createScannerModal() {
        // Check if modal already exists
        let modal = document.getElementById('qr-scanner-modal');
        if (modal) {
            return modal;
        }
        
        modal = document.createElement('div');
        modal.id = 'qr-scanner-modal';
        modal.innerHTML = `
            <div class="scanner-backdrop"></div>
            <div class="scanner-content">
                <button class="scanner-close">&times;</button>
                <h2 class="scanner-title">Scan QR Code</h2>
                <p class="scanner-subtitle">Point your camera at a Srishti QR code to join their node</p>
                <div id="${this.scannerContainerId}" class="scanner-viewport"></div>
                <div class="scanner-actions">
                    <button id="scanner-flip-btn" class="scanner-btn secondary">
                        <span>↺</span> Flip Camera
                    </button>
                    <button id="scanner-cancel-btn" class="scanner-btn">
                        Cancel
                    </button>
                </div>
                <div class="scanner-hint">
                    <p>💡 Make sure the QR code is well-lit and fully visible</p>
                </div>
            </div>
        `;
        
        // Add styles matching profile modal design
        const styles = document.createElement('style');
        styles.textContent = `
            #qr-scanner-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2000;
                font-family: 'Outfit', sans-serif;
            }
            
            #qr-scanner-modal.active {
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            .scanner-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(5, 5, 16, 0.8);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
            }
            
            .scanner-content {
                position: relative;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.03) 100%);
                backdrop-filter: blur(40px);
                -webkit-backdrop-filter: blur(40px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 32px;
                padding: 40px;
                max-width: 450px;
                width: 90%;
                color: #fff;
                text-align: center;
                box-shadow: 
                    0 24px 80px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
                animation: modalAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            
            @keyframes modalAppear {
                from {
                    opacity: 0;
                    transform: scale(0.9) translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            
            .scanner-close {
                position: absolute;
                top: 18px;
                right: 22px;
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 28px;
                font-weight: 300;
                cursor: pointer;
                transition: all 0.3s ease;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
            }
            
            .scanner-close:hover {
                color: #fff;
                background: rgba(255, 255, 255, 0.1);
                transform: rotate(90deg);
            }
            
            .scanner-title {
                font-family: 'Syne', sans-serif;
                color: #fff;
                margin: 0 0 8px 0;
                font-size: 1.6em;
                font-weight: 700;
            }
            
            .scanner-subtitle {
                color: rgba(255, 255, 255, 0.6);
                margin: 0 0 28px 0;
                font-size: 0.9em;
            }
            
            .scanner-viewport {
                width: 100%;
                min-height: 280px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 20px;
                overflow: hidden;
                margin-bottom: 24px;
                position: relative;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .scanner-viewport video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .scanner-actions {
                display: flex;
                gap: 12px;
                justify-content: center;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }
            
            .scanner-btn {
                background: rgba(255, 255, 255, 0.06);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.12);
                padding: 12px 24px;
                border-radius: 50px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.9em;
                font-family: 'Outfit', sans-serif;
                backdrop-filter: blur(10px);
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            
            .scanner-btn:hover {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.2);
                transform: translateY(-2px);
            }
            
            .scanner-btn.secondary {
                background: rgba(255, 255, 255, 0.06);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.12);
            }
            
            .scanner-hint {
                color: rgba(255, 255, 255, 0.5);
                font-size: 0.85em;
                margin: 0;
            }
        `;
        
        document.head.appendChild(styles);
        document.body.appendChild(modal);
        
        // Set up event listeners
        modal.querySelector('.scanner-close').addEventListener('click', () => this.close());
        modal.querySelector('.scanner-backdrop').addEventListener('click', () => this.close());
        modal.querySelector('#scanner-cancel-btn').addEventListener('click', () => this.close());
        
        return modal;
    }
    
    /**
     * Open the scanner modal and start scanning
     */
    async open() {
        const modal = this.createScannerModal();
        modal.classList.add('active');
        
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.startScanning();
    }
    
    /**
     * Close the scanner modal and stop scanning
     */
    close() {
        this.stopScanning();
        this.clearRawScanCallback();
        
        const modal = document.getElementById('qr-scanner-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    /**
     * Start the camera and QR scanning
     */
    async startScanning() {
        if (this.isScanning) return;
        
        if (typeof Html5Qrcode === 'undefined') {
            console.error('Html5Qrcode library not loaded');
            this.showError('Scanner library not available');
            return;
        }
        
        try {
            this.scanner = new Html5Qrcode(this.scannerContainerId);
            
            const config = {
                fps: 10,
                qrbox: { width: 200, height: 200 },
                aspectRatio: 1.0
            };
            
            await this.scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => this.onQRCodeScanned(decodedText),
                (errorMessage) => {
                    // Ignore scan errors
                }
            );
            
            this.isScanning = true;
            console.log('📷 QR Scanner started');
            
        } catch (error) {
            console.error('Error starting scanner:', error);
            this.showError('Could not access camera. Please check permissions.');
        }
    }
    
    /**
     * Stop scanning
     */
    async stopScanning() {
        if (!this.isScanning || !this.scanner) return;
        
        try {
            await this.scanner.stop();
            this.scanner.clear();
            this.isScanning = false;
            console.log('📷 QR Scanner stopped');
        } catch (error) {
            console.error('Error stopping scanner:', error);
        }
    }
    
    /**
     * Handle successful QR code scan
     * @param {string} decodedText - The decoded QR content (URL or JSON)
     */
    async onQRCodeScanned(decodedText) {
        console.log('🎯 QR Code scanned:', decodedText);
        
        // If a raw scan callback is set (e.g. for attendance QR), it handles this scan entirely
        if (this.onRawScanCallback) {
            const rawCallback = this.onRawScanCallback;
            this.clearRawScanCallback();
            try {
                await Promise.resolve(rawCallback(decodedText));
                return; // Callback handled success or error; don't run default logic
            } catch (err) {
                console.error('Raw scan callback error:', err);
                this.showError(err.message || 'Scan failed');
                setTimeout(() => this.startScanning(), 2000);
                return;
            }
        }
        
        this.showSuccess();
        await this.stopScanning();
        
        try {
            // Try to parse as URL first
            try {
                const url = new URL(decodedText);
                const joinParam = url.searchParams.get('join');
                
                if (joinParam) {
                    // Parse blockchain QR code
                    // Use the class (SrishtiQRCodeClass) for static methods, not the instance
                    if (window.SrishtiQRCodeClass) {
                        const connectionInfo = window.SrishtiQRCodeClass.parseFromUrl(joinParam);
                        if (connectionInfo && connectionInfo.nodeId) {
                            setTimeout(() => {
                                this.close();
                                if (this.onScanCallback) {
                                    this.onScanCallback(connectionInfo.nodeId);
                                }
                            }, 1000);
                            return;
                        }
                    } else if (window.SrishtiQRCode && typeof window.SrishtiQRCode.parseFromUrl === 'function') {
                        // Fallback: try instance method if it exists
                        const connectionInfo = window.SrishtiQRCode.parseFromUrl(joinParam);
                        if (connectionInfo && connectionInfo.nodeId) {
                            setTimeout(() => {
                                this.close();
                                if (this.onScanCallback) {
                                    this.onScanCallback(connectionInfo.nodeId);
                                }
                            }, 1000);
                            return;
                        }
                    }
                }
            } catch (e) {
                // Not a URL, try JSON
            }
            
            // Try to parse as JSON (blockchain QR format)
            // Use the class (SrishtiQRCodeClass) for static methods, not the instance
            if (window.SrishtiQRCodeClass) {
                const connectionInfo = window.SrishtiQRCodeClass.parseFromJSON(decodedText);
                if (connectionInfo && connectionInfo.nodeId) {
                    setTimeout(() => {
                        this.close();
                        if (this.onScanCallback) {
                            this.onScanCallback(connectionInfo.nodeId);
                        }
                    }, 1000);
                    return;
                }
            } else if (window.SrishtiQRCode && typeof window.SrishtiQRCode.parseFromJSON === 'function') {
                // Fallback: try instance method if it exists
                const connectionInfo = window.SrishtiQRCode.parseFromJSON(decodedText);
                if (connectionInfo && connectionInfo.nodeId) {
                    setTimeout(() => {
                        this.close();
                        if (this.onScanCallback) {
                            this.onScanCallback(connectionInfo.nodeId);
                        }
                    }, 1000);
                    return;
                }
            }
            
            // Invalid QR code
            this.showError('Invalid QR code. Not a Srishti invite.');
            setTimeout(() => this.startScanning(), 2000);
            
        } catch (error) {
            this.showError('Invalid QR code format.');
            setTimeout(() => this.startScanning(), 2000);
        }
    }
    
    /**
     * Show success animation
     */
    showSuccess() {
        const viewport = document.getElementById(this.scannerContainerId);
        if (!viewport) return;
        
        const success = document.createElement('div');
        success.className = 'scanner-success';
        success.textContent = '✓';
        success.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 255, 0, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 60px;
            animation: successPulse 0.5s ease;
        `;
        viewport.appendChild(success);
        
        setTimeout(() => success.remove(), 1500);
    }
    
    /**
     * Show error message
     */
    showError(message) {
        const viewport = document.getElementById(this.scannerContainerId);
        if (!viewport) return;
        
        const error = document.createElement('div');
        error.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            right: 10px;
            background: rgba(255, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 8px;
            text-align: center;
            font-size: 14px;
        `;
        error.textContent = message;
        viewport.appendChild(error);
        
        setTimeout(() => error.remove(), 3000);
    }
}

// Create global instance
window.SrishtiScanner = new QRScanner();
