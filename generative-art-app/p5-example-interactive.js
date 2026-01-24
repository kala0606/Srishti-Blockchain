/**
 * INTERACTIVE P5.JS STYLE - WITH ANIMATION-LIKE PATTERNS
 * 
 * This example shows p5.js-style code with loops, transformations, and patterns.
 * Uses p5.js functions: push(), pop(), translate(), rotate(), scale(), etc.
 * 
 * Copy and paste this into the "Generative Code" field when creating a project.
 */

function generate(params) {
    // Create canvas
    const canvas = document.createElement('canvas');
    const w = 800;
    const h = 800;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    const seed = params.seed || Date.now().toString();
    
    // Seeded random
    let rng = hash(seed);
    function random(min = 0, max = 1) {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return min + (rng / 0x7fffffff) * (max - min);
    }
    
    function hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
        }
        return Math.abs(h);
    }
    
    // p5.js color helpers
    function color(r, g, b, a = 255) {
        return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    }
    
    function background(...args) {
        ctx.fillStyle = args.length === 1 ? args[0] : color(...args);
        ctx.fillRect(0, 0, w, h);
    }
    
    function fill(...args) {
        ctx.fillStyle = args.length === 1 ? args[0] : color(...args);
    }
    
    function stroke(...args) {
        ctx.strokeStyle = args.length === 1 ? args[0] : color(...args);
    }
    
    function noStroke() {
        ctx.strokeStyle = 'transparent';
    }
    
    function strokeWeight(weight) {
        ctx.lineWidth = weight;
    }
    
    // p5.js transformation functions
    const transformStack = [];
    
    function push() {
        ctx.save();
        transformStack.push({
            transform: ctx.getTransform()
        });
    }
    
    function pop() {
        ctx.restore();
        transformStack.pop();
    }
    
    function translate(x, y) {
        ctx.translate(x, y);
    }
    
    function rotate(angle) {
        ctx.rotate(angle);
    }
    
    function scale(x, y = x) {
        ctx.scale(x, y);
    }
    
    // p5.js drawing functions
    function ellipse(x, y, w, h) {
        ctx.beginPath();
        ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (ctx.strokeStyle !== 'transparent') {
            ctx.stroke();
        }
    }
    
    function rect(x, y, w, h) {
        ctx.fillRect(x, y, w, h);
        if (ctx.strokeStyle !== 'transparent') {
            ctx.strokeRect(x, y, w, h);
        }
    }
    
    function line(x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    
    function triangle(x1, y1, x2, y2, x3, y3) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fill();
        if (ctx.strokeStyle !== 'transparent') {
            ctx.stroke();
        }
    }
    
    // p5.js map function
    function map(value, start1, stop1, start2, stop2) {
        return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    }
    
    // === SETUP ===
    background(10, 10, 20);
    noStroke();
    
    // === DRAW ===
    // Draw rotating pattern (p5.js style with push/pop)
    const centerX = w / 2;
    const centerY = h / 2;
    const numShapes = 12;
    
    for (let i = 0; i < numShapes; i++) {
        push();
        translate(centerX, centerY);
        rotate((Math.PI * 2 / numShapes) * i);
        
        fill(
            map(i, 0, numShapes, 100, 255),
            map(i, 0, numShapes, 150, 255),
            map(i, 0, numShapes, 200, 255),
            180
        );
        
        ellipse(0, -150, 60, 60);
        
        fill(
            map(i, 0, numShapes, 255, 100),
            map(i, 0, numShapes, 200, 50),
            map(i, 0, numShapes, 100, 200),
            150
        );
        
        rect(-30, -180, 60, 40);
        
        pop();
    }
    
    // Draw connecting lines
    stroke(255, 255, 255, 80);
    strokeWeight(1);
    for (let i = 0; i < numShapes; i++) {
        const angle1 = (Math.PI * 2 / numShapes) * i;
        const angle2 = (Math.PI * 2 / numShapes) * ((i + 3) % numShapes);
        
        const x1 = centerX + Math.cos(angle1) * 150;
        const y1 = centerY + Math.sin(angle1) * 150;
        const x2 = centerX + Math.cos(angle2) * 150;
        const y2 = centerY + Math.sin(angle2) * 150;
        
        line(x1, y1, x2, y2);
    }
    
    // Draw triangles in corners
    noStroke();
    for (let i = 0; i < 4; i++) {
        push();
        translate(
            i % 2 === 0 ? 100 : w - 100,
            i < 2 ? 100 : h - 100
        );
        rotate((Math.PI / 2) * i);
        
        fill(random(200, 255), random(100, 200), random(50, 150), 200);
        triangle(0, 0, 50, 0, 25, 50);
        
        pop();
    }
    
    return canvas;
}
