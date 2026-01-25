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
 * The full p5.js API is injected into every user sketch: we iterate over the p5
 * instance and expose all enumerable methods (bound to p) and constants. No
 * whitelist — "the whole library, once, for everyone to use."
 */

(function (global) {
    'use strict';

    var SKIP_KEYS = { setup: 1, draw: 1, windowResized: 1, preload: 1, remove: 1, constructor: 1, prototype: 1 };
    var IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

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

    function buildFullP5Bindings(p) {
        var bindings = { width: 0, height: 0 };
        var seen = { width: 1, height: 1 };
        var obj = p;
        while (obj && obj !== Object.prototype) {
            try {
                var names = Object.getOwnPropertyNames(obj);
                for (var i = 0; i < names.length; i++) {
                    var k = names[i];
                    if (seen[k] || SKIP_KEYS[k] || k.charAt(0) === '_' || !IDENT.test(k)) continue;
                    try {
                        var v = p[k];
                        if (typeof v === 'function') {
                            bindings[k] = v.bind(p);
                        } else if (v !== undefined && v !== null && typeof v !== 'object') {
                            bindings[k] = v;
                        } else if (typeof v === 'object' && v !== null && (v.constructor === Number || v.constructor === String || v.constructor === Boolean)) {
                            bindings[k] = v;
                        } else if (k === 'WEBGL' || k === 'P2D' || k === 'CORNER' || k === 'CENTER' || k === 'TWO_PI' || k === 'PI' || k === 'HALF_PI' || k === 'QUARTER_PI' || k === 'TAU' || k === 'DEGREES' || k === 'RADIANS') {
                            bindings[k] = v;
                        }
                        seen[k] = 1;
                    } catch (e) { /* skip */ }
                }
            } catch (e) { /* skip */ }
            obj = Object.getPrototypeOf(obj);
        }
        return bindings;
    }

    function buildInjectionVars(bindings) {
        var keys = Object.keys(bindings);
        var pairs = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (SKIP_KEYS[k]) continue;
            pairs.push(k + ' = bindings.' + k);
        }
        return 'var ' + pairs.join(', ');
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
                var runLiveCode = code;
                var runLiveHashData = hashData;
                var ro = null;
                var sketch = function (p) {
                    var bindings = buildFullP5Bindings(p);
                    p.setup = function () {
                        var size = getSize();
                        p.createCanvas(size.w, size.h);
                        bindings.width = p.width;
                        bindings.height = p.height;
                        var varStr = buildInjectionVars(bindings);
                        var body = varStr + ';\nif (hashData.random) random = function(a,b){ return hashData.random(a,b); };\n' + runLiveCode + '\nif (typeof generate === "function") {\nvar res = generate(hashData);\nif (res && res.nodeName === "CANVAS") p.image(res, 0, 0, p.width, p.height);\nelse if (res && res.canvas) p.image(res, 0, 0, p.width, p.height);\n}';
                        var userCode = new Function('p', 'hashData', 'THREE', 'bindings', body);
                        try {
                            userCode(p, runLiveHashData, typeof THREE !== 'undefined' ? THREE : null, bindings);
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

            var fns = {};
            var setupDrawCode = code;
            var setupDrawHashData = hashData;
            var ro = null;
            var sketch = function (p) {
                var bindings = buildFullP5Bindings(p);
                p.setup = function () {
                    var size = getSize();
                    p.createCanvas(size.w, size.h);
                    bindings.width = p.width;
                    bindings.height = p.height;
                    var varStr = buildInjectionVars(bindings);
                    var body = varStr + ';\nif (hashData.random) random = function(a,b){ return hashData.random(a,b); };\n' + setupDrawCode + '\nif (typeof setup === "function") fns.setup = setup;\nif (typeof draw === "function") fns.draw = draw;\nif (typeof windowResized === "function") fns.windowResized = windowResized;';
                    var userCode = new Function('p', 'hashData', 'THREE', 'bindings', 'fns', body);
                    try {
                        userCode(p, setupDrawHashData, typeof THREE !== 'undefined' ? THREE : null, bindings, fns);
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
                var exportCode = code;
                var exportHashData = hashData;
                var sketch = function (p) {
                    p5Instance = p;
                    var bindings = buildFullP5Bindings(p);
                    p.setup = function () {
                        p.createCanvas(exportW, exportH);
                        bindings.width = p.width;
                        bindings.height = p.height;
                        var varStr = buildInjectionVars(bindings);
                        var body = varStr + ';\nif (hashData.random) random = function(a,b){ return hashData.random(a,b); };\n' + exportCode + '\nif (typeof generate === "function") {\nvar res = generate(hashData);\nif (res && res.nodeName === "CANVAS") p.image(res, 0, 0, p.width, p.height);\nelse if (res && res.canvas) p.image(res, 0, 0, p.width, p.height);\n}';
                        var userCode = new Function('p', 'hashData', 'THREE', 'bindings', body);
                        try {
                            userCode(p, exportHashData, typeof THREE !== 'undefined' ? THREE : null, bindings);
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

            var exportFns = {};
            var exportSetupDrawCode = code;
            var exportSetupDrawHashData = hashData;
            var sketch = function (p) {
                p5Instance = p;
                var bindings = buildFullP5Bindings(p);
                p.setup = function () {
                    p.createCanvas(exportW, exportH);
                    bindings.width = p.width;
                    bindings.height = p.height;
                    p.noLoop();
                    var varStr = buildInjectionVars(bindings);
                    var body = varStr + ';\nif (hashData.random) random = function(a,b){ return hashData.random(a,b); };\n' + exportSetupDrawCode + '\nif (typeof setup === "function") fns.setup = setup;\nif (typeof draw === "function") fns.draw = draw;';
                    var userCode = new Function('p', 'hashData', 'THREE', 'bindings', 'fns', body);
                    try {
                        userCode(p, exportSetupDrawHashData, typeof THREE !== 'undefined' ? THREE : null, bindings, exportFns);
                        if (exportFns.setup) exportFns.setup();
                    } catch (e) {
                        console.error('Export setup error:', e);
                        p.background(20);
                        p.fill(255, 0, 0);
                        p.text('Error: ' + e.message, 10, 20);
                    }
                };
                p.draw = function () {
                    if (exportFns.draw) {
                        try { exportFns.draw(); } catch (e) { console.error('Export draw error:', e); }
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
