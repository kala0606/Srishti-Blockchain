/**
 * PURE P5.JS SKETCH — setup() + draw() + hashData
 *
 * Paste this into the "Generative Code" field when creating a project.
 *
 * Rules:
 * - Use standard setup() and draw(). Canvas is created for you and responsive.
 * - hashData is global: { seed, random(), ... }. Use it for deterministic art.
 * - hashData.random() matches p5 random(min, max) when seed exists.
 *
 * Optional: windowResized() for custom resize handling.
 */

function setup() {
    // Canvas is already created and responsive. Use width, height. hashData has seed, etc.
    background(20, 20, 30);
    noStroke();
}

function draw() {
    // Static example: draw once then stop. Remove noLoop() for animation.
    // if (frameCount > 1) return;
    // noLoop();

    const rnd = (typeof hashData !== 'undefined' && hashData && hashData.random)
        ? function (a, b) { return hashData.random(a, b); }
        : random;

    // Circles
    for (let i = 0; i < 30; i++) {
        fill(
            rnd(0, 255),
            rnd(100, 255),
            rnd(150, 255),
            rnd(100, 200)
        );
        ellipse(
            rnd(0, width),
            rnd(0, height),
            rnd(30, 100),
            rnd(30, 100)
        );
    }

    stroke(255, 255, 255, 100);
    strokeWeight(2);
    for (let i = 0; i < 20; i++) {
        line(
            rnd(0, width),
            rnd(0, height),
            rnd(0, width),
            rnd(0, height)
        );
    }

    noStroke();
    for (let i = 0; i < 15; i++) {
        push();
        translate(rnd(0, width), rnd(0, height));
        rotate(rnd(0, TWO_PI));
        fill(rnd(200, 255), rnd(0, 100), rnd(100, 200), rnd(50, 150));
        rect(-40, -40, rnd(20, 80), rnd(20, 80));
        pop();
    }
}

// Optional: respond to container resize
function windowResized() {
    // Canvas is resized for you; add custom logic here if needed
}
