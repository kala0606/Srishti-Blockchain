/**
 * Srishti P5 Sketch Runner
 *
 * Runs user generative art as either:
 * - Pure p5.js: setup() + draw() with hashData and responsiveness
 * - Legacy: generate(params) for static output
 *
 * hashData: { seed, ...params, isExport, isPreview, random() } — always available.
 * Use hashData.seed for deterministic art; hashData.random() for seeded 0–1.
 *
 * Injected into user sketch: createCanvas, rect, ellipse, fill, stroke, translate,
 * push, pop, noise, random (overridden by hashData.random when seeded), noLoop,
 * loop, rectMode, ellipseMode, frameRate, WEBGL, P2D, CORNER, CENTER, TWO_PI, PI,
 * width, height, and other common p5 bindings.
 */

(function (global) {
    'use strict';

    function detectSketchMode(code) {
        if (!code || typeof code !== 'string') return 'generate';
        const s = code.trim();
        const hasSetup = /function\s+setup\s*\(|setup\s*=\s*function|setup\s*=\s*[(\s]/.test(s);
        const hasDraw = /function\s+draw\s*\(|draw\s*=\s*function|draw\s*=\s*[(\s]/.test(s);
        if (hasSetup || hasDraw) return 'setupDraw';
        return 'generate';
    }

    function makeSeededRandom(seed) {
        let h = 0;
        for (let i = 0; i < seed.length; i++) {
            h = ((h << 5) - h) + seed.charCodeAt(i);
            h = h & h;
        }
        let v = Math.abs(h) / 2147483647;
        return function () {
            v = (v * 9301 + 49297) % 233280;
            return v / 233280;
        };
    }

    function buildHashData(params, isExport, isPreview) {
        const hashData = {
            seed: params && params.seed != null ? String(params.seed) : null,
            isExport: !!isExport,
            isPreview: !!isPreview,
            ...(params || {})
        };
        const rng = hashData.seed ? makeSeededRandom(hashData.seed) : null;
        hashData.random = rng
            ? function (min, max) {
                const n = rng();
                if (min === undefined && max === undefined) return n;
                if (max === undefined) return n * min;
                return min + n * (max - min);
            }
            : null;
        return hashData;
    }

    function p5Bindings(p) {
        return {
            background: p.background.bind(p),
            fill: p.fill.bind(p),
            stroke: p.stroke.bind(p),
            noStroke: p.noStroke.bind(p),
            noFill: p.noFill.bind(p),
            ellipse: p.ellipse.bind(p),
            rect: p.rect.bind(p),
            line: p.line.bind(p),
            point: p.point.bind(p),
            triangle: p.triangle.bind(p),
            translate: p.translate.bind(p),
            rotate: p.rotate.bind(p),
            scale: p.scale.bind(p),
            push: p.push.bind(p),
            pop: p.pop.bind(p),
            map: p.map.bind(p),
            lerp: p.lerp.bind(p),
            random: p.random.bind(p),
            noise: p.noise.bind(p),
            color: p.color.bind(p),
            createCanvas: p.createCanvas.bind(p),
            createGraphics: p.createGraphics.bind(p),
            image: p.image.bind(p),
            text: p.text.bind(p),
            textSize: p.textSize.bind(p),
            textAlign: p.textAlign.bind(p),
            strokeWeight: p.strokeWeight.bind(p),
            noLoop: p.noLoop.bind(p),
            loop: p.loop.bind(p),
            resizeCanvas: p.resizeCanvas.bind(p),
            rectMode: p.rectMode && p.rectMode.bind(p),
            ellipseMode: p.ellipseMode && p.ellipseMode.bind(p),
            frameRate: p.frameRate && p.frameRate.bind(p),
            WEBGL: typeof p.WEBGL !== 'undefined' ? p.WEBGL : 'webgl',
            P2D: typeof p.P2D !== 'undefined' ? p.P2D : '2d',
            CORNER: typeof p.CORNER !== 'undefined' ? p.CORNER : 'corner',
            CENTER: typeof p.CENTER !== 'undefined' ? p.CENTER : 'center',
            width: 0,
            height: 0,
            TWO_PI: p.TWO_PI,
            PI: p.PI
        };
    }

    function runLive(code, params, container) {
        return new Promise((resolve, reject) => {
            if (typeof p5 === 'undefined') {
                reject(new Error('p5.js not loaded'));
                return;
            }
            if (!container) {
                reject(new Error('Container required for runLive'));
                return;
            }

            const mode = detectSketchMode(code);
            const hashData = buildHashData(params, false, true);

            const div = document.createElement('div');
            div.style.width = '100%';
            div.style.height = '100%';
            div.style.position = 'relative';
            container.innerHTML = '';
            container.appendChild(div);

            const getSize = () => ({
                w: Math.max(100, div.clientWidth || 400),
                h: Math.max(100, div.clientHeight || 400)
            });

            if (mode === 'generate') {
                const userCode = new Function('p', 'hashData', 'THREE', 'bindings', `
                    var background = bindings.background, fill = bindings.fill, stroke = bindings.stroke,
                        noStroke = bindings.noStroke, noFill = bindings.noFill, ellipse = bindings.ellipse,
                        rect = bindings.rect, line = bindings.line, point = bindings.point, triangle = bindings.triangle,
                        translate = bindings.translate, rotate = bindings.rotate, scale = bindings.scale,
                        push = bindings.push, pop = bindings.pop, map = bindings.map, lerp = bindings.lerp,
                        random = bindings.random, noise = bindings.noise, color = bindings.color,
                        createCanvas = bindings.createCanvas, createGraphics = bindings.createGraphics,
                        image = bindings.image, text = bindings.text, textSize = bindings.textSize, textAlign = bindings.textAlign,
                        strokeWeight = bindings.strokeWeight, noLoop = bindings.noLoop, loop = bindings.loop, resizeCanvas = bindings.resizeCanvas,
                        rectMode = bindings.rectMode, ellipseMode = bindings.ellipseMode, frameRate = bindings.frameRate;
                    var width = bindings.width, height = bindings.height, TWO_PI = bindings.TWO_PI, PI = bindings.PI,
                        WEBGL = bindings.WEBGL, P2D = bindings.P2D, CORNER = bindings.CORNER, CENTER = bindings.CENTER;
                    if (hashData.random) random = function(a,b){ return hashData.random(a,b); };
                    ${code}
                    if (typeof generate === 'function') {
                        var res = generate(hashData);
                        if (res && res.nodeName === 'CANVAS') p.image(res, 0, 0, p.width, p.height);
                        else if (res && res.canvas) p.image(res, 0, 0, p.width, p.height);
                    }
                `);

                let ro = null;
                const sketch = function (p) {
                    const bindings = p5Bindings(p);
                    p.setup = function () {
                        const { w, h } = getSize();
                        p.createCanvas(w, h);
                        bindings.width = p.width;
                        bindings.height = p.height;
                        try {
                            userCode(p, hashData, typeof THREE !== 'undefined' ? THREE : null, bindings);
                        } catch (e) {
                            console.error('Sketch error:', e);
                            p.background(20);
                            p.fill(255, 0, 0);
                            p.text('Error: ' + e.message, 10, 20);
                        }
                        if (typeof ResizeObserver !== 'undefined') {
                            ro = new ResizeObserver(function () {
                                if (p.windowResized) p.windowResized();
                            });
                            ro.observe(div);
                        }
                    };
                    p.draw = function () {};
                    p.windowResized = function () {
                        const { w, h } = getSize();
                        if (w > 0 && h > 0) {
                            p.resizeCanvas(w, h);
                            bindings.width = p.width;
                            bindings.height = p.height;
                        }
                    };
                };
                new p5(sketch, div);
                resolve();
                return;
            }

            const fns = {};
            const userCode = new Function('p', 'hashData', 'THREE', 'bindings', 'fns', `
                var background = bindings.background, fill = bindings.fill, stroke = bindings.stroke,
                    noStroke = bindings.noStroke, noFill = bindings.noFill, ellipse = bindings.ellipse,
                    rect = bindings.rect, line = bindings.line, point = bindings.point, triangle = bindings.triangle,
                    translate = bindings.translate, rotate = bindings.rotate, scale = bindings.scale,
                    push = bindings.push, pop = bindings.pop, map = bindings.map, lerp = bindings.lerp,
                    random = bindings.random, noise = bindings.noise, color = bindings.color,
                    createCanvas = bindings.createCanvas, createGraphics = bindings.createGraphics,
                    image = bindings.image, text = bindings.text, textSize = bindings.textSize, textAlign = bindings.textAlign,
                    strokeWeight = bindings.strokeWeight, noLoop = bindings.noLoop, loop = bindings.loop, resizeCanvas = bindings.resizeCanvas,
                    rectMode = bindings.rectMode, ellipseMode = bindings.ellipseMode, frameRate = bindings.frameRate;
                var width = bindings.width, height = bindings.height, TWO_PI = bindings.TWO_PI, PI = bindings.PI,
                    WEBGL = bindings.WEBGL, P2D = bindings.P2D, CORNER = bindings.CORNER, CENTER = bindings.CENTER;
                if (hashData.random) random = function(a,b){ return hashData.random(a,b); };
                ${code}
                if (typeof setup === 'function') fns.setup = setup;
                if (typeof draw === 'function') fns.draw = draw;
                if (typeof windowResized === 'function') fns.windowResized = windowResized;
            `);

            let ro = null;
            const sketch = function (p) {
                const bindings = p5Bindings(p);
                p.setup = function () {
                    const { w, h } = getSize();
                    p.createCanvas(w, h);
                    bindings.width = p.width;
                    bindings.height = p.height;
                    try {
                        userCode(p, hashData, typeof THREE !== 'undefined' ? THREE : null, bindings, fns);
                        if (fns.setup) fns.setup();
                    } catch (e) {
                        console.error('Sketch setup error:', e);
                        p.background(20);
                        p.fill(255, 0, 0);
                        p.text('Error: ' + e.message, 10, 20);
                    }
                    if (typeof ResizeObserver !== 'undefined') {
                        ro = new ResizeObserver(function () {
                            if (p.windowResized) p.windowResized();
                        });
                        ro.observe(div);
                    }
                };
                p.draw = function () {
                    if (fns.draw) {
                        try { fns.draw(); } catch (e) { console.error('Sketch draw error:', e); }
                    }
                };
                p.windowResized = function () {
                    const { w, h } = getSize();
                    if (w > 0 && h > 0) {
                        p.resizeCanvas(w, h);
                        bindings.width = p.width;
                        bindings.height = p.height;
                        if (fns.windowResized) {
                            try { fns.windowResized(); } catch (e) { console.error('Sketch windowResized error:', e); }
                        }
                    }
                };
            };
            new p5(sketch, div);
            resolve();
        });
    }

    function runExport(code, params) {
        return new Promise((resolve, reject) => {
            if (typeof p5 === 'undefined') {
                reject(new Error('p5.js not loaded'));
                return;
            }

            const mode = detectSketchMode(code);
            const hashData = buildHashData(params, true, false);
            const exportW = 512;
            const exportH = 512;

            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.width = exportW + 'px';
            container.style.height = exportH + 'px';
            document.body.appendChild(container);

            let p5Instance = null;
            let done = false;

            function finish(dataUrl) {
                if (done) return;
                done = true;
                if (container.parentNode) container.parentNode.removeChild(container);
                if (p5Instance && p5Instance.remove) p5Instance.remove();
                resolve(dataUrl);
            }

            if (mode === 'generate') {
                const userCode = new Function('p', 'hashData', 'THREE', 'bindings', `
                    var background = bindings.background, fill = bindings.fill, stroke = bindings.stroke,
                        noStroke = bindings.noStroke, noFill = bindings.noFill, ellipse = bindings.ellipse,
                        rect = bindings.rect, line = bindings.line, point = bindings.point, triangle = bindings.triangle,
                        translate = bindings.translate, rotate = bindings.rotate, scale = bindings.scale,
                        push = bindings.push, pop = bindings.pop, map = bindings.map, lerp = bindings.lerp,
                        random = bindings.random, noise = bindings.noise, color = bindings.color,
                        createCanvas = bindings.createCanvas, createGraphics = bindings.createGraphics,
                        image = bindings.image, text = bindings.text, textSize = bindings.textSize, textAlign = bindings.textAlign,
                        strokeWeight = bindings.strokeWeight, noLoop = bindings.noLoop, loop = bindings.loop, resizeCanvas = bindings.resizeCanvas,
                        rectMode = bindings.rectMode, ellipseMode = bindings.ellipseMode, frameRate = bindings.frameRate;
                    var width = bindings.width, height = bindings.height, TWO_PI = bindings.TWO_PI, PI = bindings.PI,
                        WEBGL = bindings.WEBGL, P2D = bindings.P2D, CORNER = bindings.CORNER, CENTER = bindings.CENTER;
                    if (hashData.random) random = function(a,b){ return hashData.random(a,b); };
                    ${code}
                    if (typeof generate === 'function') {
                        var res = generate(hashData);
                        if (res && res.nodeName === 'CANVAS') p.image(res, 0, 0, p.width, p.height);
                        else if (res && res.canvas) p.image(res, 0, 0, p.width, p.height);
                    }
                `);

                const sketch = function (p) {
                    p5Instance = p;
                    const bindings = p5Bindings(p);
                    p.setup = function () {
                        p.createCanvas(exportW, exportH);
                        bindings.width = p.width;
                        bindings.height = p.height;
                        try {
                            userCode(p, hashData, typeof THREE !== 'undefined' ? THREE : null, bindings);
                        } catch (e) {
                            console.error('Export sketch error:', e);
                            p.background(20);
                            p.fill(255, 0, 0);
                            p.text('Error: ' + e.message, 10, 20);
                        }
                    };
                    p.draw = function () {
                        if (p.frameCount === 1 && p.canvas) {
                            setTimeout(function () {
                                try {
                                    finish(p.canvas.toDataURL('image/png'));
                                } catch (e) {
                                    reject(e);
                                }
                            }, 50);
                        }
                    };
                };
                new p5(sketch, container);
                setTimeout(function () {
                    if (!done && p5Instance && p5Instance.canvas) {
                        try { finish(p5Instance.canvas.toDataURL('image/png')); } catch (e) { reject(e); }
                    } else if (!done) {
                        done = true;
                        if (container.parentNode) container.parentNode.removeChild(container);
                        if (p5Instance && p5Instance.remove) p5Instance.remove();
                        reject(new Error('Export timeout'));
                    }
                }, 3000);
                return;
            }

            const fns = {};
            const userCode = new Function('p', 'hashData', 'THREE', 'bindings', 'fns', `
                var background = bindings.background, fill = bindings.fill, stroke = bindings.stroke,
                    noStroke = bindings.noStroke, noFill = bindings.noFill, ellipse = bindings.ellipse,
                    rect = bindings.rect, line = bindings.line, point = bindings.point, triangle = bindings.triangle,
                    translate = bindings.translate, rotate = bindings.rotate, scale = bindings.scale,
                    push = bindings.push, pop = bindings.pop, map = bindings.map, lerp = bindings.lerp,
                    random = bindings.random, noise = bindings.noise, color = bindings.color,
                    createCanvas = bindings.createCanvas, createGraphics = bindings.createGraphics,
                    image = bindings.image, text = bindings.text, textSize = bindings.textSize, textAlign = bindings.textAlign,
                    strokeWeight = bindings.strokeWeight, noLoop = bindings.noLoop, loop = bindings.loop, resizeCanvas = bindings.resizeCanvas,
                    rectMode = bindings.rectMode, ellipseMode = bindings.ellipseMode, frameRate = bindings.frameRate;
                var width = bindings.width, height = bindings.height, TWO_PI = bindings.TWO_PI, PI = bindings.PI,
                    WEBGL = bindings.WEBGL, P2D = bindings.P2D, CORNER = bindings.CORNER, CENTER = bindings.CENTER;
                if (hashData.random) random = function(a,b){ return hashData.random(a,b); };
                ${code}
                if (typeof setup === 'function') fns.setup = setup;
                if (typeof draw === 'function') fns.draw = draw;
            `);

            const sketch = function (p) {
                p5Instance = p;
                const bindings = p5Bindings(p);
                p.setup = function () {
                    p.createCanvas(exportW, exportH);
                    bindings.width = p.width;
                    bindings.height = p.height;
                    p.noLoop();
                    try {
                        userCode(p, hashData, typeof THREE !== 'undefined' ? THREE : null, bindings, fns);
                        if (fns.setup) fns.setup();
                    } catch (e) {
                        console.error('Export setup error:', e);
                        p.background(20);
                        p.fill(255, 0, 0);
                        p.text('Error: ' + e.message, 10, 20);
                    }
                };
                p.draw = function () {
                    if (fns.draw) {
                        try { fns.draw(); } catch (e) { console.error('Export draw error:', e); }
                    }
                    if (p.frameCount === 1 && p.canvas) {
                        setTimeout(function () {
                            try {
                                finish(p.canvas.toDataURL('image/png'));
                            } catch (e) {
                                reject(e);
                            }
                        }, 50);
                    }
                };
            };
            new p5(sketch, container);

            setTimeout(function () {
                if (!done && p5Instance && p5Instance.canvas) {
                    try { finish(p5Instance.canvas.toDataURL('image/png')); } catch (e) { reject(e); }
                } else if (!done) {
                    done = true;
                    if (container.parentNode) container.parentNode.removeChild(container);
                    if (p5Instance && p5Instance.remove) p5Instance.remove();
                    reject(new Error('Export timeout'));
                }
            }, 3000);
        });
    }

    const runner = {
        detectSketchMode,
        buildHashData,
        runLive,
        runExport
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = runner;
    } else {
        global.SrishtiP5SketchRunner = runner;
    }
})(typeof window !== 'undefined' ? window : global);
