/**
 * CUBE GRID SKETCH — for Generative Code script box → NFT
 *
 * Paste this into the "Generative Code (JavaScript)" field when creating a project.
 * Uses hashData.random() so each mint gets deterministic, unique art from the seed.
 */

function setup() {
  createCanvas(width, height, WEBGL);
  noLoop();
  strokeWeight(1);
  stroke(0);
  background(255);
  rectMode(CENTER);

  const rnd = (typeof hashData !== 'undefined' && hashData && hashData.random)
    ? (a, b) => hashData.random(a, b)
    : random;

  let i = rnd(5, 15);
  const steps = [];
  while (i <= 45) {
    steps.push(i);
    i += rnd(5, 15);
  }
  for (const iv of steps) {
    drawCube(iv * 4, iv);
  }
}

function draw() {
  // Static frame — all drawing in setup
}

function drawCube(side, size) {
  for (let x = -side / 2; x <= side / 2; x += size) {
    for (let y = -side / 2; y <= side / 2; y += size) {
      if (x === -side / 2 || x === side / 2 || y === -side / 2 || y === side / 2) {
        push();
        translate(x, y);
        if (noise(x, y) > 0.5) fill(255);
        else fill(0);
        rect(0, 0, size);
        pop();
      }
    }
  }
}
