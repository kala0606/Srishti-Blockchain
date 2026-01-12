/**
 * Srishti Blockchain - QR Code Scanner
 * 
 * Uses html5-qrcode library for camera-based QR scanning.
 * Allows users to scan QR codes to join another node's tree.
 */

class QRScanner {
    constructor() {
        this.scanner = null;
        this.isScanning = false;
        this.onScanCallback = null;
        this.scannerContainerId = 'qr-scanner-container';
    }
    
    /**
     * Initialize the scanner
     * @param {Function} onScan - Callback when QR is successfully scanned
     */
    init(onScan) {
        this.onScanCallback = onScan;
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
        
        // Add styles
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
                font-family: 'Segoe UI', sans-serif;
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
                background: rgba(0, 0, 0, 0.9);
                backdrop-filter: blur(10px);
            }
            
            .scanner-content {
                position: relative;
                background: linear-gradient(145deg, #000033, #000022);
                border: 2px solid #FFD700;
                border-radius: 20px;
                padding: 30px;
                max-width: 400px;
                width: 90%;
                color: #fff;
                text-align: center;
                box-shadow: 0 0 60px rgba(255, 215, 0, 0.2);
            }
            
            .scanner-close {
                position: absolute;
                top: 15px;
                right: 20px;
                background: none;
                border: none;
                color: #FFD700;
                font-size: 32px;
                cursor: pointer;
                transition: all 0.3s;
                line-height: 1;
            }
            
            .scanner-close:hover {
                color: #fff;
                transform: rotate(90deg);
            }
            
            .scanner-title {
                color: #FFD700;
                margin: 0 0 10px 0;
                font-size: 1.8em;
                text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
            }
            
            .scanner-subtitle {
                color: #aaa;
                margin: 0 0 20px 0;
                font-size: 0.9em;
            }
            
            .scanner-viewport {
                width: 100%;
                min-height: 250px;
                background: #000;
                border-radius: 15px;
                overflow: hidden;
                margin-bottom: 20px;
                position: relative;
            }
            
            .scanner-viewport video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            /* Scanning animation overlay */
            .scanner-viewport::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, transparent, #FFD700, transparent);
                animation: scanLine 2s linear infinite;
            }
            
            @keyframes scanLine {
                0% { top: 0; }
                100% { top: 100%; }
            }
            
            .scanner-actions {
                display: flex;
                gap: 10px;
                justify-content: center;
                margin-bottom: 15px;
            }
            
            .scanner-btn {
                background: linear-gradient(145deg, #FFD700, #FFA500);
                color: #000033;
                border: none;
                padding: 12px 24px;
                border-radius: 25px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s;
                font-size: 14px;
            }
            
            .scanner-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
            }
            
            .scanner-btn.secondary {
                background: transparent;
                color: #FFD700;
                border: 2px solid #FFD700;
            }
            
            .scanner-btn.secondary:hover {
                background: rgba(255, 215, 0, 0.1);
            }
            
            .scanner-hint {
                color: #666;
                font-size: 0.85em;
            }
            
            .scanner-hint p {
                margin: 0;
            }
            
            /* Success animation */
            .scanner-success {
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
            }
            
            @keyframes successPulse {
                0% { transform: scale(0); opacity: 0; }
                50% { transform: scale(1.2); }
                100% { transform: scale(1); opacity: 1; }
            }
        `;
        
        document.head.appendChild(styles);
        document.body.appendChild(modal);
        
        // Set up event listeners
        modal.querySelector('.scanner-close').addEventListener('click', () => this.close());
        modal.querySelector('.scanner-backdrop').addEventListener('click', () => this.close());
        modal.querySelector('#scanner-cancel-btn').addEventListener('click', () => this.close());
        modal.querySelector('#scanner-flip-btn').addEventListener('click', () => this.flipCamera());
        
        return modal;
    }
    
    /**
     * Open the scanner modal and start scanning
     */
    async open() {
        const modal = this.createScannerModal();
        modal.classList.add('active');
        
        // Wait for modal to be visible
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await this.startScanning();
    }
    
    /**
     * Close the scanner modal and stop scanning
     */
    close() {
        this.stopScanning();
        
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
        
        // Check if html5-qrcode is loaded
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
                { facingMode: 'environment' }, // Prefer back camera
                config,
                (decodedText) => this.onQRCodeScanned(decodedText),
                (errorMessage) => {
                    // Ignore scan errors (happens when no QR in view)
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
     * Flip between front and back camera
     */
    async flipCamera() {
        if (!this.scanner || !this.isScanning) return;
        
        try {
            await this.stopScanning();
            
            // Toggle camera
            const currentFacing = this.scanner.getRunningTrackCameraCapabilities?.()?.facingMode || 'environment';
            const newFacing = currentFacing === 'environment' ? 'user' : 'environment';
            
            await this.scanner.start(
                { facingMode: newFacing },
                { fps: 10, qrbox: { width: 200, height: 200 } },
                (decodedText) => this.onQRCodeScanned(decodedText),
                () => {}
            );
            
            this.isScanning = true;
        } catch (error) {
            console.error('Error flipping camera:', error);
            // Try to restart with default
            await this.startScanning();
        }
    }
    
    /**
     * Handle successful QR code scan
     * @param {string} decodedText - The decoded QR content
     */
    async onQRCodeScanned(decodedText) {
        console.log('🎯 QR Code scanned:', decodedText);
        
        // Show success animation
        this.showSuccess();
        
        // Stop scanning
        await this.stopScanning();
        
        // Parse the URL to get the join parameter
        try {
            const url = new URL(decodedText);
            const parentId = url.searchParams.get('join');
            
            if (parentId) {
                // Valid Srishti invite
                setTimeout(() => {
                    this.close();
                    if (this.onScanCallback) {
                        this.onScanCallback(parentId);
                    }
                }, 1000);
            } else {
                this.showError('Invalid QR code. Not a Srishti invite.');
                setTimeout(() => this.startScanning(), 2000);
            }
        } catch (error) {
            this.showError('Invalid QR code format.');
            setTimeout(() => this.startScanning(), 2000);
        }
    }
    
    /**
     * Show success animation in viewport
     */
    showSuccess() {
        const viewport = document.getElementById(this.scannerContainerId);
        if (!viewport) return;
        
        const success = document.createElement('div');
        success.className = 'scanner-success';
        success.textContent = '✓';
        viewport.appendChild(success);
        
        setTimeout(() => success.remove(), 1500);
    }
    
    /**
     * Show error message
     * @param {string} message 
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
    
    /**
     * Check if camera is available
     * @returns {Promise<boolean>}
     */
    static async isCameraAvailable() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.some(device => device.kind === 'videoinput');
        } catch (error) {
            return false;
        }
    }
}

// Create global instance
window.SrishtiScanner = new QRScanner();
