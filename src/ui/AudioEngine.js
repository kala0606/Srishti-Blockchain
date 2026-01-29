/**
 * Srishti Audio Engine
 * 
 * Creates spatial audio from node spheres using Tone.js
 * Each node maps to a note in a raga/scale based on their online presence
 */

class SrishtiAudioEngine {
    constructor(options = {}) {
        this.enabled = options.enabled !== false; // Enabled by default
        this.masterVolume = options.masterVolume || 0.6; // 60% volume (increased)
        this.baseOctave = options.baseOctave || 4; // Middle C octave
        
        // Raga Yaman scale (Indian classical) - beautiful and harmonious
        // Notes: C, D, E, F#, G, A, B (Sa, Re, Ga, Ma, Pa, Dha, Ni)
        this.ragaYaman = ['C', 'D', 'E', 'F#', 'G', 'A', 'B'];
        
        // Alternative: Pentatonic scale (universally pleasant)
        this.pentatonic = ['C', 'D', 'E', 'G', 'A'];
        
        // Use raga by default
        this.scale = options.scale || 'raga';
        this.scaleNotes = this.scale === 'raga' ? this.ragaYaman : this.pentatonic;
        
        // Audio context and master chain
        this.masterGain = null;
        this.masterVolumeNode = null;
        this.listener = null; // Tone.Listener for 3D audio
        
        // Track active node sounds
        this.nodeSounds = new Map(); // nodeId -> { synth, panner, gain, note, isPlaying }
        
        // 3D listener position (camera position)
        this.listenerPosition = { x: 0, y: 0, z: 0 };
        this.lastListenerPosition = { x: 0, y: 0, z: 0 };
        
        // Audio context state
        this.audioContextStarted = false;
        
        // Throttle volume updates (update every N frames)
        this.volumeUpdateCounter = 0;
        this.volumeUpdateInterval = 2; // Update every 2 frames (~30fps)
        
        // Initialize when Tone.js is available
        this.init();
    }
    
    /**
     * Initialize audio engine
     */
    async init() {
        if (typeof Tone === 'undefined') {
            this.enabled = false;
            return;
        }
        
        try {
            // Create master gain chain
            this.masterGain = new Tone.Gain(this.masterVolume);
            this.masterVolumeNode = new Tone.Volume(0); // No attenuation (was -6dB)
            this.masterGain.connect(this.masterVolumeNode);
            this.masterVolumeNode.toDestination();
            
            // Set up 3D listener (camera position) - optional, not all Tone.js versions have it
            try {
                if (typeof Tone.Listener !== 'undefined') {
                    this.listener = new Tone.Listener();
                    this.listener.positionX.value = 0;
                    this.listener.positionY.value = 0;
                    this.listener.positionZ.value = 0;
                }
            } catch (e) {
                // Listener not available, continue without it
                this.listener = null;
            }
            
            // Set up 3D panner context
            Tone.Destination.channelCount = 2; // Stereo output
        } catch (error) {
            console.error('❌ Audio engine init failed:', error);
            this.enabled = false;
        }
    }
    
    /**
     * Start audio context (required for browser autoplay policy)
     */
    async startAudioContext() {
        if (!this.enabled || this.audioContextStarted) return;
        
        try {
            await Tone.start();
            this.audioContextStarted = true;
        } catch (error) {
            // Silent fail - user interaction may be required
        }
    }
    
    /**
     * Map node ID to a note in the scale
     * Deterministic mapping so each node always gets the same note
     */
    getNoteForNode(nodeId) {
        if (!nodeId) return null;
        
        // Hash nodeId to get a consistent index
        let hash = 0;
        for (let i = 0; i < nodeId.length; i++) {
            hash = ((hash << 5) - hash) + nodeId.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        // Map to scale note
        const noteIndex = Math.abs(hash) % this.scaleNotes.length;
        const note = this.scaleNotes[noteIndex];
        
        // Vary octave slightly based on hash for more variety
        const octaveOffset = (Math.abs(hash) % 3) - 1; // -1, 0, or +1
        const octave = this.baseOctave + octaveOffset;
        
        return `${note}${octave}`;
    }
    
    /**
     * Convert 3D position to panner coordinates
     * Tone.js Panner3D uses meters, so we scale the Three.js units
     */
    positionToPanner3D(x, y, z) {
        // Three.js units are roughly in pixels/units, convert to meters for realistic audio
        // Scale factor: 1 Three.js unit ≈ 0.1 meters (adjustable)
        const scale = 0.1;
        
        return {
            x: x * scale,
            y: y * scale,
            z: z * scale
        };
    }
    
    /**
     * Calculate distance between two 3D points
     */
    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    /**
     * Calculate volume based on distance from listener
     * Closer nodes = louder, farther nodes = quieter
     */
    calculateDistanceVolume(distance) {
        // Distance parameters (in Three.js units, before scaling)
        // Made less aggressive - nodes should be audible even when far
        const minDistance = 20;   // Very close - maximum volume
        const maxDistance = 2000;  // Far away - minimum volume (much farther)
        const minVolume = 0.4;    // Minimum volume (40% - much louder)
        const maxVolume = 1.5;   // Maximum volume (150% - can go louder when close)
        
        // Clamp distance
        if (distance <= minDistance) {
            return maxVolume;
        }
        if (distance >= maxDistance) {
            return minVolume;
        }
        
        // Linear interpolation between min and max distance
        const normalizedDistance = (distance - minDistance) / (maxDistance - minDistance);
        const volume = maxVolume - (normalizedDistance * (maxVolume - minVolume));
        
        return volume;
    }
    
    /**
     * Create or update sound for a node
     */
    async createNodeSound(nodeId, position = { x: 0, y: 0, z: 0 }, isOnline = false) {
        if (!this.enabled || !nodeId || !this.masterGain) return;
        // Only create/play sounds after user has started the context (browser autoplay policy)
        if (!this.audioContextStarted) return;
        
        // Get note for this node
        const note = this.getNoteForNode(nodeId);
        if (!note) return;
        
        // Check if sound already exists
        let sound = this.nodeSounds.get(nodeId);
        
        if (!sound) {
            try {
                // Create new sound - gentle synth with long attack/release for ambient feel
                const synth = new Tone.Synth({
                    oscillator: {
                        type: 'sine' // Pure, gentle tone
                    },
                    envelope: {
                        attack: 0.5,  // Slow attack
                        decay: 0.3,
                        sustain: 0.7,
                        release: 2.0  // Long release for smooth fade
                    }
                });
                
                // Create 3D panner for spatial audio
                const panner = new Tone.Panner3D({
                    positionX: 0,
                    positionY: 0,
                    positionZ: 0,
                    maxDistance: 1000,  // Increased max distance
                    rolloffFactor: 1,  // Distance rolloff (1 = linear)
                    coneInnerAngle: 360, // Full sphere (omnidirectional)
                    coneOuterAngle: 360,
                    coneOuterGain: 0
                });
                
                // Create gain for per-node volume control
                const gain = new Tone.Gain(0.8); // Start at 80% volume per node
                
                // Connect: synth -> gain -> panner -> master gain -> destination
                synth.connect(gain);
                gain.connect(panner);
                panner.connect(this.masterGain);
                
                sound = {
                    synth,
                    panner,
                    gain,
                    note,
                    isPlaying: false,
                    nodeId,
                    lastPosition: position // Store position for distance calculations
                };
                
                this.nodeSounds.set(nodeId, sound);
            } catch (error) {
                console.error(`Failed to create sound for node ${nodeId}:`, error);
                return;
            }
        }
        
        // Store position for distance calculations
        sound.lastPosition = position;
        
        // Update position
        const pannerPos = this.positionToPanner3D(position.x, position.y, position.z);
        sound.panner.positionX.rampTo(pannerPos.x, 0.1);
        sound.panner.positionY.rampTo(pannerPos.y, 0.1);
        sound.panner.positionZ.rampTo(pannerPos.z, 0.1);
        
        // Play or stop based on online status
        if (isOnline && !sound.isPlaying) {
            try {
                // Start playing (continuous tone - no release until offline)
                sound.synth.triggerAttack(sound.note, Tone.now());
                sound.isPlaying = true;
            } catch (error) {
                console.error(`Failed to trigger sound for node ${nodeId}:`, error);
            }
        } else if (!isOnline && sound.isPlaying) {
            // Stop playing
            try {
                sound.synth.triggerRelease();
                sound.isPlaying = false;
            } catch (error) {
                // Ignore release errors
            }
        }
        
        // Update volume based on online status and distance
        if (isOnline) {
            // Calculate volume based on distance from listener
            this.updateNodeVolume(nodeId, position);
        } else {
            // Fade out when offline
            sound.gain.gain.rampTo(0, 0.5);
        }
    }
    
    /**
     * Update node position (for moving nodes)
     */
    updateNodePosition(nodeId, position) {
        if (!this.enabled || !nodeId) return;
        
        const sound = this.nodeSounds.get(nodeId);
        if (!sound || !sound.panner) return;
        
        const pannerPos = this.positionToPanner3D(position.x, position.y, position.z);
        
        // Smoothly update position
        sound.panner.positionX.rampTo(pannerPos.x, 0.1);
        sound.panner.positionY.rampTo(pannerPos.y, 0.1);
        sound.panner.positionZ.rampTo(pannerPos.z, 0.1);
        
        // Update volume based on distance from listener
        this.updateNodeVolume(nodeId, position);
    }
    
    /**
     * Update volume for a node based on distance from listener
     */
    updateNodeVolume(nodeId, nodePosition) {
        if (!this.enabled || !nodeId) return;
        
        const sound = this.nodeSounds.get(nodeId);
        if (!sound || !sound.isPlaying) return;
        
        // Calculate distance from listener to node
        const distance = this.calculateDistance(this.listenerPosition, nodePosition);
        
        // Calculate volume based on distance
        const distanceVolume = this.calculateDistanceVolume(distance);
        
        // Base volume for online nodes (increased)
        const baseVolume = 0.7;
        
        // Combine base volume with distance-based volume
        // Closer nodes get louder (up to 1.5x), farther nodes get quieter (down to 0.4x)
        const targetVolume = baseVolume * distanceVolume;
        
        // Clamp to reasonable range (0.2 to 1.5)
        const clampedVolume = Math.max(0.2, Math.min(1.5, targetVolume));
        
        // Smoothly update volume
        sound.gain.gain.rampTo(clampedVolume, 0.2);
    }
    
    /**
     * Update listener position (camera position)
     * This affects how we hear the spatial audio
     */
    updateListenerPosition(position) {
        if (!this.enabled) return;
        
        // Check if listener moved significantly (optimization)
        const moved = this.calculateDistance(this.listenerPosition, position) > 5;
        
        this.listenerPosition = position;
        
        // Update listener position (camera/viewer position) if available
        if (this.listener) {
            const pannerPos = this.positionToPanner3D(position.x, position.y, position.z);
            this.listener.positionX.value = pannerPos.x;
            this.listener.positionY.value = pannerPos.y;
            this.listener.positionZ.value = pannerPos.z;
        }
        
        // Update volumes for all nodes based on new listener position
        // Only update if camera moved significantly or on interval
        this.volumeUpdateCounter++;
        if (moved || this.volumeUpdateCounter >= this.volumeUpdateInterval) {
            this.updateAllNodeVolumes();
            this.volumeUpdateCounter = 0;
        }
    }
    
    /**
     * Update volumes for all active nodes based on distance from listener
     */
    updateAllNodeVolumes() {
        if (!this.enabled) return;
        
        this.nodeSounds.forEach((sound, nodeId) => {
            if (!sound.isPlaying) return;
            
            // Get node position from panner (reverse the scaling)
            const scale = 10; // Inverse of 0.1
            const nodePosition = {
                x: sound.panner.positionX.value * scale,
                y: sound.panner.positionY.value * scale,
                z: sound.panner.positionZ.value * scale
            };
            
            // But we need the actual Three.js position, not the scaled one
            // So we'll store the original position in the sound object
            if (sound.lastPosition) {
                this.updateNodeVolume(nodeId, sound.lastPosition);
            }
        });
    }
    
    /**
     * Remove node sound (when node leaves)
     */
    removeNodeSound(nodeId) {
        if (!nodeId) return;
        
        const sound = this.nodeSounds.get(nodeId);
        if (sound) {
            if (sound.isPlaying) {
                sound.synth.triggerRelease();
            }
            sound.synth.dispose();
            sound.panner.dispose();
            sound.gain.dispose();
            this.nodeSounds.delete(nodeId);
        }
    }
    
    /**
     * Update all nodes from nodesData and node positions
     */
    updateNodes(nodesData, nodePositions = {}) {
        if (!this.enabled || !this.masterGain) return;
        
        // Get all node IDs from nodesData
        const allNodeIds = new Set(Object.keys(nodesData));
        
        // Update or create sounds for existing nodes
        Object.entries(nodesData).forEach(([nodeId, nodeData]) => {
            // Skip virtual root
            if (nodeData.isVirtualRoot) return;
            
            const isOnline = nodeData.isOnline || false;
            const position = nodePositions[nodeId] || { x: 0, y: 0, z: 0 };
            
            // Only create sounds for online nodes or nodes that already have sounds
            if (isOnline || this.nodeSounds.has(nodeId)) {
                this.createNodeSound(nodeId, position, isOnline);
            }
        });
        
        // Remove sounds for nodes that no longer exist
        this.nodeSounds.forEach((sound, nodeId) => {
            if (!allNodeIds.has(nodeId)) {
                this.removeNodeSound(nodeId);
            }
        });
    }
    
    /**
     * Update node positions from Three.js visualization
     */
    updateNodePositions(nodePositions) {
        if (!this.enabled) return;
        
        nodePositions.forEach(({ nodeId, position }) => {
            this.updateNodePosition(nodeId, position);
        });
    }
    
    /**
     * Set master volume (0-1)
     */
    setMasterVolume(volume) {
        if (!this.masterGain) return;
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.masterGain.gain.rampTo(this.masterVolume, 0.2);
    }
    
    /**
     * Enable/disable audio engine
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        
        if (!enabled) {
            // Stop all sounds
            this.nodeSounds.forEach((sound, nodeId) => {
                this.removeNodeSound(nodeId);
            });
        }
    }
    
    /**
     * Clean up all resources
     */
    dispose() {
        this.setEnabled(false);
        
        if (this.masterGain) {
            this.masterGain.dispose();
        }
        if (this.masterVolumeNode) {
            this.masterVolumeNode.dispose();
        }
        
        this.nodeSounds.clear();
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.SrishtiAudioEngine = SrishtiAudioEngine;
}
