/**
 * REAL P5.JS EXAMPLE
 * 
 * This example uses actual p5.js library functions.
 * p5.js and three.js are loaded via CDN, so you can use them directly!
 * 
 * Copy and paste this into the "Generative Code" field when creating a project.
 * 
 * You can use:
 * - All p5.js functions: background(), fill(), ellipse(), rect(), line(), etc.
 * - p5.js transformations: translate(), rotate(), scale(), push(), pop()
 * - p5.js utilities: map(), lerp(), random(), noise(), color()
 * - three.js (if needed): THREE.Scene, THREE.WebGLRenderer, etc.
 * 
 * NOTE: The canvas is already created (800x800), so you can draw directly!
 * Or use createGraphics() for off-screen rendering.
 */

function generate(params) {
    // p5.js functions are available globally!
    // The main canvas is already created, so you can draw directly
    
    // Set background
    background(20, 20, 30);
    noStroke();
    
    // Draw colorful circles using p5.js functions
    for (let i = 0; i < 30; i++) {
        fill(
            random(0, 255),
            random(100, 255),
            random(150, 255),
            random(100, 200)
        );
        ellipse(
            random(0, width),
            random(0, height),
            random(30, 100),
            random(30, 100)
        );
    }
    
    // Draw lines
    stroke(255, 255, 255, 100);
    strokeWeight(2);
    for (let i = 0; i < 20; i++) {
        line(
            random(0, width),
            random(0, height),
            random(0, width),
            random(0, height)
        );
    }
    
    // Draw rectangles with transformations
    noStroke();
    for (let i = 0; i < 15; i++) {
        push();
        translate(random(0, width), random(0, height));
        rotate(random(0, TWO_PI));
        
        fill(random(200, 255), random(0, 100), random(100, 200), random(50, 150));
        rect(-40, -40, random(20, 80), random(20, 80));
        
        pop();
    }
    
    // The canvas is automatically returned - no need to return anything!
    // Or you can return the canvas explicitly if you want
}
