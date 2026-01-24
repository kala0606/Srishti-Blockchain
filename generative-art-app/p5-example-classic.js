/**
 * CLASSIC P5.JS STYLE - SETUP AND DRAW PATTERN
 * 
 * This example mimics the classic p5.js setup() and draw() pattern.
 * It uses p5.js-like functions: createCanvas, background, fill, stroke, ellipse, line, etc.
 * 
 * Copy and paste this into the "Generative Code" field when creating a project.
 */

function generate(params) {
    // Create canvas (p5.js createCanvas equivalent)
    const canvas = document.createElement('canvas');
    const w = 800;
    const h = 800;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    // Extract seed and parameters
    const seed = params.seed || Date.now().toString();
    
    // Seeded random number generator (p5.js random() equivalent)
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
    
    // p5.js color() function
    function color(r, g, b, a = 255) {
        return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    }
    
    // p5.js background() - fills entire canvas
    function background(...args) {
        if (args.length === 1) {
            ctx.fillStyle = args[0];
        } else {
            ctx.fillStyle = color(...args);
        }
        ctx.fillRect(0, 0, w, h);
    }
    
    // p5.js fill() - sets fill color
    function fill(...args) {
        if (args.length === 1) {
            ctx.fillStyle = args[0];
        } else {
            ctx.fillStyle = color(...args);
        }
    }
    
    // p5.js stroke() - sets stroke color
    function stroke(...args) {
        if (args.length === 1) {
            ctx.strokeStyle = args[0];
        } else {
            ctx.strokeStyle = color(...args);
        }
    }
    
    // p5.js noStroke() - disables stroke
    function noStroke() {
        ctx.strokeStyle = 'transparent';
    }
    
    // p5.js strokeWeight() - sets line width
    function strokeWeight(w) {
        ctx.lineWidth = w;
    }
    
    // p5.js ellipse() - draws ellipse/circle
    function ellipse(x, y, w, h) {
        ctx.beginPath();
        ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (ctx.strokeStyle !== 'transparent') {
            ctx.stroke();
        }
    }
    
    // p5.js rect() - draws rectangle
    function rect(x, y, w, h) {
        ctx.fillRect(x, y, w, h);
        if (ctx.strokeStyle !== 'transparent') {
            ctx.strokeRect(x, y, w, h);
        }
    }
    
    // p5.js line() - draws line
    function line(x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    
    // p5.js point() - draws point
    function point(x, y) {
        ctx.fillRect(x, y, 1, 1);
    }
    
    // p5.js map() - maps value from one range to another
    function map(value, start1, stop1, start2, stop2) {
        return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    }
    
    // p5.js noise() - Perlin noise (simplified)
    const noiseCache = {};
    function noise(x, y = 0, z = 0) {
        const key = `${x}_${y}_${z}`;
        if (!noiseCache[key]) {
            noiseCache[key] = random();
        }
        return noiseCache[key];
    }
    
    // p5.js lerp() - linear interpolation
    function lerp(start, stop, amt) {
        return start + (stop - start) * amt;
    }
    
    // === SETUP (runs once) ===
    // In p5.js, this would be:
    // function setup() {
    //     createCanvas(800, 800);
    //     background(20, 20, 30);
    // }
    
    background(20, 20, 30);
    noStroke();
    
    // === DRAW (runs continuously, but we'll just run it once) ===
    // In p5.js, this would be:
    // function draw() {
    //     // drawing code here
    // }
    
    // Draw colorful circles (p5.js style)
    for (let i = 0; i < 30; i++) {
        fill(random(0, 255), random(100, 255), random(150, 255), random(100, 200));
        ellipse(
            random(0, w),
            random(0, h),
            random(30, 100),
            random(30, 100)
        );
    }
    
    // Draw lines
    stroke(255, 255, 255, 100);
    strokeWeight(2);
    for (let i = 0; i < 20; i++) {
        line(
            random(0, w),
            random(0, h),
            random(0, w),
            random(0, h)
        );
    }
    
    // Draw rectangles
    noStroke();
    for (let i = 0; i < 15; i++) {
        fill(random(200, 255), random(0, 100), random(100, 200), random(50, 150));
        rect(
            random(0, w - 50),
            random(0, h - 50),
            random(20, 80),
            random(20, 80)
        );
    }
    
    return canvas;
}
