/**
 * 3D AUDIO-REACTIVE GENERATIVE ART
 * 
 * A 3D generative art piece with audio reactivity.
 * Features:
 * - Audio-reactive visualization using microphone input
 * - 3D structure built on load using seed (different for each hash)
 * - Real-time rendering with WEBGL
 * 
 * This code works with the Srishti Generative Art platform.
 * It uses p5.js WEBGL for 3D rendering.
 * 
 * Copy and paste this into the "Generative Code" field when creating a project.
 */

// Global variables - initialize with defaults to prevent NaN errors
let y = 200, y2 = 200;
let a = 100, b = 100, c = 50, d = 1500, e = 750, f = 30, g = 500, h = 500;
let mic;
let cumulativefft = 0;

let clr1, clr1A, clr1B;
let clr1Num, clr1Blk = 1000, clr1Cnt = -1;
let clr2Num, clr2Blk = 100, clr2Cnt = -1;
let clr1Len;

/**
 * Hash string to number for seeding
 */
function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h = h & h;
    }
    return Math.abs(h);
}

/**
 * Seeded random function
 */
function seededRandom(seed) {
    let value = seed;
    return () => {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
}

function setup() {
    // Get WEBGL constant - p5.js WEBGL is typically the string 'webgl' or a constant
    // Access through p if available (platform wraps code with p as parameter)
    let webglMode = 'webgl'; // Default fallback
    
    // Try to get actual WEBGL constant
    if (typeof p !== 'undefined') {
        // p is the p5 instance passed by the platform
        if (p.WEBGL !== undefined) {
            webglMode = p.WEBGL;
        } else if (p.constructor && p.constructor.WEBGL) {
            webglMode = p.constructor.WEBGL;
        }
    }
    if (typeof WEBGL !== 'undefined') {
        webglMode = WEBGL;
    }
    
    // Recreate canvas in WEBGL mode (platform creates 400x400 without WEBGL)
    // Calling createCanvas again will replace the existing canvas
    createCanvas(400, 400, webglMode);
    
    background(255);
    
    // Initialize audio
    try {
        if (typeof p5 !== 'undefined' && p5.AudioIn) {
            mic = new p5.AudioIn();
            mic.start();
        }
    } catch (e) {
        // Audio not available, continue without it
    }

    // Get seed from params or generate one
    const seed = params?.seed || Date.now().toString();
    const seedHash = hashString(seed);
    
    // Initialize noise seed
    noiseSeed(seedHash);
    
    // Initialize seeded random
    const rng = seededRandom(seedHash);
    
    // Initialize parameters deterministically from seed
    y = height / 2;
    y2 = height / 2;
    rectMode(CENTER);
    
    a = 10 + (rng() * 190);
    b = 10 + (rng() * 190);
    c = 10 + (rng() * 190);
    d = 1000 + (rng() * 2000);
    e = 500 + (rng() * 500);
    f = 10 + (rng() * 90);
    g = 100 + (rng() * (width*2 - 100));
    h = 100 + (rng() * (width - 100));

    // Initialize color palette
    clr1 = [[255, 107, 53], [247, 197, 159], [0, 78, 137], [26, 101, 158]];
    clr1Len = clr1.length;
    clr1Num = clr1Len * clr1Blk;
    clr2Num = clr1Len * clr2Blk;
    setColourTables();
}

function setColourTables() {
    clr1A = [];
    clr1B = [];

    for (let i = 0; i < clr1Num; i++) {
        if (i % clr1Blk == 0) clr1Cnt = (clr1Cnt + 1) % clr1Len;
        let c1 = color(clr1[clr1Cnt][0], clr1[clr1Cnt][1], clr1[clr1Cnt][2]);
        let c2 = color(clr1[(clr1Cnt + 1) % clr1Len][0], clr1[(clr1Cnt + 1) % clr1Len][1], clr1[(clr1Cnt + 1) % clr1Len][2]);
        clr1A[i] = lerpColor(c1, c2, map(i, clr1Cnt * clr1Blk, (clr1Cnt + 1) * clr1Blk, 0.0, 1.0));
    }

    for (let i = 0; i < clr2Num; i++) {
        if (i % clr2Blk == 0) clr2Cnt = (clr2Cnt + 1) % clr1Len;
        let c1 = color(clr1[clr2Cnt][0], clr1[clr2Cnt][1], clr1[clr2Cnt][2]);
        let c2 = color(clr1[(clr2Cnt + 1) % clr1Len][0], clr1[(clr2Cnt + 1) % clr1Len][1], clr1[(clr2Cnt + 1) % clr1Len][2]);
        clr1B[i] = lerpColor(c1, c2, map(i, clr2Cnt * clr2Blk, (clr2Cnt + 1) * clr2Blk, 0.0, 1.0));
    }
}

function draw() {
    // Ensure variables are initialized (safety check)
    if (typeof f === 'undefined' || isNaN(f) || f <= 0) {
        return; // Wait for setup to complete
    }
    
    // Get audio level
    let amp = 0;
    if (mic && typeof mic.getLevel === 'function') {
        try {
            amp = mic.getLevel();
        } catch (e) {
            amp = 0;
        }
    }
    cumulativefft += amp * 100;
    
    background(255);
    stroke(255);
    strokeWeight(0.3);
    push();
    translate(0, 0, -2000);

    // First loop
    for (let y = -height*2; y < height*2; y += f) {
        let colorIndex1 = floor(map(y, height / 2, -height / 2, 0, clr1Num - 1));
        if (clr1A && clr1A[colorIndex1]) {
            fill(0);
        }

        let zDepth1 = map(y, -height*2, height*2, -500, 500) + sin(y/100 + cumulativefft/200) * 80;

        push();
        translate(0, y, zDepth1);
        rotateY(y / d + cumulativefft / a);
        box(g, 3*noise(y/c), 3*noise(y/c));
        pop();

        push();
        rotateY(y / d + cumulativefft / a);
        translate(-g / 2, y, zDepth1 + 200);
        sphere(15);
        pop();

        push();
        rotateY(y / d + cumulativefft / a);
        translate(g / 2, y, zDepth1 - 200);
        sphere(15);
        pop();
    }

    // Second loop
    for(let y2 = -height*2; y2 < height*2; y2 += f) {
        let colorIndex2 = floor(map(y2, height * 2, -height * 2, 0, clr2Num - 1));
        if (clr1B && clr1B[colorIndex2]) {
            fill(0);
        }

        let zDepth2 = map(y2, -height*2, height*2, -2000, 2000) + 
                      noise(y2/150, cumulativefft/300) * 100 + 
                      cos(y2/80 + cumulativefft/150) * 100;

        push();
        translate(0, y2, zDepth2);
        rotateY(y2/e + cumulativefft/b);
        strokeWeight(0.3);
        stroke(255);
        box(h/2, 40*noise(y2/c), 30);
        pop();

        push();
        rotateY(y2/e + cumulativefft/b);
        translate(-h / 8, y2, zDepth2 + 400);
        sphere(25*noise(y2/c, cumulativefft/b));
        pop();

        push();
        rotateY(y2/e + cumulativefft/b);
        translate(h / 8, y2, zDepth2 - 400);
        sphere(25*noise(y2/c, cumulativefft/b));
        pop();
    }
    pop();
}

