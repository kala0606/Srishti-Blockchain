/**
 * Simple p5.js Generative Art Sketch
 * 
 * Paste this code into the "Generative Code" field when creating a project.
 * 
 * This creates colorful abstract patterns with circles and lines.
 * The parameters control colors, sizes, and patterns.
 */

function generate(params) {
    // Set up canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    
    // Get parameters (with defaults)
    const seed = params.seed || Math.random().toString();
    const color1 = params.color1 || `hsl(${Math.random() * 360}, 70%, 60%)`;
    const color2 = params.color2 || `hsl(${Math.random() * 360}, 70%, 60%)`;
    const color3 = params.color3 || `hsl(${Math.random() * 360}, 70%, 60%)`;
    const circleCount = params.circleCount || 20;
    const lineCount = params.lineCount || 15;
    
    // Seeded random function
    let seedValue = 0;
    for (let i = 0; i < seed.length; i++) {
        seedValue = ((seedValue << 5) - seedValue) + seed.charCodeAt(i);
        seedValue = seedValue & seedValue;
    }
    let rng = Math.abs(seedValue) / 2147483647;
    function random() {
        rng = (rng * 9301 + 49297) % 233280;
        return rng / 233280;
    }
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 800, 800);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(0.5, color2);
    gradient.addColorStop(1, color3);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 800);
    
    // Draw circles
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < circleCount; i++) {
        const x = random() * 800;
        const y = random() * 800;
        const radius = 30 + random() * 150;
        
        const circleGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const hue = random() * 360;
        circleGradient.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.8)`);
        circleGradient.addColorStop(1, `hsla(${hue}, 80%, 50%, 0.2)`);
        
        ctx.fillStyle = circleGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw connecting lines
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = `hsl(${random() * 360}, 70%, 60%)`;
    ctx.lineWidth = 2;
    
    const points = [];
    for (let i = 0; i < lineCount; i++) {
        points.push({
            x: random() * 800,
            y: random() * 800
        });
    }
    
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dist = Math.sqrt(
                Math.pow(points[i].x - points[j].x, 2) + 
                Math.pow(points[i].y - points[j].y, 2)
            );
            
            if (dist < 300) {
                ctx.beginPath();
                ctx.moveTo(points[i].x, points[i].y);
                ctx.lineTo(points[j].x, points[j].y);
                ctx.stroke();
            }
        }
    }
    
    // Add some particles
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 50; i++) {
        const x = random() * 800;
        const y = random() * 800;
        const size = 2 + random() * 4;
        
        ctx.fillStyle = `hsl(${random() * 360}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Return the canvas as data URL (image)
    return canvas.toDataURL('image/png');
}

// For p5.js style (if you want to use actual p5.js library)
// This is a simpler version that works without p5.js
// If you want to use actual p5.js, you'd need to include the library and use setup()/draw()
