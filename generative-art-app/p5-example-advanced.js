/**
 * ADVANCED P5.JS STYLE SKETCH
 * 
 * This version uses p5.js-like syntax but works standalone.
 * For actual p5.js, you'd need to include the p5.js library.
 * 
 * This creates a mesmerizing geometric pattern.
 */

function generate(params) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    
    const seed = params.seed || Date.now().toString();
    
    // Seeded random
    let rng = hash(seed);
    function random() {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return (rng / 0x7fffffff);
    }
    
    function hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
        }
        return Math.abs(h);
    }
    
    // Dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 800, 800);
    
    // Draw geometric pattern
    const centerX = 400;
    const centerY = 400;
    const layers = 8;
    
    for (let layer = 0; layer < layers; layer++) {
        const radius = 50 + layer * 60;
        const sides = 3 + (hash(seed + layer) % 5); // 3-7 sides
        const rotation = (hash(seed + 'rot' + layer) % 360) * Math.PI / 180;
        const hue = (hash(seed + 'hue' + layer) % 360);
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation);
        
        // Draw polygon
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        
        // Gradient fill
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue}, 80%, 40%, 0.2)`);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Stroke
        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, 0.6)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
    
    // Add connecting lines between layers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
        const angle1 = random() * Math.PI * 2;
        const angle2 = random() * Math.PI * 2;
        const r1 = 100 + random() * 200;
        const r2 = 100 + random() * 200;
        
        ctx.beginPath();
        ctx.moveTo(
            centerX + Math.cos(angle1) * r1,
            centerY + Math.sin(angle1) * r1
        );
        ctx.lineTo(
            centerX + Math.cos(angle2) * r2,
            centerY + Math.sin(angle2) * r2
        );
        ctx.stroke();
    }
    
    return canvas.toDataURL('image/png');
}
