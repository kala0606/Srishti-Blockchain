/**
 * Srishti Blockchain - Glow Calculator
 * 
 * Ported from Firebase version to work with blockchain.
 * Calculates the "lit" glow intensity for nodes based on participation.
 */

class GlowCalculator {
    constructor() {
        // Weights for each factor
        this.weights = {
            online: 0.40,
            recency: 0.30,
            children: 0.30
        };
        
        // Time constants
        this.ACTIVITY_DECAY_HOURS = 24; // Full decay over 24 hours
        this.ACTIVITY_DECAY_MS = this.ACTIVITY_DECAY_HOURS * 60 * 60 * 1000;
        
        // Child count thresholds
        this.MAX_CHILDREN_FOR_FULL_GLOW = 10; // 10+ children = max glow from this factor
    }
    
    /**
     * Calculate the composite glow score for a node
     * @param {Object} node - Node data
     * @returns {Object} - Glow properties including intensity, color, and pulse
     */
    calculateGlow(node) {
        if (!node) {
            return this.getDefaultGlow();
        }
        
        // Calculate individual scores (0 to 1)
        const onlineScore = this.calculateOnlineScore(node);
        const recencyScore = this.calculateRecencyScore(node);
        const childrenScore = this.calculateChildrenScore(node);
        
        // Weighted composite score
        const compositeScore = 
            (onlineScore * this.weights.online) +
            (recencyScore * this.weights.recency) +
            (childrenScore * this.weights.children);
        
        // Determine glow properties based on score
        return {
            intensity: compositeScore,
            color: this.scoreToColor(compositeScore, onlineScore),
            emissive: this.scoreToEmissive(compositeScore),
            pulse: onlineScore > 0.5, // Pulse if currently online
            pulseSpeed: 1 + (compositeScore * 2), // Faster pulse for higher scores
            scale: 1 + (childrenScore * 0.3), // Larger for more children
            scores: {
                online: onlineScore,
                recency: recencyScore,
                children: childrenScore,
                composite: compositeScore
            }
        };
    }
    
    /**
     * Calculate online presence score
     * @param {Object} node 
     * @returns {number} 0 to 1
     */
    calculateOnlineScore(node) {
        return node.isOnline ? 1.0 : 0.0;
    }
    
    /**
     * Calculate recency score based on lastSeen timestamp
     * @param {Object} node 
     * @returns {number} 0 to 1
     */
    calculateRecencyScore(node) {
        if (!node.lastSeen) {
            return 0;
        }
        
        const now = Date.now();
        const lastSeen = node.lastSeen;
        const timeSince = now - lastSeen;
        
        // If seen within last minute, full score
        if (timeSince < 60000) {
            return 1.0;
        }
        
        // Exponential decay over 24 hours
        const decayFactor = Math.exp(-timeSince / (this.ACTIVITY_DECAY_MS / 3));
        
        return Math.max(0, Math.min(1, decayFactor));
    }
    
    /**
     * Calculate children/recruitment score
     * @param {Object} node 
     * @returns {number} 0 to 1
     */
    calculateChildrenScore(node) {
        const childCount = node.childCount || 0;
        
        if (childCount === 0) {
            return 0;
        }
        
        // Logarithmic scaling so first few children matter most
        const normalized = Math.log10(childCount + 1) / Math.log10(this.MAX_CHILDREN_FOR_FULL_GLOW + 1);
        
        return Math.min(1, normalized);
    }
    
    /**
     * Convert score to RGB color
     * Gradient: dim gray -> warm amber -> bright gold -> white
     * @param {number} score - 0 to 1
     * @param {number} onlineScore - Online presence score
     * @returns {Object} - RGB color values (0-255)
     */
    scoreToColor(score, onlineScore) {
        // Base colors
        const dim = { r: 40, g: 40, b: 50 };        // Dark gray-blue
        const amber = { r: 255, g: 140, b: 0 };     // Warm amber
        const gold = { r: 255, g: 215, b: 0 };      // Bright gold
        const white = { r: 255, g: 250, b: 240 };   // Warm white
        
        let color;
        
        if (score < 0.3) {
            // Dim to amber
            const t = score / 0.3;
            color = this.lerpColor(dim, amber, t);
        } else if (score < 0.7) {
            // Amber to gold
            const t = (score - 0.3) / 0.4;
            color = this.lerpColor(amber, gold, t);
        } else {
            // Gold to white
            const t = (score - 0.7) / 0.3;
            color = this.lerpColor(gold, white, t);
        }
        
        // If online, add slight blue tint for "alive" feel
        if (onlineScore > 0.5) {
            color.b = Math.min(255, color.b + 20);
        }
        
        return color;
    }
    
    /**
     * Convert score to Three.js emissive intensity
     * @param {number} score 
     * @returns {number} - Emissive intensity for Three.js material
     */
    scoreToEmissive(score) {
        // Exponential curve for more dramatic glow at high scores
        return Math.pow(score, 1.5) * 0.8;
    }
    
    /**
     * Linear interpolation between two colors
     * @param {Object} c1 - Start color {r, g, b}
     * @param {Object} c2 - End color {r, g, b}
     * @param {number} t - Interpolation factor (0 to 1)
     * @returns {Object} - Interpolated color
     */
    lerpColor(c1, c2, t) {
        return {
            r: Math.round(c1.r + (c2.r - c1.r) * t),
            g: Math.round(c1.g + (c2.g - c1.g) * t),
            b: Math.round(c1.b + (c2.b - c1.b) * t)
        };
    }
    
    /**
     * Convert RGB to hex color for Three.js
     * @param {Object} color - {r, g, b}
     * @returns {number} - Hex color value
     */
    rgbToHex(color) {
        return (color.r << 16) | (color.g << 8) | color.b;
    }
    
    /**
     * Get default glow for nodes without data
     * @returns {Object}
     */
    getDefaultGlow() {
        return {
            intensity: 0,
            color: { r: 40, g: 40, b: 50 },
            emissive: 0,
            pulse: false,
            pulseSpeed: 1,
            scale: 1,
            scores: {
                online: 0,
                recency: 0,
                children: 0,
                composite: 0
            }
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlowCalculator;
} else {
    window.SrishtiGlow = new GlowCalculator();
}
