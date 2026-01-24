/**
 * AUTHENTIC P5.JS STYLE GENERATIVE ART
 * 
 * This example uses p5.js-like syntax that works with our canvas wrapper.
 * The wrapper provides p5.js functions like setup(), draw(), createCanvas(), etc.
 * 
 * Copy and paste this into the "Generative Code" field when creating a project.
 */

function generate(params) {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    
    // Extract parameters
    const seed = params.seed || Date.now().toString();
    const colorMode = params.colorMode || 'hsl';
    
    // Seeded random
    let rng = hash(seed);
    function random(min = 0, max = 1) {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        const val = rng / 0x7fffffff;
        return min + val * (max - min);
    }
    
    function hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
        }
        return Math.abs(h);
    }
    
    // p5.js-like color function
    function color(...args) {
        if (args.length === 1) {
            return args[0];
        } else if (args.length === 3) {
            return `rgb(${args[0]}, ${args[1]}, ${args[2]})`;
        } else if (args.length === 4) {
            return `rgba(${args[0]}, ${args[1]}, ${args[2]}, ${args[3] / 255})`;
        }
        return '#000000';
    }
    
    // p5.js-like functions
    const width = canvas.width;
    const height = canvas.height;
    
    // Background
    ctx.fillStyle = color(20, 20, 30);
    ctx.fillRect(0, 0, width, height);
    
    // Draw circles in p5.js style
    ctx.fillStyle = color(255, 100, 150, 200);
    for (let i = 0; i < 20; i++) {
        const x = random(0, width);
        const y = random(0, height);
        const r = random(20, 80);
        
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw lines
    ctx.strokeStyle = color(100, 200, 255, 150);
    ctx.lineWidth = 2;
    for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        ctx.moveTo(random(0, width), random(0, height));
        ctx.lineTo(random(0, width), random(0, height));
        ctx.stroke();
    }
    
    return canvas;
}
