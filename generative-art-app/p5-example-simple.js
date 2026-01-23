/**
 * SIMPLE P5.JS SKETCH FOR GENERATIVE ART APP
 * 
 * Copy and paste this into the "Generative Code" field when creating a project.
 * 
 * This creates a colorful abstract pattern with circles and flowing lines.
 */

// This function will be called to generate the art piece
// params contains: seed, color1, color2, color3, circleCount, etc.
function generate(params) {
    // Create a canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    
    // Extract parameters with defaults
    const seed = params.seed || Date.now().toString();
    const color1 = params.color1 || `hsl(${hash(seed + '1') % 360}, 70%, 60%)`;
    const color2 = params.color2 || `hsl(${hash(seed + '2') % 360}, 70%, 60%)`;
    const color3 = params.color3 || `hsl(${hash(seed + '3') % 360}, 70%, 60%)`;
    const circleCount = params.circleCount || 15;
    const complexity = params.complexity || 0.5;
    
    // Seeded random number generator
    let rng = hash(seed);
    function random() {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return (rng / 0x7fffffff);
    }
    
    // Simple hash function
    function hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    
    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 800, 800);
    bgGradient.addColorStop(0, color1);
    bgGradient.addColorStop(0.5, color2);
    bgGradient.addColorStop(1, color3);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 800, 800);
    
    // Draw flowing circles
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < circleCount; i++) {
        const x = random() * 800;
        const y = random() * 800;
        const radius = 40 + random() * 120 * complexity;
        
        // Create radial gradient for circle
        const circleGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const hue = (hash(seed + i.toString()) % 360);
        circleGradient.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.9)`);
        circleGradient.addColorStop(0.5, `hsla(${hue}, 80%, 60%, 0.5)`);
        circleGradient.addColorStop(1, `hsla(${hue}, 80%, 50%, 0.1)`);
        
        ctx.fillStyle = circleGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw connecting lines
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    
    const points = [];
    for (let i = 0; i < 12; i++) {
        points.push({
            x: random() * 800,
            y: random() * 800
        });
    }
    
    // Connect nearby points
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 250) {
                const hue = (hash(seed + i + j) % 360);
                ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${0.6 - dist / 500})`;
                ctx.beginPath();
                ctx.moveTo(points[i].x, points[i].y);
                ctx.lineTo(points[j].x, points[j].y);
                ctx.stroke();
            }
        }
    }
    
    // Add sparkle particles
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 30; i++) {
        const x = random() * 800;
        const y = random() * 800;
        const size = 2 + random() * 3;
        
        const hue = (hash(seed + 'sparkle' + i) % 360);
        ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Return the image as data URL
    return canvas.toDataURL('image/png');
}
