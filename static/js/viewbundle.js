(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* jshint asi:true, laxcomma:true, -W008, -W060 */
/* global require, document, console, window */


// imports
var $ = window.$ = require('browserify-zepto')
var proj = require('../index.js')


// get data to display from the embedding page
// data is output from proj.exportData(), stringified
// probably a better way to do this, but for now...
var polyDat = $('#viewData').html()


var canvas = document.getElementById('canvas-container')
//div.style.width = div.style.height = "500px"
canvas.width = document.body.clientWidth; //document.width is obsolete
canvas.height = document.body.clientHeight; //document.height is obsolete
canvasW = canvas.width;
canvasH = canvas.height;


// create a shell and get started
var shell = require("gl-now")({
    element:'canvas-container',
    clearColor:[0,0,0,1],
    glOptions:{
        alpha: false
    }
})

window.shell = shell
shell.preventDefaults = false

shell.on('gl-init', function() {

    proj.init(shell.gl)

    proj.importData( polyDat )

})

shell.on("gl-error", function(e) {
    document.write("Oops! Looks like WebGL isn't supported :(")
  throw new Error("WebGL not supported :(")
})




shell.on("gl-render", function(t) {

    // update camera focus point from mouse dragging
    updateCameraXY()

    proj.paint(cameraXY[1], cameraXY[0] )

})





// mouse tracking
var dragging = false
var dragStartLoc = [0,0]
var dragLoc = [0,0]
var cameraXY = [0,0]

$('body').bind('mousedown touchstart', function(e) {
    if (e.originalEvent) {
        e = e.originalEvent;
    }
    if (e.target.nodeName==="CANVAS") {
        e.preventDefault();
        dragging = true
        var ev = (e.touches) ? e.touches[0] : e
        dragLoc = dragStartLoc = [ ev.pageX, ev.pageY ]
    }
})

$('body').bind('mousemove touchmove ', function(e) {
    if (e.originalEvent) {
        e = e.originalEvent;
    }
    if (e.target.nodeName==="CANVAS") {
        e.preventDefault();
        var ev = (e.touches) ? e.touches[0] : e
        dragLoc = [ ev.pageX, ev.pageY ]
    }
})

$('body').bind('mouseup touchend', function(e) {
    if (e.originalEvent) {
        e = e.originalEvent;
    }
    e.preventDefault();
    dragging = false
})


function updateCameraXY() {
    var tgt = [0,0]
    if (dragging) {
        tgt = [
            (dragLoc[0]-dragStartLoc[0]) / -200,
            (dragLoc[1]-dragStartLoc[1]) / -200
        ]
    }
    var ease = 0.1
    cameraXY[0] += ease * (tgt[0] - cameraXY[0])
    cameraXY[1] += ease * (tgt[1] - cameraXY[1])
}





},{"../index.js":2,"browserify-zepto":6,"gl-now":44}],2:[function(require,module,exports){
"use strict";
var perspective = 0.2;
var compareonGPU = true;
var keepFewerPolysTolerance = 0;
var minAlpha = 0.05;
var maxAlpha = 0.5;
var useFlatPolys = false;
var defaultScore = -100000;
var glslify = require("glslify");
var createBuffer = require("gl-buffer");
var createVAO = require("gl-vao");
var mat4 = require("gl-mat4");
var createFBO = require("gl-fbo");
var createTexture = require("gl-texture2d");
var createCameraShader = require("glslify/adapter.js")("\n#define GLSLIFY 1\n\nprecision mediump float;\nattribute vec4 position;\nattribute vec4 vertColor;\nuniform float perspective;\nuniform mat4 camera;\nvarying vec4 fragColor;\nvoid main() {\n  vec4 pos = 2.0 * position - 1.0;\n  pos.z = pos.z * 0.75 + 0.25;\n  pos = camera * pos;\n  float w = 1.0 + perspective * (pos.z);\n  pos.z = pos.z * 0.5;\n  gl_Position = vec4(pos.xyz, w);\n  fragColor = vertColor;\n}", "\n#define GLSLIFY 1\n\nprecision mediump float;\nvarying vec4 fragColor;\nvoid main() {\n  gl_FragColor = fragColor;\n}", [{"name":"perspective","type":"float"},{"name":"camera","type":"mat4"}], [{"name":"position","type":"vec4"},{"name":"vertColor","type":"vec4"}]);
var createFlatShader = require("glslify/adapter.js")("\n#define GLSLIFY 1\n\nprecision mediump float;\nattribute vec2 position;\nuniform float multY;\nvarying vec2 uv;\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  uv = position * vec2(1.0, multY);\n  uv = 0.5 * (uv + 1.0);\n}", "\n#define GLSLIFY 1\n\nprecision mediump float;\nuniform sampler2D buffer;\nvarying vec2 uv;\nvoid main() {\n  gl_FragColor = texture2D(buffer, uv);\n}", [{"name":"multY","type":"float"},{"name":"buffer","type":"sampler2D"}], [{"name":"position","type":"vec2"}]);
var createDiffShader = require("glslify/adapter.js")("\n#define GLSLIFY 1\n\nprecision mediump float;\nattribute vec2 position;\nuniform float multY;\nvarying vec2 uv;\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  uv = position * vec2(1.0, multY);\n  uv = 0.5 * (uv + 1.0);\n}", "\n#define GLSLIFY 1\n\nprecision highp float;\nuniform float inputDim;\nuniform sampler2D bufferA;\nuniform sampler2D bufferB;\nconst float mag = 255.0;\nvarying vec2 uv;\nvoid main() {\n  float ip = 1.0 / inputDim;\n  float op = ip * 4.0;\n  vec2 p = vec2(floor(uv.x / op) * op, floor(uv.y / op) * op);\n  float sum = 0.0;\n  vec2 offset = vec2(0.0);\n  vec3 diff;\n  for(int i = 0; i < 4; ++i) {\n    for(int j = 0; j < 4; ++j) {\n      diff = texture2D(bufferA, p + offset).rgb - texture2D(bufferB, p + offset).rgb;\n      sum += dot(diff, diff);\n      offset.y += ip;\n    }\n    offset.x += ip;\n    offset.y = 0.0;\n  }\n  float avg = sum / 16.0;\n  avg /= 3.0;\n  float r = floor(avg * mag) / mag;\n  float g = floor((avg - r) * mag * mag) / mag;\n  float b = ((avg - r) * mag - g) * mag;\n  gl_FragColor = vec4(r, g, b, 1.0);\n}", [{"name":"multY","type":"float"},{"name":"inputDim","type":"float"},{"name":"bufferA","type":"sampler2D"},{"name":"bufferB","type":"sampler2D"}], [{"name":"position","type":"vec2"}]);
var createAvgShader = require("glslify/adapter.js")("\n#define GLSLIFY 1\n\nprecision mediump float;\nattribute vec2 position;\nuniform float multY;\nvarying vec2 uv;\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  uv = position * vec2(1.0, multY);\n  uv = 0.5 * (uv + 1.0);\n}", "\n#define GLSLIFY 1\n\nprecision highp float;\nuniform float inputDim;\nuniform sampler2D buffer;\nconst float mag = 255.0;\nvarying vec2 uv;\nvoid main() {\n  float ip = 1.0 / inputDim;\n  float op = ip * 4.0;\n  vec2 p = vec2(floor(uv.x / op) * op, floor(uv.y / op) * op);\n  float sum = 0.0;\n  vec2 offset = vec2(0.0);\n  vec4 col;\n  for(int i = 0; i < 4; ++i) {\n    for(int j = 0; j < 4; ++j) {\n      col = texture2D(buffer, p + offset);\n      sum += col.r + (col.g + col.b / mag) / mag;\n      offset.y += ip;\n    }\n    offset.x += ip;\n    offset.y = 0.0;\n  }\n  float avg = sum / 16.0;\n  float r = floor(avg * mag) / mag;\n  float g = floor((avg - r) * mag * mag) / mag;\n  float b = ((avg - r) * mag - g) * mag;\n  gl_FragColor = vec4(r, g, b, 1.0);\n}", [{"name":"multY","type":"float"},{"name":"inputDim","type":"float"},{"name":"buffer","type":"sampler2D"}], [{"name":"position","type":"vec2"}]);
var polys = require("./polydata");
polys.setAlphaRange(minAlpha, maxAlpha);
var gl, fboSize, currentScore;
var camShader, flatShader, diffReduceShader, avgReduceShader;
var vertBuffer, colBuffer, dataVao, flatVao, camMatrix;
var polyBuffersOutdated;
var refTexture, referenceFB, scratchFB;
var reducedFBs;
var SCREEN = "screen";
var initialized = false;
var rand = Math.random;
var floor = Math.floor;

function init(glRef, imageRef, size) {
    if (!glRef) {
        throw new Error("Need a reference to a gl context");
    }

    gl = glRef;
    var s = parseInt(size);
    fboSize = (s && s >= 16 ? s : 256);

    if (imageRef) {
        refTexture = createTexture(gl, imageRef);
    } else {
        refTexture = null;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    camShader = createCameraShader(gl);
    flatShader = createFlatShader(gl);

    if (refTexture) {
        diffReduceShader = createDiffShader(gl);
        avgReduceShader = createAvgShader(gl);
    }

    referenceFB = createFBO(gl, [fboSize, fboSize], {
        color: 1
    });

    referenceFB.drawn = false;

    scratchFB = createFBO(gl, [fboSize, fboSize], {
        color: 1
    });

    reducedFBs = [];
    var reducedSize = fboSize / 4;

    while (reducedSize >= 16) {
        var buff = createFBO(gl, [reducedSize, reducedSize], {
            color: 1
        });

        reducedFBs.push(buff);
        reducedSize /= 4;
    }

    if (reducedFBs.length === 0) {
        throw new Error("Comparison framebuffer is too small - increase \"fboSize\"");
    }

    polys.init(1);
    vertBuffer = createBuffer(gl, polys.vertArr);
    colBuffer = createBuffer(gl, polys.colArr);
    polyBuffersOutdated = false;

    dataVao = createVAO(gl, [{
        "buffer": vertBuffer,
        "type": gl.FLOAT,
        "size": 3
    }, {
        "buffer": colBuffer,
        "type": gl.FLOAT,
        "size": 4
    }]);

    var squareBuffer = createBuffer(gl, [-1, -1, -1, 1, 1, -1, 1, 1, -1, 1, 1, -1]);

    flatVao = createVAO(gl, [{
        "buffer": squareBuffer,
        "type": gl.FLOAT,
        "size": 2
    }]);

    if (refTexture) {
        drawFlat(refTexture, referenceFB, true);
    }

    currentScore = defaultScore;
    initialized = true;
}

function runGeneration() {
    if (!initialized || !refTexture) {
        return;
    }

    polys.cacheDataNow();
    var vertCount = polys.numVerts;
    mutateSomething();
    polys.sortPolygonsByZ();
    vertBuffer.update(polys.vertArr);
    colBuffer.update(polys.colArr);
    polyBuffersOutdated = false;
    drawData(scratchFB, perspective, null);
    var scoreFn = (compareonGPU ? compareFBOsOnGPU : compareFBOs);
    var score = scoreFn(referenceFB, scratchFB);
    var keep = score > currentScore;

    if (polys.numVerts < vertCount) {
        keep = score >= currentScore - keepFewerPolysTolerance;
    }

    if (keep) {
        currentScore = score;
    } else {
        polys.restoreCachedData();
        polyBuffersOutdated = true;
    }
}

function mutateSomething() {
    var i, num, ct = 0;
    num = floor(6 * rand());

    for (i = 0; i < num; i++) {
        polys.mutateValue();
        ct++;
    }

    num = floor(6 * rand() * rand());

    for (i = 0; i < num; i++) {
        polys.mutateVertex();
        ct++;
    }

    if (rand() < 0.2) {
        polys.addPoly();
        ct++;
    }

    if (rand() < 0.3) {
        polys.clonePoly();
        ct++;
    }

    if (rand() < 0.3) {
        polys.removePoly();
        ct++;
    }

    if (ct === 0) {
        polys.mutateValue();
    }
}

function paint(xRot, yRot) {
    if (!initialized) {
        return;
    }

    if (polyBuffersOutdated) {
        vertBuffer.update(polys.vertArr);
        colBuffer.update(polys.colArr);
    }

    camMatrix = mat4.create();
    mat4.rotateY(camMatrix, camMatrix, yRot);
    mat4.rotateX(camMatrix, camMatrix, xRot);
    drawData(SCREEN, perspective, camMatrix);
}

function paintReference() {
    if (!initialized || !refTexture) {
        return;
    }

    drawFlat(referenceFB.color[0], SCREEN, false);
}

function paintScratchBuffer() {
    if (!initialized) {
        return;
    }

    drawFlat(scratchFB.color[0], SCREEN, false);
}

function drawFlat(source, target, flipY) {
    var multY = (flipY ? -1 : 1);
    drawGeneral(target, flatShader, flatVao, 6, ["multY", "buffer"], [multY, source]);
}

function drawData(target, perspective, camMat4) {
    camMatrix = camMat4 || mat4.create();
    drawGeneral(target, camShader, dataVao, polys.numVerts, ["perspective", "camera"], [perspective, camMatrix]);
}

function drawGeneral(target, shader, vao, numVs, uniNames, uniVals) {
    if (target == SCREEN)
        {} else {
        target.bind();
        gl.colorMask(true, true, true, true);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.colorMask(true, true, true, false);
    }

    shader.bind();
    var textureNum = 0;

    for (var i = 0; i < uniNames.length; i++) {
        var n = uniNames[i];
        var u = uniVals[i];

        if (typeof u.bind === "function") {
            shader.uniforms[n] = u.bind(textureNum++);
        } else {
            shader.uniforms[n] = u;
        }
    }

    vao.bind();
    vao.draw(gl.TRIANGLES, numVs);
    vao.unbind();
}

function compareFBOs(a, b) {
    var w = a.shape[0], h = a.shape[1];
    var abuff = new Uint8Array(w * h * 4);
    var bbuff = new Uint8Array(w * h * 4);
    a.bind();
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, abuff);
    b.bind();
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bbuff);
    var sum = 0;

    for (var i = 0; i < abuff.length; i += 4) {
        var dx = abuff[i] - bbuff[i];
        var dy = abuff[i + 1] - bbuff[i + 1];
        var dz = abuff[i + 2] - bbuff[i + 2];
        sum += dx * dx + dy * dy + dz * dz;
    }

    sum /= 256;
    var avg = sum / w / h;
    return 100 * (1 - avg / 128);
}

function compareFBOsOnGPU(a, b) {
    var uNames, uVals, i;
    uNames = ["multY", "inputDim", "bufferA", "bufferB"];
    uVals = [1, a.shape[0], a.color[0], b.color[0]];
    drawGeneral(reducedFBs[0], diffReduceShader, flatVao, 6, uNames, uVals);

    for (i = 1; i < reducedFBs.length; i++) {
        uNames = ["multY", "inputDim", "buffer"];
        uVals = [1, reducedFBs[i - 1].shape[0], reducedFBs[i - 1].color[0]];
        drawGeneral(reducedFBs[i], avgReduceShader, flatVao, 6, uNames, uVals);
    }

    var buff = reducedFBs[reducedFBs.length - 1];
    var w = buff.shape[0];
    var uarr = new Uint8Array(w * w * 4);
    buff.bind();
    gl.readPixels(0, 0, w, w, gl.RGBA, gl.UNSIGNED_BYTE, uarr);
    var sum = 0;
    var mag = 255;

    for (i = 0; i < uarr.length; i += 4) {
        sum += uarr[i] + (uarr[i + 1] + uarr[i + 2] / mag) / mag;
    }

    var avg = 3 * sum / w / w;
    return 100 * (1 - avg / 128);
}

function exportData() {
    return "vert-xyz," + polys.vertArr.join() + "\n" + ",col-rgba," + polys.colArr.join();
}

function importData(s) {
    var curr, v = [], c = [];
    var arr = s.split(",");

    arr.forEach(function(s) {
        if (s.indexOf("vert-xyz") > -1) {
            curr = v;
        } else if (s.indexOf("col-rgba") > -1) {
            curr = c;
        } else {
            curr.push(parseFloat(s));
        }
    });

    if (v.length / 3 === c.length / 4) {
        polys.setArrays(v, c);
        vertBuffer.update(polys.vertArr);
        colBuffer.update(polys.colArr);

        if (refTexture) {
            drawData(scratchFB, perspective, null);
            var scoreFn = (compareonGPU ? compareFBOsOnGPU : compareFBOs);
            currentScore = scoreFn(referenceFB, scratchFB);
        }
    }
}

function logArr(arr) {
    console.log(arr.map(function(n) {
        return Math.round(n * 100);
    }));
}

if (0) {
    logArr();
    log();
}

function log(s) {
    console.log(s);
}

var proj = {
    init: init,
    runGeneration: runGeneration,
    paint: paint,
    paintReference: paintReference,
    paintScratchBuffer: paintScratchBuffer,
    exportData: exportData,
    importData: importData
};

Object.defineProperty(proj, "score", {
    get: function() {
        return currentScore;
    }
});

Object.defineProperty(proj, "numPolys", {
    get: function() {
        return polys.numVerts / 3;
    }
});

Object.defineProperty(proj, "compareonGPU", {
    get: function() {
        return compareonGPU;
    },

    set: function(b) {
        compareonGPU = !!b;
    }
});

Object.defineProperty(proj, "fewerPolysTolerance", {
    get: function() {
        return keepFewerPolysTolerance;
    },

    set: function(t) {
        keepFewerPolysTolerance = t;
        console.log(t);
    }
});

Object.defineProperty(proj, "useFlatPolys", {
    get: function() {
        return useFlatPolys;
    },

    set: function(b) {
        useFlatPolys = !!b;
        polys.setFlattenedness(useFlatPolys);
    }
});

function setAlphas(a, b) {
    minAlpha = a;
    maxAlpha = b;
    polys.setAlphaRange(a, b);
}

Object.defineProperty(proj, "minAlpha", {
    get: function() {
        return minAlpha;
    },

    set: function(a) {
        setAlphas(a, maxAlpha);
    }
});

Object.defineProperty(proj, "maxAlpha", {
    get: function() {
        return maxAlpha;
    },

    set: function(a) {
        setAlphas(minAlpha, a);
    }
});

module.exports = proj;
},{"./polydata":72,"gl-buffer":18,"gl-fbo":19,"gl-mat4":29,"gl-texture2d":49,"gl-vao":53,"glslify":55,"glslify/adapter.js":54}],3:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
    'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

    var PLUS   = '+'.charCodeAt(0)
    var SLASH  = '/'.charCodeAt(0)
    var NUMBER = '0'.charCodeAt(0)
    var LOWER  = 'a'.charCodeAt(0)
    var UPPER  = 'A'.charCodeAt(0)

    function decode (elt) {
        var code = elt.charCodeAt(0)
        if (code === PLUS)
            return 62 // '+'
        if (code === SLASH)
            return 63 // '/'
        if (code < NUMBER)
            return -1 //no match
        if (code < NUMBER + 10)
            return code - NUMBER + 26 + 26
        if (code < UPPER + 26)
            return code - UPPER
        if (code < LOWER + 26)
            return code - LOWER + 26
    }

    function b64ToByteArray (b64) {
        var i, j, l, tmp, placeHolders, arr

        if (b64.length % 4 > 0) {
            throw new Error('Invalid string. Length must be a multiple of 4')
        }

        // the number of equal signs (place holders)
        // if there are two placeholders, than the two characters before it
        // represent one byte
        // if there is only one, then the three characters before it represent 2 bytes
        // this is just a cheap hack to not do indexOf twice
        var len = b64.length
        placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

        // base64 is 4/3 + up to two characters of the original data
        arr = new Arr(b64.length * 3 / 4 - placeHolders)

        // if there are placeholders, only get up to the last complete 4 chars
        l = placeHolders > 0 ? b64.length - 4 : b64.length

        var L = 0

        function push (v) {
            arr[L++] = v
        }

        for (i = 0, j = 0; i < l; i += 4, j += 3) {
            tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
            push((tmp & 0xFF0000) >> 16)
            push((tmp & 0xFF00) >> 8)
            push(tmp & 0xFF)
        }

        if (placeHolders === 2) {
            tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
            push(tmp & 0xFF)
        } else if (placeHolders === 1) {
            tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
            push((tmp >> 8) & 0xFF)
            push(tmp & 0xFF)
        }

        return arr
    }

    function uint8ToBase64 (uint8) {
        var i,
            extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
            output = "",
            temp, length

        function encode (num) {
            return lookup.charAt(num)
        }

        function tripletToBase64 (num) {
            return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
        }

        // go through the array every three bytes, we'll deal with trailing stuff later
        for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
            temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
            output += tripletToBase64(temp)
        }

        // pad the end with zeros, but make sure to not forget the extra bytes
        switch (extraBytes) {
            case 1:
                temp = uint8[uint8.length - 1]
                output += encode(temp >> 2)
                output += encode((temp << 4) & 0x3F)
                output += '=='
                break
            case 2:
                temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
                output += encode(temp >> 10)
                output += encode((temp >> 4) & 0x3F)
                output += encode((temp << 2) & 0x3F)
                output += '='
                break
        }

        return output
    }

    exports.toByteArray = b64ToByteArray
    exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],4:[function(require,module,exports){
"use strict"

function compileSearch(funcName, predicate, reversed, extraArgs, useNdarray, earlyOut) {
  var code = [
    "function ", funcName, "(a,l,h,", extraArgs.join(","),  "){",
earlyOut ? "" : "var i=", (reversed ? "l-1" : "h+1"),
";while(l<=h){\
var m=(l+h)>>>1,x=a", useNdarray ? ".get(m)" : "[m]"]
  if(earlyOut) {
    if(predicate.indexOf("c") < 0) {
      code.push(";if(x===y){return m}else if(x<=y){")
    } else {
      code.push(";var p=c(x,y);if(p===0){return m}else if(p<=0){")
    }
  } else {
    code.push(";if(", predicate, "){i=m;")
  }
  if(reversed) {
    code.push("l=m+1}else{h=m-1}")
  } else {
    code.push("h=m-1}else{l=m+1}")
  }
  code.push("}")
  if(earlyOut) {
    code.push("return -1};")
  } else {
    code.push("return i};")
  }
  return code.join("")
}

function compileBoundsSearch(predicate, reversed, suffix, earlyOut) {
  var result = new Function([
  compileSearch("A", "x" + predicate + "y", reversed, ["y"], false, earlyOut),
  compileSearch("B", "x" + predicate + "y", reversed, ["y"], true, earlyOut),
  compileSearch("P", "c(x,y)" + predicate + "0", reversed, ["y", "c"], false, earlyOut),
  compileSearch("Q", "c(x,y)" + predicate + "0", reversed, ["y", "c"], true, earlyOut),
"function dispatchBsearch", suffix, "(a,y,c,l,h){\
if(a.shape){\
if(typeof(c)==='function'){\
return Q(a,(l===undefined)?0:l|0,(h===undefined)?a.shape[0]-1:h|0,y,c)\
}else{\
return B(a,(c===undefined)?0:c|0,(l===undefined)?a.shape[0]-1:l|0,y)\
}}else{\
if(typeof(c)==='function'){\
return P(a,(l===undefined)?0:l|0,(h===undefined)?a.length-1:h|0,y,c)\
}else{\
return A(a,(c===undefined)?0:c|0,(l===undefined)?a.length-1:l|0,y)\
}}}\
return dispatchBsearch", suffix].join(""))
  return result()
}

module.exports = {
  ge: compileBoundsSearch(">=", false, "GE"),
  gt: compileBoundsSearch(">", false, "GT"),
  lt: compileBoundsSearch("<", true, "LT"),
  le: compileBoundsSearch("<=", true, "LE"),
  eq: compileBoundsSearch("-", true, "EQ", true)
}

},{}],5:[function(require,module,exports){
/**
 * Bit twiddling hacks for JavaScript.
 *
 * Author: Mikola Lysenko
 *
 * Ported from Stanford bit twiddling hack library:
 *    http://graphics.stanford.edu/~seander/bithacks.html
 */

"use strict"; "use restrict";

//Number of bits in an integer
var INT_BITS = 32;

//Constants
exports.INT_BITS  = INT_BITS;
exports.INT_MAX   =  0x7fffffff;
exports.INT_MIN   = -1<<(INT_BITS-1);

//Returns -1, 0, +1 depending on sign of x
exports.sign = function(v) {
  return (v > 0) - (v < 0);
}

//Computes absolute value of integer
exports.abs = function(v) {
  var mask = v >> (INT_BITS-1);
  return (v ^ mask) - mask;
}

//Computes minimum of integers x and y
exports.min = function(x, y) {
  return y ^ ((x ^ y) & -(x < y));
}

//Computes maximum of integers x and y
exports.max = function(x, y) {
  return x ^ ((x ^ y) & -(x < y));
}

//Checks if a number is a power of two
exports.isPow2 = function(v) {
  return !(v & (v-1)) && (!!v);
}

//Computes log base 2 of v
exports.log2 = function(v) {
  var r, shift;
  r =     (v > 0xFFFF) << 4; v >>>= r;
  shift = (v > 0xFF  ) << 3; v >>>= shift; r |= shift;
  shift = (v > 0xF   ) << 2; v >>>= shift; r |= shift;
  shift = (v > 0x3   ) << 1; v >>>= shift; r |= shift;
  return r | (v >> 1);
}

//Computes log base 10 of v
exports.log10 = function(v) {
  return  (v >= 1000000000) ? 9 : (v >= 100000000) ? 8 : (v >= 10000000) ? 7 :
          (v >= 1000000) ? 6 : (v >= 100000) ? 5 : (v >= 10000) ? 4 :
          (v >= 1000) ? 3 : (v >= 100) ? 2 : (v >= 10) ? 1 : 0;
}

//Counts number of bits
exports.popCount = function(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}

//Counts number of trailing zeros
function countTrailingZeros(v) {
  var c = 32;
  v &= -v;
  if (v) c--;
  if (v & 0x0000FFFF) c -= 16;
  if (v & 0x00FF00FF) c -= 8;
  if (v & 0x0F0F0F0F) c -= 4;
  if (v & 0x33333333) c -= 2;
  if (v & 0x55555555) c -= 1;
  return c;
}
exports.countTrailingZeros = countTrailingZeros;

//Rounds to next power of 2
exports.nextPow2 = function(v) {
  v += v === 0;
  --v;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

//Rounds down to previous power of 2
exports.prevPow2 = function(v) {
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v - (v>>>1);
}

//Computes parity of word
exports.parity = function(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

var REVERSE_TABLE = new Array(256);

(function(tab) {
  for(var i=0; i<256; ++i) {
    var v = i, r = i, s = 7;
    for (v >>>= 1; v; v >>>= 1) {
      r <<= 1;
      r |= v & 1;
      --s;
    }
    tab[i] = (r << s) & 0xff;
  }
})(REVERSE_TABLE);

//Reverse bits in a 32 bit word
exports.reverse = function(v) {
  return  (REVERSE_TABLE[ v         & 0xff] << 24) |
          (REVERSE_TABLE[(v >>> 8)  & 0xff] << 16) |
          (REVERSE_TABLE[(v >>> 16) & 0xff] << 8)  |
           REVERSE_TABLE[(v >>> 24) & 0xff];
}

//Interleave bits of 2 coordinates with 16 bits.  Useful for fast quadtree codes
exports.interleave2 = function(x, y) {
  x &= 0xFFFF;
  x = (x | (x << 8)) & 0x00FF00FF;
  x = (x | (x << 4)) & 0x0F0F0F0F;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y &= 0xFFFF;
  y = (y | (y << 8)) & 0x00FF00FF;
  y = (y | (y << 4)) & 0x0F0F0F0F;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
}

//Extracts the nth interleaved component
exports.deinterleave2 = function(v, n) {
  v = (v >>> n) & 0x55555555;
  v = (v | (v >>> 1))  & 0x33333333;
  v = (v | (v >>> 2))  & 0x0F0F0F0F;
  v = (v | (v >>> 4))  & 0x00FF00FF;
  v = (v | (v >>> 16)) & 0x000FFFF;
  return (v << 16) >> 16;
}


//Interleave bits of 3 coordinates, each with 10 bits.  Useful for fast octree codes
exports.interleave3 = function(x, y, z) {
  x &= 0x3FF;
  x  = (x | (x<<16)) & 4278190335;
  x  = (x | (x<<8))  & 251719695;
  x  = (x | (x<<4))  & 3272356035;
  x  = (x | (x<<2))  & 1227133513;

  y &= 0x3FF;
  y  = (y | (y<<16)) & 4278190335;
  y  = (y | (y<<8))  & 251719695;
  y  = (y | (y<<4))  & 3272356035;
  y  = (y | (y<<2))  & 1227133513;
  x |= (y << 1);

  z &= 0x3FF;
  z  = (z | (z<<16)) & 4278190335;
  z  = (z | (z<<8))  & 251719695;
  z  = (z | (z<<4))  & 3272356035;
  z  = (z | (z<<2))  & 1227133513;

  return x | (z << 2);
}

//Extracts nth interleaved component of a 3-tuple
exports.deinterleave3 = function(v, n) {
  v = (v >>> n)       & 1227133513;
  v = (v | (v>>>2))   & 3272356035;
  v = (v | (v>>>4))   & 251719695;
  v = (v | (v>>>8))   & 4278190335;
  v = (v | (v>>>16))  & 0x3FF;
  return (v<<22)>>22;
}

//Computes next combination in colexicographic order (this is mistakenly called nextPermutation on the bit twiddling hacks page)
exports.nextCombination = function(v) {
  var t = v | (v - 1);
  return (t + 1) | (((~t & -~t) - 1) >>> (countTrailingZeros(v) + 1));
}


},{}],6:[function(require,module,exports){
/* Zepto v1.1.4 - zepto event ajax form ie - zeptojs.com/license */

var Zepto = module.exports = (function() {
  var undefined, key, $, classList, emptyArray = [], slice = emptyArray.slice, filter = emptyArray.filter,
    document = window.document,
    elementDisplay = {}, classCache = {},
    cssNumber = { 'column-count': 1, 'columns': 1, 'font-weight': 1, 'line-height': 1,'opacity': 1, 'z-index': 1, 'zoom': 1 },
    fragmentRE = /^\s*<(\w+|!)[^>]*>/,
    singleTagRE = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,
    tagExpanderRE = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/ig,
    rootNodeRE = /^(?:body|html)$/i,
    capitalRE = /([A-Z])/g,

    // special attributes that should be get/set via method calls
    methodAttributes = ['val', 'css', 'html', 'text', 'data', 'width', 'height', 'offset'],

    adjacencyOperators = [ 'after', 'prepend', 'before', 'append' ],
    table = document.createElement('table'),
    tableRow = document.createElement('tr'),
    containers = {
      'tr': document.createElement('tbody'),
      'tbody': table, 'thead': table, 'tfoot': table,
      'td': tableRow, 'th': tableRow,
      '*': document.createElement('div')
    },
    readyRE = /complete|loaded|interactive/,
    simpleSelectorRE = /^[\w-]*$/,
    class2type = {},
    toString = class2type.toString,
    zepto = {},
    camelize, uniq,
    tempParent = document.createElement('div'),
    propMap = {
      'tabindex': 'tabIndex',
      'readonly': 'readOnly',
      'for': 'htmlFor',
      'class': 'className',
      'maxlength': 'maxLength',
      'cellspacing': 'cellSpacing',
      'cellpadding': 'cellPadding',
      'rowspan': 'rowSpan',
      'colspan': 'colSpan',
      'usemap': 'useMap',
      'frameborder': 'frameBorder',
      'contenteditable': 'contentEditable'
    },
    isArray = Array.isArray ||
      function(object){ return object instanceof Array }

  zepto.matches = function(element, selector) {
    if (!selector || !element || element.nodeType !== 1) return false
    var matchesSelector = element.webkitMatchesSelector || element.mozMatchesSelector ||
                          element.oMatchesSelector || element.matchesSelector
    if (matchesSelector) return matchesSelector.call(element, selector)
    // fall back to performing a selector:
    var match, parent = element.parentNode, temp = !parent
    if (temp) (parent = tempParent).appendChild(element)
    match = ~zepto.qsa(parent, selector).indexOf(element)
    temp && tempParent.removeChild(element)
    return match
  }

  function type(obj) {
    return obj == null ? String(obj) :
      class2type[toString.call(obj)] || "object"
  }

  function isFunction(value) { return type(value) == "function" }
  function isWindow(obj)     { return obj != null && obj == obj.window }
  function isDocument(obj)   { return obj != null && obj.nodeType == obj.DOCUMENT_NODE }
  function isObject(obj)     { return type(obj) == "object" }
  function isPlainObject(obj) {
    return isObject(obj) && !isWindow(obj) && Object.getPrototypeOf(obj) == Object.prototype
  }
  function likeArray(obj) { return typeof obj.length == 'number' }

  function compact(array) { return filter.call(array, function(item){ return item != null }) }
  function flatten(array) { return array.length > 0 ? $.fn.concat.apply([], array) : array }
  camelize = function(str){ return str.replace(/-+(.)?/g, function(match, chr){ return chr ? chr.toUpperCase() : '' }) }
  function dasherize(str) {
    return str.replace(/::/g, '/')
           .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
           .replace(/([a-z\d])([A-Z])/g, '$1_$2')
           .replace(/_/g, '-')
           .toLowerCase()
  }
  uniq = function(array){ return filter.call(array, function(item, idx){ return array.indexOf(item) == idx }) }

  function classRE(name) {
    return name in classCache ?
      classCache[name] : (classCache[name] = new RegExp('(^|\\s)' + name + '(\\s|$)'))
  }

  function maybeAddPx(name, value) {
    return (typeof value == "number" && !cssNumber[dasherize(name)]) ? value + "px" : value
  }

  function defaultDisplay(nodeName) {
    var element, display
    if (!elementDisplay[nodeName]) {
      element = document.createElement(nodeName)
      document.body.appendChild(element)
      display = getComputedStyle(element, '').getPropertyValue("display")
      element.parentNode.removeChild(element)
      display == "none" && (display = "block")
      elementDisplay[nodeName] = display
    }
    return elementDisplay[nodeName]
  }

  function children(element) {
    return 'children' in element ?
      slice.call(element.children) :
      $.map(element.childNodes, function(node){ if (node.nodeType == 1) return node })
  }

  // `$.zepto.fragment` takes a html string and an optional tag name
  // to generate DOM nodes nodes from the given html string.
  // The generated DOM nodes are returned as an array.
  // This function can be overriden in plugins for example to make
  // it compatible with browsers that don't support the DOM fully.
  zepto.fragment = function(html, name, properties) {
    var dom, nodes, container

    // A special case optimization for a single tag
    if (singleTagRE.test(html)) dom = $(document.createElement(RegExp.$1))

    if (!dom) {
      if (html.replace) html = html.replace(tagExpanderRE, "<$1></$2>")
      if (name === undefined) name = fragmentRE.test(html) && RegExp.$1
      if (!(name in containers)) name = '*'

      container = containers[name]
      container.innerHTML = '' + html
      dom = $.each(slice.call(container.childNodes), function(){
        container.removeChild(this)
      })
    }

    if (isPlainObject(properties)) {
      nodes = $(dom)
      $.each(properties, function(key, value) {
        if (methodAttributes.indexOf(key) > -1) nodes[key](value)
        else nodes.attr(key, value)
      })
    }

    return dom
  }

  // `$.zepto.Z` swaps out the prototype of the given `dom` array
  // of nodes with `$.fn` and thus supplying all the Zepto functions
  // to the array. Note that `__proto__` is not supported on Internet
  // Explorer. This method can be overriden in plugins.
  zepto.Z = function(dom, selector) {
    dom = dom || []
    dom.__proto__ = $.fn
    dom.selector = selector || ''
    return dom
  }

  // `$.zepto.isZ` should return `true` if the given object is a Zepto
  // collection. This method can be overriden in plugins.
  zepto.isZ = function(object) {
    return object instanceof zepto.Z
  }

  // `$.zepto.init` is Zepto's counterpart to jQuery's `$.fn.init` and
  // takes a CSS selector and an optional context (and handles various
  // special cases).
  // This method can be overriden in plugins.
  zepto.init = function(selector, context) {
    var dom
    // If nothing given, return an empty Zepto collection
    if (!selector) return zepto.Z()
    // Optimize for string selectors
    else if (typeof selector == 'string') {
      selector = selector.trim()
      // If it's a html fragment, create nodes from it
      // Note: In both Chrome 21 and Firefox 15, DOM error 12
      // is thrown if the fragment doesn't begin with <
      if (selector[0] == '<' && fragmentRE.test(selector))
        dom = zepto.fragment(selector, RegExp.$1, context), selector = null
      // If there's a context, create a collection on that context first, and select
      // nodes from there
      else if (context !== undefined) return $(context).find(selector)
      // If it's a CSS selector, use it to select nodes.
      else dom = zepto.qsa(document, selector)
    }
    // If a function is given, call it when the DOM is ready
    else if (isFunction(selector)) return $(document).ready(selector)
    // If a Zepto collection is given, just return it
    else if (zepto.isZ(selector)) return selector
    else {
      // normalize array if an array of nodes is given
      if (isArray(selector)) dom = compact(selector)
      // Wrap DOM nodes.
      else if (isObject(selector))
        dom = [selector], selector = null
      // If it's a html fragment, create nodes from it
      else if (fragmentRE.test(selector))
        dom = zepto.fragment(selector.trim(), RegExp.$1, context), selector = null
      // If there's a context, create a collection on that context first, and select
      // nodes from there
      else if (context !== undefined) return $(context).find(selector)
      // And last but no least, if it's a CSS selector, use it to select nodes.
      else dom = zepto.qsa(document, selector)
    }
    // create a new Zepto collection from the nodes found
    return zepto.Z(dom, selector)
  }

  // `$` will be the base `Zepto` object. When calling this
  // function just call `$.zepto.init, which makes the implementation
  // details of selecting nodes and creating Zepto collections
  // patchable in plugins.
  $ = function(selector, context){
    return zepto.init(selector, context)
  }

  function extend(target, source, deep) {
    for (key in source)
      if (deep && (isPlainObject(source[key]) || isArray(source[key]))) {
        if (isPlainObject(source[key]) && !isPlainObject(target[key]))
          target[key] = {}
        if (isArray(source[key]) && !isArray(target[key]))
          target[key] = []
        extend(target[key], source[key], deep)
      }
      else if (source[key] !== undefined) target[key] = source[key]
  }

  // Copy all but undefined properties from one or more
  // objects to the `target` object.
  $.extend = function(target){
    var deep, args = slice.call(arguments, 1)
    if (typeof target == 'boolean') {
      deep = target
      target = args.shift()
    }
    args.forEach(function(arg){ extend(target, arg, deep) })
    return target
  }

  // `$.zepto.qsa` is Zepto's CSS selector implementation which
  // uses `document.querySelectorAll` and optimizes for some special cases, like `#id`.
  // This method can be overriden in plugins.
  zepto.qsa = function(element, selector){
    var found,
        maybeID = selector[0] == '#',
        maybeClass = !maybeID && selector[0] == '.',
        nameOnly = maybeID || maybeClass ? selector.slice(1) : selector, // Ensure that a 1 char tag name still gets checked
        isSimple = simpleSelectorRE.test(nameOnly)
    return (isDocument(element) && isSimple && maybeID) ?
      ( (found = element.getElementById(nameOnly)) ? [found] : [] ) :
      (element.nodeType !== 1 && element.nodeType !== 9) ? [] :
      slice.call(
        isSimple && !maybeID ?
          maybeClass ? element.getElementsByClassName(nameOnly) : // If it's simple, it could be a class
          element.getElementsByTagName(selector) : // Or a tag
          element.querySelectorAll(selector) // Or it's not simple, and we need to query all
      )
  }

  function filtered(nodes, selector) {
    return selector == null ? $(nodes) : $(nodes).filter(selector)
  }

  $.contains = document.documentElement.contains ?
    function(parent, node) {
      return parent !== node && parent.contains(node)
    } :
    function(parent, node) {
      while (node && (node = node.parentNode))
        if (node === parent) return true
      return false
    }

  function funcArg(context, arg, idx, payload) {
    return isFunction(arg) ? arg.call(context, idx, payload) : arg
  }

  function setAttribute(node, name, value) {
    value == null ? node.removeAttribute(name) : node.setAttribute(name, value)
  }

  // access className property while respecting SVGAnimatedString
  function className(node, value){
    var klass = node.className,
        svg   = klass && klass.baseVal !== undefined

    if (value === undefined) return svg ? klass.baseVal : klass
    svg ? (klass.baseVal = value) : (node.className = value)
  }

  // "true"  => true
  // "false" => false
  // "null"  => null
  // "42"    => 42
  // "42.5"  => 42.5
  // "08"    => "08"
  // JSON    => parse if valid
  // String  => self
  function deserializeValue(value) {
    var num
    try {
      return value ?
        value == "true" ||
        ( value == "false" ? false :
          value == "null" ? null :
          !/^0/.test(value) && !isNaN(num = Number(value)) ? num :
          /^[\[\{]/.test(value) ? $.parseJSON(value) :
          value )
        : value
    } catch(e) {
      return value
    }
  }

  $.type = type
  $.isFunction = isFunction
  $.isWindow = isWindow
  $.isArray = isArray
  $.isPlainObject = isPlainObject

  $.isEmptyObject = function(obj) {
    var name
    for (name in obj) return false
    return true
  }

  $.inArray = function(elem, array, i){
    return emptyArray.indexOf.call(array, elem, i)
  }

  $.camelCase = camelize
  $.trim = function(str) {
    return str == null ? "" : String.prototype.trim.call(str)
  }

  // plugin compatibility
  $.uuid = 0
  $.support = { }
  $.expr = { }

  $.map = function(elements, callback){
    var value, values = [], i, key
    if (likeArray(elements))
      for (i = 0; i < elements.length; i++) {
        value = callback(elements[i], i)
        if (value != null) values.push(value)
      }
    else
      for (key in elements) {
        value = callback(elements[key], key)
        if (value != null) values.push(value)
      }
    return flatten(values)
  }

  $.each = function(elements, callback){
    var i, key
    if (likeArray(elements)) {
      for (i = 0; i < elements.length; i++)
        if (callback.call(elements[i], i, elements[i]) === false) return elements
    } else {
      for (key in elements)
        if (callback.call(elements[key], key, elements[key]) === false) return elements
    }

    return elements
  }

  $.grep = function(elements, callback){
    return filter.call(elements, callback)
  }

  if (window.JSON) $.parseJSON = JSON.parse

  // Populate the class2type map
  $.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
    class2type[ "[object " + name + "]" ] = name.toLowerCase()
  })

  // Define methods that will be available on all
  // Zepto collections
  $.fn = {
    // Because a collection acts like an array
    // copy over these useful array functions.
    forEach: emptyArray.forEach,
    reduce: emptyArray.reduce,
    push: emptyArray.push,
    sort: emptyArray.sort,
    indexOf: emptyArray.indexOf,
    concat: emptyArray.concat,

    // `map` and `slice` in the jQuery API work differently
    // from their array counterparts
    map: function(fn){
      return $($.map(this, function(el, i){ return fn.call(el, i, el) }))
    },
    slice: function(){
      return $(slice.apply(this, arguments))
    },

    ready: function(callback){
      // need to check if document.body exists for IE as that browser reports
      // document ready when it hasn't yet created the body element
      if (readyRE.test(document.readyState) && document.body) callback($)
      else document.addEventListener('DOMContentLoaded', function(){ callback($) }, false)
      return this
    },
    get: function(idx){
      return idx === undefined ? slice.call(this) : this[idx >= 0 ? idx : idx + this.length]
    },
    toArray: function(){ return this.get() },
    size: function(){
      return this.length
    },
    remove: function(){
      return this.each(function(){
        if (this.parentNode != null)
          this.parentNode.removeChild(this)
      })
    },
    each: function(callback){
      emptyArray.every.call(this, function(el, idx){
        return callback.call(el, idx, el) !== false
      })
      return this
    },
    filter: function(selector){
      if (isFunction(selector)) return this.not(this.not(selector))
      return $(filter.call(this, function(element){
        return zepto.matches(element, selector)
      }))
    },
    add: function(selector,context){
      return $(uniq(this.concat($(selector,context))))
    },
    is: function(selector){
      return this.length > 0 && zepto.matches(this[0], selector)
    },
    not: function(selector){
      var nodes=[]
      if (isFunction(selector) && selector.call !== undefined)
        this.each(function(idx){
          if (!selector.call(this,idx)) nodes.push(this)
        })
      else {
        var excludes = typeof selector == 'string' ? this.filter(selector) :
          (likeArray(selector) && isFunction(selector.item)) ? slice.call(selector) : $(selector)
        this.forEach(function(el){
          if (excludes.indexOf(el) < 0) nodes.push(el)
        })
      }
      return $(nodes)
    },
    has: function(selector){
      return this.filter(function(){
        return isObject(selector) ?
          $.contains(this, selector) :
          $(this).find(selector).size()
      })
    },
    eq: function(idx){
      return idx === -1 ? this.slice(idx) : this.slice(idx, + idx + 1)
    },
    first: function(){
      var el = this[0]
      return el && !isObject(el) ? el : $(el)
    },
    last: function(){
      var el = this[this.length - 1]
      return el && !isObject(el) ? el : $(el)
    },
    find: function(selector){
      var result, $this = this
      if (!selector) result = []
      else if (typeof selector == 'object')
        result = $(selector).filter(function(){
          var node = this
          return emptyArray.some.call($this, function(parent){
            return $.contains(parent, node)
          })
        })
      else if (this.length == 1) result = $(zepto.qsa(this[0], selector))
      else result = this.map(function(){ return zepto.qsa(this, selector) })
      return result
    },
    closest: function(selector, context){
      var node = this[0], collection = false
      if (typeof selector == 'object') collection = $(selector)
      while (node && !(collection ? collection.indexOf(node) >= 0 : zepto.matches(node, selector)))
        node = node !== context && !isDocument(node) && node.parentNode
      return $(node)
    },
    parents: function(selector){
      var ancestors = [], nodes = this
      while (nodes.length > 0)
        nodes = $.map(nodes, function(node){
          if ((node = node.parentNode) && !isDocument(node) && ancestors.indexOf(node) < 0) {
            ancestors.push(node)
            return node
          }
        })
      return filtered(ancestors, selector)
    },
    parent: function(selector){
      return filtered(uniq(this.pluck('parentNode')), selector)
    },
    children: function(selector){
      return filtered(this.map(function(){ return children(this) }), selector)
    },
    contents: function() {
      return this.map(function() { return slice.call(this.childNodes) })
    },
    siblings: function(selector){
      return filtered(this.map(function(i, el){
        return filter.call(children(el.parentNode), function(child){ return child!==el })
      }), selector)
    },
    empty: function(){
      return this.each(function(){ this.innerHTML = '' })
    },
    // `pluck` is borrowed from Prototype.js
    pluck: function(property){
      return $.map(this, function(el){ return el[property] })
    },
    show: function(){
      return this.each(function(){
        this.style.display == "none" && (this.style.display = '')
        if (getComputedStyle(this, '').getPropertyValue("display") == "none")
          this.style.display = defaultDisplay(this.nodeName)
      })
    },
    replaceWith: function(newContent){
      return this.before(newContent).remove()
    },
    wrap: function(structure){
      var func = isFunction(structure)
      if (this[0] && !func)
        var dom   = $(structure).get(0),
            clone = dom.parentNode || this.length > 1

      return this.each(function(index){
        $(this).wrapAll(
          func ? structure.call(this, index) :
            clone ? dom.cloneNode(true) : dom
        )
      })
    },
    wrapAll: function(structure){
      if (this[0]) {
        $(this[0]).before(structure = $(structure))
        var children
        // drill down to the inmost element
        while ((children = structure.children()).length) structure = children.first()
        $(structure).append(this)
      }
      return this
    },
    wrapInner: function(structure){
      var func = isFunction(structure)
      return this.each(function(index){
        var self = $(this), contents = self.contents(),
            dom  = func ? structure.call(this, index) : structure
        contents.length ? contents.wrapAll(dom) : self.append(dom)
      })
    },
    unwrap: function(){
      this.parent().each(function(){
        $(this).replaceWith($(this).children())
      })
      return this
    },
    clone: function(){
      return this.map(function(){ return this.cloneNode(true) })
    },
    hide: function(){
      return this.css("display", "none")
    },
    toggle: function(setting){
      return this.each(function(){
        var el = $(this)
        ;(setting === undefined ? el.css("display") == "none" : setting) ? el.show() : el.hide()
      })
    },
    prev: function(selector){ return $(this.pluck('previousElementSibling')).filter(selector || '*') },
    next: function(selector){ return $(this.pluck('nextElementSibling')).filter(selector || '*') },
    html: function(html){
      return 0 in arguments ?
        this.each(function(idx){
          var originHtml = this.innerHTML
          $(this).empty().append( funcArg(this, html, idx, originHtml) )
        }) :
        (0 in this ? this[0].innerHTML : null)
    },
    text: function(text){
      return 0 in arguments ?
        this.each(function(idx){
          var newText = funcArg(this, text, idx, this.textContent)
          this.textContent = newText == null ? '' : ''+newText
        }) :
        (0 in this ? this[0].textContent : null)
    },
    attr: function(name, value){
      var result
      return (typeof name == 'string' && !(1 in arguments)) ?
        (!this.length || this[0].nodeType !== 1 ? undefined :
          (!(result = this[0].getAttribute(name)) && name in this[0]) ? this[0][name] : result
        ) :
        this.each(function(idx){
          if (this.nodeType !== 1) return
          if (isObject(name)) for (key in name) setAttribute(this, key, name[key])
          else setAttribute(this, name, funcArg(this, value, idx, this.getAttribute(name)))
        })
    },
    removeAttr: function(name){
      return this.each(function(){ this.nodeType === 1 && setAttribute(this, name) })
    },
    prop: function(name, value){
      name = propMap[name] || name
      return (1 in arguments) ?
        this.each(function(idx){
          this[name] = funcArg(this, value, idx, this[name])
        }) :
        (this[0] && this[0][name])
    },
    data: function(name, value){
      var attrName = 'data-' + name.replace(capitalRE, '-$1').toLowerCase()

      var data = (1 in arguments) ?
        this.attr(attrName, value) :
        this.attr(attrName)

      return data !== null ? deserializeValue(data) : undefined
    },
    val: function(value){
      return 0 in arguments ?
        this.each(function(idx){
          this.value = funcArg(this, value, idx, this.value)
        }) :
        (this[0] && (this[0].multiple ?
           $(this[0]).find('option').filter(function(){ return this.selected }).pluck('value') :
           this[0].value)
        )
    },
    offset: function(coordinates){
      if (coordinates) return this.each(function(index){
        var $this = $(this),
            coords = funcArg(this, coordinates, index, $this.offset()),
            parentOffset = $this.offsetParent().offset(),
            props = {
              top:  coords.top  - parentOffset.top,
              left: coords.left - parentOffset.left
            }

        if ($this.css('position') == 'static') props['position'] = 'relative'
        $this.css(props)
      })
      if (!this.length) return null
      var obj = this[0].getBoundingClientRect()
      return {
        left: obj.left + window.pageXOffset,
        top: obj.top + window.pageYOffset,
        width: Math.round(obj.width),
        height: Math.round(obj.height)
      }
    },
    css: function(property, value){
      if (arguments.length < 2) {
        var element = this[0], computedStyle = getComputedStyle(element, '')
        if(!element) return
        if (typeof property == 'string')
          return element.style[camelize(property)] || computedStyle.getPropertyValue(property)
        else if (isArray(property)) {
          var props = {}
          $.each(isArray(property) ? property: [property], function(_, prop){
            props[prop] = (element.style[camelize(prop)] || computedStyle.getPropertyValue(prop))
          })
          return props
        }
      }

      var css = ''
      if (type(property) == 'string') {
        if (!value && value !== 0)
          this.each(function(){ this.style.removeProperty(dasherize(property)) })
        else
          css = dasherize(property) + ":" + maybeAddPx(property, value)
      } else {
        for (key in property)
          if (!property[key] && property[key] !== 0)
            this.each(function(){ this.style.removeProperty(dasherize(key)) })
          else
            css += dasherize(key) + ':' + maybeAddPx(key, property[key]) + ';'
      }

      return this.each(function(){ this.style.cssText += ';' + css })
    },
    index: function(element){
      return element ? this.indexOf($(element)[0]) : this.parent().children().indexOf(this[0])
    },
    hasClass: function(name){
      if (!name) return false
      return emptyArray.some.call(this, function(el){
        return this.test(className(el))
      }, classRE(name))
    },
    addClass: function(name){
      if (!name) return this
      return this.each(function(idx){
        classList = []
        var cls = className(this), newName = funcArg(this, name, idx, cls)
        newName.split(/\s+/g).forEach(function(klass){
          if (!$(this).hasClass(klass)) classList.push(klass)
        }, this)
        classList.length && className(this, cls + (cls ? " " : "") + classList.join(" "))
      })
    },
    removeClass: function(name){
      return this.each(function(idx){
        if (name === undefined) return className(this, '')
        classList = className(this)
        funcArg(this, name, idx, classList).split(/\s+/g).forEach(function(klass){
          classList = classList.replace(classRE(klass), " ")
        })
        className(this, classList.trim())
      })
    },
    toggleClass: function(name, when){
      if (!name) return this
      return this.each(function(idx){
        var $this = $(this), names = funcArg(this, name, idx, className(this))
        names.split(/\s+/g).forEach(function(klass){
          (when === undefined ? !$this.hasClass(klass) : when) ?
            $this.addClass(klass) : $this.removeClass(klass)
        })
      })
    },
    scrollTop: function(value){
      if (!this.length) return
      var hasScrollTop = 'scrollTop' in this[0]
      if (value === undefined) return hasScrollTop ? this[0].scrollTop : this[0].pageYOffset
      return this.each(hasScrollTop ?
        function(){ this.scrollTop = value } :
        function(){ this.scrollTo(this.scrollX, value) })
    },
    scrollLeft: function(value){
      if (!this.length) return
      var hasScrollLeft = 'scrollLeft' in this[0]
      if (value === undefined) return hasScrollLeft ? this[0].scrollLeft : this[0].pageXOffset
      return this.each(hasScrollLeft ?
        function(){ this.scrollLeft = value } :
        function(){ this.scrollTo(value, this.scrollY) })
    },
    position: function() {
      if (!this.length) return

      var elem = this[0],
        // Get *real* offsetParent
        offsetParent = this.offsetParent(),
        // Get correct offsets
        offset       = this.offset(),
        parentOffset = rootNodeRE.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset()

      // Subtract element margins
      // note: when an element has margin: auto the offsetLeft and marginLeft
      // are the same in Safari causing offset.left to incorrectly be 0
      offset.top  -= parseFloat( $(elem).css('margin-top') ) || 0
      offset.left -= parseFloat( $(elem).css('margin-left') ) || 0

      // Add offsetParent borders
      parentOffset.top  += parseFloat( $(offsetParent[0]).css('border-top-width') ) || 0
      parentOffset.left += parseFloat( $(offsetParent[0]).css('border-left-width') ) || 0

      // Subtract the two offsets
      return {
        top:  offset.top  - parentOffset.top,
        left: offset.left - parentOffset.left
      }
    },
    offsetParent: function() {
      return this.map(function(){
        var parent = this.offsetParent || document.body
        while (parent && !rootNodeRE.test(parent.nodeName) && $(parent).css("position") == "static")
          parent = parent.offsetParent
        return parent
      })
    }
  }

  // for now
  $.fn.detach = $.fn.remove

  // Generate the `width` and `height` functions
  ;['width', 'height'].forEach(function(dimension){
    var dimensionProperty =
      dimension.replace(/./, function(m){ return m[0].toUpperCase() })

    $.fn[dimension] = function(value){
      var offset, el = this[0]
      if (value === undefined) return isWindow(el) ? el['inner' + dimensionProperty] :
        isDocument(el) ? el.documentElement['scroll' + dimensionProperty] :
        (offset = this.offset()) && offset[dimension]
      else return this.each(function(idx){
        el = $(this)
        el.css(dimension, funcArg(this, value, idx, el[dimension]()))
      })
    }
  })

  function traverseNode(node, fun) {
    fun(node)
    for (var i = 0, len = node.childNodes.length; i < len; i++)
      traverseNode(node.childNodes[i], fun)
  }

  // Generate the `after`, `prepend`, `before`, `append`,
  // `insertAfter`, `insertBefore`, `appendTo`, and `prependTo` methods.
  adjacencyOperators.forEach(function(operator, operatorIndex) {
    var inside = operatorIndex % 2 //=> prepend, append

    $.fn[operator] = function(){
      // arguments can be nodes, arrays of nodes, Zepto objects and HTML strings
      var argType, nodes = $.map(arguments, function(arg) {
            argType = type(arg)
            return argType == "object" || argType == "array" || arg == null ?
              arg : zepto.fragment(arg)
          }),
          parent, copyByClone = this.length > 1
      if (nodes.length < 1) return this

      return this.each(function(_, target){
        parent = inside ? target : target.parentNode

        // convert all methods to a "before" operation
        target = operatorIndex == 0 ? target.nextSibling :
                 operatorIndex == 1 ? target.firstChild :
                 operatorIndex == 2 ? target :
                 null

        var parentInDocument = $.contains(document.documentElement, parent)

        nodes.forEach(function(node){
          if (copyByClone) node = node.cloneNode(true)
          else if (!parent) return $(node).remove()

          parent.insertBefore(node, target)
          if (parentInDocument) traverseNode(node, function(el){
            if (el.nodeName != null && el.nodeName.toUpperCase() === 'SCRIPT' &&
               (!el.type || el.type === 'text/javascript') && !el.src)
              window['eval'].call(window, el.innerHTML)
          })
        })
      })
    }

    // after    => insertAfter
    // prepend  => prependTo
    // before   => insertBefore
    // append   => appendTo
    $.fn[inside ? operator+'To' : 'insert'+(operatorIndex ? 'Before' : 'After')] = function(html){
      $(html)[operator](this)
      return this
    }
  })

  zepto.Z.prototype = $.fn

  // Export internal API functions in the `$.zepto` namespace
  zepto.uniq = uniq
  zepto.deserializeValue = deserializeValue
  $.zepto = zepto

  return $
})()




;(function($){
  var _zid = 1, undefined,
      slice = Array.prototype.slice,
      isFunction = $.isFunction,
      isString = function(obj){ return typeof obj == 'string' },
      handlers = {},
      specialEvents={},
      focusinSupported = 'onfocusin' in window,
      focus = { focus: 'focusin', blur: 'focusout' },
      hover = { mouseenter: 'mouseover', mouseleave: 'mouseout' }

  specialEvents.click = specialEvents.mousedown = specialEvents.mouseup = specialEvents.mousemove = 'MouseEvents'

  function zid(element) {
    return element._zid || (element._zid = _zid++)
  }
  function findHandlers(element, event, fn, selector) {
    event = parse(event)
    if (event.ns) var matcher = matcherFor(event.ns)
    return (handlers[zid(element)] || []).filter(function(handler) {
      return handler
        && (!event.e  || handler.e == event.e)
        && (!event.ns || matcher.test(handler.ns))
        && (!fn       || zid(handler.fn) === zid(fn))
        && (!selector || handler.sel == selector)
    })
  }
  function parse(event) {
    var parts = ('' + event).split('.')
    return {e: parts[0], ns: parts.slice(1).sort().join(' ')}
  }
  function matcherFor(ns) {
    return new RegExp('(?:^| )' + ns.replace(' ', ' .* ?') + '(?: |$)')
  }

  function eventCapture(handler, captureSetting) {
    return handler.del &&
      (!focusinSupported && (handler.e in focus)) ||
      !!captureSetting
  }

  function realEvent(type) {
    return hover[type] || (focusinSupported && focus[type]) || type
  }

  function add(element, events, fn, data, selector, delegator, capture){
    var id = zid(element), set = (handlers[id] || (handlers[id] = []))
    events.split(/\s/).forEach(function(event){
      if (event == 'ready') return $(document).ready(fn)
      var handler   = parse(event)
      handler.fn    = fn
      handler.sel   = selector
      // emulate mouseenter, mouseleave
      if (handler.e in hover) fn = function(e){
        var related = e.relatedTarget
        if (!related || (related !== this && !$.contains(this, related)))
          return handler.fn.apply(this, arguments)
      }
      handler.del   = delegator
      var callback  = delegator || fn
      handler.proxy = function(e){
        e = compatible(e)
        if (e.isImmediatePropagationStopped()) return
        e.data = data
        var result = callback.apply(element, e._args == undefined ? [e] : [e].concat(e._args))
        if (result === false) e.preventDefault(), e.stopPropagation()
        return result
      }
      handler.i = set.length
      set.push(handler)
      if ('addEventListener' in element)
        element.addEventListener(realEvent(handler.e), handler.proxy, eventCapture(handler, capture))
    })
  }
  function remove(element, events, fn, selector, capture){
    var id = zid(element)
    ;(events || '').split(/\s/).forEach(function(event){
      findHandlers(element, event, fn, selector).forEach(function(handler){
        delete handlers[id][handler.i]
      if ('removeEventListener' in element)
        element.removeEventListener(realEvent(handler.e), handler.proxy, eventCapture(handler, capture))
      })
    })
  }

  $.event = { add: add, remove: remove }

  $.proxy = function(fn, context) {
    var args = (2 in arguments) && slice.call(arguments, 2)
    if (isFunction(fn)) {
      var proxyFn = function(){ return fn.apply(context, args ? args.concat(slice.call(arguments)) : arguments) }
      proxyFn._zid = zid(fn)
      return proxyFn
    } else if (isString(context)) {
      if (args) {
        args.unshift(fn[context], fn)
        return $.proxy.apply(null, args)
      } else {
        return $.proxy(fn[context], fn)
      }
    } else {
      throw new TypeError("expected function")
    }
  }

  $.fn.bind = function(event, data, callback){
    return this.on(event, data, callback)
  }
  $.fn.unbind = function(event, callback){
    return this.off(event, callback)
  }
  $.fn.one = function(event, selector, data, callback){
    return this.on(event, selector, data, callback, 1)
  }

  var returnTrue = function(){return true},
      returnFalse = function(){return false},
      ignoreProperties = /^([A-Z]|returnValue$|layer[XY]$)/,
      eventMethods = {
        preventDefault: 'isDefaultPrevented',
        stopImmediatePropagation: 'isImmediatePropagationStopped',
        stopPropagation: 'isPropagationStopped'
      }

  function compatible(event, source) {
    if (source || !event.isDefaultPrevented) {
      source || (source = event)

      $.each(eventMethods, function(name, predicate) {
        var sourceMethod = source[name]
        event[name] = function(){
          this[predicate] = returnTrue
          return sourceMethod && sourceMethod.apply(source, arguments)
        }
        event[predicate] = returnFalse
      })

      if (source.defaultPrevented !== undefined ? source.defaultPrevented :
          'returnValue' in source ? source.returnValue === false :
          source.getPreventDefault && source.getPreventDefault())
        event.isDefaultPrevented = returnTrue
    }
    return event
  }

  function createProxy(event) {
    var key, proxy = { originalEvent: event }
    for (key in event)
      if (!ignoreProperties.test(key) && event[key] !== undefined) proxy[key] = event[key]

    return compatible(proxy, event)
  }

  $.fn.delegate = function(selector, event, callback){
    return this.on(event, selector, callback)
  }
  $.fn.undelegate = function(selector, event, callback){
    return this.off(event, selector, callback)
  }

  $.fn.live = function(event, callback){
    $(document.body).delegate(this.selector, event, callback)
    return this
  }
  $.fn.die = function(event, callback){
    $(document.body).undelegate(this.selector, event, callback)
    return this
  }

  $.fn.on = function(event, selector, data, callback, one){
    var autoRemove, delegator, $this = this
    if (event && !isString(event)) {
      $.each(event, function(type, fn){
        $this.on(type, selector, data, fn, one)
      })
      return $this
    }

    if (!isString(selector) && !isFunction(callback) && callback !== false)
      callback = data, data = selector, selector = undefined
    if (isFunction(data) || data === false)
      callback = data, data = undefined

    if (callback === false) callback = returnFalse

    return $this.each(function(_, element){
      if (one) autoRemove = function(e){
        remove(element, e.type, callback)
        return callback.apply(this, arguments)
      }

      if (selector) delegator = function(e){
        var evt, match = $(e.target).closest(selector, element).get(0)
        if (match && match !== element) {
          evt = $.extend(createProxy(e), {currentTarget: match, liveFired: element})
          return (autoRemove || callback).apply(match, [evt].concat(slice.call(arguments, 1)))
        }
      }

      add(element, event, callback, data, selector, delegator || autoRemove)
    })
  }
  $.fn.off = function(event, selector, callback){
    var $this = this
    if (event && !isString(event)) {
      $.each(event, function(type, fn){
        $this.off(type, selector, fn)
      })
      return $this
    }

    if (!isString(selector) && !isFunction(callback) && callback !== false)
      callback = selector, selector = undefined

    if (callback === false) callback = returnFalse

    return $this.each(function(){
      remove(this, event, callback, selector)
    })
  }

  $.fn.trigger = function(event, args){
    event = (isString(event) || $.isPlainObject(event)) ? $.Event(event) : compatible(event)
    event._args = args
    return this.each(function(){
      // items in the collection might not be DOM elements
      if('dispatchEvent' in this) this.dispatchEvent(event)
      else $(this).triggerHandler(event, args)
    })
  }

  // triggers event handlers on current element just as if an event occurred,
  // doesn't trigger an actual event, doesn't bubble
  $.fn.triggerHandler = function(event, args){
    var e, result
    this.each(function(i, element){
      e = createProxy(isString(event) ? $.Event(event) : event)
      e._args = args
      e.target = element
      $.each(findHandlers(element, event.type || event), function(i, handler){
        result = handler.proxy(e)
        if (e.isImmediatePropagationStopped()) return false
      })
    })
    return result
  }

  // shortcut methods for `.bind(event, fn)` for each event type
  ;('focusin focusout load resize scroll unload click dblclick '+
  'mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave '+
  'change select keydown keypress keyup error').split(' ').forEach(function(event) {
    $.fn[event] = function(callback) {
      return callback ?
        this.bind(event, callback) :
        this.trigger(event)
    }
  })

  ;['focus', 'blur'].forEach(function(name) {
    $.fn[name] = function(callback) {
      if (callback) this.bind(name, callback)
      else this.each(function(){
        try { this[name]() }
        catch(e) {}
      })
      return this
    }
  })

  $.Event = function(type, props) {
    if (!isString(type)) props = type, type = props.type
    var event = document.createEvent(specialEvents[type] || 'Events'), bubbles = true
    if (props) for (var name in props) (name == 'bubbles') ? (bubbles = !!props[name]) : (event[name] = props[name])
    event.initEvent(type, bubbles, true)
    return compatible(event)
  }

})(Zepto)

;(function($){
  var jsonpID = 0,
      document = window.document,
      key,
      name,
      rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      scriptTypeRE = /^(?:text|application)\/javascript/i,
      xmlTypeRE = /^(?:text|application)\/xml/i,
      jsonType = 'application/json',
      htmlType = 'text/html',
      blankRE = /^\s*$/

  // trigger a custom event and return false if it was cancelled
  function triggerAndReturn(context, eventName, data) {
    var event = $.Event(eventName)
    $(context).trigger(event, data)
    return !event.isDefaultPrevented()
  }

  // trigger an Ajax "global" event
  function triggerGlobal(settings, context, eventName, data) {
    if (settings.global) return triggerAndReturn(context || document, eventName, data)
  }

  // Number of active Ajax requests
  $.active = 0

  function ajaxStart(settings) {
    if (settings.global && $.active++ === 0) triggerGlobal(settings, null, 'ajaxStart')
  }
  function ajaxStop(settings) {
    if (settings.global && !(--$.active)) triggerGlobal(settings, null, 'ajaxStop')
  }

  // triggers an extra global event "ajaxBeforeSend" that's like "ajaxSend" but cancelable
  function ajaxBeforeSend(xhr, settings) {
    var context = settings.context
    if (settings.beforeSend.call(context, xhr, settings) === false ||
        triggerGlobal(settings, context, 'ajaxBeforeSend', [xhr, settings]) === false)
      return false

    triggerGlobal(settings, context, 'ajaxSend', [xhr, settings])
  }
  function ajaxSuccess(data, xhr, settings, deferred) {
    var context = settings.context, status = 'success'
    settings.success.call(context, data, status, xhr)
    if (deferred) deferred.resolveWith(context, [data, status, xhr])
    triggerGlobal(settings, context, 'ajaxSuccess', [xhr, settings, data])
    ajaxComplete(status, xhr, settings)
  }
  // type: "timeout", "error", "abort", "parsererror"
  function ajaxError(error, type, xhr, settings, deferred) {
    var context = settings.context
    settings.error.call(context, xhr, type, error)
    if (deferred) deferred.rejectWith(context, [xhr, type, error])
    triggerGlobal(settings, context, 'ajaxError', [xhr, settings, error || type])
    ajaxComplete(type, xhr, settings)
  }
  // status: "success", "notmodified", "error", "timeout", "abort", "parsererror"
  function ajaxComplete(status, xhr, settings) {
    var context = settings.context
    settings.complete.call(context, xhr, status)
    triggerGlobal(settings, context, 'ajaxComplete', [xhr, settings])
    ajaxStop(settings)
  }

  // Empty function, used as default callback
  function empty() {}

  $.ajaxJSONP = function(options, deferred){
    if (!('type' in options)) return $.ajax(options)

    var _callbackName = options.jsonpCallback,
      callbackName = ($.isFunction(_callbackName) ?
        _callbackName() : _callbackName) || ('jsonp' + (++jsonpID)),
      script = document.createElement('script'),
      originalCallback = window[callbackName],
      responseData,
      abort = function(errorType) {
        $(script).triggerHandler('error', errorType || 'abort')
      },
      xhr = { abort: abort }, abortTimeout

    if (deferred) deferred.promise(xhr)

    $(script).on('load error', function(e, errorType){
      clearTimeout(abortTimeout)
      $(script).off().remove()

      if (e.type == 'error' || !responseData) {
        ajaxError(null, errorType || 'error', xhr, options, deferred)
      } else {
        ajaxSuccess(responseData[0], xhr, options, deferred)
      }

      window[callbackName] = originalCallback
      if (responseData && $.isFunction(originalCallback))
        originalCallback(responseData[0])

      originalCallback = responseData = undefined
    })

    if (ajaxBeforeSend(xhr, options) === false) {
      abort('abort')
      return xhr
    }

    window[callbackName] = function(){
      responseData = arguments
    }

    script.src = options.url.replace(/\?(.+)=\?/, '?$1=' + callbackName)
    document.head.appendChild(script)

    if (options.timeout > 0) abortTimeout = setTimeout(function(){
      abort('timeout')
    }, options.timeout)

    return xhr
  }

  $.ajaxSettings = {
    // Default type of request
    type: 'GET',
    // Callback that is executed before request
    beforeSend: empty,
    // Callback that is executed if the request succeeds
    success: empty,
    // Callback that is executed the the server drops error
    error: empty,
    // Callback that is executed on request complete (both: error and success)
    complete: empty,
    // The context for the callbacks
    context: null,
    // Whether to trigger "global" Ajax events
    global: true,
    // Transport
    xhr: function () {
      return new window.XMLHttpRequest()
    },
    // MIME types mapping
    // IIS returns Javascript as "application/x-javascript"
    accepts: {
      script: 'text/javascript, application/javascript, application/x-javascript',
      json:   jsonType,
      xml:    'application/xml, text/xml',
      html:   htmlType,
      text:   'text/plain'
    },
    // Whether the request is to another domain
    crossDomain: false,
    // Default timeout
    timeout: 0,
    // Whether data should be serialized to string
    processData: true,
    // Whether the browser should be allowed to cache GET responses
    cache: true
  }

  function mimeToDataType(mime) {
    if (mime) mime = mime.split(';', 2)[0]
    return mime && ( mime == htmlType ? 'html' :
      mime == jsonType ? 'json' :
      scriptTypeRE.test(mime) ? 'script' :
      xmlTypeRE.test(mime) && 'xml' ) || 'text'
  }

  function appendQuery(url, query) {
    if (query == '') return url
    return (url + '&' + query).replace(/[&?]{1,2}/, '?')
  }

  // serialize payload and append it to the URL for GET requests
  function serializeData(options) {
    if (options.processData && options.data && $.type(options.data) != "string")
      options.data = $.param(options.data, options.traditional)
    if (options.data && (!options.type || options.type.toUpperCase() == 'GET'))
      options.url = appendQuery(options.url, options.data), options.data = undefined
  }

  $.ajax = function(options){
    var settings = $.extend({}, options || {}),
        deferred = $.Deferred && $.Deferred()
    for (key in $.ajaxSettings) if (settings[key] === undefined) settings[key] = $.ajaxSettings[key]

    ajaxStart(settings)

    if (!settings.crossDomain) settings.crossDomain = /^([\w-]+:)?\/\/([^\/]+)/.test(settings.url) &&
      RegExp.$2 != window.location.host

    if (!settings.url) settings.url = window.location.toString()
    serializeData(settings)

    var dataType = settings.dataType, hasPlaceholder = /\?.+=\?/.test(settings.url)
    if (hasPlaceholder) dataType = 'jsonp'

    if (settings.cache === false || (
         (!options || options.cache !== true) &&
         ('script' == dataType || 'jsonp' == dataType)
        ))
      settings.url = appendQuery(settings.url, '_=' + Date.now())

    if ('jsonp' == dataType) {
      if (!hasPlaceholder)
        settings.url = appendQuery(settings.url,
          settings.jsonp ? (settings.jsonp + '=?') : settings.jsonp === false ? '' : 'callback=?')
      return $.ajaxJSONP(settings, deferred)
    }

    var mime = settings.accepts[dataType],
        headers = { },
        setHeader = function(name, value) { headers[name.toLowerCase()] = [name, value] },
        protocol = /^([\w-]+:)\/\//.test(settings.url) ? RegExp.$1 : window.location.protocol,
        xhr = settings.xhr(),
        nativeSetHeader = xhr.setRequestHeader,
        abortTimeout

    if (deferred) deferred.promise(xhr)

    if (!settings.crossDomain) setHeader('X-Requested-With', 'XMLHttpRequest')
    setHeader('Accept', mime || '*/*')
    if (mime = settings.mimeType || mime) {
      if (mime.indexOf(',') > -1) mime = mime.split(',', 2)[0]
      xhr.overrideMimeType && xhr.overrideMimeType(mime)
    }
    if (settings.contentType || (settings.contentType !== false && settings.data && settings.type.toUpperCase() != 'GET'))
      setHeader('Content-Type', settings.contentType || 'application/x-www-form-urlencoded')

    if (settings.headers) for (name in settings.headers) setHeader(name, settings.headers[name])
    xhr.setRequestHeader = setHeader

    xhr.onreadystatechange = function(){
      if (xhr.readyState == 4) {
        xhr.onreadystatechange = empty
        clearTimeout(abortTimeout)
        var result, error = false
        if ((xhr.status >= 200 && xhr.status < 300) || xhr.status == 304 || (xhr.status == 0 && protocol == 'file:')) {
          dataType = dataType || mimeToDataType(settings.mimeType || xhr.getResponseHeader('content-type'))
          result = xhr.responseText

          try {
            // http://perfectionkills.com/global-eval-what-are-the-options/
            if (dataType == 'script')    (1,eval)(result)
            else if (dataType == 'xml')  result = xhr.responseXML
            else if (dataType == 'json') result = blankRE.test(result) ? null : $.parseJSON(result)
          } catch (e) { error = e }

          if (error) ajaxError(error, 'parsererror', xhr, settings, deferred)
          else ajaxSuccess(result, xhr, settings, deferred)
        } else {
          ajaxError(xhr.statusText || null, xhr.status ? 'error' : 'abort', xhr, settings, deferred)
        }
      }
    }

    if (ajaxBeforeSend(xhr, settings) === false) {
      xhr.abort()
      ajaxError(null, 'abort', xhr, settings, deferred)
      return xhr
    }

    if (settings.xhrFields) for (name in settings.xhrFields) xhr[name] = settings.xhrFields[name]

    var async = 'async' in settings ? settings.async : true
    xhr.open(settings.type, settings.url, async, settings.username, settings.password)

    for (name in headers) nativeSetHeader.apply(xhr, headers[name])

    if (settings.timeout > 0) abortTimeout = setTimeout(function(){
        xhr.onreadystatechange = empty
        xhr.abort()
        ajaxError(null, 'timeout', xhr, settings, deferred)
      }, settings.timeout)

    // avoid sending empty string (#319)
    xhr.send(settings.data ? settings.data : null)
    return xhr
  }

  // handle optional data/success arguments
  function parseArguments(url, data, success, dataType) {
    if ($.isFunction(data)) dataType = success, success = data, data = undefined
    if (!$.isFunction(success)) dataType = success, success = undefined
    return {
      url: url
    , data: data
    , success: success
    , dataType: dataType
    }
  }

  $.get = function(/* url, data, success, dataType */){
    return $.ajax(parseArguments.apply(null, arguments))
  }

  $.post = function(/* url, data, success, dataType */){
    var options = parseArguments.apply(null, arguments)
    options.type = 'POST'
    return $.ajax(options)
  }

  $.getJSON = function(/* url, data, success */){
    var options = parseArguments.apply(null, arguments)
    options.dataType = 'json'
    return $.ajax(options)
  }

  $.fn.load = function(url, data, success){
    if (!this.length) return this
    var self = this, parts = url.split(/\s/), selector,
        options = parseArguments(url, data, success),
        callback = options.success
    if (parts.length > 1) options.url = parts[0], selector = parts[1]
    options.success = function(response){
      self.html(selector ?
        $('<div>').html(response.replace(rscript, "")).find(selector)
        : response)
      callback && callback.apply(self, arguments)
    }
    $.ajax(options)
    return this
  }

  var escape = encodeURIComponent

  function serialize(params, obj, traditional, scope){
    var type, array = $.isArray(obj), hash = $.isPlainObject(obj)
    $.each(obj, function(key, value) {
      type = $.type(value)
      if (scope) key = traditional ? scope :
        scope + '[' + (hash || type == 'object' || type == 'array' ? key : '') + ']'
      // handle data in serializeArray() format
      if (!scope && array) params.add(value.name, value.value)
      // recurse into nested objects
      else if (type == "array" || (!traditional && type == "object"))
        serialize(params, value, traditional, key)
      else params.add(key, value)
    })
  }

  $.param = function(obj, traditional){
    var params = []
    params.add = function(k, v){ this.push(escape(k) + '=' + escape(v)) }
    serialize(params, obj, traditional)
    return params.join('&').replace(/%20/g, '+')
  }
})(Zepto)

;(function($){
  $.fn.serializeArray = function() {
    var result = [], el
    $([].slice.call(this.get(0).elements)).each(function(){
      el = $(this)
      var type = el.attr('type')
      if (this.nodeName.toLowerCase() != 'fieldset' &&
        !this.disabled && type != 'submit' && type != 'reset' && type != 'button' &&
        ((type != 'radio' && type != 'checkbox') || this.checked))
        result.push({
          name: el.attr('name'),
          value: el.val()
        })
    })
    return result
  }

  $.fn.serialize = function(){
    var result = []
    this.serializeArray().forEach(function(elm){
      result.push(encodeURIComponent(elm.name) + '=' + encodeURIComponent(elm.value))
    })
    return result.join('&')
  }

  $.fn.submit = function(callback) {
    if (callback) this.bind('submit', callback)
    else if (this.length) {
      var event = $.Event('submit')
      this.eq(0).trigger(event)
      if (!event.isDefaultPrevented()) this.get(0).submit()
    }
    return this
  }

})(Zepto)

;(function($){
  // __proto__ doesn't exist on IE<11, so redefine
  // the Z function to use object extension instead
  if (!('__proto__' in {})) {
    $.extend($.zepto, {
      Z: function(dom, selector){
        dom = dom || []
        $.extend(dom, $.fn)
        dom.selector = selector || ''
        dom.__Z = true
        return dom
      },
      // this is a kludge but works
      isZ: function(object){
        return $.type(object) === 'array' && '__Z' in object
      }
    })
  }

  // getComputedStyle shouldn't freak out when called
  // without a valid element as argument
  try {
    getComputedStyle(undefined)
  } catch(e) {
    var nativeGetComputedStyle = getComputedStyle;
    window.getComputedStyle = function(element){
      try {
        return nativeGetComputedStyle(element)
      } catch(e) {
        return null
      }
    }
  }
})(Zepto)

},{}],7:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new TypeError('must start with number, buffer, array or string')

  if (this.length > kMaxLength)
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
      'size: 0x' + kMaxLength.toString(16) + ' bytes')

  var buf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b))
    throw new TypeError('Arguments must be Buffers')

  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) throw new TypeError('Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    case 'hex':
      ret = str.length >>> 1
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    default:
      ret = str.length
  }
  return ret
}

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function (encoding, start, end) {
  var loweredCase = false

  start = start >>> 0
  end = end === undefined || end === Infinity ? this.length : end >>> 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase)
          throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function (b) {
  if(!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max)
      str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length, 2)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new TypeError('Unknown encoding: ' + encoding)
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0)
    throw new RangeError('offset is not uint')
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80))
    return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  if (end < start) throw new TypeError('sourceEnd < sourceStart')
  if (target_start < 0 || target_start >= target.length)
    throw new TypeError('targetStart out of bounds')
  if (start < 0 || start >= source.length) throw new TypeError('sourceStart out of bounds')
  if (end < 0 || end > source.length) throw new TypeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new TypeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new TypeError('start out of bounds')
  if (end < 0 || end > this.length) throw new TypeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length, unitSize) {
  if (unitSize) length -= length % unitSize;
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":3,"ieee754":56,"is-array":59}],8:[function(require,module,exports){
"use strict"

var createThunk = require("./lib/thunk.js")

function Procedure() {
  this.argTypes = []
  this.shimArgs = []
  this.arrayArgs = []
  this.arrayBlockIndices = []
  this.scalarArgs = []
  this.offsetArgs = []
  this.offsetArgIndex = []
  this.indexArgs = []
  this.shapeArgs = []
  this.funcName = ""
  this.pre = null
  this.body = null
  this.post = null
  this.debug = false
}

function compileCwise(user_args) {
  //Create procedure
  var proc = new Procedure()

  //Parse blocks
  proc.pre    = user_args.pre
  proc.body   = user_args.body
  proc.post   = user_args.post

  //Parse arguments
  var proc_args = user_args.args.slice(0)
  proc.argTypes = proc_args
  for(var i=0; i<proc_args.length; ++i) {
    var arg_type = proc_args[i]
    if(arg_type === "array" || (typeof arg_type === "object" && arg_type.blockIndices)) {
      proc.argTypes[i] = "array"
      proc.arrayArgs.push(i)
      proc.arrayBlockIndices.push(arg_type.blockIndices ? arg_type.blockIndices : 0)
      proc.shimArgs.push("array" + i)
      if(i < proc.pre.args.length && proc.pre.args[i].count>0) {
        throw new Error("cwise: pre() block may not reference array args")
      }
      if(i < proc.post.args.length && proc.post.args[i].count>0) {
        throw new Error("cwise: post() block may not reference array args")
      }
    } else if(arg_type === "scalar") {
      proc.scalarArgs.push(i)
      proc.shimArgs.push("scalar" + i)
    } else if(arg_type === "index") {
      proc.indexArgs.push(i)
      if(i < proc.pre.args.length && proc.pre.args[i].count > 0) {
        throw new Error("cwise: pre() block may not reference array index")
      }
      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
        throw new Error("cwise: body() block may not write to array index")
      }
      if(i < proc.post.args.length && proc.post.args[i].count > 0) {
        throw new Error("cwise: post() block may not reference array index")
      }
    } else if(arg_type === "shape") {
      proc.shapeArgs.push(i)
      if(i < proc.pre.args.length && proc.pre.args[i].lvalue) {
        throw new Error("cwise: pre() block may not write to array shape")
      }
      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
        throw new Error("cwise: body() block may not write to array shape")
      }
      if(i < proc.post.args.length && proc.post.args[i].lvalue) {
        throw new Error("cwise: post() block may not write to array shape")
      }
    } else if(typeof arg_type === "object" && arg_type.offset) {
      proc.argTypes[i] = "offset"
      proc.offsetArgs.push({ array: arg_type.array, offset:arg_type.offset })
      proc.offsetArgIndex.push(i)
    } else {
      throw new Error("cwise: Unknown argument type " + proc_args[i])
    }
  }

  //Make sure at least one array argument was specified
  if(proc.arrayArgs.length <= 0) {
    throw new Error("cwise: No array arguments specified")
  }

  //Make sure arguments are correct
  if(proc.pre.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in pre() block")
  }
  if(proc.body.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in body() block")
  }
  if(proc.post.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in post() block")
  }

  //Check debug flag
  proc.debug = !!user_args.printCode || !!user_args.debug

  //Retrieve name
  proc.funcName = user_args.funcName || "cwise"

  //Read in block size
  proc.blockSize = user_args.blockSize || 64

  return createThunk(proc)
}

module.exports = compileCwise

},{"./lib/thunk.js":10}],9:[function(require,module,exports){
"use strict"

var uniq = require("uniq")

// This function generates very simple loops analogous to how you typically traverse arrays (the outermost loop corresponds to the slowest changing index, the innermost loop to the fastest changing index)
// TODO: If two arrays have the same strides (and offsets) there is potential for decreasing the number of "pointers" and related variables. The drawback is that the type signature would become more specific and that there would thus be less potential for caching, but it might still be worth it, especially when dealing with large numbers of arguments.
function innerFill(order, proc, body) {
  var dimension = order.length
    , nargs = proc.arrayArgs.length
    , has_index = proc.indexArgs.length>0
    , code = []
    , vars = []
    , idx=0, pidx=0, i, j
  for(i=0; i<dimension; ++i) { // Iteration variables
    vars.push(["i",i,"=0"].join(""))
  }
  //Compute scan deltas
  for(j=0; j<nargs; ++j) {
    for(i=0; i<dimension; ++i) {
      pidx = idx
      idx = order[i]
      if(i === 0) { // The innermost/fastest dimension's delta is simply its stride
        vars.push(["d",j,"s",i,"=t",j,"p",idx].join(""))
      } else { // For other dimensions the delta is basically the stride minus something which essentially "rewinds" the previous (more inner) dimension
        vars.push(["d",j,"s",i,"=(t",j,"p",idx,"-s",pidx,"*t",j,"p",pidx,")"].join(""))
      }
    }
  }
  code.push("var " + vars.join(","))
  //Scan loop
  for(i=dimension-1; i>=0; --i) { // Start at largest stride and work your way inwards
    idx = order[i]
    code.push(["for(i",i,"=0;i",i,"<s",idx,";++i",i,"){"].join(""))
  }
  //Push body of inner loop
  code.push(body)
  //Advance scan pointers
  for(i=0; i<dimension; ++i) {
    pidx = idx
    idx = order[i]
    for(j=0; j<nargs; ++j) {
      code.push(["p",j,"+=d",j,"s",i].join(""))
    }
    if(has_index) {
      if(i > 0) {
        code.push(["index[",pidx,"]-=s",pidx].join(""))
      }
      code.push(["++index[",idx,"]"].join(""))
    }
    code.push("}")
  }
  return code.join("\n")
}

// Generate "outer" loops that loop over blocks of data, applying "inner" loops to the blocks by manipulating the local variables in such a way that the inner loop only "sees" the current block.
// TODO: If this is used, then the previous declaration (done by generateCwiseOp) of s* is essentially unnecessary.
//       I believe the s* are not used elsewhere (in particular, I don't think they're used in the pre/post parts and "shape" is defined independently), so it would be possible to make defining the s* dependent on what loop method is being used.
function outerFill(matched, order, proc, body) {
  var dimension = order.length
    , nargs = proc.arrayArgs.length
    , blockSize = proc.blockSize
    , has_index = proc.indexArgs.length > 0
    , code = []
  for(var i=0; i<nargs; ++i) {
    code.push(["var offset",i,"=p",i].join(""))
  }
  //Generate loops for unmatched dimensions
  // The order in which these dimensions are traversed is fairly arbitrary (from small stride to large stride, for the first argument)
  // TODO: It would be nice if the order in which these loops are placed would also be somehow "optimal" (at the very least we should check that it really doesn't hurt us if they're not).
  for(var i=matched; i<dimension; ++i) {
    code.push(["for(var j"+i+"=SS[", order[i], "]|0;j", i, ">0;){"].join("")) // Iterate back to front
    code.push(["if(j",i,"<",blockSize,"){"].join("")) // Either decrease j by blockSize (s = blockSize), or set it to zero (after setting s = j).
    code.push(["s",order[i],"=j",i].join(""))
    code.push(["j",i,"=0"].join(""))
    code.push(["}else{s",order[i],"=",blockSize].join(""))
    code.push(["j",i,"-=",blockSize,"}"].join(""))
    if(has_index) {
      code.push(["index[",order[i],"]=j",i].join(""))
    }
  }
  for(var i=0; i<nargs; ++i) {
    var indexStr = ["offset"+i]
    for(var j=matched; j<dimension; ++j) {
      indexStr.push(["j",j,"*t",i,"p",order[j]].join(""))
    }
    code.push(["p",i,"=(",indexStr.join("+"),")"].join(""))
  }
  code.push(innerFill(order, proc, body))
  for(var i=matched; i<dimension; ++i) {
    code.push("}")
  }
  return code.join("\n")
}

//Count the number of compatible inner orders
// This is the length of the longest common prefix of the arrays in orders.
// Each array in orders lists the dimensions of the correspond ndarray in order of increasing stride.
// This is thus the maximum number of dimensions that can be efficiently traversed by simple nested loops for all arrays.
function countMatches(orders) {
  var matched = 0, dimension = orders[0].length
  while(matched < dimension) {
    for(var j=1; j<orders.length; ++j) {
      if(orders[j][matched] !== orders[0][matched]) {
        return matched
      }
    }
    ++matched
  }
  return matched
}

//Processes a block according to the given data types
// Replaces variable names by different ones, either "local" ones (that are then ferried in and out of the given array) or ones matching the arguments that the function performing the ultimate loop will accept.
function processBlock(block, proc, dtypes) {
  var code = block.body
  var pre = []
  var post = []
  for(var i=0; i<block.args.length; ++i) {
    var carg = block.args[i]
    if(carg.count <= 0) {
      continue
    }
    var re = new RegExp(carg.name, "g")
    var ptrStr = ""
    var arrNum = proc.arrayArgs.indexOf(i)
    switch(proc.argTypes[i]) {
      case "offset":
        var offArgIndex = proc.offsetArgIndex.indexOf(i)
        var offArg = proc.offsetArgs[offArgIndex]
        arrNum = offArg.array
        ptrStr = "+q" + offArgIndex // Adds offset to the "pointer" in the array
      case "array":
        ptrStr = "p" + arrNum + ptrStr
        var localStr = "l" + i
        var arrStr = "a" + arrNum
        if (proc.arrayBlockIndices[arrNum] === 0) { // Argument to body is just a single value from this array
          if(carg.count === 1) { // Argument/array used only once(?)
            if(dtypes[arrNum] === "generic") {
              if(carg.lvalue) {
                pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")) // Is this necessary if the argument is ONLY used as an lvalue? (keep in mind that we can have a += something, so we would actually need to check carg.rvalue)
                code = code.replace(re, localStr)
                post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
              } else {
                code = code.replace(re, [arrStr, ".get(", ptrStr, ")"].join(""))
              }
            } else {
              code = code.replace(re, [arrStr, "[", ptrStr, "]"].join(""))
            }
          } else if(dtypes[arrNum] === "generic") {
            pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")) // TODO: Could we optimize by checking for carg.rvalue?
            code = code.replace(re, localStr)
            if(carg.lvalue) {
              post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
            }
          } else {
            pre.push(["var ", localStr, "=", arrStr, "[", ptrStr, "]"].join("")) // TODO: Could we optimize by checking for carg.rvalue?
            code = code.replace(re, localStr)
            if(carg.lvalue) {
              post.push([arrStr, "[", ptrStr, "]=", localStr].join(""))
            }
          }
        } else { // Argument to body is a "block"
          var reStrArr = [carg.name], ptrStrArr = [ptrStr]
          for(var j=0; j<Math.abs(proc.arrayBlockIndices[arrNum]); j++) {
            reStrArr.push("\\s*\\[([^\\]]+)\\]")
            ptrStrArr.push("$" + (j+1) + "*t" + arrNum + "b" + j) // Matched index times stride
          }
          re = new RegExp(reStrArr.join(""), "g")
          ptrStr = ptrStrArr.join("+")
          if(dtypes[arrNum] === "generic") {
            /*if(carg.lvalue) {
              pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")) // Is this necessary if the argument is ONLY used as an lvalue? (keep in mind that we can have a += something, so we would actually need to check carg.rvalue)
              code = code.replace(re, localStr)
              post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
            } else {
              code = code.replace(re, [arrStr, ".get(", ptrStr, ")"].join(""))
            }*/
            throw new Error("cwise: Generic arrays not supported in combination with blocks!")
          } else {
            // This does not produce any local variables, even if variables are used multiple times. It would be possible to do so, but it would complicate things quite a bit.
            code = code.replace(re, [arrStr, "[", ptrStr, "]"].join(""))
          }
        }
      break
      case "scalar":
        code = code.replace(re, "Y" + proc.scalarArgs.indexOf(i))
      break
      case "index":
        code = code.replace(re, "index")
      break
      case "shape":
        code = code.replace(re, "shape")
      break
    }
  }
  return [pre.join("\n"), code, post.join("\n")].join("\n").trim()
}

function typeSummary(dtypes) {
  var summary = new Array(dtypes.length)
  var allEqual = true
  for(var i=0; i<dtypes.length; ++i) {
    var t = dtypes[i]
    var digits = t.match(/\d+/)
    if(!digits) {
      digits = ""
    } else {
      digits = digits[0]
    }
    if(t.charAt(0) === 0) {
      summary[i] = "u" + t.charAt(1) + digits
    } else {
      summary[i] = t.charAt(0) + digits
    }
    if(i > 0) {
      allEqual = allEqual && summary[i] === summary[i-1]
    }
  }
  if(allEqual) {
    return summary[0]
  }
  return summary.join("")
}

//Generates a cwise operator
function generateCWiseOp(proc, typesig) {

  //Compute dimension
  // Arrays get put first in typesig, and there are two entries per array (dtype and order), so this gets the number of dimensions in the first array arg.
  var dimension = (typesig[1].length - Math.abs(proc.arrayBlockIndices[0]))|0
  var orders = new Array(proc.arrayArgs.length)
  var dtypes = new Array(proc.arrayArgs.length)
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    dtypes[i] = typesig[2*i]
    orders[i] = typesig[2*i+1]
  }

  //Determine where block and loop indices start and end
  var blockBegin = [], blockEnd = [] // These indices are exposed as blocks
  var loopBegin = [], loopEnd = [] // These indices are iterated over
  var loopOrders = [] // orders restricted to the loop indices
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    if (proc.arrayBlockIndices[i]<0) {
      loopBegin.push(0)
      loopEnd.push(dimension)
      blockBegin.push(dimension)
      blockEnd.push(dimension+proc.arrayBlockIndices[i])
    } else {
      loopBegin.push(proc.arrayBlockIndices[i]) // Non-negative
      loopEnd.push(proc.arrayBlockIndices[i]+dimension)
      blockBegin.push(0)
      blockEnd.push(proc.arrayBlockIndices[i])
    }
    var newOrder = []
    for(var j=0; j<orders[i].length; j++) {
      if (loopBegin[i]<=orders[i][j] && orders[i][j]<loopEnd[i]) {
        newOrder.push(orders[i][j]-loopBegin[i]) // If this is a loop index, put it in newOrder, subtracting loopBegin, to make sure that all loopOrders are using a common set of indices.
      }
    }
    loopOrders.push(newOrder)
  }

  //First create arguments for procedure
  var arglist = ["SS"] // SS is the overall shape over which we iterate
  var code = ["'use strict'"]
  var vars = []

  for(var j=0; j<dimension; ++j) {
    vars.push(["s", j, "=SS[", j, "]"].join("")) // The limits for each dimension.
  }
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    arglist.push("a"+i) // Actual data array
    arglist.push("t"+i) // Strides
    arglist.push("p"+i) // Offset in the array at which the data starts (also used for iterating over the data)

    for(var j=0; j<dimension; ++j) { // Unpack the strides into vars for looping
      vars.push(["t",i,"p",j,"=t",i,"[",loopBegin[i]+j,"]"].join(""))
    }

    for(var j=0; j<Math.abs(proc.arrayBlockIndices[i]); ++j) { // Unpack the strides into vars for block iteration
      vars.push(["t",i,"b",j,"=t",i,"[",blockBegin[i]+j,"]"].join(""))
    }
  }
  for(var i=0; i<proc.scalarArgs.length; ++i) {
    arglist.push("Y" + i)
  }
  if(proc.shapeArgs.length > 0) {
    vars.push("shape=SS.slice(0)") // Makes the shape over which we iterate available to the user defined functions (so you can use width/height for example)
  }
  if(proc.indexArgs.length > 0) {
    // Prepare an array to keep track of the (logical) indices, initialized to dimension zeroes.
    var zeros = new Array(dimension)
    for(var i=0; i<dimension; ++i) {
      zeros[i] = "0"
    }
    vars.push(["index=[", zeros.join(","), "]"].join(""))
  }
  for(var i=0; i<proc.offsetArgs.length; ++i) { // Offset arguments used for stencil operations
    var off_arg = proc.offsetArgs[i]
    var init_string = []
    for(var j=0; j<off_arg.offset.length; ++j) {
      if(off_arg.offset[j] === 0) {
        continue
      } else if(off_arg.offset[j] === 1) {
        init_string.push(["t", off_arg.array, "p", j].join(""))
      } else {
        init_string.push([off_arg.offset[j], "*t", off_arg.array, "p", j].join(""))
      }
    }
    if(init_string.length === 0) {
      vars.push("q" + i + "=0")
    } else {
      vars.push(["q", i, "=", init_string.join("+")].join(""))
    }
  }

  //Prepare this variables
  var thisVars = uniq([].concat(proc.pre.thisVars)
                      .concat(proc.body.thisVars)
                      .concat(proc.post.thisVars))
  vars = vars.concat(thisVars)
  code.push("var " + vars.join(","))
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    code.push("p"+i+"|=0")
  }

  //Inline prelude
  if(proc.pre.body.length > 3) {
    code.push(processBlock(proc.pre, proc, dtypes))
  }

  //Process body
  var body = processBlock(proc.body, proc, dtypes)
  var matched = countMatches(loopOrders)
  if(matched < dimension) {
    code.push(outerFill(matched, loopOrders[0], proc, body)) // TODO: Rather than passing loopOrders[0], it might be interesting to look at passing an order that represents the majority of the arguments for example.
  } else {
    code.push(innerFill(loopOrders[0], proc, body))
  }

  //Inline epilog
  if(proc.post.body.length > 3) {
    code.push(processBlock(proc.post, proc, dtypes))
  }

  if(proc.debug) {
    console.log("-----Generated cwise routine for ", typesig, ":\n" + code.join("\n") + "\n----------")
  }

  var loopName = [(proc.funcName||"unnamed"), "_cwise_loop_", orders[0].join("s"),"m",matched,typeSummary(dtypes)].join("")
  var f = new Function(["function ",loopName,"(", arglist.join(","),"){", code.join("\n"),"} return ", loopName].join(""))
  return f()
}
module.exports = generateCWiseOp

},{"uniq":65}],10:[function(require,module,exports){
"use strict"

// The function below is called when constructing a cwise function object, and does the following:
// A function object is constructed which accepts as argument a compilation function and returns another function.
// It is this other function that is eventually returned by createThunk, and this function is the one that actually
// checks whether a certain pattern of arguments has already been used before and compiles new loops as needed.
// The compilation passed to the first function object is used for compiling new functions.
// Once this function object is created, it is called with compile as argument, where the first argument of compile
// is bound to "proc" (essentially containing a preprocessed version of the user arguments to cwise).
// So createThunk roughly works like this:
// function createThunk(proc) {
//   var thunk = function(compileBound) {
//     var CACHED = {}
//     return function(arrays and scalars) {
//       if (dtype and order of arrays in CACHED) {
//         var func = CACHED[dtype and order of arrays]
//       } else {
//         var func = CACHED[dtype and order of arrays] = compileBound(dtype and order of arrays)
//       }
//       return func(arrays and scalars)
//     }
//   }
//   return thunk(compile.bind1(proc))
// }

var compile = require("./compile.js")

function createThunk(proc) {
  var code = ["'use strict'", "var CACHED={}"]
  var vars = []
  var thunkName = proc.funcName + "_cwise_thunk"

  //Build thunk
  code.push(["return function ", thunkName, "(", proc.shimArgs.join(","), "){"].join(""))
  var typesig = []
  var string_typesig = []
  var proc_args = [["array",proc.arrayArgs[0],".shape.slice(", // Slice shape so that we only retain the shape over which we iterate (which gets passed to the cwise operator as SS).
                    Math.max(0,proc.arrayBlockIndices[0]),proc.arrayBlockIndices[0]<0?(","+proc.arrayBlockIndices[0]+")"):")"].join("")]
  var shapeLengthConditions = [], shapeConditions = []
  // Process array arguments
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    var j = proc.arrayArgs[i]
    vars.push(["t", j, "=array", j, ".dtype,",
               "r", j, "=array", j, ".order"].join(""))
    typesig.push("t" + j)
    typesig.push("r" + j)
    string_typesig.push("t"+j)
    string_typesig.push("r"+j+".join()")
    proc_args.push("array" + j + ".data")
    proc_args.push("array" + j + ".stride")
    proc_args.push("array" + j + ".offset|0")
    if (i>0) { // Gather conditions to check for shape equality (ignoring block indices)
      shapeLengthConditions.push("array" + proc.arrayArgs[0] + ".shape.length===array" + j + ".shape.length+" + (Math.abs(proc.arrayBlockIndices[0])-Math.abs(proc.arrayBlockIndices[i])))
      shapeConditions.push("array" + proc.arrayArgs[0] + ".shape[shapeIndex+" + Math.max(0,proc.arrayBlockIndices[0]) + "]===array" + j + ".shape[shapeIndex+" + Math.max(0,proc.arrayBlockIndices[i]) + "]")
    }
  }
  // Check for shape equality
  if (proc.arrayArgs.length > 1) {
    code.push("if (!(" + shapeLengthConditions.join(" && ") + ")) throw new Error('cwise: Arrays do not all have the same dimensionality!')")
    code.push("for(var shapeIndex=array" + proc.arrayArgs[0] + ".shape.length-" + Math.abs(proc.arrayBlockIndices[0]) + "; shapeIndex-->0;) {")
    code.push("if (!(" + shapeConditions.join(" && ") + ")) throw new Error('cwise: Arrays do not all have the same shape!')")
    code.push("}")
  }
  // Process scalar arguments
  for(var i=0; i<proc.scalarArgs.length; ++i) {
    proc_args.push("scalar" + proc.scalarArgs[i])
  }
  // Check for cached function (and if not present, generate it)
  vars.push(["type=[", string_typesig.join(","), "].join()"].join(""))
  vars.push("proc=CACHED[type]")
  code.push("var " + vars.join(","))

  code.push(["if(!proc){",
             "CACHED[type]=proc=compile([", typesig.join(","), "])}",
             "return proc(", proc_args.join(","), ")}"].join(""))

  if(proc.debug) {
    console.log("-----Generated thunk:\n" + code.join("\n") + "\n----------")
  }

  //Compile thunk
  var thunk = new Function("compile", code.join("\n"))
  return thunk(compile.bind(undefined, proc))
}

module.exports = createThunk

},{"./compile.js":9}],11:[function(require,module,exports){
/*!
  * domready (c) Dustin Diaz 2014 - License MIT
  */
!function (name, definition) {

  if (typeof module != 'undefined') module.exports = definition()
  else if (typeof define == 'function' && typeof define.amd == 'object') define(definition)
  else this[name] = definition()

}('domready', function () {

  var fns = [], listener
    , doc = document
    , hack = doc.documentElement.doScroll
    , domContentLoaded = 'DOMContentLoaded'
    , loaded = (hack ? /^loaded|^c/ : /^loaded|^i|^c/).test(doc.readyState)


  if (!loaded)
  doc.addEventListener(domContentLoaded, listener = function () {
    doc.removeEventListener(domContentLoaded, listener)
    loaded = 1
    while (listener = fns.shift()) listener()
  })

  return function (fn) {
    loaded ? setTimeout(fn, 0) : fns.push(fn)
  }

});

},{}],12:[function(require,module,exports){
"use strict"

function dupe_array(count, value, i) {
  var c = count[i]|0
  if(c <= 0) {
    return []
  }
  var result = new Array(c), j
  if(i === count.length-1) {
    for(j=0; j<c; ++j) {
      result[j] = value
    }
  } else {
    for(j=0; j<c; ++j) {
      result[j] = dupe_array(count, value, i+1)
    }
  }
  return result
}

function dupe_number(count, value) {
  var result, i
  result = new Array(count)
  for(i=0; i<count; ++i) {
    result[i] = value
  }
  return result
}

function dupe(count, value) {
  if(typeof value === "undefined") {
    value = 0
  }
  switch(typeof count) {
    case "number":
      if(count > 0) {
        return dupe_number(count|0, value)
      }
    break
    case "object":
      if(typeof (count.length) === "number") {
        return dupe_array(count, value, 0)
      }
    break
  }
  return []
}

module.exports = dupe
},{}],13:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],14:[function(require,module,exports){
if(typeof window.performance === "object") {
  if(window.performance.now) {
    module.exports = function() { return window.performance.now() }
  } else if(window.performance.webkitNow) {
    module.exports = function() { return window.performance.webkitNow() }
  }
} else if(Date.now) {
  module.exports = Date.now
} else {
  module.exports = function() { return (new Date()).getTime() }
}

},{}],15:[function(require,module,exports){
//Adapted from here: https://developer.mozilla.org/en-US/docs/Web/Reference/Events/wheel?redirectlocale=en-US&redirectslug=DOM%2FMozilla_event_reference%2Fwheel

var prefix = "", _addEventListener, onwheel, support;

// detect event model
if ( window.addEventListener ) {
  _addEventListener = "addEventListener";
} else {
  _addEventListener = "attachEvent";
  prefix = "on";
}

// detect available wheel event
support = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
          document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE support at least "mousewheel"
          "DOMMouseScroll"; // let's assume that remaining browsers are older Firefox

function _addWheelListener( elem, eventName, callback, useCapture ) {
  elem[ _addEventListener ]( prefix + eventName, support == "wheel" ? callback : function( originalEvent ) {
    !originalEvent && ( originalEvent = window.event );

    // create a normalized event object
    var event = {
      // keep a ref to the original event object
      originalEvent: originalEvent,
      target: originalEvent.target || originalEvent.srcElement,
      type: "wheel",
      deltaMode: originalEvent.type == "MozMousePixelScroll" ? 0 : 1,
      deltaX: 0,
      delatZ: 0,
      preventDefault: function() {
        originalEvent.preventDefault ?
          originalEvent.preventDefault() :
          originalEvent.returnValue = false;
      }
    };

    // calculate deltaY (and deltaX) according to the event
    if ( support == "mousewheel" ) {
      event.deltaY = - 1/40 * originalEvent.wheelDelta;
      // Webkit also support wheelDeltaX
      originalEvent.wheelDeltaX && ( event.deltaX = - 1/40 * originalEvent.wheelDeltaX );
    } else {
      event.deltaY = originalEvent.detail;
    }

    // it's time to fire the callback
    return callback( event );
  }, useCapture || false );
}

module.exports = function( elem, callback, useCapture ) {
  _addWheelListener( elem, support, callback, useCapture );

  // handle MozMousePixelScroll in older Firefox
  if( support == "DOMMouseScroll" ) {
    _addWheelListener( elem, "MozMousePixelScroll", callback, useCapture );
  }
};
},{}],16:[function(require,module,exports){
// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

// requestAnimationFrame polyfill by Erik MÃ¶ller. fixes from Paul Irish and Tino Zijdel

// MIT license
var lastTime = 0;
var vendors = ['ms', 'moz', 'webkit', 'o'];
for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
                               || window[vendors[x]+'CancelRequestAnimationFrame'];
}

if (!window.requestAnimationFrame)
    window.requestAnimationFrame = function(callback, element) {
        var currTime = new Date().getTime();
        var timeToCall = Math.max(0, 16 - (currTime - lastTime));
        var id = window.setTimeout(function() { callback(currTime + timeToCall); },
          timeToCall);
        lastTime = currTime + timeToCall;
        return id;
    };

if (!window.cancelAnimationFrame)
    window.cancelAnimationFrame = function(id) {
        clearTimeout(id);
    };

},{}],17:[function(require,module,exports){
"use strict"

var EventEmitter = require("events").EventEmitter
  , util         = require("util")
  , domready     = require("domready")
  , vkey         = require("vkey")
  , invert       = require("invert-hash")
  , uniq         = require("uniq")
  , bsearch      = require("binary-search-bounds")
  , iota         = require("iota-array")
  , min          = Math.min

//Browser compatibility hacks
require("./lib/raf-polyfill.js")
var addMouseWheel = require("./lib/mousewheel-polyfill.js")
var hrtime = require("./lib/hrtime-polyfill.js")

//Remove angle braces and other useless crap
var filtered_vkey = (function() {
  var result = new Array(256)
    , i, j, k
  for(i=0; i<256; ++i) {
    result[i] = "UNK"
  }
  for(i in vkey) {
    k = vkey[i]
    if(k.charAt(0) === '<' && k.charAt(k.length-1) === '>') {
      k = k.substring(1, k.length-1)
    }
    k = k.replace(/\s/g, "-")
    result[parseInt(i)] = k
  }
  return result
})()

//Compute minimal common set of keyboard functions
var keyNames = uniq(Object.keys(invert(filtered_vkey)))

//Translates a virtual keycode to a normalized keycode
function virtualKeyCode(key) {
  return bsearch.eq(keyNames, key)
}

//Maps a physical keycode to a normalized keycode
function physicalKeyCode(key) {
  return virtualKeyCode(filtered_vkey[key])
}

//Game shell
function GameShell() {
  EventEmitter.call(this)
  this._curKeyState  = new Array(keyNames.length)
  this._pressCount   = new Array(keyNames.length)
  this._releaseCount = new Array(keyNames.length)

  this._tickInterval = null
  this._rafHandle = null
  this._tickRate = 0
  this._lastTick = hrtime()
  this._frameTime = 0.0
  this._paused = true
  this._width = 0
  this._height = 0

  this._wantFullscreen = false
  this._wantPointerLock = false
  this._fullscreenActive = false
  this._pointerLockActive = false

  this._render = render.bind(undefined, this)

  this.preventDefaults = true
  this.stopPropagation = false

  for(var i=0; i<keyNames.length; ++i) {
    this._curKeyState[i] = false
    this._pressCount[i] = this._releaseCount[i] = 0
  }

  //Public members
  this.element = null
  this.bindings = {}
  this.frameSkip = 100.0
  this.tickCount = 0
  this.frameCount = 0
  this.startTime = hrtime()
  this.tickTime = this._tickRate
  this.frameTime = 10.0
  this.stickyFullscreen = false
  this.stickyPointerLock = false

  //Scroll stuff
  this.scroll = [0,0,0]

  //Mouse state
  this.mouseX = 0
  this.mouseY = 0
  this.prevMouseX = 0
  this.prevMouseY = 0
}

util.inherits(GameShell, EventEmitter)

var proto = GameShell.prototype

//Bind keynames
proto.keyNames = keyNames

//Binds a virtual keyboard event to a physical key
proto.bind = function(virtual_key) {
  //Look up previous key bindings
  var arr
  if(virtual_key in this.bindings) {
    arr = this.bindings[virtual_key]
  } else {
    arr = []
  }
  //Add keys to list
  var physical_key
  for(var i=1, n=arguments.length; i<n; ++i) {
    physical_key = arguments[i]
    if(virtualKeyCode(physical_key) >= 0) {
      arr.push(physical_key)
    } else if(physical_key in this.bindings) {
      var keybinds = this.bindings[physical_key]
      for(var j=0; j<keybinds.length; ++j) {
        arr.push(keybinds[j])
      }
    }
  }
  //Remove any duplicate keys
  arr = uniq(arr)
  if(arr.length > 0) {
    this.bindings[virtual_key] = arr
  }
  this.emit('bind', virtual_key, arr)
}

//Unbinds a virtual keyboard event
proto.unbind = function(virtual_key) {
  if(virtual_key in this.bindings) {
    delete this.bindings[virtual_key]
  }
  this.emit('unbind', virtual_key)
}

//Checks if a key is set in a given state
function lookupKey(state, bindings, key) {
  if(key in bindings) {
    var arr = bindings[key]
    for(var i=0, n=arr.length; i<n; ++i) {
      if(state[virtualKeyCode(arr[i])]) {
        return true
      }
    }
    return false
  }
  var kc = virtualKeyCode(key)
  if(kc >= 0) {
    return state[kc]
  }
  return false
}

//Checks if a key is set in a given state
function lookupCount(state, bindings, key) {
  if(key in bindings) {
    var arr = bindings[key], r = 0
    for(var i=0, n=arr.length; i<n; ++i) {
      r += state[virtualKeyCode(arr[i])]
    }
    return r
  }
  var kc = virtualKeyCode(key)
  if(kc >= 0) {
    return state[kc]
  }
  return 0
}

//Checks if a key (either physical or virtual) is currently held down
proto.down = function(key) {
  return lookupKey(this._curKeyState, this.bindings, key)
}

//Checks if a key was ever down
proto.wasDown = function(key) {
  return this.down(key) || !!this.press(key)
}

//Opposite of down
proto.up = function(key) {
  return !this.down(key)
}

//Checks if a key was released during previous frame
proto.wasUp = function(key) {
  return this.up(key) || !!this.release(key)
}

//Returns the number of times a key was pressed since last tick
proto.press = function(key) {
  return lookupCount(this._pressCount, this.bindings, key)
}

//Returns the number of times a key was released since last tick
proto.release = function(key) {
  return lookupCount(this._releaseCount, this.bindings, key)
}

//Pause/unpause the game loop
Object.defineProperty(proto, "paused", {
  get: function() {
    return this._paused
  },
  set: function(state) {
    var ns = !!state
    if(ns !== this._paused) {
      if(!this._paused) {
        this._paused = true
        this._frameTime = min(1.0, (hrtime() - this._lastTick) / this._tickRate)
        clearInterval(this._tickInterval)
        //cancelAnimationFrame(this._rafHandle)
      } else {
        this._paused = false
        this._lastTick = hrtime() - Math.floor(this._frameTime * this._tickRate)
        this._tickInterval = setInterval(tick, this._tickRate, this)
        this._rafHandle = requestAnimationFrame(this._render)
      }
    }
  }
})

//Fullscreen state toggle

function tryFullscreen(shell) {
  //Request full screen
  var elem = shell.element

  if(shell._wantFullscreen && !shell._fullscreenActive) {
    var fs = elem.requestFullscreen ||
             elem.requestFullScreen ||
             elem.webkitRequestFullscreen ||
             elem.webkitRequestFullScreen ||
             elem.mozRequestFullscreen ||
             elem.mozRequestFullScreen ||
             function() {}
    fs.call(elem)
  }
  if(shell._wantPointerLock && !shell._pointerLockActive) {
    var pl =  elem.requestPointerLock ||
              elem.webkitRequestPointerLock ||
              elem.mozRequestPointerLock ||
              elem.msRequestPointerLock ||
              elem.oRequestPointerLock ||
              function() {}
    pl.call(elem)
  }
}

var cancelFullscreen = document.exitFullscreen ||
                       document.cancelFullscreen ||  //Why can no one agree on this?
                       document.cancelFullScreen ||
                       document.webkitCancelFullscreen ||
                       document.webkitCancelFullScreen ||
                       document.mozCancelFullscreen ||
                       document.mozCancelFullScreen ||
                       function(){}

Object.defineProperty(proto, "fullscreen", {
  get: function() {
    return this._fullscreenActive
  },
  set: function(state) {
    var ns = !!state
    if(!ns) {
      this._wantFullscreen = false
      cancelFullscreen.call(document)
    } else {
      this._wantFullscreen = true
      tryFullscreen(this)
    }
    return this._fullscreenActive
  }
})

function handleFullscreen(shell) {
  shell._fullscreenActive = document.fullscreen ||
                            document.mozFullScreen ||
                            document.webkitIsFullScreen ||
                            false
  if(!shell.stickyFullscreen && shell._fullscreenActive) {
    shell._wantFullscreen = false
  }
}

//Pointer lock state toggle
var exitPointerLock = document.exitPointerLock ||
                      document.webkitExitPointerLock ||
                      document.mozExitPointerLock ||
                      function() {}

Object.defineProperty(proto, "pointerLock", {
  get: function() {
    return this._pointerLockActive
  },
  set: function(state) {
    var ns = !!state
    if(!ns) {
      this._wantPointerLock = false
      exitPointerLock.call(document)
    } else {
      this._wantPointerLock = true
      tryFullscreen(this)
    }
    return this._pointerLockActive
  }
})

function handlePointerLockChange(shell, event) {
  shell._pointerLockActive = shell.element === (
      document.pointerLockElement ||
      document.mozPointerLockElement ||
      document.webkitPointerLockElement ||
      null)
  if(!shell.stickyPointerLock && shell._pointerLockActive) {
    shell._wantPointerLock = false
  }
}

//Width and height
Object.defineProperty(proto, "width", {
  get: function() {
    return this.element.clientWidth
  }
})
Object.defineProperty(proto, "height", {
  get: function() {
    return this.element.clientHeight
  }
})

//Set key state
function setKeyState(shell, key, state) {
  var ps = shell._curKeyState[key]
  if(ps !== state) {
    if(state) {
      shell._pressCount[key]++
    } else {
      shell._releaseCount[key]++
    }
    shell._curKeyState[key] = state
  }
}

//Ticks the game state one update
function tick(shell) {
  var skip = hrtime() + shell.frameSkip
    , pCount = shell._pressCount
    , rCount = shell._releaseCount
    , i, s, t
    , tr = shell._tickRate
    , n = keyNames.length
  while(!shell._paused &&
        hrtime() >= shell._lastTick + tr) {

    //Skip frames if we are over budget
    if(hrtime() > skip) {
      shell._lastTick = hrtime() + tr
      return
    }

    //Tick the game
    s = hrtime()
    shell.emit("tick")
    t = hrtime()
    shell.tickTime = t - s

    //Update counters and time
    ++shell.tickCount
    shell._lastTick += tr

    //Shift input state
    for(i=0; i<n; ++i) {
      pCount[i] = rCount[i] = 0
    }
    if(shell._pointerLockActive) {
      shell.prevMouseX = shell.mouseX = shell.width>>1
      shell.prevMouseY = shell.mouseY = shell.height>>1
    } else {
      shell.prevMouseX = shell.mouseX
      shell.prevMouseY = shell.mouseY
    }
    shell.scroll[0] = shell.scroll[1] = shell.scroll[2] = 0
  }
}

//Render stuff
function render(shell) {

  //Request next frame
  shell._rafHandle = requestAnimationFrame(shell._render)

  //Tick the shell
  tick(shell)

  //Compute frame time
  var dt
  if(shell._paused) {
    dt = shell._frameTime
  } else {
    dt = min(1.0, (hrtime() - shell._lastTick) / shell._tickRate)
  }

  //Draw a frame
  ++shell.frameCount
  var s = hrtime()
  shell.emit("render", dt)
  var t = hrtime()
  shell.frameTime = t - s

}

function isFocused(shell) {
  return (document.activeElement === document.body) ||
         (document.activeElement === shell.element)
}

function handleEvent(shell, ev) {
  if(shell.preventDefaults) {
    ev.preventDefault()
  }
  if(shell.stopPropagation) {
    ev.stopPropagation()
  }
}

//Set key up
function handleKeyUp(shell, ev) {
  handleEvent(shell, ev)
  var kc = physicalKeyCode(ev.keyCode || ev.char || ev.which || ev.charCode)
  if(kc >= 0) {
    setKeyState(shell, kc, false)
  }
}

//Set key down
function handleKeyDown(shell, ev) {
  if(!isFocused(shell)) {
    return
  }
  handleEvent(shell, ev)
  if(ev.metaKey) {
    //Hack: Clear key state when meta gets pressed to prevent keys sticking
    handleBlur(shell, ev)
  } else {
    var kc = physicalKeyCode(ev.keyCode || ev.char || ev.which || ev.charCode)
    if(kc >= 0) {
      setKeyState(shell, kc, true)
    }
  }
}

//Mouse events are really annoying
var mouseCodes = iota(32).map(function(n) {
  return virtualKeyCode("mouse-" + (n+1))
})

function setMouseButtons(shell, buttons) {
  for(var i=0; i<32; ++i) {
    setKeyState(shell, mouseCodes[i], !!(buttons & (1<<i)))
  }
}

function handleMouseMove(shell, ev) {
  handleEvent(shell, ev)
  if(shell._pointerLockActive) {
    var movementX = ev.movementX       ||
                    ev.mozMovementX    ||
                    ev.webkitMovementX ||
                    0,
        movementY = ev.movementY       ||
                    ev.mozMovementY    ||
                    ev.webkitMovementY ||
                    0
    shell.mouseX += movementX
    shell.mouseY += movementY
  } else {
    shell.mouseX = ev.clientX - shell.element.offsetLeft
    shell.mouseY = ev.clientY - shell.element.offsetTop
  }
  return false
}

function handleMouseDown(shell, ev) {
  handleEvent(shell, ev)
  setKeyState(shell, mouseCodes[ev.button], true)
  return false
}

function handleMouseUp(shell, ev) {
  handleEvent(shell, ev)
  setKeyState(shell, mouseCodes[ev.button], false)
  return false
}

function handleMouseEnter(shell, ev) {
  handleEvent(shell, ev)
  if(shell._pointerLockActive) {
    shell.prevMouseX = shell.mouseX = shell.width>>1
    shell.prevMouseY = shell.mouseY = shell.height>>1
  } else {
    shell.prevMouseX = shell.mouseX = ev.clientX - shell.element.offsetLeft
    shell.prevMouseY = shell.mouseY = ev.clientY - shell.element.offsetTop
  }
  return false
}

function handleMouseLeave(shell, ev) {
  handleEvent(shell, ev)
  setMouseButtons(shell, 0)
  return false
}

//Handle mouse wheel events
function handleMouseWheel(shell, ev) {
  handleEvent(shell, ev)
  var scale = 1
  switch(ev.deltaMode) {
    case 0: //Pixel
      scale = 1
    break
    case 1: //Line
      scale = 12
    break
    case 2: //Page
       scale = shell.height
    break
  }
  //Add scroll
  shell.scroll[0] +=  ev.deltaX * scale
  shell.scroll[1] +=  ev.deltaY * scale
  shell.scroll[2] += (ev.deltaZ * scale)||0.0
  return false
}

function handleContexMenu(shell, ev) {
  handleEvent(shell, ev)
  return false
}

function handleBlur(shell, ev) {
  var n = keyNames.length
    , c = shell._curKeyState
    , r = shell._releaseCount
    , i
  for(i=0; i<n; ++i) {
    if(c[i]) {
      ++r[i]
    }
    c[i] = false
  }
  return false
}

function handleResizeElement(shell, ev) {
  var w = shell.element.clientWidth|0
  var h = shell.element.clientHeight|0
  if((w !== shell._width) || (h !== shell._height)) {
    shell._width = w
    shell._height = h
    shell.emit("resize", w, h)
  }
}

function makeDefaultContainer() {
  var container = document.createElement("div")
  container.tabindex = 1
  container.style.position = "absolute"
  container.style.left = "0px"
  container.style.right = "0px"
  container.style.top = "0px"
  container.style.bottom = "0px"
  container.style.height = "100%"
  container.style.overflow = "hidden"
  document.body.appendChild(container)
  document.body.style.overflow = "hidden" //Prevent bounce
  document.body.style.height = "100%"
  return container
}

function createShell(options) {
  options = options || {}

  //Check fullscreen and pointer lock flags
  var useFullscreen = !!options.fullscreen
  var usePointerLock = useFullscreen
  if(typeof options.pointerLock !== undefined) {
    usePointerLock = !!options.pointerLock
  }

  //Create initial shell
  var shell = new GameShell()
  shell._tickRate = options.tickRate || 30
  shell.frameSkip = options.frameSkip || (shell._tickRate+5) * 5
  shell.stickyFullscreen = !!options.stickyFullscreen || !!options.sticky
  shell.stickyPointerLock = !!options.stickyPointerLock || !!options.sticky

  //Set bindings
  if(options.bindings) {
    shell.bindings = options.bindings
  }

  //Wait for dom to intiailize
  setTimeout(function() { domready(function initGameShell() {

    //Retrieve element
    var element = options.element
    if(typeof element === "string") {
      var e = document.querySelector(element)
      if(!e) {
        e = document.getElementById(element)
      }
      if(!e) {
        e = document.getElementByClass(element)[0]
      }
      if(!e) {
        e = makeDefaultContainer()
      }
      shell.element = e
    } else if(typeof element === "object" && !!element) {
      shell.element = element
    } else if(typeof element === "function") {
      shell.element = element()
    } else {
      shell.element = makeDefaultContainer()
    }

    //Disable user-select
    if(shell.element.style) {
      shell.element.style["-webkit-touch-callout"] = "none"
      shell.element.style["-webkit-user-select"] = "none"
      shell.element.style["-khtml-user-select"] = "none"
      shell.element.style["-moz-user-select"] = "none"
      shell.element.style["-ms-user-select"] = "none"
      shell.element.style["user-select"] = "none"
    }

    //Hook resize handler
    shell._width = shell.element.clientWidth
    shell._height = shell.element.clientHeight
    var handleResize = handleResizeElement.bind(undefined, shell)
    if(typeof MutationObserver !== "undefined") {
      var observer = new MutationObserver(handleResize)
      observer.observe(shell.element, {
        attributes: true,
        subtree: true
      })
    } else {
      shell.element.addEventListener("DOMSubtreeModified", handleResize, false)
    }
    window.addEventListener("resize", handleResize, false)

    //Hook keyboard listener
    window.addEventListener("keydown", handleKeyDown.bind(undefined, shell), false)
    window.addEventListener("keyup", handleKeyUp.bind(undefined, shell), false)

    //Disable right click
    shell.element.oncontextmenu = handleContexMenu.bind(undefined, shell)

    //Hook mouse listeners
    shell.element.addEventListener("mousedown", handleMouseDown.bind(undefined, shell), false)
    shell.element.addEventListener("mouseup", handleMouseUp.bind(undefined, shell), false)
    shell.element.addEventListener("mousemove", handleMouseMove.bind(undefined, shell), false)
    shell.element.addEventListener("mouseenter", handleMouseEnter.bind(undefined, shell), false)

    //Mouse leave
    var leave = handleMouseLeave.bind(undefined, shell)
    shell.element.addEventListener("mouseleave", leave, false)
    shell.element.addEventListener("mouseout", leave, false)
    window.addEventListener("mouseleave", leave, false)
    window.addEventListener("mouseout", leave, false)

    //Blur event
    var blur = handleBlur.bind(undefined, shell)
    shell.element.addEventListener("blur", blur, false)
    shell.element.addEventListener("focusout", blur, false)
    shell.element.addEventListener("focus", blur, false)
    window.addEventListener("blur", blur, false)
    window.addEventListener("focusout", blur, false)
    window.addEventListener("focus", blur, false)

    //Mouse wheel handler
    addMouseWheel(shell.element, handleMouseWheel.bind(undefined, shell), false)

    //Fullscreen handler
    var fullscreenChange = handleFullscreen.bind(undefined, shell)
    document.addEventListener("fullscreenchange", fullscreenChange, false)
    document.addEventListener("mozfullscreenchange", fullscreenChange, false)
    document.addEventListener("webkitfullscreenchange", fullscreenChange, false)

    //Stupid fullscreen hack
    shell.element.addEventListener("click", tryFullscreen.bind(undefined, shell), false)

    //Pointer lock change handler
    var pointerLockChange = handlePointerLockChange.bind(undefined, shell)
    document.addEventListener("pointerlockchange", pointerLockChange, false)
    document.addEventListener("mozpointerlockchange", pointerLockChange, false)
    document.addEventListener("webkitpointerlockchange", pointerLockChange, false)
    document.addEventListener("pointerlocklost", pointerLockChange, false)
    document.addEventListener("webkitpointerlocklost", pointerLockChange, false)
    document.addEventListener("mozpointerlocklost", pointerLockChange, false)

    //Update flags
    shell.fullscreen = useFullscreen
    shell.pointerLock = usePointerLock

    //Default mouse button aliases
    shell.bind("mouse-left",   "mouse-1")
    shell.bind("mouse-right",  "mouse-3")
    shell.bind("mouse-middle", "mouse-2")

    //Initialize tick counter
    shell._lastTick = hrtime()
    shell.startTime = hrtime()

    //Unpause shell
    shell.paused = false

    //Emit initialize event
    shell.emit("init")
  })}, 0)

  return shell
}

module.exports = createShell

},{"./lib/hrtime-polyfill.js":14,"./lib/mousewheel-polyfill.js":15,"./lib/raf-polyfill.js":16,"binary-search-bounds":4,"domready":11,"events":13,"invert-hash":57,"iota-array":58,"uniq":65,"util":68,"vkey":69}],18:[function(require,module,exports){
"use strict"

var pool = require("typedarray-pool")
var ops = require("ndarray-ops")
var ndarray = require("ndarray")

var SUPPORTED_TYPES = [
  "uint8",
  "uint8_clamped",
  "uint16",
  "uint32",
  "int8",
  "int16",
  "int32",
  "float32" ]

function GLBuffer(gl, type, handle, length, usage) {
  this.gl = gl
  this.type = type
  this.handle = handle
  this.length = length
  this.usage = usage
}

var proto = GLBuffer.prototype

proto.bind = function() {
  this.gl.bindBuffer(this.type, this.handle)
}

proto.unbind = function() {
  this.gl.bindBuffer(this.type, null)
}

proto.dispose = function() {
  this.gl.deleteBuffer(this.handle)
}

function updateTypeArray(gl, type, len, usage, data, offset) {
  var dataLen = data.length * data.BYTES_PER_ELEMENT
  if(offset < 0) {
    gl.bufferData(type, data, usage)
    return dataLen
  }
  if(dataLen + offset > len) {
    throw new Error("gl-buffer: If resizing buffer, must not specify offset")
  }
  gl.bufferSubData(type, offset, data)
  return len
}

function makeScratchTypeArray(array, dtype) {
  var res = pool.malloc(array.length, dtype)
  var n = array.length
  for(var i=0; i<n; ++i) {
    res[i] = array[i]
  }
  return res
}

function isPacked(shape, stride) {
  var n = 1
  for(var i=stride.length-1; i>=0; --i) {
    if(stride[i] !== n) {
      return false
    }
    n *= shape[i]
  }
  return true
}

proto.update = function(array, offset) {
  if(typeof offset !== "number") {
    offset = -1
  }
  this.bind()
  if(typeof array === "object" && typeof array.shape !== "undefined") { //ndarray
    var dtype = array.dtype
    if(SUPPORTED_TYPES.indexOf(dtype) < 0) {
      dtype = "float32"
    }
    if(this.type === this.gl.ELEMENT_ARRAY_BUFFER) {
      var ext = gl.getExtension('OES_element_index_uint')
      if(ext && dtype !== "uint16") {
        dtype = "uint32"
      } else {
        dtype = "uint16"
      }
    }
    if(dtype === array.dtype && isPacked(array.shape, array.stride)) {
      if(array.offset === 0 && array.data.length === array.shape[0]) {
        this.length = updateTypeArray(this.gl, this.type, this.length, this.usage, array.data, offset)
      } else {
        this.length = updateTypeArray(this.gl, this.type, this.length, this.usage, array.data.subarray(array.offset, array.shape[0]), offset)
      }
    } else {
      var tmp = pool.malloc(array.size, dtype)
      var ndt = ndarray(tmp, array.shape)
      ops.assign(ndt, array)
      if(offset < 0) {
        this.length = updateTypeArray(this.gl, this.type, this.length, this.usage, tmp, offset)
      } else {
        this.length = updateTypeArray(this.gl, this.type, this.length, this.usage, tmp.subarray(0, array.size), offset)
      }
      pool.free(tmp)
    }
  } else if(Array.isArray(array)) { //Vanilla array
    var t
    if(this.type === this.gl.ELEMENT_ARRAY_BUFFER) {
      t = makeScratchTypeArray(array, "uint16")
    } else {
      t = makeScratchTypeArray(array, "float32")
    }
    if(offset < 0) {
      this.length = updateTypeArray(this.gl, this.type, this.length, this.usage, t, offset)
    } else {
      this.length = updateTypeArray(this.gl, this.type, this.length, this.usage, t.subarray(0, array.length), offset)
    }
    pool.free(t)
  } else if(typeof array === "object" && typeof array.length === "number") { //Typed array
    this.length = updateTypeArray(this.gl, this.type, this.length, this.usage, array, offset)
  } else if(typeof array === "number" || array === undefined) { //Number/default
    if(offset >= 0) {
      throw new Error("gl-buffer: Cannot specify offset when resizing buffer")
    }
    array = array | 0
    if(array <= 0) {
      array = 1
    }
    this.gl.bufferData(this.type, array|0, this.usage)
    this.length = array
  } else { //Error, case should not happen
    throw new Error("gl-buffer: Invalid data type")
  }
}

function createBuffer(gl, data, type, usage) {
  type = type || gl.ARRAY_BUFFER
  usage = usage || gl.DYNAMIC_DRAW
  if(type !== gl.ARRAY_BUFFER && type !== gl.ELEMENT_ARRAY_BUFFER) {
    throw new Error("gl-buffer: Invalid type for webgl buffer, must be either gl.ARRAY_BUFFER or gl.ELEMENT_ARRAY_BUFFER")
  }
  if(usage !== gl.DYNAMIC_DRAW && usage !== gl.STATIC_DRAW && usage !== gl.STREAM_DRAW) {
    throw new Error("gl-buffer: Invalid usage for buffer, must be either gl.DYNAMIC_DRAW, gl.STATIC_DRAW or gl.STREAM_DRAW")
  }
  var handle = gl.createBuffer()
  var result = new GLBuffer(gl, type, handle, 0, usage)
  result.update(data)
  return result
}

module.exports = createBuffer

},{"ndarray":62,"ndarray-ops":61,"typedarray-pool":64}],19:[function(require,module,exports){
'use strict'

var createTexture = require('gl-texture2d')

module.exports = createFBO

var colorAttachmentArrays = null
var FRAMEBUFFER_UNSUPPORTED
var FRAMEBUFFER_INCOMPLETE_ATTACHMENT
var FRAMEBUFFER_INCOMPLETE_DIMENSIONS
var FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT

function saveFBOState(gl) {
  var fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING)
  var rbo = gl.getParameter(gl.RENDERBUFFER_BINDING)
  var tex = gl.getParameter(gl.TEXTURE_BINDING_2D)
  return [fbo, rbo, tex]
}

function restoreFBOState(gl, data) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, data[0])
  gl.bindRenderbuffer(gl.RENDERBUFFER, data[1])
  gl.bindTexture(gl.TEXTURE_2D, data[2])
}

function lazyInitColorAttachments(gl, ext) {
  var maxColorAttachments = gl.getParameter(ext.MAX_COLOR_ATTACHMENTS_WEBGL)
  colorAttachmentArrays = new Array(maxColorAttachments + 1)
  for(var i=0; i<=maxColorAttachments; ++i) {
    var x = new Array(maxColorAttachments)
    for(var j=0; j<i; ++j) {
      x[j] = gl.COLOR_ATTACHMENT0 + j
    }
    for(var j=i; j<maxColorAttachments; ++j) {
      x[j] = gl.NONE
    }
    colorAttachmentArrays[i] = x
  }
}

//Throw an appropriate error
function throwFBOError(status) {
  switch(status){
    case FRAMEBUFFER_UNSUPPORTED:
      throw new Error('gl-fbo: Framebuffer unsupported')
    case FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
      throw new Error('gl-fbo: Framebuffer incomplete attachment')
    case FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
      throw new Error('gl-fbo: Framebuffer incomplete dimensions')
    case FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
      throw new Error('gl-fbo: Framebuffer incomplete missing attachment')
    default:
      throw new Error('gl-fbo: Framebuffer failed for unspecified reason')
  }
}

//Initialize a texture object
function initTexture(gl, width, height, type, format, attachment) {
  if(!type) {
    return null
  }
  var result = createTexture(gl, width, height, format, type)
  result.magFilter = gl.NEAREST
  result.minFilter = gl.NEAREST
  result.mipSamples = 1
  result.bind()
  gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, result.handle, 0)
  return result
}

//Initialize a render buffer object
function initRenderBuffer(gl, width, height, component, attachment) {
  var result = gl.createRenderbuffer()
  gl.bindRenderbuffer(gl.RENDERBUFFER, result)
  gl.renderbufferStorage(gl.RENDERBUFFER, component, width, height)
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, result)
  return result
}

//Rebuild the frame buffer
function rebuildFBO(fbo) {

  //Save FBO state
  var state = saveFBOState(fbo.gl)

  var gl = fbo.gl
  var handle = fbo.handle = gl.createFramebuffer()
  var width = fbo._shape[0]
  var height = fbo._shape[1]
  var numColors = fbo.color.length
  var ext = fbo._ext
  var useStencil = fbo._useStencil
  var useDepth = fbo._useDepth
  var colorType = fbo._colorType

  //Bind the fbo
  gl.bindFramebuffer(gl.FRAMEBUFFER, handle)

  //Allocate color buffers
  for(var i=0; i<numColors; ++i) {
    fbo.color[i] = initTexture(gl, width, height, colorType, gl.RGBA, gl.COLOR_ATTACHMENT0 + i)
  }
  if(numColors === 0) {
    fbo._color_rb = initRenderBuffer(gl, width, height, gl.RGBA4, gl.COLOR_ATTACHMENT0)
    if(ext) {
      ext.drawBuffersWEBGL(colorAttachmentArrays[0])
    }
  } else if(numColors > 1) {
    ext.drawBuffersWEBGL(colorAttachmentArrays[numColors])
  }

  //Allocate depth/stencil buffers
  var WEBGL_depth_texture = gl.getExtension('WEBGL_depth_texture')
  if(WEBGL_depth_texture) {
    if(useStencil) {
      fbo.depth = initTexture(gl, width, height,
                          WEBGL_depth_texture.UNSIGNED_INT_24_8_WEBGL,
                          gl.DEPTH_STENCIL,
                          gl.DEPTH_STENCIL_ATTACHMENT)
    } else if(useDepth) {
      fbo.depth = initTexture(gl, width, height,
                          gl.UNSIGNED_SHORT,
                          gl.DEPTH_COMPONENT,
                          gl.DEPTH_ATTACHMENT)
    }
  } else {
    if(useDepth && useStencil) {
      fbo._depth_rb = initRenderBuffer(gl, width, height, gl.DEPTH_STENCIL, gl.DEPTH_STENCIL_ATTACHMENT)
    } else if(useDepth) {
      fbo._depth_rb = initRenderBuffer(gl, width, height, gl.DEPTH_COMPONENT16, gl.DEPTH_ATTACHMENT)
    } else if(useStencil) {
      fbo._depth_rb = initRenderBuffer(gl, width, height, gl.STENCIL_INDEX, gl.STENCIL_ATTACHMENT)
    }
  }

  //Check frame buffer state
  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if(status !== gl.FRAMEBUFFER_COMPLETE) {

    //Release all partially allocated resources
    fbo._destroyed = true

    //Release all resources
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fbo.handle)
    fbo.handle = null
    if(fbo.depth) {
      fbo.depth.dispose()
      fbo.depth = null
    }
    if(fbo._depth_rb) {
      gl.deleteRenderbuffer(fbo._depth_rb)
      fbo._depth_rb = null
    }
    for(var i=0; i<fbo.color.length; ++i) {
      fbo.color[i].dispose()
      fbo.color[i] = null
    }
    if(fbo._color_rb) {
      gl.deleteRenderbuffer(fbo._color_rb)
      fbo._color_rb = null
    }

    restoreFBOState(gl, state)

    //Throw the frame buffer error
    throwFBOError(status)
  }

  //Everything ok, let's get on with life
  restoreFBOState(gl, state)
}

function Framebuffer(gl, width, height, colorType, numColors, useDepth, useStencil, ext) {

  //Handle and set properties
  this.gl = gl
  this._shape = [width|0, height|0]
  this._destroyed = false
  this._ext = ext

  //Allocate buffers
  this.color = new Array(numColors)
  for(var i=0; i<numColors; ++i) {
    this.color[i] = null
  }
  this._color_rb = null
  this.depth = null
  this._depth_rb = null

  //Save depth and stencil flags
  this._colorType = colorType
  this._useDepth = useDepth
  this._useStencil = useStencil

  //Shape vector for resizing
  var parent = this
  var shapeVector = [width|0, height|0]
  Object.defineProperties(shapeVector, {
    0: {
      get: function() {
        return parent._shape[0]
      },
      set: function(w) {
        return parent.width = w
      }
    },
    1: {
      get: function() {
        return parent._shape[1]
      },
      set: function(h) {
        return parent.height = h
      }
    }
  })
  this._shapeVector = shapeVector

  //Initialize all attachments
  rebuildFBO(this)
}

var proto = Framebuffer.prototype

function reshapeFBO(fbo, w, h) {
  //If fbo is invalid, just skip this
  if(fbo._destroyed) {
    throw new Error('gl-fbo: Can\'t resize destroyed FBO')
  }

  //Don't resize if no change in shape
  if( (fbo._shape[0] === w) &&
      (fbo._shape[1] === h) ) {
    return
  }

  var gl = fbo.gl

  //Check parameter ranges
  var maxFBOSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
  if( w < 0 || w > maxFBOSize ||
      h < 0 || h > maxFBOSize) {
    throw new Error('gl-fbo: Can\'t resize FBO, invalid dimensions')
  }

  //Update shape
  fbo._shape[0] = w
  fbo._shape[1] = h

  //Save framebuffer state
  var state = saveFBOState(gl)

  //Resize framebuffer attachments
  for(var i=0; i<fbo.color.length; ++i) {
    fbo.color[i].shape = fbo._shape
  }
  if(fbo._color_rb) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, fbo._color_rb)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA4, fbo._shape[0], fbo._shape[1])
  }
  if(fbo.depth) {
    fbo.depth.shape = fbo._shape
  }
  if(fbo._depth_rb) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, fbo._depth_rb)
    if(fbo._useDepth && fbo._useStencil) {
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, fbo._shape[0], fbo._shape[1])
    } else if(fbo._useDepth) {
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fbo._shape[0], fbo._shape[1])
    } else if(fbo._useStencil) {
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX, fbo._shape[0], fbo._shape[1])
    }
  }

  //Check FBO status after resize, if something broke then die in a fire
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.handle)
  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if(status !== gl.FRAMEBUFFER_COMPLETE) {
    fbo.dispose()
    restoreFBOState(gl, state)
    throwFBOError(status)
  }

  //Restore framebuffer state
  restoreFBOState(gl, state)
}

Object.defineProperties(proto, {
  'shape': {
    get: function() {
      if(this._destroyed) {
        return [0,0]
      }
      return this._shapeVector
    },
    set: function(x) {
      if(!Array.isArray(x)) {
        x = [x|0, x|0]
      }
      if(x.length !== 2) {
        throw new Error('gl-fbo: Shape vector must be length 2')
      }

      var w = x[0]|0
      var h = x[1]|0
      reshapeFBO(this, w, h)

      return [w, h]
    },
    enumerable: false
  },
  'width': {
    get: function() {
      if(this._destroyed) {
        return 0
      }
      return this._shape[0]
    },
    set: function(w) {
      w = w|0
      reshapeFBO(this, w, this._shape[1])
      return w
    },
    enumerable: false
  },
  'height': {
    get: function() {
      if(this._destroyed) {
        return 0
      }
      return this._shape[1]
    },
    set: function(h) {
      h = h|0
      reshapeFBO(this, this._shape[0], h)
      return h
    },
    enumerable: false
  }
})

proto.bind = function() {
  if(this._destroyed) {
    return
  }
  var gl = this.gl
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.handle)
  gl.viewport(0, 0, this._shape[0], this._shape[1])
}

proto.dispose = function() {
  if(this._destroyed) {
    return
  }
  this._destroyed = true
  var gl = this.gl
  gl.deleteFramebuffer(this.handle)
  this.handle = null
  if(this.depth) {
    this.depth.dispose()
    this.depth = null
  }
  if(this._depth_rb) {
    gl.deleteRenderbuffer(this._depth_rb)
    this._depth_rb = null
  }
  for(var i=0; i<this.color.length; ++i) {
    this.color[i].dispose()
    this.color[i] = null
  }
  if(this._color_rb) {
    gl.deleteRenderbuffer(this._color_rb)
    this._color_rb = null
  }
}

function createFBO(gl, width, height, options) {

  //Update frame buffer error code values
  if(!FRAMEBUFFER_UNSUPPORTED) {
    FRAMEBUFFER_UNSUPPORTED = gl.FRAMEBUFFER_UNSUPPORTED
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT = gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
    FRAMEBUFFER_INCOMPLETE_DIMENSIONS = gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS
    FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT
  }

  //Lazily initialize color attachment arrays
  var WEBGL_draw_buffers = gl.getExtension('WEBGL_draw_buffers')
  if(!colorAttachmentArrays && WEBGL_draw_buffers) {
    lazyInitColorAttachments(gl, WEBGL_draw_buffers)
  }

  //Special case: Can accept an array as argument
  if(Array.isArray(width)) {
    options = height
    height = width[1]|0
    width = width[0]|0
  }

  if(typeof width !== 'number') {
    throw new Error('gl-fbo: Missing shape parameter')
  }

  //Validate width/height properties
  var maxFBOSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
  if(width < 0 || width > maxFBOSize || height < 0 || height > maxFBOSize) {
    throw new Error('gl-fbo: Parameters are too large for FBO')
  }

  //Handle each option type
  options = options || {}

  //Figure out number of color buffers to use
  var numColors = 1
  if('color' in options) {
    numColors = Math.max(options.color|0, 0)
    if(numColors < 0) {
      throw new Error('gl-fbo: Must specify a nonnegative number of colors')
    }
    if(numColors > 1) {
      //Check if multiple render targets supported
      if(!WEBGL_draw_buffers) {
        throw new Error('gl-fbo: Multiple draw buffer extension not supported')
      } else if(numColors > gl.getParameter(WEBGL_draw_buffers.MAX_COLOR_ATTACHMENTS_WEBGL)) {
        throw new Error('gl-fbo: Context does not support ' + numColors + ' draw buffers')
      }
    }
  }

  //Determine whether to use floating point textures
  var colorType = gl.UNSIGNED_BYTE
  var OES_texture_float = gl.getExtension('OES_texture_float')
  if(options.float && numColors > 0) {
    if(!OES_texture_float) {
      throw new Error('gl-fbo: Context does not support floating point textures')
    }
    colorType = gl.FLOAT
  } else if(options.preferFloat && numColors > 0) {
    if(OES_texture_float) {
      colorType = gl.FLOAT
    }
  }

  //Check if we should use depth buffer
  var useDepth = true
  if('depth' in options) {
    useDepth = !!options.depth
  }

  //Check if we should use a stencil buffer
  var useStencil = false
  if('stencil' in options) {
    useStencil = !!options.stencil
  }

  return new Framebuffer(
    gl,
    width,
    height,
    colorType,
    numColors,
    useDepth,
    useStencil,
    WEBGL_draw_buffers)
}

},{"gl-texture2d":49}],20:[function(require,module,exports){
module.exports = adjoint;

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function adjoint(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    out[0]  =  (a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22));
    out[1]  = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
    out[2]  =  (a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12));
    out[3]  = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
    out[4]  = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
    out[5]  =  (a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22));
    out[6]  = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
    out[7]  =  (a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12));
    out[8]  =  (a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21));
    out[9]  = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
    out[10] =  (a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11));
    out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
    out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
    out[13] =  (a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21));
    out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
    out[15] =  (a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11));
    return out;
};
},{}],21:[function(require,module,exports){
module.exports = clone;

/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */
function clone(a) {
    var out = new Float32Array(16);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],22:[function(require,module,exports){
module.exports = copy;

/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function copy(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],23:[function(require,module,exports){
module.exports = create;

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */
function create() {
    var out = new Float32Array(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],24:[function(require,module,exports){
module.exports = determinant;

/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */
function determinant(a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};
},{}],25:[function(require,module,exports){
module.exports = fromQuat;

/**
 * Creates a matrix from a quaternion rotation.
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @returns {mat4} out
 */
function fromQuat(out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        yx = y * x2,
        yy = y * y2,
        zx = z * x2,
        zy = z * y2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - yy - zz;
    out[1] = yx + wz;
    out[2] = zx - wy;
    out[3] = 0;

    out[4] = yx - wz;
    out[5] = 1 - xx - zz;
    out[6] = zy + wx;
    out[7] = 0;

    out[8] = zx + wy;
    out[9] = zy - wx;
    out[10] = 1 - xx - yy;
    out[11] = 0;

    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;

    return out;
};
},{}],26:[function(require,module,exports){
module.exports = fromRotationTranslation;

/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     var quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
function fromRotationTranslation(out, q, v) {
    // Quaternion math
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;
    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;
    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;

    return out;
};
},{}],27:[function(require,module,exports){
module.exports = frustum;

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */
function frustum(out, left, right, bottom, top, near, far) {
    var rl = 1 / (right - left),
        tb = 1 / (top - bottom),
        nf = 1 / (near - far);
    out[0] = (near * 2) * rl;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = (near * 2) * tb;
    out[6] = 0;
    out[7] = 0;
    out[8] = (right + left) * rl;
    out[9] = (top + bottom) * tb;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (far * near * 2) * nf;
    out[15] = 0;
    return out;
};
},{}],28:[function(require,module,exports){
module.exports = identity;

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
function identity(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],29:[function(require,module,exports){
module.exports = {
  create: require('./create')
  , clone: require('./clone')
  , copy: require('./copy')
  , identity: require('./identity')
  , transpose: require('./transpose')
  , invert: require('./invert')
  , adjoint: require('./adjoint')
  , determinant: require('./determinant')
  , multiply: require('./multiply')
  , translate: require('./translate')
  , scale: require('./scale')
  , rotate: require('./rotate')
  , rotateX: require('./rotateX')
  , rotateY: require('./rotateY')
  , rotateZ: require('./rotateZ')
  , fromRotationTranslation: require('./fromRotationTranslation')
  , fromQuat: require('./fromQuat')
  , frustum: require('./frustum')
  , perspective: require('./perspective')
  , perspectiveFromFieldOfView: require('./perspectiveFromFieldOfView')
  , ortho: require('./ortho')
  , lookAt: require('./lookAt')
  , str: require('./str')
}
},{"./adjoint":20,"./clone":21,"./copy":22,"./create":23,"./determinant":24,"./fromQuat":25,"./fromRotationTranslation":26,"./frustum":27,"./identity":28,"./invert":30,"./lookAt":31,"./multiply":32,"./ortho":33,"./perspective":34,"./perspectiveFromFieldOfView":35,"./rotate":36,"./rotateX":37,"./rotateY":38,"./rotateZ":39,"./scale":40,"./str":41,"./translate":42,"./transpose":43}],30:[function(require,module,exports){
module.exports = invert;

/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function invert(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) {
        return null;
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
};
},{}],31:[function(require,module,exports){
var identity = require('./identity');

module.exports = lookAt;

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
function lookAt(out, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye[0],
        eyey = eye[1],
        eyez = eye[2],
        upx = up[0],
        upy = up[1],
        upz = up[2],
        centerx = center[0],
        centery = center[1],
        centerz = center[2];

    if (Math.abs(eyex - centerx) < 0.000001 &&
        Math.abs(eyey - centery) < 0.000001 &&
        Math.abs(eyez - centerz) < 0.000001) {
        return identity(out);
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
};
},{"./identity":28}],32:[function(require,module,exports){
module.exports = multiply;

/**
 * Multiplies two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function multiply(out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Cache only the current line of the second matrix
    var b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
};
},{}],33:[function(require,module,exports){
module.exports = ortho;

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function ortho(out, left, right, bottom, top, near, far) {
    var lr = 1 / (left - right),
        bt = 1 / (bottom - top),
        nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};
},{}],34:[function(require,module,exports){
module.exports = perspective;

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspective(out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
};
},{}],35:[function(require,module,exports){
module.exports = perspectiveFromFieldOfView;

/**
 * Generates a perspective projection matrix with the given field of view.
 * This is primarily useful for generating projection matrices to be used
 * with the still experiemental WebVR API.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fov Object containing the following values: upDegrees, downDegrees, leftDegrees, rightDegrees
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspectiveFromFieldOfView(out, fov, near, far) {
    var upTan = Math.tan(fov.upDegrees * Math.PI/180.0),
        downTan = Math.tan(fov.downDegrees * Math.PI/180.0),
        leftTan = Math.tan(fov.leftDegrees * Math.PI/180.0),
        rightTan = Math.tan(fov.rightDegrees * Math.PI/180.0),
        xScale = 2.0 / (leftTan + rightTan),
        yScale = 2.0 / (upTan + downTan);

    out[0] = xScale;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = 0.0;
    out[4] = 0.0;
    out[5] = yScale;
    out[6] = 0.0;
    out[7] = 0.0;
    out[8] = -((leftTan - rightTan) * xScale * 0.5);
    out[9] = ((upTan - downTan) * yScale * 0.5);
    out[10] = far / (near - far);
    out[11] = -1.0;
    out[12] = 0.0;
    out[13] = 0.0;
    out[14] = (far * near) / (near - far);
    out[15] = 0.0;
    return out;
}


},{}],36:[function(require,module,exports){
module.exports = rotate;

/**
 * Rotates a mat4 by the given angle
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
function rotate(out, a, rad, axis) {
    var x = axis[0], y = axis[1], z = axis[2],
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;

    if (Math.abs(len) < 0.000001) { return null; }

    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(rad);
    c = Math.cos(rad);
    t = 1 - c;

    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }
    return out;
};
},{}],37:[function(require,module,exports){
module.exports = rotateX;

/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateX(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[0]  = a[0];
        out[1]  = a[1];
        out[2]  = a[2];
        out[3]  = a[3];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
};
},{}],38:[function(require,module,exports){
module.exports = rotateY;

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateY(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[4]  = a[4];
        out[5]  = a[5];
        out[6]  = a[6];
        out[7]  = a[7];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
};
},{}],39:[function(require,module,exports){
module.exports = rotateZ;

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateZ(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[8]  = a[8];
        out[9]  = a[9];
        out[10] = a[10];
        out[11] = a[11];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
};
},{}],40:[function(require,module,exports){
module.exports = scale;

/**
 * Scales the mat4 by the dimensions in the given vec3
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
function scale(out, a, v) {
    var x = v[0], y = v[1], z = v[2];

    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],41:[function(require,module,exports){
module.exports = str;

/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
function str(a) {
    return 'mat4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' +
                    a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' +
                    a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' +
                    a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
};
},{}],42:[function(require,module,exports){
module.exports = translate;

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
function translate(out, a, v) {
    var x = v[0], y = v[1], z = v[2],
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23;

    if (a === out) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
        a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
        a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

        out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
        out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
        out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;

        out[12] = a00 * x + a10 * y + a20 * z + a[12];
        out[13] = a01 * x + a11 * y + a21 * z + a[13];
        out[14] = a02 * x + a12 * y + a22 * z + a[14];
        out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }

    return out;
};
},{}],43:[function(require,module,exports){
module.exports = transpose;

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function transpose(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a03 = a[3],
            a12 = a[6], a13 = a[7],
            a23 = a[11];

        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a01;
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a02;
        out[9] = a12;
        out[11] = a[14];
        out[12] = a03;
        out[13] = a13;
        out[14] = a23;
    } else {
        out[0] = a[0];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a[1];
        out[5] = a[5];
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a[2];
        out[9] = a[6];
        out[10] = a[10];
        out[11] = a[14];
        out[12] = a[3];
        out[13] = a[7];
        out[14] = a[11];
        out[15] = a[15];
    }

    return out;
};
},{}],44:[function(require,module,exports){
"use strict"

var makeGameShell = require("game-shell")
var webglew = require("webglew")

function createGLShell(options) {
  options = options || {}

  var extensions = options.extensions || []

  //First create shell
  var shell = makeGameShell(options)
  var scale = shell.scale || 1
  var contextOptions = options.glOptions

  shell.on("init", function initGLNow() {

    //Create canvas
    var canvas = document.createElement("canvas")

    //Try initializing WebGL
    var gl = canvas.getContext("webgl", contextOptions) ||
             canvas.getContext("experimental-webgl", contextOptions)
    if(!gl) {
      shell.emit("gl-error", new Error("Unable to initialize WebGL"))
      return
    }

    //Check extensions
    var ext = webglew(gl)
    for(var i=0; i<extensions.length; ++i) {
      if(!(extensions[i] in ext)) {
        shell.emit("gl-error", new Error("Missing extension: " + extensions[i]))
        return
      }
    }

    //Set canvas style
    canvas.style.position = "absolute"
    canvas.style.left = "0px"
    canvas.style.top = "0px"
    shell.element.appendChild(canvas)

    //Add variables to game-shell
    shell.canvas = canvas
    shell.gl = gl

    //Load width/height
    resize()

    //Load default parameters
    shell.clearFlags = options.clearFlags === undefined ? (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT) : options.clearFlags
    shell.clearColor = options.clearColor || [0,0,0,0]
    shell.clearDepth = options.clearDepth || 1.0
    shell.clearStencil = options.clearStencil || 0

    shell.on("resize", resize)

    //Hook render event
    shell.on("render", function renderGLNow(t) {

      //Bind default framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      //Set viewport
      gl.viewport(0, 0, (shell._width / scale)|0, (shell._height / scale)|0)

      //Clear buffers
      if(shell.clearFlags & gl.STENCIL_BUFFER_BIT) {
        gl.clearStencil(shell.clearStencil)
      }
      if(shell.clearFlags & gl.COLOR_BUFFER_BIT) {
        gl.clearColor(shell.clearColor[0], shell.clearColor[1], shell.clearColor[2], shell.clearColor[3])
      }
      if(shell.clearFlags & gl.DEPTH_BUFFER_BIT) {
        gl.clearDepth(shell.clearDepth)
      }
      if(shell.clearFlags) {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
      }

      //Render frame
      shell.emit("gl-render", t)
    })

    //WebGL initialized
    shell.emit("gl-init")
  })

  function resize() {
    var nw = (shell._width/scale)|0
    var nh = (shell._height/scale)|0
    shell.canvas.width = nw
    shell.canvas.height = nh
    shell.canvas.style.width = shell._width + 'px'
    shell.canvas.style.height = shell._height + 'px'
    shell.emit("gl-resize", nw, nh)
  }

  Object.defineProperty(shell, 'scale', {
    get: function() {
      return scale
    },
    set: function(_scale) {
      _scale = +_scale
      if((_scale <= 0) || isNaN(_scale) || (scale === _scale)) {
        return scale
      }
      scale = _scale
      resize()
      return scale
    }
  })

  Object.defineProperty(shell, "width", {
    get: function() {
      return (shell._width / scale)|0
    }
  })

  Object.defineProperty(shell, "height", {
    get: function() {
      return (shell._height / scale)|0
    }
  })

  Object.defineProperty(shell, "mouse", {
    get: function() {
      return [shell.mouseX/scale, shell.mouseY/scale]
    }
  })

  Object.defineProperty(shell, "prevMouse", {
    get: function() {
      return [shell.prevMouseX/scale, shell.prevMouseY/scale]
    }
  })

  return shell
}

module.exports = createGLShell
},{"game-shell":17,"webglew":71}],45:[function(require,module,exports){
'use strict'

module.exports = createAttributeWrapper

//Shader attribute class
function ShaderAttribute(gl, program, location, dimension, name, constFunc, relink) {
  this._gl = gl
  this._program = program
  this._location = location
  this._dimension = dimension
  this._name = name
  this._constFunc = constFunc
  this._relink = relink
}

var proto = ShaderAttribute.prototype

proto.pointer = function setAttribPointer(type, normalized, stride, offset) {
  var gl = this._gl
  gl.vertexAttribPointer(this._location, this._dimension, type||gl.FLOAT, !!normalized, stride||0, offset||0)
  this._gl.enableVertexAttribArray(this._location)
}

Object.defineProperty(proto, 'location', {
  get: function() {
    return this._location
  }
  , set: function(v) {
    if(v !== this._location) {
      this._location = v
      this._gl.bindAttribLocation(this._program, v, this._name)
      this._gl.linkProgram(this._program)
      this._relink()
    }
  }
})


//Adds a vector attribute to obj
function addVectorAttribute(gl, program, location, dimension, obj, name, doLink) {
  var constFuncArgs = [ 'gl', 'v' ]
  var varNames = []
  for(var i=0; i<dimension; ++i) {
    constFuncArgs.push('x'+i)
    varNames.push('x'+i)
  }
  constFuncArgs.push([
    'if(x0.length===void 0){return gl.vertexAttrib', dimension, 'f(v,', varNames.join(), ')}else{return gl.vertexAttrib', dimension, 'fv(v,x0)}'
  ].join(''))
  var constFunc = Function.apply(undefined, constFuncArgs)
  var attr = new ShaderAttribute(gl, program, location, dimension, name, constFunc, doLink)
  Object.defineProperty(obj, name, {
    set: function(x) {
      gl.disableVertexAttribArray(attr._location)
      constFunc(gl, attr._location, x)
      return x
    }
    , get: function() {
      return attr
    }
    , enumerable: true
  })
}

//Create shims for attributes
function createAttributeWrapper(gl, program, attributes, doLink) {
  var obj = {}
  for(var i=0, n=attributes.length; i<n; ++i) {
    var a = attributes[i]
    var name = a.name
    var type = a.type
    var location = gl.getAttribLocation(program, name)

    switch(type) {
      case 'bool':
      case 'int':
      case 'float':
        addVectorAttribute(gl, program, location, 1, obj, name, doLink)
      break

      default:
        if(type.indexOf('vec') >= 0) {
          var d = type.charCodeAt(type.length-1) - 48
          if(d < 2 || d > 4) {
            throw new Error('gl-shader: Invalid data type for attribute ' + name + ': ' + type)
          }
          addVectorAttribute(gl, program, location, d, obj, name, doLink)
        } else {
          throw new Error('gl-shader: Unknown data type for attribute ' + name + ': ' + type)
        }
      break
    }
  }
  return obj
}
},{}],46:[function(require,module,exports){
'use strict'

var dup = require('dup')
var coallesceUniforms = require('./reflect')

module.exports = createUniformWrapper

//Binds a function and returns a value
function identity(x) {
  var c = new Function('y', 'return function(){return y}')
  return c(x)
}

//Create shims for uniforms
function createUniformWrapper(gl, program, uniforms, locations) {

  function makeGetter(index) {
    var proc = new Function('gl', 'prog', 'locations',
      'return function(){return gl.getUniform(prog,locations[' + index + '])}')
    return proc(gl, program, locations)
  }

  function makePropSetter(path, index, type) {
    switch(type) {
      case 'bool':
      case 'int':
      case 'sampler2D':
      case 'samplerCube':
        return 'gl.uniform1i(locations[' + index + '],obj' + path + ')'
      case 'float':
        return 'gl.uniform1f(locations[' + index + '],obj' + path + ')'
      default:
        var vidx = type.indexOf('vec')
        if(0 <= vidx && vidx <= 1 && type.length === 4 + vidx) {
          var d = type.charCodeAt(type.length-1) - 48
          if(d < 2 || d > 4) {
            throw new Error('gl-shader: Invalid data type')
          }
          switch(type.charAt(0)) {
            case 'b':
            case 'i':
              return 'gl.uniform' + d + 'iv(locations[' + index + '],obj' + path + ')'
            case 'v':
              return 'gl.uniform' + d + 'fv(locations[' + index + '],obj' + path + ')'
            default:
              throw new Error('gl-shader: Unrecognized data type for vector ' + name + ': ' + type)
          }
        } else if(type.indexOf('mat') === 0 && type.length === 4) {
          var d = type.charCodeAt(type.length-1) - 48
          if(d < 2 || d > 4) {
            throw new Error('gl-shader: Invalid uniform dimension type for matrix ' + name + ': ' + type)
          }
          return 'gl.uniformMatrix' + d + 'fv(locations[' + index + '],false,obj' + path + ')'
        } else {
          throw new Error('gl-shader: Unknown uniform data type for ' + name + ': ' + type)
        }
      break
    }
  }

  function enumerateIndices(prefix, type) {
    if(typeof type !== 'object') {
      return [ [prefix, type] ]
    }
    var indices = []
    for(var id in type) {
      var prop = type[id]
      var tprefix = prefix
      if(parseInt(id) + '' === id) {
        tprefix += '[' + id + ']'
      } else {
        tprefix += '.' + id
      }
      if(typeof prop === 'object') {
        indices.push.apply(indices, enumerateIndices(tprefix, prop))
      } else {
        indices.push([tprefix, prop])
      }
    }
    return indices
  }

  function makeSetter(type) {
    var code = [ 'return function updateProperty(obj){' ]
    var indices = enumerateIndices('', type)
    for(var i=0; i<indices.length; ++i) {
      var item = indices[i]
      var path = item[0]
      var idx  = item[1]
      if(locations[idx]) {
        code.push(makePropSetter(path, idx, uniforms[idx].type))
      }
    }
    code.push('return obj}')
    var proc = new Function('gl', 'prog', 'locations', code.join('\n'))
    return proc(gl, program, locations)
  }

  function defaultValue(type) {
    switch(type) {
      case 'bool':
        return false
      case 'int':
      case 'sampler2D':
      case 'samplerCube':
        return 0
      case 'float':
        return 0.0
      default:
        var vidx = type.indexOf('vec')
        if(0 <= vidx && vidx <= 1 && type.length === 4 + vidx) {
          var d = type.charCodeAt(type.length-1) - 48
          if(d < 2 || d > 4) {
            throw new Error('gl-shader: Invalid data type')
          }
          if(type.charAt(0) === 'b') {
            return dup(d, false)
          }
          return dup(d)
        } else if(type.indexOf('mat') === 0 && type.length === 4) {
          var d = type.charCodeAt(type.length-1) - 48
          if(d < 2 || d > 4) {
            throw new Error('gl-shader: Invalid uniform dimension type for matrix ' + name + ': ' + type)
          }
          return dup([d,d])
        } else {
          throw new Error('gl-shader: Unknown uniform data type for ' + name + ': ' + type)
        }
      break
    }
  }

  function storeProperty(obj, prop, type) {
    if(typeof type === 'object') {
      var child = processObject(type)
      Object.defineProperty(obj, prop, {
        get: identity(child),
        set: makeSetter(type),
        enumerable: true,
        configurable: false
      })
    } else {
      if(locations[type]) {
        Object.defineProperty(obj, prop, {
          get: makeGetter(type),
          set: makeSetter(type),
          enumerable: true,
          configurable: false
        })
      } else {
        obj[prop] = defaultValue(uniforms[type].type)
      }
    }
  }

  function processObject(obj) {
    var result
    if(Array.isArray(obj)) {
      result = new Array(obj.length)
      for(var i=0; i<obj.length; ++i) {
        storeProperty(result, i, obj[i])
      }
    } else {
      result = {}
      for(var id in obj) {
        storeProperty(result, id, obj[id])
      }
    }
    return result
  }

  //Return data
  var coallesced = coallesceUniforms(uniforms, true)
  return {
    get: identity(processObject(coallesced)),
    set: makeSetter(coallesced),
    enumerable: true,
    configurable: true
  }
}

},{"./reflect":47,"dup":12}],47:[function(require,module,exports){
'use strict'

module.exports = makeReflectTypes

//Construct type info for reflection.
//
// This iterates over the flattened list of uniform type values and smashes them into a JSON object.
//
// The leaves of the resulting object are either indices or type strings representing primitive glslify types
function makeReflectTypes(uniforms, useIndex) {
  var obj = {}
  for(var i=0; i<uniforms.length; ++i) {
    var n = uniforms[i].name
    var parts = n.split(".")
    var o = obj
    for(var j=0; j<parts.length; ++j) {
      var x = parts[j].split("[")
      if(x.length > 1) {
        if(!(x[0] in o)) {
          o[x[0]] = []
        }
        o = o[x[0]]
        for(var k=1; k<x.length; ++k) {
          var y = parseInt(x[k])
          if(k<x.length-1 || j<parts.length-1) {
            if(!(y in o)) {
              if(k < x.length-1) {
                o[y] = []
              } else {
                o[y] = {}
              }
            }
            o = o[y]
          } else {
            if(useIndex) {
              o[y] = i
            } else {
              o[y] = uniforms[i].type
            }
          }
        }
      } else if(j < parts.length-1) {
        if(!(x[0] in o)) {
          o[x[0]] = {}
        }
        o = o[x[0]]
      } else {
        if(useIndex) {
          o[x[0]] = i
        } else {
          o[x[0]] = uniforms[i].type
        }
      }
    }
  }
  return obj
}
},{}],48:[function(require,module,exports){
'use strict'

var createUniformWrapper = require('./lib/create-uniforms')
var createAttributeWrapper = require('./lib/create-attributes')
var makeReflect = require('./lib/reflect')

//Shader object
function Shader(gl, prog, vertShader, fragShader) {
  this.gl = gl
  this.handle = prog
  this.attributes = null
  this.uniforms = null
  this.types = null
  this.vertexShader = vertShader
  this.fragmentShader = fragShader
}

//Binds the shader
Shader.prototype.bind = function() {
  this.gl.useProgram(this.handle)
}

//Destroy shader, release resources
Shader.prototype.dispose = function() {
  var gl = this.gl
  gl.deleteShader(this.vertexShader)
  gl.deleteShader(this.fragmentShader)
  gl.deleteProgram(this.handle)
}

Shader.prototype.updateExports = function(uniforms, attributes) {
  var locations = new Array(uniforms.length)
  var program = this.handle
  var gl = this.gl

  var doLink = relinkUniforms.bind(void 0,
    gl,
    program,
    locations,
    uniforms
  )
  doLink()

  this.types = {
    uniforms: makeReflect(uniforms),
    attributes: makeReflect(attributes)
  }

  this.attributes = createAttributeWrapper(
    gl,
    program,
    attributes,
    doLink
  )

  Object.defineProperty(this, 'uniforms', createUniformWrapper(
    gl,
    program,
    uniforms,
    locations
  ))
}

//Relinks all uniforms
function relinkUniforms(gl, program, locations, uniforms) {
  for(var i=0; i<uniforms.length; ++i) {
    locations[i] = gl.getUniformLocation(program, uniforms[i].name)
  }
}

//Compiles and links a shader program with the given attribute and vertex list
function createShader(
    gl
  , vertSource
  , fragSource
  , uniforms
  , attributes) {

  //Compile vertex shader
  var vertShader = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vertShader, vertSource)
  gl.compileShader(vertShader)
  if(!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    var errLog = gl.getShaderInfoLog(vertShader)
    console.error('gl-shader: Error compling vertex shader:', errLog)
    throw new Error('gl-shader: Error compiling vertex shader:' + errLog)
  }

  //Compile fragment shader
  var fragShader = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fragShader, fragSource)
  gl.compileShader(fragShader)
  if(!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    var errLog = gl.getShaderInfoLog(fragShader)
    console.error('gl-shader: Error compiling fragment shader:', errLog)
    throw new Error('gl-shader: Error compiling fragment shader:' + errLog)
  }

  //Link program
  var program = gl.createProgram()
  gl.attachShader(program, fragShader)
  gl.attachShader(program, vertShader)

  //Optional default attriubte locations
  attributes.forEach(function(a) {
    if (typeof a.location === 'number')
      gl.bindAttribLocation(program, a.location, a.name)
  })

  gl.linkProgram(program)
  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var errLog = gl.getProgramInfoLog(program)
    console.error('gl-shader: Error linking shader program:', errLog)
    throw new Error('gl-shader: Error linking shader program:' + errLog)
  }

  //Return final linked shader object
  var shader = new Shader(
    gl,
    program,
    vertShader,
    fragShader
  )
  shader.updateExports(uniforms, attributes)

  return shader
}

module.exports = createShader

},{"./lib/create-attributes":45,"./lib/create-uniforms":46,"./lib/reflect":47}],49:[function(require,module,exports){
'use strict'

var ndarray = require('ndarray')
var ops     = require('ndarray-ops')
var pool    = require('typedarray-pool')

module.exports = createTexture2D

var linearTypes = null
var filterTypes = null
var wrapTypes   = null

function lazyInitLinearTypes(gl) {
  linearTypes = [
    gl.LINEAR,
    gl.NEAREST_MIPMAP_LINEAR,
    gl.LINEAR_MIPMAP_NEAREST,
    gl.LINEAR_MIPMAP_NEAREST
  ]
  filterTypes = [
    gl.NEAREST,
    gl.LINEAR,
    gl.NEAREST_MIPMAP_NEAREST,
    gl.NEAREST_MIPMAP_LINEAR,
    gl.LINEAR_MIPMAP_NEAREST,
    gl.LINEAR_MIPMAP_LINEAR
  ]
  wrapTypes = [
    gl.REPEAT,
    gl.CLAMP_TO_EDGE,
    gl.MIRRORED_REPEAT
  ]
}

function acceptTextureDOM (obj) {
  return (
    ('undefined' != typeof HTMLCanvasElement && obj instanceof HTMLCanvasElement) ||
    ('undefined' != typeof HTMLImageElement && obj instanceof HTMLImageElement) ||
    ('undefined' != typeof HTMLVideoElement && obj instanceof HTMLVideoElement) ||
    ('undefined' != typeof ImageData && obj instanceof ImageData))
}

var convertFloatToUint8 = function(out, inp) {
  ops.muls(out, inp, 255.0)
}

function reshapeTexture(tex, w, h) {
  var gl = tex.gl
  var maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  if(w < 0 || w > maxSize || h < 0 || h > maxSize) {
    throw new Error('gl-texture2d: Invalid texture size')
  }
  tex._shape = [w, h]
  tex.bind()
  gl.texImage2D(gl.TEXTURE_2D, 0, tex.format, w, h, 0, tex.format, tex.type, null)
  tex._mipLevels = [0]
  return tex
}

function Texture2D(gl, handle, width, height, format, type) {
  this.gl = gl
  this.handle = handle
  this.format = format
  this.type = type
  this._shape = [width, height]
  this._mipLevels = [0]
  this._magFilter = gl.NEAREST
  this._minFilter = gl.NEAREST
  this._wrapS = gl.CLAMP_TO_EDGE
  this._wrapT = gl.CLAMP_TO_EDGE
  this._anisoSamples = 1

  var parent = this
  var wrapVector = [this._wrapS, this._wrapT]
  Object.defineProperties(wrapVector, [
    {
      get: function() {
        return parent._wrapS
      },
      set: function(v) {
        return parent.wrapS = v
      }
    },
    {
      get: function() {
        return parent._wrapT
      },
      set: function(v) {
        return parent.wrapT = v
      }
    }
  ])
  this._wrapVector = wrapVector

  var shapeVector = [this._shape[0], this._shape[1]]
  Object.defineProperties(shapeVector, [
    {
      get: function() {
        return parent._shape[0]
      },
      set: function(v) {
        return parent.width = v
      }
    },
    {
      get: function() {
        return parent._shape[1]
      },
      set: function(v) {
        return parent.height = v
      }
    }
  ])
  this._shapeVector = shapeVector
}

var proto = Texture2D.prototype

Object.defineProperties(proto, {
  minFilter: {
    get: function() {
      return this._minFilter
    },
    set: function(v) {
      this.bind()
      var gl = this.gl
      if(this.type === gl.FLOAT && linearTypes.indexOf(v) >= 0) {
        if(!gl.getExtension('OES_texture_float_linear')) {
          v = gl.NEAREST
        }
      }
      if(filterTypes.indexOf(v) < 0) {
        throw new Error('gl-texture2d: Unknown filter mode ' + v)
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, v)
      return this._minFilter = v
    }
  },
  magFilter: {
    get: function() {
      return this._magFilter
    },
    set: function(v) {
      this.bind()
      var gl = this.gl
      if(this.type === gl.FLOAT && linearTypes.indexOf(v) >= 0) {
        if(!gl.getExtension('OES_texture_float_linear')) {
          v = gl.NEAREST
        }
      }
      if(filterTypes.indexOf(v) < 0) {
        throw new Error('gl-texture2d: Unknown filter mode ' + v)
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, v)
      return this._magFilter = v
    }
  },
  mipSamples: {
    get: function() {
      return this._anisoSamples
    },
    set: function(i) {
      var psamples = this._anisoSamples
      this._anisoSamples = Math.max(i, 1)|0
      if(psamples !== this._anisoSamples) {
        var ext = this.gl.getExtension('EXT_texture_filter_anisotropic')
        if(ext) {
          this.gl.texParameterf(this.gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, this._anisoSamples)
        }
      }
      return this._anisoSamples
    }
  },
  wrapS: {
    get: function() {
      return this._wrapS
    },
    set: function(v) {
      this.bind()
      if(wrapTypes.indexOf(v) < 0) {
        throw new Error('gl-texture2d: Unknown wrap mode ' + v)
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, v)
      return this._wrapS = v
    }
  },
  wrapT: {
    get: function() {
      return this._wrapT
    },
    set: function(v) {
      this.bind()
      if(wrapTypes.indexOf(v) < 0) {
        throw new Error('gl-texture2d: Unknown wrap mode ' + v)
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, v)
      return this._wrapT = v
    }
  },
  wrap: {
    get: function() {
      return this._wrapVector
    },
    set: function(v) {
      if(!Array.isArray(v)) {
        v = [v,v]
      }
      if(v.length !== 2) {
        throw new Error('gl-texture2d: Must specify wrap mode for rows and columns')
      }
      for(var i=0; i<2; ++i) {
        if(wrapTypes.indexOf(v[i]) < 0) {
          throw new Error('gl-texture2d: Unknown wrap mode ' + v)
        }
      }
      this._wrapS = v[0]
      this._wrapT = v[1]

      var gl = this.gl
      this.bind()
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapS)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapT)

      return v
    }
  },
  shape: {
    get: function() {
      return this._shapeVector
    },
    set: function(x) {
      if(!Array.isArray(x)) {
        x = [x|0,x|0]
      } else {
        if(x.length !== 2) {
          throw new Error('gl-texture2d: Invalid texture shape')
        }
      }
      reshapeTexture(this, x[0]|0, x[1]|0)
      return [x[0]|0, x[1]|0]
    }
  },
  width: {
    get: function() {
      return this._shape[0]
    },
    set: function(w) {
      w = w|0
      reshapeTexture(this, w, this._shape[1])
      return w
    }
  },
  height: {
    get: function() {
      return this._shape[1]
    },
    set: function(h) {
      h = h|0
      reshapeTexture(this, this._shape[0], h)
      return h
    }
  }
})

proto.bind = function(unit) {
  var gl = this.gl
  if(unit !== undefined) {
    gl.activeTexture(gl.TEXTURE0 + (unit|0))
  }
  gl.bindTexture(gl.TEXTURE_2D, this.handle)
  if(unit !== undefined) {
    return (unit|0)
  }
  return gl.getParameter(gl.ACTIVE_TEXTURE) - gl.TEXTURE0
}

proto.dispose = function() {
  this.gl.deleteTexture(this.handle)
}

proto.generateMipmap = function() {
  this.bind()
  this.gl.generateMipmap(this.gl.TEXTURE_2D)

  //Update mip levels
  var l = Math.min(this._shape[0], this._shape[1])
  for(var i=0; l>0; ++i, l>>>=1) {
    if(this._mipLevels.indexOf(i) < 0) {
      this._mipLevels.push(i)
    }
  }
}

proto.setPixels = function(data, x_off, y_off, mip_level) {
  var gl = this.gl
  this.bind()
  if(Array.isArray(x_off)) {
    mip_level = y_off
    y_off = x_off[1]|0
    x_off = x_off[0]|0
  } else {
    x_off = x_off || 0
    y_off = y_off || 0
  }
  mip_level = mip_level || 0
  var directData = acceptTextureDOM(data) ? data : data.raw
  if(directData) {
    var needsMip = this._mipLevels.indexOf(mip_level) < 0
    if(needsMip) {
      gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.format, this.type, directData)
      this._mipLevels.push(mip_level)
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, mip_level, x_off, y_off, this.format, this.type, directData)
    }
  } else if(data.shape && data.stride && data.data) {
    if(data.shape.length < 2 ||
       x_off + data.shape[1] > this._shape[1]>>>mip_level ||
       y_off + data.shape[0] > this._shape[0]>>>mip_level ||
       x_off < 0 ||
       y_off < 0) {
      throw new Error('gl-texture2d: Texture dimensions are out of bounds')
    }
    texSubImageArray(gl, x_off, y_off, mip_level, this.format, this.type, this._mipLevels, data)
  } else {
    throw new Error('gl-texture2d: Unsupported data type')
  }
}


function isPacked(shape, stride) {
  if(shape.length === 3) {
    return  (stride[2] === 1) &&
            (stride[1] === shape[0]*shape[2]) &&
            (stride[0] === shape[2])
  }
  return  (stride[0] === 1) &&
          (stride[1] === shape[0])
}

function texSubImageArray(gl, x_off, y_off, mip_level, cformat, ctype, mipLevels, array) {
  var dtype = array.dtype
  var shape = array.shape.slice()
  if(shape.length < 2 || shape.length > 3) {
    throw new Error('gl-texture2d: Invalid ndarray, must be 2d or 3d')
  }
  var type = 0, format = 0
  var packed = isPacked(shape, array.stride.slice())
  if(dtype === 'float32') {
    type = gl.FLOAT
  } else if(dtype === 'float64') {
    type = gl.FLOAT
    packed = false
    dtype = 'float32'
  } else if(dtype === 'uint8') {
    type = gl.UNSIGNED_BYTE
  } else {
    type = gl.UNSIGNED_BYTE
    packed = false
    dtype = 'uint8'
  }
  var channels = 1
  if(shape.length === 2) {
    format = gl.LUMINANCE
    shape = [shape[0], shape[1], 1]
    array = ndarray(array.data, shape, [array.stride[0], array.stride[1], 1], array.offset)
  } else if(shape.length === 3) {
    if(shape[2] === 1) {
      format = gl.ALPHA
    } else if(shape[2] === 2) {
      format = gl.LUMINANCE_ALPHA
    } else if(shape[2] === 3) {
      format = gl.RGB
    } else if(shape[2] === 4) {
      format = gl.RGBA
    } else {
      throw new Error('gl-texture2d: Invalid shape for pixel coords')
    }
    channels = shape[2]
  } else {
    throw new Error('gl-texture2d: Invalid shape for texture')
  }
  //For 1-channel textures allow conversion between formats
  if((format  === gl.LUMINANCE || format  === gl.ALPHA) &&
     (cformat === gl.LUMINANCE || cformat === gl.ALPHA)) {
    format = cformat
  }
  if(format !== cformat) {
    throw new Error('gl-texture2d: Incompatible texture format for setPixels')
  }
  var size = array.size
  var needsMip = mipLevels.indexOf(mip_level) < 0
  if(needsMip) {
    mipLevels.push(mip_level)
  }
  if(type === ctype && packed) {
    //Array data types are compatible, can directly copy into texture
    if(array.offset === 0 && array.data.length === size) {
      if(needsMip) {
        gl.texImage2D(gl.TEXTURE_2D, mip_level, cformat, shape[0], shape[1], 0, cformat, ctype, array.data)
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, mip_level, x_off, y_off, shape[0], shape[1], cformat, ctype, array.data)
      }
    } else {
      if(needsMip) {
        gl.texImage2D(gl.TEXTURE_2D, mip_level, cformat, shape[0], shape[1], 0, cformat, ctype, array.data.subarray(array.offset, array.offset+size))
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, mip_level, x_off, y_off, shape[0], shape[1], cformat, ctype, array.data.subarray(array.offset, array.offset+size))
      }
    }
  } else {
    //Need to do type conversion to pack data into buffer
    var pack_buffer
    if(ctype === gl.FLOAT) {
      pack_buffer = pool.mallocFloat32(size)
    } else {
      pack_buffer = pool.mallocUint8(size)
    }
    var pack_view = ndarray(pack_buffer, shape, [shape[2], shape[2]*shape[0], 1])
    if(type === gl.FLOAT && ctype === gl.UNSIGNED_BYTE) {
      convertFloatToUint8(pack_view, array)
    } else {
      ops.assign(pack_view, array)
    }
    if(needsMip) {
      gl.texImage2D(gl.TEXTURE_2D, mip_level, cformat, shape[0], shape[1], 0, cformat, ctype, pack_buffer.subarray(0, size))
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, mip_level, x_off, y_off, shape[0], shape[1], cformat, ctype, pack_buffer.subarray(0, size))
    }
    if(ctype === gl.FLOAT) {
      pool.freeFloat32(pack_buffer)
    } else {
      pool.freeUint8(pack_buffer)
    }
  }
}

function initTexture(gl) {
  var tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

function createTextureShape(gl, width, height, format, type) {
  var maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  if(width < 0 || width > maxTextureSize || height < 0 || height  > maxTextureSize) {
    throw new Error('gl-texture2d: Invalid texture shape')
  }
  if(type === gl.FLOAT && !gl.getExtension('OES_texture_float')) {
    throw new Error('gl-texture2d: Floating point textures not supported on this platform')
  }
  var tex = initTexture(gl)
  gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, type, null)
  return new Texture2D(gl, tex, width, height, format, type)
}

function createTextureDOM(gl, directData, width, height, format, type) {
  var tex = initTexture(gl)
  gl.texImage2D(gl.TEXTURE_2D, 0, format, format, type, directData)
  return new Texture2D(gl, tex, width, height, format, type)
}

//Creates a texture from an ndarray
function createTextureArray(gl, array) {
  var dtype = array.dtype
  var shape = array.shape.slice()
  var maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  if(shape[0] < 0 || shape[0] > maxSize || shape[1] < 0 || shape[1] > maxSize) {
    throw new Error('gl-texture2d: Invalid texture size')
  }
  var packed = isPacked(shape, array.stride.slice())
  var type = 0
  if(dtype === 'float32') {
    type = gl.FLOAT
  } else if(dtype === 'float64') {
    type = gl.FLOAT
    packed = false
    dtype = 'float32'
  } else if(dtype === 'uint8') {
    type = gl.UNSIGNED_BYTE
  } else {
    type = gl.UNSIGNED_BYTE
    packed = false
    dtype = 'uint8'
  }
  var format = 0
  if(shape.length === 2) {
    format = gl.LUMINANCE
    shape = [shape[0], shape[1], 1]
    array = ndarray(array.data, shape, [array.stride[0], array.stride[1], 1], array.offset)
  } else if(shape.length === 3) {
    if(shape[2] === 1) {
      format = gl.ALPHA
    } else if(shape[2] === 2) {
      format = gl.LUMINANCE_ALPHA
    } else if(shape[2] === 3) {
      format = gl.RGB
    } else if(shape[2] === 4) {
      format = gl.RGBA
    } else {
      throw new Error('gl-texture2d: Invalid shape for pixel coords')
    }
  } else {
    throw new Error('gl-texture2d: Invalid shape for texture')
  }
  if(type === gl.FLOAT && !gl.getExtension('OES_texture_float')) {
    type = gl.UNSIGNED_BYTE
    packed = false
  }
  var buffer, buf_store
  var size = array.size
  if(!packed) {
    var stride = [shape[2], shape[2]*shape[0], 1]
    buf_store = pool.malloc(size, dtype)
    var buf_array = ndarray(buf_store, shape, stride, 0)
    if((dtype === 'float32' || dtype === 'float64') && type === gl.UNSIGNED_BYTE) {
      convertFloatToUint8(buf_array, array)
    } else {
      ops.assign(buf_array, array)
    }
    buffer = buf_store.subarray(0, size)
  } else if (array.offset === 0 && array.data.length === size) {
    buffer = array.data
  } else {
    buffer = array.data.subarray(array.offset, array.offset + size)
  }
  var tex = initTexture(gl)
  gl.texImage2D(gl.TEXTURE_2D, 0, format, shape[0], shape[1], 0, format, type, buffer)
  if(!packed) {
    pool.free(buf_store)
  }
  return new Texture2D(gl, tex, shape[0], shape[1], format, type)
}

function createTexture2D(gl) {
  if(arguments.length <= 1) {
    throw new Error('gl-texture2d: Missing arguments for texture2d constructor')
  }
  if(!linearTypes) {
    lazyInitLinearTypes(gl)
  }
  if(typeof arguments[1] === 'number') {
    return createTextureShape(gl, arguments[1], arguments[2], arguments[3]||gl.RGBA, arguments[4]||gl.UNSIGNED_BYTE)
  }
  if(Array.isArray(arguments[1])) {
    return createTextureShape(gl, arguments[1][0]|0, arguments[1][1]|0, arguments[2]||gl.RGBA, arguments[3]||gl.UNSIGNED_BYTE)
  }
  if(typeof arguments[1] === 'object') {
    var obj = arguments[1]
    var directData = acceptTextureDOM(obj) ? obj : obj.raw
    if (directData) {
      return createTextureDOM(gl, directData, obj.width|0, obj.height|0, arguments[2]||gl.RGBA, arguments[3]||gl.UNSIGNED_BYTE)
    } else if(obj.shape && obj.data && obj.stride) {
      return createTextureArray(gl, obj)
    }
  }
  throw new Error('gl-texture2d: Invalid arguments for texture2d constructor')
}

},{"ndarray":62,"ndarray-ops":61,"typedarray-pool":64}],50:[function(require,module,exports){
"use strict"

function doBind(gl, elements, attributes) {
  if(elements) {
    elements.bind()
  } else {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
  }
  var nattribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS)|0
  if(attributes) {
    if(attributes.length > nattribs) {
      throw new Error("gl-vao: Too many vertex attributes")
    }
    for(var i=0; i<attributes.length; ++i) {
      var attrib = attributes[i]
      if(attrib.buffer) {
        var buffer = attrib.buffer
        var size = attrib.size || 4
        var type = attrib.type || gl.FLOAT
        var normalized = !!attrib.normalized
        var stride = attrib.stride || 0
        var offset = attrib.offset || 0
        buffer.bind()
        gl.enableVertexAttribArray(i)
        gl.vertexAttribPointer(i, size, type, normalized, stride, offset)
      } else {
        if(typeof attrib === "number") {
          gl.vertexAttrib1f(i, attrib)
        } else if(attrib.length === 1) {
          gl.vertexAttrib1f(i, attrib[0])
        } else if(attrib.length === 2) {
          gl.vertexAttrib2f(i, attrib[0], attrib[1])
        } else if(attrib.length === 3) {
          gl.vertexAttrib3f(i, attrib[0], attrib[1], attrib[2])
        } else if(attrib.length === 4) {
          gl.vertexAttrib4f(i, attrib[0], attrib[1], attrib[2], attrib[3])
        } else {
          throw new Error("gl-vao: Invalid vertex attribute")
        }
        gl.disableVertexAttribArray(i)
      }
    }
    for(; i<nattribs; ++i) {
      gl.disableVertexAttribArray(i)
    }
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    for(var i=0; i<nattribs; ++i) {
      gl.disableVertexAttribArray(i)
    }
  }
}

module.exports = doBind
},{}],51:[function(require,module,exports){
"use strict"

var bindAttribs = require("./do-bind.js")

function VAOEmulated(gl) {
  this.gl = gl
  this._elements = null
  this._attributes = null
  this._elementsType = gl.UNSIGNED_SHORT
}

VAOEmulated.prototype.bind = function() {
  bindAttribs(this.gl, this._elements, this._attributes)
}

VAOEmulated.prototype.update = function(attributes, elements, elementsType) {
  this._elements = elements
  this._attributes = attributes
  this._elementsType = elementsType || this.gl.UNSIGNED_SHORT
}

VAOEmulated.prototype.dispose = function() { }
VAOEmulated.prototype.unbind = function() { }

VAOEmulated.prototype.draw = function(mode, count, offset) {
  offset = offset || 0
  var gl = this.gl
  if(this._elements) {
    gl.drawElements(mode, count, this._elementsType, offset)
  } else {
    gl.drawArrays(mode, offset, count)
  }
}

function createVAOEmulated(gl) {
  return new VAOEmulated(gl)
}

module.exports = createVAOEmulated
},{"./do-bind.js":50}],52:[function(require,module,exports){
"use strict"

var bindAttribs = require("./do-bind.js")

function VertexAttribute(location, dimension, a, b, c, d) {
  this.location = location
  this.dimension = dimension
  this.a = a
  this.b = b
  this.c = c
  this.d = d
}

VertexAttribute.prototype.bind = function(gl) {
  switch(this.dimension) {
    case 1:
      gl.vertexAttrib1f(this.location, this.a)
    break
    case 2:
      gl.vertexAttrib2f(this.location, this.a, this.b)
    break
    case 3:
      gl.vertexAttrib3f(this.location, this.a, this.b, this.c)
    break
    case 4:
      gl.vertexAttrib4f(this.location, this.a, this.b, this.c, this.d)
    break
  }
}

function VAONative(gl, ext, handle) {
  this.gl = gl
  this._ext = ext
  this.handle = handle
  this._attribs = []
  this._useElements = false
  this._elementsType = gl.UNSIGNED_SHORT
}

VAONative.prototype.bind = function() {
  this._ext.bindVertexArrayOES(this.handle)
  for(var i=0; i<this._attribs.length; ++i) {
    this._attribs[i].bind(this.gl)
  }
}

VAONative.prototype.unbind = function() {
  this._ext.bindVertexArrayOES(null)
}

VAONative.prototype.dispose = function() {
  this._ext.deleteVertexArrayOES(this.handle)
}

VAONative.prototype.update = function(attributes, elements, elementsType) {
  this.bind()
  bindAttribs(this.gl, elements, attributes)
  this.unbind()
  this._attribs.length = 0
  if(attributes)
  for(var i=0; i<attributes.length; ++i) {
    var a = attributes[i]
    if(typeof a === "number") {
      this._attribs.push(new VertexAttribute(i, 1, a))
    } else if(Array.isArray(a)) {
      this._attribs.push(new VertexAttribute(i, a.length, a[0], a[1], a[2], a[3]))
    }
  }
  this._useElements = !!elements
  this._elementsType = elementsType || this.gl.UNSIGNED_SHORT
}

VAONative.prototype.draw = function(mode, count, offset) {
  offset = offset || 0
  var gl = this.gl
  if(this._useElements) {
    gl.drawElements(mode, count, this._elementsType, offset)
  } else {
    gl.drawArrays(mode, offset, count)
  }
}

function createVAONative(gl, ext) {
  return new VAONative(gl, ext, ext.createVertexArrayOES())
}

module.exports = createVAONative
},{"./do-bind.js":50}],53:[function(require,module,exports){
"use strict"

var createVAONative = require("./lib/vao-native.js")
var createVAOEmulated = require("./lib/vao-emulated.js")

function ExtensionShim (gl) {
  this.bindVertexArrayOES = gl.bindVertexArray.bind(gl)
  this.createVertexArrayOES = gl.createVertexArray.bind(gl)
  this.deleteVertexArrayOES = gl.deleteVertexArray.bind(gl)
}

function createVAO(gl, attributes, elements, elementsType) {
  var ext = gl.createVertexArray
    ? new ExtensionShim(gl)
    : gl.getExtension('OES_vertex_array_object')
  var vao

  if(ext) {
    vao = createVAONative(gl, ext)
  } else {
    vao = createVAOEmulated(gl)
  }
  vao.update(attributes, elements, elementsType)
  return vao
}

module.exports = createVAO

},{"./lib/vao-emulated.js":51,"./lib/vao-native.js":52}],54:[function(require,module,exports){
module.exports = programify

var shader = require('gl-shader-core')

function programify(vertex, fragment, uniforms, attributes) {
  return function(gl) {
    return shader(gl, vertex, fragment, uniforms, attributes)
  }
}

},{"gl-shader-core":48}],55:[function(require,module,exports){
module.exports = noop

function noop() {
  throw new Error(
      'You should bundle your code ' +
      'using `glslify` as a transform.'
  )
}

},{}],56:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],57:[function(require,module,exports){
"use strict"

function invert(hash) {
  var result = {}
  for(var i in hash) {
    if(hash.hasOwnProperty(i)) {
      result[hash[i]] = i
    }
  }
  return result
}

module.exports = invert
},{}],58:[function(require,module,exports){
"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},{}],59:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],60:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],61:[function(require,module,exports){
"use strict"

var compile = require("cwise-compiler")

var EmptyProc = {
  body: "",
  args: [],
  thisVars: [],
  localVars: []
}

function fixup(x) {
  if(!x) {
    return EmptyProc
  }
  for(var i=0; i<x.args.length; ++i) {
    var a = x.args[i]
    if(i === 0) {
      x.args[i] = {name: a, lvalue:true, rvalue: !!x.rvalue, count:x.count||1 }
    } else {
      x.args[i] = {name: a, lvalue:false, rvalue:true, count: 1}
    }
  }
  if(!x.thisVars) {
    x.thisVars = []
  }
  if(!x.localVars) {
    x.localVars = []
  }
  return x
}

function pcompile(user_args) {
  return compile({
    args:     user_args.args,
    pre:      fixup(user_args.pre),
    body:     fixup(user_args.body),
    post:     fixup(user_args.proc),
    funcName: user_args.funcName
  })
}

function makeOp(user_args) {
  var args = []
  for(var i=0; i<user_args.args.length; ++i) {
    args.push("a"+i)
  }
  var wrapper = new Function("P", [
    "return function ", user_args.funcName, "_ndarrayops(", args.join(","), ") {P(", args.join(","), ");return a0}"
  ].join(""))
  return wrapper(pcompile(user_args))
}

var assign_ops = {
  add:  "+",
  sub:  "-",
  mul:  "*",
  div:  "/",
  mod:  "%",
  band: "&",
  bor:  "|",
  bxor: "^",
  lshift: "<<",
  rshift: ">>",
  rrshift: ">>>"
}
;(function(){
  for(var id in assign_ops) {
    var op = assign_ops[id]
    exports[id] = makeOp({
      args: ["array","array","array"],
      body: {args:["a","b","c"],
             body: "a=b"+op+"c"},
      funcName: id
    })
    exports[id+"eq"] = makeOp({
      args: ["array","array"],
      body: {args:["a","b"],
             body:"a"+op+"=b"},
      rvalue: true,
      funcName: id+"eq"
    })
    exports[id+"s"] = makeOp({
      args: ["array", "array", "scalar"],
      body: {args:["a","b","s"],
             body:"a=b"+op+"s"},
      funcName: id+"s"
    })
    exports[id+"seq"] = makeOp({
      args: ["array","scalar"],
      body: {args:["a","s"],
             body:"a"+op+"=s"},
      rvalue: true,
      funcName: id+"seq"
    })
  }
})();

var unary_ops = {
  not: "!",
  bnot: "~",
  neg: "-",
  recip: "1.0/"
}
;(function(){
  for(var id in unary_ops) {
    var op = unary_ops[id]
    exports[id] = makeOp({
      args: ["array", "array"],
      body: {args:["a","b"],
             body:"a="+op+"b"},
      funcName: id
    })
    exports[id+"eq"] = makeOp({
      args: ["array"],
      body: {args:["a"],
             body:"a="+op+"a"},
      rvalue: true,
      count: 2,
      funcName: id+"eq"
    })
  }
})();

var binary_ops = {
  and: "&&",
  or: "||",
  eq: "===",
  neq: "!==",
  lt: "<",
  gt: ">",
  leq: "<=",
  geq: ">="
}
;(function() {
  for(var id in binary_ops) {
    var op = binary_ops[id]
    exports[id] = makeOp({
      args: ["array","array","array"],
      body: {args:["a", "b", "c"],
             body:"a=b"+op+"c"},
      funcName: id
    })
    exports[id+"s"] = makeOp({
      args: ["array","array","scalar"],
      body: {args:["a", "b", "s"],
             body:"a=b"+op+"s"},
      funcName: id+"s"
    })
    exports[id+"eq"] = makeOp({
      args: ["array", "array"],
      body: {args:["a", "b"],
             body:"a=a"+op+"b"},
      rvalue:true,
      count:2,
      funcName: id+"eq"
    })
    exports[id+"seq"] = makeOp({
      args: ["array", "scalar"],
      body: {args:["a","s"],
             body:"a=a"+op+"s"},
      rvalue:true,
      count:2,
      funcName: id+"seq"
    })
  }
})();

var math_unary = [
  "abs",
  "acos",
  "asin",
  "atan",
  "ceil",
  "cos",
  "exp",
  "floor",
  "log",
  "round",
  "sin",
  "sqrt",
  "tan"
]
;(function() {
  for(var i=0; i<math_unary.length; ++i) {
    var f = math_unary[i]
    exports[f] = makeOp({
                    args: ["array", "array"],
                    pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                    body: {args:["a","b"], body:"a=this_f(b)", thisVars:["this_f"]},
                    funcName: f
                  })
    exports[f+"eq"] = makeOp({
                      args: ["array"],
                      pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                      body: {args: ["a"], body:"a=this_f(a)", thisVars:["this_f"]},
                      rvalue: true,
                      count: 2,
                      funcName: f+"eq"
                    })
  }
})();

var math_comm = [
  "max",
  "min",
  "atan2",
  "pow"
]
;(function(){
  for(var i=0; i<math_comm.length; ++i) {
    var f= math_comm[i]
    exports[f] = makeOp({
                  args:["array", "array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(b,c)", thisVars:["this_f"]},
                  funcName: f
                })
    exports[f+"s"] = makeOp({
                  args:["array", "array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(b,c)", thisVars:["this_f"]},
                  funcName: f+"s"
                  })
    exports[f+"eq"] = makeOp({ args:["array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(a,b)", thisVars:["this_f"]},
                  rvalue: true,
                  count: 2,
                  funcName: f+"eq"
                  })
    exports[f+"seq"] = makeOp({ args:["array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(a,b)", thisVars:["this_f"]},
                  rvalue:true,
                  count:2,
                  funcName: f+"seq"
                  })
  }
})();

var math_noncomm = [
  "atan2",
  "pow"
]
;(function(){
  for(var i=0; i<math_noncomm.length; ++i) {
    var f= math_noncomm[i]
    exports[f+"op"] = makeOp({
                  args:["array", "array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(c,b)", thisVars:["this_f"]},
                  funcName: f+"op"
                })
    exports[f+"ops"] = makeOp({
                  args:["array", "array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(c,b)", thisVars:["this_f"]},
                  funcName: f+"ops"
                  })
    exports[f+"opeq"] = makeOp({ args:["array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(b,a)", thisVars:["this_f"]},
                  rvalue: true,
                  count: 2,
                  funcName: f+"opeq"
                  })
    exports[f+"opseq"] = makeOp({ args:["array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(b,a)", thisVars:["this_f"]},
                  rvalue:true,
                  count:2,
                  funcName: f+"opseq"
                  })
  }
})();

exports.any = compile({
  args:["array"],
  pre: EmptyProc,
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "if(a){return true}", localVars: [], thisVars: []},
  post: {args:[], localVars:[], thisVars:[], body:"return false"},
  funcName: "any"
})

exports.all = compile({
  args:["array"],
  pre: EmptyProc,
  body: {args:[{name:"x", lvalue:false, rvalue:true, count:1}], body: "if(!x){return false}", localVars: [], thisVars: []},
  post: {args:[], localVars:[], thisVars:[], body:"return true"},
  funcName: "all"
})

exports.sum = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "this_s+=a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "sum"
})

exports.prod = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=1"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "this_s*=a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "prod"
})

exports.norm2squared = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:2}], body: "this_s+=a*a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "norm2squared"
})

exports.norm2 = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:2}], body: "this_s+=a*a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return Math.sqrt(this_s)"},
  funcName: "norm2"
})


exports.norminf = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:4}], body:"if(-a>this_s){this_s=-a}else if(a>this_s){this_s=a}", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "norminf"
})

exports.norm1 = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:3}], body: "this_s+=a<0?-a:a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "norm1"
})

exports.sup = compile({
  args: [ "array" ],
  pre:
   { body: "this_h=-Infinity",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] },
  body:
   { body: "if(_inline_1_arg0_>this_h)this_h=_inline_1_arg0_",
     args: [{"name":"_inline_1_arg0_","lvalue":false,"rvalue":true,"count":2} ],
     thisVars: [ "this_h" ],
     localVars: [] },
  post:
   { body: "return this_h",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] }
 })

exports.inf = compile({
  args: [ "array" ],
  pre:
   { body: "this_h=Infinity",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] },
  body:
   { body: "if(_inline_1_arg0_<this_h)this_h=_inline_1_arg0_",
     args: [{"name":"_inline_1_arg0_","lvalue":false,"rvalue":true,"count":2} ],
     thisVars: [ "this_h" ],
     localVars: [] },
  post:
   { body: "return this_h",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] }
 })

exports.argmin = compile({
  args:["index","array","shape"],
  pre:{
    body:"{this_v=Infinity;this_i=_inline_0_arg2_.slice(0)}",
    args:[
      {name:"_inline_0_arg0_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg1_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg2_",lvalue:false,rvalue:true,count:1}
      ],
    thisVars:["this_i","this_v"],
    localVars:[]},
  body:{
    body:"{if(_inline_1_arg1_<this_v){this_v=_inline_1_arg1_;for(var _inline_1_k=0;_inline_1_k<_inline_1_arg0_.length;++_inline_1_k){this_i[_inline_1_k]=_inline_1_arg0_[_inline_1_k]}}}",
    args:[
      {name:"_inline_1_arg0_",lvalue:false,rvalue:true,count:2},
      {name:"_inline_1_arg1_",lvalue:false,rvalue:true,count:2}],
    thisVars:["this_i","this_v"],
    localVars:["_inline_1_k"]},
  post:{
    body:"{return this_i}",
    args:[],
    thisVars:["this_i"],
    localVars:[]}
})

exports.argmax = compile({
  args:["index","array","shape"],
  pre:{
    body:"{this_v=-Infinity;this_i=_inline_0_arg2_.slice(0)}",
    args:[
      {name:"_inline_0_arg0_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg1_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg2_",lvalue:false,rvalue:true,count:1}
      ],
    thisVars:["this_i","this_v"],
    localVars:[]},
  body:{
    body:"{if(_inline_1_arg1_>this_v){this_v=_inline_1_arg1_;for(var _inline_1_k=0;_inline_1_k<_inline_1_arg0_.length;++_inline_1_k){this_i[_inline_1_k]=_inline_1_arg0_[_inline_1_k]}}}",
    args:[
      {name:"_inline_1_arg0_",lvalue:false,rvalue:true,count:2},
      {name:"_inline_1_arg1_",lvalue:false,rvalue:true,count:2}],
    thisVars:["this_i","this_v"],
    localVars:["_inline_1_k"]},
  post:{
    body:"{return this_i}",
    args:[],
    thisVars:["this_i"],
    localVars:[]}
})

exports.random = makeOp({
  args: ["array"],
  pre: {args:[], body:"this_f=Math.random", thisVars:["this_f"]},
  body: {args: ["a"], body:"a=this_f()", thisVars:["this_f"]},
  funcName: "random"
})

exports.assign = makeOp({
  args:["array", "array"],
  body: {args:["a", "b"], body:"a=b"},
  funcName: "assign" })

exports.assigns = makeOp({
  args:["array", "scalar"],
  body: {args:["a", "b"], body:"a=b"},
  funcName: "assigns" })


exports.equals = compile({
  args:["array", "array"],
  pre: EmptyProc,
  body: {args:[{name:"x", lvalue:false, rvalue:true, count:1},
               {name:"y", lvalue:false, rvalue:true, count:1}],
        body: "if(x!==y){return false}",
        localVars: [],
        thisVars: []},
  post: {args:[], localVars:[], thisVars:[], body:"return true"},
  funcName: "equals"
})



},{"cwise-compiler":8}],62:[function(require,module,exports){
var iota = require("iota-array")
var isBuffer = require("is-buffer")

var hasTypedArrays  = ((typeof Float64Array) !== "undefined")

function compare1st(a, b) {
  return a[0] - b[0]
}

function order() {
  var stride = this.stride
  var terms = new Array(stride.length)
  var i
  for(i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i]
  }
  terms.sort(compare1st)
  var result = new Array(terms.length)
  for(i=0; i<result.length; ++i) {
    result[i] = terms[i][1]
  }
  return result
}

function compileConstructor(dtype, dimension) {
  var className = ["View", dimension, "d", dtype].join("")
  if(dimension < 0) {
    className = "View_Nil" + dtype
  }
  var useGetters = (dtype === "generic")

  if(dimension === -1) {
    //Special case for trivial arrays
    var code =
      "function "+className+"(a){this.data=a;};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return -1};\
proto.size=0;\
proto.dimension=-1;\
proto.shape=proto.stride=proto.order=[];\
proto.lo=proto.hi=proto.transpose=proto.step=\
function(){return new "+className+"(this.data);};\
proto.get=proto.set=function(){};\
proto.pick=function(){return null};\
return function construct_"+className+"(a){return new "+className+"(a);}"
    var procedure = new Function(code)
    return procedure()
  } else if(dimension === 0) {
    //Special case for 0d arrays
    var code =
      "function "+className+"(a,d) {\
this.data = a;\
this.offset = d\
};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return this.offset};\
proto.dimension=0;\
proto.size=1;\
proto.shape=\
proto.stride=\
proto.order=[];\
proto.lo=\
proto.hi=\
proto.transpose=\
proto.step=function "+className+"_copy() {\
return new "+className+"(this.data,this.offset)\
};\
proto.pick=function "+className+"_pick(){\
return TrivialArray(this.data);\
};\
proto.valueOf=proto.get=function "+className+"_get(){\
return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
"};\
proto.set=function "+className+"_set(v){\
return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
};\
return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}"
    var procedure = new Function("TrivialArray", code)
    return procedure(CACHED_CONSTRUCTORS[dtype][0])
  }

  var code = ["'use strict'"]

  //Create constructor for view
  var indices = iota(dimension)
  var args = indices.map(function(i) { return "i"+i })
  var index_str = "this.offset+" + indices.map(function(i) {
        return "this.stride[" + i + "]*i" + i
      }).join("+")
  var shapeArg = indices.map(function(i) {
      return "b"+i
    }).join(",")
  var strideArg = indices.map(function(i) {
      return "c"+i
    }).join(",")
  code.push(
    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
      "this.shape=[" + shapeArg + "]",
      "this.stride=[" + strideArg + "]",
      "this.offset=d|0}",
    "var proto="+className+".prototype",
    "proto.dtype='"+dtype+"'",
    "proto.dimension="+dimension)

  //view.size:
  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
"}})")

  //view.order:
  if(dimension === 1) {
    code.push("proto.order=[0]")
  } else {
    code.push("Object.defineProperty(proto,'order',{get:")
    if(dimension < 4) {
      code.push("function "+className+"_order(){")
      if(dimension === 2) {
        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})")
      } else if(dimension === 3) {
        code.push(
"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
if(s0>s1){\
if(s1>s2){\
return [2,1,0];\
}else if(s0>s2){\
return [1,2,0];\
}else{\
return [1,0,2];\
}\
}else if(s0>s2){\
return [2,0,1];\
}else if(s2>s1){\
return [0,1,2];\
}else{\
return [0,2,1];\
}}})")
      }
    } else {
      code.push("ORDER})")
    }
  }

  //view.set(i0, ..., v):
  code.push(
"proto.set=function "+className+"_set("+args.join(",")+",v){")
  if(useGetters) {
    code.push("return this.data.set("+index_str+",v)}")
  } else {
    code.push("return this.data["+index_str+"]=v}")
  }

  //view.get(i0, ...):
  code.push("proto.get=function "+className+"_get("+args.join(",")+"){")
  if(useGetters) {
    code.push("return this.data.get("+index_str+")}")
  } else {
    code.push("return this.data["+index_str+"]}")
  }

  //view.index:
  code.push(
    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}")

  //view.hi():
  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
    indices.map(function(i) {
      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
    }).join(",")+","+
    indices.map(function(i) {
      return "this.stride["+i + "]"
    }).join(",")+",this.offset)}")

  //view.lo():
  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" })
  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" })
  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","))
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'&&i"+i+">=0){\
d=i"+i+"|0;\
b+=c"+i+"*d;\
a"+i+"-=d}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a"+i
    }).join(",")+","+
    indices.map(function(i) {
      return "c"+i
    }).join(",")+",b)}")

  //view.step():
  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
    indices.map(function(i) {
      return "a"+i+"=this.shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "b"+i+"=this.stride["+i+"]"
    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil")
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'){\
d=i"+i+"|0;\
if(d<0){\
c+=b"+i+"*(a"+i+"-1);\
a"+i+"=ceil(-a"+i+"/d)\
}else{\
a"+i+"=ceil(a"+i+"/d)\
}\
b"+i+"*=d\
}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a" + i
    }).join(",")+","+
    indices.map(function(i) {
      return "b" + i
    }).join(",")+",c)}")

  //view.transpose():
  var tShape = new Array(dimension)
  var tStride = new Array(dimension)
  for(var i=0; i<dimension; ++i) {
    tShape[i] = "a[i"+i+"]"
    tStride[i] = "b[i"+i+"]"
  }
  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}")

  //view.pick():
  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset")
  for(var i=0; i<dimension; ++i) {
    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}")
  }
  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}")

  //Add return statement
  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
    indices.map(function(i) {
      return "shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "stride["+i+"]"
    }).join(",")+",offset)}")

  //Compile procedure
  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"))
  return procedure(CACHED_CONSTRUCTORS[dtype], order)
}

function arrayDType(data) {
  if(isBuffer(data)) {
    return "buffer"
  }
  if(hasTypedArrays) {
    switch(Object.prototype.toString.call(data)) {
      case "[object Float64Array]":
        return "float64"
      case "[object Float32Array]":
        return "float32"
      case "[object Int8Array]":
        return "int8"
      case "[object Int16Array]":
        return "int16"
      case "[object Int32Array]":
        return "int32"
      case "[object Uint8Array]":
        return "uint8"
      case "[object Uint16Array]":
        return "uint16"
      case "[object Uint32Array]":
        return "uint32"
      case "[object Uint8ClampedArray]":
        return "uint8_clamped"
    }
  }
  if(Array.isArray(data)) {
    return "array"
  }
  return "generic"
}

var CACHED_CONSTRUCTORS = {
  "float32":[],
  "float64":[],
  "int8":[],
  "int16":[],
  "int32":[],
  "uint8":[],
  "uint16":[],
  "uint32":[],
  "array":[],
  "uint8_clamped":[],
  "buffer":[],
  "generic":[]
}

;(function() {
  for(var id in CACHED_CONSTRUCTORS) {
    CACHED_CONSTRUCTORS[id].push(compileConstructor(id, -1))
  }
});

function wrappedNDArrayCtor(data, shape, stride, offset) {
  if(data === undefined) {
    var ctor = CACHED_CONSTRUCTORS.array[0]
    return ctor([])
  } else if(typeof data === "number") {
    data = [data]
  }
  if(shape === undefined) {
    shape = [ data.length ]
  }
  var d = shape.length
  if(stride === undefined) {
    stride = new Array(d)
    for(var i=d-1, sz=1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  }
  if(offset === undefined) {
    offset = 0
    for(var i=0; i<d; ++i) {
      if(stride[i] < 0) {
        offset -= (shape[i]-1)*stride[i]
      }
    }
  }
  var dtype = arrayDType(data)
  var ctor_list = CACHED_CONSTRUCTORS[dtype]
  while(ctor_list.length <= d+1) {
    ctor_list.push(compileConstructor(dtype, ctor_list.length-1))
  }
  var ctor = ctor_list[d+1]
  return ctor(data, shape, stride, offset)
}

module.exports = wrappedNDArrayCtor

},{"iota-array":58,"is-buffer":60}],63:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canMutationObserver = typeof window !== 'undefined'
    && window.MutationObserver;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    var queue = [];

    if (canMutationObserver) {
        var hiddenDiv = document.createElement("div");
        var observer = new MutationObserver(function () {
            var queueList = queue.slice();
            queue.length = 0;
            queueList.forEach(function (fn) {
                fn();
            });
        });

        observer.observe(hiddenDiv, { attributes: true });

        return function nextTick(fn) {
            if (!queue.length) {
                hiddenDiv.setAttribute('yes', 'no');
            }
            queue.push(fn);
        };
    }

    if (canPost) {
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],64:[function(require,module,exports){
(function (global,Buffer){
'use strict'

var bits = require('bit-twiddle')
var dup = require('dup')

//Legacy pool support
if(!global.__TYPEDARRAY_POOL) {
  global.__TYPEDARRAY_POOL = {
      UINT8   : dup([32, 0])
    , UINT16  : dup([32, 0])
    , UINT32  : dup([32, 0])
    , INT8    : dup([32, 0])
    , INT16   : dup([32, 0])
    , INT32   : dup([32, 0])
    , FLOAT   : dup([32, 0])
    , DOUBLE  : dup([32, 0])
    , DATA    : dup([32, 0])
    , UINT8C  : dup([32, 0])
    , BUFFER  : dup([32, 0])
  }
}

var hasUint8C = (typeof Uint8ClampedArray) !== 'undefined'
var POOL = global.__TYPEDARRAY_POOL

//Upgrade pool
if(!POOL.UINT8C) {
  POOL.UINT8C = dup([32, 0])
}
if(!POOL.BUFFER) {
  POOL.BUFFER = dup([32, 0])
}

//New technique: Only allocate from ArrayBufferView and Buffer
var DATA    = POOL.DATA
  , BUFFER  = POOL.BUFFER

exports.free = function free(array) {
  if(Buffer.isBuffer(array)) {
    BUFFER[bits.log2(array.length)].push(array)
  } else {
    if(Object.prototype.toString.call(array) !== '[object ArrayBuffer]') {
      array = array.buffer
    }
    if(!array) {
      return
    }
    var n = array.length || array.byteLength
    var log_n = bits.log2(n)|0
    DATA[log_n].push(array)
  }
}

function freeArrayBuffer(buffer) {
  if(!buffer) {
    return
  }
  var n = buffer.length || buffer.byteLength
  var log_n = bits.log2(n)
  DATA[log_n].push(buffer)
}

function freeTypedArray(array) {
  freeArrayBuffer(array.buffer)
}

exports.freeUint8 =
exports.freeUint16 =
exports.freeUint32 =
exports.freeInt8 =
exports.freeInt16 =
exports.freeInt32 =
exports.freeFloat32 =
exports.freeFloat =
exports.freeFloat64 =
exports.freeDouble =
exports.freeUint8Clamped =
exports.freeDataView = freeTypedArray

exports.freeArrayBuffer = freeArrayBuffer

exports.freeBuffer = function freeBuffer(array) {
  BUFFER[bits.log2(array.length)].push(array)
}

exports.malloc = function malloc(n, dtype) {
  if(dtype === undefined || dtype === 'arraybuffer') {
    return mallocArrayBuffer(n)
  } else {
    switch(dtype) {
      case 'uint8':
        return mallocUint8(n)
      case 'uint16':
        return mallocUint16(n)
      case 'uint32':
        return mallocUint32(n)
      case 'int8':
        return mallocInt8(n)
      case 'int16':
        return mallocInt16(n)
      case 'int32':
        return mallocInt32(n)
      case 'float':
      case 'float32':
        return mallocFloat(n)
      case 'double':
      case 'float64':
        return mallocDouble(n)
      case 'uint8_clamped':
        return mallocUint8Clamped(n)
      case 'buffer':
        return mallocBuffer(n)
      case 'data':
      case 'dataview':
        return mallocDataView(n)

      default:
        return null
    }
  }
  return null
}

function mallocArrayBuffer(n) {
  var n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var d = DATA[log_n]
  if(d.length > 0) {
    return d.pop()
  }
  return new ArrayBuffer(n)
}
exports.mallocArrayBuffer = mallocArrayBuffer

function mallocUint8(n) {
  return new Uint8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocUint8 = mallocUint8

function mallocUint16(n) {
  return new Uint16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocUint16 = mallocUint16

function mallocUint32(n) {
  return new Uint32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocUint32 = mallocUint32

function mallocInt8(n) {
  return new Int8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocInt8 = mallocInt8

function mallocInt16(n) {
  return new Int16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocInt16 = mallocInt16

function mallocInt32(n) {
  return new Int32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocInt32 = mallocInt32

function mallocFloat(n) {
  return new Float32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocFloat32 = exports.mallocFloat = mallocFloat

function mallocDouble(n) {
  return new Float64Array(mallocArrayBuffer(8*n), 0, n)
}
exports.mallocFloat64 = exports.mallocDouble = mallocDouble

function mallocUint8Clamped(n) {
  if(hasUint8C) {
    return new Uint8ClampedArray(mallocArrayBuffer(n), 0, n)
  } else {
    return mallocUint8(n)
  }
}
exports.mallocUint8Clamped = mallocUint8Clamped

function mallocDataView(n) {
  return new DataView(mallocArrayBuffer(n), 0, n)
}
exports.mallocDataView = mallocDataView

function mallocBuffer(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = BUFFER[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Buffer(n)
}
exports.mallocBuffer = mallocBuffer

exports.clearCache = function clearCache() {
  for(var i=0; i<32; ++i) {
    POOL.UINT8[i].length = 0
    POOL.UINT16[i].length = 0
    POOL.UINT32[i].length = 0
    POOL.INT8[i].length = 0
    POOL.INT16[i].length = 0
    POOL.INT32[i].length = 0
    POOL.FLOAT[i].length = 0
    POOL.DOUBLE[i].length = 0
    POOL.UINT8C[i].length = 0
    DATA[i].length = 0
    BUFFER[i].length = 0
  }
}
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy90eXBlZGFycmF5LXBvb2wvcG9vbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG52YXIgYml0cyA9IHJlcXVpcmUoJ2JpdC10d2lkZGxlJylcbnZhciBkdXAgPSByZXF1aXJlKCdkdXAnKVxuXG4vL0xlZ2FjeSBwb29sIHN1cHBvcnRcbmlmKCFnbG9iYWwuX19UWVBFREFSUkFZX1BPT0wpIHtcbiAgZ2xvYmFsLl9fVFlQRURBUlJBWV9QT09MID0ge1xuICAgICAgVUlOVDggICA6IGR1cChbMzIsIDBdKVxuICAgICwgVUlOVDE2ICA6IGR1cChbMzIsIDBdKVxuICAgICwgVUlOVDMyICA6IGR1cChbMzIsIDBdKVxuICAgICwgSU5UOCAgICA6IGR1cChbMzIsIDBdKVxuICAgICwgSU5UMTYgICA6IGR1cChbMzIsIDBdKVxuICAgICwgSU5UMzIgICA6IGR1cChbMzIsIDBdKVxuICAgICwgRkxPQVQgICA6IGR1cChbMzIsIDBdKVxuICAgICwgRE9VQkxFICA6IGR1cChbMzIsIDBdKVxuICAgICwgREFUQSAgICA6IGR1cChbMzIsIDBdKVxuICAgICwgVUlOVDhDICA6IGR1cChbMzIsIDBdKVxuICAgICwgQlVGRkVSICA6IGR1cChbMzIsIDBdKVxuICB9XG59XG5cbnZhciBoYXNVaW50OEMgPSAodHlwZW9mIFVpbnQ4Q2xhbXBlZEFycmF5KSAhPT0gJ3VuZGVmaW5lZCdcbnZhciBQT09MID0gZ2xvYmFsLl9fVFlQRURBUlJBWV9QT09MXG5cbi8vVXBncmFkZSBwb29sXG5pZighUE9PTC5VSU5UOEMpIHtcbiAgUE9PTC5VSU5UOEMgPSBkdXAoWzMyLCAwXSlcbn1cbmlmKCFQT09MLkJVRkZFUikge1xuICBQT09MLkJVRkZFUiA9IGR1cChbMzIsIDBdKVxufVxuXG4vL05ldyB0ZWNobmlxdWU6IE9ubHkgYWxsb2NhdGUgZnJvbSBBcnJheUJ1ZmZlclZpZXcgYW5kIEJ1ZmZlclxudmFyIERBVEEgICAgPSBQT09MLkRBVEFcbiAgLCBCVUZGRVIgID0gUE9PTC5CVUZGRVJcblxuZXhwb3J0cy5mcmVlID0gZnVuY3Rpb24gZnJlZShhcnJheSkge1xuICBpZihCdWZmZXIuaXNCdWZmZXIoYXJyYXkpKSB7XG4gICAgQlVGRkVSW2JpdHMubG9nMihhcnJheS5sZW5ndGgpXS5wdXNoKGFycmF5KVxuICB9IGVsc2Uge1xuICAgIGlmKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhcnJheSkgIT09ICdbb2JqZWN0IEFycmF5QnVmZmVyXScpIHtcbiAgICAgIGFycmF5ID0gYXJyYXkuYnVmZmVyXG4gICAgfVxuICAgIGlmKCFhcnJheSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHZhciBuID0gYXJyYXkubGVuZ3RoIHx8IGFycmF5LmJ5dGVMZW5ndGhcbiAgICB2YXIgbG9nX24gPSBiaXRzLmxvZzIobil8MFxuICAgIERBVEFbbG9nX25dLnB1c2goYXJyYXkpXG4gIH1cbn1cblxuZnVuY3Rpb24gZnJlZUFycmF5QnVmZmVyKGJ1ZmZlcikge1xuICBpZighYnVmZmVyKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgdmFyIG4gPSBidWZmZXIubGVuZ3RoIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoXG4gIHZhciBsb2dfbiA9IGJpdHMubG9nMihuKVxuICBEQVRBW2xvZ19uXS5wdXNoKGJ1ZmZlcilcbn1cblxuZnVuY3Rpb24gZnJlZVR5cGVkQXJyYXkoYXJyYXkpIHtcbiAgZnJlZUFycmF5QnVmZmVyKGFycmF5LmJ1ZmZlcilcbn1cblxuZXhwb3J0cy5mcmVlVWludDggPVxuZXhwb3J0cy5mcmVlVWludDE2ID1cbmV4cG9ydHMuZnJlZVVpbnQzMiA9XG5leHBvcnRzLmZyZWVJbnQ4ID1cbmV4cG9ydHMuZnJlZUludDE2ID1cbmV4cG9ydHMuZnJlZUludDMyID1cbmV4cG9ydHMuZnJlZUZsb2F0MzIgPSBcbmV4cG9ydHMuZnJlZUZsb2F0ID1cbmV4cG9ydHMuZnJlZUZsb2F0NjQgPSBcbmV4cG9ydHMuZnJlZURvdWJsZSA9IFxuZXhwb3J0cy5mcmVlVWludDhDbGFtcGVkID0gXG5leHBvcnRzLmZyZWVEYXRhVmlldyA9IGZyZWVUeXBlZEFycmF5XG5cbmV4cG9ydHMuZnJlZUFycmF5QnVmZmVyID0gZnJlZUFycmF5QnVmZmVyXG5cbmV4cG9ydHMuZnJlZUJ1ZmZlciA9IGZ1bmN0aW9uIGZyZWVCdWZmZXIoYXJyYXkpIHtcbiAgQlVGRkVSW2JpdHMubG9nMihhcnJheS5sZW5ndGgpXS5wdXNoKGFycmF5KVxufVxuXG5leHBvcnRzLm1hbGxvYyA9IGZ1bmN0aW9uIG1hbGxvYyhuLCBkdHlwZSkge1xuICBpZihkdHlwZSA9PT0gdW5kZWZpbmVkIHx8IGR0eXBlID09PSAnYXJyYXlidWZmZXInKSB7XG4gICAgcmV0dXJuIG1hbGxvY0FycmF5QnVmZmVyKG4pXG4gIH0gZWxzZSB7XG4gICAgc3dpdGNoKGR0eXBlKSB7XG4gICAgICBjYXNlICd1aW50OCc6XG4gICAgICAgIHJldHVybiBtYWxsb2NVaW50OChuKVxuICAgICAgY2FzZSAndWludDE2JzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY1VpbnQxNihuKVxuICAgICAgY2FzZSAndWludDMyJzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY1VpbnQzMihuKVxuICAgICAgY2FzZSAnaW50OCc6XG4gICAgICAgIHJldHVybiBtYWxsb2NJbnQ4KG4pXG4gICAgICBjYXNlICdpbnQxNic6XG4gICAgICAgIHJldHVybiBtYWxsb2NJbnQxNihuKVxuICAgICAgY2FzZSAnaW50MzInOlxuICAgICAgICByZXR1cm4gbWFsbG9jSW50MzIobilcbiAgICAgIGNhc2UgJ2Zsb2F0JzpcbiAgICAgIGNhc2UgJ2Zsb2F0MzInOlxuICAgICAgICByZXR1cm4gbWFsbG9jRmxvYXQobilcbiAgICAgIGNhc2UgJ2RvdWJsZSc6XG4gICAgICBjYXNlICdmbG9hdDY0JzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY0RvdWJsZShuKVxuICAgICAgY2FzZSAndWludDhfY2xhbXBlZCc6XG4gICAgICAgIHJldHVybiBtYWxsb2NVaW50OENsYW1wZWQobilcbiAgICAgIGNhc2UgJ2J1ZmZlcic6XG4gICAgICAgIHJldHVybiBtYWxsb2NCdWZmZXIobilcbiAgICAgIGNhc2UgJ2RhdGEnOlxuICAgICAgY2FzZSAnZGF0YXZpZXcnOlxuICAgICAgICByZXR1cm4gbWFsbG9jRGF0YVZpZXcobilcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cblxuZnVuY3Rpb24gbWFsbG9jQXJyYXlCdWZmZXIobikge1xuICB2YXIgbiA9IGJpdHMubmV4dFBvdzIobilcbiAgdmFyIGxvZ19uID0gYml0cy5sb2cyKG4pXG4gIHZhciBkID0gREFUQVtsb2dfbl1cbiAgaWYoZC5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGQucG9wKClcbiAgfVxuICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKG4pXG59XG5leHBvcnRzLm1hbGxvY0FycmF5QnVmZmVyID0gbWFsbG9jQXJyYXlCdWZmZXJcblxuZnVuY3Rpb24gbWFsbG9jVWludDgobikge1xuICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkobWFsbG9jQXJyYXlCdWZmZXIobiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY1VpbnQ4ID0gbWFsbG9jVWludDhcblxuZnVuY3Rpb24gbWFsbG9jVWludDE2KG4pIHtcbiAgcmV0dXJuIG5ldyBVaW50MTZBcnJheShtYWxsb2NBcnJheUJ1ZmZlcigyKm4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NVaW50MTYgPSBtYWxsb2NVaW50MTZcblxuZnVuY3Rpb24gbWFsbG9jVWludDMyKG4pIHtcbiAgcmV0dXJuIG5ldyBVaW50MzJBcnJheShtYWxsb2NBcnJheUJ1ZmZlcig0Km4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NVaW50MzIgPSBtYWxsb2NVaW50MzJcblxuZnVuY3Rpb24gbWFsbG9jSW50OChuKSB7XG4gIHJldHVybiBuZXcgSW50OEFycmF5KG1hbGxvY0FycmF5QnVmZmVyKG4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NJbnQ4ID0gbWFsbG9jSW50OFxuXG5mdW5jdGlvbiBtYWxsb2NJbnQxNihuKSB7XG4gIHJldHVybiBuZXcgSW50MTZBcnJheShtYWxsb2NBcnJheUJ1ZmZlcigyKm4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NJbnQxNiA9IG1hbGxvY0ludDE2XG5cbmZ1bmN0aW9uIG1hbGxvY0ludDMyKG4pIHtcbiAgcmV0dXJuIG5ldyBJbnQzMkFycmF5KG1hbGxvY0FycmF5QnVmZmVyKDQqbiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY0ludDMyID0gbWFsbG9jSW50MzJcblxuZnVuY3Rpb24gbWFsbG9jRmxvYXQobikge1xuICByZXR1cm4gbmV3IEZsb2F0MzJBcnJheShtYWxsb2NBcnJheUJ1ZmZlcig0Km4pLCAwLCBuKVxufVxuZXhwb3J0cy5tYWxsb2NGbG9hdDMyID0gZXhwb3J0cy5tYWxsb2NGbG9hdCA9IG1hbGxvY0Zsb2F0XG5cbmZ1bmN0aW9uIG1hbGxvY0RvdWJsZShuKSB7XG4gIHJldHVybiBuZXcgRmxvYXQ2NEFycmF5KG1hbGxvY0FycmF5QnVmZmVyKDgqbiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY0Zsb2F0NjQgPSBleHBvcnRzLm1hbGxvY0RvdWJsZSA9IG1hbGxvY0RvdWJsZVxuXG5mdW5jdGlvbiBtYWxsb2NVaW50OENsYW1wZWQobikge1xuICBpZihoYXNVaW50OEMpIHtcbiAgICByZXR1cm4gbmV3IFVpbnQ4Q2xhbXBlZEFycmF5KG1hbGxvY0FycmF5QnVmZmVyKG4pLCAwLCBuKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBtYWxsb2NVaW50OChuKVxuICB9XG59XG5leHBvcnRzLm1hbGxvY1VpbnQ4Q2xhbXBlZCA9IG1hbGxvY1VpbnQ4Q2xhbXBlZFxuXG5mdW5jdGlvbiBtYWxsb2NEYXRhVmlldyhuKSB7XG4gIHJldHVybiBuZXcgRGF0YVZpZXcobWFsbG9jQXJyYXlCdWZmZXIobiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY0RhdGFWaWV3ID0gbWFsbG9jRGF0YVZpZXdcblxuZnVuY3Rpb24gbWFsbG9jQnVmZmVyKG4pIHtcbiAgbiA9IGJpdHMubmV4dFBvdzIobilcbiAgdmFyIGxvZ19uID0gYml0cy5sb2cyKG4pXG4gIHZhciBjYWNoZSA9IEJVRkZFUltsb2dfbl1cbiAgaWYoY2FjaGUubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBjYWNoZS5wb3AoKVxuICB9XG4gIHJldHVybiBuZXcgQnVmZmVyKG4pXG59XG5leHBvcnRzLm1hbGxvY0J1ZmZlciA9IG1hbGxvY0J1ZmZlclxuXG5leHBvcnRzLmNsZWFyQ2FjaGUgPSBmdW5jdGlvbiBjbGVhckNhY2hlKCkge1xuICBmb3IodmFyIGk9MDsgaTwzMjsgKytpKSB7XG4gICAgUE9PTC5VSU5UOFtpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5VSU5UMTZbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuVUlOVDMyW2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLklOVDhbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuSU5UMTZbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuSU5UMzJbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuRkxPQVRbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuRE9VQkxFW2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLlVJTlQ4Q1tpXS5sZW5ndGggPSAwXG4gICAgREFUQVtpXS5sZW5ndGggPSAwXG4gICAgQlVGRkVSW2ldLmxlbmd0aCA9IDBcbiAgfVxufSJdfQ==
},{"bit-twiddle":5,"buffer":7,"dup":12}],65:[function(require,module,exports){
"use strict"

function unique_pred(list, compare) {
  var ptr = 1
    , len = list.length
    , a=list[0], b=list[0]
  for(var i=1; i<len; ++i) {
    b = a
    a = list[i]
    if(compare(a, b)) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique_eq(list) {
  var ptr = 1
    , len = list.length
    , a=list[0], b = list[0]
  for(var i=1; i<len; ++i, b=a) {
    b = a
    a = list[i]
    if(a !== b) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique(list, compare, sorted) {
  if(list.length === 0) {
    return list
  }
  if(compare) {
    if(!sorted) {
      list.sort(compare)
    }
    return unique_pred(list, compare)
  }
  if(!sorted) {
    list.sort()
  }
  return unique_eq(list)
}

module.exports = unique

},{}],66:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],67:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],68:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgZm9ybWF0UmVnRXhwID0gLyVbc2RqJV0vZztcbmV4cG9ydHMuZm9ybWF0ID0gZnVuY3Rpb24oZikge1xuICBpZiAoIWlzU3RyaW5nKGYpKSB7XG4gICAgdmFyIG9iamVjdHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgb2JqZWN0cy5wdXNoKGluc3BlY3QoYXJndW1lbnRzW2ldKSk7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIHZhciBpID0gMTtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciBsZW4gPSBhcmdzLmxlbmd0aDtcbiAgdmFyIHN0ciA9IFN0cmluZyhmKS5yZXBsYWNlKGZvcm1hdFJlZ0V4cCwgZnVuY3Rpb24oeCkge1xuICAgIGlmICh4ID09PSAnJSUnKSByZXR1cm4gJyUnO1xuICAgIGlmIChpID49IGxlbikgcmV0dXJuIHg7XG4gICAgc3dpdGNoICh4KSB7XG4gICAgICBjYXNlICclcyc6IHJldHVybiBTdHJpbmcoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVkJzogcmV0dXJuIE51bWJlcihhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWonOlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhcmdzW2krK10pO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuICdbQ2lyY3VsYXJdJztcbiAgICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuICB9KTtcbiAgZm9yICh2YXIgeCA9IGFyZ3NbaV07IGkgPCBsZW47IHggPSBhcmdzWysraV0pIHtcbiAgICBpZiAoaXNOdWxsKHgpIHx8ICFpc09iamVjdCh4KSkge1xuICAgICAgc3RyICs9ICcgJyArIHg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciArPSAnICcgKyBpbnNwZWN0KHgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RyO1xufTtcblxuXG4vLyBNYXJrIHRoYXQgYSBtZXRob2Qgc2hvdWxkIG5vdCBiZSB1c2VkLlxuLy8gUmV0dXJucyBhIG1vZGlmaWVkIGZ1bmN0aW9uIHdoaWNoIHdhcm5zIG9uY2UgYnkgZGVmYXVsdC5cbi8vIElmIC0tbm8tZGVwcmVjYXRpb24gaXMgc2V0LCB0aGVuIGl0IGlzIGEgbm8tb3AuXG5leHBvcnRzLmRlcHJlY2F0ZSA9IGZ1bmN0aW9uKGZuLCBtc2cpIHtcbiAgLy8gQWxsb3cgZm9yIGRlcHJlY2F0aW5nIHRoaW5ncyBpbiB0aGUgcHJvY2VzcyBvZiBzdGFydGluZyB1cC5cbiAgaWYgKGlzVW5kZWZpbmVkKGdsb2JhbC5wcm9jZXNzKSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmRlcHJlY2F0ZShmbiwgbXNnKS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuICBpZiAocHJvY2Vzcy5ub0RlcHJlY2F0aW9uID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuO1xuICB9XG5cbiAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBkZXByZWNhdGVkKCkge1xuICAgIGlmICghd2FybmVkKSB7XG4gICAgICBpZiAocHJvY2Vzcy50aHJvd0RlcHJlY2F0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpO1xuICAgICAgfSBlbHNlIGlmIChwcm9jZXNzLnRyYWNlRGVwcmVjYXRpb24pIHtcbiAgICAgICAgY29uc29sZS50cmFjZShtc2cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihtc2cpO1xuICAgICAgfVxuICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICByZXR1cm4gZGVwcmVjYXRlZDtcbn07XG5cblxudmFyIGRlYnVncyA9IHt9O1xudmFyIGRlYnVnRW52aXJvbjtcbmV4cG9ydHMuZGVidWdsb2cgPSBmdW5jdGlvbihzZXQpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKGRlYnVnRW52aXJvbikpXG4gICAgZGVidWdFbnZpcm9uID0gcHJvY2Vzcy5lbnYuTk9ERV9ERUJVRyB8fCAnJztcbiAgc2V0ID0gc2V0LnRvVXBwZXJDYXNlKCk7XG4gIGlmICghZGVidWdzW3NldF0pIHtcbiAgICBpZiAobmV3IFJlZ0V4cCgnXFxcXGInICsgc2V0ICsgJ1xcXFxiJywgJ2knKS50ZXN0KGRlYnVnRW52aXJvbikpIHtcbiAgICAgIHZhciBwaWQgPSBwcm9jZXNzLnBpZDtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBtc2cgPSBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCclcyAlZDogJXMnLCBzZXQsIHBpZCwgbXNnKTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlYnVnc1tzZXRdO1xufTtcblxuXG4vKipcbiAqIEVjaG9zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlLiBUcnlzIHRvIHByaW50IHRoZSB2YWx1ZSBvdXRcbiAqIGluIHRoZSBiZXN0IHdheSBwb3NzaWJsZSBnaXZlbiB0aGUgZGlmZmVyZW50IHR5cGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBwcmludCBvdXQuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyBPcHRpb25hbCBvcHRpb25zIG9iamVjdCB0aGF0IGFsdGVycyB0aGUgb3V0cHV0LlxuICovXG4vKiBsZWdhY3k6IG9iaiwgc2hvd0hpZGRlbiwgZGVwdGgsIGNvbG9ycyovXG5mdW5jdGlvbiBpbnNwZWN0KG9iaiwgb3B0cykge1xuICAvLyBkZWZhdWx0IG9wdGlvbnNcbiAgdmFyIGN0eCA9IHtcbiAgICBzZWVuOiBbXSxcbiAgICBzdHlsaXplOiBzdHlsaXplTm9Db2xvclxuICB9O1xuICAvLyBsZWdhY3kuLi5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykgY3R4LmRlcHRoID0gYXJndW1lbnRzWzJdO1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSA0KSBjdHguY29sb3JzID0gYXJndW1lbnRzWzNdO1xuICBpZiAoaXNCb29sZWFuKG9wdHMpKSB7XG4gICAgLy8gbGVnYWN5Li4uXG4gICAgY3R4LnNob3dIaWRkZW4gPSBvcHRzO1xuICB9IGVsc2UgaWYgKG9wdHMpIHtcbiAgICAvLyBnb3QgYW4gXCJvcHRpb25zXCIgb2JqZWN0XG4gICAgZXhwb3J0cy5fZXh0ZW5kKGN0eCwgb3B0cyk7XG4gIH1cbiAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LnNob3dIaWRkZW4pKSBjdHguc2hvd0hpZGRlbiA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmRlcHRoKSkgY3R4LmRlcHRoID0gMjtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jb2xvcnMpKSBjdHguY29sb3JzID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY3VzdG9tSW5zcGVjdCkpIGN0eC5jdXN0b21JbnNwZWN0ID0gdHJ1ZTtcbiAgaWYgKGN0eC5jb2xvcnMpIGN0eC5zdHlsaXplID0gc3R5bGl6ZVdpdGhDb2xvcjtcbiAgcmV0dXJuIGZvcm1hdFZhbHVlKGN0eCwgb2JqLCBjdHguZGVwdGgpO1xufVxuZXhwb3J0cy5pbnNwZWN0ID0gaW5zcGVjdDtcblxuXG4vLyBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjZ3JhcGhpY3Ncbmluc3BlY3QuY29sb3JzID0ge1xuICAnYm9sZCcgOiBbMSwgMjJdLFxuICAnaXRhbGljJyA6IFszLCAyM10sXG4gICd1bmRlcmxpbmUnIDogWzQsIDI0XSxcbiAgJ2ludmVyc2UnIDogWzcsIDI3XSxcbiAgJ3doaXRlJyA6IFszNywgMzldLFxuICAnZ3JleScgOiBbOTAsIDM5XSxcbiAgJ2JsYWNrJyA6IFszMCwgMzldLFxuICAnYmx1ZScgOiBbMzQsIDM5XSxcbiAgJ2N5YW4nIDogWzM2LCAzOV0sXG4gICdncmVlbicgOiBbMzIsIDM5XSxcbiAgJ21hZ2VudGEnIDogWzM1LCAzOV0sXG4gICdyZWQnIDogWzMxLCAzOV0sXG4gICd5ZWxsb3cnIDogWzMzLCAzOV1cbn07XG5cbi8vIERvbid0IHVzZSAnYmx1ZScgbm90IHZpc2libGUgb24gY21kLmV4ZVxuaW5zcGVjdC5zdHlsZXMgPSB7XG4gICdzcGVjaWFsJzogJ2N5YW4nLFxuICAnbnVtYmVyJzogJ3llbGxvdycsXG4gICdib29sZWFuJzogJ3llbGxvdycsXG4gICd1bmRlZmluZWQnOiAnZ3JleScsXG4gICdudWxsJzogJ2JvbGQnLFxuICAnc3RyaW5nJzogJ2dyZWVuJyxcbiAgJ2RhdGUnOiAnbWFnZW50YScsXG4gIC8vIFwibmFtZVwiOiBpbnRlbnRpb25hbGx5IG5vdCBzdHlsaW5nXG4gICdyZWdleHAnOiAncmVkJ1xufTtcblxuXG5mdW5jdGlvbiBzdHlsaXplV2l0aENvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHZhciBzdHlsZSA9IGluc3BlY3Quc3R5bGVzW3N0eWxlVHlwZV07XG5cbiAgaWYgKHN0eWxlKSB7XG4gICAgcmV0dXJuICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMF0gKyAnbScgKyBzdHIgK1xuICAgICAgICAgICAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzFdICsgJ20nO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBzdHlsaXplTm9Db2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICByZXR1cm4gc3RyO1xufVxuXG5cbmZ1bmN0aW9uIGFycmF5VG9IYXNoKGFycmF5KSB7XG4gIHZhciBoYXNoID0ge307XG5cbiAgYXJyYXkuZm9yRWFjaChmdW5jdGlvbih2YWwsIGlkeCkge1xuICAgIGhhc2hbdmFsXSA9IHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiBoYXNoO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFZhbHVlKGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcykge1xuICAvLyBQcm92aWRlIGEgaG9vayBmb3IgdXNlci1zcGVjaWZpZWQgaW5zcGVjdCBmdW5jdGlvbnMuXG4gIC8vIENoZWNrIHRoYXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW4gaW5zcGVjdCBmdW5jdGlvbiBvbiBpdFxuICBpZiAoY3R4LmN1c3RvbUluc3BlY3QgJiZcbiAgICAgIHZhbHVlICYmXG4gICAgICBpc0Z1bmN0aW9uKHZhbHVlLmluc3BlY3QpICYmXG4gICAgICAvLyBGaWx0ZXIgb3V0IHRoZSB1dGlsIG1vZHVsZSwgaXQncyBpbnNwZWN0IGZ1bmN0aW9uIGlzIHNwZWNpYWxcbiAgICAgIHZhbHVlLmluc3BlY3QgIT09IGV4cG9ydHMuaW5zcGVjdCAmJlxuICAgICAgLy8gQWxzbyBmaWx0ZXIgb3V0IGFueSBwcm90b3R5cGUgb2JqZWN0cyB1c2luZyB0aGUgY2lyY3VsYXIgY2hlY2suXG4gICAgICAhKHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLnByb3RvdHlwZSA9PT0gdmFsdWUpKSB7XG4gICAgdmFyIHJldCA9IHZhbHVlLmluc3BlY3QocmVjdXJzZVRpbWVzLCBjdHgpO1xuICAgIGlmICghaXNTdHJpbmcocmV0KSkge1xuICAgICAgcmV0ID0gZm9ybWF0VmFsdWUoY3R4LCByZXQsIHJlY3Vyc2VUaW1lcyk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvLyBQcmltaXRpdmUgdHlwZXMgY2Fubm90IGhhdmUgcHJvcGVydGllc1xuICB2YXIgcHJpbWl0aXZlID0gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpO1xuICBpZiAocHJpbWl0aXZlKSB7XG4gICAgcmV0dXJuIHByaW1pdGl2ZTtcbiAgfVxuXG4gIC8vIExvb2sgdXAgdGhlIGtleXMgb2YgdGhlIG9iamVjdC5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gIHZhciB2aXNpYmxlS2V5cyA9IGFycmF5VG9IYXNoKGtleXMpO1xuXG4gIGlmIChjdHguc2hvd0hpZGRlbikge1xuICAgIGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSk7XG4gIH1cblxuICAvLyBJRSBkb2Vzbid0IG1ha2UgZXJyb3IgZmllbGRzIG5vbi1lbnVtZXJhYmxlXG4gIC8vIGh0dHA6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS9pZS9kd3c1MnNidCh2PXZzLjk0KS5hc3B4XG4gIGlmIChpc0Vycm9yKHZhbHVlKVxuICAgICAgJiYgKGtleXMuaW5kZXhPZignbWVzc2FnZScpID49IDAgfHwga2V5cy5pbmRleE9mKCdkZXNjcmlwdGlvbicpID49IDApKSB7XG4gICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIC8vIFNvbWUgdHlwZSBvZiBvYmplY3Qgd2l0aG91dCBwcm9wZXJ0aWVzIGNhbiBiZSBzaG9ydGN1dHRlZC5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICB2YXIgbmFtZSA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbRnVuY3Rpb24nICsgbmFtZSArICddJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9XG4gICAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShEYXRlLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ2RhdGUnKTtcbiAgICB9XG4gICAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBiYXNlID0gJycsIGFycmF5ID0gZmFsc2UsIGJyYWNlcyA9IFsneycsICd9J107XG5cbiAgLy8gTWFrZSBBcnJheSBzYXkgdGhhdCB0aGV5IGFyZSBBcnJheVxuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBhcnJheSA9IHRydWU7XG4gICAgYnJhY2VzID0gWydbJywgJ10nXTtcbiAgfVxuXG4gIC8vIE1ha2UgZnVuY3Rpb25zIHNheSB0aGF0IHRoZXkgYXJlIGZ1bmN0aW9uc1xuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICB2YXIgbiA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgIGJhc2UgPSAnIFtGdW5jdGlvbicgKyBuICsgJ10nO1xuICB9XG5cbiAgLy8gTWFrZSBSZWdFeHBzIHNheSB0aGF0IHRoZXkgYXJlIFJlZ0V4cHNcbiAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBkYXRlcyB3aXRoIHByb3BlcnRpZXMgZmlyc3Qgc2F5IHRoZSBkYXRlXG4gIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIERhdGUucHJvdG90eXBlLnRvVVRDU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBlcnJvciB3aXRoIG1lc3NhZ2UgZmlyc3Qgc2F5IHRoZSBlcnJvclxuICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwICYmICghYXJyYXkgfHwgdmFsdWUubGVuZ3RoID09IDApKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyBicmFjZXNbMV07XG4gIH1cblxuICBpZiAocmVjdXJzZVRpbWVzIDwgMCkge1xuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW09iamVjdF0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuXG4gIGN0eC5zZWVuLnB1c2godmFsdWUpO1xuXG4gIHZhciBvdXRwdXQ7XG4gIGlmIChhcnJheSkge1xuICAgIG91dHB1dCA9IGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpO1xuICB9IGVsc2Uge1xuICAgIG91dHB1dCA9IGtleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpO1xuICAgIH0pO1xuICB9XG5cbiAgY3R4LnNlZW4ucG9wKCk7XG5cbiAgcmV0dXJuIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSkge1xuICBpZiAoaXNVbmRlZmluZWQodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgndW5kZWZpbmVkJywgJ3VuZGVmaW5lZCcpO1xuICBpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgdmFyIHNpbXBsZSA9ICdcXCcnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL15cInxcIiQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpICsgJ1xcJyc7XG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKHNpbXBsZSwgJ3N0cmluZycpO1xuICB9XG4gIGlmIChpc051bWJlcih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdudW1iZXInKTtcbiAgaWYgKGlzQm9vbGVhbih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdib29sZWFuJyk7XG4gIC8vIEZvciBzb21lIHJlYXNvbiB0eXBlb2YgbnVsbCBpcyBcIm9iamVjdFwiLCBzbyBzcGVjaWFsIGNhc2UgaGVyZS5cbiAgaWYgKGlzTnVsbCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCdudWxsJywgJ251bGwnKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRFcnJvcih2YWx1ZSkge1xuICByZXR1cm4gJ1snICsgRXJyb3IucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpICsgJ10nO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpIHtcbiAgdmFyIG91dHB1dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHZhbHVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgIGlmIChoYXNPd25Qcm9wZXJ0eSh2YWx1ZSwgU3RyaW5nKGkpKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBTdHJpbmcoaSksIHRydWUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2goJycpO1xuICAgIH1cbiAgfVxuICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKCFrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIGtleSwgdHJ1ZSkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSkge1xuICB2YXIgbmFtZSwgc3RyLCBkZXNjO1xuICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih2YWx1ZSwga2V5KSB8fCB7IHZhbHVlOiB2YWx1ZVtrZXldIH07XG4gIGlmIChkZXNjLmdldCkge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXIvU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tTZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKCFoYXNPd25Qcm9wZXJ0eSh2aXNpYmxlS2V5cywga2V5KSkge1xuICAgIG5hbWUgPSAnWycgKyBrZXkgKyAnXSc7XG4gIH1cbiAgaWYgKCFzdHIpIHtcbiAgICBpZiAoY3R4LnNlZW4uaW5kZXhPZihkZXNjLnZhbHVlKSA8IDApIHtcbiAgICAgIGlmIChpc051bGwocmVjdXJzZVRpbWVzKSkge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIG51bGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCByZWN1cnNlVGltZXMgLSAxKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdHIuaW5kZXhPZignXFxuJykgPiAtMSkge1xuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJykuc3Vic3RyKDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ciA9ICdcXG4nICsgc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0NpcmN1bGFyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmIChpc1VuZGVmaW5lZChuYW1lKSkge1xuICAgIGlmIChhcnJheSAmJiBrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgICBuYW1lID0gSlNPTi5zdHJpbmdpZnkoJycgKyBrZXkpO1xuICAgIGlmIChuYW1lLm1hdGNoKC9eXCIoW2EtekEtWl9dW2EtekEtWl8wLTldKilcIiQvKSkge1xuICAgICAgbmFtZSA9IG5hbWUuc3Vic3RyKDEsIG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ25hbWUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLyheXCJ8XCIkKS9nLCBcIidcIik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ3N0cmluZycpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuYW1lICsgJzogJyArIHN0cjtcbn1cblxuXG5mdW5jdGlvbiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcykge1xuICB2YXIgbnVtTGluZXNFc3QgPSAwO1xuICB2YXIgbGVuZ3RoID0gb3V0cHV0LnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXIpIHtcbiAgICBudW1MaW5lc0VzdCsrO1xuICAgIGlmIChjdXIuaW5kZXhPZignXFxuJykgPj0gMCkgbnVtTGluZXNFc3QrKztcbiAgICByZXR1cm4gcHJldiArIGN1ci5yZXBsYWNlKC9cXHUwMDFiXFxbXFxkXFxkP20vZywgJycpLmxlbmd0aCArIDE7XG4gIH0sIDApO1xuXG4gIGlmIChsZW5ndGggPiA2MCkge1xuICAgIHJldHVybiBicmFjZXNbMF0gK1xuICAgICAgICAgICAoYmFzZSA9PT0gJycgPyAnJyA6IGJhc2UgKyAnXFxuICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgb3V0cHV0LmpvaW4oJyxcXG4gICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgYnJhY2VzWzFdO1xuICB9XG5cbiAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyAnICcgKyBvdXRwdXQuam9pbignLCAnKSArICcgJyArIGJyYWNlc1sxXTtcbn1cblxuXG4vLyBOT1RFOiBUaGVzZSB0eXBlIGNoZWNraW5nIGZ1bmN0aW9ucyBpbnRlbnRpb25hbGx5IGRvbid0IHVzZSBgaW5zdGFuY2VvZmBcbi8vIGJlY2F1c2UgaXQgaXMgZnJhZ2lsZSBhbmQgY2FuIGJlIGVhc2lseSBmYWtlZCB3aXRoIGBPYmplY3QuY3JlYXRlKClgLlxuZnVuY3Rpb24gaXNBcnJheShhcikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcik7XG59XG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5O1xuXG5mdW5jdGlvbiBpc0Jvb2xlYW4oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnYm9vbGVhbic7XG59XG5leHBvcnRzLmlzQm9vbGVhbiA9IGlzQm9vbGVhbjtcblxuZnVuY3Rpb24gaXNOdWxsKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGwgPSBpc051bGw7XG5cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbE9yVW5kZWZpbmVkID0gaXNOdWxsT3JVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLmlzTnVtYmVyID0gaXNOdW1iZXI7XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZyc7XG59XG5leHBvcnRzLmlzU3RyaW5nID0gaXNTdHJpbmc7XG5cbmZ1bmN0aW9uIGlzU3ltYm9sKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCc7XG59XG5leHBvcnRzLmlzU3ltYm9sID0gaXNTeW1ib2w7XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG5leHBvcnRzLmlzVW5kZWZpbmVkID0gaXNVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKHJlKSB7XG4gIHJldHVybiBpc09iamVjdChyZSkgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbn1cbmV4cG9ydHMuaXNSZWdFeHAgPSBpc1JlZ0V4cDtcblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5leHBvcnRzLmlzT2JqZWN0ID0gaXNPYmplY3Q7XG5cbmZ1bmN0aW9uIGlzRGF0ZShkKSB7XG4gIHJldHVybiBpc09iamVjdChkKSAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xufVxuZXhwb3J0cy5pc0RhdGUgPSBpc0RhdGU7XG5cbmZ1bmN0aW9uIGlzRXJyb3IoZSkge1xuICByZXR1cm4gaXNPYmplY3QoZSkgJiZcbiAgICAgIChvYmplY3RUb1N0cmluZyhlKSA9PT0gJ1tvYmplY3QgRXJyb3JdJyB8fCBlIGluc3RhbmNlb2YgRXJyb3IpO1xufVxuZXhwb3J0cy5pc0Vycm9yID0gaXNFcnJvcjtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5leHBvcnRzLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiBpc1ByaW1pdGl2ZShhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbCB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnIHx8ICAvLyBFUzYgc3ltYm9sXG4gICAgICAgICB0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJztcbn1cbmV4cG9ydHMuaXNQcmltaXRpdmUgPSBpc1ByaW1pdGl2ZTtcblxuZXhwb3J0cy5pc0J1ZmZlciA9IHJlcXVpcmUoJy4vc3VwcG9ydC9pc0J1ZmZlcicpO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59XG5cblxuZnVuY3Rpb24gcGFkKG4pIHtcbiAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4udG9TdHJpbmcoMTApIDogbi50b1N0cmluZygxMCk7XG59XG5cblxudmFyIG1vbnRocyA9IFsnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLFxuICAgICAgICAgICAgICAnT2N0JywgJ05vdicsICdEZWMnXTtcblxuLy8gMjYgRmViIDE2OjE5OjM0XG5mdW5jdGlvbiB0aW1lc3RhbXAoKSB7XG4gIHZhciBkID0gbmV3IERhdGUoKTtcbiAgdmFyIHRpbWUgPSBbcGFkKGQuZ2V0SG91cnMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldE1pbnV0ZXMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldFNlY29uZHMoKSldLmpvaW4oJzonKTtcbiAgcmV0dXJuIFtkLmdldERhdGUoKSwgbW9udGhzW2QuZ2V0TW9udGgoKV0sIHRpbWVdLmpvaW4oJyAnKTtcbn1cblxuXG4vLyBsb2cgaXMganVzdCBhIHRoaW4gd3JhcHBlciB0byBjb25zb2xlLmxvZyB0aGF0IHByZXBlbmRzIGEgdGltZXN0YW1wXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnJXMgLSAlcycsIHRpbWVzdGFtcCgpLCBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpKTtcbn07XG5cblxuLyoqXG4gKiBJbmhlcml0IHRoZSBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIG9uZSBjb25zdHJ1Y3RvciBpbnRvIGFub3RoZXIuXG4gKlxuICogVGhlIEZ1bmN0aW9uLnByb3RvdHlwZS5pbmhlcml0cyBmcm9tIGxhbmcuanMgcmV3cml0dGVuIGFzIGEgc3RhbmRhbG9uZVxuICogZnVuY3Rpb24gKG5vdCBvbiBGdW5jdGlvbi5wcm90b3R5cGUpLiBOT1RFOiBJZiB0aGlzIGZpbGUgaXMgdG8gYmUgbG9hZGVkXG4gKiBkdXJpbmcgYm9vdHN0cmFwcGluZyB0aGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB1c2luZyBzb21lIG5hdGl2ZVxuICogZnVuY3Rpb25zIGFzIHByb3RvdHlwZSBzZXR1cCB1c2luZyBub3JtYWwgSmF2YVNjcmlwdCBkb2VzIG5vdCB3b3JrIGFzXG4gKiBleHBlY3RlZCBkdXJpbmcgYm9vdHN0cmFwcGluZyAoc2VlIG1pcnJvci5qcyBpbiByMTE0OTAzKS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHdoaWNoIG5lZWRzIHRvIGluaGVyaXQgdGhlXG4gKiAgICAgcHJvdG90eXBlLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gc3VwZXJDdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHRvIGluaGVyaXQgcHJvdG90eXBlIGZyb20uXG4gKi9cbmV4cG9ydHMuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5leHBvcnRzLl9leHRlbmQgPSBmdW5jdGlvbihvcmlnaW4sIGFkZCkge1xuICAvLyBEb24ndCBkbyBhbnl0aGluZyBpZiBhZGQgaXNuJ3QgYW4gb2JqZWN0XG4gIGlmICghYWRkIHx8ICFpc09iamVjdChhZGQpKSByZXR1cm4gb3JpZ2luO1xuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoYWRkKTtcbiAgdmFyIGkgPSBrZXlzLmxlbmd0aDtcbiAgd2hpbGUgKGktLSkge1xuICAgIG9yaWdpbltrZXlzW2ldXSA9IGFkZFtrZXlzW2ldXTtcbiAgfVxuICByZXR1cm4gb3JpZ2luO1xufTtcblxuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cbiJdfQ==
},{"./support/isBuffer":67,"_process":63,"inherits":66}],69:[function(require,module,exports){
var ua = typeof window !== 'undefined' ? window.navigator.userAgent : ''
  , isOSX = /OS X/.test(ua)
  , isOpera = /Opera/.test(ua)
  , maybeFirefox = !/like Gecko/.test(ua) && !isOpera

var i, output = module.exports = {
  0:  isOSX ? '<menu>' : '<UNK>'
, 1:  '<mouse 1>'
, 2:  '<mouse 2>'
, 3:  '<break>'
, 4:  '<mouse 3>'
, 5:  '<mouse 4>'
, 6:  '<mouse 5>'
, 8:  '<backspace>'
, 9:  '<tab>'
, 12: '<clear>'
, 13: '<enter>'
, 16: '<shift>'
, 17: '<control>'
, 18: '<alt>'
, 19: '<pause>'
, 20: '<caps-lock>'
, 21: '<ime-hangul>'
, 23: '<ime-junja>'
, 24: '<ime-final>'
, 25: '<ime-kanji>'
, 27: '<escape>'
, 28: '<ime-convert>'
, 29: '<ime-nonconvert>'
, 30: '<ime-accept>'
, 31: '<ime-mode-change>'
, 27: '<escape>'
, 32: '<space>'
, 33: '<page-up>'
, 34: '<page-down>'
, 35: '<end>'
, 36: '<home>'
, 37: '<left>'
, 38: '<up>'
, 39: '<right>'
, 40: '<down>'
, 41: '<select>'
, 42: '<print>'
, 43: '<execute>'
, 44: '<snapshot>'
, 45: '<insert>'
, 46: '<delete>'
, 47: '<help>'
, 91: '<meta>'  // meta-left -- no one handles left and right properly, so we coerce into one.
, 92: '<meta>'  // meta-right
, 93: isOSX ? '<meta>' : '<menu>'      // chrome,opera,safari all report this for meta-right (osx mbp).
, 95: '<sleep>'
, 106: '<num-*>'
, 107: '<num-+>'
, 108: '<num-enter>'
, 109: '<num-->'
, 110: '<num-.>'
, 111: '<num-/>'
, 144: '<num-lock>'
, 145: '<scroll-lock>'
, 160: '<shift-left>'
, 161: '<shift-right>'
, 162: '<control-left>'
, 163: '<control-right>'
, 164: '<alt-left>'
, 165: '<alt-right>'
, 166: '<browser-back>'
, 167: '<browser-forward>'
, 168: '<browser-refresh>'
, 169: '<browser-stop>'
, 170: '<browser-search>'
, 171: '<browser-favorites>'
, 172: '<browser-home>'

  // ff/osx reports '<volume-mute>' for '-'
, 173: isOSX && maybeFirefox ? '-' : '<volume-mute>'
, 174: '<volume-down>'
, 175: '<volume-up>'
, 176: '<next-track>'
, 177: '<prev-track>'
, 178: '<stop>'
, 179: '<play-pause>'
, 180: '<launch-mail>'
, 181: '<launch-media-select>'
, 182: '<launch-app 1>'
, 183: '<launch-app 2>'
, 186: ';'
, 187: '='
, 188: ','
, 189: '-'
, 190: '.'
, 191: '/'
, 192: '`'
, 219: '['
, 220: '\\'
, 221: ']'
, 222: "'"
, 223: '<meta>'
, 224: '<meta>'       // firefox reports meta here.
, 226: '<alt-gr>'
, 229: '<ime-process>'
, 231: isOpera ? '`' : '<unicode>'
, 246: '<attention>'
, 247: '<crsel>'
, 248: '<exsel>'
, 249: '<erase-eof>'
, 250: '<play>'
, 251: '<zoom>'
, 252: '<no-name>'
, 253: '<pa-1>'
, 254: '<clear>'
}

for(i = 58; i < 65; ++i) {
  output[i] = String.fromCharCode(i)
}

// 0-9
for(i = 48; i < 58; ++i) {
  output[i] = (i - 48)+''
}

// A-Z
for(i = 65; i < 91; ++i) {
  output[i] = String.fromCharCode(i)
}

// num0-9
for(i = 96; i < 106; ++i) {
  output[i] = '<num-'+(i - 96)+'>'
}

// F1-F24
for(i = 112; i < 136; ++i) {
  output[i] = 'F'+(i-111)
}

},{}],70:[function(require,module,exports){
// Copyright (C) 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Install a leaky WeakMap emulation on platforms that
 * don't provide a built-in one.
 *
 * <p>Assumes that an ES5 platform where, if {@code WeakMap} is
 * already present, then it conforms to the anticipated ES6
 * specification. To run this file on an ES5 or almost ES5
 * implementation where the {@code WeakMap} specification does not
 * quite conform, run <code>repairES5.js</code> first.
 *
 * <p>Even though WeakMapModule is not global, the linter thinks it
 * is, which is why it is in the overrides list below.
 *
 * <p>NOTE: Before using this WeakMap emulation in a non-SES
 * environment, see the note below about hiddenRecord.
 *
 * @author Mark S. Miller
 * @requires crypto, ArrayBuffer, Uint8Array, navigator, console
 * @overrides WeakMap, ses, Proxy
 * @overrides WeakMapModule
 */

/**
 * This {@code WeakMap} emulation is observably equivalent to the
 * ES-Harmony WeakMap, but with leakier garbage collection properties.
 *
 * <p>As with true WeakMaps, in this emulation, a key does not
 * retain maps indexed by that key and (crucially) a map does not
 * retain the keys it indexes. A map by itself also does not retain
 * the values associated with that map.
 *
 * <p>However, the values associated with a key in some map are
 * retained so long as that key is retained and those associations are
 * not overridden. For example, when used to support membranes, all
 * values exported from a given membrane will live for the lifetime
 * they would have had in the absence of an interposed membrane. Even
 * when the membrane is revoked, all objects that would have been
 * reachable in the absence of revocation will still be reachable, as
 * far as the GC can tell, even though they will no longer be relevant
 * to ongoing computation.
 *
 * <p>The API implemented here is approximately the API as implemented
 * in FF6.0a1 and agreed to by MarkM, Andreas Gal, and Dave Herman,
 * rather than the offially approved proposal page. TODO(erights):
 * upgrade the ecmascript WeakMap proposal page to explain this API
 * change and present to EcmaScript committee for their approval.
 *
 * <p>The first difference between the emulation here and that in
 * FF6.0a1 is the presence of non enumerable {@code get___, has___,
 * set___, and delete___} methods on WeakMap instances to represent
 * what would be the hidden internal properties of a primitive
 * implementation. Whereas the FF6.0a1 WeakMap.prototype methods
 * require their {@code this} to be a genuine WeakMap instance (i.e.,
 * an object of {@code [[Class]]} "WeakMap}), since there is nothing
 * unforgeable about the pseudo-internal method names used here,
 * nothing prevents these emulated prototype methods from being
 * applied to non-WeakMaps with pseudo-internal methods of the same
 * names.
 *
 * <p>Another difference is that our emulated {@code
 * WeakMap.prototype} is not itself a WeakMap. A problem with the
 * current FF6.0a1 API is that WeakMap.prototype is itself a WeakMap
 * providing ambient mutability and an ambient communications
 * channel. Thus, if a WeakMap is already present and has this
 * problem, repairES5.js wraps it in a safe wrappper in order to
 * prevent access to this channel. (See
 * PATCH_MUTABLE_FROZEN_WEAKMAP_PROTO in repairES5.js).
 */

/**
 * If this is a full <a href=
 * "http://code.google.com/p/es-lab/wiki/SecureableES5"
 * >secureable ES5</a> platform and the ES-Harmony {@code WeakMap} is
 * absent, install an approximate emulation.
 *
 * <p>If WeakMap is present but cannot store some objects, use our approximate
 * emulation as a wrapper.
 *
 * <p>If this is almost a secureable ES5 platform, then WeakMap.js
 * should be run after repairES5.js.
 *
 * <p>See {@code WeakMap} for documentation of the garbage collection
 * properties of this WeakMap emulation.
 */
(function WeakMapModule() {
  "use strict";

  if (typeof ses !== 'undefined' && ses.ok && !ses.ok()) {
    // already too broken, so give up
    return;
  }

  /**
   * In some cases (current Firefox), we must make a choice betweeen a
   * WeakMap which is capable of using all varieties of host objects as
   * keys and one which is capable of safely using proxies as keys. See
   * comments below about HostWeakMap and DoubleWeakMap for details.
   *
   * This function (which is a global, not exposed to guests) marks a
   * WeakMap as permitted to do what is necessary to index all host
   * objects, at the cost of making it unsafe for proxies.
   *
   * Do not apply this function to anything which is not a genuine
   * fresh WeakMap.
   */
  function weakMapPermitHostObjects(map) {
    // identity of function used as a secret -- good enough and cheap
    if (map.permitHostObjects___) {
      map.permitHostObjects___(weakMapPermitHostObjects);
    }
  }
  if (typeof ses !== 'undefined') {
    ses.weakMapPermitHostObjects = weakMapPermitHostObjects;
  }

  // IE 11 has no Proxy but has a broken WeakMap such that we need to patch
  // it using DoubleWeakMap; this flag tells DoubleWeakMap so.
  var doubleWeakMapCheckSilentFailure = false;

  // Check if there is already a good-enough WeakMap implementation, and if so
  // exit without replacing it.
  if (typeof WeakMap === 'function') {
    var HostWeakMap = WeakMap;
    // There is a WeakMap -- is it good enough?
    if (typeof navigator !== 'undefined' &&
        /Firefox/.test(navigator.userAgent)) {
      // We're now *assuming not*, because as of this writing (2013-05-06)
      // Firefox's WeakMaps have a miscellany of objects they won't accept, and
      // we don't want to make an exhaustive list, and testing for just one
      // will be a problem if that one is fixed alone (as they did for Event).

      // If there is a platform that we *can* reliably test on, here's how to
      // do it:
      //  var problematic = ... ;
      //  var testHostMap = new HostWeakMap();
      //  try {
      //    testHostMap.set(problematic, 1);  // Firefox 20 will throw here
      //    if (testHostMap.get(problematic) === 1) {
      //      return;
      //    }
      //  } catch (e) {}

    } else {
      // IE 11 bug: WeakMaps silently fail to store frozen objects.
      var testMap = new HostWeakMap();
      var testObject = Object.freeze({});
      testMap.set(testObject, 1);
      if (testMap.get(testObject) !== 1) {
        doubleWeakMapCheckSilentFailure = true;
        // Fall through to installing our WeakMap.
      } else {
        module.exports = WeakMap;
        return;
      }
    }
  }

  var hop = Object.prototype.hasOwnProperty;
  var gopn = Object.getOwnPropertyNames;
  var defProp = Object.defineProperty;
  var isExtensible = Object.isExtensible;

  /**
   * Security depends on HIDDEN_NAME being both <i>unguessable</i> and
   * <i>undiscoverable</i> by untrusted code.
   *
   * <p>Given the known weaknesses of Math.random() on existing
   * browsers, it does not generate unguessability we can be confident
   * of.
   *
   * <p>It is the monkey patching logic in this file that is intended
   * to ensure undiscoverability. The basic idea is that there are
   * three fundamental means of discovering properties of an object:
   * The for/in loop, Object.keys(), and Object.getOwnPropertyNames(),
   * as well as some proposed ES6 extensions that appear on our
   * whitelist. The first two only discover enumerable properties, and
   * we only use HIDDEN_NAME to name a non-enumerable property, so the
   * only remaining threat should be getOwnPropertyNames and some
   * proposed ES6 extensions that appear on our whitelist. We monkey
   * patch them to remove HIDDEN_NAME from the list of properties they
   * returns.
   *
   * <p>TODO(erights): On a platform with built-in Proxies, proxies
   * could be used to trap and thereby discover the HIDDEN_NAME, so we
   * need to monkey patch Proxy.create, Proxy.createFunction, etc, in
   * order to wrap the provided handler with the real handler which
   * filters out all traps using HIDDEN_NAME.
   *
   * <p>TODO(erights): Revisit Mike Stay's suggestion that we use an
   * encapsulated function at a not-necessarily-secret name, which
   * uses the Stiegler shared-state rights amplification pattern to
   * reveal the associated value only to the WeakMap in which this key
   * is associated with that value. Since only the key retains the
   * function, the function can also remember the key without causing
   * leakage of the key, so this doesn't violate our general gc
   * goals. In addition, because the name need not be a guarded
   * secret, we could efficiently handle cross-frame frozen keys.
   */
  var HIDDEN_NAME_PREFIX = 'weakmap:';
  var HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'ident:' + Math.random() + '___';

  if (typeof crypto !== 'undefined' &&
      typeof crypto.getRandomValues === 'function' &&
      typeof ArrayBuffer === 'function' &&
      typeof Uint8Array === 'function') {
    var ab = new ArrayBuffer(25);
    var u8s = new Uint8Array(ab);
    crypto.getRandomValues(u8s);
    HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'rand:' +
      Array.prototype.map.call(u8s, function(u8) {
        return (u8 % 36).toString(36);
      }).join('') + '___';
  }

  function isNotHiddenName(name) {
    return !(
        name.substr(0, HIDDEN_NAME_PREFIX.length) == HIDDEN_NAME_PREFIX &&
        name.substr(name.length - 3) === '___');
  }

  /**
   * Monkey patch getOwnPropertyNames to avoid revealing the
   * HIDDEN_NAME.
   *
   * <p>The ES5.1 spec requires each name to appear only once, but as
   * of this writing, this requirement is controversial for ES6, so we
   * made this code robust against this case. If the resulting extra
   * search turns out to be expensive, we can probably relax this once
   * ES6 is adequately supported on all major browsers, iff no browser
   * versions we support at that time have relaxed this constraint
   * without providing built-in ES6 WeakMaps.
   */
  defProp(Object, 'getOwnPropertyNames', {
    value: function fakeGetOwnPropertyNames(obj) {
      return gopn(obj).filter(isNotHiddenName);
    }
  });

  /**
   * getPropertyNames is not in ES5 but it is proposed for ES6 and
   * does appear in our whitelist, so we need to clean it too.
   */
  if ('getPropertyNames' in Object) {
    var originalGetPropertyNames = Object.getPropertyNames;
    defProp(Object, 'getPropertyNames', {
      value: function fakeGetPropertyNames(obj) {
        return originalGetPropertyNames(obj).filter(isNotHiddenName);
      }
    });
  }

  /**
   * <p>To treat objects as identity-keys with reasonable efficiency
   * on ES5 by itself (i.e., without any object-keyed collections), we
   * need to add a hidden property to such key objects when we
   * can. This raises several issues:
   * <ul>
   * <li>Arranging to add this property to objects before we lose the
   *     chance, and
   * <li>Hiding the existence of this new property from most
   *     JavaScript code.
   * <li>Preventing <i>certification theft</i>, where one object is
   *     created falsely claiming to be the key of an association
   *     actually keyed by another object.
   * <li>Preventing <i>value theft</i>, where untrusted code with
   *     access to a key object but not a weak map nevertheless
   *     obtains access to the value associated with that key in that
   *     weak map.
   * </ul>
   * We do so by
   * <ul>
   * <li>Making the name of the hidden property unguessable, so "[]"
   *     indexing, which we cannot intercept, cannot be used to access
   *     a property without knowing the name.
   * <li>Making the hidden property non-enumerable, so we need not
   *     worry about for-in loops or {@code Object.keys},
   * <li>monkey patching those reflective methods that would
   *     prevent extensions, to add this hidden property first,
   * <li>monkey patching those methods that would reveal this
   *     hidden property.
   * </ul>
   * Unfortunately, because of same-origin iframes, we cannot reliably
   * add this hidden property before an object becomes
   * non-extensible. Instead, if we encounter a non-extensible object
   * without a hidden record that we can detect (whether or not it has
   * a hidden record stored under a name secret to us), then we just
   * use the key object itself to represent its identity in a brute
   * force leaky map stored in the weak map, losing all the advantages
   * of weakness for these.
   */
  function getHiddenRecord(key) {
    if (key !== Object(key)) {
      throw new TypeError('Not an object: ' + key);
    }
    var hiddenRecord = key[HIDDEN_NAME];
    if (hiddenRecord && hiddenRecord.key === key) { return hiddenRecord; }
    if (!isExtensible(key)) {
      // Weak map must brute force, as explained in doc-comment above.
      return void 0;
    }

    // The hiddenRecord and the key point directly at each other, via
    // the "key" and HIDDEN_NAME properties respectively. The key
    // field is for quickly verifying that this hidden record is an
    // own property, not a hidden record from up the prototype chain.
    //
    // NOTE: Because this WeakMap emulation is meant only for systems like
    // SES where Object.prototype is frozen without any numeric
    // properties, it is ok to use an object literal for the hiddenRecord.
    // This has two advantages:
    // * It is much faster in a performance critical place
    // * It avoids relying on Object.create(null), which had been
    //   problematic on Chrome 28.0.1480.0. See
    //   https://code.google.com/p/google-caja/issues/detail?id=1687
    hiddenRecord = { key: key };

    // When using this WeakMap emulation on platforms where
    // Object.prototype might not be frozen and Object.create(null) is
    // reliable, use the following two commented out lines instead.
    // hiddenRecord = Object.create(null);
    // hiddenRecord.key = key;

    // Please contact us if you need this to work on platforms where
    // Object.prototype might not be frozen and
    // Object.create(null) might not be reliable.

    try {
      defProp(key, HIDDEN_NAME, {
        value: hiddenRecord,
        writable: false,
        enumerable: false,
        configurable: false
      });
      return hiddenRecord;
    } catch (error) {
      // Under some circumstances, isExtensible seems to misreport whether
      // the HIDDEN_NAME can be defined.
      // The circumstances have not been isolated, but at least affect
      // Node.js v0.10.26 on TravisCI / Linux, but not the same version of
      // Node.js on OS X.
      return void 0;
    }
  }

  /**
   * Monkey patch operations that would make their argument
   * non-extensible.
   *
   * <p>The monkey patched versions throw a TypeError if their
   * argument is not an object, so it should only be done to functions
   * that should throw a TypeError anyway if their argument is not an
   * object.
   */
  (function(){
    var oldFreeze = Object.freeze;
    defProp(Object, 'freeze', {
      value: function identifyingFreeze(obj) {
        getHiddenRecord(obj);
        return oldFreeze(obj);
      }
    });
    var oldSeal = Object.seal;
    defProp(Object, 'seal', {
      value: function identifyingSeal(obj) {
        getHiddenRecord(obj);
        return oldSeal(obj);
      }
    });
    var oldPreventExtensions = Object.preventExtensions;
    defProp(Object, 'preventExtensions', {
      value: function identifyingPreventExtensions(obj) {
        getHiddenRecord(obj);
        return oldPreventExtensions(obj);
      }
    });
  })();

  function constFunc(func) {
    func.prototype = null;
    return Object.freeze(func);
  }

  var calledAsFunctionWarningDone = false;
  function calledAsFunctionWarning() {
    // Future ES6 WeakMap is currently (2013-09-10) expected to reject WeakMap()
    // but we used to permit it and do it ourselves, so warn only.
    if (!calledAsFunctionWarningDone && typeof console !== 'undefined') {
      calledAsFunctionWarningDone = true;
      console.warn('WeakMap should be invoked as new WeakMap(), not ' +
          'WeakMap(). This will be an error in the future.');
    }
  }

  var nextId = 0;

  var OurWeakMap = function() {
    if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
      calledAsFunctionWarning();
    }

    // We are currently (12/25/2012) never encountering any prematurely
    // non-extensible keys.
    var keys = []; // brute force for prematurely non-extensible keys.
    var values = []; // brute force for corresponding values.
    var id = nextId++;

    function get___(key, opt_default) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord ? hiddenRecord[id] : opt_default;
      } else {
        index = keys.indexOf(key);
        return index >= 0 ? values[index] : opt_default;
      }
    }

    function has___(key) {
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord;
      } else {
        return keys.indexOf(key) >= 0;
      }
    }

    function set___(key, value) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        hiddenRecord[id] = value;
      } else {
        index = keys.indexOf(key);
        if (index >= 0) {
          values[index] = value;
        } else {
          // Since some browsers preemptively terminate slow turns but
          // then continue computing with presumably corrupted heap
          // state, we here defensively get keys.length first and then
          // use it to update both the values and keys arrays, keeping
          // them in sync.
          index = keys.length;
          values[index] = value;
          // If we crash here, values will be one longer than keys.
          keys[index] = key;
        }
      }
      return this;
    }

    function delete___(key) {
      var hiddenRecord = getHiddenRecord(key);
      var index, lastIndex;
      if (hiddenRecord) {
        return id in hiddenRecord && delete hiddenRecord[id];
      } else {
        index = keys.indexOf(key);
        if (index < 0) {
          return false;
        }
        // Since some browsers preemptively terminate slow turns but
        // then continue computing with potentially corrupted heap
        // state, we here defensively get keys.length first and then use
        // it to update both the keys and the values array, keeping
        // them in sync. We update the two with an order of assignments,
        // such that any prefix of these assignments will preserve the
        // key/value correspondence, either before or after the delete.
        // Note that this needs to work correctly when index === lastIndex.
        lastIndex = keys.length - 1;
        keys[index] = void 0;
        // If we crash here, there's a void 0 in the keys array, but
        // no operation will cause a "keys.indexOf(void 0)", since
        // getHiddenRecord(void 0) will always throw an error first.
        values[index] = values[lastIndex];
        // If we crash here, values[index] cannot be found here,
        // because keys[index] is void 0.
        keys[index] = keys[lastIndex];
        // If index === lastIndex and we crash here, then keys[index]
        // is still void 0, since the aliasing killed the previous key.
        keys.length = lastIndex;
        // If we crash here, keys will be one shorter than values.
        values.length = lastIndex;
        return true;
      }
    }

    return Object.create(OurWeakMap.prototype, {
      get___:    { value: constFunc(get___) },
      has___:    { value: constFunc(has___) },
      set___:    { value: constFunc(set___) },
      delete___: { value: constFunc(delete___) }
    });
  };

  OurWeakMap.prototype = Object.create(Object.prototype, {
    get: {
      /**
       * Return the value most recently associated with key, or
       * opt_default if none.
       */
      value: function get(key, opt_default) {
        return this.get___(key, opt_default);
      },
      writable: true,
      configurable: true
    },

    has: {
      /**
       * Is there a value associated with key in this WeakMap?
       */
      value: function has(key) {
        return this.has___(key);
      },
      writable: true,
      configurable: true
    },

    set: {
      /**
       * Associate value with key in this WeakMap, overwriting any
       * previous association if present.
       */
      value: function set(key, value) {
        return this.set___(key, value);
      },
      writable: true,
      configurable: true
    },

    'delete': {
      /**
       * Remove any association for key in this WeakMap, returning
       * whether there was one.
       *
       * <p>Note that the boolean return here does not work like the
       * {@code delete} operator. The {@code delete} operator returns
       * whether the deletion succeeds at bringing about a state in
       * which the deleted property is absent. The {@code delete}
       * operator therefore returns true if the property was already
       * absent, whereas this {@code delete} method returns false if
       * the association was already absent.
       */
      value: function remove(key) {
        return this.delete___(key);
      },
      writable: true,
      configurable: true
    }
  });

  if (typeof HostWeakMap === 'function') {
    (function() {
      // If we got here, then the platform has a WeakMap but we are concerned
      // that it may refuse to store some key types. Therefore, make a map
      // implementation which makes use of both as possible.

      // In this mode we are always using double maps, so we are not proxy-safe.
      // This combination does not occur in any known browser, but we had best
      // be safe.
      if (doubleWeakMapCheckSilentFailure && typeof Proxy !== 'undefined') {
        Proxy = undefined;
      }

      function DoubleWeakMap() {
        if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
          calledAsFunctionWarning();
        }

        // Preferable, truly weak map.
        var hmap = new HostWeakMap();

        // Our hidden-property-based pseudo-weak-map. Lazily initialized in the
        // 'set' implementation; thus we can avoid performing extra lookups if
        // we know all entries actually stored are entered in 'hmap'.
        var omap = undefined;

        // Hidden-property maps are not compatible with proxies because proxies
        // can observe the hidden name and either accidentally expose it or fail
        // to allow the hidden property to be set. Therefore, we do not allow
        // arbitrary WeakMaps to switch to using hidden properties, but only
        // those which need the ability, and unprivileged code is not allowed
        // to set the flag.
        //
        // (Except in doubleWeakMapCheckSilentFailure mode in which case we
        // disable proxies.)
        var enableSwitching = false;

        function dget(key, opt_default) {
          if (omap) {
            return hmap.has(key) ? hmap.get(key)
                : omap.get___(key, opt_default);
          } else {
            return hmap.get(key, opt_default);
          }
        }

        function dhas(key) {
          return hmap.has(key) || (omap ? omap.has___(key) : false);
        }

        var dset;
        if (doubleWeakMapCheckSilentFailure) {
          dset = function(key, value) {
            hmap.set(key, value);
            if (!hmap.has(key)) {
              if (!omap) { omap = new OurWeakMap(); }
              omap.set(key, value);
            }
            return this;
          };
        } else {
          dset = function(key, value) {
            if (enableSwitching) {
              try {
                hmap.set(key, value);
              } catch (e) {
                if (!omap) { omap = new OurWeakMap(); }
                omap.set___(key, value);
              }
            } else {
              hmap.set(key, value);
            }
            return this;
          };
        }

        function ddelete(key) {
          var result = !!hmap['delete'](key);
          if (omap) { return omap.delete___(key) || result; }
          return result;
        }

        return Object.create(OurWeakMap.prototype, {
          get___:    { value: constFunc(dget) },
          has___:    { value: constFunc(dhas) },
          set___:    { value: constFunc(dset) },
          delete___: { value: constFunc(ddelete) },
          permitHostObjects___: { value: constFunc(function(token) {
            if (token === weakMapPermitHostObjects) {
              enableSwitching = true;
            } else {
              throw new Error('bogus call to permitHostObjects___');
            }
          })}
        });
      }
      DoubleWeakMap.prototype = OurWeakMap.prototype;
      module.exports = DoubleWeakMap;

      // define .constructor to hide OurWeakMap ctor
      Object.defineProperty(WeakMap.prototype, 'constructor', {
        value: WeakMap,
        enumerable: false,  // as default .constructor is
        configurable: true,
        writable: true
      });
    })();
  } else {
    // There is no host WeakMap, so we must use the emulation.

    // Emulated WeakMaps are incompatible with native proxies (because proxies
    // can observe the hidden name), so we must disable Proxy usage (in
    // ArrayLike and Domado, currently).
    if (typeof Proxy !== 'undefined') {
      Proxy = undefined;
    }

    module.exports = OurWeakMap;
  }
})();

},{}],71:[function(require,module,exports){
'use strict'

var weakMap = typeof WeakMap === 'undefined' ? require('weak-map') : WeakMap

var WebGLEWStruct = new weakMap()

function baseName(ext_name) {
  return ext_name.replace(/^[A-Z]+_/, '')
}

function initWebGLEW(gl) {
  var struct = WebGLEWStruct.get(gl)
  if(struct) {
    return struct
  }
  var extensions = {}
  var supported = gl.getSupportedExtensions()
  for(var i=0; i<supported.length; ++i) {
    var extName = supported[i]

    //Skip MOZ_ extensions
    if(extName.indexOf('MOZ_') === 0) {
      continue
    }
    var ext = gl.getExtension(supported[i])
    if(!ext) {
      continue
    }
    while(true) {
      extensions[extName] = ext
      var base = baseName(extName)
      if(base === extName) {
        break
      }
      extName = base
    }
  }
  WebGLEWStruct.set(gl, extensions)
  return extensions
}
module.exports = initWebGLEW
},{"weak-map":70}],72:[function(require,module,exports){
/* jshint unused:true, asi:true, laxcomma:true, -W097, -W008 */
/* global module */
"use strict";

//
// Helper class to manage polygon data for this project.
//
// vertArr is [x,y,z, xyz, xyz,   ..] per poly (len=3*numVerts)
// colArr = [r,g,b,a, rgba, rgba, ..] per poly (len=4*numVerts)
//

var vertArr, colArr,
        oldVertArr, oldColArr


// experimental settings...
var minAlpha = .01
var maxAlpha = .6
var flattenedZ = false

// typing
var floor = Math.floor
var rand = Math.random




function init(numTris) {
    vertArr = []
    colArr = []
    var i
    for (i=0; i<numTris; i++) {
        addPoly()
    }
    // sort initially
    sortPolygonsByZ()
}

// for reading in data already calculated
function setArrays(varr,carr) {
    vertArr = varr.slice()
    colArr  = carr.slice()
}



// generate scaled alpha values
function newAlpha() {
    var a = rand()
    return a*(maxAlpha-minAlpha) + minAlpha
}

// add a random poly
function addPoly() {
    for (var i=0; i<9; i++) {
        vertArr.push(rand())
    }
    if (flattenedZ) {
        var len = vertArr.length
        vertArr[len-1] = vertArr[len-4] = vertArr[len-7]
    }
    for (i=0; i<12; i++) {
        var c = (i%4==3) ? newAlpha() : rand()
        colArr.push(c)
    }
}

// add a new poly that's a clone of an existing one with one vertex moved
// conceptually like making a 3-poly into a folded quad
function clonePoly() {
    var index = floor( vertArr.length/9 * rand() )
    // clone colors as-are
    for (i=0; i<12; i++) {
        colArr.push( colArr[index*12+i] )
    }
    // clone 2 of 3 position vertices, then push a random one
    var skip = floor( 3*rand() )
    for (var i=0; i<9; i++) {
        if (floor(i/3)!=skip) { vertArr.push(vertArr[index*9+i]) }
    }
    for (i=0; i<3; i++) { vertArr.push( rand() ) }
    // in flat mode, give new position z from one of the others
    if (flattenedZ) {
        var len = vertArr.length
        vertArr[len-1] = (rand()>.5) ? vertArr[len-4] : vertArr[len-7]
    }
}

// remove a random poly
function removePoly() {
    if (vertArr.length < 18) { return } // already at 1 poly
    var index = floor( vertArr.length/9 * rand() )
    vertArr.splice(index*9, 9)
    colArr.splice(index*12, 12)
}

// randomize one RGBA/XYZ value
function mutateValue() {
    if (rand() < 0.5) { // do a color
        var i = floor( colArr.length * rand() )
        colArr[i] = (i%4==3) ? newAlpha() : rand()
    } else { // do a position
        var v = floor( vertArr.length/3 * rand() )
        var offs = (flattenedZ) ? 2 : 3
        var offset = floor( rand() * offs )
        vertArr[v*3 + offset] = rand()
    }
}

// randomize either all RGBA or all XYZ of one vertex
function mutateVertex() {
    var vnum = floor( getNumVerts()*rand() )
    if (rand() < 0.5) { // randomize a vertex's color
        colArr[vnum*4]   = rand()
        colArr[vnum*4+1] = rand()
        colArr[vnum*4+2] = rand()
        colArr[vnum*4+3] = newAlpha()
    } else { // randomize a position
        vertArr[vnum*3]   = rand()
        vertArr[vnum*3+1] = rand()
        vertArr[vnum*3+2] = rand()

        if (flattenedZ) { // if flat polys, change Z of whole poly
            var z = vertArr[vnum*3+2]
            var pnum = floor(vnum/3)
            vertArr[pnum*9+2] = z
            vertArr[pnum*9+5] = z
            vertArr[pnum*9+8] = z
        }
    }
}







function cacheDataNow() {
    oldVertArr = vertArr.slice()
    oldColArr = colArr.slice()
}
function restoreCachedData() {
    vertArr = oldVertArr
    colArr = oldColArr
}

function sortPolygonsByZ() {
    var i,j
    // make and sort an arr of z values averaged over each poly
    var sortdat = []
    for (i=0; i<vertArr.length; i+=9) {
        var zavg = (vertArr[i+2] + vertArr[i+5] + vertArr[i+8]) / 3
        sortdat.push({ index:i/9, z:zavg })
    }
    sortdat.sort(sortFcn)
    var oldV = vertArr.slice()
    var oldC = colArr.slice()
    for (i=0; i<sortdat.length; i++) {
        var item = sortdat[i]
        for (j=0; j<9; j++) {
            vertArr[i*9+j] = oldV[item.index*9+j]
        }
        for (j=0; j<12; j++) {
            colArr[i*12+j] =  oldC[item.index*12+j]
        }
    }
}
function sortFcn(a,b) {
    return (a.z<b.z) ? 1 : -1
}



function setAlphaRange(a,b) {
    a = parseFloat(a)
    b = parseFloat(b)
    minAlpha = Math.min(a,b)
    maxAlpha = Math.max(a,b)
}

function setFlattenedness(bool) {
    flattenedZ = bool
}


function getNumVerts() {
    return vertArr.length / 3
}


var poly = {
      init: init
    , setArrays: setArrays
    , sortPolygonsByZ: sortPolygonsByZ
    , cacheDataNow: cacheDataNow
    , restoreCachedData: restoreCachedData
    , mutateVertex: mutateVertex
    , mutateValue: mutateValue
    , addPoly: addPoly
    , clonePoly: clonePoly
    , removePoly: removePoly
    , setAlphaRange: setAlphaRange
    , setFlattenedness: setFlattenedness
//  , debug: debug
    , makeTestData: makeTestData
//  , testAlpha: testAlpha
}
Object.defineProperty(poly, 'numVerts',{get: function(){ return getNumVerts() }})
Object.defineProperty(poly, 'vertArr', {get: function(){ return vertArr }})
Object.defineProperty(poly, 'colArr',  {get: function(){ return colArr }})
Object.defineProperty(poly, 'minAlpha',  {get: function(){ return minAlpha }})
Object.defineProperty(poly, 'maxAlpha',  {get: function(){ return maxAlpha }})


module.exports = poly





//function logArr(arr) {
//  console.log(arr.map(function(n){ return(Math.round(n*100)) }))
//}
//
//function debug(label) {
////    console.log(label, ' vert: ',
////                            vertArr.map(function(n){ return(Math.round(n*100)) }) )
//  console.log(label, ' colr: ',
//                          colArr.map(function(n){ return(Math.round(n*100)) }) )
//}
//function testAlpha(label) {
//  for (var i=3; i<colArr.length; i+=4) {
//      var c = colArr[i]
//      if (c<minAlpha || c>maxAlpha) {
//          console.log('err?', i, c)
//          return true }
//  }
//  return false
//}
function makeTestData() {
    init(3)
    vertArr = [ 0,0,.5,  1,0,.5,  0,1,.5,
                          1,1,1,  1,0,1,  0,1,1,
                          0,0,0,  0,1,0,  1,1,0
                        ]
    var c = .7
    var a = .2
    colArr = [ c,0,0,a,  c,0,0,a,  c,0,0,a,
                         0,c,0,1,  0,c,0,1,  0,c,0,1,
                         0,0,c,a,  0,0,c,a,  0,0,c,a
                        ]
    sortPolygonsByZ()
}
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL3ZpZXdlci5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWIvYjY0LmpzIiwibm9kZV9tb2R1bGVzL2JpbmFyeS1zZWFyY2gtYm91bmRzL3NlYXJjaC1ib3VuZHMuanMiLCJub2RlX21vZHVsZXMvYml0LXR3aWRkbGUvdHdpZGRsZS5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5LXplcHRvL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9jd2lzZS1jb21waWxlci9jb21waWxlci5qcyIsIm5vZGVfbW9kdWxlcy9jd2lzZS1jb21waWxlci9saWIvY29tcGlsZS5qcyIsIm5vZGVfbW9kdWxlcy9jd2lzZS1jb21waWxlci9saWIvdGh1bmsuanMiLCJub2RlX21vZHVsZXMvZG9tcmVhZHkvcmVhZHkuanMiLCJub2RlX21vZHVsZXMvZHVwL2R1cC5qcyIsIm5vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwibm9kZV9tb2R1bGVzL2dhbWUtc2hlbGwvbGliL2hydGltZS1wb2x5ZmlsbC5qcyIsIm5vZGVfbW9kdWxlcy9nYW1lLXNoZWxsL2xpYi9tb3VzZXdoZWVsLXBvbHlmaWxsLmpzIiwibm9kZV9tb2R1bGVzL2dhbWUtc2hlbGwvbGliL3JhZi1wb2x5ZmlsbC5qcyIsIm5vZGVfbW9kdWxlcy9nYW1lLXNoZWxsL3NoZWxsLmpzIiwibm9kZV9tb2R1bGVzL2dsLWJ1ZmZlci9idWZmZXIuanMiLCJub2RlX21vZHVsZXMvZ2wtZmJvL2Ziby5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2Fkam9pbnQuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9jbG9uZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2NvcHkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9jcmVhdGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9kZXRlcm1pbmFudC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2Zyb21RdWF0LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvZnJvbVJvdGF0aW9uVHJhbnNsYXRpb24uanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9mcnVzdHVtLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvaWRlbnRpdHkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2ludmVydC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2xvb2tBdC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L211bHRpcGx5LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvb3J0aG8uanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9wZXJzcGVjdGl2ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3BlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcm90YXRlLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcm90YXRlWC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3JvdGF0ZVkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9yb3RhdGVaLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvc2NhbGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9zdHIuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC90cmFuc2xhdGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC90cmFuc3Bvc2UuanMiLCJub2RlX21vZHVsZXMvZ2wtbm93L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2dsLXNoYWRlci1jb3JlL2xpYi9jcmVhdGUtYXR0cmlidXRlcy5qcyIsIm5vZGVfbW9kdWxlcy9nbC1zaGFkZXItY29yZS9saWIvY3JlYXRlLXVuaWZvcm1zLmpzIiwibm9kZV9tb2R1bGVzL2dsLXNoYWRlci1jb3JlL2xpYi9yZWZsZWN0LmpzIiwibm9kZV9tb2R1bGVzL2dsLXNoYWRlci1jb3JlL3NoYWRlci1jb3JlLmpzIiwibm9kZV9tb2R1bGVzL2dsLXRleHR1cmUyZC90ZXh0dXJlLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZhby9saWIvZG8tYmluZC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12YW8vbGliL3Zhby1lbXVsYXRlZC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12YW8vbGliL3Zhby1uYXRpdmUuanMiLCJub2RlX21vZHVsZXMvZ2wtdmFvL3Zhby5qcyIsIm5vZGVfbW9kdWxlcy9nbHNsaWZ5L2FkYXB0ZXIuanMiLCJub2RlX21vZHVsZXMvZ2xzbGlmeS9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvaW52ZXJ0LWhhc2gvaW52ZXJ0LmpzIiwibm9kZV9tb2R1bGVzL2lvdGEtYXJyYXkvaW90YS5qcyIsIm5vZGVfbW9kdWxlcy9pcy1hcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pcy1idWZmZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbmRhcnJheS1vcHMvbmRhcnJheS1vcHMuanMiLCJub2RlX21vZHVsZXMvbmRhcnJheS9uZGFycmF5LmpzIiwibm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy90eXBlZGFycmF5LXBvb2wvcG9vbC5qcyIsIm5vZGVfbW9kdWxlcy91bmlxL3VuaXEuanMiLCJub2RlX21vZHVsZXMvdXRpbC9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy91dGlsL3N1cHBvcnQvaXNCdWZmZXJCcm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3V0aWwvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy92a2V5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYWstbWFwL3dlYWstbWFwLmpzIiwibm9kZV9tb2R1bGVzL3dlYmdsZXcvd2ViZ2xldy5qcyIsInBvbHlkYXRhLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3phQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsV0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDanVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Y0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2tCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiBqc2hpbnQgYXNpOnRydWUsIGxheGNvbW1hOnRydWUsIC1XMDA4LCAtVzA2MCAqL1xuLyogZ2xvYmFsIHJlcXVpcmUsIGRvY3VtZW50LCBjb25zb2xlLCB3aW5kb3cgKi9cblxuXG4vLyBpbXBvcnRzXG52YXIgJCA9IHdpbmRvdy4kID0gcmVxdWlyZSgnYnJvd3NlcmlmeS16ZXB0bycpXG52YXIgcHJvaiA9IHJlcXVpcmUoJy4uL2luZGV4LmpzJylcblxuXG4vLyBnZXQgZGF0YSB0byBkaXNwbGF5IGZyb20gdGhlIGVtYmVkZGluZyBwYWdlXG4vLyBkYXRhIGlzIG91dHB1dCBmcm9tIHByb2ouZXhwb3J0RGF0YSgpLCBzdHJpbmdpZmllZFxuLy8gcHJvYmFibHkgYSBiZXR0ZXIgd2F5IHRvIGRvIHRoaXMsIGJ1dCBmb3Igbm93Li4uXG52YXIgcG9seURhdCA9ICQoJyN2aWV3RGF0YScpLmh0bWwoKVxuXG5cbnZhciBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2FudmFzLWNvbnRhaW5lcicpXG4vL2Rpdi5zdHlsZS53aWR0aCA9IGRpdi5zdHlsZS5oZWlnaHQgPSBcIjUwMHB4XCJcbmNhbnZhcy53aWR0aCA9IGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGg7IC8vZG9jdW1lbnQud2lkdGggaXMgb2Jzb2xldGVcbmNhbnZhcy5oZWlnaHQgPSBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodDsgLy9kb2N1bWVudC5oZWlnaHQgaXMgb2Jzb2xldGVcbmNhbnZhc1cgPSBjYW52YXMud2lkdGg7XG5jYW52YXNIID0gY2FudmFzLmhlaWdodDtcblxuXG4vLyBjcmVhdGUgYSBzaGVsbCBhbmQgZ2V0IHN0YXJ0ZWRcbnZhciBzaGVsbCA9IHJlcXVpcmUoXCJnbC1ub3dcIikoe1xuXHRlbGVtZW50OidjYW52YXMtY29udGFpbmVyJyxcblx0Y2xlYXJDb2xvcjpbMCwwLDAsMV0sXG5cdGdsT3B0aW9uczp7XG5cdFx0YWxwaGE6IGZhbHNlXG5cdH1cbn0pXG5cbndpbmRvdy5zaGVsbCA9IHNoZWxsXG5zaGVsbC5wcmV2ZW50RGVmYXVsdHMgPSBmYWxzZVxuXG5zaGVsbC5vbignZ2wtaW5pdCcsIGZ1bmN0aW9uKCkge1xuXG5cdHByb2ouaW5pdChzaGVsbC5nbClcblxuXHRwcm9qLmltcG9ydERhdGEoIHBvbHlEYXQgKVxuXG59KVxuXG5zaGVsbC5vbihcImdsLWVycm9yXCIsIGZ1bmN0aW9uKGUpIHtcblx0ZG9jdW1lbnQud3JpdGUoXCJPb3BzISBMb29rcyBsaWtlIFdlYkdMIGlzbid0IHN1cHBvcnRlZCA6KFwiKVxuICB0aHJvdyBuZXcgRXJyb3IoXCJXZWJHTCBub3Qgc3VwcG9ydGVkIDooXCIpXG59KVxuXG5cblxuXG5zaGVsbC5vbihcImdsLXJlbmRlclwiLCBmdW5jdGlvbih0KSB7XG5cblx0Ly8gdXBkYXRlIGNhbWVyYSBmb2N1cyBwb2ludCBmcm9tIG1vdXNlIGRyYWdnaW5nXG5cdHVwZGF0ZUNhbWVyYVhZKClcblxuXHRwcm9qLnBhaW50KGNhbWVyYVhZWzFdLCBjYW1lcmFYWVswXSApXG5cbn0pXG5cblxuXG5cblxuLy8gbW91c2UgdHJhY2tpbmdcbnZhciBkcmFnZ2luZyA9IGZhbHNlXG52YXIgZHJhZ1N0YXJ0TG9jID0gWzAsMF1cbnZhciBkcmFnTG9jID0gWzAsMF1cbnZhciBjYW1lcmFYWSA9IFswLDBdXG5cbiQoJ2JvZHknKS5iaW5kKCdtb3VzZWRvd24gdG91Y2hzdGFydCcsIGZ1bmN0aW9uKGUpIHtcblx0aWYgKGUub3JpZ2luYWxFdmVudCkge1xuXHRcdGUgPSBlLm9yaWdpbmFsRXZlbnQ7XG5cdH1cblx0aWYgKGUudGFyZ2V0Lm5vZGVOYW1lPT09XCJDQU5WQVNcIikge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRkcmFnZ2luZyA9IHRydWVcblx0XHR2YXIgZXYgPSAoZS50b3VjaGVzKSA/IGUudG91Y2hlc1swXSA6IGVcblx0XHRkcmFnTG9jID0gZHJhZ1N0YXJ0TG9jID0gWyBldi5wYWdlWCwgZXYucGFnZVkgXVxuXHR9XG59KVxuXG4kKCdib2R5JykuYmluZCgnbW91c2Vtb3ZlIHRvdWNobW92ZVx0JywgZnVuY3Rpb24oZSkge1xuXHRpZiAoZS5vcmlnaW5hbEV2ZW50KSB7XG5cdFx0ZSA9IGUub3JpZ2luYWxFdmVudDtcblx0fVxuXHRpZiAoZS50YXJnZXQubm9kZU5hbWU9PT1cIkNBTlZBU1wiKSB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdHZhciBldiA9IChlLnRvdWNoZXMpID8gZS50b3VjaGVzWzBdIDogZVxuXHRcdGRyYWdMb2MgPSBbIGV2LnBhZ2VYLCBldi5wYWdlWSBdXG5cdH1cbn0pXG5cbiQoJ2JvZHknKS5iaW5kKCdtb3VzZXVwIHRvdWNoZW5kJywgZnVuY3Rpb24oZSkge1xuXHRpZiAoZS5vcmlnaW5hbEV2ZW50KSB7XG5cdFx0ZSA9IGUub3JpZ2luYWxFdmVudDtcblx0fVxuXHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdGRyYWdnaW5nID0gZmFsc2Vcbn0pXG5cblxuZnVuY3Rpb24gdXBkYXRlQ2FtZXJhWFkoKSB7XG5cdHZhciB0Z3QgPSBbMCwwXVxuXHRpZiAoZHJhZ2dpbmcpIHtcblx0XHR0Z3QgPSBbXG5cdFx0XHQoZHJhZ0xvY1swXS1kcmFnU3RhcnRMb2NbMF0pIC8gLTIwMCxcblx0XHRcdChkcmFnTG9jWzFdLWRyYWdTdGFydExvY1sxXSkgLyAtMjAwXG5cdFx0XVxuXHR9XG5cdHZhciBlYXNlID0gMC4xXG5cdGNhbWVyYVhZWzBdICs9IGVhc2UgKiAodGd0WzBdIC0gY2FtZXJhWFlbMF0pXG5cdGNhbWVyYVhZWzFdICs9IGVhc2UgKiAodGd0WzFdIC0gY2FtZXJhWFlbMV0pXG59XG5cblxuXG5cbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHBlcnNwZWN0aXZlID0gMC4yO1xudmFyIGNvbXBhcmVvbkdQVSA9IHRydWU7XG52YXIga2VlcEZld2VyUG9seXNUb2xlcmFuY2UgPSAwO1xudmFyIG1pbkFscGhhID0gMC4wNTtcbnZhciBtYXhBbHBoYSA9IDAuNTtcbnZhciB1c2VGbGF0UG9seXMgPSBmYWxzZTtcbnZhciBkZWZhdWx0U2NvcmUgPSAtMTAwMDAwO1xudmFyIGdsc2xpZnkgPSByZXF1aXJlKFwiZ2xzbGlmeVwiKTtcbnZhciBjcmVhdGVCdWZmZXIgPSByZXF1aXJlKFwiZ2wtYnVmZmVyXCIpO1xudmFyIGNyZWF0ZVZBTyA9IHJlcXVpcmUoXCJnbC12YW9cIik7XG52YXIgbWF0NCA9IHJlcXVpcmUoXCJnbC1tYXQ0XCIpO1xudmFyIGNyZWF0ZUZCTyA9IHJlcXVpcmUoXCJnbC1mYm9cIik7XG52YXIgY3JlYXRlVGV4dHVyZSA9IHJlcXVpcmUoXCJnbC10ZXh0dXJlMmRcIik7XG52YXIgY3JlYXRlQ2FtZXJhU2hhZGVyID0gcmVxdWlyZShcImdsc2xpZnkvYWRhcHRlci5qc1wiKShcIlxcbiNkZWZpbmUgR0xTTElGWSAxXFxuXFxucHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XFxuYXR0cmlidXRlIHZlYzQgcG9zaXRpb247XFxuYXR0cmlidXRlIHZlYzQgdmVydENvbG9yO1xcbnVuaWZvcm0gZmxvYXQgcGVyc3BlY3RpdmU7XFxudW5pZm9ybSBtYXQ0IGNhbWVyYTtcXG52YXJ5aW5nIHZlYzQgZnJhZ0NvbG9yO1xcbnZvaWQgbWFpbigpIHtcXG4gIHZlYzQgcG9zID0gMi4wICogcG9zaXRpb24gLSAxLjA7XFxuICBwb3MueiA9IHBvcy56ICogMC43NSArIDAuMjU7XFxuICBwb3MgPSBjYW1lcmEgKiBwb3M7XFxuICBmbG9hdCB3ID0gMS4wICsgcGVyc3BlY3RpdmUgKiAocG9zLnopO1xcbiAgcG9zLnogPSBwb3MueiAqIDAuNTtcXG4gIGdsX1Bvc2l0aW9uID0gdmVjNChwb3MueHl6LCB3KTtcXG4gIGZyYWdDb2xvciA9IHZlcnRDb2xvcjtcXG59XCIsIFwiXFxuI2RlZmluZSBHTFNMSUZZIDFcXG5cXG5wcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcXG52YXJ5aW5nIHZlYzQgZnJhZ0NvbG9yO1xcbnZvaWQgbWFpbigpIHtcXG4gIGdsX0ZyYWdDb2xvciA9IGZyYWdDb2xvcjtcXG59XCIsIFt7XCJuYW1lXCI6XCJwZXJzcGVjdGl2ZVwiLFwidHlwZVwiOlwiZmxvYXRcIn0se1wibmFtZVwiOlwiY2FtZXJhXCIsXCJ0eXBlXCI6XCJtYXQ0XCJ9XSwgW3tcIm5hbWVcIjpcInBvc2l0aW9uXCIsXCJ0eXBlXCI6XCJ2ZWM0XCJ9LHtcIm5hbWVcIjpcInZlcnRDb2xvclwiLFwidHlwZVwiOlwidmVjNFwifV0pO1xudmFyIGNyZWF0ZUZsYXRTaGFkZXIgPSByZXF1aXJlKFwiZ2xzbGlmeS9hZGFwdGVyLmpzXCIpKFwiXFxuI2RlZmluZSBHTFNMSUZZIDFcXG5cXG5wcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcXG5hdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcXG51bmlmb3JtIGZsb2F0IG11bHRZO1xcbnZhcnlpbmcgdmVjMiB1djtcXG52b2lkIG1haW4oKSB7XFxuICBnbF9Qb3NpdGlvbiA9IHZlYzQocG9zaXRpb24sIDAuMCwgMS4wKTtcXG4gIHV2ID0gcG9zaXRpb24gKiB2ZWMyKDEuMCwgbXVsdFkpO1xcbiAgdXYgPSAwLjUgKiAodXYgKyAxLjApO1xcbn1cIiwgXCJcXG4jZGVmaW5lIEdMU0xJRlkgMVxcblxcbnByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xcbnVuaWZvcm0gc2FtcGxlcjJEIGJ1ZmZlcjtcXG52YXJ5aW5nIHZlYzIgdXY7XFxudm9pZCBtYWluKCkge1xcbiAgZ2xfRnJhZ0NvbG9yID0gdGV4dHVyZTJEKGJ1ZmZlciwgdXYpO1xcbn1cIiwgW3tcIm5hbWVcIjpcIm11bHRZXCIsXCJ0eXBlXCI6XCJmbG9hdFwifSx7XCJuYW1lXCI6XCJidWZmZXJcIixcInR5cGVcIjpcInNhbXBsZXIyRFwifV0sIFt7XCJuYW1lXCI6XCJwb3NpdGlvblwiLFwidHlwZVwiOlwidmVjMlwifV0pO1xudmFyIGNyZWF0ZURpZmZTaGFkZXIgPSByZXF1aXJlKFwiZ2xzbGlmeS9hZGFwdGVyLmpzXCIpKFwiXFxuI2RlZmluZSBHTFNMSUZZIDFcXG5cXG5wcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcXG5hdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcXG51bmlmb3JtIGZsb2F0IG11bHRZO1xcbnZhcnlpbmcgdmVjMiB1djtcXG52b2lkIG1haW4oKSB7XFxuICBnbF9Qb3NpdGlvbiA9IHZlYzQocG9zaXRpb24sIDAuMCwgMS4wKTtcXG4gIHV2ID0gcG9zaXRpb24gKiB2ZWMyKDEuMCwgbXVsdFkpO1xcbiAgdXYgPSAwLjUgKiAodXYgKyAxLjApO1xcbn1cIiwgXCJcXG4jZGVmaW5lIEdMU0xJRlkgMVxcblxcbnByZWNpc2lvbiBoaWdocCBmbG9hdDtcXG51bmlmb3JtIGZsb2F0IGlucHV0RGltO1xcbnVuaWZvcm0gc2FtcGxlcjJEIGJ1ZmZlckE7XFxudW5pZm9ybSBzYW1wbGVyMkQgYnVmZmVyQjtcXG5jb25zdCBmbG9hdCBtYWcgPSAyNTUuMDtcXG52YXJ5aW5nIHZlYzIgdXY7XFxudm9pZCBtYWluKCkge1xcbiAgZmxvYXQgaXAgPSAxLjAgLyBpbnB1dERpbTtcXG4gIGZsb2F0IG9wID0gaXAgKiA0LjA7XFxuICB2ZWMyIHAgPSB2ZWMyKGZsb29yKHV2LnggLyBvcCkgKiBvcCwgZmxvb3IodXYueSAvIG9wKSAqIG9wKTtcXG4gIGZsb2F0IHN1bSA9IDAuMDtcXG4gIHZlYzIgb2Zmc2V0ID0gdmVjMigwLjApO1xcbiAgdmVjMyBkaWZmO1xcbiAgZm9yKGludCBpID0gMDsgaSA8IDQ7ICsraSkge1xcbiAgICBmb3IoaW50IGogPSAwOyBqIDwgNDsgKytqKSB7XFxuICAgICAgZGlmZiA9IHRleHR1cmUyRChidWZmZXJBLCBwICsgb2Zmc2V0KS5yZ2IgLSB0ZXh0dXJlMkQoYnVmZmVyQiwgcCArIG9mZnNldCkucmdiO1xcbiAgICAgIHN1bSArPSBkb3QoZGlmZiwgZGlmZik7XFxuICAgICAgb2Zmc2V0LnkgKz0gaXA7XFxuICAgIH1cXG4gICAgb2Zmc2V0LnggKz0gaXA7XFxuICAgIG9mZnNldC55ID0gMC4wO1xcbiAgfVxcbiAgZmxvYXQgYXZnID0gc3VtIC8gMTYuMDtcXG4gIGF2ZyAvPSAzLjA7XFxuICBmbG9hdCByID0gZmxvb3IoYXZnICogbWFnKSAvIG1hZztcXG4gIGZsb2F0IGcgPSBmbG9vcigoYXZnIC0gcikgKiBtYWcgKiBtYWcpIC8gbWFnO1xcbiAgZmxvYXQgYiA9ICgoYXZnIC0gcikgKiBtYWcgLSBnKSAqIG1hZztcXG4gIGdsX0ZyYWdDb2xvciA9IHZlYzQociwgZywgYiwgMS4wKTtcXG59XCIsIFt7XCJuYW1lXCI6XCJtdWx0WVwiLFwidHlwZVwiOlwiZmxvYXRcIn0se1wibmFtZVwiOlwiaW5wdXREaW1cIixcInR5cGVcIjpcImZsb2F0XCJ9LHtcIm5hbWVcIjpcImJ1ZmZlckFcIixcInR5cGVcIjpcInNhbXBsZXIyRFwifSx7XCJuYW1lXCI6XCJidWZmZXJCXCIsXCJ0eXBlXCI6XCJzYW1wbGVyMkRcIn1dLCBbe1wibmFtZVwiOlwicG9zaXRpb25cIixcInR5cGVcIjpcInZlYzJcIn1dKTtcbnZhciBjcmVhdGVBdmdTaGFkZXIgPSByZXF1aXJlKFwiZ2xzbGlmeS9hZGFwdGVyLmpzXCIpKFwiXFxuI2RlZmluZSBHTFNMSUZZIDFcXG5cXG5wcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcXG5hdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcXG51bmlmb3JtIGZsb2F0IG11bHRZO1xcbnZhcnlpbmcgdmVjMiB1djtcXG52b2lkIG1haW4oKSB7XFxuICBnbF9Qb3NpdGlvbiA9IHZlYzQocG9zaXRpb24sIDAuMCwgMS4wKTtcXG4gIHV2ID0gcG9zaXRpb24gKiB2ZWMyKDEuMCwgbXVsdFkpO1xcbiAgdXYgPSAwLjUgKiAodXYgKyAxLjApO1xcbn1cIiwgXCJcXG4jZGVmaW5lIEdMU0xJRlkgMVxcblxcbnByZWNpc2lvbiBoaWdocCBmbG9hdDtcXG51bmlmb3JtIGZsb2F0IGlucHV0RGltO1xcbnVuaWZvcm0gc2FtcGxlcjJEIGJ1ZmZlcjtcXG5jb25zdCBmbG9hdCBtYWcgPSAyNTUuMDtcXG52YXJ5aW5nIHZlYzIgdXY7XFxudm9pZCBtYWluKCkge1xcbiAgZmxvYXQgaXAgPSAxLjAgLyBpbnB1dERpbTtcXG4gIGZsb2F0IG9wID0gaXAgKiA0LjA7XFxuICB2ZWMyIHAgPSB2ZWMyKGZsb29yKHV2LnggLyBvcCkgKiBvcCwgZmxvb3IodXYueSAvIG9wKSAqIG9wKTtcXG4gIGZsb2F0IHN1bSA9IDAuMDtcXG4gIHZlYzIgb2Zmc2V0ID0gdmVjMigwLjApO1xcbiAgdmVjNCBjb2w7XFxuICBmb3IoaW50IGkgPSAwOyBpIDwgNDsgKytpKSB7XFxuICAgIGZvcihpbnQgaiA9IDA7IGogPCA0OyArK2opIHtcXG4gICAgICBjb2wgPSB0ZXh0dXJlMkQoYnVmZmVyLCBwICsgb2Zmc2V0KTtcXG4gICAgICBzdW0gKz0gY29sLnIgKyAoY29sLmcgKyBjb2wuYiAvIG1hZykgLyBtYWc7XFxuICAgICAgb2Zmc2V0LnkgKz0gaXA7XFxuICAgIH1cXG4gICAgb2Zmc2V0LnggKz0gaXA7XFxuICAgIG9mZnNldC55ID0gMC4wO1xcbiAgfVxcbiAgZmxvYXQgYXZnID0gc3VtIC8gMTYuMDtcXG4gIGZsb2F0IHIgPSBmbG9vcihhdmcgKiBtYWcpIC8gbWFnO1xcbiAgZmxvYXQgZyA9IGZsb29yKChhdmcgLSByKSAqIG1hZyAqIG1hZykgLyBtYWc7XFxuICBmbG9hdCBiID0gKChhdmcgLSByKSAqIG1hZyAtIGcpICogbWFnO1xcbiAgZ2xfRnJhZ0NvbG9yID0gdmVjNChyLCBnLCBiLCAxLjApO1xcbn1cIiwgW3tcIm5hbWVcIjpcIm11bHRZXCIsXCJ0eXBlXCI6XCJmbG9hdFwifSx7XCJuYW1lXCI6XCJpbnB1dERpbVwiLFwidHlwZVwiOlwiZmxvYXRcIn0se1wibmFtZVwiOlwiYnVmZmVyXCIsXCJ0eXBlXCI6XCJzYW1wbGVyMkRcIn1dLCBbe1wibmFtZVwiOlwicG9zaXRpb25cIixcInR5cGVcIjpcInZlYzJcIn1dKTtcbnZhciBwb2x5cyA9IHJlcXVpcmUoXCIuL3BvbHlkYXRhXCIpO1xucG9seXMuc2V0QWxwaGFSYW5nZShtaW5BbHBoYSwgbWF4QWxwaGEpO1xudmFyIGdsLCBmYm9TaXplLCBjdXJyZW50U2NvcmU7XG52YXIgY2FtU2hhZGVyLCBmbGF0U2hhZGVyLCBkaWZmUmVkdWNlU2hhZGVyLCBhdmdSZWR1Y2VTaGFkZXI7XG52YXIgdmVydEJ1ZmZlciwgY29sQnVmZmVyLCBkYXRhVmFvLCBmbGF0VmFvLCBjYW1NYXRyaXg7XG52YXIgcG9seUJ1ZmZlcnNPdXRkYXRlZDtcbnZhciByZWZUZXh0dXJlLCByZWZlcmVuY2VGQiwgc2NyYXRjaEZCO1xudmFyIHJlZHVjZWRGQnM7XG52YXIgU0NSRUVOID0gXCJzY3JlZW5cIjtcbnZhciBpbml0aWFsaXplZCA9IGZhbHNlO1xudmFyIHJhbmQgPSBNYXRoLnJhbmRvbTtcbnZhciBmbG9vciA9IE1hdGguZmxvb3I7XG5cbmZ1bmN0aW9uIGluaXQoZ2xSZWYsIGltYWdlUmVmLCBzaXplKSB7XG4gICAgaWYgKCFnbFJlZikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOZWVkIGEgcmVmZXJlbmNlIHRvIGEgZ2wgY29udGV4dFwiKTtcbiAgICB9XG5cbiAgICBnbCA9IGdsUmVmO1xuICAgIHZhciBzID0gcGFyc2VJbnQoc2l6ZSk7XG4gICAgZmJvU2l6ZSA9IChzICYmIHMgPj0gMTYgPyBzIDogMjU2KTtcblxuICAgIGlmIChpbWFnZVJlZikge1xuICAgICAgICByZWZUZXh0dXJlID0gY3JlYXRlVGV4dHVyZShnbCwgaW1hZ2VSZWYpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJlZlRleHR1cmUgPSBudWxsO1xuICAgIH1cblxuICAgIGdsLmRpc2FibGUoZ2wuREVQVEhfVEVTVCk7XG4gICAgZ2wuZW5hYmxlKGdsLkJMRU5EKTtcbiAgICBnbC5ibGVuZEZ1bmMoZ2wuU1JDX0FMUEhBLCBnbC5PTkVfTUlOVVNfU1JDX0FMUEhBKTtcbiAgICBjYW1TaGFkZXIgPSBjcmVhdGVDYW1lcmFTaGFkZXIoZ2wpO1xuICAgIGZsYXRTaGFkZXIgPSBjcmVhdGVGbGF0U2hhZGVyKGdsKTtcblxuICAgIGlmIChyZWZUZXh0dXJlKSB7XG4gICAgICAgIGRpZmZSZWR1Y2VTaGFkZXIgPSBjcmVhdGVEaWZmU2hhZGVyKGdsKTtcbiAgICAgICAgYXZnUmVkdWNlU2hhZGVyID0gY3JlYXRlQXZnU2hhZGVyKGdsKTtcbiAgICB9XG5cbiAgICByZWZlcmVuY2VGQiA9IGNyZWF0ZUZCTyhnbCwgW2Zib1NpemUsIGZib1NpemVdLCB7XG4gICAgICAgIGNvbG9yOiAxXG4gICAgfSk7XG5cbiAgICByZWZlcmVuY2VGQi5kcmF3biA9IGZhbHNlO1xuXG4gICAgc2NyYXRjaEZCID0gY3JlYXRlRkJPKGdsLCBbZmJvU2l6ZSwgZmJvU2l6ZV0sIHtcbiAgICAgICAgY29sb3I6IDFcbiAgICB9KTtcblxuICAgIHJlZHVjZWRGQnMgPSBbXTtcbiAgICB2YXIgcmVkdWNlZFNpemUgPSBmYm9TaXplIC8gNDtcblxuICAgIHdoaWxlIChyZWR1Y2VkU2l6ZSA+PSAxNikge1xuICAgICAgICB2YXIgYnVmZiA9IGNyZWF0ZUZCTyhnbCwgW3JlZHVjZWRTaXplLCByZWR1Y2VkU2l6ZV0sIHtcbiAgICAgICAgICAgIGNvbG9yOiAxXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJlZHVjZWRGQnMucHVzaChidWZmKTtcbiAgICAgICAgcmVkdWNlZFNpemUgLz0gNDtcbiAgICB9XG5cbiAgICBpZiAocmVkdWNlZEZCcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29tcGFyaXNvbiBmcmFtZWJ1ZmZlciBpcyB0b28gc21hbGwgLSBpbmNyZWFzZSBcXFwiZmJvU2l6ZVxcXCJcIik7XG4gICAgfVxuXG4gICAgcG9seXMuaW5pdCgxKTtcbiAgICB2ZXJ0QnVmZmVyID0gY3JlYXRlQnVmZmVyKGdsLCBwb2x5cy52ZXJ0QXJyKTtcbiAgICBjb2xCdWZmZXIgPSBjcmVhdGVCdWZmZXIoZ2wsIHBvbHlzLmNvbEFycik7XG4gICAgcG9seUJ1ZmZlcnNPdXRkYXRlZCA9IGZhbHNlO1xuXG4gICAgZGF0YVZhbyA9IGNyZWF0ZVZBTyhnbCwgW3tcbiAgICAgICAgXCJidWZmZXJcIjogdmVydEJ1ZmZlcixcbiAgICAgICAgXCJ0eXBlXCI6IGdsLkZMT0FULFxuICAgICAgICBcInNpemVcIjogM1xuICAgIH0sIHtcbiAgICAgICAgXCJidWZmZXJcIjogY29sQnVmZmVyLFxuICAgICAgICBcInR5cGVcIjogZ2wuRkxPQVQsXG4gICAgICAgIFwic2l6ZVwiOiA0XG4gICAgfV0pO1xuXG4gICAgdmFyIHNxdWFyZUJ1ZmZlciA9IGNyZWF0ZUJ1ZmZlcihnbCwgWy0xLCAtMSwgLTEsIDEsIDEsIC0xLCAxLCAxLCAtMSwgMSwgMSwgLTFdKTtcblxuICAgIGZsYXRWYW8gPSBjcmVhdGVWQU8oZ2wsIFt7XG4gICAgICAgIFwiYnVmZmVyXCI6IHNxdWFyZUJ1ZmZlcixcbiAgICAgICAgXCJ0eXBlXCI6IGdsLkZMT0FULFxuICAgICAgICBcInNpemVcIjogMlxuICAgIH1dKTtcblxuICAgIGlmIChyZWZUZXh0dXJlKSB7XG4gICAgICAgIGRyYXdGbGF0KHJlZlRleHR1cmUsIHJlZmVyZW5jZUZCLCB0cnVlKTtcbiAgICB9XG5cbiAgICBjdXJyZW50U2NvcmUgPSBkZWZhdWx0U2NvcmU7XG4gICAgaW5pdGlhbGl6ZWQgPSB0cnVlO1xufVxuXG5mdW5jdGlvbiBydW5HZW5lcmF0aW9uKCkge1xuICAgIGlmICghaW5pdGlhbGl6ZWQgfHwgIXJlZlRleHR1cmUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHBvbHlzLmNhY2hlRGF0YU5vdygpO1xuICAgIHZhciB2ZXJ0Q291bnQgPSBwb2x5cy5udW1WZXJ0cztcbiAgICBtdXRhdGVTb21ldGhpbmcoKTtcbiAgICBwb2x5cy5zb3J0UG9seWdvbnNCeVooKTtcbiAgICB2ZXJ0QnVmZmVyLnVwZGF0ZShwb2x5cy52ZXJ0QXJyKTtcbiAgICBjb2xCdWZmZXIudXBkYXRlKHBvbHlzLmNvbEFycik7XG4gICAgcG9seUJ1ZmZlcnNPdXRkYXRlZCA9IGZhbHNlO1xuICAgIGRyYXdEYXRhKHNjcmF0Y2hGQiwgcGVyc3BlY3RpdmUsIG51bGwpO1xuICAgIHZhciBzY29yZUZuID0gKGNvbXBhcmVvbkdQVSA/IGNvbXBhcmVGQk9zT25HUFUgOiBjb21wYXJlRkJPcyk7XG4gICAgdmFyIHNjb3JlID0gc2NvcmVGbihyZWZlcmVuY2VGQiwgc2NyYXRjaEZCKTtcbiAgICB2YXIga2VlcCA9IHNjb3JlID4gY3VycmVudFNjb3JlO1xuXG4gICAgaWYgKHBvbHlzLm51bVZlcnRzIDwgdmVydENvdW50KSB7XG4gICAgICAgIGtlZXAgPSBzY29yZSA+PSBjdXJyZW50U2NvcmUgLSBrZWVwRmV3ZXJQb2x5c1RvbGVyYW5jZTtcbiAgICB9XG5cbiAgICBpZiAoa2VlcCkge1xuICAgICAgICBjdXJyZW50U2NvcmUgPSBzY29yZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBwb2x5cy5yZXN0b3JlQ2FjaGVkRGF0YSgpO1xuICAgICAgICBwb2x5QnVmZmVyc091dGRhdGVkID0gdHJ1ZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG11dGF0ZVNvbWV0aGluZygpIHtcbiAgICB2YXIgaSwgbnVtLCBjdCA9IDA7XG4gICAgbnVtID0gZmxvb3IoNiAqIHJhbmQoKSk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtOyBpKyspIHtcbiAgICAgICAgcG9seXMubXV0YXRlVmFsdWUoKTtcbiAgICAgICAgY3QrKztcbiAgICB9XG5cbiAgICBudW0gPSBmbG9vcig2ICogcmFuZCgpICogcmFuZCgpKTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBudW07IGkrKykge1xuICAgICAgICBwb2x5cy5tdXRhdGVWZXJ0ZXgoKTtcbiAgICAgICAgY3QrKztcbiAgICB9XG5cbiAgICBpZiAocmFuZCgpIDwgMC4yKSB7XG4gICAgICAgIHBvbHlzLmFkZFBvbHkoKTtcbiAgICAgICAgY3QrKztcbiAgICB9XG5cbiAgICBpZiAocmFuZCgpIDwgMC4zKSB7XG4gICAgICAgIHBvbHlzLmNsb25lUG9seSgpO1xuICAgICAgICBjdCsrO1xuICAgIH1cblxuICAgIGlmIChyYW5kKCkgPCAwLjMpIHtcbiAgICAgICAgcG9seXMucmVtb3ZlUG9seSgpO1xuICAgICAgICBjdCsrO1xuICAgIH1cblxuICAgIGlmIChjdCA9PT0gMCkge1xuICAgICAgICBwb2x5cy5tdXRhdGVWYWx1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcGFpbnQoeFJvdCwgeVJvdCkge1xuICAgIGlmICghaW5pdGlhbGl6ZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChwb2x5QnVmZmVyc091dGRhdGVkKSB7XG4gICAgICAgIHZlcnRCdWZmZXIudXBkYXRlKHBvbHlzLnZlcnRBcnIpO1xuICAgICAgICBjb2xCdWZmZXIudXBkYXRlKHBvbHlzLmNvbEFycik7XG4gICAgfVxuXG4gICAgY2FtTWF0cml4ID0gbWF0NC5jcmVhdGUoKTtcbiAgICBtYXQ0LnJvdGF0ZVkoY2FtTWF0cml4LCBjYW1NYXRyaXgsIHlSb3QpO1xuICAgIG1hdDQucm90YXRlWChjYW1NYXRyaXgsIGNhbU1hdHJpeCwgeFJvdCk7XG4gICAgZHJhd0RhdGEoU0NSRUVOLCBwZXJzcGVjdGl2ZSwgY2FtTWF0cml4KTtcbn1cblxuZnVuY3Rpb24gcGFpbnRSZWZlcmVuY2UoKSB7XG4gICAgaWYgKCFpbml0aWFsaXplZCB8fCAhcmVmVGV4dHVyZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZHJhd0ZsYXQocmVmZXJlbmNlRkIuY29sb3JbMF0sIFNDUkVFTiwgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBwYWludFNjcmF0Y2hCdWZmZXIoKSB7XG4gICAgaWYgKCFpbml0aWFsaXplZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZHJhd0ZsYXQoc2NyYXRjaEZCLmNvbG9yWzBdLCBTQ1JFRU4sIGZhbHNlKTtcbn1cblxuZnVuY3Rpb24gZHJhd0ZsYXQoc291cmNlLCB0YXJnZXQsIGZsaXBZKSB7XG4gICAgdmFyIG11bHRZID0gKGZsaXBZID8gLTEgOiAxKTtcbiAgICBkcmF3R2VuZXJhbCh0YXJnZXQsIGZsYXRTaGFkZXIsIGZsYXRWYW8sIDYsIFtcIm11bHRZXCIsIFwiYnVmZmVyXCJdLCBbbXVsdFksIHNvdXJjZV0pO1xufVxuXG5mdW5jdGlvbiBkcmF3RGF0YSh0YXJnZXQsIHBlcnNwZWN0aXZlLCBjYW1NYXQ0KSB7XG4gICAgY2FtTWF0cml4ID0gY2FtTWF0NCB8fCBtYXQ0LmNyZWF0ZSgpO1xuICAgIGRyYXdHZW5lcmFsKHRhcmdldCwgY2FtU2hhZGVyLCBkYXRhVmFvLCBwb2x5cy5udW1WZXJ0cywgW1wicGVyc3BlY3RpdmVcIiwgXCJjYW1lcmFcIl0sIFtwZXJzcGVjdGl2ZSwgY2FtTWF0cml4XSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdHZW5lcmFsKHRhcmdldCwgc2hhZGVyLCB2YW8sIG51bVZzLCB1bmlOYW1lcywgdW5pVmFscykge1xuICAgIGlmICh0YXJnZXQgPT0gU0NSRUVOKVxuICAgICAgICB7fSBlbHNlIHtcbiAgICAgICAgdGFyZ2V0LmJpbmQoKTtcbiAgICAgICAgZ2wuY29sb3JNYXNrKHRydWUsIHRydWUsIHRydWUsIHRydWUpO1xuICAgICAgICBnbC5jbGVhcihnbC5DT0xPUl9CVUZGRVJfQklUKTtcbiAgICAgICAgZ2wuY29sb3JNYXNrKHRydWUsIHRydWUsIHRydWUsIGZhbHNlKTtcbiAgICB9XG5cbiAgICBzaGFkZXIuYmluZCgpO1xuICAgIHZhciB0ZXh0dXJlTnVtID0gMDtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5pTmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIG4gPSB1bmlOYW1lc1tpXTtcbiAgICAgICAgdmFyIHUgPSB1bmlWYWxzW2ldO1xuXG4gICAgICAgIGlmICh0eXBlb2YgdS5iaW5kID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHNoYWRlci51bmlmb3Jtc1tuXSA9IHUuYmluZCh0ZXh0dXJlTnVtKyspO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2hhZGVyLnVuaWZvcm1zW25dID0gdTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhby5iaW5kKCk7XG4gICAgdmFvLmRyYXcoZ2wuVFJJQU5HTEVTLCBudW1Wcyk7XG4gICAgdmFvLnVuYmluZCgpO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlRkJPcyhhLCBiKSB7XG4gICAgdmFyIHcgPSBhLnNoYXBlWzBdLCBoID0gYS5zaGFwZVsxXTtcbiAgICB2YXIgYWJ1ZmYgPSBuZXcgVWludDhBcnJheSh3ICogaCAqIDQpO1xuICAgIHZhciBiYnVmZiA9IG5ldyBVaW50OEFycmF5KHcgKiBoICogNCk7XG4gICAgYS5iaW5kKCk7XG4gICAgZ2wucmVhZFBpeGVscygwLCAwLCB3LCBoLCBnbC5SR0JBLCBnbC5VTlNJR05FRF9CWVRFLCBhYnVmZik7XG4gICAgYi5iaW5kKCk7XG4gICAgZ2wucmVhZFBpeGVscygwLCAwLCB3LCBoLCBnbC5SR0JBLCBnbC5VTlNJR05FRF9CWVRFLCBiYnVmZik7XG4gICAgdmFyIHN1bSA9IDA7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFidWZmLmxlbmd0aDsgaSArPSA0KSB7XG4gICAgICAgIHZhciBkeCA9IGFidWZmW2ldIC0gYmJ1ZmZbaV07XG4gICAgICAgIHZhciBkeSA9IGFidWZmW2kgKyAxXSAtIGJidWZmW2kgKyAxXTtcbiAgICAgICAgdmFyIGR6ID0gYWJ1ZmZbaSArIDJdIC0gYmJ1ZmZbaSArIDJdO1xuICAgICAgICBzdW0gKz0gZHggKiBkeCArIGR5ICogZHkgKyBkeiAqIGR6O1xuICAgIH1cblxuICAgIHN1bSAvPSAyNTY7XG4gICAgdmFyIGF2ZyA9IHN1bSAvIHcgLyBoO1xuICAgIHJldHVybiAxMDAgKiAoMSAtIGF2ZyAvIDEyOCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVGQk9zT25HUFUoYSwgYikge1xuICAgIHZhciB1TmFtZXMsIHVWYWxzLCBpO1xuICAgIHVOYW1lcyA9IFtcIm11bHRZXCIsIFwiaW5wdXREaW1cIiwgXCJidWZmZXJBXCIsIFwiYnVmZmVyQlwiXTtcbiAgICB1VmFscyA9IFsxLCBhLnNoYXBlWzBdLCBhLmNvbG9yWzBdLCBiLmNvbG9yWzBdXTtcbiAgICBkcmF3R2VuZXJhbChyZWR1Y2VkRkJzWzBdLCBkaWZmUmVkdWNlU2hhZGVyLCBmbGF0VmFvLCA2LCB1TmFtZXMsIHVWYWxzKTtcblxuICAgIGZvciAoaSA9IDE7IGkgPCByZWR1Y2VkRkJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHVOYW1lcyA9IFtcIm11bHRZXCIsIFwiaW5wdXREaW1cIiwgXCJidWZmZXJcIl07XG4gICAgICAgIHVWYWxzID0gWzEsIHJlZHVjZWRGQnNbaSAtIDFdLnNoYXBlWzBdLCByZWR1Y2VkRkJzW2kgLSAxXS5jb2xvclswXV07XG4gICAgICAgIGRyYXdHZW5lcmFsKHJlZHVjZWRGQnNbaV0sIGF2Z1JlZHVjZVNoYWRlciwgZmxhdFZhbywgNiwgdU5hbWVzLCB1VmFscyk7XG4gICAgfVxuXG4gICAgdmFyIGJ1ZmYgPSByZWR1Y2VkRkJzW3JlZHVjZWRGQnMubGVuZ3RoIC0gMV07XG4gICAgdmFyIHcgPSBidWZmLnNoYXBlWzBdO1xuICAgIHZhciB1YXJyID0gbmV3IFVpbnQ4QXJyYXkodyAqIHcgKiA0KTtcbiAgICBidWZmLmJpbmQoKTtcbiAgICBnbC5yZWFkUGl4ZWxzKDAsIDAsIHcsIHcsIGdsLlJHQkEsIGdsLlVOU0lHTkVEX0JZVEUsIHVhcnIpO1xuICAgIHZhciBzdW0gPSAwO1xuICAgIHZhciBtYWcgPSAyNTU7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgdWFyci5sZW5ndGg7IGkgKz0gNCkge1xuICAgICAgICBzdW0gKz0gdWFycltpXSArICh1YXJyW2kgKyAxXSArIHVhcnJbaSArIDJdIC8gbWFnKSAvIG1hZztcbiAgICB9XG5cbiAgICB2YXIgYXZnID0gMyAqIHN1bSAvIHcgLyB3O1xuICAgIHJldHVybiAxMDAgKiAoMSAtIGF2ZyAvIDEyOCk7XG59XG5cbmZ1bmN0aW9uIGV4cG9ydERhdGEoKSB7XG4gICAgcmV0dXJuIFwidmVydC14eXosXCIgKyBwb2x5cy52ZXJ0QXJyLmpvaW4oKSArIFwiXFxuXCIgKyBcIixjb2wtcmdiYSxcIiArIHBvbHlzLmNvbEFyci5qb2luKCk7XG59XG5cbmZ1bmN0aW9uIGltcG9ydERhdGEocykge1xuICAgIHZhciBjdXJyLCB2ID0gW10sIGMgPSBbXTtcbiAgICB2YXIgYXJyID0gcy5zcGxpdChcIixcIik7XG5cbiAgICBhcnIuZm9yRWFjaChmdW5jdGlvbihzKSB7XG4gICAgICAgIGlmIChzLmluZGV4T2YoXCJ2ZXJ0LXh5elwiKSA+IC0xKSB7XG4gICAgICAgICAgICBjdXJyID0gdjtcbiAgICAgICAgfSBlbHNlIGlmIChzLmluZGV4T2YoXCJjb2wtcmdiYVwiKSA+IC0xKSB7XG4gICAgICAgICAgICBjdXJyID0gYztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN1cnIucHVzaChwYXJzZUZsb2F0KHMpKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHYubGVuZ3RoIC8gMyA9PT0gYy5sZW5ndGggLyA0KSB7XG4gICAgICAgIHBvbHlzLnNldEFycmF5cyh2LCBjKTtcbiAgICAgICAgdmVydEJ1ZmZlci51cGRhdGUocG9seXMudmVydEFycik7XG4gICAgICAgIGNvbEJ1ZmZlci51cGRhdGUocG9seXMuY29sQXJyKTtcblxuICAgICAgICBpZiAocmVmVGV4dHVyZSkge1xuICAgICAgICAgICAgZHJhd0RhdGEoc2NyYXRjaEZCLCBwZXJzcGVjdGl2ZSwgbnVsbCk7XG4gICAgICAgICAgICB2YXIgc2NvcmVGbiA9IChjb21wYXJlb25HUFUgPyBjb21wYXJlRkJPc09uR1BVIDogY29tcGFyZUZCT3MpO1xuICAgICAgICAgICAgY3VycmVudFNjb3JlID0gc2NvcmVGbihyZWZlcmVuY2VGQiwgc2NyYXRjaEZCKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbG9nQXJyKGFycikge1xuICAgIGNvbnNvbGUubG9nKGFyci5tYXAoZnVuY3Rpb24obikge1xuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChuICogMTAwKTtcbiAgICB9KSk7XG59XG5cbmlmICgwKSB7XG4gICAgbG9nQXJyKCk7XG4gICAgbG9nKCk7XG59XG5cbmZ1bmN0aW9uIGxvZyhzKSB7XG4gICAgY29uc29sZS5sb2cocyk7XG59XG5cbnZhciBwcm9qID0ge1xuICAgIGluaXQ6IGluaXQsXG4gICAgcnVuR2VuZXJhdGlvbjogcnVuR2VuZXJhdGlvbixcbiAgICBwYWludDogcGFpbnQsXG4gICAgcGFpbnRSZWZlcmVuY2U6IHBhaW50UmVmZXJlbmNlLFxuICAgIHBhaW50U2NyYXRjaEJ1ZmZlcjogcGFpbnRTY3JhdGNoQnVmZmVyLFxuICAgIGV4cG9ydERhdGE6IGV4cG9ydERhdGEsXG4gICAgaW1wb3J0RGF0YTogaW1wb3J0RGF0YVxufTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb2osIFwic2NvcmVcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBjdXJyZW50U2NvcmU7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm9qLCBcIm51bVBvbHlzXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcG9seXMubnVtVmVydHMgLyAzO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkocHJvaiwgXCJjb21wYXJlb25HUFVcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBjb21wYXJlb25HUFU7XG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24oYikge1xuICAgICAgICBjb21wYXJlb25HUFUgPSAhIWI7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm9qLCBcImZld2VyUG9seXNUb2xlcmFuY2VcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBrZWVwRmV3ZXJQb2x5c1RvbGVyYW5jZTtcbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbih0KSB7XG4gICAgICAgIGtlZXBGZXdlclBvbHlzVG9sZXJhbmNlID0gdDtcbiAgICAgICAgY29uc29sZS5sb2codCk7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm9qLCBcInVzZUZsYXRQb2x5c1wiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHVzZUZsYXRQb2x5cztcbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbihiKSB7XG4gICAgICAgIHVzZUZsYXRQb2x5cyA9ICEhYjtcbiAgICAgICAgcG9seXMuc2V0RmxhdHRlbmVkbmVzcyh1c2VGbGF0UG9seXMpO1xuICAgIH1cbn0pO1xuXG5mdW5jdGlvbiBzZXRBbHBoYXMoYSwgYikge1xuICAgIG1pbkFscGhhID0gYTtcbiAgICBtYXhBbHBoYSA9IGI7XG4gICAgcG9seXMuc2V0QWxwaGFSYW5nZShhLCBiKTtcbn1cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb2osIFwibWluQWxwaGFcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBtaW5BbHBoYTtcbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbihhKSB7XG4gICAgICAgIHNldEFscGhhcyhhLCBtYXhBbHBoYSk7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm9qLCBcIm1heEFscGhhXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gbWF4QWxwaGE7XG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24oYSkge1xuICAgICAgICBzZXRBbHBoYXMobWluQWxwaGEsIGEpO1xuICAgIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHByb2o7IiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblxuXHRmdW5jdGlvbiBkZWNvZGUgKGVsdCkge1xuXHRcdHZhciBjb2RlID0gZWx0LmNoYXJDb2RlQXQoMClcblx0XHRpZiAoY29kZSA9PT0gUExVUylcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0gpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0ZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdGV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0odHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnID8gKHRoaXMuYmFzZTY0anMgPSB7fSkgOiBleHBvcnRzKSlcbiIsIlwidXNlIHN0cmljdFwiXG5cbmZ1bmN0aW9uIGNvbXBpbGVTZWFyY2goZnVuY05hbWUsIHByZWRpY2F0ZSwgcmV2ZXJzZWQsIGV4dHJhQXJncywgdXNlTmRhcnJheSwgZWFybHlPdXQpIHtcbiAgdmFyIGNvZGUgPSBbXG4gICAgXCJmdW5jdGlvbiBcIiwgZnVuY05hbWUsIFwiKGEsbCxoLFwiLCBleHRyYUFyZ3Muam9pbihcIixcIiksICBcIil7XCIsXG5lYXJseU91dCA/IFwiXCIgOiBcInZhciBpPVwiLCAocmV2ZXJzZWQgPyBcImwtMVwiIDogXCJoKzFcIiksXG5cIjt3aGlsZShsPD1oKXtcXFxudmFyIG09KGwraCk+Pj4xLHg9YVwiLCB1c2VOZGFycmF5ID8gXCIuZ2V0KG0pXCIgOiBcIlttXVwiXVxuICBpZihlYXJseU91dCkge1xuICAgIGlmKHByZWRpY2F0ZS5pbmRleE9mKFwiY1wiKSA8IDApIHtcbiAgICAgIGNvZGUucHVzaChcIjtpZih4PT09eSl7cmV0dXJuIG19ZWxzZSBpZih4PD15KXtcIilcbiAgICB9IGVsc2Uge1xuICAgICAgY29kZS5wdXNoKFwiO3ZhciBwPWMoeCx5KTtpZihwPT09MCl7cmV0dXJuIG19ZWxzZSBpZihwPD0wKXtcIilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29kZS5wdXNoKFwiO2lmKFwiLCBwcmVkaWNhdGUsIFwiKXtpPW07XCIpXG4gIH1cbiAgaWYocmV2ZXJzZWQpIHtcbiAgICBjb2RlLnB1c2goXCJsPW0rMX1lbHNle2g9bS0xfVwiKVxuICB9IGVsc2Uge1xuICAgIGNvZGUucHVzaChcImg9bS0xfWVsc2V7bD1tKzF9XCIpXG4gIH1cbiAgY29kZS5wdXNoKFwifVwiKVxuICBpZihlYXJseU91dCkge1xuICAgIGNvZGUucHVzaChcInJldHVybiAtMX07XCIpXG4gIH0gZWxzZSB7XG4gICAgY29kZS5wdXNoKFwicmV0dXJuIGl9O1wiKVxuICB9XG4gIHJldHVybiBjb2RlLmpvaW4oXCJcIilcbn1cblxuZnVuY3Rpb24gY29tcGlsZUJvdW5kc1NlYXJjaChwcmVkaWNhdGUsIHJldmVyc2VkLCBzdWZmaXgsIGVhcmx5T3V0KSB7XG4gIHZhciByZXN1bHQgPSBuZXcgRnVuY3Rpb24oW1xuICBjb21waWxlU2VhcmNoKFwiQVwiLCBcInhcIiArIHByZWRpY2F0ZSArIFwieVwiLCByZXZlcnNlZCwgW1wieVwiXSwgZmFsc2UsIGVhcmx5T3V0KSxcbiAgY29tcGlsZVNlYXJjaChcIkJcIiwgXCJ4XCIgKyBwcmVkaWNhdGUgKyBcInlcIiwgcmV2ZXJzZWQsIFtcInlcIl0sIHRydWUsIGVhcmx5T3V0KSxcbiAgY29tcGlsZVNlYXJjaChcIlBcIiwgXCJjKHgseSlcIiArIHByZWRpY2F0ZSArIFwiMFwiLCByZXZlcnNlZCwgW1wieVwiLCBcImNcIl0sIGZhbHNlLCBlYXJseU91dCksXG4gIGNvbXBpbGVTZWFyY2goXCJRXCIsIFwiYyh4LHkpXCIgKyBwcmVkaWNhdGUgKyBcIjBcIiwgcmV2ZXJzZWQsIFtcInlcIiwgXCJjXCJdLCB0cnVlLCBlYXJseU91dCksXG5cImZ1bmN0aW9uIGRpc3BhdGNoQnNlYXJjaFwiLCBzdWZmaXgsIFwiKGEseSxjLGwsaCl7XFxcbmlmKGEuc2hhcGUpe1xcXG5pZih0eXBlb2YoYyk9PT0nZnVuY3Rpb24nKXtcXFxucmV0dXJuIFEoYSwobD09PXVuZGVmaW5lZCk/MDpsfDAsKGg9PT11bmRlZmluZWQpP2Euc2hhcGVbMF0tMTpofDAseSxjKVxcXG59ZWxzZXtcXFxucmV0dXJuIEIoYSwoYz09PXVuZGVmaW5lZCk/MDpjfDAsKGw9PT11bmRlZmluZWQpP2Euc2hhcGVbMF0tMTpsfDAseSlcXFxufX1lbHNle1xcXG5pZih0eXBlb2YoYyk9PT0nZnVuY3Rpb24nKXtcXFxucmV0dXJuIFAoYSwobD09PXVuZGVmaW5lZCk/MDpsfDAsKGg9PT11bmRlZmluZWQpP2EubGVuZ3RoLTE6aHwwLHksYylcXFxufWVsc2V7XFxcbnJldHVybiBBKGEsKGM9PT11bmRlZmluZWQpPzA6Y3wwLChsPT09dW5kZWZpbmVkKT9hLmxlbmd0aC0xOmx8MCx5KVxcXG59fX1cXFxucmV0dXJuIGRpc3BhdGNoQnNlYXJjaFwiLCBzdWZmaXhdLmpvaW4oXCJcIikpXG4gIHJldHVybiByZXN1bHQoKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZ2U6IGNvbXBpbGVCb3VuZHNTZWFyY2goXCI+PVwiLCBmYWxzZSwgXCJHRVwiKSxcbiAgZ3Q6IGNvbXBpbGVCb3VuZHNTZWFyY2goXCI+XCIsIGZhbHNlLCBcIkdUXCIpLFxuICBsdDogY29tcGlsZUJvdW5kc1NlYXJjaChcIjxcIiwgdHJ1ZSwgXCJMVFwiKSxcbiAgbGU6IGNvbXBpbGVCb3VuZHNTZWFyY2goXCI8PVwiLCB0cnVlLCBcIkxFXCIpLFxuICBlcTogY29tcGlsZUJvdW5kc1NlYXJjaChcIi1cIiwgdHJ1ZSwgXCJFUVwiLCB0cnVlKVxufVxuIiwiLyoqXG4gKiBCaXQgdHdpZGRsaW5nIGhhY2tzIGZvciBKYXZhU2NyaXB0LlxuICpcbiAqIEF1dGhvcjogTWlrb2xhIEx5c2Vua29cbiAqXG4gKiBQb3J0ZWQgZnJvbSBTdGFuZm9yZCBiaXQgdHdpZGRsaW5nIGhhY2sgbGlicmFyeTpcbiAqICAgIGh0dHA6Ly9ncmFwaGljcy5zdGFuZm9yZC5lZHUvfnNlYW5kZXIvYml0aGFja3MuaHRtbFxuICovXG5cblwidXNlIHN0cmljdFwiOyBcInVzZSByZXN0cmljdFwiO1xuXG4vL051bWJlciBvZiBiaXRzIGluIGFuIGludGVnZXJcbnZhciBJTlRfQklUUyA9IDMyO1xuXG4vL0NvbnN0YW50c1xuZXhwb3J0cy5JTlRfQklUUyAgPSBJTlRfQklUUztcbmV4cG9ydHMuSU5UX01BWCAgID0gIDB4N2ZmZmZmZmY7XG5leHBvcnRzLklOVF9NSU4gICA9IC0xPDwoSU5UX0JJVFMtMSk7XG5cbi8vUmV0dXJucyAtMSwgMCwgKzEgZGVwZW5kaW5nIG9uIHNpZ24gb2YgeFxuZXhwb3J0cy5zaWduID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gKHYgPiAwKSAtICh2IDwgMCk7XG59XG5cbi8vQ29tcHV0ZXMgYWJzb2x1dGUgdmFsdWUgb2YgaW50ZWdlclxuZXhwb3J0cy5hYnMgPSBmdW5jdGlvbih2KSB7XG4gIHZhciBtYXNrID0gdiA+PiAoSU5UX0JJVFMtMSk7XG4gIHJldHVybiAodiBeIG1hc2spIC0gbWFzaztcbn1cblxuLy9Db21wdXRlcyBtaW5pbXVtIG9mIGludGVnZXJzIHggYW5kIHlcbmV4cG9ydHMubWluID0gZnVuY3Rpb24oeCwgeSkge1xuICByZXR1cm4geSBeICgoeCBeIHkpICYgLSh4IDwgeSkpO1xufVxuXG4vL0NvbXB1dGVzIG1heGltdW0gb2YgaW50ZWdlcnMgeCBhbmQgeVxuZXhwb3J0cy5tYXggPSBmdW5jdGlvbih4LCB5KSB7XG4gIHJldHVybiB4IF4gKCh4IF4geSkgJiAtKHggPCB5KSk7XG59XG5cbi8vQ2hlY2tzIGlmIGEgbnVtYmVyIGlzIGEgcG93ZXIgb2YgdHdvXG5leHBvcnRzLmlzUG93MiA9IGZ1bmN0aW9uKHYpIHtcbiAgcmV0dXJuICEodiAmICh2LTEpKSAmJiAoISF2KTtcbn1cblxuLy9Db21wdXRlcyBsb2cgYmFzZSAyIG9mIHZcbmV4cG9ydHMubG9nMiA9IGZ1bmN0aW9uKHYpIHtcbiAgdmFyIHIsIHNoaWZ0O1xuICByID0gICAgICh2ID4gMHhGRkZGKSA8PCA0OyB2ID4+Pj0gcjtcbiAgc2hpZnQgPSAodiA+IDB4RkYgICkgPDwgMzsgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0O1xuICBzaGlmdCA9ICh2ID4gMHhGICAgKSA8PCAyOyB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnQ7XG4gIHNoaWZ0ID0gKHYgPiAweDMgICApIDw8IDE7IHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdDtcbiAgcmV0dXJuIHIgfCAodiA+PiAxKTtcbn1cblxuLy9Db21wdXRlcyBsb2cgYmFzZSAxMCBvZiB2XG5leHBvcnRzLmxvZzEwID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gICh2ID49IDEwMDAwMDAwMDApID8gOSA6ICh2ID49IDEwMDAwMDAwMCkgPyA4IDogKHYgPj0gMTAwMDAwMDApID8gNyA6XG4gICAgICAgICAgKHYgPj0gMTAwMDAwMCkgPyA2IDogKHYgPj0gMTAwMDAwKSA/IDUgOiAodiA+PSAxMDAwMCkgPyA0IDpcbiAgICAgICAgICAodiA+PSAxMDAwKSA/IDMgOiAodiA+PSAxMDApID8gMiA6ICh2ID49IDEwKSA/IDEgOiAwO1xufVxuXG4vL0NvdW50cyBudW1iZXIgb2YgYml0c1xuZXhwb3J0cy5wb3BDb3VudCA9IGZ1bmN0aW9uKHYpIHtcbiAgdiA9IHYgLSAoKHYgPj4+IDEpICYgMHg1NTU1NTU1NSk7XG4gIHYgPSAodiAmIDB4MzMzMzMzMzMpICsgKCh2ID4+PiAyKSAmIDB4MzMzMzMzMzMpO1xuICByZXR1cm4gKCh2ICsgKHYgPj4+IDQpICYgMHhGMEYwRjBGKSAqIDB4MTAxMDEwMSkgPj4+IDI0O1xufVxuXG4vL0NvdW50cyBudW1iZXIgb2YgdHJhaWxpbmcgemVyb3NcbmZ1bmN0aW9uIGNvdW50VHJhaWxpbmdaZXJvcyh2KSB7XG4gIHZhciBjID0gMzI7XG4gIHYgJj0gLXY7XG4gIGlmICh2KSBjLS07XG4gIGlmICh2ICYgMHgwMDAwRkZGRikgYyAtPSAxNjtcbiAgaWYgKHYgJiAweDAwRkYwMEZGKSBjIC09IDg7XG4gIGlmICh2ICYgMHgwRjBGMEYwRikgYyAtPSA0O1xuICBpZiAodiAmIDB4MzMzMzMzMzMpIGMgLT0gMjtcbiAgaWYgKHYgJiAweDU1NTU1NTU1KSBjIC09IDE7XG4gIHJldHVybiBjO1xufVxuZXhwb3J0cy5jb3VudFRyYWlsaW5nWmVyb3MgPSBjb3VudFRyYWlsaW5nWmVyb3M7XG5cbi8vUm91bmRzIHRvIG5leHQgcG93ZXIgb2YgMlxuZXhwb3J0cy5uZXh0UG93MiA9IGZ1bmN0aW9uKHYpIHtcbiAgdiArPSB2ID09PSAwO1xuICAtLXY7XG4gIHYgfD0gdiA+Pj4gMTtcbiAgdiB8PSB2ID4+PiAyO1xuICB2IHw9IHYgPj4+IDQ7XG4gIHYgfD0gdiA+Pj4gODtcbiAgdiB8PSB2ID4+PiAxNjtcbiAgcmV0dXJuIHYgKyAxO1xufVxuXG4vL1JvdW5kcyBkb3duIHRvIHByZXZpb3VzIHBvd2VyIG9mIDJcbmV4cG9ydHMucHJldlBvdzIgPSBmdW5jdGlvbih2KSB7XG4gIHYgfD0gdiA+Pj4gMTtcbiAgdiB8PSB2ID4+PiAyO1xuICB2IHw9IHYgPj4+IDQ7XG4gIHYgfD0gdiA+Pj4gODtcbiAgdiB8PSB2ID4+PiAxNjtcbiAgcmV0dXJuIHYgLSAodj4+PjEpO1xufVxuXG4vL0NvbXB1dGVzIHBhcml0eSBvZiB3b3JkXG5leHBvcnRzLnBhcml0eSA9IGZ1bmN0aW9uKHYpIHtcbiAgdiBePSB2ID4+PiAxNjtcbiAgdiBePSB2ID4+PiA4O1xuICB2IF49IHYgPj4+IDQ7XG4gIHYgJj0gMHhmO1xuICByZXR1cm4gKDB4Njk5NiA+Pj4gdikgJiAxO1xufVxuXG52YXIgUkVWRVJTRV9UQUJMRSA9IG5ldyBBcnJheSgyNTYpO1xuXG4oZnVuY3Rpb24odGFiKSB7XG4gIGZvcih2YXIgaT0wOyBpPDI1NjsgKytpKSB7XG4gICAgdmFyIHYgPSBpLCByID0gaSwgcyA9IDc7XG4gICAgZm9yICh2ID4+Pj0gMTsgdjsgdiA+Pj49IDEpIHtcbiAgICAgIHIgPDw9IDE7XG4gICAgICByIHw9IHYgJiAxO1xuICAgICAgLS1zO1xuICAgIH1cbiAgICB0YWJbaV0gPSAociA8PCBzKSAmIDB4ZmY7XG4gIH1cbn0pKFJFVkVSU0VfVEFCTEUpO1xuXG4vL1JldmVyc2UgYml0cyBpbiBhIDMyIGJpdCB3b3JkXG5leHBvcnRzLnJldmVyc2UgPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiAgKFJFVkVSU0VfVEFCTEVbIHYgICAgICAgICAmIDB4ZmZdIDw8IDI0KSB8XG4gICAgICAgICAgKFJFVkVSU0VfVEFCTEVbKHYgPj4+IDgpICAmIDB4ZmZdIDw8IDE2KSB8XG4gICAgICAgICAgKFJFVkVSU0VfVEFCTEVbKHYgPj4+IDE2KSAmIDB4ZmZdIDw8IDgpICB8XG4gICAgICAgICAgIFJFVkVSU0VfVEFCTEVbKHYgPj4+IDI0KSAmIDB4ZmZdO1xufVxuXG4vL0ludGVybGVhdmUgYml0cyBvZiAyIGNvb3JkaW5hdGVzIHdpdGggMTYgYml0cy4gIFVzZWZ1bCBmb3IgZmFzdCBxdWFkdHJlZSBjb2Rlc1xuZXhwb3J0cy5pbnRlcmxlYXZlMiA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgeCAmPSAweEZGRkY7XG4gIHggPSAoeCB8ICh4IDw8IDgpKSAmIDB4MDBGRjAwRkY7XG4gIHggPSAoeCB8ICh4IDw8IDQpKSAmIDB4MEYwRjBGMEY7XG4gIHggPSAoeCB8ICh4IDw8IDIpKSAmIDB4MzMzMzMzMzM7XG4gIHggPSAoeCB8ICh4IDw8IDEpKSAmIDB4NTU1NTU1NTU7XG5cbiAgeSAmPSAweEZGRkY7XG4gIHkgPSAoeSB8ICh5IDw8IDgpKSAmIDB4MDBGRjAwRkY7XG4gIHkgPSAoeSB8ICh5IDw8IDQpKSAmIDB4MEYwRjBGMEY7XG4gIHkgPSAoeSB8ICh5IDw8IDIpKSAmIDB4MzMzMzMzMzM7XG4gIHkgPSAoeSB8ICh5IDw8IDEpKSAmIDB4NTU1NTU1NTU7XG5cbiAgcmV0dXJuIHggfCAoeSA8PCAxKTtcbn1cblxuLy9FeHRyYWN0cyB0aGUgbnRoIGludGVybGVhdmVkIGNvbXBvbmVudFxuZXhwb3J0cy5kZWludGVybGVhdmUyID0gZnVuY3Rpb24odiwgbikge1xuICB2ID0gKHYgPj4+IG4pICYgMHg1NTU1NTU1NTtcbiAgdiA9ICh2IHwgKHYgPj4+IDEpKSAgJiAweDMzMzMzMzMzO1xuICB2ID0gKHYgfCAodiA+Pj4gMikpICAmIDB4MEYwRjBGMEY7XG4gIHYgPSAodiB8ICh2ID4+PiA0KSkgICYgMHgwMEZGMDBGRjtcbiAgdiA9ICh2IHwgKHYgPj4+IDE2KSkgJiAweDAwMEZGRkY7XG4gIHJldHVybiAodiA8PCAxNikgPj4gMTY7XG59XG5cblxuLy9JbnRlcmxlYXZlIGJpdHMgb2YgMyBjb29yZGluYXRlcywgZWFjaCB3aXRoIDEwIGJpdHMuICBVc2VmdWwgZm9yIGZhc3Qgb2N0cmVlIGNvZGVzXG5leHBvcnRzLmludGVybGVhdmUzID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICB4ICY9IDB4M0ZGO1xuICB4ICA9ICh4IHwgKHg8PDE2KSkgJiA0Mjc4MTkwMzM1O1xuICB4ICA9ICh4IHwgKHg8PDgpKSAgJiAyNTE3MTk2OTU7XG4gIHggID0gKHggfCAoeDw8NCkpICAmIDMyNzIzNTYwMzU7XG4gIHggID0gKHggfCAoeDw8MikpICAmIDEyMjcxMzM1MTM7XG5cbiAgeSAmPSAweDNGRjtcbiAgeSAgPSAoeSB8ICh5PDwxNikpICYgNDI3ODE5MDMzNTtcbiAgeSAgPSAoeSB8ICh5PDw4KSkgICYgMjUxNzE5Njk1O1xuICB5ICA9ICh5IHwgKHk8PDQpKSAgJiAzMjcyMzU2MDM1O1xuICB5ICA9ICh5IHwgKHk8PDIpKSAgJiAxMjI3MTMzNTEzO1xuICB4IHw9ICh5IDw8IDEpO1xuICBcbiAgeiAmPSAweDNGRjtcbiAgeiAgPSAoeiB8ICh6PDwxNikpICYgNDI3ODE5MDMzNTtcbiAgeiAgPSAoeiB8ICh6PDw4KSkgICYgMjUxNzE5Njk1O1xuICB6ICA9ICh6IHwgKHo8PDQpKSAgJiAzMjcyMzU2MDM1O1xuICB6ICA9ICh6IHwgKHo8PDIpKSAgJiAxMjI3MTMzNTEzO1xuICBcbiAgcmV0dXJuIHggfCAoeiA8PCAyKTtcbn1cblxuLy9FeHRyYWN0cyBudGggaW50ZXJsZWF2ZWQgY29tcG9uZW50IG9mIGEgMy10dXBsZVxuZXhwb3J0cy5kZWludGVybGVhdmUzID0gZnVuY3Rpb24odiwgbikge1xuICB2ID0gKHYgPj4+IG4pICAgICAgICYgMTIyNzEzMzUxMztcbiAgdiA9ICh2IHwgKHY+Pj4yKSkgICAmIDMyNzIzNTYwMzU7XG4gIHYgPSAodiB8ICh2Pj4+NCkpICAgJiAyNTE3MTk2OTU7XG4gIHYgPSAodiB8ICh2Pj4+OCkpICAgJiA0Mjc4MTkwMzM1O1xuICB2ID0gKHYgfCAodj4+PjE2KSkgICYgMHgzRkY7XG4gIHJldHVybiAodjw8MjIpPj4yMjtcbn1cblxuLy9Db21wdXRlcyBuZXh0IGNvbWJpbmF0aW9uIGluIGNvbGV4aWNvZ3JhcGhpYyBvcmRlciAodGhpcyBpcyBtaXN0YWtlbmx5IGNhbGxlZCBuZXh0UGVybXV0YXRpb24gb24gdGhlIGJpdCB0d2lkZGxpbmcgaGFja3MgcGFnZSlcbmV4cG9ydHMubmV4dENvbWJpbmF0aW9uID0gZnVuY3Rpb24odikge1xuICB2YXIgdCA9IHYgfCAodiAtIDEpO1xuICByZXR1cm4gKHQgKyAxKSB8ICgoKH50ICYgLX50KSAtIDEpID4+PiAoY291bnRUcmFpbGluZ1plcm9zKHYpICsgMSkpO1xufVxuXG4iLCIvKiBaZXB0byB2MS4xLjQgLSB6ZXB0byBldmVudCBhamF4IGZvcm0gaWUgLSB6ZXB0b2pzLmNvbS9saWNlbnNlICovXG5cbnZhciBaZXB0byA9IG1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuICB2YXIgdW5kZWZpbmVkLCBrZXksICQsIGNsYXNzTGlzdCwgZW1wdHlBcnJheSA9IFtdLCBzbGljZSA9IGVtcHR5QXJyYXkuc2xpY2UsIGZpbHRlciA9IGVtcHR5QXJyYXkuZmlsdGVyLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50LFxuICAgIGVsZW1lbnREaXNwbGF5ID0ge30sIGNsYXNzQ2FjaGUgPSB7fSxcbiAgICBjc3NOdW1iZXIgPSB7ICdjb2x1bW4tY291bnQnOiAxLCAnY29sdW1ucyc6IDEsICdmb250LXdlaWdodCc6IDEsICdsaW5lLWhlaWdodCc6IDEsJ29wYWNpdHknOiAxLCAnei1pbmRleCc6IDEsICd6b29tJzogMSB9LFxuICAgIGZyYWdtZW50UkUgPSAvXlxccyo8KFxcdyt8ISlbXj5dKj4vLFxuICAgIHNpbmdsZVRhZ1JFID0gL148KFxcdyspXFxzKlxcLz8+KD86PFxcL1xcMT58KSQvLFxuICAgIHRhZ0V4cGFuZGVyUkUgPSAvPCg/IWFyZWF8YnJ8Y29sfGVtYmVkfGhyfGltZ3xpbnB1dHxsaW5rfG1ldGF8cGFyYW0pKChbXFx3Ol0rKVtePl0qKVxcLz4vaWcsXG4gICAgcm9vdE5vZGVSRSA9IC9eKD86Ym9keXxodG1sKSQvaSxcbiAgICBjYXBpdGFsUkUgPSAvKFtBLVpdKS9nLFxuXG4gICAgLy8gc3BlY2lhbCBhdHRyaWJ1dGVzIHRoYXQgc2hvdWxkIGJlIGdldC9zZXQgdmlhIG1ldGhvZCBjYWxsc1xuICAgIG1ldGhvZEF0dHJpYnV0ZXMgPSBbJ3ZhbCcsICdjc3MnLCAnaHRtbCcsICd0ZXh0JywgJ2RhdGEnLCAnd2lkdGgnLCAnaGVpZ2h0JywgJ29mZnNldCddLFxuXG4gICAgYWRqYWNlbmN5T3BlcmF0b3JzID0gWyAnYWZ0ZXInLCAncHJlcGVuZCcsICdiZWZvcmUnLCAnYXBwZW5kJyBdLFxuICAgIHRhYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGFibGUnKSxcbiAgICB0YWJsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyksXG4gICAgY29udGFpbmVycyA9IHtcbiAgICAgICd0cic6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3Rib2R5JyksXG4gICAgICAndGJvZHknOiB0YWJsZSwgJ3RoZWFkJzogdGFibGUsICd0Zm9vdCc6IHRhYmxlLFxuICAgICAgJ3RkJzogdGFibGVSb3csICd0aCc6IHRhYmxlUm93LFxuICAgICAgJyonOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuICAgIH0sXG4gICAgcmVhZHlSRSA9IC9jb21wbGV0ZXxsb2FkZWR8aW50ZXJhY3RpdmUvLFxuICAgIHNpbXBsZVNlbGVjdG9yUkUgPSAvXltcXHctXSokLyxcbiAgICBjbGFzczJ0eXBlID0ge30sXG4gICAgdG9TdHJpbmcgPSBjbGFzczJ0eXBlLnRvU3RyaW5nLFxuICAgIHplcHRvID0ge30sXG4gICAgY2FtZWxpemUsIHVuaXEsXG4gICAgdGVtcFBhcmVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuICAgIHByb3BNYXAgPSB7XG4gICAgICAndGFiaW5kZXgnOiAndGFiSW5kZXgnLFxuICAgICAgJ3JlYWRvbmx5JzogJ3JlYWRPbmx5JyxcbiAgICAgICdmb3InOiAnaHRtbEZvcicsXG4gICAgICAnY2xhc3MnOiAnY2xhc3NOYW1lJyxcbiAgICAgICdtYXhsZW5ndGgnOiAnbWF4TGVuZ3RoJyxcbiAgICAgICdjZWxsc3BhY2luZyc6ICdjZWxsU3BhY2luZycsXG4gICAgICAnY2VsbHBhZGRpbmcnOiAnY2VsbFBhZGRpbmcnLFxuICAgICAgJ3Jvd3NwYW4nOiAncm93U3BhbicsXG4gICAgICAnY29sc3Bhbic6ICdjb2xTcGFuJyxcbiAgICAgICd1c2VtYXAnOiAndXNlTWFwJyxcbiAgICAgICdmcmFtZWJvcmRlcic6ICdmcmFtZUJvcmRlcicsXG4gICAgICAnY29udGVudGVkaXRhYmxlJzogJ2NvbnRlbnRFZGl0YWJsZSdcbiAgICB9LFxuICAgIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8XG4gICAgICBmdW5jdGlvbihvYmplY3QpeyByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgQXJyYXkgfVxuXG4gIHplcHRvLm1hdGNoZXMgPSBmdW5jdGlvbihlbGVtZW50LCBzZWxlY3Rvcikge1xuICAgIGlmICghc2VsZWN0b3IgfHwgIWVsZW1lbnQgfHwgZWxlbWVudC5ub2RlVHlwZSAhPT0gMSkgcmV0dXJuIGZhbHNlXG4gICAgdmFyIG1hdGNoZXNTZWxlY3RvciA9IGVsZW1lbnQud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8IGVsZW1lbnQubW96TWF0Y2hlc1NlbGVjdG9yIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQub01hdGNoZXNTZWxlY3RvciB8fCBlbGVtZW50Lm1hdGNoZXNTZWxlY3RvclxuICAgIGlmIChtYXRjaGVzU2VsZWN0b3IpIHJldHVybiBtYXRjaGVzU2VsZWN0b3IuY2FsbChlbGVtZW50LCBzZWxlY3RvcilcbiAgICAvLyBmYWxsIGJhY2sgdG8gcGVyZm9ybWluZyBhIHNlbGVjdG9yOlxuICAgIHZhciBtYXRjaCwgcGFyZW50ID0gZWxlbWVudC5wYXJlbnROb2RlLCB0ZW1wID0gIXBhcmVudFxuICAgIGlmICh0ZW1wKSAocGFyZW50ID0gdGVtcFBhcmVudCkuYXBwZW5kQ2hpbGQoZWxlbWVudClcbiAgICBtYXRjaCA9IH56ZXB0by5xc2EocGFyZW50LCBzZWxlY3RvcikuaW5kZXhPZihlbGVtZW50KVxuICAgIHRlbXAgJiYgdGVtcFBhcmVudC5yZW1vdmVDaGlsZChlbGVtZW50KVxuICAgIHJldHVybiBtYXRjaFxuICB9XG5cbiAgZnVuY3Rpb24gdHlwZShvYmopIHtcbiAgICByZXR1cm4gb2JqID09IG51bGwgPyBTdHJpbmcob2JqKSA6XG4gICAgICBjbGFzczJ0eXBlW3RvU3RyaW5nLmNhbGwob2JqKV0gfHwgXCJvYmplY3RcIlxuICB9XG5cbiAgZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkgeyByZXR1cm4gdHlwZSh2YWx1ZSkgPT0gXCJmdW5jdGlvblwiIH1cbiAgZnVuY3Rpb24gaXNXaW5kb3cob2JqKSAgICAgeyByZXR1cm4gb2JqICE9IG51bGwgJiYgb2JqID09IG9iai53aW5kb3cgfVxuICBmdW5jdGlvbiBpc0RvY3VtZW50KG9iaikgICB7IHJldHVybiBvYmogIT0gbnVsbCAmJiBvYmoubm9kZVR5cGUgPT0gb2JqLkRPQ1VNRU5UX05PREUgfVxuICBmdW5jdGlvbiBpc09iamVjdChvYmopICAgICB7IHJldHVybiB0eXBlKG9iaikgPT0gXCJvYmplY3RcIiB9XG4gIGZ1bmN0aW9uIGlzUGxhaW5PYmplY3Qob2JqKSB7XG4gICAgcmV0dXJuIGlzT2JqZWN0KG9iaikgJiYgIWlzV2luZG93KG9iaikgJiYgT2JqZWN0LmdldFByb3RvdHlwZU9mKG9iaikgPT0gT2JqZWN0LnByb3RvdHlwZVxuICB9XG4gIGZ1bmN0aW9uIGxpa2VBcnJheShvYmopIHsgcmV0dXJuIHR5cGVvZiBvYmoubGVuZ3RoID09ICdudW1iZXInIH1cblxuICBmdW5jdGlvbiBjb21wYWN0KGFycmF5KSB7IHJldHVybiBmaWx0ZXIuY2FsbChhcnJheSwgZnVuY3Rpb24oaXRlbSl7IHJldHVybiBpdGVtICE9IG51bGwgfSkgfVxuICBmdW5jdGlvbiBmbGF0dGVuKGFycmF5KSB7IHJldHVybiBhcnJheS5sZW5ndGggPiAwID8gJC5mbi5jb25jYXQuYXBwbHkoW10sIGFycmF5KSA6IGFycmF5IH1cbiAgY2FtZWxpemUgPSBmdW5jdGlvbihzdHIpeyByZXR1cm4gc3RyLnJlcGxhY2UoLy0rKC4pPy9nLCBmdW5jdGlvbihtYXRjaCwgY2hyKXsgcmV0dXJuIGNociA/IGNoci50b1VwcGVyQ2FzZSgpIDogJycgfSkgfVxuICBmdW5jdGlvbiBkYXNoZXJpemUoc3RyKSB7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC86Oi9nLCAnLycpXG4gICAgICAgICAgIC5yZXBsYWNlKC8oW0EtWl0rKShbQS1aXVthLXpdKS9nLCAnJDFfJDInKVxuICAgICAgICAgICAucmVwbGFjZSgvKFthLXpcXGRdKShbQS1aXSkvZywgJyQxXyQyJylcbiAgICAgICAgICAgLnJlcGxhY2UoL18vZywgJy0nKVxuICAgICAgICAgICAudG9Mb3dlckNhc2UoKVxuICB9XG4gIHVuaXEgPSBmdW5jdGlvbihhcnJheSl7IHJldHVybiBmaWx0ZXIuY2FsbChhcnJheSwgZnVuY3Rpb24oaXRlbSwgaWR4KXsgcmV0dXJuIGFycmF5LmluZGV4T2YoaXRlbSkgPT0gaWR4IH0pIH1cblxuICBmdW5jdGlvbiBjbGFzc1JFKG5hbWUpIHtcbiAgICByZXR1cm4gbmFtZSBpbiBjbGFzc0NhY2hlID9cbiAgICAgIGNsYXNzQ2FjaGVbbmFtZV0gOiAoY2xhc3NDYWNoZVtuYW1lXSA9IG5ldyBSZWdFeHAoJyhefFxcXFxzKScgKyBuYW1lICsgJyhcXFxcc3wkKScpKVxuICB9XG5cbiAgZnVuY3Rpb24gbWF5YmVBZGRQeChuYW1lLCB2YWx1ZSkge1xuICAgIHJldHVybiAodHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIgJiYgIWNzc051bWJlcltkYXNoZXJpemUobmFtZSldKSA/IHZhbHVlICsgXCJweFwiIDogdmFsdWVcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlZmF1bHREaXNwbGF5KG5vZGVOYW1lKSB7XG4gICAgdmFyIGVsZW1lbnQsIGRpc3BsYXlcbiAgICBpZiAoIWVsZW1lbnREaXNwbGF5W25vZGVOYW1lXSkge1xuICAgICAgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQobm9kZU5hbWUpXG4gICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsZW1lbnQpXG4gICAgICBkaXNwbGF5ID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50LCAnJykuZ2V0UHJvcGVydHlWYWx1ZShcImRpc3BsYXlcIilcbiAgICAgIGVsZW1lbnQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbGVtZW50KVxuICAgICAgZGlzcGxheSA9PSBcIm5vbmVcIiAmJiAoZGlzcGxheSA9IFwiYmxvY2tcIilcbiAgICAgIGVsZW1lbnREaXNwbGF5W25vZGVOYW1lXSA9IGRpc3BsYXlcbiAgICB9XG4gICAgcmV0dXJuIGVsZW1lbnREaXNwbGF5W25vZGVOYW1lXVxuICB9XG5cbiAgZnVuY3Rpb24gY2hpbGRyZW4oZWxlbWVudCkge1xuICAgIHJldHVybiAnY2hpbGRyZW4nIGluIGVsZW1lbnQgP1xuICAgICAgc2xpY2UuY2FsbChlbGVtZW50LmNoaWxkcmVuKSA6XG4gICAgICAkLm1hcChlbGVtZW50LmNoaWxkTm9kZXMsIGZ1bmN0aW9uKG5vZGUpeyBpZiAobm9kZS5ub2RlVHlwZSA9PSAxKSByZXR1cm4gbm9kZSB9KVxuICB9XG5cbiAgLy8gYCQuemVwdG8uZnJhZ21lbnRgIHRha2VzIGEgaHRtbCBzdHJpbmcgYW5kIGFuIG9wdGlvbmFsIHRhZyBuYW1lXG4gIC8vIHRvIGdlbmVyYXRlIERPTSBub2RlcyBub2RlcyBmcm9tIHRoZSBnaXZlbiBodG1sIHN0cmluZy5cbiAgLy8gVGhlIGdlbmVyYXRlZCBET00gbm9kZXMgYXJlIHJldHVybmVkIGFzIGFuIGFycmF5LlxuICAvLyBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBvdmVycmlkZW4gaW4gcGx1Z2lucyBmb3IgZXhhbXBsZSB0byBtYWtlXG4gIC8vIGl0IGNvbXBhdGlibGUgd2l0aCBicm93c2VycyB0aGF0IGRvbid0IHN1cHBvcnQgdGhlIERPTSBmdWxseS5cbiAgemVwdG8uZnJhZ21lbnQgPSBmdW5jdGlvbihodG1sLCBuYW1lLCBwcm9wZXJ0aWVzKSB7XG4gICAgdmFyIGRvbSwgbm9kZXMsIGNvbnRhaW5lclxuXG4gICAgLy8gQSBzcGVjaWFsIGNhc2Ugb3B0aW1pemF0aW9uIGZvciBhIHNpbmdsZSB0YWdcbiAgICBpZiAoc2luZ2xlVGFnUkUudGVzdChodG1sKSkgZG9tID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFJlZ0V4cC4kMSkpXG5cbiAgICBpZiAoIWRvbSkge1xuICAgICAgaWYgKGh0bWwucmVwbGFjZSkgaHRtbCA9IGh0bWwucmVwbGFjZSh0YWdFeHBhbmRlclJFLCBcIjwkMT48LyQyPlwiKVxuICAgICAgaWYgKG5hbWUgPT09IHVuZGVmaW5lZCkgbmFtZSA9IGZyYWdtZW50UkUudGVzdChodG1sKSAmJiBSZWdFeHAuJDFcbiAgICAgIGlmICghKG5hbWUgaW4gY29udGFpbmVycykpIG5hbWUgPSAnKidcblxuICAgICAgY29udGFpbmVyID0gY29udGFpbmVyc1tuYW1lXVxuICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9ICcnICsgaHRtbFxuICAgICAgZG9tID0gJC5lYWNoKHNsaWNlLmNhbGwoY29udGFpbmVyLmNoaWxkTm9kZXMpLCBmdW5jdGlvbigpe1xuICAgICAgICBjb250YWluZXIucmVtb3ZlQ2hpbGQodGhpcylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgaWYgKGlzUGxhaW5PYmplY3QocHJvcGVydGllcykpIHtcbiAgICAgIG5vZGVzID0gJChkb20pXG4gICAgICAkLmVhY2gocHJvcGVydGllcywgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICBpZiAobWV0aG9kQXR0cmlidXRlcy5pbmRleE9mKGtleSkgPiAtMSkgbm9kZXNba2V5XSh2YWx1ZSlcbiAgICAgICAgZWxzZSBub2Rlcy5hdHRyKGtleSwgdmFsdWUpXG4gICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiBkb21cbiAgfVxuXG4gIC8vIGAkLnplcHRvLlpgIHN3YXBzIG91dCB0aGUgcHJvdG90eXBlIG9mIHRoZSBnaXZlbiBgZG9tYCBhcnJheVxuICAvLyBvZiBub2RlcyB3aXRoIGAkLmZuYCBhbmQgdGh1cyBzdXBwbHlpbmcgYWxsIHRoZSBaZXB0byBmdW5jdGlvbnNcbiAgLy8gdG8gdGhlIGFycmF5LiBOb3RlIHRoYXQgYF9fcHJvdG9fX2AgaXMgbm90IHN1cHBvcnRlZCBvbiBJbnRlcm5ldFxuICAvLyBFeHBsb3Jlci4gVGhpcyBtZXRob2QgY2FuIGJlIG92ZXJyaWRlbiBpbiBwbHVnaW5zLlxuICB6ZXB0by5aID0gZnVuY3Rpb24oZG9tLCBzZWxlY3Rvcikge1xuICAgIGRvbSA9IGRvbSB8fCBbXVxuICAgIGRvbS5fX3Byb3RvX18gPSAkLmZuXG4gICAgZG9tLnNlbGVjdG9yID0gc2VsZWN0b3IgfHwgJydcbiAgICByZXR1cm4gZG9tXG4gIH1cblxuICAvLyBgJC56ZXB0by5pc1pgIHNob3VsZCByZXR1cm4gYHRydWVgIGlmIHRoZSBnaXZlbiBvYmplY3QgaXMgYSBaZXB0b1xuICAvLyBjb2xsZWN0aW9uLiBUaGlzIG1ldGhvZCBjYW4gYmUgb3ZlcnJpZGVuIGluIHBsdWdpbnMuXG4gIHplcHRvLmlzWiA9IGZ1bmN0aW9uKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiB6ZXB0by5aXG4gIH1cblxuICAvLyBgJC56ZXB0by5pbml0YCBpcyBaZXB0bydzIGNvdW50ZXJwYXJ0IHRvIGpRdWVyeSdzIGAkLmZuLmluaXRgIGFuZFxuICAvLyB0YWtlcyBhIENTUyBzZWxlY3RvciBhbmQgYW4gb3B0aW9uYWwgY29udGV4dCAoYW5kIGhhbmRsZXMgdmFyaW91c1xuICAvLyBzcGVjaWFsIGNhc2VzKS5cbiAgLy8gVGhpcyBtZXRob2QgY2FuIGJlIG92ZXJyaWRlbiBpbiBwbHVnaW5zLlxuICB6ZXB0by5pbml0ID0gZnVuY3Rpb24oc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgZG9tXG4gICAgLy8gSWYgbm90aGluZyBnaXZlbiwgcmV0dXJuIGFuIGVtcHR5IFplcHRvIGNvbGxlY3Rpb25cbiAgICBpZiAoIXNlbGVjdG9yKSByZXR1cm4gemVwdG8uWigpXG4gICAgLy8gT3B0aW1pemUgZm9yIHN0cmluZyBzZWxlY3RvcnNcbiAgICBlbHNlIGlmICh0eXBlb2Ygc2VsZWN0b3IgPT0gJ3N0cmluZycpIHtcbiAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3IudHJpbSgpXG4gICAgICAvLyBJZiBpdCdzIGEgaHRtbCBmcmFnbWVudCwgY3JlYXRlIG5vZGVzIGZyb20gaXRcbiAgICAgIC8vIE5vdGU6IEluIGJvdGggQ2hyb21lIDIxIGFuZCBGaXJlZm94IDE1LCBET00gZXJyb3IgMTJcbiAgICAgIC8vIGlzIHRocm93biBpZiB0aGUgZnJhZ21lbnQgZG9lc24ndCBiZWdpbiB3aXRoIDxcbiAgICAgIGlmIChzZWxlY3RvclswXSA9PSAnPCcgJiYgZnJhZ21lbnRSRS50ZXN0KHNlbGVjdG9yKSlcbiAgICAgICAgZG9tID0gemVwdG8uZnJhZ21lbnQoc2VsZWN0b3IsIFJlZ0V4cC4kMSwgY29udGV4dCksIHNlbGVjdG9yID0gbnVsbFxuICAgICAgLy8gSWYgdGhlcmUncyBhIGNvbnRleHQsIGNyZWF0ZSBhIGNvbGxlY3Rpb24gb24gdGhhdCBjb250ZXh0IGZpcnN0LCBhbmQgc2VsZWN0XG4gICAgICAvLyBub2RlcyBmcm9tIHRoZXJlXG4gICAgICBlbHNlIGlmIChjb250ZXh0ICE9PSB1bmRlZmluZWQpIHJldHVybiAkKGNvbnRleHQpLmZpbmQoc2VsZWN0b3IpXG4gICAgICAvLyBJZiBpdCdzIGEgQ1NTIHNlbGVjdG9yLCB1c2UgaXQgdG8gc2VsZWN0IG5vZGVzLlxuICAgICAgZWxzZSBkb20gPSB6ZXB0by5xc2EoZG9jdW1lbnQsIHNlbGVjdG9yKVxuICAgIH1cbiAgICAvLyBJZiBhIGZ1bmN0aW9uIGlzIGdpdmVuLCBjYWxsIGl0IHdoZW4gdGhlIERPTSBpcyByZWFkeVxuICAgIGVsc2UgaWYgKGlzRnVuY3Rpb24oc2VsZWN0b3IpKSByZXR1cm4gJChkb2N1bWVudCkucmVhZHkoc2VsZWN0b3IpXG4gICAgLy8gSWYgYSBaZXB0byBjb2xsZWN0aW9uIGlzIGdpdmVuLCBqdXN0IHJldHVybiBpdFxuICAgIGVsc2UgaWYgKHplcHRvLmlzWihzZWxlY3RvcikpIHJldHVybiBzZWxlY3RvclxuICAgIGVsc2Uge1xuICAgICAgLy8gbm9ybWFsaXplIGFycmF5IGlmIGFuIGFycmF5IG9mIG5vZGVzIGlzIGdpdmVuXG4gICAgICBpZiAoaXNBcnJheShzZWxlY3RvcikpIGRvbSA9IGNvbXBhY3Qoc2VsZWN0b3IpXG4gICAgICAvLyBXcmFwIERPTSBub2Rlcy5cbiAgICAgIGVsc2UgaWYgKGlzT2JqZWN0KHNlbGVjdG9yKSlcbiAgICAgICAgZG9tID0gW3NlbGVjdG9yXSwgc2VsZWN0b3IgPSBudWxsXG4gICAgICAvLyBJZiBpdCdzIGEgaHRtbCBmcmFnbWVudCwgY3JlYXRlIG5vZGVzIGZyb20gaXRcbiAgICAgIGVsc2UgaWYgKGZyYWdtZW50UkUudGVzdChzZWxlY3RvcikpXG4gICAgICAgIGRvbSA9IHplcHRvLmZyYWdtZW50KHNlbGVjdG9yLnRyaW0oKSwgUmVnRXhwLiQxLCBjb250ZXh0KSwgc2VsZWN0b3IgPSBudWxsXG4gICAgICAvLyBJZiB0aGVyZSdzIGEgY29udGV4dCwgY3JlYXRlIGEgY29sbGVjdGlvbiBvbiB0aGF0IGNvbnRleHQgZmlyc3QsIGFuZCBzZWxlY3RcbiAgICAgIC8vIG5vZGVzIGZyb20gdGhlcmVcbiAgICAgIGVsc2UgaWYgKGNvbnRleHQgIT09IHVuZGVmaW5lZCkgcmV0dXJuICQoY29udGV4dCkuZmluZChzZWxlY3RvcilcbiAgICAgIC8vIEFuZCBsYXN0IGJ1dCBubyBsZWFzdCwgaWYgaXQncyBhIENTUyBzZWxlY3RvciwgdXNlIGl0IHRvIHNlbGVjdCBub2Rlcy5cbiAgICAgIGVsc2UgZG9tID0gemVwdG8ucXNhKGRvY3VtZW50LCBzZWxlY3RvcilcbiAgICB9XG4gICAgLy8gY3JlYXRlIGEgbmV3IFplcHRvIGNvbGxlY3Rpb24gZnJvbSB0aGUgbm9kZXMgZm91bmRcbiAgICByZXR1cm4gemVwdG8uWihkb20sIHNlbGVjdG9yKVxuICB9XG5cbiAgLy8gYCRgIHdpbGwgYmUgdGhlIGJhc2UgYFplcHRvYCBvYmplY3QuIFdoZW4gY2FsbGluZyB0aGlzXG4gIC8vIGZ1bmN0aW9uIGp1c3QgY2FsbCBgJC56ZXB0by5pbml0LCB3aGljaCBtYWtlcyB0aGUgaW1wbGVtZW50YXRpb25cbiAgLy8gZGV0YWlscyBvZiBzZWxlY3Rpbmcgbm9kZXMgYW5kIGNyZWF0aW5nIFplcHRvIGNvbGxlY3Rpb25zXG4gIC8vIHBhdGNoYWJsZSBpbiBwbHVnaW5zLlxuICAkID0gZnVuY3Rpb24oc2VsZWN0b3IsIGNvbnRleHQpe1xuICAgIHJldHVybiB6ZXB0by5pbml0KHNlbGVjdG9yLCBjb250ZXh0KVxuICB9XG5cbiAgZnVuY3Rpb24gZXh0ZW5kKHRhcmdldCwgc291cmNlLCBkZWVwKSB7XG4gICAgZm9yIChrZXkgaW4gc291cmNlKVxuICAgICAgaWYgKGRlZXAgJiYgKGlzUGxhaW5PYmplY3Qoc291cmNlW2tleV0pIHx8IGlzQXJyYXkoc291cmNlW2tleV0pKSkge1xuICAgICAgICBpZiAoaXNQbGFpbk9iamVjdChzb3VyY2Vba2V5XSkgJiYgIWlzUGxhaW5PYmplY3QodGFyZ2V0W2tleV0pKVxuICAgICAgICAgIHRhcmdldFtrZXldID0ge31cbiAgICAgICAgaWYgKGlzQXJyYXkoc291cmNlW2tleV0pICYmICFpc0FycmF5KHRhcmdldFtrZXldKSlcbiAgICAgICAgICB0YXJnZXRba2V5XSA9IFtdXG4gICAgICAgIGV4dGVuZCh0YXJnZXRba2V5XSwgc291cmNlW2tleV0sIGRlZXApXG4gICAgICB9XG4gICAgICBlbHNlIGlmIChzb3VyY2Vba2V5XSAhPT0gdW5kZWZpbmVkKSB0YXJnZXRba2V5XSA9IHNvdXJjZVtrZXldXG4gIH1cblxuICAvLyBDb3B5IGFsbCBidXQgdW5kZWZpbmVkIHByb3BlcnRpZXMgZnJvbSBvbmUgb3IgbW9yZVxuICAvLyBvYmplY3RzIHRvIHRoZSBgdGFyZ2V0YCBvYmplY3QuXG4gICQuZXh0ZW5kID0gZnVuY3Rpb24odGFyZ2V0KXtcbiAgICB2YXIgZGVlcCwgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxuICAgIGlmICh0eXBlb2YgdGFyZ2V0ID09ICdib29sZWFuJykge1xuICAgICAgZGVlcCA9IHRhcmdldFxuICAgICAgdGFyZ2V0ID0gYXJncy5zaGlmdCgpXG4gICAgfVxuICAgIGFyZ3MuZm9yRWFjaChmdW5jdGlvbihhcmcpeyBleHRlbmQodGFyZ2V0LCBhcmcsIGRlZXApIH0pXG4gICAgcmV0dXJuIHRhcmdldFxuICB9XG5cbiAgLy8gYCQuemVwdG8ucXNhYCBpcyBaZXB0bydzIENTUyBzZWxlY3RvciBpbXBsZW1lbnRhdGlvbiB3aGljaFxuICAvLyB1c2VzIGBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsYCBhbmQgb3B0aW1pemVzIGZvciBzb21lIHNwZWNpYWwgY2FzZXMsIGxpa2UgYCNpZGAuXG4gIC8vIFRoaXMgbWV0aG9kIGNhbiBiZSBvdmVycmlkZW4gaW4gcGx1Z2lucy5cbiAgemVwdG8ucXNhID0gZnVuY3Rpb24oZWxlbWVudCwgc2VsZWN0b3Ipe1xuICAgIHZhciBmb3VuZCxcbiAgICAgICAgbWF5YmVJRCA9IHNlbGVjdG9yWzBdID09ICcjJyxcbiAgICAgICAgbWF5YmVDbGFzcyA9ICFtYXliZUlEICYmIHNlbGVjdG9yWzBdID09ICcuJyxcbiAgICAgICAgbmFtZU9ubHkgPSBtYXliZUlEIHx8IG1heWJlQ2xhc3MgPyBzZWxlY3Rvci5zbGljZSgxKSA6IHNlbGVjdG9yLCAvLyBFbnN1cmUgdGhhdCBhIDEgY2hhciB0YWcgbmFtZSBzdGlsbCBnZXRzIGNoZWNrZWRcbiAgICAgICAgaXNTaW1wbGUgPSBzaW1wbGVTZWxlY3RvclJFLnRlc3QobmFtZU9ubHkpXG4gICAgcmV0dXJuIChpc0RvY3VtZW50KGVsZW1lbnQpICYmIGlzU2ltcGxlICYmIG1heWJlSUQpID9cbiAgICAgICggKGZvdW5kID0gZWxlbWVudC5nZXRFbGVtZW50QnlJZChuYW1lT25seSkpID8gW2ZvdW5kXSA6IFtdICkgOlxuICAgICAgKGVsZW1lbnQubm9kZVR5cGUgIT09IDEgJiYgZWxlbWVudC5ub2RlVHlwZSAhPT0gOSkgPyBbXSA6XG4gICAgICBzbGljZS5jYWxsKFxuICAgICAgICBpc1NpbXBsZSAmJiAhbWF5YmVJRCA/XG4gICAgICAgICAgbWF5YmVDbGFzcyA/IGVsZW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShuYW1lT25seSkgOiAvLyBJZiBpdCdzIHNpbXBsZSwgaXQgY291bGQgYmUgYSBjbGFzc1xuICAgICAgICAgIGVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoc2VsZWN0b3IpIDogLy8gT3IgYSB0YWdcbiAgICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpIC8vIE9yIGl0J3Mgbm90IHNpbXBsZSwgYW5kIHdlIG5lZWQgdG8gcXVlcnkgYWxsXG4gICAgICApXG4gIH1cblxuICBmdW5jdGlvbiBmaWx0ZXJlZChub2Rlcywgc2VsZWN0b3IpIHtcbiAgICByZXR1cm4gc2VsZWN0b3IgPT0gbnVsbCA/ICQobm9kZXMpIDogJChub2RlcykuZmlsdGVyKHNlbGVjdG9yKVxuICB9XG5cbiAgJC5jb250YWlucyA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jb250YWlucyA/XG4gICAgZnVuY3Rpb24ocGFyZW50LCBub2RlKSB7XG4gICAgICByZXR1cm4gcGFyZW50ICE9PSBub2RlICYmIHBhcmVudC5jb250YWlucyhub2RlKVxuICAgIH0gOlxuICAgIGZ1bmN0aW9uKHBhcmVudCwgbm9kZSkge1xuICAgICAgd2hpbGUgKG5vZGUgJiYgKG5vZGUgPSBub2RlLnBhcmVudE5vZGUpKVxuICAgICAgICBpZiAobm9kZSA9PT0gcGFyZW50KSByZXR1cm4gdHJ1ZVxuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gIGZ1bmN0aW9uIGZ1bmNBcmcoY29udGV4dCwgYXJnLCBpZHgsIHBheWxvYWQpIHtcbiAgICByZXR1cm4gaXNGdW5jdGlvbihhcmcpID8gYXJnLmNhbGwoY29udGV4dCwgaWR4LCBwYXlsb2FkKSA6IGFyZ1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0QXR0cmlidXRlKG5vZGUsIG5hbWUsIHZhbHVlKSB7XG4gICAgdmFsdWUgPT0gbnVsbCA/IG5vZGUucmVtb3ZlQXR0cmlidXRlKG5hbWUpIDogbm9kZS5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpXG4gIH1cblxuICAvLyBhY2Nlc3MgY2xhc3NOYW1lIHByb3BlcnR5IHdoaWxlIHJlc3BlY3RpbmcgU1ZHQW5pbWF0ZWRTdHJpbmdcbiAgZnVuY3Rpb24gY2xhc3NOYW1lKG5vZGUsIHZhbHVlKXtcbiAgICB2YXIga2xhc3MgPSBub2RlLmNsYXNzTmFtZSxcbiAgICAgICAgc3ZnICAgPSBrbGFzcyAmJiBrbGFzcy5iYXNlVmFsICE9PSB1bmRlZmluZWRcblxuICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSByZXR1cm4gc3ZnID8ga2xhc3MuYmFzZVZhbCA6IGtsYXNzXG4gICAgc3ZnID8gKGtsYXNzLmJhc2VWYWwgPSB2YWx1ZSkgOiAobm9kZS5jbGFzc05hbWUgPSB2YWx1ZSlcbiAgfVxuXG4gIC8vIFwidHJ1ZVwiICA9PiB0cnVlXG4gIC8vIFwiZmFsc2VcIiA9PiBmYWxzZVxuICAvLyBcIm51bGxcIiAgPT4gbnVsbFxuICAvLyBcIjQyXCIgICAgPT4gNDJcbiAgLy8gXCI0Mi41XCIgID0+IDQyLjVcbiAgLy8gXCIwOFwiICAgID0+IFwiMDhcIlxuICAvLyBKU09OICAgID0+IHBhcnNlIGlmIHZhbGlkXG4gIC8vIFN0cmluZyAgPT4gc2VsZlxuICBmdW5jdGlvbiBkZXNlcmlhbGl6ZVZhbHVlKHZhbHVlKSB7XG4gICAgdmFyIG51bVxuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdmFsdWUgP1xuICAgICAgICB2YWx1ZSA9PSBcInRydWVcIiB8fFxuICAgICAgICAoIHZhbHVlID09IFwiZmFsc2VcIiA/IGZhbHNlIDpcbiAgICAgICAgICB2YWx1ZSA9PSBcIm51bGxcIiA/IG51bGwgOlxuICAgICAgICAgICEvXjAvLnRlc3QodmFsdWUpICYmICFpc05hTihudW0gPSBOdW1iZXIodmFsdWUpKSA/IG51bSA6XG4gICAgICAgICAgL15bXFxbXFx7XS8udGVzdCh2YWx1ZSkgPyAkLnBhcnNlSlNPTih2YWx1ZSkgOlxuICAgICAgICAgIHZhbHVlIClcbiAgICAgICAgOiB2YWx1ZVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgcmV0dXJuIHZhbHVlXG4gICAgfVxuICB9XG5cbiAgJC50eXBlID0gdHlwZVxuICAkLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uXG4gICQuaXNXaW5kb3cgPSBpc1dpbmRvd1xuICAkLmlzQXJyYXkgPSBpc0FycmF5XG4gICQuaXNQbGFpbk9iamVjdCA9IGlzUGxhaW5PYmplY3RcblxuICAkLmlzRW1wdHlPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgbmFtZVxuICAgIGZvciAobmFtZSBpbiBvYmopIHJldHVybiBmYWxzZVxuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICAkLmluQXJyYXkgPSBmdW5jdGlvbihlbGVtLCBhcnJheSwgaSl7XG4gICAgcmV0dXJuIGVtcHR5QXJyYXkuaW5kZXhPZi5jYWxsKGFycmF5LCBlbGVtLCBpKVxuICB9XG5cbiAgJC5jYW1lbENhc2UgPSBjYW1lbGl6ZVxuICAkLnRyaW0gPSBmdW5jdGlvbihzdHIpIHtcbiAgICByZXR1cm4gc3RyID09IG51bGwgPyBcIlwiIDogU3RyaW5nLnByb3RvdHlwZS50cmltLmNhbGwoc3RyKVxuICB9XG5cbiAgLy8gcGx1Z2luIGNvbXBhdGliaWxpdHlcbiAgJC51dWlkID0gMFxuICAkLnN1cHBvcnQgPSB7IH1cbiAgJC5leHByID0geyB9XG5cbiAgJC5tYXAgPSBmdW5jdGlvbihlbGVtZW50cywgY2FsbGJhY2spe1xuICAgIHZhciB2YWx1ZSwgdmFsdWVzID0gW10sIGksIGtleVxuICAgIGlmIChsaWtlQXJyYXkoZWxlbWVudHMpKVxuICAgICAgZm9yIChpID0gMDsgaSA8IGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhbHVlID0gY2FsbGJhY2soZWxlbWVudHNbaV0sIGkpXG4gICAgICAgIGlmICh2YWx1ZSAhPSBudWxsKSB2YWx1ZXMucHVzaCh2YWx1ZSlcbiAgICAgIH1cbiAgICBlbHNlXG4gICAgICBmb3IgKGtleSBpbiBlbGVtZW50cykge1xuICAgICAgICB2YWx1ZSA9IGNhbGxiYWNrKGVsZW1lbnRzW2tleV0sIGtleSlcbiAgICAgICAgaWYgKHZhbHVlICE9IG51bGwpIHZhbHVlcy5wdXNoKHZhbHVlKVxuICAgICAgfVxuICAgIHJldHVybiBmbGF0dGVuKHZhbHVlcylcbiAgfVxuXG4gICQuZWFjaCA9IGZ1bmN0aW9uKGVsZW1lbnRzLCBjYWxsYmFjayl7XG4gICAgdmFyIGksIGtleVxuICAgIGlmIChsaWtlQXJyYXkoZWxlbWVudHMpKSB7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgZWxlbWVudHMubGVuZ3RoOyBpKyspXG4gICAgICAgIGlmIChjYWxsYmFjay5jYWxsKGVsZW1lbnRzW2ldLCBpLCBlbGVtZW50c1tpXSkgPT09IGZhbHNlKSByZXR1cm4gZWxlbWVudHNcbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChrZXkgaW4gZWxlbWVudHMpXG4gICAgICAgIGlmIChjYWxsYmFjay5jYWxsKGVsZW1lbnRzW2tleV0sIGtleSwgZWxlbWVudHNba2V5XSkgPT09IGZhbHNlKSByZXR1cm4gZWxlbWVudHNcbiAgICB9XG5cbiAgICByZXR1cm4gZWxlbWVudHNcbiAgfVxuXG4gICQuZ3JlcCA9IGZ1bmN0aW9uKGVsZW1lbnRzLCBjYWxsYmFjayl7XG4gICAgcmV0dXJuIGZpbHRlci5jYWxsKGVsZW1lbnRzLCBjYWxsYmFjaylcbiAgfVxuXG4gIGlmICh3aW5kb3cuSlNPTikgJC5wYXJzZUpTT04gPSBKU09OLnBhcnNlXG5cbiAgLy8gUG9wdWxhdGUgdGhlIGNsYXNzMnR5cGUgbWFwXG4gICQuZWFjaChcIkJvb2xlYW4gTnVtYmVyIFN0cmluZyBGdW5jdGlvbiBBcnJheSBEYXRlIFJlZ0V4cCBPYmplY3QgRXJyb3JcIi5zcGxpdChcIiBcIiksIGZ1bmN0aW9uKGksIG5hbWUpIHtcbiAgICBjbGFzczJ0eXBlWyBcIltvYmplY3QgXCIgKyBuYW1lICsgXCJdXCIgXSA9IG5hbWUudG9Mb3dlckNhc2UoKVxuICB9KVxuXG4gIC8vIERlZmluZSBtZXRob2RzIHRoYXQgd2lsbCBiZSBhdmFpbGFibGUgb24gYWxsXG4gIC8vIFplcHRvIGNvbGxlY3Rpb25zXG4gICQuZm4gPSB7XG4gICAgLy8gQmVjYXVzZSBhIGNvbGxlY3Rpb24gYWN0cyBsaWtlIGFuIGFycmF5XG4gICAgLy8gY29weSBvdmVyIHRoZXNlIHVzZWZ1bCBhcnJheSBmdW5jdGlvbnMuXG4gICAgZm9yRWFjaDogZW1wdHlBcnJheS5mb3JFYWNoLFxuICAgIHJlZHVjZTogZW1wdHlBcnJheS5yZWR1Y2UsXG4gICAgcHVzaDogZW1wdHlBcnJheS5wdXNoLFxuICAgIHNvcnQ6IGVtcHR5QXJyYXkuc29ydCxcbiAgICBpbmRleE9mOiBlbXB0eUFycmF5LmluZGV4T2YsXG4gICAgY29uY2F0OiBlbXB0eUFycmF5LmNvbmNhdCxcblxuICAgIC8vIGBtYXBgIGFuZCBgc2xpY2VgIGluIHRoZSBqUXVlcnkgQVBJIHdvcmsgZGlmZmVyZW50bHlcbiAgICAvLyBmcm9tIHRoZWlyIGFycmF5IGNvdW50ZXJwYXJ0c1xuICAgIG1hcDogZnVuY3Rpb24oZm4pe1xuICAgICAgcmV0dXJuICQoJC5tYXAodGhpcywgZnVuY3Rpb24oZWwsIGkpeyByZXR1cm4gZm4uY2FsbChlbCwgaSwgZWwpIH0pKVxuICAgIH0sXG4gICAgc2xpY2U6IGZ1bmN0aW9uKCl7XG4gICAgICByZXR1cm4gJChzbGljZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpKVxuICAgIH0sXG5cbiAgICByZWFkeTogZnVuY3Rpb24oY2FsbGJhY2spe1xuICAgICAgLy8gbmVlZCB0byBjaGVjayBpZiBkb2N1bWVudC5ib2R5IGV4aXN0cyBmb3IgSUUgYXMgdGhhdCBicm93c2VyIHJlcG9ydHNcbiAgICAgIC8vIGRvY3VtZW50IHJlYWR5IHdoZW4gaXQgaGFzbid0IHlldCBjcmVhdGVkIHRoZSBib2R5IGVsZW1lbnRcbiAgICAgIGlmIChyZWFkeVJFLnRlc3QoZG9jdW1lbnQucmVhZHlTdGF0ZSkgJiYgZG9jdW1lbnQuYm9keSkgY2FsbGJhY2soJClcbiAgICAgIGVsc2UgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGZ1bmN0aW9uKCl7IGNhbGxiYWNrKCQpIH0sIGZhbHNlKVxuICAgICAgcmV0dXJuIHRoaXNcbiAgICB9LFxuICAgIGdldDogZnVuY3Rpb24oaWR4KXtcbiAgICAgIHJldHVybiBpZHggPT09IHVuZGVmaW5lZCA/IHNsaWNlLmNhbGwodGhpcykgOiB0aGlzW2lkeCA+PSAwID8gaWR4IDogaWR4ICsgdGhpcy5sZW5ndGhdXG4gICAgfSxcbiAgICB0b0FycmF5OiBmdW5jdGlvbigpeyByZXR1cm4gdGhpcy5nZXQoKSB9LFxuICAgIHNpemU6IGZ1bmN0aW9uKCl7XG4gICAgICByZXR1cm4gdGhpcy5sZW5ndGhcbiAgICB9LFxuICAgIHJlbW92ZTogZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oKXtcbiAgICAgICAgaWYgKHRoaXMucGFyZW50Tm9kZSAhPSBudWxsKVxuICAgICAgICAgIHRoaXMucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzKVxuICAgICAgfSlcbiAgICB9LFxuICAgIGVhY2g6IGZ1bmN0aW9uKGNhbGxiYWNrKXtcbiAgICAgIGVtcHR5QXJyYXkuZXZlcnkuY2FsbCh0aGlzLCBmdW5jdGlvbihlbCwgaWR4KXtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoZWwsIGlkeCwgZWwpICE9PSBmYWxzZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0aGlzXG4gICAgfSxcbiAgICBmaWx0ZXI6IGZ1bmN0aW9uKHNlbGVjdG9yKXtcbiAgICAgIGlmIChpc0Z1bmN0aW9uKHNlbGVjdG9yKSkgcmV0dXJuIHRoaXMubm90KHRoaXMubm90KHNlbGVjdG9yKSlcbiAgICAgIHJldHVybiAkKGZpbHRlci5jYWxsKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpe1xuICAgICAgICByZXR1cm4gemVwdG8ubWF0Y2hlcyhlbGVtZW50LCBzZWxlY3RvcilcbiAgICAgIH0pKVxuICAgIH0sXG4gICAgYWRkOiBmdW5jdGlvbihzZWxlY3Rvcixjb250ZXh0KXtcbiAgICAgIHJldHVybiAkKHVuaXEodGhpcy5jb25jYXQoJChzZWxlY3Rvcixjb250ZXh0KSkpKVxuICAgIH0sXG4gICAgaXM6IGZ1bmN0aW9uKHNlbGVjdG9yKXtcbiAgICAgIHJldHVybiB0aGlzLmxlbmd0aCA+IDAgJiYgemVwdG8ubWF0Y2hlcyh0aGlzWzBdLCBzZWxlY3RvcilcbiAgICB9LFxuICAgIG5vdDogZnVuY3Rpb24oc2VsZWN0b3Ipe1xuICAgICAgdmFyIG5vZGVzPVtdXG4gICAgICBpZiAoaXNGdW5jdGlvbihzZWxlY3RvcikgJiYgc2VsZWN0b3IuY2FsbCAhPT0gdW5kZWZpbmVkKVxuICAgICAgICB0aGlzLmVhY2goZnVuY3Rpb24oaWR4KXtcbiAgICAgICAgICBpZiAoIXNlbGVjdG9yLmNhbGwodGhpcyxpZHgpKSBub2Rlcy5wdXNoKHRoaXMpXG4gICAgICAgIH0pXG4gICAgICBlbHNlIHtcbiAgICAgICAgdmFyIGV4Y2x1ZGVzID0gdHlwZW9mIHNlbGVjdG9yID09ICdzdHJpbmcnID8gdGhpcy5maWx0ZXIoc2VsZWN0b3IpIDpcbiAgICAgICAgICAobGlrZUFycmF5KHNlbGVjdG9yKSAmJiBpc0Z1bmN0aW9uKHNlbGVjdG9yLml0ZW0pKSA/IHNsaWNlLmNhbGwoc2VsZWN0b3IpIDogJChzZWxlY3RvcilcbiAgICAgICAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uKGVsKXtcbiAgICAgICAgICBpZiAoZXhjbHVkZXMuaW5kZXhPZihlbCkgPCAwKSBub2Rlcy5wdXNoKGVsKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuICQobm9kZXMpXG4gICAgfSxcbiAgICBoYXM6IGZ1bmN0aW9uKHNlbGVjdG9yKXtcbiAgICAgIHJldHVybiB0aGlzLmZpbHRlcihmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gaXNPYmplY3Qoc2VsZWN0b3IpID9cbiAgICAgICAgICAkLmNvbnRhaW5zKHRoaXMsIHNlbGVjdG9yKSA6XG4gICAgICAgICAgJCh0aGlzKS5maW5kKHNlbGVjdG9yKS5zaXplKClcbiAgICAgIH0pXG4gICAgfSxcbiAgICBlcTogZnVuY3Rpb24oaWR4KXtcbiAgICAgIHJldHVybiBpZHggPT09IC0xID8gdGhpcy5zbGljZShpZHgpIDogdGhpcy5zbGljZShpZHgsICsgaWR4ICsgMSlcbiAgICB9LFxuICAgIGZpcnN0OiBmdW5jdGlvbigpe1xuICAgICAgdmFyIGVsID0gdGhpc1swXVxuICAgICAgcmV0dXJuIGVsICYmICFpc09iamVjdChlbCkgPyBlbCA6ICQoZWwpXG4gICAgfSxcbiAgICBsYXN0OiBmdW5jdGlvbigpe1xuICAgICAgdmFyIGVsID0gdGhpc1t0aGlzLmxlbmd0aCAtIDFdXG4gICAgICByZXR1cm4gZWwgJiYgIWlzT2JqZWN0KGVsKSA/IGVsIDogJChlbClcbiAgICB9LFxuICAgIGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKXtcbiAgICAgIHZhciByZXN1bHQsICR0aGlzID0gdGhpc1xuICAgICAgaWYgKCFzZWxlY3RvcikgcmVzdWx0ID0gW11cbiAgICAgIGVsc2UgaWYgKHR5cGVvZiBzZWxlY3RvciA9PSAnb2JqZWN0JylcbiAgICAgICAgcmVzdWx0ID0gJChzZWxlY3RvcikuZmlsdGVyKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgdmFyIG5vZGUgPSB0aGlzXG4gICAgICAgICAgcmV0dXJuIGVtcHR5QXJyYXkuc29tZS5jYWxsKCR0aGlzLCBmdW5jdGlvbihwYXJlbnQpe1xuICAgICAgICAgICAgcmV0dXJuICQuY29udGFpbnMocGFyZW50LCBub2RlKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICBlbHNlIGlmICh0aGlzLmxlbmd0aCA9PSAxKSByZXN1bHQgPSAkKHplcHRvLnFzYSh0aGlzWzBdLCBzZWxlY3RvcikpXG4gICAgICBlbHNlIHJlc3VsdCA9IHRoaXMubWFwKGZ1bmN0aW9uKCl7IHJldHVybiB6ZXB0by5xc2EodGhpcywgc2VsZWN0b3IpIH0pXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSxcbiAgICBjbG9zZXN0OiBmdW5jdGlvbihzZWxlY3RvciwgY29udGV4dCl7XG4gICAgICB2YXIgbm9kZSA9IHRoaXNbMF0sIGNvbGxlY3Rpb24gPSBmYWxzZVxuICAgICAgaWYgKHR5cGVvZiBzZWxlY3RvciA9PSAnb2JqZWN0JykgY29sbGVjdGlvbiA9ICQoc2VsZWN0b3IpXG4gICAgICB3aGlsZSAobm9kZSAmJiAhKGNvbGxlY3Rpb24gPyBjb2xsZWN0aW9uLmluZGV4T2Yobm9kZSkgPj0gMCA6IHplcHRvLm1hdGNoZXMobm9kZSwgc2VsZWN0b3IpKSlcbiAgICAgICAgbm9kZSA9IG5vZGUgIT09IGNvbnRleHQgJiYgIWlzRG9jdW1lbnQobm9kZSkgJiYgbm9kZS5wYXJlbnROb2RlXG4gICAgICByZXR1cm4gJChub2RlKVxuICAgIH0sXG4gICAgcGFyZW50czogZnVuY3Rpb24oc2VsZWN0b3Ipe1xuICAgICAgdmFyIGFuY2VzdG9ycyA9IFtdLCBub2RlcyA9IHRoaXNcbiAgICAgIHdoaWxlIChub2Rlcy5sZW5ndGggPiAwKVxuICAgICAgICBub2RlcyA9ICQubWFwKG5vZGVzLCBmdW5jdGlvbihub2RlKXtcbiAgICAgICAgICBpZiAoKG5vZGUgPSBub2RlLnBhcmVudE5vZGUpICYmICFpc0RvY3VtZW50KG5vZGUpICYmIGFuY2VzdG9ycy5pbmRleE9mKG5vZGUpIDwgMCkge1xuICAgICAgICAgICAgYW5jZXN0b3JzLnB1c2gobm9kZSlcbiAgICAgICAgICAgIHJldHVybiBub2RlXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgcmV0dXJuIGZpbHRlcmVkKGFuY2VzdG9ycywgc2VsZWN0b3IpXG4gICAgfSxcbiAgICBwYXJlbnQ6IGZ1bmN0aW9uKHNlbGVjdG9yKXtcbiAgICAgIHJldHVybiBmaWx0ZXJlZCh1bmlxKHRoaXMucGx1Y2soJ3BhcmVudE5vZGUnKSksIHNlbGVjdG9yKVxuICAgIH0sXG4gICAgY2hpbGRyZW46IGZ1bmN0aW9uKHNlbGVjdG9yKXtcbiAgICAgIHJldHVybiBmaWx0ZXJlZCh0aGlzLm1hcChmdW5jdGlvbigpeyByZXR1cm4gY2hpbGRyZW4odGhpcykgfSksIHNlbGVjdG9yKVxuICAgIH0sXG4gICAgY29udGVudHM6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMubWFwKGZ1bmN0aW9uKCkgeyByZXR1cm4gc2xpY2UuY2FsbCh0aGlzLmNoaWxkTm9kZXMpIH0pXG4gICAgfSxcbiAgICBzaWJsaW5nczogZnVuY3Rpb24oc2VsZWN0b3Ipe1xuICAgICAgcmV0dXJuIGZpbHRlcmVkKHRoaXMubWFwKGZ1bmN0aW9uKGksIGVsKXtcbiAgICAgICAgcmV0dXJuIGZpbHRlci5jYWxsKGNoaWxkcmVuKGVsLnBhcmVudE5vZGUpLCBmdW5jdGlvbihjaGlsZCl7IHJldHVybiBjaGlsZCE9PWVsIH0pXG4gICAgICB9KSwgc2VsZWN0b3IpXG4gICAgfSxcbiAgICBlbXB0eTogZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oKXsgdGhpcy5pbm5lckhUTUwgPSAnJyB9KVxuICAgIH0sXG4gICAgLy8gYHBsdWNrYCBpcyBib3Jyb3dlZCBmcm9tIFByb3RvdHlwZS5qc1xuICAgIHBsdWNrOiBmdW5jdGlvbihwcm9wZXJ0eSl7XG4gICAgICByZXR1cm4gJC5tYXAodGhpcywgZnVuY3Rpb24oZWwpeyByZXR1cm4gZWxbcHJvcGVydHldIH0pXG4gICAgfSxcbiAgICBzaG93OiBmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbigpe1xuICAgICAgICB0aGlzLnN0eWxlLmRpc3BsYXkgPT0gXCJub25lXCIgJiYgKHRoaXMuc3R5bGUuZGlzcGxheSA9ICcnKVxuICAgICAgICBpZiAoZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLCAnJykuZ2V0UHJvcGVydHlWYWx1ZShcImRpc3BsYXlcIikgPT0gXCJub25lXCIpXG4gICAgICAgICAgdGhpcy5zdHlsZS5kaXNwbGF5ID0gZGVmYXVsdERpc3BsYXkodGhpcy5ub2RlTmFtZSlcbiAgICAgIH0pXG4gICAgfSxcbiAgICByZXBsYWNlV2l0aDogZnVuY3Rpb24obmV3Q29udGVudCl7XG4gICAgICByZXR1cm4gdGhpcy5iZWZvcmUobmV3Q29udGVudCkucmVtb3ZlKClcbiAgICB9LFxuICAgIHdyYXA6IGZ1bmN0aW9uKHN0cnVjdHVyZSl7XG4gICAgICB2YXIgZnVuYyA9IGlzRnVuY3Rpb24oc3RydWN0dXJlKVxuICAgICAgaWYgKHRoaXNbMF0gJiYgIWZ1bmMpXG4gICAgICAgIHZhciBkb20gICA9ICQoc3RydWN0dXJlKS5nZXQoMCksXG4gICAgICAgICAgICBjbG9uZSA9IGRvbS5wYXJlbnROb2RlIHx8IHRoaXMubGVuZ3RoID4gMVxuXG4gICAgICByZXR1cm4gdGhpcy5lYWNoKGZ1bmN0aW9uKGluZGV4KXtcbiAgICAgICAgJCh0aGlzKS53cmFwQWxsKFxuICAgICAgICAgIGZ1bmMgPyBzdHJ1Y3R1cmUuY2FsbCh0aGlzLCBpbmRleCkgOlxuICAgICAgICAgICAgY2xvbmUgPyBkb20uY2xvbmVOb2RlKHRydWUpIDogZG9tXG4gICAgICAgIClcbiAgICAgIH0pXG4gICAgfSxcbiAgICB3cmFwQWxsOiBmdW5jdGlvbihzdHJ1Y3R1cmUpe1xuICAgICAgaWYgKHRoaXNbMF0pIHtcbiAgICAgICAgJCh0aGlzWzBdKS5iZWZvcmUoc3RydWN0dXJlID0gJChzdHJ1Y3R1cmUpKVxuICAgICAgICB2YXIgY2hpbGRyZW5cbiAgICAgICAgLy8gZHJpbGwgZG93biB0byB0aGUgaW5tb3N0IGVsZW1lbnRcbiAgICAgICAgd2hpbGUgKChjaGlsZHJlbiA9IHN0cnVjdHVyZS5jaGlsZHJlbigpKS5sZW5ndGgpIHN0cnVjdHVyZSA9IGNoaWxkcmVuLmZpcnN0KClcbiAgICAgICAgJChzdHJ1Y3R1cmUpLmFwcGVuZCh0aGlzKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXNcbiAgICB9LFxuICAgIHdyYXBJbm5lcjogZnVuY3Rpb24oc3RydWN0dXJlKXtcbiAgICAgIHZhciBmdW5jID0gaXNGdW5jdGlvbihzdHJ1Y3R1cmUpXG4gICAgICByZXR1cm4gdGhpcy5lYWNoKGZ1bmN0aW9uKGluZGV4KXtcbiAgICAgICAgdmFyIHNlbGYgPSAkKHRoaXMpLCBjb250ZW50cyA9IHNlbGYuY29udGVudHMoKSxcbiAgICAgICAgICAgIGRvbSAgPSBmdW5jID8gc3RydWN0dXJlLmNhbGwodGhpcywgaW5kZXgpIDogc3RydWN0dXJlXG4gICAgICAgIGNvbnRlbnRzLmxlbmd0aCA/IGNvbnRlbnRzLndyYXBBbGwoZG9tKSA6IHNlbGYuYXBwZW5kKGRvbSlcbiAgICAgIH0pXG4gICAgfSxcbiAgICB1bndyYXA6IGZ1bmN0aW9uKCl7XG4gICAgICB0aGlzLnBhcmVudCgpLmVhY2goZnVuY3Rpb24oKXtcbiAgICAgICAgJCh0aGlzKS5yZXBsYWNlV2l0aCgkKHRoaXMpLmNoaWxkcmVuKCkpXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRoaXNcbiAgICB9LFxuICAgIGNsb25lOiBmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIHRoaXMubWFwKGZ1bmN0aW9uKCl7IHJldHVybiB0aGlzLmNsb25lTm9kZSh0cnVlKSB9KVxuICAgIH0sXG4gICAgaGlkZTogZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiB0aGlzLmNzcyhcImRpc3BsYXlcIiwgXCJub25lXCIpXG4gICAgfSxcbiAgICB0b2dnbGU6IGZ1bmN0aW9uKHNldHRpbmcpe1xuICAgICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbigpe1xuICAgICAgICB2YXIgZWwgPSAkKHRoaXMpXG4gICAgICAgIDsoc2V0dGluZyA9PT0gdW5kZWZpbmVkID8gZWwuY3NzKFwiZGlzcGxheVwiKSA9PSBcIm5vbmVcIiA6IHNldHRpbmcpID8gZWwuc2hvdygpIDogZWwuaGlkZSgpXG4gICAgICB9KVxuICAgIH0sXG4gICAgcHJldjogZnVuY3Rpb24oc2VsZWN0b3IpeyByZXR1cm4gJCh0aGlzLnBsdWNrKCdwcmV2aW91c0VsZW1lbnRTaWJsaW5nJykpLmZpbHRlcihzZWxlY3RvciB8fCAnKicpIH0sXG4gICAgbmV4dDogZnVuY3Rpb24oc2VsZWN0b3IpeyByZXR1cm4gJCh0aGlzLnBsdWNrKCduZXh0RWxlbWVudFNpYmxpbmcnKSkuZmlsdGVyKHNlbGVjdG9yIHx8ICcqJykgfSxcbiAgICBodG1sOiBmdW5jdGlvbihodG1sKXtcbiAgICAgIHJldHVybiAwIGluIGFyZ3VtZW50cyA/XG4gICAgICAgIHRoaXMuZWFjaChmdW5jdGlvbihpZHgpe1xuICAgICAgICAgIHZhciBvcmlnaW5IdG1sID0gdGhpcy5pbm5lckhUTUxcbiAgICAgICAgICAkKHRoaXMpLmVtcHR5KCkuYXBwZW5kKCBmdW5jQXJnKHRoaXMsIGh0bWwsIGlkeCwgb3JpZ2luSHRtbCkgKVxuICAgICAgICB9KSA6XG4gICAgICAgICgwIGluIHRoaXMgPyB0aGlzWzBdLmlubmVySFRNTCA6IG51bGwpXG4gICAgfSxcbiAgICB0ZXh0OiBmdW5jdGlvbih0ZXh0KXtcbiAgICAgIHJldHVybiAwIGluIGFyZ3VtZW50cyA/XG4gICAgICAgIHRoaXMuZWFjaChmdW5jdGlvbihpZHgpe1xuICAgICAgICAgIHZhciBuZXdUZXh0ID0gZnVuY0FyZyh0aGlzLCB0ZXh0LCBpZHgsIHRoaXMudGV4dENvbnRlbnQpXG4gICAgICAgICAgdGhpcy50ZXh0Q29udGVudCA9IG5ld1RleHQgPT0gbnVsbCA/ICcnIDogJycrbmV3VGV4dFxuICAgICAgICB9KSA6XG4gICAgICAgICgwIGluIHRoaXMgPyB0aGlzWzBdLnRleHRDb250ZW50IDogbnVsbClcbiAgICB9LFxuICAgIGF0dHI6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKXtcbiAgICAgIHZhciByZXN1bHRcbiAgICAgIHJldHVybiAodHlwZW9mIG5hbWUgPT0gJ3N0cmluZycgJiYgISgxIGluIGFyZ3VtZW50cykpID9cbiAgICAgICAgKCF0aGlzLmxlbmd0aCB8fCB0aGlzWzBdLm5vZGVUeXBlICE9PSAxID8gdW5kZWZpbmVkIDpcbiAgICAgICAgICAoIShyZXN1bHQgPSB0aGlzWzBdLmdldEF0dHJpYnV0ZShuYW1lKSkgJiYgbmFtZSBpbiB0aGlzWzBdKSA/IHRoaXNbMF1bbmFtZV0gOiByZXN1bHRcbiAgICAgICAgKSA6XG4gICAgICAgIHRoaXMuZWFjaChmdW5jdGlvbihpZHgpe1xuICAgICAgICAgIGlmICh0aGlzLm5vZGVUeXBlICE9PSAxKSByZXR1cm5cbiAgICAgICAgICBpZiAoaXNPYmplY3QobmFtZSkpIGZvciAoa2V5IGluIG5hbWUpIHNldEF0dHJpYnV0ZSh0aGlzLCBrZXksIG5hbWVba2V5XSlcbiAgICAgICAgICBlbHNlIHNldEF0dHJpYnV0ZSh0aGlzLCBuYW1lLCBmdW5jQXJnKHRoaXMsIHZhbHVlLCBpZHgsIHRoaXMuZ2V0QXR0cmlidXRlKG5hbWUpKSlcbiAgICAgICAgfSlcbiAgICB9LFxuICAgIHJlbW92ZUF0dHI6IGZ1bmN0aW9uKG5hbWUpe1xuICAgICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbigpeyB0aGlzLm5vZGVUeXBlID09PSAxICYmIHNldEF0dHJpYnV0ZSh0aGlzLCBuYW1lKSB9KVxuICAgIH0sXG4gICAgcHJvcDogZnVuY3Rpb24obmFtZSwgdmFsdWUpe1xuICAgICAgbmFtZSA9IHByb3BNYXBbbmFtZV0gfHwgbmFtZVxuICAgICAgcmV0dXJuICgxIGluIGFyZ3VtZW50cykgP1xuICAgICAgICB0aGlzLmVhY2goZnVuY3Rpb24oaWR4KXtcbiAgICAgICAgICB0aGlzW25hbWVdID0gZnVuY0FyZyh0aGlzLCB2YWx1ZSwgaWR4LCB0aGlzW25hbWVdKVxuICAgICAgICB9KSA6XG4gICAgICAgICh0aGlzWzBdICYmIHRoaXNbMF1bbmFtZV0pXG4gICAgfSxcbiAgICBkYXRhOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSl7XG4gICAgICB2YXIgYXR0ck5hbWUgPSAnZGF0YS0nICsgbmFtZS5yZXBsYWNlKGNhcGl0YWxSRSwgJy0kMScpLnRvTG93ZXJDYXNlKClcblxuICAgICAgdmFyIGRhdGEgPSAoMSBpbiBhcmd1bWVudHMpID9cbiAgICAgICAgdGhpcy5hdHRyKGF0dHJOYW1lLCB2YWx1ZSkgOlxuICAgICAgICB0aGlzLmF0dHIoYXR0ck5hbWUpXG5cbiAgICAgIHJldHVybiBkYXRhICE9PSBudWxsID8gZGVzZXJpYWxpemVWYWx1ZShkYXRhKSA6IHVuZGVmaW5lZFxuICAgIH0sXG4gICAgdmFsOiBmdW5jdGlvbih2YWx1ZSl7XG4gICAgICByZXR1cm4gMCBpbiBhcmd1bWVudHMgP1xuICAgICAgICB0aGlzLmVhY2goZnVuY3Rpb24oaWR4KXtcbiAgICAgICAgICB0aGlzLnZhbHVlID0gZnVuY0FyZyh0aGlzLCB2YWx1ZSwgaWR4LCB0aGlzLnZhbHVlKVxuICAgICAgICB9KSA6XG4gICAgICAgICh0aGlzWzBdICYmICh0aGlzWzBdLm11bHRpcGxlID9cbiAgICAgICAgICAgJCh0aGlzWzBdKS5maW5kKCdvcHRpb24nKS5maWx0ZXIoZnVuY3Rpb24oKXsgcmV0dXJuIHRoaXMuc2VsZWN0ZWQgfSkucGx1Y2soJ3ZhbHVlJykgOlxuICAgICAgICAgICB0aGlzWzBdLnZhbHVlKVxuICAgICAgICApXG4gICAgfSxcbiAgICBvZmZzZXQ6IGZ1bmN0aW9uKGNvb3JkaW5hdGVzKXtcbiAgICAgIGlmIChjb29yZGluYXRlcykgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbihpbmRleCl7XG4gICAgICAgIHZhciAkdGhpcyA9ICQodGhpcyksXG4gICAgICAgICAgICBjb29yZHMgPSBmdW5jQXJnKHRoaXMsIGNvb3JkaW5hdGVzLCBpbmRleCwgJHRoaXMub2Zmc2V0KCkpLFxuICAgICAgICAgICAgcGFyZW50T2Zmc2V0ID0gJHRoaXMub2Zmc2V0UGFyZW50KCkub2Zmc2V0KCksXG4gICAgICAgICAgICBwcm9wcyA9IHtcbiAgICAgICAgICAgICAgdG9wOiAgY29vcmRzLnRvcCAgLSBwYXJlbnRPZmZzZXQudG9wLFxuICAgICAgICAgICAgICBsZWZ0OiBjb29yZHMubGVmdCAtIHBhcmVudE9mZnNldC5sZWZ0XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgaWYgKCR0aGlzLmNzcygncG9zaXRpb24nKSA9PSAnc3RhdGljJykgcHJvcHNbJ3Bvc2l0aW9uJ10gPSAncmVsYXRpdmUnXG4gICAgICAgICR0aGlzLmNzcyhwcm9wcylcbiAgICAgIH0pXG4gICAgICBpZiAoIXRoaXMubGVuZ3RoKSByZXR1cm4gbnVsbFxuICAgICAgdmFyIG9iaiA9IHRoaXNbMF0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGxlZnQ6IG9iai5sZWZ0ICsgd2luZG93LnBhZ2VYT2Zmc2V0LFxuICAgICAgICB0b3A6IG9iai50b3AgKyB3aW5kb3cucGFnZVlPZmZzZXQsXG4gICAgICAgIHdpZHRoOiBNYXRoLnJvdW5kKG9iai53aWR0aCksXG4gICAgICAgIGhlaWdodDogTWF0aC5yb3VuZChvYmouaGVpZ2h0KVxuICAgICAgfVxuICAgIH0sXG4gICAgY3NzOiBmdW5jdGlvbihwcm9wZXJ0eSwgdmFsdWUpe1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAyKSB7XG4gICAgICAgIHZhciBlbGVtZW50ID0gdGhpc1swXSwgY29tcHV0ZWRTdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCwgJycpXG4gICAgICAgIGlmKCFlbGVtZW50KSByZXR1cm5cbiAgICAgICAgaWYgKHR5cGVvZiBwcm9wZXJ0eSA9PSAnc3RyaW5nJylcbiAgICAgICAgICByZXR1cm4gZWxlbWVudC5zdHlsZVtjYW1lbGl6ZShwcm9wZXJ0eSldIHx8IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShwcm9wZXJ0eSlcbiAgICAgICAgZWxzZSBpZiAoaXNBcnJheShwcm9wZXJ0eSkpIHtcbiAgICAgICAgICB2YXIgcHJvcHMgPSB7fVxuICAgICAgICAgICQuZWFjaChpc0FycmF5KHByb3BlcnR5KSA/IHByb3BlcnR5OiBbcHJvcGVydHldLCBmdW5jdGlvbihfLCBwcm9wKXtcbiAgICAgICAgICAgIHByb3BzW3Byb3BdID0gKGVsZW1lbnQuc3R5bGVbY2FtZWxpemUocHJvcCldIHx8IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShwcm9wKSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiBwcm9wc1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBjc3MgPSAnJ1xuICAgICAgaWYgKHR5cGUocHJvcGVydHkpID09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghdmFsdWUgJiYgdmFsdWUgIT09IDApXG4gICAgICAgICAgdGhpcy5lYWNoKGZ1bmN0aW9uKCl7IHRoaXMuc3R5bGUucmVtb3ZlUHJvcGVydHkoZGFzaGVyaXplKHByb3BlcnR5KSkgfSlcbiAgICAgICAgZWxzZVxuICAgICAgICAgIGNzcyA9IGRhc2hlcml6ZShwcm9wZXJ0eSkgKyBcIjpcIiArIG1heWJlQWRkUHgocHJvcGVydHksIHZhbHVlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9yIChrZXkgaW4gcHJvcGVydHkpXG4gICAgICAgICAgaWYgKCFwcm9wZXJ0eVtrZXldICYmIHByb3BlcnR5W2tleV0gIT09IDApXG4gICAgICAgICAgICB0aGlzLmVhY2goZnVuY3Rpb24oKXsgdGhpcy5zdHlsZS5yZW1vdmVQcm9wZXJ0eShkYXNoZXJpemUoa2V5KSkgfSlcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICBjc3MgKz0gZGFzaGVyaXplKGtleSkgKyAnOicgKyBtYXliZUFkZFB4KGtleSwgcHJvcGVydHlba2V5XSkgKyAnOydcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbigpeyB0aGlzLnN0eWxlLmNzc1RleHQgKz0gJzsnICsgY3NzIH0pXG4gICAgfSxcbiAgICBpbmRleDogZnVuY3Rpb24oZWxlbWVudCl7XG4gICAgICByZXR1cm4gZWxlbWVudCA/IHRoaXMuaW5kZXhPZigkKGVsZW1lbnQpWzBdKSA6IHRoaXMucGFyZW50KCkuY2hpbGRyZW4oKS5pbmRleE9mKHRoaXNbMF0pXG4gICAgfSxcbiAgICBoYXNDbGFzczogZnVuY3Rpb24obmFtZSl7XG4gICAgICBpZiAoIW5hbWUpIHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuIGVtcHR5QXJyYXkuc29tZS5jYWxsKHRoaXMsIGZ1bmN0aW9uKGVsKXtcbiAgICAgICAgcmV0dXJuIHRoaXMudGVzdChjbGFzc05hbWUoZWwpKVxuICAgICAgfSwgY2xhc3NSRShuYW1lKSlcbiAgICB9LFxuICAgIGFkZENsYXNzOiBmdW5jdGlvbihuYW1lKXtcbiAgICAgIGlmICghbmFtZSkgcmV0dXJuIHRoaXNcbiAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oaWR4KXtcbiAgICAgICAgY2xhc3NMaXN0ID0gW11cbiAgICAgICAgdmFyIGNscyA9IGNsYXNzTmFtZSh0aGlzKSwgbmV3TmFtZSA9IGZ1bmNBcmcodGhpcywgbmFtZSwgaWR4LCBjbHMpXG4gICAgICAgIG5ld05hbWUuc3BsaXQoL1xccysvZykuZm9yRWFjaChmdW5jdGlvbihrbGFzcyl7XG4gICAgICAgICAgaWYgKCEkKHRoaXMpLmhhc0NsYXNzKGtsYXNzKSkgY2xhc3NMaXN0LnB1c2goa2xhc3MpXG4gICAgICAgIH0sIHRoaXMpXG4gICAgICAgIGNsYXNzTGlzdC5sZW5ndGggJiYgY2xhc3NOYW1lKHRoaXMsIGNscyArIChjbHMgPyBcIiBcIiA6IFwiXCIpICsgY2xhc3NMaXN0LmpvaW4oXCIgXCIpKVxuICAgICAgfSlcbiAgICB9LFxuICAgIHJlbW92ZUNsYXNzOiBmdW5jdGlvbihuYW1lKXtcbiAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oaWR4KXtcbiAgICAgICAgaWYgKG5hbWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGNsYXNzTmFtZSh0aGlzLCAnJylcbiAgICAgICAgY2xhc3NMaXN0ID0gY2xhc3NOYW1lKHRoaXMpXG4gICAgICAgIGZ1bmNBcmcodGhpcywgbmFtZSwgaWR4LCBjbGFzc0xpc3QpLnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24oa2xhc3Mpe1xuICAgICAgICAgIGNsYXNzTGlzdCA9IGNsYXNzTGlzdC5yZXBsYWNlKGNsYXNzUkUoa2xhc3MpLCBcIiBcIilcbiAgICAgICAgfSlcbiAgICAgICAgY2xhc3NOYW1lKHRoaXMsIGNsYXNzTGlzdC50cmltKCkpXG4gICAgICB9KVxuICAgIH0sXG4gICAgdG9nZ2xlQ2xhc3M6IGZ1bmN0aW9uKG5hbWUsIHdoZW4pe1xuICAgICAgaWYgKCFuYW1lKSByZXR1cm4gdGhpc1xuICAgICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbihpZHgpe1xuICAgICAgICB2YXIgJHRoaXMgPSAkKHRoaXMpLCBuYW1lcyA9IGZ1bmNBcmcodGhpcywgbmFtZSwgaWR4LCBjbGFzc05hbWUodGhpcykpXG4gICAgICAgIG5hbWVzLnNwbGl0KC9cXHMrL2cpLmZvckVhY2goZnVuY3Rpb24oa2xhc3Mpe1xuICAgICAgICAgICh3aGVuID09PSB1bmRlZmluZWQgPyAhJHRoaXMuaGFzQ2xhc3Moa2xhc3MpIDogd2hlbikgP1xuICAgICAgICAgICAgJHRoaXMuYWRkQ2xhc3Moa2xhc3MpIDogJHRoaXMucmVtb3ZlQ2xhc3Moa2xhc3MpXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0sXG4gICAgc2Nyb2xsVG9wOiBmdW5jdGlvbih2YWx1ZSl7XG4gICAgICBpZiAoIXRoaXMubGVuZ3RoKSByZXR1cm5cbiAgICAgIHZhciBoYXNTY3JvbGxUb3AgPSAnc2Nyb2xsVG9wJyBpbiB0aGlzWzBdXG4gICAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGhhc1Njcm9sbFRvcCA/IHRoaXNbMF0uc2Nyb2xsVG9wIDogdGhpc1swXS5wYWdlWU9mZnNldFxuICAgICAgcmV0dXJuIHRoaXMuZWFjaChoYXNTY3JvbGxUb3AgP1xuICAgICAgICBmdW5jdGlvbigpeyB0aGlzLnNjcm9sbFRvcCA9IHZhbHVlIH0gOlxuICAgICAgICBmdW5jdGlvbigpeyB0aGlzLnNjcm9sbFRvKHRoaXMuc2Nyb2xsWCwgdmFsdWUpIH0pXG4gICAgfSxcbiAgICBzY3JvbGxMZWZ0OiBmdW5jdGlvbih2YWx1ZSl7XG4gICAgICBpZiAoIXRoaXMubGVuZ3RoKSByZXR1cm5cbiAgICAgIHZhciBoYXNTY3JvbGxMZWZ0ID0gJ3Njcm9sbExlZnQnIGluIHRoaXNbMF1cbiAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSByZXR1cm4gaGFzU2Nyb2xsTGVmdCA/IHRoaXNbMF0uc2Nyb2xsTGVmdCA6IHRoaXNbMF0ucGFnZVhPZmZzZXRcbiAgICAgIHJldHVybiB0aGlzLmVhY2goaGFzU2Nyb2xsTGVmdCA/XG4gICAgICAgIGZ1bmN0aW9uKCl7IHRoaXMuc2Nyb2xsTGVmdCA9IHZhbHVlIH0gOlxuICAgICAgICBmdW5jdGlvbigpeyB0aGlzLnNjcm9sbFRvKHZhbHVlLCB0aGlzLnNjcm9sbFkpIH0pXG4gICAgfSxcbiAgICBwb3NpdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoIXRoaXMubGVuZ3RoKSByZXR1cm5cblxuICAgICAgdmFyIGVsZW0gPSB0aGlzWzBdLFxuICAgICAgICAvLyBHZXQgKnJlYWwqIG9mZnNldFBhcmVudFxuICAgICAgICBvZmZzZXRQYXJlbnQgPSB0aGlzLm9mZnNldFBhcmVudCgpLFxuICAgICAgICAvLyBHZXQgY29ycmVjdCBvZmZzZXRzXG4gICAgICAgIG9mZnNldCAgICAgICA9IHRoaXMub2Zmc2V0KCksXG4gICAgICAgIHBhcmVudE9mZnNldCA9IHJvb3ROb2RlUkUudGVzdChvZmZzZXRQYXJlbnRbMF0ubm9kZU5hbWUpID8geyB0b3A6IDAsIGxlZnQ6IDAgfSA6IG9mZnNldFBhcmVudC5vZmZzZXQoKVxuXG4gICAgICAvLyBTdWJ0cmFjdCBlbGVtZW50IG1hcmdpbnNcbiAgICAgIC8vIG5vdGU6IHdoZW4gYW4gZWxlbWVudCBoYXMgbWFyZ2luOiBhdXRvIHRoZSBvZmZzZXRMZWZ0IGFuZCBtYXJnaW5MZWZ0XG4gICAgICAvLyBhcmUgdGhlIHNhbWUgaW4gU2FmYXJpIGNhdXNpbmcgb2Zmc2V0LmxlZnQgdG8gaW5jb3JyZWN0bHkgYmUgMFxuICAgICAgb2Zmc2V0LnRvcCAgLT0gcGFyc2VGbG9hdCggJChlbGVtKS5jc3MoJ21hcmdpbi10b3AnKSApIHx8IDBcbiAgICAgIG9mZnNldC5sZWZ0IC09IHBhcnNlRmxvYXQoICQoZWxlbSkuY3NzKCdtYXJnaW4tbGVmdCcpICkgfHwgMFxuXG4gICAgICAvLyBBZGQgb2Zmc2V0UGFyZW50IGJvcmRlcnNcbiAgICAgIHBhcmVudE9mZnNldC50b3AgICs9IHBhcnNlRmxvYXQoICQob2Zmc2V0UGFyZW50WzBdKS5jc3MoJ2JvcmRlci10b3Atd2lkdGgnKSApIHx8IDBcbiAgICAgIHBhcmVudE9mZnNldC5sZWZ0ICs9IHBhcnNlRmxvYXQoICQob2Zmc2V0UGFyZW50WzBdKS5jc3MoJ2JvcmRlci1sZWZ0LXdpZHRoJykgKSB8fCAwXG5cbiAgICAgIC8vIFN1YnRyYWN0IHRoZSB0d28gb2Zmc2V0c1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdG9wOiAgb2Zmc2V0LnRvcCAgLSBwYXJlbnRPZmZzZXQudG9wLFxuICAgICAgICBsZWZ0OiBvZmZzZXQubGVmdCAtIHBhcmVudE9mZnNldC5sZWZ0XG4gICAgICB9XG4gICAgfSxcbiAgICBvZmZzZXRQYXJlbnQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMubWFwKGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciBwYXJlbnQgPSB0aGlzLm9mZnNldFBhcmVudCB8fCBkb2N1bWVudC5ib2R5XG4gICAgICAgIHdoaWxlIChwYXJlbnQgJiYgIXJvb3ROb2RlUkUudGVzdChwYXJlbnQubm9kZU5hbWUpICYmICQocGFyZW50KS5jc3MoXCJwb3NpdGlvblwiKSA9PSBcInN0YXRpY1wiKVxuICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5vZmZzZXRQYXJlbnRcbiAgICAgICAgcmV0dXJuIHBhcmVudFxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICAvLyBmb3Igbm93XG4gICQuZm4uZGV0YWNoID0gJC5mbi5yZW1vdmVcblxuICAvLyBHZW5lcmF0ZSB0aGUgYHdpZHRoYCBhbmQgYGhlaWdodGAgZnVuY3Rpb25zXG4gIDtbJ3dpZHRoJywgJ2hlaWdodCddLmZvckVhY2goZnVuY3Rpb24oZGltZW5zaW9uKXtcbiAgICB2YXIgZGltZW5zaW9uUHJvcGVydHkgPVxuICAgICAgZGltZW5zaW9uLnJlcGxhY2UoLy4vLCBmdW5jdGlvbihtKXsgcmV0dXJuIG1bMF0udG9VcHBlckNhc2UoKSB9KVxuXG4gICAgJC5mbltkaW1lbnNpb25dID0gZnVuY3Rpb24odmFsdWUpe1xuICAgICAgdmFyIG9mZnNldCwgZWwgPSB0aGlzWzBdXG4gICAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGlzV2luZG93KGVsKSA/IGVsWydpbm5lcicgKyBkaW1lbnNpb25Qcm9wZXJ0eV0gOlxuICAgICAgICBpc0RvY3VtZW50KGVsKSA/IGVsLmRvY3VtZW50RWxlbWVudFsnc2Nyb2xsJyArIGRpbWVuc2lvblByb3BlcnR5XSA6XG4gICAgICAgIChvZmZzZXQgPSB0aGlzLm9mZnNldCgpKSAmJiBvZmZzZXRbZGltZW5zaW9uXVxuICAgICAgZWxzZSByZXR1cm4gdGhpcy5lYWNoKGZ1bmN0aW9uKGlkeCl7XG4gICAgICAgIGVsID0gJCh0aGlzKVxuICAgICAgICBlbC5jc3MoZGltZW5zaW9uLCBmdW5jQXJnKHRoaXMsIHZhbHVlLCBpZHgsIGVsW2RpbWVuc2lvbl0oKSkpXG4gICAgICB9KVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiB0cmF2ZXJzZU5vZGUobm9kZSwgZnVuKSB7XG4gICAgZnVuKG5vZGUpXG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IG5vZGUuY2hpbGROb2Rlcy5sZW5ndGg7IGkgPCBsZW47IGkrKylcbiAgICAgIHRyYXZlcnNlTm9kZShub2RlLmNoaWxkTm9kZXNbaV0sIGZ1bilcbiAgfVxuXG4gIC8vIEdlbmVyYXRlIHRoZSBgYWZ0ZXJgLCBgcHJlcGVuZGAsIGBiZWZvcmVgLCBgYXBwZW5kYCxcbiAgLy8gYGluc2VydEFmdGVyYCwgYGluc2VydEJlZm9yZWAsIGBhcHBlbmRUb2AsIGFuZCBgcHJlcGVuZFRvYCBtZXRob2RzLlxuICBhZGphY2VuY3lPcGVyYXRvcnMuZm9yRWFjaChmdW5jdGlvbihvcGVyYXRvciwgb3BlcmF0b3JJbmRleCkge1xuICAgIHZhciBpbnNpZGUgPSBvcGVyYXRvckluZGV4ICUgMiAvLz0+IHByZXBlbmQsIGFwcGVuZFxuXG4gICAgJC5mbltvcGVyYXRvcl0gPSBmdW5jdGlvbigpe1xuICAgICAgLy8gYXJndW1lbnRzIGNhbiBiZSBub2RlcywgYXJyYXlzIG9mIG5vZGVzLCBaZXB0byBvYmplY3RzIGFuZCBIVE1MIHN0cmluZ3NcbiAgICAgIHZhciBhcmdUeXBlLCBub2RlcyA9ICQubWFwKGFyZ3VtZW50cywgZnVuY3Rpb24oYXJnKSB7XG4gICAgICAgICAgICBhcmdUeXBlID0gdHlwZShhcmcpXG4gICAgICAgICAgICByZXR1cm4gYXJnVHlwZSA9PSBcIm9iamVjdFwiIHx8IGFyZ1R5cGUgPT0gXCJhcnJheVwiIHx8IGFyZyA9PSBudWxsID9cbiAgICAgICAgICAgICAgYXJnIDogemVwdG8uZnJhZ21lbnQoYXJnKVxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHBhcmVudCwgY29weUJ5Q2xvbmUgPSB0aGlzLmxlbmd0aCA+IDFcbiAgICAgIGlmIChub2Rlcy5sZW5ndGggPCAxKSByZXR1cm4gdGhpc1xuXG4gICAgICByZXR1cm4gdGhpcy5lYWNoKGZ1bmN0aW9uKF8sIHRhcmdldCl7XG4gICAgICAgIHBhcmVudCA9IGluc2lkZSA/IHRhcmdldCA6IHRhcmdldC5wYXJlbnROb2RlXG5cbiAgICAgICAgLy8gY29udmVydCBhbGwgbWV0aG9kcyB0byBhIFwiYmVmb3JlXCIgb3BlcmF0aW9uXG4gICAgICAgIHRhcmdldCA9IG9wZXJhdG9ySW5kZXggPT0gMCA/IHRhcmdldC5uZXh0U2libGluZyA6XG4gICAgICAgICAgICAgICAgIG9wZXJhdG9ySW5kZXggPT0gMSA/IHRhcmdldC5maXJzdENoaWxkIDpcbiAgICAgICAgICAgICAgICAgb3BlcmF0b3JJbmRleCA9PSAyID8gdGFyZ2V0IDpcbiAgICAgICAgICAgICAgICAgbnVsbFxuXG4gICAgICAgIHZhciBwYXJlbnRJbkRvY3VtZW50ID0gJC5jb250YWlucyhkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHBhcmVudClcblxuICAgICAgICBub2Rlcy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpe1xuICAgICAgICAgIGlmIChjb3B5QnlDbG9uZSkgbm9kZSA9IG5vZGUuY2xvbmVOb2RlKHRydWUpXG4gICAgICAgICAgZWxzZSBpZiAoIXBhcmVudCkgcmV0dXJuICQobm9kZSkucmVtb3ZlKClcblxuICAgICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUobm9kZSwgdGFyZ2V0KVxuICAgICAgICAgIGlmIChwYXJlbnRJbkRvY3VtZW50KSB0cmF2ZXJzZU5vZGUobm9kZSwgZnVuY3Rpb24oZWwpe1xuICAgICAgICAgICAgaWYgKGVsLm5vZGVOYW1lICE9IG51bGwgJiYgZWwubm9kZU5hbWUudG9VcHBlckNhc2UoKSA9PT0gJ1NDUklQVCcgJiZcbiAgICAgICAgICAgICAgICghZWwudHlwZSB8fCBlbC50eXBlID09PSAndGV4dC9qYXZhc2NyaXB0JykgJiYgIWVsLnNyYylcbiAgICAgICAgICAgICAgd2luZG93WydldmFsJ10uY2FsbCh3aW5kb3csIGVsLmlubmVySFRNTClcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyBhZnRlciAgICA9PiBpbnNlcnRBZnRlclxuICAgIC8vIHByZXBlbmQgID0+IHByZXBlbmRUb1xuICAgIC8vIGJlZm9yZSAgID0+IGluc2VydEJlZm9yZVxuICAgIC8vIGFwcGVuZCAgID0+IGFwcGVuZFRvXG4gICAgJC5mbltpbnNpZGUgPyBvcGVyYXRvcisnVG8nIDogJ2luc2VydCcrKG9wZXJhdG9ySW5kZXggPyAnQmVmb3JlJyA6ICdBZnRlcicpXSA9IGZ1bmN0aW9uKGh0bWwpe1xuICAgICAgJChodG1sKVtvcGVyYXRvcl0odGhpcylcbiAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICB9KVxuXG4gIHplcHRvLloucHJvdG90eXBlID0gJC5mblxuXG4gIC8vIEV4cG9ydCBpbnRlcm5hbCBBUEkgZnVuY3Rpb25zIGluIHRoZSBgJC56ZXB0b2AgbmFtZXNwYWNlXG4gIHplcHRvLnVuaXEgPSB1bmlxXG4gIHplcHRvLmRlc2VyaWFsaXplVmFsdWUgPSBkZXNlcmlhbGl6ZVZhbHVlXG4gICQuemVwdG8gPSB6ZXB0b1xuXG4gIHJldHVybiAkXG59KSgpXG5cblxuXG5cbjsoZnVuY3Rpb24oJCl7XG4gIHZhciBfemlkID0gMSwgdW5kZWZpbmVkLFxuICAgICAgc2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UsXG4gICAgICBpc0Z1bmN0aW9uID0gJC5pc0Z1bmN0aW9uLFxuICAgICAgaXNTdHJpbmcgPSBmdW5jdGlvbihvYmopeyByZXR1cm4gdHlwZW9mIG9iaiA9PSAnc3RyaW5nJyB9LFxuICAgICAgaGFuZGxlcnMgPSB7fSxcbiAgICAgIHNwZWNpYWxFdmVudHM9e30sXG4gICAgICBmb2N1c2luU3VwcG9ydGVkID0gJ29uZm9jdXNpbicgaW4gd2luZG93LFxuICAgICAgZm9jdXMgPSB7IGZvY3VzOiAnZm9jdXNpbicsIGJsdXI6ICdmb2N1c291dCcgfSxcbiAgICAgIGhvdmVyID0geyBtb3VzZWVudGVyOiAnbW91c2VvdmVyJywgbW91c2VsZWF2ZTogJ21vdXNlb3V0JyB9XG5cbiAgc3BlY2lhbEV2ZW50cy5jbGljayA9IHNwZWNpYWxFdmVudHMubW91c2Vkb3duID0gc3BlY2lhbEV2ZW50cy5tb3VzZXVwID0gc3BlY2lhbEV2ZW50cy5tb3VzZW1vdmUgPSAnTW91c2VFdmVudHMnXG5cbiAgZnVuY3Rpb24gemlkKGVsZW1lbnQpIHtcbiAgICByZXR1cm4gZWxlbWVudC5femlkIHx8IChlbGVtZW50Ll96aWQgPSBfemlkKyspXG4gIH1cbiAgZnVuY3Rpb24gZmluZEhhbmRsZXJzKGVsZW1lbnQsIGV2ZW50LCBmbiwgc2VsZWN0b3IpIHtcbiAgICBldmVudCA9IHBhcnNlKGV2ZW50KVxuICAgIGlmIChldmVudC5ucykgdmFyIG1hdGNoZXIgPSBtYXRjaGVyRm9yKGV2ZW50Lm5zKVxuICAgIHJldHVybiAoaGFuZGxlcnNbemlkKGVsZW1lbnQpXSB8fCBbXSkuZmlsdGVyKGZ1bmN0aW9uKGhhbmRsZXIpIHtcbiAgICAgIHJldHVybiBoYW5kbGVyXG4gICAgICAgICYmICghZXZlbnQuZSAgfHwgaGFuZGxlci5lID09IGV2ZW50LmUpXG4gICAgICAgICYmICghZXZlbnQubnMgfHwgbWF0Y2hlci50ZXN0KGhhbmRsZXIubnMpKVxuICAgICAgICAmJiAoIWZuICAgICAgIHx8IHppZChoYW5kbGVyLmZuKSA9PT0gemlkKGZuKSlcbiAgICAgICAgJiYgKCFzZWxlY3RvciB8fCBoYW5kbGVyLnNlbCA9PSBzZWxlY3RvcilcbiAgICB9KVxuICB9XG4gIGZ1bmN0aW9uIHBhcnNlKGV2ZW50KSB7XG4gICAgdmFyIHBhcnRzID0gKCcnICsgZXZlbnQpLnNwbGl0KCcuJylcbiAgICByZXR1cm4ge2U6IHBhcnRzWzBdLCBuczogcGFydHMuc2xpY2UoMSkuc29ydCgpLmpvaW4oJyAnKX1cbiAgfVxuICBmdW5jdGlvbiBtYXRjaGVyRm9yKG5zKSB7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoJyg/Ol58ICknICsgbnMucmVwbGFjZSgnICcsICcgLiogPycpICsgJyg/OiB8JCknKVxuICB9XG5cbiAgZnVuY3Rpb24gZXZlbnRDYXB0dXJlKGhhbmRsZXIsIGNhcHR1cmVTZXR0aW5nKSB7XG4gICAgcmV0dXJuIGhhbmRsZXIuZGVsICYmXG4gICAgICAoIWZvY3VzaW5TdXBwb3J0ZWQgJiYgKGhhbmRsZXIuZSBpbiBmb2N1cykpIHx8XG4gICAgICAhIWNhcHR1cmVTZXR0aW5nXG4gIH1cblxuICBmdW5jdGlvbiByZWFsRXZlbnQodHlwZSkge1xuICAgIHJldHVybiBob3Zlclt0eXBlXSB8fCAoZm9jdXNpblN1cHBvcnRlZCAmJiBmb2N1c1t0eXBlXSkgfHwgdHlwZVxuICB9XG5cbiAgZnVuY3Rpb24gYWRkKGVsZW1lbnQsIGV2ZW50cywgZm4sIGRhdGEsIHNlbGVjdG9yLCBkZWxlZ2F0b3IsIGNhcHR1cmUpe1xuICAgIHZhciBpZCA9IHppZChlbGVtZW50KSwgc2V0ID0gKGhhbmRsZXJzW2lkXSB8fCAoaGFuZGxlcnNbaWRdID0gW10pKVxuICAgIGV2ZW50cy5zcGxpdCgvXFxzLykuZm9yRWFjaChmdW5jdGlvbihldmVudCl7XG4gICAgICBpZiAoZXZlbnQgPT0gJ3JlYWR5JykgcmV0dXJuICQoZG9jdW1lbnQpLnJlYWR5KGZuKVxuICAgICAgdmFyIGhhbmRsZXIgICA9IHBhcnNlKGV2ZW50KVxuICAgICAgaGFuZGxlci5mbiAgICA9IGZuXG4gICAgICBoYW5kbGVyLnNlbCAgID0gc2VsZWN0b3JcbiAgICAgIC8vIGVtdWxhdGUgbW91c2VlbnRlciwgbW91c2VsZWF2ZVxuICAgICAgaWYgKGhhbmRsZXIuZSBpbiBob3ZlcikgZm4gPSBmdW5jdGlvbihlKXtcbiAgICAgICAgdmFyIHJlbGF0ZWQgPSBlLnJlbGF0ZWRUYXJnZXRcbiAgICAgICAgaWYgKCFyZWxhdGVkIHx8IChyZWxhdGVkICE9PSB0aGlzICYmICEkLmNvbnRhaW5zKHRoaXMsIHJlbGF0ZWQpKSlcbiAgICAgICAgICByZXR1cm4gaGFuZGxlci5mbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICB9XG4gICAgICBoYW5kbGVyLmRlbCAgID0gZGVsZWdhdG9yXG4gICAgICB2YXIgY2FsbGJhY2sgID0gZGVsZWdhdG9yIHx8IGZuXG4gICAgICBoYW5kbGVyLnByb3h5ID0gZnVuY3Rpb24oZSl7XG4gICAgICAgIGUgPSBjb21wYXRpYmxlKGUpXG4gICAgICAgIGlmIChlLmlzSW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkKCkpIHJldHVyblxuICAgICAgICBlLmRhdGEgPSBkYXRhXG4gICAgICAgIHZhciByZXN1bHQgPSBjYWxsYmFjay5hcHBseShlbGVtZW50LCBlLl9hcmdzID09IHVuZGVmaW5lZCA/IFtlXSA6IFtlXS5jb25jYXQoZS5fYXJncykpXG4gICAgICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKSBlLnByZXZlbnREZWZhdWx0KCksIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgaGFuZGxlci5pID0gc2V0Lmxlbmd0aFxuICAgICAgc2V0LnB1c2goaGFuZGxlcilcbiAgICAgIGlmICgnYWRkRXZlbnRMaXN0ZW5lcicgaW4gZWxlbWVudClcbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHJlYWxFdmVudChoYW5kbGVyLmUpLCBoYW5kbGVyLnByb3h5LCBldmVudENhcHR1cmUoaGFuZGxlciwgY2FwdHVyZSkpXG4gICAgfSlcbiAgfVxuICBmdW5jdGlvbiByZW1vdmUoZWxlbWVudCwgZXZlbnRzLCBmbiwgc2VsZWN0b3IsIGNhcHR1cmUpe1xuICAgIHZhciBpZCA9IHppZChlbGVtZW50KVxuICAgIDsoZXZlbnRzIHx8ICcnKS5zcGxpdCgvXFxzLykuZm9yRWFjaChmdW5jdGlvbihldmVudCl7XG4gICAgICBmaW5kSGFuZGxlcnMoZWxlbWVudCwgZXZlbnQsIGZuLCBzZWxlY3RvcikuZm9yRWFjaChmdW5jdGlvbihoYW5kbGVyKXtcbiAgICAgICAgZGVsZXRlIGhhbmRsZXJzW2lkXVtoYW5kbGVyLmldXG4gICAgICBpZiAoJ3JlbW92ZUV2ZW50TGlzdGVuZXInIGluIGVsZW1lbnQpXG4gICAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihyZWFsRXZlbnQoaGFuZGxlci5lKSwgaGFuZGxlci5wcm94eSwgZXZlbnRDYXB0dXJlKGhhbmRsZXIsIGNhcHR1cmUpKVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgJC5ldmVudCA9IHsgYWRkOiBhZGQsIHJlbW92ZTogcmVtb3ZlIH1cblxuICAkLnByb3h5ID0gZnVuY3Rpb24oZm4sIGNvbnRleHQpIHtcbiAgICB2YXIgYXJncyA9ICgyIGluIGFyZ3VtZW50cykgJiYgc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpXG4gICAgaWYgKGlzRnVuY3Rpb24oZm4pKSB7XG4gICAgICB2YXIgcHJveHlGbiA9IGZ1bmN0aW9uKCl7IHJldHVybiBmbi5hcHBseShjb250ZXh0LCBhcmdzID8gYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSA6IGFyZ3VtZW50cykgfVxuICAgICAgcHJveHlGbi5femlkID0gemlkKGZuKVxuICAgICAgcmV0dXJuIHByb3h5Rm5cbiAgICB9IGVsc2UgaWYgKGlzU3RyaW5nKGNvbnRleHQpKSB7XG4gICAgICBpZiAoYXJncykge1xuICAgICAgICBhcmdzLnVuc2hpZnQoZm5bY29udGV4dF0sIGZuKVxuICAgICAgICByZXR1cm4gJC5wcm94eS5hcHBseShudWxsLCBhcmdzKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICQucHJveHkoZm5bY29udGV4dF0sIGZuKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiZXhwZWN0ZWQgZnVuY3Rpb25cIilcbiAgICB9XG4gIH1cblxuICAkLmZuLmJpbmQgPSBmdW5jdGlvbihldmVudCwgZGF0YSwgY2FsbGJhY2spe1xuICAgIHJldHVybiB0aGlzLm9uKGV2ZW50LCBkYXRhLCBjYWxsYmFjaylcbiAgfVxuICAkLmZuLnVuYmluZCA9IGZ1bmN0aW9uKGV2ZW50LCBjYWxsYmFjayl7XG4gICAgcmV0dXJuIHRoaXMub2ZmKGV2ZW50LCBjYWxsYmFjaylcbiAgfVxuICAkLmZuLm9uZSA9IGZ1bmN0aW9uKGV2ZW50LCBzZWxlY3RvciwgZGF0YSwgY2FsbGJhY2spe1xuICAgIHJldHVybiB0aGlzLm9uKGV2ZW50LCBzZWxlY3RvciwgZGF0YSwgY2FsbGJhY2ssIDEpXG4gIH1cblxuICB2YXIgcmV0dXJuVHJ1ZSA9IGZ1bmN0aW9uKCl7cmV0dXJuIHRydWV9LFxuICAgICAgcmV0dXJuRmFsc2UgPSBmdW5jdGlvbigpe3JldHVybiBmYWxzZX0sXG4gICAgICBpZ25vcmVQcm9wZXJ0aWVzID0gL14oW0EtWl18cmV0dXJuVmFsdWUkfGxheWVyW1hZXSQpLyxcbiAgICAgIGV2ZW50TWV0aG9kcyA9IHtcbiAgICAgICAgcHJldmVudERlZmF1bHQ6ICdpc0RlZmF1bHRQcmV2ZW50ZWQnLFxuICAgICAgICBzdG9wSW1tZWRpYXRlUHJvcGFnYXRpb246ICdpc0ltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZCcsXG4gICAgICAgIHN0b3BQcm9wYWdhdGlvbjogJ2lzUHJvcGFnYXRpb25TdG9wcGVkJ1xuICAgICAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBhdGlibGUoZXZlbnQsIHNvdXJjZSkge1xuICAgIGlmIChzb3VyY2UgfHwgIWV2ZW50LmlzRGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgc291cmNlIHx8IChzb3VyY2UgPSBldmVudClcblxuICAgICAgJC5lYWNoKGV2ZW50TWV0aG9kcywgZnVuY3Rpb24obmFtZSwgcHJlZGljYXRlKSB7XG4gICAgICAgIHZhciBzb3VyY2VNZXRob2QgPSBzb3VyY2VbbmFtZV1cbiAgICAgICAgZXZlbnRbbmFtZV0gPSBmdW5jdGlvbigpe1xuICAgICAgICAgIHRoaXNbcHJlZGljYXRlXSA9IHJldHVyblRydWVcbiAgICAgICAgICByZXR1cm4gc291cmNlTWV0aG9kICYmIHNvdXJjZU1ldGhvZC5hcHBseShzb3VyY2UsIGFyZ3VtZW50cylcbiAgICAgICAgfVxuICAgICAgICBldmVudFtwcmVkaWNhdGVdID0gcmV0dXJuRmFsc2VcbiAgICAgIH0pXG5cbiAgICAgIGlmIChzb3VyY2UuZGVmYXVsdFByZXZlbnRlZCAhPT0gdW5kZWZpbmVkID8gc291cmNlLmRlZmF1bHRQcmV2ZW50ZWQgOlxuICAgICAgICAgICdyZXR1cm5WYWx1ZScgaW4gc291cmNlID8gc291cmNlLnJldHVyblZhbHVlID09PSBmYWxzZSA6XG4gICAgICAgICAgc291cmNlLmdldFByZXZlbnREZWZhdWx0ICYmIHNvdXJjZS5nZXRQcmV2ZW50RGVmYXVsdCgpKVxuICAgICAgICBldmVudC5pc0RlZmF1bHRQcmV2ZW50ZWQgPSByZXR1cm5UcnVlXG4gICAgfVxuICAgIHJldHVybiBldmVudFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUHJveHkoZXZlbnQpIHtcbiAgICB2YXIga2V5LCBwcm94eSA9IHsgb3JpZ2luYWxFdmVudDogZXZlbnQgfVxuICAgIGZvciAoa2V5IGluIGV2ZW50KVxuICAgICAgaWYgKCFpZ25vcmVQcm9wZXJ0aWVzLnRlc3Qoa2V5KSAmJiBldmVudFtrZXldICE9PSB1bmRlZmluZWQpIHByb3h5W2tleV0gPSBldmVudFtrZXldXG5cbiAgICByZXR1cm4gY29tcGF0aWJsZShwcm94eSwgZXZlbnQpXG4gIH1cblxuICAkLmZuLmRlbGVnYXRlID0gZnVuY3Rpb24oc2VsZWN0b3IsIGV2ZW50LCBjYWxsYmFjayl7XG4gICAgcmV0dXJuIHRoaXMub24oZXZlbnQsIHNlbGVjdG9yLCBjYWxsYmFjaylcbiAgfVxuICAkLmZuLnVuZGVsZWdhdGUgPSBmdW5jdGlvbihzZWxlY3RvciwgZXZlbnQsIGNhbGxiYWNrKXtcbiAgICByZXR1cm4gdGhpcy5vZmYoZXZlbnQsIHNlbGVjdG9yLCBjYWxsYmFjaylcbiAgfVxuXG4gICQuZm4ubGl2ZSA9IGZ1bmN0aW9uKGV2ZW50LCBjYWxsYmFjayl7XG4gICAgJChkb2N1bWVudC5ib2R5KS5kZWxlZ2F0ZSh0aGlzLnNlbGVjdG9yLCBldmVudCwgY2FsbGJhY2spXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuICAkLmZuLmRpZSA9IGZ1bmN0aW9uKGV2ZW50LCBjYWxsYmFjayl7XG4gICAgJChkb2N1bWVudC5ib2R5KS51bmRlbGVnYXRlKHRoaXMuc2VsZWN0b3IsIGV2ZW50LCBjYWxsYmFjaylcbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgJC5mbi5vbiA9IGZ1bmN0aW9uKGV2ZW50LCBzZWxlY3RvciwgZGF0YSwgY2FsbGJhY2ssIG9uZSl7XG4gICAgdmFyIGF1dG9SZW1vdmUsIGRlbGVnYXRvciwgJHRoaXMgPSB0aGlzXG4gICAgaWYgKGV2ZW50ICYmICFpc1N0cmluZyhldmVudCkpIHtcbiAgICAgICQuZWFjaChldmVudCwgZnVuY3Rpb24odHlwZSwgZm4pe1xuICAgICAgICAkdGhpcy5vbih0eXBlLCBzZWxlY3RvciwgZGF0YSwgZm4sIG9uZSlcbiAgICAgIH0pXG4gICAgICByZXR1cm4gJHRoaXNcbiAgICB9XG5cbiAgICBpZiAoIWlzU3RyaW5nKHNlbGVjdG9yKSAmJiAhaXNGdW5jdGlvbihjYWxsYmFjaykgJiYgY2FsbGJhY2sgIT09IGZhbHNlKVxuICAgICAgY2FsbGJhY2sgPSBkYXRhLCBkYXRhID0gc2VsZWN0b3IsIHNlbGVjdG9yID0gdW5kZWZpbmVkXG4gICAgaWYgKGlzRnVuY3Rpb24oZGF0YSkgfHwgZGF0YSA9PT0gZmFsc2UpXG4gICAgICBjYWxsYmFjayA9IGRhdGEsIGRhdGEgPSB1bmRlZmluZWRcblxuICAgIGlmIChjYWxsYmFjayA9PT0gZmFsc2UpIGNhbGxiYWNrID0gcmV0dXJuRmFsc2VcblxuICAgIHJldHVybiAkdGhpcy5lYWNoKGZ1bmN0aW9uKF8sIGVsZW1lbnQpe1xuICAgICAgaWYgKG9uZSkgYXV0b1JlbW92ZSA9IGZ1bmN0aW9uKGUpe1xuICAgICAgICByZW1vdmUoZWxlbWVudCwgZS50eXBlLCBjYWxsYmFjaylcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICAgIH1cblxuICAgICAgaWYgKHNlbGVjdG9yKSBkZWxlZ2F0b3IgPSBmdW5jdGlvbihlKXtcbiAgICAgICAgdmFyIGV2dCwgbWF0Y2ggPSAkKGUudGFyZ2V0KS5jbG9zZXN0KHNlbGVjdG9yLCBlbGVtZW50KS5nZXQoMClcbiAgICAgICAgaWYgKG1hdGNoICYmIG1hdGNoICE9PSBlbGVtZW50KSB7XG4gICAgICAgICAgZXZ0ID0gJC5leHRlbmQoY3JlYXRlUHJveHkoZSksIHtjdXJyZW50VGFyZ2V0OiBtYXRjaCwgbGl2ZUZpcmVkOiBlbGVtZW50fSlcbiAgICAgICAgICByZXR1cm4gKGF1dG9SZW1vdmUgfHwgY2FsbGJhY2spLmFwcGx5KG1hdGNoLCBbZXZ0XS5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhZGQoZWxlbWVudCwgZXZlbnQsIGNhbGxiYWNrLCBkYXRhLCBzZWxlY3RvciwgZGVsZWdhdG9yIHx8IGF1dG9SZW1vdmUpXG4gICAgfSlcbiAgfVxuICAkLmZuLm9mZiA9IGZ1bmN0aW9uKGV2ZW50LCBzZWxlY3RvciwgY2FsbGJhY2spe1xuICAgIHZhciAkdGhpcyA9IHRoaXNcbiAgICBpZiAoZXZlbnQgJiYgIWlzU3RyaW5nKGV2ZW50KSkge1xuICAgICAgJC5lYWNoKGV2ZW50LCBmdW5jdGlvbih0eXBlLCBmbil7XG4gICAgICAgICR0aGlzLm9mZih0eXBlLCBzZWxlY3RvciwgZm4pXG4gICAgICB9KVxuICAgICAgcmV0dXJuICR0aGlzXG4gICAgfVxuXG4gICAgaWYgKCFpc1N0cmluZyhzZWxlY3RvcikgJiYgIWlzRnVuY3Rpb24oY2FsbGJhY2spICYmIGNhbGxiYWNrICE9PSBmYWxzZSlcbiAgICAgIGNhbGxiYWNrID0gc2VsZWN0b3IsIHNlbGVjdG9yID0gdW5kZWZpbmVkXG5cbiAgICBpZiAoY2FsbGJhY2sgPT09IGZhbHNlKSBjYWxsYmFjayA9IHJldHVybkZhbHNlXG5cbiAgICByZXR1cm4gJHRoaXMuZWFjaChmdW5jdGlvbigpe1xuICAgICAgcmVtb3ZlKHRoaXMsIGV2ZW50LCBjYWxsYmFjaywgc2VsZWN0b3IpXG4gICAgfSlcbiAgfVxuXG4gICQuZm4udHJpZ2dlciA9IGZ1bmN0aW9uKGV2ZW50LCBhcmdzKXtcbiAgICBldmVudCA9IChpc1N0cmluZyhldmVudCkgfHwgJC5pc1BsYWluT2JqZWN0KGV2ZW50KSkgPyAkLkV2ZW50KGV2ZW50KSA6IGNvbXBhdGlibGUoZXZlbnQpXG4gICAgZXZlbnQuX2FyZ3MgPSBhcmdzXG4gICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbigpe1xuICAgICAgLy8gaXRlbXMgaW4gdGhlIGNvbGxlY3Rpb24gbWlnaHQgbm90IGJlIERPTSBlbGVtZW50c1xuICAgICAgaWYoJ2Rpc3BhdGNoRXZlbnQnIGluIHRoaXMpIHRoaXMuZGlzcGF0Y2hFdmVudChldmVudClcbiAgICAgIGVsc2UgJCh0aGlzKS50cmlnZ2VySGFuZGxlcihldmVudCwgYXJncylcbiAgICB9KVxuICB9XG5cbiAgLy8gdHJpZ2dlcnMgZXZlbnQgaGFuZGxlcnMgb24gY3VycmVudCBlbGVtZW50IGp1c3QgYXMgaWYgYW4gZXZlbnQgb2NjdXJyZWQsXG4gIC8vIGRvZXNuJ3QgdHJpZ2dlciBhbiBhY3R1YWwgZXZlbnQsIGRvZXNuJ3QgYnViYmxlXG4gICQuZm4udHJpZ2dlckhhbmRsZXIgPSBmdW5jdGlvbihldmVudCwgYXJncyl7XG4gICAgdmFyIGUsIHJlc3VsdFxuICAgIHRoaXMuZWFjaChmdW5jdGlvbihpLCBlbGVtZW50KXtcbiAgICAgIGUgPSBjcmVhdGVQcm94eShpc1N0cmluZyhldmVudCkgPyAkLkV2ZW50KGV2ZW50KSA6IGV2ZW50KVxuICAgICAgZS5fYXJncyA9IGFyZ3NcbiAgICAgIGUudGFyZ2V0ID0gZWxlbWVudFxuICAgICAgJC5lYWNoKGZpbmRIYW5kbGVycyhlbGVtZW50LCBldmVudC50eXBlIHx8IGV2ZW50KSwgZnVuY3Rpb24oaSwgaGFuZGxlcil7XG4gICAgICAgIHJlc3VsdCA9IGhhbmRsZXIucHJveHkoZSlcbiAgICAgICAgaWYgKGUuaXNJbW1lZGlhdGVQcm9wYWdhdGlvblN0b3BwZWQoKSkgcmV0dXJuIGZhbHNlXG4gICAgICB9KVxuICAgIH0pXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy8gc2hvcnRjdXQgbWV0aG9kcyBmb3IgYC5iaW5kKGV2ZW50LCBmbilgIGZvciBlYWNoIGV2ZW50IHR5cGVcbiAgOygnZm9jdXNpbiBmb2N1c291dCBsb2FkIHJlc2l6ZSBzY3JvbGwgdW5sb2FkIGNsaWNrIGRibGNsaWNrICcrXG4gICdtb3VzZWRvd24gbW91c2V1cCBtb3VzZW1vdmUgbW91c2VvdmVyIG1vdXNlb3V0IG1vdXNlZW50ZXIgbW91c2VsZWF2ZSAnK1xuICAnY2hhbmdlIHNlbGVjdCBrZXlkb3duIGtleXByZXNzIGtleXVwIGVycm9yJykuc3BsaXQoJyAnKS5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgJC5mbltldmVudF0gPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrID9cbiAgICAgICAgdGhpcy5iaW5kKGV2ZW50LCBjYWxsYmFjaykgOlxuICAgICAgICB0aGlzLnRyaWdnZXIoZXZlbnQpXG4gICAgfVxuICB9KVxuXG4gIDtbJ2ZvY3VzJywgJ2JsdXInXS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAkLmZuW25hbWVdID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgIGlmIChjYWxsYmFjaykgdGhpcy5iaW5kKG5hbWUsIGNhbGxiYWNrKVxuICAgICAgZWxzZSB0aGlzLmVhY2goZnVuY3Rpb24oKXtcbiAgICAgICAgdHJ5IHsgdGhpc1tuYW1lXSgpIH1cbiAgICAgICAgY2F0Y2goZSkge31cbiAgICAgIH0pXG4gICAgICByZXR1cm4gdGhpc1xuICAgIH1cbiAgfSlcblxuICAkLkV2ZW50ID0gZnVuY3Rpb24odHlwZSwgcHJvcHMpIHtcbiAgICBpZiAoIWlzU3RyaW5nKHR5cGUpKSBwcm9wcyA9IHR5cGUsIHR5cGUgPSBwcm9wcy50eXBlXG4gICAgdmFyIGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoc3BlY2lhbEV2ZW50c1t0eXBlXSB8fCAnRXZlbnRzJyksIGJ1YmJsZXMgPSB0cnVlXG4gICAgaWYgKHByb3BzKSBmb3IgKHZhciBuYW1lIGluIHByb3BzKSAobmFtZSA9PSAnYnViYmxlcycpID8gKGJ1YmJsZXMgPSAhIXByb3BzW25hbWVdKSA6IChldmVudFtuYW1lXSA9IHByb3BzW25hbWVdKVxuICAgIGV2ZW50LmluaXRFdmVudCh0eXBlLCBidWJibGVzLCB0cnVlKVxuICAgIHJldHVybiBjb21wYXRpYmxlKGV2ZW50KVxuICB9XG5cbn0pKFplcHRvKVxuXG47KGZ1bmN0aW9uKCQpe1xuICB2YXIganNvbnBJRCA9IDAsXG4gICAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudCxcbiAgICAgIGtleSxcbiAgICAgIG5hbWUsXG4gICAgICByc2NyaXB0ID0gLzxzY3JpcHRcXGJbXjxdKig/Oig/ITxcXC9zY3JpcHQ+KTxbXjxdKikqPFxcL3NjcmlwdD4vZ2ksXG4gICAgICBzY3JpcHRUeXBlUkUgPSAvXig/OnRleHR8YXBwbGljYXRpb24pXFwvamF2YXNjcmlwdC9pLFxuICAgICAgeG1sVHlwZVJFID0gL14oPzp0ZXh0fGFwcGxpY2F0aW9uKVxcL3htbC9pLFxuICAgICAganNvblR5cGUgPSAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICBodG1sVHlwZSA9ICd0ZXh0L2h0bWwnLFxuICAgICAgYmxhbmtSRSA9IC9eXFxzKiQvXG5cbiAgLy8gdHJpZ2dlciBhIGN1c3RvbSBldmVudCBhbmQgcmV0dXJuIGZhbHNlIGlmIGl0IHdhcyBjYW5jZWxsZWRcbiAgZnVuY3Rpb24gdHJpZ2dlckFuZFJldHVybihjb250ZXh0LCBldmVudE5hbWUsIGRhdGEpIHtcbiAgICB2YXIgZXZlbnQgPSAkLkV2ZW50KGV2ZW50TmFtZSlcbiAgICAkKGNvbnRleHQpLnRyaWdnZXIoZXZlbnQsIGRhdGEpXG4gICAgcmV0dXJuICFldmVudC5pc0RlZmF1bHRQcmV2ZW50ZWQoKVxuICB9XG5cbiAgLy8gdHJpZ2dlciBhbiBBamF4IFwiZ2xvYmFsXCIgZXZlbnRcbiAgZnVuY3Rpb24gdHJpZ2dlckdsb2JhbChzZXR0aW5ncywgY29udGV4dCwgZXZlbnROYW1lLCBkYXRhKSB7XG4gICAgaWYgKHNldHRpbmdzLmdsb2JhbCkgcmV0dXJuIHRyaWdnZXJBbmRSZXR1cm4oY29udGV4dCB8fCBkb2N1bWVudCwgZXZlbnROYW1lLCBkYXRhKVxuICB9XG5cbiAgLy8gTnVtYmVyIG9mIGFjdGl2ZSBBamF4IHJlcXVlc3RzXG4gICQuYWN0aXZlID0gMFxuXG4gIGZ1bmN0aW9uIGFqYXhTdGFydChzZXR0aW5ncykge1xuICAgIGlmIChzZXR0aW5ncy5nbG9iYWwgJiYgJC5hY3RpdmUrKyA9PT0gMCkgdHJpZ2dlckdsb2JhbChzZXR0aW5ncywgbnVsbCwgJ2FqYXhTdGFydCcpXG4gIH1cbiAgZnVuY3Rpb24gYWpheFN0b3Aoc2V0dGluZ3MpIHtcbiAgICBpZiAoc2V0dGluZ3MuZ2xvYmFsICYmICEoLS0kLmFjdGl2ZSkpIHRyaWdnZXJHbG9iYWwoc2V0dGluZ3MsIG51bGwsICdhamF4U3RvcCcpXG4gIH1cblxuICAvLyB0cmlnZ2VycyBhbiBleHRyYSBnbG9iYWwgZXZlbnQgXCJhamF4QmVmb3JlU2VuZFwiIHRoYXQncyBsaWtlIFwiYWpheFNlbmRcIiBidXQgY2FuY2VsYWJsZVxuICBmdW5jdGlvbiBhamF4QmVmb3JlU2VuZCh4aHIsIHNldHRpbmdzKSB7XG4gICAgdmFyIGNvbnRleHQgPSBzZXR0aW5ncy5jb250ZXh0XG4gICAgaWYgKHNldHRpbmdzLmJlZm9yZVNlbmQuY2FsbChjb250ZXh0LCB4aHIsIHNldHRpbmdzKSA9PT0gZmFsc2UgfHxcbiAgICAgICAgdHJpZ2dlckdsb2JhbChzZXR0aW5ncywgY29udGV4dCwgJ2FqYXhCZWZvcmVTZW5kJywgW3hociwgc2V0dGluZ3NdKSA9PT0gZmFsc2UpXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAgIHRyaWdnZXJHbG9iYWwoc2V0dGluZ3MsIGNvbnRleHQsICdhamF4U2VuZCcsIFt4aHIsIHNldHRpbmdzXSlcbiAgfVxuICBmdW5jdGlvbiBhamF4U3VjY2VzcyhkYXRhLCB4aHIsIHNldHRpbmdzLCBkZWZlcnJlZCkge1xuICAgIHZhciBjb250ZXh0ID0gc2V0dGluZ3MuY29udGV4dCwgc3RhdHVzID0gJ3N1Y2Nlc3MnXG4gICAgc2V0dGluZ3Muc3VjY2Vzcy5jYWxsKGNvbnRleHQsIGRhdGEsIHN0YXR1cywgeGhyKVxuICAgIGlmIChkZWZlcnJlZCkgZGVmZXJyZWQucmVzb2x2ZVdpdGgoY29udGV4dCwgW2RhdGEsIHN0YXR1cywgeGhyXSlcbiAgICB0cmlnZ2VyR2xvYmFsKHNldHRpbmdzLCBjb250ZXh0LCAnYWpheFN1Y2Nlc3MnLCBbeGhyLCBzZXR0aW5ncywgZGF0YV0pXG4gICAgYWpheENvbXBsZXRlKHN0YXR1cywgeGhyLCBzZXR0aW5ncylcbiAgfVxuICAvLyB0eXBlOiBcInRpbWVvdXRcIiwgXCJlcnJvclwiLCBcImFib3J0XCIsIFwicGFyc2VyZXJyb3JcIlxuICBmdW5jdGlvbiBhamF4RXJyb3IoZXJyb3IsIHR5cGUsIHhociwgc2V0dGluZ3MsIGRlZmVycmVkKSB7XG4gICAgdmFyIGNvbnRleHQgPSBzZXR0aW5ncy5jb250ZXh0XG4gICAgc2V0dGluZ3MuZXJyb3IuY2FsbChjb250ZXh0LCB4aHIsIHR5cGUsIGVycm9yKVxuICAgIGlmIChkZWZlcnJlZCkgZGVmZXJyZWQucmVqZWN0V2l0aChjb250ZXh0LCBbeGhyLCB0eXBlLCBlcnJvcl0pXG4gICAgdHJpZ2dlckdsb2JhbChzZXR0aW5ncywgY29udGV4dCwgJ2FqYXhFcnJvcicsIFt4aHIsIHNldHRpbmdzLCBlcnJvciB8fCB0eXBlXSlcbiAgICBhamF4Q29tcGxldGUodHlwZSwgeGhyLCBzZXR0aW5ncylcbiAgfVxuICAvLyBzdGF0dXM6IFwic3VjY2Vzc1wiLCBcIm5vdG1vZGlmaWVkXCIsIFwiZXJyb3JcIiwgXCJ0aW1lb3V0XCIsIFwiYWJvcnRcIiwgXCJwYXJzZXJlcnJvclwiXG4gIGZ1bmN0aW9uIGFqYXhDb21wbGV0ZShzdGF0dXMsIHhociwgc2V0dGluZ3MpIHtcbiAgICB2YXIgY29udGV4dCA9IHNldHRpbmdzLmNvbnRleHRcbiAgICBzZXR0aW5ncy5jb21wbGV0ZS5jYWxsKGNvbnRleHQsIHhociwgc3RhdHVzKVxuICAgIHRyaWdnZXJHbG9iYWwoc2V0dGluZ3MsIGNvbnRleHQsICdhamF4Q29tcGxldGUnLCBbeGhyLCBzZXR0aW5nc10pXG4gICAgYWpheFN0b3Aoc2V0dGluZ3MpXG4gIH1cblxuICAvLyBFbXB0eSBmdW5jdGlvbiwgdXNlZCBhcyBkZWZhdWx0IGNhbGxiYWNrXG4gIGZ1bmN0aW9uIGVtcHR5KCkge31cblxuICAkLmFqYXhKU09OUCA9IGZ1bmN0aW9uKG9wdGlvbnMsIGRlZmVycmVkKXtcbiAgICBpZiAoISgndHlwZScgaW4gb3B0aW9ucykpIHJldHVybiAkLmFqYXgob3B0aW9ucylcblxuICAgIHZhciBfY2FsbGJhY2tOYW1lID0gb3B0aW9ucy5qc29ucENhbGxiYWNrLFxuICAgICAgY2FsbGJhY2tOYW1lID0gKCQuaXNGdW5jdGlvbihfY2FsbGJhY2tOYW1lKSA/XG4gICAgICAgIF9jYWxsYmFja05hbWUoKSA6IF9jYWxsYmFja05hbWUpIHx8ICgnanNvbnAnICsgKCsranNvbnBJRCkpLFxuICAgICAgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0JyksXG4gICAgICBvcmlnaW5hbENhbGxiYWNrID0gd2luZG93W2NhbGxiYWNrTmFtZV0sXG4gICAgICByZXNwb25zZURhdGEsXG4gICAgICBhYm9ydCA9IGZ1bmN0aW9uKGVycm9yVHlwZSkge1xuICAgICAgICAkKHNjcmlwdCkudHJpZ2dlckhhbmRsZXIoJ2Vycm9yJywgZXJyb3JUeXBlIHx8ICdhYm9ydCcpXG4gICAgICB9LFxuICAgICAgeGhyID0geyBhYm9ydDogYWJvcnQgfSwgYWJvcnRUaW1lb3V0XG5cbiAgICBpZiAoZGVmZXJyZWQpIGRlZmVycmVkLnByb21pc2UoeGhyKVxuXG4gICAgJChzY3JpcHQpLm9uKCdsb2FkIGVycm9yJywgZnVuY3Rpb24oZSwgZXJyb3JUeXBlKXtcbiAgICAgIGNsZWFyVGltZW91dChhYm9ydFRpbWVvdXQpXG4gICAgICAkKHNjcmlwdCkub2ZmKCkucmVtb3ZlKClcblxuICAgICAgaWYgKGUudHlwZSA9PSAnZXJyb3InIHx8ICFyZXNwb25zZURhdGEpIHtcbiAgICAgICAgYWpheEVycm9yKG51bGwsIGVycm9yVHlwZSB8fCAnZXJyb3InLCB4aHIsIG9wdGlvbnMsIGRlZmVycmVkKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWpheFN1Y2Nlc3MocmVzcG9uc2VEYXRhWzBdLCB4aHIsIG9wdGlvbnMsIGRlZmVycmVkKVxuICAgICAgfVxuXG4gICAgICB3aW5kb3dbY2FsbGJhY2tOYW1lXSA9IG9yaWdpbmFsQ2FsbGJhY2tcbiAgICAgIGlmIChyZXNwb25zZURhdGEgJiYgJC5pc0Z1bmN0aW9uKG9yaWdpbmFsQ2FsbGJhY2spKVxuICAgICAgICBvcmlnaW5hbENhbGxiYWNrKHJlc3BvbnNlRGF0YVswXSlcblxuICAgICAgb3JpZ2luYWxDYWxsYmFjayA9IHJlc3BvbnNlRGF0YSA9IHVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpZiAoYWpheEJlZm9yZVNlbmQoeGhyLCBvcHRpb25zKSA9PT0gZmFsc2UpIHtcbiAgICAgIGFib3J0KCdhYm9ydCcpXG4gICAgICByZXR1cm4geGhyXG4gICAgfVxuXG4gICAgd2luZG93W2NhbGxiYWNrTmFtZV0gPSBmdW5jdGlvbigpe1xuICAgICAgcmVzcG9uc2VEYXRhID0gYXJndW1lbnRzXG4gICAgfVxuXG4gICAgc2NyaXB0LnNyYyA9IG9wdGlvbnMudXJsLnJlcGxhY2UoL1xcPyguKyk9XFw/LywgJz8kMT0nICsgY2FsbGJhY2tOYW1lKVxuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc2NyaXB0KVxuXG4gICAgaWYgKG9wdGlvbnMudGltZW91dCA+IDApIGFib3J0VGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIGFib3J0KCd0aW1lb3V0JylcbiAgICB9LCBvcHRpb25zLnRpbWVvdXQpXG5cbiAgICByZXR1cm4geGhyXG4gIH1cblxuICAkLmFqYXhTZXR0aW5ncyA9IHtcbiAgICAvLyBEZWZhdWx0IHR5cGUgb2YgcmVxdWVzdFxuICAgIHR5cGU6ICdHRVQnLFxuICAgIC8vIENhbGxiYWNrIHRoYXQgaXMgZXhlY3V0ZWQgYmVmb3JlIHJlcXVlc3RcbiAgICBiZWZvcmVTZW5kOiBlbXB0eSxcbiAgICAvLyBDYWxsYmFjayB0aGF0IGlzIGV4ZWN1dGVkIGlmIHRoZSByZXF1ZXN0IHN1Y2NlZWRzXG4gICAgc3VjY2VzczogZW1wdHksXG4gICAgLy8gQ2FsbGJhY2sgdGhhdCBpcyBleGVjdXRlZCB0aGUgdGhlIHNlcnZlciBkcm9wcyBlcnJvclxuICAgIGVycm9yOiBlbXB0eSxcbiAgICAvLyBDYWxsYmFjayB0aGF0IGlzIGV4ZWN1dGVkIG9uIHJlcXVlc3QgY29tcGxldGUgKGJvdGg6IGVycm9yIGFuZCBzdWNjZXNzKVxuICAgIGNvbXBsZXRlOiBlbXB0eSxcbiAgICAvLyBUaGUgY29udGV4dCBmb3IgdGhlIGNhbGxiYWNrc1xuICAgIGNvbnRleHQ6IG51bGwsXG4gICAgLy8gV2hldGhlciB0byB0cmlnZ2VyIFwiZ2xvYmFsXCIgQWpheCBldmVudHNcbiAgICBnbG9iYWw6IHRydWUsXG4gICAgLy8gVHJhbnNwb3J0XG4gICAgeGhyOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gbmV3IHdpbmRvdy5YTUxIdHRwUmVxdWVzdCgpXG4gICAgfSxcbiAgICAvLyBNSU1FIHR5cGVzIG1hcHBpbmdcbiAgICAvLyBJSVMgcmV0dXJucyBKYXZhc2NyaXB0IGFzIFwiYXBwbGljYXRpb24veC1qYXZhc2NyaXB0XCJcbiAgICBhY2NlcHRzOiB7XG4gICAgICBzY3JpcHQ6ICd0ZXh0L2phdmFzY3JpcHQsIGFwcGxpY2F0aW9uL2phdmFzY3JpcHQsIGFwcGxpY2F0aW9uL3gtamF2YXNjcmlwdCcsXG4gICAgICBqc29uOiAgIGpzb25UeXBlLFxuICAgICAgeG1sOiAgICAnYXBwbGljYXRpb24veG1sLCB0ZXh0L3htbCcsXG4gICAgICBodG1sOiAgIGh0bWxUeXBlLFxuICAgICAgdGV4dDogICAndGV4dC9wbGFpbidcbiAgICB9LFxuICAgIC8vIFdoZXRoZXIgdGhlIHJlcXVlc3QgaXMgdG8gYW5vdGhlciBkb21haW5cbiAgICBjcm9zc0RvbWFpbjogZmFsc2UsXG4gICAgLy8gRGVmYXVsdCB0aW1lb3V0XG4gICAgdGltZW91dDogMCxcbiAgICAvLyBXaGV0aGVyIGRhdGEgc2hvdWxkIGJlIHNlcmlhbGl6ZWQgdG8gc3RyaW5nXG4gICAgcHJvY2Vzc0RhdGE6IHRydWUsXG4gICAgLy8gV2hldGhlciB0aGUgYnJvd3NlciBzaG91bGQgYmUgYWxsb3dlZCB0byBjYWNoZSBHRVQgcmVzcG9uc2VzXG4gICAgY2FjaGU6IHRydWVcbiAgfVxuXG4gIGZ1bmN0aW9uIG1pbWVUb0RhdGFUeXBlKG1pbWUpIHtcbiAgICBpZiAobWltZSkgbWltZSA9IG1pbWUuc3BsaXQoJzsnLCAyKVswXVxuICAgIHJldHVybiBtaW1lICYmICggbWltZSA9PSBodG1sVHlwZSA/ICdodG1sJyA6XG4gICAgICBtaW1lID09IGpzb25UeXBlID8gJ2pzb24nIDpcbiAgICAgIHNjcmlwdFR5cGVSRS50ZXN0KG1pbWUpID8gJ3NjcmlwdCcgOlxuICAgICAgeG1sVHlwZVJFLnRlc3QobWltZSkgJiYgJ3htbCcgKSB8fCAndGV4dCdcbiAgfVxuXG4gIGZ1bmN0aW9uIGFwcGVuZFF1ZXJ5KHVybCwgcXVlcnkpIHtcbiAgICBpZiAocXVlcnkgPT0gJycpIHJldHVybiB1cmxcbiAgICByZXR1cm4gKHVybCArICcmJyArIHF1ZXJ5KS5yZXBsYWNlKC9bJj9dezEsMn0vLCAnPycpXG4gIH1cblxuICAvLyBzZXJpYWxpemUgcGF5bG9hZCBhbmQgYXBwZW5kIGl0IHRvIHRoZSBVUkwgZm9yIEdFVCByZXF1ZXN0c1xuICBmdW5jdGlvbiBzZXJpYWxpemVEYXRhKG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5wcm9jZXNzRGF0YSAmJiBvcHRpb25zLmRhdGEgJiYgJC50eXBlKG9wdGlvbnMuZGF0YSkgIT0gXCJzdHJpbmdcIilcbiAgICAgIG9wdGlvbnMuZGF0YSA9ICQucGFyYW0ob3B0aW9ucy5kYXRhLCBvcHRpb25zLnRyYWRpdGlvbmFsKVxuICAgIGlmIChvcHRpb25zLmRhdGEgJiYgKCFvcHRpb25zLnR5cGUgfHwgb3B0aW9ucy50eXBlLnRvVXBwZXJDYXNlKCkgPT0gJ0dFVCcpKVxuICAgICAgb3B0aW9ucy51cmwgPSBhcHBlbmRRdWVyeShvcHRpb25zLnVybCwgb3B0aW9ucy5kYXRhKSwgb3B0aW9ucy5kYXRhID0gdW5kZWZpbmVkXG4gIH1cblxuICAkLmFqYXggPSBmdW5jdGlvbihvcHRpb25zKXtcbiAgICB2YXIgc2V0dGluZ3MgPSAkLmV4dGVuZCh7fSwgb3B0aW9ucyB8fCB7fSksXG4gICAgICAgIGRlZmVycmVkID0gJC5EZWZlcnJlZCAmJiAkLkRlZmVycmVkKClcbiAgICBmb3IgKGtleSBpbiAkLmFqYXhTZXR0aW5ncykgaWYgKHNldHRpbmdzW2tleV0gPT09IHVuZGVmaW5lZCkgc2V0dGluZ3Nba2V5XSA9ICQuYWpheFNldHRpbmdzW2tleV1cblxuICAgIGFqYXhTdGFydChzZXR0aW5ncylcblxuICAgIGlmICghc2V0dGluZ3MuY3Jvc3NEb21haW4pIHNldHRpbmdzLmNyb3NzRG9tYWluID0gL14oW1xcdy1dKzopP1xcL1xcLyhbXlxcL10rKS8udGVzdChzZXR0aW5ncy51cmwpICYmXG4gICAgICBSZWdFeHAuJDIgIT0gd2luZG93LmxvY2F0aW9uLmhvc3RcblxuICAgIGlmICghc2V0dGluZ3MudXJsKSBzZXR0aW5ncy51cmwgPSB3aW5kb3cubG9jYXRpb24udG9TdHJpbmcoKVxuICAgIHNlcmlhbGl6ZURhdGEoc2V0dGluZ3MpXG5cbiAgICB2YXIgZGF0YVR5cGUgPSBzZXR0aW5ncy5kYXRhVHlwZSwgaGFzUGxhY2Vob2xkZXIgPSAvXFw/Lis9XFw/Ly50ZXN0KHNldHRpbmdzLnVybClcbiAgICBpZiAoaGFzUGxhY2Vob2xkZXIpIGRhdGFUeXBlID0gJ2pzb25wJ1xuXG4gICAgaWYgKHNldHRpbmdzLmNhY2hlID09PSBmYWxzZSB8fCAoXG4gICAgICAgICAoIW9wdGlvbnMgfHwgb3B0aW9ucy5jYWNoZSAhPT0gdHJ1ZSkgJiZcbiAgICAgICAgICgnc2NyaXB0JyA9PSBkYXRhVHlwZSB8fCAnanNvbnAnID09IGRhdGFUeXBlKVxuICAgICAgICApKVxuICAgICAgc2V0dGluZ3MudXJsID0gYXBwZW5kUXVlcnkoc2V0dGluZ3MudXJsLCAnXz0nICsgRGF0ZS5ub3coKSlcblxuICAgIGlmICgnanNvbnAnID09IGRhdGFUeXBlKSB7XG4gICAgICBpZiAoIWhhc1BsYWNlaG9sZGVyKVxuICAgICAgICBzZXR0aW5ncy51cmwgPSBhcHBlbmRRdWVyeShzZXR0aW5ncy51cmwsXG4gICAgICAgICAgc2V0dGluZ3MuanNvbnAgPyAoc2V0dGluZ3MuanNvbnAgKyAnPT8nKSA6IHNldHRpbmdzLmpzb25wID09PSBmYWxzZSA/ICcnIDogJ2NhbGxiYWNrPT8nKVxuICAgICAgcmV0dXJuICQuYWpheEpTT05QKHNldHRpbmdzLCBkZWZlcnJlZClcbiAgICB9XG5cbiAgICB2YXIgbWltZSA9IHNldHRpbmdzLmFjY2VwdHNbZGF0YVR5cGVdLFxuICAgICAgICBoZWFkZXJzID0geyB9LFxuICAgICAgICBzZXRIZWFkZXIgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSkgeyBoZWFkZXJzW25hbWUudG9Mb3dlckNhc2UoKV0gPSBbbmFtZSwgdmFsdWVdIH0sXG4gICAgICAgIHByb3RvY29sID0gL14oW1xcdy1dKzopXFwvXFwvLy50ZXN0KHNldHRpbmdzLnVybCkgPyBSZWdFeHAuJDEgOiB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wsXG4gICAgICAgIHhociA9IHNldHRpbmdzLnhocigpLFxuICAgICAgICBuYXRpdmVTZXRIZWFkZXIgPSB4aHIuc2V0UmVxdWVzdEhlYWRlcixcbiAgICAgICAgYWJvcnRUaW1lb3V0XG5cbiAgICBpZiAoZGVmZXJyZWQpIGRlZmVycmVkLnByb21pc2UoeGhyKVxuXG4gICAgaWYgKCFzZXR0aW5ncy5jcm9zc0RvbWFpbikgc2V0SGVhZGVyKCdYLVJlcXVlc3RlZC1XaXRoJywgJ1hNTEh0dHBSZXF1ZXN0JylcbiAgICBzZXRIZWFkZXIoJ0FjY2VwdCcsIG1pbWUgfHwgJyovKicpXG4gICAgaWYgKG1pbWUgPSBzZXR0aW5ncy5taW1lVHlwZSB8fCBtaW1lKSB7XG4gICAgICBpZiAobWltZS5pbmRleE9mKCcsJykgPiAtMSkgbWltZSA9IG1pbWUuc3BsaXQoJywnLCAyKVswXVxuICAgICAgeGhyLm92ZXJyaWRlTWltZVR5cGUgJiYgeGhyLm92ZXJyaWRlTWltZVR5cGUobWltZSlcbiAgICB9XG4gICAgaWYgKHNldHRpbmdzLmNvbnRlbnRUeXBlIHx8IChzZXR0aW5ncy5jb250ZW50VHlwZSAhPT0gZmFsc2UgJiYgc2V0dGluZ3MuZGF0YSAmJiBzZXR0aW5ncy50eXBlLnRvVXBwZXJDYXNlKCkgIT0gJ0dFVCcpKVxuICAgICAgc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCBzZXR0aW5ncy5jb250ZW50VHlwZSB8fCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJylcblxuICAgIGlmIChzZXR0aW5ncy5oZWFkZXJzKSBmb3IgKG5hbWUgaW4gc2V0dGluZ3MuaGVhZGVycykgc2V0SGVhZGVyKG5hbWUsIHNldHRpbmdzLmhlYWRlcnNbbmFtZV0pXG4gICAgeGhyLnNldFJlcXVlc3RIZWFkZXIgPSBzZXRIZWFkZXJcblxuICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpe1xuICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09IDQpIHtcbiAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGVtcHR5XG4gICAgICAgIGNsZWFyVGltZW91dChhYm9ydFRpbWVvdXQpXG4gICAgICAgIHZhciByZXN1bHQsIGVycm9yID0gZmFsc2VcbiAgICAgICAgaWYgKCh4aHIuc3RhdHVzID49IDIwMCAmJiB4aHIuc3RhdHVzIDwgMzAwKSB8fCB4aHIuc3RhdHVzID09IDMwNCB8fCAoeGhyLnN0YXR1cyA9PSAwICYmIHByb3RvY29sID09ICdmaWxlOicpKSB7XG4gICAgICAgICAgZGF0YVR5cGUgPSBkYXRhVHlwZSB8fCBtaW1lVG9EYXRhVHlwZShzZXR0aW5ncy5taW1lVHlwZSB8fCB4aHIuZ2V0UmVzcG9uc2VIZWFkZXIoJ2NvbnRlbnQtdHlwZScpKVxuICAgICAgICAgIHJlc3VsdCA9IHhoci5yZXNwb25zZVRleHRcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBodHRwOi8vcGVyZmVjdGlvbmtpbGxzLmNvbS9nbG9iYWwtZXZhbC13aGF0LWFyZS10aGUtb3B0aW9ucy9cbiAgICAgICAgICAgIGlmIChkYXRhVHlwZSA9PSAnc2NyaXB0JykgICAgKDEsZXZhbCkocmVzdWx0KVxuICAgICAgICAgICAgZWxzZSBpZiAoZGF0YVR5cGUgPT0gJ3htbCcpICByZXN1bHQgPSB4aHIucmVzcG9uc2VYTUxcbiAgICAgICAgICAgIGVsc2UgaWYgKGRhdGFUeXBlID09ICdqc29uJykgcmVzdWx0ID0gYmxhbmtSRS50ZXN0KHJlc3VsdCkgPyBudWxsIDogJC5wYXJzZUpTT04ocmVzdWx0KVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgZXJyb3IgPSBlIH1cblxuICAgICAgICAgIGlmIChlcnJvcikgYWpheEVycm9yKGVycm9yLCAncGFyc2VyZXJyb3InLCB4aHIsIHNldHRpbmdzLCBkZWZlcnJlZClcbiAgICAgICAgICBlbHNlIGFqYXhTdWNjZXNzKHJlc3VsdCwgeGhyLCBzZXR0aW5ncywgZGVmZXJyZWQpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWpheEVycm9yKHhoci5zdGF0dXNUZXh0IHx8IG51bGwsIHhoci5zdGF0dXMgPyAnZXJyb3InIDogJ2Fib3J0JywgeGhyLCBzZXR0aW5ncywgZGVmZXJyZWQpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoYWpheEJlZm9yZVNlbmQoeGhyLCBzZXR0aW5ncykgPT09IGZhbHNlKSB7XG4gICAgICB4aHIuYWJvcnQoKVxuICAgICAgYWpheEVycm9yKG51bGwsICdhYm9ydCcsIHhociwgc2V0dGluZ3MsIGRlZmVycmVkKVxuICAgICAgcmV0dXJuIHhoclxuICAgIH1cblxuICAgIGlmIChzZXR0aW5ncy54aHJGaWVsZHMpIGZvciAobmFtZSBpbiBzZXR0aW5ncy54aHJGaWVsZHMpIHhocltuYW1lXSA9IHNldHRpbmdzLnhockZpZWxkc1tuYW1lXVxuXG4gICAgdmFyIGFzeW5jID0gJ2FzeW5jJyBpbiBzZXR0aW5ncyA/IHNldHRpbmdzLmFzeW5jIDogdHJ1ZVxuICAgIHhoci5vcGVuKHNldHRpbmdzLnR5cGUsIHNldHRpbmdzLnVybCwgYXN5bmMsIHNldHRpbmdzLnVzZXJuYW1lLCBzZXR0aW5ncy5wYXNzd29yZClcblxuICAgIGZvciAobmFtZSBpbiBoZWFkZXJzKSBuYXRpdmVTZXRIZWFkZXIuYXBwbHkoeGhyLCBoZWFkZXJzW25hbWVdKVxuXG4gICAgaWYgKHNldHRpbmdzLnRpbWVvdXQgPiAwKSBhYm9ydFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBlbXB0eVxuICAgICAgICB4aHIuYWJvcnQoKVxuICAgICAgICBhamF4RXJyb3IobnVsbCwgJ3RpbWVvdXQnLCB4aHIsIHNldHRpbmdzLCBkZWZlcnJlZClcbiAgICAgIH0sIHNldHRpbmdzLnRpbWVvdXQpXG5cbiAgICAvLyBhdm9pZCBzZW5kaW5nIGVtcHR5IHN0cmluZyAoIzMxOSlcbiAgICB4aHIuc2VuZChzZXR0aW5ncy5kYXRhID8gc2V0dGluZ3MuZGF0YSA6IG51bGwpXG4gICAgcmV0dXJuIHhoclxuICB9XG5cbiAgLy8gaGFuZGxlIG9wdGlvbmFsIGRhdGEvc3VjY2VzcyBhcmd1bWVudHNcbiAgZnVuY3Rpb24gcGFyc2VBcmd1bWVudHModXJsLCBkYXRhLCBzdWNjZXNzLCBkYXRhVHlwZSkge1xuICAgIGlmICgkLmlzRnVuY3Rpb24oZGF0YSkpIGRhdGFUeXBlID0gc3VjY2Vzcywgc3VjY2VzcyA9IGRhdGEsIGRhdGEgPSB1bmRlZmluZWRcbiAgICBpZiAoISQuaXNGdW5jdGlvbihzdWNjZXNzKSkgZGF0YVR5cGUgPSBzdWNjZXNzLCBzdWNjZXNzID0gdW5kZWZpbmVkXG4gICAgcmV0dXJuIHtcbiAgICAgIHVybDogdXJsXG4gICAgLCBkYXRhOiBkYXRhXG4gICAgLCBzdWNjZXNzOiBzdWNjZXNzXG4gICAgLCBkYXRhVHlwZTogZGF0YVR5cGVcbiAgICB9XG4gIH1cblxuICAkLmdldCA9IGZ1bmN0aW9uKC8qIHVybCwgZGF0YSwgc3VjY2VzcywgZGF0YVR5cGUgKi8pe1xuICAgIHJldHVybiAkLmFqYXgocGFyc2VBcmd1bWVudHMuYXBwbHkobnVsbCwgYXJndW1lbnRzKSlcbiAgfVxuXG4gICQucG9zdCA9IGZ1bmN0aW9uKC8qIHVybCwgZGF0YSwgc3VjY2VzcywgZGF0YVR5cGUgKi8pe1xuICAgIHZhciBvcHRpb25zID0gcGFyc2VBcmd1bWVudHMuYXBwbHkobnVsbCwgYXJndW1lbnRzKVxuICAgIG9wdGlvbnMudHlwZSA9ICdQT1NUJ1xuICAgIHJldHVybiAkLmFqYXgob3B0aW9ucylcbiAgfVxuXG4gICQuZ2V0SlNPTiA9IGZ1bmN0aW9uKC8qIHVybCwgZGF0YSwgc3VjY2VzcyAqLyl7XG4gICAgdmFyIG9wdGlvbnMgPSBwYXJzZUFyZ3VtZW50cy5hcHBseShudWxsLCBhcmd1bWVudHMpXG4gICAgb3B0aW9ucy5kYXRhVHlwZSA9ICdqc29uJ1xuICAgIHJldHVybiAkLmFqYXgob3B0aW9ucylcbiAgfVxuXG4gICQuZm4ubG9hZCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgc3VjY2Vzcyl7XG4gICAgaWYgKCF0aGlzLmxlbmd0aCkgcmV0dXJuIHRoaXNcbiAgICB2YXIgc2VsZiA9IHRoaXMsIHBhcnRzID0gdXJsLnNwbGl0KC9cXHMvKSwgc2VsZWN0b3IsXG4gICAgICAgIG9wdGlvbnMgPSBwYXJzZUFyZ3VtZW50cyh1cmwsIGRhdGEsIHN1Y2Nlc3MpLFxuICAgICAgICBjYWxsYmFjayA9IG9wdGlvbnMuc3VjY2Vzc1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSBvcHRpb25zLnVybCA9IHBhcnRzWzBdLCBzZWxlY3RvciA9IHBhcnRzWzFdXG4gICAgb3B0aW9ucy5zdWNjZXNzID0gZnVuY3Rpb24ocmVzcG9uc2Upe1xuICAgICAgc2VsZi5odG1sKHNlbGVjdG9yID9cbiAgICAgICAgJCgnPGRpdj4nKS5odG1sKHJlc3BvbnNlLnJlcGxhY2UocnNjcmlwdCwgXCJcIikpLmZpbmQoc2VsZWN0b3IpXG4gICAgICAgIDogcmVzcG9uc2UpXG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjay5hcHBseShzZWxmLCBhcmd1bWVudHMpXG4gICAgfVxuICAgICQuYWpheChvcHRpb25zKVxuICAgIHJldHVybiB0aGlzXG4gIH1cblxuICB2YXIgZXNjYXBlID0gZW5jb2RlVVJJQ29tcG9uZW50XG5cbiAgZnVuY3Rpb24gc2VyaWFsaXplKHBhcmFtcywgb2JqLCB0cmFkaXRpb25hbCwgc2NvcGUpe1xuICAgIHZhciB0eXBlLCBhcnJheSA9ICQuaXNBcnJheShvYmopLCBoYXNoID0gJC5pc1BsYWluT2JqZWN0KG9iailcbiAgICAkLmVhY2gob2JqLCBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICB0eXBlID0gJC50eXBlKHZhbHVlKVxuICAgICAgaWYgKHNjb3BlKSBrZXkgPSB0cmFkaXRpb25hbCA/IHNjb3BlIDpcbiAgICAgICAgc2NvcGUgKyAnWycgKyAoaGFzaCB8fCB0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2FycmF5JyA/IGtleSA6ICcnKSArICddJ1xuICAgICAgLy8gaGFuZGxlIGRhdGEgaW4gc2VyaWFsaXplQXJyYXkoKSBmb3JtYXRcbiAgICAgIGlmICghc2NvcGUgJiYgYXJyYXkpIHBhcmFtcy5hZGQodmFsdWUubmFtZSwgdmFsdWUudmFsdWUpXG4gICAgICAvLyByZWN1cnNlIGludG8gbmVzdGVkIG9iamVjdHNcbiAgICAgIGVsc2UgaWYgKHR5cGUgPT0gXCJhcnJheVwiIHx8ICghdHJhZGl0aW9uYWwgJiYgdHlwZSA9PSBcIm9iamVjdFwiKSlcbiAgICAgICAgc2VyaWFsaXplKHBhcmFtcywgdmFsdWUsIHRyYWRpdGlvbmFsLCBrZXkpXG4gICAgICBlbHNlIHBhcmFtcy5hZGQoa2V5LCB2YWx1ZSlcbiAgICB9KVxuICB9XG5cbiAgJC5wYXJhbSA9IGZ1bmN0aW9uKG9iaiwgdHJhZGl0aW9uYWwpe1xuICAgIHZhciBwYXJhbXMgPSBbXVxuICAgIHBhcmFtcy5hZGQgPSBmdW5jdGlvbihrLCB2KXsgdGhpcy5wdXNoKGVzY2FwZShrKSArICc9JyArIGVzY2FwZSh2KSkgfVxuICAgIHNlcmlhbGl6ZShwYXJhbXMsIG9iaiwgdHJhZGl0aW9uYWwpXG4gICAgcmV0dXJuIHBhcmFtcy5qb2luKCcmJykucmVwbGFjZSgvJTIwL2csICcrJylcbiAgfVxufSkoWmVwdG8pXG5cbjsoZnVuY3Rpb24oJCl7XG4gICQuZm4uc2VyaWFsaXplQXJyYXkgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgcmVzdWx0ID0gW10sIGVsXG4gICAgJChbXS5zbGljZS5jYWxsKHRoaXMuZ2V0KDApLmVsZW1lbnRzKSkuZWFjaChmdW5jdGlvbigpe1xuICAgICAgZWwgPSAkKHRoaXMpXG4gICAgICB2YXIgdHlwZSA9IGVsLmF0dHIoJ3R5cGUnKVxuICAgICAgaWYgKHRoaXMubm9kZU5hbWUudG9Mb3dlckNhc2UoKSAhPSAnZmllbGRzZXQnICYmXG4gICAgICAgICF0aGlzLmRpc2FibGVkICYmIHR5cGUgIT0gJ3N1Ym1pdCcgJiYgdHlwZSAhPSAncmVzZXQnICYmIHR5cGUgIT0gJ2J1dHRvbicgJiZcbiAgICAgICAgKCh0eXBlICE9ICdyYWRpbycgJiYgdHlwZSAhPSAnY2hlY2tib3gnKSB8fCB0aGlzLmNoZWNrZWQpKVxuICAgICAgICByZXN1bHQucHVzaCh7XG4gICAgICAgICAgbmFtZTogZWwuYXR0cignbmFtZScpLFxuICAgICAgICAgIHZhbHVlOiBlbC52YWwoKVxuICAgICAgICB9KVxuICAgIH0pXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgJC5mbi5zZXJpYWxpemUgPSBmdW5jdGlvbigpe1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIHRoaXMuc2VyaWFsaXplQXJyYXkoKS5mb3JFYWNoKGZ1bmN0aW9uKGVsbSl7XG4gICAgICByZXN1bHQucHVzaChlbmNvZGVVUklDb21wb25lbnQoZWxtLm5hbWUpICsgJz0nICsgZW5jb2RlVVJJQ29tcG9uZW50KGVsbS52YWx1ZSkpXG4gICAgfSlcbiAgICByZXR1cm4gcmVzdWx0LmpvaW4oJyYnKVxuICB9XG5cbiAgJC5mbi5zdWJtaXQgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGlmIChjYWxsYmFjaykgdGhpcy5iaW5kKCdzdWJtaXQnLCBjYWxsYmFjaylcbiAgICBlbHNlIGlmICh0aGlzLmxlbmd0aCkge1xuICAgICAgdmFyIGV2ZW50ID0gJC5FdmVudCgnc3VibWl0JylcbiAgICAgIHRoaXMuZXEoMCkudHJpZ2dlcihldmVudClcbiAgICAgIGlmICghZXZlbnQuaXNEZWZhdWx0UHJldmVudGVkKCkpIHRoaXMuZ2V0KDApLnN1Ym1pdCgpXG4gICAgfVxuICAgIHJldHVybiB0aGlzXG4gIH1cblxufSkoWmVwdG8pXG5cbjsoZnVuY3Rpb24oJCl7XG4gIC8vIF9fcHJvdG9fXyBkb2Vzbid0IGV4aXN0IG9uIElFPDExLCBzbyByZWRlZmluZVxuICAvLyB0aGUgWiBmdW5jdGlvbiB0byB1c2Ugb2JqZWN0IGV4dGVuc2lvbiBpbnN0ZWFkXG4gIGlmICghKCdfX3Byb3RvX18nIGluIHt9KSkge1xuICAgICQuZXh0ZW5kKCQuemVwdG8sIHtcbiAgICAgIFo6IGZ1bmN0aW9uKGRvbSwgc2VsZWN0b3Ipe1xuICAgICAgICBkb20gPSBkb20gfHwgW11cbiAgICAgICAgJC5leHRlbmQoZG9tLCAkLmZuKVxuICAgICAgICBkb20uc2VsZWN0b3IgPSBzZWxlY3RvciB8fCAnJ1xuICAgICAgICBkb20uX19aID0gdHJ1ZVxuICAgICAgICByZXR1cm4gZG9tXG4gICAgICB9LFxuICAgICAgLy8gdGhpcyBpcyBhIGtsdWRnZSBidXQgd29ya3NcbiAgICAgIGlzWjogZnVuY3Rpb24ob2JqZWN0KXtcbiAgICAgICAgcmV0dXJuICQudHlwZShvYmplY3QpID09PSAnYXJyYXknICYmICdfX1onIGluIG9iamVjdFxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvLyBnZXRDb21wdXRlZFN0eWxlIHNob3VsZG4ndCBmcmVhayBvdXQgd2hlbiBjYWxsZWRcbiAgLy8gd2l0aG91dCBhIHZhbGlkIGVsZW1lbnQgYXMgYXJndW1lbnRcbiAgdHJ5IHtcbiAgICBnZXRDb21wdXRlZFN0eWxlKHVuZGVmaW5lZClcbiAgfSBjYXRjaChlKSB7XG4gICAgdmFyIG5hdGl2ZUdldENvbXB1dGVkU3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlO1xuICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlID0gZnVuY3Rpb24oZWxlbWVudCl7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gbmF0aXZlR2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KVxuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgfVxuICB9XG59KShaZXB0bylcbiIsIi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxudmFyIGlzQXJyYXkgPSByZXF1aXJlKCdpcy1hcnJheScpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MiAvLyBub3QgdXNlZCBieSB0aGlzIGltcGxlbWVudGF0aW9uXG5cbnZhciBrTWF4TGVuZ3RoID0gMHgzZmZmZmZmZlxuXG4vKipcbiAqIElmIGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGA6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChtb3N0IGNvbXBhdGlibGUsIGV2ZW4gSUU2KVxuICpcbiAqIEJyb3dzZXJzIHRoYXQgc3VwcG9ydCB0eXBlZCBhcnJheXMgYXJlIElFIDEwKywgRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKyxcbiAqIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAqXG4gKiBOb3RlOlxuICpcbiAqIC0gSW1wbGVtZW50YXRpb24gbXVzdCBzdXBwb3J0IGFkZGluZyBuZXcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLlxuICogICBGaXJlZm94IDQtMjkgbGFja2VkIHN1cHBvcnQsIGZpeGVkIGluIEZpcmVmb3ggMzArLlxuICogICBTZWU6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOC5cbiAqXG4gKiAgLSBDaHJvbWUgOS0xMCBpcyBtaXNzaW5nIHRoZSBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uLlxuICpcbiAqICAtIElFMTAgaGFzIGEgYnJva2VuIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyBhcnJheXMgb2ZcbiAqICAgIGluY29ycmVjdCBsZW5ndGggaW4gc29tZSBzaXR1YXRpb25zLlxuICpcbiAqIFdlIGRldGVjdCB0aGVzZSBidWdneSBicm93c2VycyBhbmQgc2V0IGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGAgdG8gYGZhbHNlYCBzbyB0aGV5IHdpbGxcbiAqIGdldCB0aGUgT2JqZWN0IGltcGxlbWVudGF0aW9uLCB3aGljaCBpcyBzbG93ZXIgYnV0IHdpbGwgd29yayBjb3JyZWN0bHkuXG4gKi9cbkJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUID0gKGZ1bmN0aW9uICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmIC8vIHR5cGVkIGFycmF5IGluc3RhbmNlcyBjYW4gYmUgYXVnbWVudGVkXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgJiYgLy8gY2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gICAgICAgIG5ldyBVaW50OEFycmF5KDEpLnN1YmFycmF5KDEsIDEpLmJ5dGVMZW5ndGggPT09IDAgLy8gaWUxMCBoYXMgYnJva2VuIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IHN1YmplY3QgPiAwID8gc3ViamVjdCA+Pj4gMCA6IDBcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnKVxuICAgICAgc3ViamVjdCA9IGJhc2U2NGNsZWFuKHN1YmplY3QpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcgJiYgc3ViamVjdCAhPT0gbnVsbCkgeyAvLyBhc3N1bWUgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgICBpZiAoc3ViamVjdC50eXBlID09PSAnQnVmZmVyJyAmJiBpc0FycmF5KHN1YmplY3QuZGF0YSkpXG4gICAgICBzdWJqZWN0ID0gc3ViamVjdC5kYXRhXG4gICAgbGVuZ3RoID0gK3N1YmplY3QubGVuZ3RoID4gMCA/IE1hdGguZmxvb3IoK3N1YmplY3QubGVuZ3RoKSA6IDBcbiAgfSBlbHNlXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbXVzdCBzdGFydCB3aXRoIG51bWJlciwgYnVmZmVyLCBhcnJheSBvciBzdHJpbmcnKVxuXG4gIGlmICh0aGlzLmxlbmd0aCA+IGtNYXhMZW5ndGgpXG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gYWxsb2NhdGUgQnVmZmVyIGxhcmdlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAnc2l6ZTogMHgnICsga01heExlbmd0aC50b1N0cmluZygxNikgKyAnIGJ5dGVzJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSkge1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspXG4gICAgICAgIGJ1ZltpXSA9ICgoc3ViamVjdFtpXSAlIDI1NikgKyAyNTYpICUgMjU2XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPSBudWxsICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuY29tcGFyZSA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIG11c3QgYmUgQnVmZmVycycpXG5cbiAgdmFyIHggPSBhLmxlbmd0aFxuICB2YXIgeSA9IGIubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBNYXRoLm1pbih4LCB5KTsgaSA8IGxlbiAmJiBhW2ldID09PSBiW2ldOyBpKyspIHt9XG4gIGlmIChpICE9PSBsZW4pIHtcbiAgICB4ID0gYVtpXVxuICAgIHkgPSBiW2ldXG4gIH1cbiAgaWYgKHggPCB5KSByZXR1cm4gLTFcbiAgaWYgKHkgPCB4KSByZXR1cm4gMVxuICByZXR1cm4gMFxufVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBpZiAoIWlzQXJyYXkobGlzdCkpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3RbLCBsZW5ndGhdKScpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodG90YWxMZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCA+Pj4gMVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICB9XG4gIHJldHVybiByZXRcbn1cblxuLy8gcHJlLXNldCBmb3IgdmFsdWVzIHRoYXQgbWF5IGV4aXN0IGluIHRoZSBmdXR1cmVcbkJ1ZmZlci5wcm90b3R5cGUubGVuZ3RoID0gdW5kZWZpbmVkXG5CdWZmZXIucHJvdG90eXBlLnBhcmVudCA9IHVuZGVmaW5lZFxuXG4vLyB0b1N0cmluZyhlbmNvZGluZywgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG5cbiAgc3RhcnQgPSBzdGFydCA+Pj4gMFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCB8fCBlbmQgPT09IEluZmluaXR5ID8gdGhpcy5sZW5ndGggOiBlbmQgPj4+IDBcblxuICBpZiAoIWVuY29kaW5nKSBlbmNvZGluZyA9ICd1dGY4J1xuICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoZW5kIDw9IHN0YXJ0KSByZXR1cm4gJydcblxuICB3aGlsZSAodHJ1ZSkge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2hleCc6XG4gICAgICAgIHJldHVybiBoZXhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICd1dGY4JzpcbiAgICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgICAgcmV0dXJuIHV0ZjhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdhc2NpaSc6XG4gICAgICAgIHJldHVybiBhc2NpaVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAgIHJldHVybiBiaW5hcnlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICByZXR1cm4gYmFzZTY0U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndWNzMic6XG4gICAgICBjYXNlICd1Y3MtMic6XG4gICAgICBjYXNlICd1dGYxNmxlJzpcbiAgICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgICAgcmV0dXJuIHV0ZjE2bGVTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobG93ZXJlZENhc2UpXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9IChlbmNvZGluZyArICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChiKSB7XG4gIGlmKCFCdWZmZXIuaXNCdWZmZXIoYikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50IG11c3QgYmUgYSBCdWZmZXInKVxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYikgPT09IDBcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc3RyID0gJydcbiAgdmFyIG1heCA9IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVNcbiAgaWYgKHRoaXMubGVuZ3RoID4gMCkge1xuICAgIHN0ciA9IHRoaXMudG9TdHJpbmcoJ2hleCcsIDAsIG1heCkubWF0Y2goLy57Mn0vZykuam9pbignICcpXG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbWF4KVxuICAgICAgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuZnVuY3Rpb24gaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAoc3RyTGVuICUgMiAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4oYnl0ZSkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBhc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgsIDIpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IGFzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IGJpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG5mdW5jdGlvbiBiYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlbjtcbiAgICBpZiAoc3RhcnQgPCAwKVxuICAgICAgc3RhcnQgPSAwXG4gIH0gZWxzZSBpZiAoc3RhcnQgPiBsZW4pIHtcbiAgICBzdGFydCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IDApIHtcbiAgICBlbmQgKz0gbGVuXG4gICAgaWYgKGVuZCA8IDApXG4gICAgICBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpXG4gICAgZW5kID0gc3RhcnRcblxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vKlxuICogTmVlZCB0byBtYWtlIHN1cmUgdGhhdCBidWZmZXIgaXNuJ3QgdHJ5aW5nIHRvIHdyaXRlIG91dCBvZiBib3VuZHMuXG4gKi9cbmZ1bmN0aW9uIGNoZWNrT2Zmc2V0IChvZmZzZXQsIGV4dCwgbGVuZ3RoKSB7XG4gIGlmICgob2Zmc2V0ICUgMSkgIT09IDAgfHwgb2Zmc2V0IDwgMClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignb2Zmc2V0IGlzIG5vdCB1aW50JylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGxlbmd0aClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVHJ5aW5nIHRvIGFjY2VzcyBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDgpIHwgdGhpc1tvZmZzZXQgKyAxXVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKCh0aGlzW29mZnNldF0pIHxcbiAgICAgICh0aGlzW29mZnNldCArIDFdIDw8IDgpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSkgK1xuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10gKiAweDEwMDAwMDApXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdICogMHgxMDAwMDAwKSArXG4gICAgICAoKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICAgIHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIGlmICghKHRoaXNbb2Zmc2V0XSAmIDB4ODApKVxuICAgIHJldHVybiAodGhpc1tvZmZzZXRdKVxuICByZXR1cm4gKCgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgMV0gfCAodGhpc1tvZmZzZXRdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDNdIDw8IDI0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIGZhbHNlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignYnVmZmVyIG11c3QgYmUgYSBCdWZmZXIgaW5zdGFuY2UnKVxuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ZhbHVlIGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDEsIDB4ZmYsIDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDNdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDQsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDgsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxuICByZXR1cm4gb2Zmc2V0ICsgOFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBpZiAodGFyZ2V0X3N0YXJ0IDwgMCB8fCB0YXJnZXRfc3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aClcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSBzb3VyY2UubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gc291cmNlLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAwIHx8ICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gdmFsdWVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGJ5dGVzID0gdXRmOFRvQnl0ZXModmFsdWUudG9TdHJpbmcoKSlcbiAgICB2YXIgbGVuID0gYnl0ZXMubGVuZ3RoXG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IGJ5dGVzW2kgJSBsZW5dXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKSB7XG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLmNvbnN0cnVjdG9yID0gQnVmZmVyXG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5lcXVhbHMgPSBCUC5lcXVhbHNcbiAgYXJyLmNvbXBhcmUgPSBCUC5jb21wYXJlXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG52YXIgSU5WQUxJRF9CQVNFNjRfUkUgPSAvW14rXFwvMC05QS16XS9nXG5cbmZ1bmN0aW9uIGJhc2U2NGNsZWFuIChzdHIpIHtcbiAgLy8gTm9kZSBzdHJpcHMgb3V0IGludmFsaWQgY2hhcmFjdGVycyBsaWtlIFxcbiBhbmQgXFx0IGZyb20gdGhlIHN0cmluZywgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHN0ciA9IHN0cmluZ3RyaW0oc3RyKS5yZXBsYWNlKElOVkFMSURfQkFTRTY0X1JFLCAnJylcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3Rikge1xuICAgICAgYnl0ZUFycmF5LnB1c2goYilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKykge1xuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoLCB1bml0U2l6ZSkge1xuICBpZiAodW5pdFNpemUpIGxlbmd0aCAtPSBsZW5ndGggJSB1bml0U2l6ZTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG4iLCJcInVzZSBzdHJpY3RcIlxyXG5cclxudmFyIGNyZWF0ZVRodW5rID0gcmVxdWlyZShcIi4vbGliL3RodW5rLmpzXCIpXHJcblxyXG5mdW5jdGlvbiBQcm9jZWR1cmUoKSB7XHJcbiAgdGhpcy5hcmdUeXBlcyA9IFtdXHJcbiAgdGhpcy5zaGltQXJncyA9IFtdXHJcbiAgdGhpcy5hcnJheUFyZ3MgPSBbXVxyXG4gIHRoaXMuYXJyYXlCbG9ja0luZGljZXMgPSBbXVxyXG4gIHRoaXMuc2NhbGFyQXJncyA9IFtdXHJcbiAgdGhpcy5vZmZzZXRBcmdzID0gW11cclxuICB0aGlzLm9mZnNldEFyZ0luZGV4ID0gW11cclxuICB0aGlzLmluZGV4QXJncyA9IFtdXHJcbiAgdGhpcy5zaGFwZUFyZ3MgPSBbXVxyXG4gIHRoaXMuZnVuY05hbWUgPSBcIlwiXHJcbiAgdGhpcy5wcmUgPSBudWxsXHJcbiAgdGhpcy5ib2R5ID0gbnVsbFxyXG4gIHRoaXMucG9zdCA9IG51bGxcclxuICB0aGlzLmRlYnVnID0gZmFsc2VcclxufVxyXG5cclxuZnVuY3Rpb24gY29tcGlsZUN3aXNlKHVzZXJfYXJncykge1xyXG4gIC8vQ3JlYXRlIHByb2NlZHVyZVxyXG4gIHZhciBwcm9jID0gbmV3IFByb2NlZHVyZSgpXHJcbiAgXHJcbiAgLy9QYXJzZSBibG9ja3NcclxuICBwcm9jLnByZSAgICA9IHVzZXJfYXJncy5wcmVcclxuICBwcm9jLmJvZHkgICA9IHVzZXJfYXJncy5ib2R5XHJcbiAgcHJvYy5wb3N0ICAgPSB1c2VyX2FyZ3MucG9zdFxyXG5cclxuICAvL1BhcnNlIGFyZ3VtZW50c1xyXG4gIHZhciBwcm9jX2FyZ3MgPSB1c2VyX2FyZ3MuYXJncy5zbGljZSgwKVxyXG4gIHByb2MuYXJnVHlwZXMgPSBwcm9jX2FyZ3NcclxuICBmb3IodmFyIGk9MDsgaTxwcm9jX2FyZ3MubGVuZ3RoOyArK2kpIHtcclxuICAgIHZhciBhcmdfdHlwZSA9IHByb2NfYXJnc1tpXVxyXG4gICAgaWYoYXJnX3R5cGUgPT09IFwiYXJyYXlcIiB8fCAodHlwZW9mIGFyZ190eXBlID09PSBcIm9iamVjdFwiICYmIGFyZ190eXBlLmJsb2NrSW5kaWNlcykpIHtcclxuICAgICAgcHJvYy5hcmdUeXBlc1tpXSA9IFwiYXJyYXlcIlxyXG4gICAgICBwcm9jLmFycmF5QXJncy5wdXNoKGkpXHJcbiAgICAgIHByb2MuYXJyYXlCbG9ja0luZGljZXMucHVzaChhcmdfdHlwZS5ibG9ja0luZGljZXMgPyBhcmdfdHlwZS5ibG9ja0luZGljZXMgOiAwKVxyXG4gICAgICBwcm9jLnNoaW1BcmdzLnB1c2goXCJhcnJheVwiICsgaSlcclxuICAgICAgaWYoaSA8IHByb2MucHJlLmFyZ3MubGVuZ3RoICYmIHByb2MucHJlLmFyZ3NbaV0uY291bnQ+MCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImN3aXNlOiBwcmUoKSBibG9jayBtYXkgbm90IHJlZmVyZW5jZSBhcnJheSBhcmdzXCIpXHJcbiAgICAgIH1cclxuICAgICAgaWYoaSA8IHByb2MucG9zdC5hcmdzLmxlbmd0aCAmJiBwcm9jLnBvc3QuYXJnc1tpXS5jb3VudD4wKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY3dpc2U6IHBvc3QoKSBibG9jayBtYXkgbm90IHJlZmVyZW5jZSBhcnJheSBhcmdzXCIpXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZihhcmdfdHlwZSA9PT0gXCJzY2FsYXJcIikge1xyXG4gICAgICBwcm9jLnNjYWxhckFyZ3MucHVzaChpKVxyXG4gICAgICBwcm9jLnNoaW1BcmdzLnB1c2goXCJzY2FsYXJcIiArIGkpXHJcbiAgICB9IGVsc2UgaWYoYXJnX3R5cGUgPT09IFwiaW5kZXhcIikge1xyXG4gICAgICBwcm9jLmluZGV4QXJncy5wdXNoKGkpXHJcbiAgICAgIGlmKGkgPCBwcm9jLnByZS5hcmdzLmxlbmd0aCAmJiBwcm9jLnByZS5hcmdzW2ldLmNvdW50ID4gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImN3aXNlOiBwcmUoKSBibG9jayBtYXkgbm90IHJlZmVyZW5jZSBhcnJheSBpbmRleFwiKVxyXG4gICAgICB9XHJcbiAgICAgIGlmKGkgPCBwcm9jLmJvZHkuYXJncy5sZW5ndGggJiYgcHJvYy5ib2R5LmFyZ3NbaV0ubHZhbHVlKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY3dpc2U6IGJvZHkoKSBibG9jayBtYXkgbm90IHdyaXRlIHRvIGFycmF5IGluZGV4XCIpXHJcbiAgICAgIH1cclxuICAgICAgaWYoaSA8IHByb2MucG9zdC5hcmdzLmxlbmd0aCAmJiBwcm9jLnBvc3QuYXJnc1tpXS5jb3VudCA+IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJjd2lzZTogcG9zdCgpIGJsb2NrIG1heSBub3QgcmVmZXJlbmNlIGFycmF5IGluZGV4XCIpXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZihhcmdfdHlwZSA9PT0gXCJzaGFwZVwiKSB7XHJcbiAgICAgIHByb2Muc2hhcGVBcmdzLnB1c2goaSlcclxuICAgICAgaWYoaSA8IHByb2MucHJlLmFyZ3MubGVuZ3RoICYmIHByb2MucHJlLmFyZ3NbaV0ubHZhbHVlKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY3dpc2U6IHByZSgpIGJsb2NrIG1heSBub3Qgd3JpdGUgdG8gYXJyYXkgc2hhcGVcIilcclxuICAgICAgfVxyXG4gICAgICBpZihpIDwgcHJvYy5ib2R5LmFyZ3MubGVuZ3RoICYmIHByb2MuYm9keS5hcmdzW2ldLmx2YWx1ZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImN3aXNlOiBib2R5KCkgYmxvY2sgbWF5IG5vdCB3cml0ZSB0byBhcnJheSBzaGFwZVwiKVxyXG4gICAgICB9XHJcbiAgICAgIGlmKGkgPCBwcm9jLnBvc3QuYXJncy5sZW5ndGggJiYgcHJvYy5wb3N0LmFyZ3NbaV0ubHZhbHVlKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY3dpc2U6IHBvc3QoKSBibG9jayBtYXkgbm90IHdyaXRlIHRvIGFycmF5IHNoYXBlXCIpXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZih0eXBlb2YgYXJnX3R5cGUgPT09IFwib2JqZWN0XCIgJiYgYXJnX3R5cGUub2Zmc2V0KSB7XHJcbiAgICAgIHByb2MuYXJnVHlwZXNbaV0gPSBcIm9mZnNldFwiXHJcbiAgICAgIHByb2Mub2Zmc2V0QXJncy5wdXNoKHsgYXJyYXk6IGFyZ190eXBlLmFycmF5LCBvZmZzZXQ6YXJnX3R5cGUub2Zmc2V0IH0pXHJcbiAgICAgIHByb2Mub2Zmc2V0QXJnSW5kZXgucHVzaChpKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY3dpc2U6IFVua25vd24gYXJndW1lbnQgdHlwZSBcIiArIHByb2NfYXJnc1tpXSlcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgLy9NYWtlIHN1cmUgYXQgbGVhc3Qgb25lIGFycmF5IGFyZ3VtZW50IHdhcyBzcGVjaWZpZWRcclxuICBpZihwcm9jLmFycmF5QXJncy5sZW5ndGggPD0gMCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiY3dpc2U6IE5vIGFycmF5IGFyZ3VtZW50cyBzcGVjaWZpZWRcIilcclxuICB9XHJcbiAgXHJcbiAgLy9NYWtlIHN1cmUgYXJndW1lbnRzIGFyZSBjb3JyZWN0XHJcbiAgaWYocHJvYy5wcmUuYXJncy5sZW5ndGggPiBwcm9jX2FyZ3MubGVuZ3RoKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJjd2lzZTogVG9vIG1hbnkgYXJndW1lbnRzIGluIHByZSgpIGJsb2NrXCIpXHJcbiAgfVxyXG4gIGlmKHByb2MuYm9keS5hcmdzLmxlbmd0aCA+IHByb2NfYXJncy5sZW5ndGgpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcImN3aXNlOiBUb28gbWFueSBhcmd1bWVudHMgaW4gYm9keSgpIGJsb2NrXCIpXHJcbiAgfVxyXG4gIGlmKHByb2MucG9zdC5hcmdzLmxlbmd0aCA+IHByb2NfYXJncy5sZW5ndGgpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcImN3aXNlOiBUb28gbWFueSBhcmd1bWVudHMgaW4gcG9zdCgpIGJsb2NrXCIpXHJcbiAgfVxyXG5cclxuICAvL0NoZWNrIGRlYnVnIGZsYWdcclxuICBwcm9jLmRlYnVnID0gISF1c2VyX2FyZ3MucHJpbnRDb2RlIHx8ICEhdXNlcl9hcmdzLmRlYnVnXHJcbiAgXHJcbiAgLy9SZXRyaWV2ZSBuYW1lXHJcbiAgcHJvYy5mdW5jTmFtZSA9IHVzZXJfYXJncy5mdW5jTmFtZSB8fCBcImN3aXNlXCJcclxuICBcclxuICAvL1JlYWQgaW4gYmxvY2sgc2l6ZVxyXG4gIHByb2MuYmxvY2tTaXplID0gdXNlcl9hcmdzLmJsb2NrU2l6ZSB8fCA2NFxyXG5cclxuICByZXR1cm4gY3JlYXRlVGh1bmsocHJvYylcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBjb21waWxlQ3dpc2VcclxuIiwiXCJ1c2Ugc3RyaWN0XCJcclxuXHJcbnZhciB1bmlxID0gcmVxdWlyZShcInVuaXFcIilcclxuXHJcbi8vIFRoaXMgZnVuY3Rpb24gZ2VuZXJhdGVzIHZlcnkgc2ltcGxlIGxvb3BzIGFuYWxvZ291cyB0byBob3cgeW91IHR5cGljYWxseSB0cmF2ZXJzZSBhcnJheXMgKHRoZSBvdXRlcm1vc3QgbG9vcCBjb3JyZXNwb25kcyB0byB0aGUgc2xvd2VzdCBjaGFuZ2luZyBpbmRleCwgdGhlIGlubmVybW9zdCBsb29wIHRvIHRoZSBmYXN0ZXN0IGNoYW5naW5nIGluZGV4KVxyXG4vLyBUT0RPOiBJZiB0d28gYXJyYXlzIGhhdmUgdGhlIHNhbWUgc3RyaWRlcyAoYW5kIG9mZnNldHMpIHRoZXJlIGlzIHBvdGVudGlhbCBmb3IgZGVjcmVhc2luZyB0aGUgbnVtYmVyIG9mIFwicG9pbnRlcnNcIiBhbmQgcmVsYXRlZCB2YXJpYWJsZXMuIFRoZSBkcmF3YmFjayBpcyB0aGF0IHRoZSB0eXBlIHNpZ25hdHVyZSB3b3VsZCBiZWNvbWUgbW9yZSBzcGVjaWZpYyBhbmQgdGhhdCB0aGVyZSB3b3VsZCB0aHVzIGJlIGxlc3MgcG90ZW50aWFsIGZvciBjYWNoaW5nLCBidXQgaXQgbWlnaHQgc3RpbGwgYmUgd29ydGggaXQsIGVzcGVjaWFsbHkgd2hlbiBkZWFsaW5nIHdpdGggbGFyZ2UgbnVtYmVycyBvZiBhcmd1bWVudHMuXHJcbmZ1bmN0aW9uIGlubmVyRmlsbChvcmRlciwgcHJvYywgYm9keSkge1xyXG4gIHZhciBkaW1lbnNpb24gPSBvcmRlci5sZW5ndGhcclxuICAgICwgbmFyZ3MgPSBwcm9jLmFycmF5QXJncy5sZW5ndGhcclxuICAgICwgaGFzX2luZGV4ID0gcHJvYy5pbmRleEFyZ3MubGVuZ3RoPjBcclxuICAgICwgY29kZSA9IFtdXHJcbiAgICAsIHZhcnMgPSBbXVxyXG4gICAgLCBpZHg9MCwgcGlkeD0wLCBpLCBqXHJcbiAgZm9yKGk9MDsgaTxkaW1lbnNpb247ICsraSkgeyAvLyBJdGVyYXRpb24gdmFyaWFibGVzXHJcbiAgICB2YXJzLnB1c2goW1wiaVwiLGksXCI9MFwiXS5qb2luKFwiXCIpKVxyXG4gIH1cclxuICAvL0NvbXB1dGUgc2NhbiBkZWx0YXNcclxuICBmb3Ioaj0wOyBqPG5hcmdzOyArK2opIHtcclxuICAgIGZvcihpPTA7IGk8ZGltZW5zaW9uOyArK2kpIHtcclxuICAgICAgcGlkeCA9IGlkeFxyXG4gICAgICBpZHggPSBvcmRlcltpXVxyXG4gICAgICBpZihpID09PSAwKSB7IC8vIFRoZSBpbm5lcm1vc3QvZmFzdGVzdCBkaW1lbnNpb24ncyBkZWx0YSBpcyBzaW1wbHkgaXRzIHN0cmlkZVxyXG4gICAgICAgIHZhcnMucHVzaChbXCJkXCIsaixcInNcIixpLFwiPXRcIixqLFwicFwiLGlkeF0uam9pbihcIlwiKSlcclxuICAgICAgfSBlbHNlIHsgLy8gRm9yIG90aGVyIGRpbWVuc2lvbnMgdGhlIGRlbHRhIGlzIGJhc2ljYWxseSB0aGUgc3RyaWRlIG1pbnVzIHNvbWV0aGluZyB3aGljaCBlc3NlbnRpYWxseSBcInJld2luZHNcIiB0aGUgcHJldmlvdXMgKG1vcmUgaW5uZXIpIGRpbWVuc2lvblxyXG4gICAgICAgIHZhcnMucHVzaChbXCJkXCIsaixcInNcIixpLFwiPSh0XCIsaixcInBcIixpZHgsXCItc1wiLHBpZHgsXCIqdFwiLGosXCJwXCIscGlkeCxcIilcIl0uam9pbihcIlwiKSlcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICBjb2RlLnB1c2goXCJ2YXIgXCIgKyB2YXJzLmpvaW4oXCIsXCIpKVxyXG4gIC8vU2NhbiBsb29wXHJcbiAgZm9yKGk9ZGltZW5zaW9uLTE7IGk+PTA7IC0taSkgeyAvLyBTdGFydCBhdCBsYXJnZXN0IHN0cmlkZSBhbmQgd29yayB5b3VyIHdheSBpbndhcmRzXHJcbiAgICBpZHggPSBvcmRlcltpXVxyXG4gICAgY29kZS5wdXNoKFtcImZvcihpXCIsaSxcIj0wO2lcIixpLFwiPHNcIixpZHgsXCI7KytpXCIsaSxcIil7XCJdLmpvaW4oXCJcIikpXHJcbiAgfVxyXG4gIC8vUHVzaCBib2R5IG9mIGlubmVyIGxvb3BcclxuICBjb2RlLnB1c2goYm9keSlcclxuICAvL0FkdmFuY2Ugc2NhbiBwb2ludGVyc1xyXG4gIGZvcihpPTA7IGk8ZGltZW5zaW9uOyArK2kpIHtcclxuICAgIHBpZHggPSBpZHhcclxuICAgIGlkeCA9IG9yZGVyW2ldXHJcbiAgICBmb3Ioaj0wOyBqPG5hcmdzOyArK2opIHtcclxuICAgICAgY29kZS5wdXNoKFtcInBcIixqLFwiKz1kXCIsaixcInNcIixpXS5qb2luKFwiXCIpKVxyXG4gICAgfVxyXG4gICAgaWYoaGFzX2luZGV4KSB7XHJcbiAgICAgIGlmKGkgPiAwKSB7XHJcbiAgICAgICAgY29kZS5wdXNoKFtcImluZGV4W1wiLHBpZHgsXCJdLT1zXCIscGlkeF0uam9pbihcIlwiKSlcclxuICAgICAgfVxyXG4gICAgICBjb2RlLnB1c2goW1wiKytpbmRleFtcIixpZHgsXCJdXCJdLmpvaW4oXCJcIikpXHJcbiAgICB9XHJcbiAgICBjb2RlLnB1c2goXCJ9XCIpXHJcbiAgfVxyXG4gIHJldHVybiBjb2RlLmpvaW4oXCJcXG5cIilcclxufVxyXG5cclxuLy8gR2VuZXJhdGUgXCJvdXRlclwiIGxvb3BzIHRoYXQgbG9vcCBvdmVyIGJsb2NrcyBvZiBkYXRhLCBhcHBseWluZyBcImlubmVyXCIgbG9vcHMgdG8gdGhlIGJsb2NrcyBieSBtYW5pcHVsYXRpbmcgdGhlIGxvY2FsIHZhcmlhYmxlcyBpbiBzdWNoIGEgd2F5IHRoYXQgdGhlIGlubmVyIGxvb3Agb25seSBcInNlZXNcIiB0aGUgY3VycmVudCBibG9jay5cclxuLy8gVE9ETzogSWYgdGhpcyBpcyB1c2VkLCB0aGVuIHRoZSBwcmV2aW91cyBkZWNsYXJhdGlvbiAoZG9uZSBieSBnZW5lcmF0ZUN3aXNlT3ApIG9mIHMqIGlzIGVzc2VudGlhbGx5IHVubmVjZXNzYXJ5LlxyXG4vLyAgICAgICBJIGJlbGlldmUgdGhlIHMqIGFyZSBub3QgdXNlZCBlbHNld2hlcmUgKGluIHBhcnRpY3VsYXIsIEkgZG9uJ3QgdGhpbmsgdGhleSdyZSB1c2VkIGluIHRoZSBwcmUvcG9zdCBwYXJ0cyBhbmQgXCJzaGFwZVwiIGlzIGRlZmluZWQgaW5kZXBlbmRlbnRseSksIHNvIGl0IHdvdWxkIGJlIHBvc3NpYmxlIHRvIG1ha2UgZGVmaW5pbmcgdGhlIHMqIGRlcGVuZGVudCBvbiB3aGF0IGxvb3AgbWV0aG9kIGlzIGJlaW5nIHVzZWQuXHJcbmZ1bmN0aW9uIG91dGVyRmlsbChtYXRjaGVkLCBvcmRlciwgcHJvYywgYm9keSkge1xyXG4gIHZhciBkaW1lbnNpb24gPSBvcmRlci5sZW5ndGhcclxuICAgICwgbmFyZ3MgPSBwcm9jLmFycmF5QXJncy5sZW5ndGhcclxuICAgICwgYmxvY2tTaXplID0gcHJvYy5ibG9ja1NpemVcclxuICAgICwgaGFzX2luZGV4ID0gcHJvYy5pbmRleEFyZ3MubGVuZ3RoID4gMFxyXG4gICAgLCBjb2RlID0gW11cclxuICBmb3IodmFyIGk9MDsgaTxuYXJnczsgKytpKSB7XHJcbiAgICBjb2RlLnB1c2goW1widmFyIG9mZnNldFwiLGksXCI9cFwiLGldLmpvaW4oXCJcIikpXHJcbiAgfVxyXG4gIC8vR2VuZXJhdGUgbG9vcHMgZm9yIHVubWF0Y2hlZCBkaW1lbnNpb25zXHJcbiAgLy8gVGhlIG9yZGVyIGluIHdoaWNoIHRoZXNlIGRpbWVuc2lvbnMgYXJlIHRyYXZlcnNlZCBpcyBmYWlybHkgYXJiaXRyYXJ5IChmcm9tIHNtYWxsIHN0cmlkZSB0byBsYXJnZSBzdHJpZGUsIGZvciB0aGUgZmlyc3QgYXJndW1lbnQpXHJcbiAgLy8gVE9ETzogSXQgd291bGQgYmUgbmljZSBpZiB0aGUgb3JkZXIgaW4gd2hpY2ggdGhlc2UgbG9vcHMgYXJlIHBsYWNlZCB3b3VsZCBhbHNvIGJlIHNvbWVob3cgXCJvcHRpbWFsXCIgKGF0IHRoZSB2ZXJ5IGxlYXN0IHdlIHNob3VsZCBjaGVjayB0aGF0IGl0IHJlYWxseSBkb2Vzbid0IGh1cnQgdXMgaWYgdGhleSdyZSBub3QpLlxyXG4gIGZvcih2YXIgaT1tYXRjaGVkOyBpPGRpbWVuc2lvbjsgKytpKSB7XHJcbiAgICBjb2RlLnB1c2goW1wiZm9yKHZhciBqXCIraStcIj1TU1tcIiwgb3JkZXJbaV0sIFwiXXwwO2pcIiwgaSwgXCI+MDspe1wiXS5qb2luKFwiXCIpKSAvLyBJdGVyYXRlIGJhY2sgdG8gZnJvbnRcclxuICAgIGNvZGUucHVzaChbXCJpZihqXCIsaSxcIjxcIixibG9ja1NpemUsXCIpe1wiXS5qb2luKFwiXCIpKSAvLyBFaXRoZXIgZGVjcmVhc2UgaiBieSBibG9ja1NpemUgKHMgPSBibG9ja1NpemUpLCBvciBzZXQgaXQgdG8gemVybyAoYWZ0ZXIgc2V0dGluZyBzID0gaikuXHJcbiAgICBjb2RlLnB1c2goW1wic1wiLG9yZGVyW2ldLFwiPWpcIixpXS5qb2luKFwiXCIpKVxyXG4gICAgY29kZS5wdXNoKFtcImpcIixpLFwiPTBcIl0uam9pbihcIlwiKSlcclxuICAgIGNvZGUucHVzaChbXCJ9ZWxzZXtzXCIsb3JkZXJbaV0sXCI9XCIsYmxvY2tTaXplXS5qb2luKFwiXCIpKVxyXG4gICAgY29kZS5wdXNoKFtcImpcIixpLFwiLT1cIixibG9ja1NpemUsXCJ9XCJdLmpvaW4oXCJcIikpXHJcbiAgICBpZihoYXNfaW5kZXgpIHtcclxuICAgICAgY29kZS5wdXNoKFtcImluZGV4W1wiLG9yZGVyW2ldLFwiXT1qXCIsaV0uam9pbihcIlwiKSlcclxuICAgIH1cclxuICB9XHJcbiAgZm9yKHZhciBpPTA7IGk8bmFyZ3M7ICsraSkge1xyXG4gICAgdmFyIGluZGV4U3RyID0gW1wib2Zmc2V0XCIraV1cclxuICAgIGZvcih2YXIgaj1tYXRjaGVkOyBqPGRpbWVuc2lvbjsgKytqKSB7XHJcbiAgICAgIGluZGV4U3RyLnB1c2goW1wialwiLGosXCIqdFwiLGksXCJwXCIsb3JkZXJbal1dLmpvaW4oXCJcIikpXHJcbiAgICB9XHJcbiAgICBjb2RlLnB1c2goW1wicFwiLGksXCI9KFwiLGluZGV4U3RyLmpvaW4oXCIrXCIpLFwiKVwiXS5qb2luKFwiXCIpKVxyXG4gIH1cclxuICBjb2RlLnB1c2goaW5uZXJGaWxsKG9yZGVyLCBwcm9jLCBib2R5KSlcclxuICBmb3IodmFyIGk9bWF0Y2hlZDsgaTxkaW1lbnNpb247ICsraSkge1xyXG4gICAgY29kZS5wdXNoKFwifVwiKVxyXG4gIH1cclxuICByZXR1cm4gY29kZS5qb2luKFwiXFxuXCIpXHJcbn1cclxuXHJcbi8vQ291bnQgdGhlIG51bWJlciBvZiBjb21wYXRpYmxlIGlubmVyIG9yZGVyc1xyXG4vLyBUaGlzIGlzIHRoZSBsZW5ndGggb2YgdGhlIGxvbmdlc3QgY29tbW9uIHByZWZpeCBvZiB0aGUgYXJyYXlzIGluIG9yZGVycy5cclxuLy8gRWFjaCBhcnJheSBpbiBvcmRlcnMgbGlzdHMgdGhlIGRpbWVuc2lvbnMgb2YgdGhlIGNvcnJlc3BvbmQgbmRhcnJheSBpbiBvcmRlciBvZiBpbmNyZWFzaW5nIHN0cmlkZS5cclxuLy8gVGhpcyBpcyB0aHVzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBkaW1lbnNpb25zIHRoYXQgY2FuIGJlIGVmZmljaWVudGx5IHRyYXZlcnNlZCBieSBzaW1wbGUgbmVzdGVkIGxvb3BzIGZvciBhbGwgYXJyYXlzLlxyXG5mdW5jdGlvbiBjb3VudE1hdGNoZXMob3JkZXJzKSB7XHJcbiAgdmFyIG1hdGNoZWQgPSAwLCBkaW1lbnNpb24gPSBvcmRlcnNbMF0ubGVuZ3RoXHJcbiAgd2hpbGUobWF0Y2hlZCA8IGRpbWVuc2lvbikge1xyXG4gICAgZm9yKHZhciBqPTE7IGo8b3JkZXJzLmxlbmd0aDsgKytqKSB7XHJcbiAgICAgIGlmKG9yZGVyc1tqXVttYXRjaGVkXSAhPT0gb3JkZXJzWzBdW21hdGNoZWRdKSB7XHJcbiAgICAgICAgcmV0dXJuIG1hdGNoZWRcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgKyttYXRjaGVkXHJcbiAgfVxyXG4gIHJldHVybiBtYXRjaGVkXHJcbn1cclxuXHJcbi8vUHJvY2Vzc2VzIGEgYmxvY2sgYWNjb3JkaW5nIHRvIHRoZSBnaXZlbiBkYXRhIHR5cGVzXHJcbi8vIFJlcGxhY2VzIHZhcmlhYmxlIG5hbWVzIGJ5IGRpZmZlcmVudCBvbmVzLCBlaXRoZXIgXCJsb2NhbFwiIG9uZXMgKHRoYXQgYXJlIHRoZW4gZmVycmllZCBpbiBhbmQgb3V0IG9mIHRoZSBnaXZlbiBhcnJheSkgb3Igb25lcyBtYXRjaGluZyB0aGUgYXJndW1lbnRzIHRoYXQgdGhlIGZ1bmN0aW9uIHBlcmZvcm1pbmcgdGhlIHVsdGltYXRlIGxvb3Agd2lsbCBhY2NlcHQuXHJcbmZ1bmN0aW9uIHByb2Nlc3NCbG9jayhibG9jaywgcHJvYywgZHR5cGVzKSB7XHJcbiAgdmFyIGNvZGUgPSBibG9jay5ib2R5XHJcbiAgdmFyIHByZSA9IFtdXHJcbiAgdmFyIHBvc3QgPSBbXVxyXG4gIGZvcih2YXIgaT0wOyBpPGJsb2NrLmFyZ3MubGVuZ3RoOyArK2kpIHtcclxuICAgIHZhciBjYXJnID0gYmxvY2suYXJnc1tpXVxyXG4gICAgaWYoY2FyZy5jb3VudCA8PSAwKSB7XHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKGNhcmcubmFtZSwgXCJnXCIpXHJcbiAgICB2YXIgcHRyU3RyID0gXCJcIlxyXG4gICAgdmFyIGFyck51bSA9IHByb2MuYXJyYXlBcmdzLmluZGV4T2YoaSlcclxuICAgIHN3aXRjaChwcm9jLmFyZ1R5cGVzW2ldKSB7XHJcbiAgICAgIGNhc2UgXCJvZmZzZXRcIjpcclxuICAgICAgICB2YXIgb2ZmQXJnSW5kZXggPSBwcm9jLm9mZnNldEFyZ0luZGV4LmluZGV4T2YoaSlcclxuICAgICAgICB2YXIgb2ZmQXJnID0gcHJvYy5vZmZzZXRBcmdzW29mZkFyZ0luZGV4XVxyXG4gICAgICAgIGFyck51bSA9IG9mZkFyZy5hcnJheVxyXG4gICAgICAgIHB0clN0ciA9IFwiK3FcIiArIG9mZkFyZ0luZGV4IC8vIEFkZHMgb2Zmc2V0IHRvIHRoZSBcInBvaW50ZXJcIiBpbiB0aGUgYXJyYXlcclxuICAgICAgY2FzZSBcImFycmF5XCI6XHJcbiAgICAgICAgcHRyU3RyID0gXCJwXCIgKyBhcnJOdW0gKyBwdHJTdHJcclxuICAgICAgICB2YXIgbG9jYWxTdHIgPSBcImxcIiArIGlcclxuICAgICAgICB2YXIgYXJyU3RyID0gXCJhXCIgKyBhcnJOdW1cclxuICAgICAgICBpZiAocHJvYy5hcnJheUJsb2NrSW5kaWNlc1thcnJOdW1dID09PSAwKSB7IC8vIEFyZ3VtZW50IHRvIGJvZHkgaXMganVzdCBhIHNpbmdsZSB2YWx1ZSBmcm9tIHRoaXMgYXJyYXlcclxuICAgICAgICAgIGlmKGNhcmcuY291bnQgPT09IDEpIHsgLy8gQXJndW1lbnQvYXJyYXkgdXNlZCBvbmx5IG9uY2UoPylcclxuICAgICAgICAgICAgaWYoZHR5cGVzW2Fyck51bV0gPT09IFwiZ2VuZXJpY1wiKSB7XHJcbiAgICAgICAgICAgICAgaWYoY2FyZy5sdmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHByZS5wdXNoKFtcInZhciBcIiwgbG9jYWxTdHIsIFwiPVwiLCBhcnJTdHIsIFwiLmdldChcIiwgcHRyU3RyLCBcIilcIl0uam9pbihcIlwiKSkgLy8gSXMgdGhpcyBuZWNlc3NhcnkgaWYgdGhlIGFyZ3VtZW50IGlzIE9OTFkgdXNlZCBhcyBhbiBsdmFsdWU/IChrZWVwIGluIG1pbmQgdGhhdCB3ZSBjYW4gaGF2ZSBhICs9IHNvbWV0aGluZywgc28gd2Ugd291bGQgYWN0dWFsbHkgbmVlZCB0byBjaGVjayBjYXJnLnJ2YWx1ZSlcclxuICAgICAgICAgICAgICAgIGNvZGUgPSBjb2RlLnJlcGxhY2UocmUsIGxvY2FsU3RyKVxyXG4gICAgICAgICAgICAgICAgcG9zdC5wdXNoKFthcnJTdHIsIFwiLnNldChcIiwgcHRyU3RyLCBcIixcIiwgbG9jYWxTdHIsXCIpXCJdLmpvaW4oXCJcIikpXHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvZGUgPSBjb2RlLnJlcGxhY2UocmUsIFthcnJTdHIsIFwiLmdldChcIiwgcHRyU3RyLCBcIilcIl0uam9pbihcIlwiKSlcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgY29kZSA9IGNvZGUucmVwbGFjZShyZSwgW2FyclN0ciwgXCJbXCIsIHB0clN0ciwgXCJdXCJdLmpvaW4oXCJcIikpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSBpZihkdHlwZXNbYXJyTnVtXSA9PT0gXCJnZW5lcmljXCIpIHtcclxuICAgICAgICAgICAgcHJlLnB1c2goW1widmFyIFwiLCBsb2NhbFN0ciwgXCI9XCIsIGFyclN0ciwgXCIuZ2V0KFwiLCBwdHJTdHIsIFwiKVwiXS5qb2luKFwiXCIpKSAvLyBUT0RPOiBDb3VsZCB3ZSBvcHRpbWl6ZSBieSBjaGVja2luZyBmb3IgY2FyZy5ydmFsdWU/XHJcbiAgICAgICAgICAgIGNvZGUgPSBjb2RlLnJlcGxhY2UocmUsIGxvY2FsU3RyKVxyXG4gICAgICAgICAgICBpZihjYXJnLmx2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIHBvc3QucHVzaChbYXJyU3RyLCBcIi5zZXQoXCIsIHB0clN0ciwgXCIsXCIsIGxvY2FsU3RyLFwiKVwiXS5qb2luKFwiXCIpKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBwcmUucHVzaChbXCJ2YXIgXCIsIGxvY2FsU3RyLCBcIj1cIiwgYXJyU3RyLCBcIltcIiwgcHRyU3RyLCBcIl1cIl0uam9pbihcIlwiKSkgLy8gVE9ETzogQ291bGQgd2Ugb3B0aW1pemUgYnkgY2hlY2tpbmcgZm9yIGNhcmcucnZhbHVlP1xyXG4gICAgICAgICAgICBjb2RlID0gY29kZS5yZXBsYWNlKHJlLCBsb2NhbFN0cilcclxuICAgICAgICAgICAgaWYoY2FyZy5sdmFsdWUpIHtcclxuICAgICAgICAgICAgICBwb3N0LnB1c2goW2FyclN0ciwgXCJbXCIsIHB0clN0ciwgXCJdPVwiLCBsb2NhbFN0cl0uam9pbihcIlwiKSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7IC8vIEFyZ3VtZW50IHRvIGJvZHkgaXMgYSBcImJsb2NrXCJcclxuICAgICAgICAgIHZhciByZVN0ckFyciA9IFtjYXJnLm5hbWVdLCBwdHJTdHJBcnIgPSBbcHRyU3RyXVxyXG4gICAgICAgICAgZm9yKHZhciBqPTA7IGo8TWF0aC5hYnMocHJvYy5hcnJheUJsb2NrSW5kaWNlc1thcnJOdW1dKTsgaisrKSB7XHJcbiAgICAgICAgICAgIHJlU3RyQXJyLnB1c2goXCJcXFxccypcXFxcWyhbXlxcXFxdXSspXFxcXF1cIilcclxuICAgICAgICAgICAgcHRyU3RyQXJyLnB1c2goXCIkXCIgKyAoaisxKSArIFwiKnRcIiArIGFyck51bSArIFwiYlwiICsgaikgLy8gTWF0Y2hlZCBpbmRleCB0aW1lcyBzdHJpZGVcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChyZVN0ckFyci5qb2luKFwiXCIpLCBcImdcIilcclxuICAgICAgICAgIHB0clN0ciA9IHB0clN0ckFyci5qb2luKFwiK1wiKVxyXG4gICAgICAgICAgaWYoZHR5cGVzW2Fyck51bV0gPT09IFwiZ2VuZXJpY1wiKSB7XHJcbiAgICAgICAgICAgIC8qaWYoY2FyZy5sdmFsdWUpIHtcclxuICAgICAgICAgICAgICBwcmUucHVzaChbXCJ2YXIgXCIsIGxvY2FsU3RyLCBcIj1cIiwgYXJyU3RyLCBcIi5nZXQoXCIsIHB0clN0ciwgXCIpXCJdLmpvaW4oXCJcIikpIC8vIElzIHRoaXMgbmVjZXNzYXJ5IGlmIHRoZSBhcmd1bWVudCBpcyBPTkxZIHVzZWQgYXMgYW4gbHZhbHVlPyAoa2VlcCBpbiBtaW5kIHRoYXQgd2UgY2FuIGhhdmUgYSArPSBzb21ldGhpbmcsIHNvIHdlIHdvdWxkIGFjdHVhbGx5IG5lZWQgdG8gY2hlY2sgY2FyZy5ydmFsdWUpXHJcbiAgICAgICAgICAgICAgY29kZSA9IGNvZGUucmVwbGFjZShyZSwgbG9jYWxTdHIpXHJcbiAgICAgICAgICAgICAgcG9zdC5wdXNoKFthcnJTdHIsIFwiLnNldChcIiwgcHRyU3RyLCBcIixcIiwgbG9jYWxTdHIsXCIpXCJdLmpvaW4oXCJcIikpXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgY29kZSA9IGNvZGUucmVwbGFjZShyZSwgW2FyclN0ciwgXCIuZ2V0KFwiLCBwdHJTdHIsIFwiKVwiXS5qb2luKFwiXCIpKVxyXG4gICAgICAgICAgICB9Ki9cclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiY3dpc2U6IEdlbmVyaWMgYXJyYXlzIG5vdCBzdXBwb3J0ZWQgaW4gY29tYmluYXRpb24gd2l0aCBibG9ja3MhXCIpXHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBUaGlzIGRvZXMgbm90IHByb2R1Y2UgYW55IGxvY2FsIHZhcmlhYmxlcywgZXZlbiBpZiB2YXJpYWJsZXMgYXJlIHVzZWQgbXVsdGlwbGUgdGltZXMuIEl0IHdvdWxkIGJlIHBvc3NpYmxlIHRvIGRvIHNvLCBidXQgaXQgd291bGQgY29tcGxpY2F0ZSB0aGluZ3MgcXVpdGUgYSBiaXQuXHJcbiAgICAgICAgICAgIGNvZGUgPSBjb2RlLnJlcGxhY2UocmUsIFthcnJTdHIsIFwiW1wiLCBwdHJTdHIsIFwiXVwiXS5qb2luKFwiXCIpKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgYnJlYWtcclxuICAgICAgY2FzZSBcInNjYWxhclwiOlxyXG4gICAgICAgIGNvZGUgPSBjb2RlLnJlcGxhY2UocmUsIFwiWVwiICsgcHJvYy5zY2FsYXJBcmdzLmluZGV4T2YoaSkpXHJcbiAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgXCJpbmRleFwiOlxyXG4gICAgICAgIGNvZGUgPSBjb2RlLnJlcGxhY2UocmUsIFwiaW5kZXhcIilcclxuICAgICAgYnJlYWtcclxuICAgICAgY2FzZSBcInNoYXBlXCI6XHJcbiAgICAgICAgY29kZSA9IGNvZGUucmVwbGFjZShyZSwgXCJzaGFwZVwiKVxyXG4gICAgICBicmVha1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gW3ByZS5qb2luKFwiXFxuXCIpLCBjb2RlLCBwb3N0LmpvaW4oXCJcXG5cIildLmpvaW4oXCJcXG5cIikudHJpbSgpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHR5cGVTdW1tYXJ5KGR0eXBlcykge1xyXG4gIHZhciBzdW1tYXJ5ID0gbmV3IEFycmF5KGR0eXBlcy5sZW5ndGgpXHJcbiAgdmFyIGFsbEVxdWFsID0gdHJ1ZVxyXG4gIGZvcih2YXIgaT0wOyBpPGR0eXBlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgdmFyIHQgPSBkdHlwZXNbaV1cclxuICAgIHZhciBkaWdpdHMgPSB0Lm1hdGNoKC9cXGQrLylcclxuICAgIGlmKCFkaWdpdHMpIHtcclxuICAgICAgZGlnaXRzID0gXCJcIlxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZGlnaXRzID0gZGlnaXRzWzBdXHJcbiAgICB9XHJcbiAgICBpZih0LmNoYXJBdCgwKSA9PT0gMCkge1xyXG4gICAgICBzdW1tYXJ5W2ldID0gXCJ1XCIgKyB0LmNoYXJBdCgxKSArIGRpZ2l0c1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc3VtbWFyeVtpXSA9IHQuY2hhckF0KDApICsgZGlnaXRzXHJcbiAgICB9XHJcbiAgICBpZihpID4gMCkge1xyXG4gICAgICBhbGxFcXVhbCA9IGFsbEVxdWFsICYmIHN1bW1hcnlbaV0gPT09IHN1bW1hcnlbaS0xXVxyXG4gICAgfVxyXG4gIH1cclxuICBpZihhbGxFcXVhbCkge1xyXG4gICAgcmV0dXJuIHN1bW1hcnlbMF1cclxuICB9XHJcbiAgcmV0dXJuIHN1bW1hcnkuam9pbihcIlwiKVxyXG59XHJcblxyXG4vL0dlbmVyYXRlcyBhIGN3aXNlIG9wZXJhdG9yXHJcbmZ1bmN0aW9uIGdlbmVyYXRlQ1dpc2VPcChwcm9jLCB0eXBlc2lnKSB7XHJcblxyXG4gIC8vQ29tcHV0ZSBkaW1lbnNpb25cclxuICAvLyBBcnJheXMgZ2V0IHB1dCBmaXJzdCBpbiB0eXBlc2lnLCBhbmQgdGhlcmUgYXJlIHR3byBlbnRyaWVzIHBlciBhcnJheSAoZHR5cGUgYW5kIG9yZGVyKSwgc28gdGhpcyBnZXRzIHRoZSBudW1iZXIgb2YgZGltZW5zaW9ucyBpbiB0aGUgZmlyc3QgYXJyYXkgYXJnLlxyXG4gIHZhciBkaW1lbnNpb24gPSAodHlwZXNpZ1sxXS5sZW5ndGggLSBNYXRoLmFicyhwcm9jLmFycmF5QmxvY2tJbmRpY2VzWzBdKSl8MFxyXG4gIHZhciBvcmRlcnMgPSBuZXcgQXJyYXkocHJvYy5hcnJheUFyZ3MubGVuZ3RoKVxyXG4gIHZhciBkdHlwZXMgPSBuZXcgQXJyYXkocHJvYy5hcnJheUFyZ3MubGVuZ3RoKVxyXG4gIGZvcih2YXIgaT0wOyBpPHByb2MuYXJyYXlBcmdzLmxlbmd0aDsgKytpKSB7XHJcbiAgICBkdHlwZXNbaV0gPSB0eXBlc2lnWzIqaV1cclxuICAgIG9yZGVyc1tpXSA9IHR5cGVzaWdbMippKzFdXHJcbiAgfVxyXG4gIFxyXG4gIC8vRGV0ZXJtaW5lIHdoZXJlIGJsb2NrIGFuZCBsb29wIGluZGljZXMgc3RhcnQgYW5kIGVuZFxyXG4gIHZhciBibG9ja0JlZ2luID0gW10sIGJsb2NrRW5kID0gW10gLy8gVGhlc2UgaW5kaWNlcyBhcmUgZXhwb3NlZCBhcyBibG9ja3NcclxuICB2YXIgbG9vcEJlZ2luID0gW10sIGxvb3BFbmQgPSBbXSAvLyBUaGVzZSBpbmRpY2VzIGFyZSBpdGVyYXRlZCBvdmVyXHJcbiAgdmFyIGxvb3BPcmRlcnMgPSBbXSAvLyBvcmRlcnMgcmVzdHJpY3RlZCB0byB0aGUgbG9vcCBpbmRpY2VzXHJcbiAgZm9yKHZhciBpPTA7IGk8cHJvYy5hcnJheUFyZ3MubGVuZ3RoOyArK2kpIHtcclxuICAgIGlmIChwcm9jLmFycmF5QmxvY2tJbmRpY2VzW2ldPDApIHtcclxuICAgICAgbG9vcEJlZ2luLnB1c2goMClcclxuICAgICAgbG9vcEVuZC5wdXNoKGRpbWVuc2lvbilcclxuICAgICAgYmxvY2tCZWdpbi5wdXNoKGRpbWVuc2lvbilcclxuICAgICAgYmxvY2tFbmQucHVzaChkaW1lbnNpb24rcHJvYy5hcnJheUJsb2NrSW5kaWNlc1tpXSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGxvb3BCZWdpbi5wdXNoKHByb2MuYXJyYXlCbG9ja0luZGljZXNbaV0pIC8vIE5vbi1uZWdhdGl2ZVxyXG4gICAgICBsb29wRW5kLnB1c2gocHJvYy5hcnJheUJsb2NrSW5kaWNlc1tpXStkaW1lbnNpb24pXHJcbiAgICAgIGJsb2NrQmVnaW4ucHVzaCgwKVxyXG4gICAgICBibG9ja0VuZC5wdXNoKHByb2MuYXJyYXlCbG9ja0luZGljZXNbaV0pXHJcbiAgICB9XHJcbiAgICB2YXIgbmV3T3JkZXIgPSBbXVxyXG4gICAgZm9yKHZhciBqPTA7IGo8b3JkZXJzW2ldLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgIGlmIChsb29wQmVnaW5baV08PW9yZGVyc1tpXVtqXSAmJiBvcmRlcnNbaV1bal08bG9vcEVuZFtpXSkge1xyXG4gICAgICAgIG5ld09yZGVyLnB1c2gob3JkZXJzW2ldW2pdLWxvb3BCZWdpbltpXSkgLy8gSWYgdGhpcyBpcyBhIGxvb3AgaW5kZXgsIHB1dCBpdCBpbiBuZXdPcmRlciwgc3VidHJhY3RpbmcgbG9vcEJlZ2luLCB0byBtYWtlIHN1cmUgdGhhdCBhbGwgbG9vcE9yZGVycyBhcmUgdXNpbmcgYSBjb21tb24gc2V0IG9mIGluZGljZXMuXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGxvb3BPcmRlcnMucHVzaChuZXdPcmRlcilcclxuICB9XHJcblxyXG4gIC8vRmlyc3QgY3JlYXRlIGFyZ3VtZW50cyBmb3IgcHJvY2VkdXJlXHJcbiAgdmFyIGFyZ2xpc3QgPSBbXCJTU1wiXSAvLyBTUyBpcyB0aGUgb3ZlcmFsbCBzaGFwZSBvdmVyIHdoaWNoIHdlIGl0ZXJhdGVcclxuICB2YXIgY29kZSA9IFtcIid1c2Ugc3RyaWN0J1wiXVxyXG4gIHZhciB2YXJzID0gW11cclxuICBcclxuICBmb3IodmFyIGo9MDsgajxkaW1lbnNpb247ICsraikge1xyXG4gICAgdmFycy5wdXNoKFtcInNcIiwgaiwgXCI9U1NbXCIsIGosIFwiXVwiXS5qb2luKFwiXCIpKSAvLyBUaGUgbGltaXRzIGZvciBlYWNoIGRpbWVuc2lvbi5cclxuICB9XHJcbiAgZm9yKHZhciBpPTA7IGk8cHJvYy5hcnJheUFyZ3MubGVuZ3RoOyArK2kpIHtcclxuICAgIGFyZ2xpc3QucHVzaChcImFcIitpKSAvLyBBY3R1YWwgZGF0YSBhcnJheVxyXG4gICAgYXJnbGlzdC5wdXNoKFwidFwiK2kpIC8vIFN0cmlkZXNcclxuICAgIGFyZ2xpc3QucHVzaChcInBcIitpKSAvLyBPZmZzZXQgaW4gdGhlIGFycmF5IGF0IHdoaWNoIHRoZSBkYXRhIHN0YXJ0cyAoYWxzbyB1c2VkIGZvciBpdGVyYXRpbmcgb3ZlciB0aGUgZGF0YSlcclxuICAgIFxyXG4gICAgZm9yKHZhciBqPTA7IGo8ZGltZW5zaW9uOyArK2opIHsgLy8gVW5wYWNrIHRoZSBzdHJpZGVzIGludG8gdmFycyBmb3IgbG9vcGluZ1xyXG4gICAgICB2YXJzLnB1c2goW1widFwiLGksXCJwXCIsaixcIj10XCIsaSxcIltcIixsb29wQmVnaW5baV0raixcIl1cIl0uam9pbihcIlwiKSlcclxuICAgIH1cclxuICAgIFxyXG4gICAgZm9yKHZhciBqPTA7IGo8TWF0aC5hYnMocHJvYy5hcnJheUJsb2NrSW5kaWNlc1tpXSk7ICsraikgeyAvLyBVbnBhY2sgdGhlIHN0cmlkZXMgaW50byB2YXJzIGZvciBibG9jayBpdGVyYXRpb25cclxuICAgICAgdmFycy5wdXNoKFtcInRcIixpLFwiYlwiLGosXCI9dFwiLGksXCJbXCIsYmxvY2tCZWdpbltpXStqLFwiXVwiXS5qb2luKFwiXCIpKVxyXG4gICAgfVxyXG4gIH1cclxuICBmb3IodmFyIGk9MDsgaTxwcm9jLnNjYWxhckFyZ3MubGVuZ3RoOyArK2kpIHtcclxuICAgIGFyZ2xpc3QucHVzaChcIllcIiArIGkpXHJcbiAgfVxyXG4gIGlmKHByb2Muc2hhcGVBcmdzLmxlbmd0aCA+IDApIHtcclxuICAgIHZhcnMucHVzaChcInNoYXBlPVNTLnNsaWNlKDApXCIpIC8vIE1ha2VzIHRoZSBzaGFwZSBvdmVyIHdoaWNoIHdlIGl0ZXJhdGUgYXZhaWxhYmxlIHRvIHRoZSB1c2VyIGRlZmluZWQgZnVuY3Rpb25zIChzbyB5b3UgY2FuIHVzZSB3aWR0aC9oZWlnaHQgZm9yIGV4YW1wbGUpXHJcbiAgfVxyXG4gIGlmKHByb2MuaW5kZXhBcmdzLmxlbmd0aCA+IDApIHtcclxuICAgIC8vIFByZXBhcmUgYW4gYXJyYXkgdG8ga2VlcCB0cmFjayBvZiB0aGUgKGxvZ2ljYWwpIGluZGljZXMsIGluaXRpYWxpemVkIHRvIGRpbWVuc2lvbiB6ZXJvZXMuXHJcbiAgICB2YXIgemVyb3MgPSBuZXcgQXJyYXkoZGltZW5zaW9uKVxyXG4gICAgZm9yKHZhciBpPTA7IGk8ZGltZW5zaW9uOyArK2kpIHtcclxuICAgICAgemVyb3NbaV0gPSBcIjBcIlxyXG4gICAgfVxyXG4gICAgdmFycy5wdXNoKFtcImluZGV4PVtcIiwgemVyb3Muam9pbihcIixcIiksIFwiXVwiXS5qb2luKFwiXCIpKVxyXG4gIH1cclxuICBmb3IodmFyIGk9MDsgaTxwcm9jLm9mZnNldEFyZ3MubGVuZ3RoOyArK2kpIHsgLy8gT2Zmc2V0IGFyZ3VtZW50cyB1c2VkIGZvciBzdGVuY2lsIG9wZXJhdGlvbnNcclxuICAgIHZhciBvZmZfYXJnID0gcHJvYy5vZmZzZXRBcmdzW2ldXHJcbiAgICB2YXIgaW5pdF9zdHJpbmcgPSBbXVxyXG4gICAgZm9yKHZhciBqPTA7IGo8b2ZmX2FyZy5vZmZzZXQubGVuZ3RoOyArK2opIHtcclxuICAgICAgaWYob2ZmX2FyZy5vZmZzZXRbal0gPT09IDApIHtcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9IGVsc2UgaWYob2ZmX2FyZy5vZmZzZXRbal0gPT09IDEpIHtcclxuICAgICAgICBpbml0X3N0cmluZy5wdXNoKFtcInRcIiwgb2ZmX2FyZy5hcnJheSwgXCJwXCIsIGpdLmpvaW4oXCJcIikpICAgICAgXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW5pdF9zdHJpbmcucHVzaChbb2ZmX2FyZy5vZmZzZXRbal0sIFwiKnRcIiwgb2ZmX2FyZy5hcnJheSwgXCJwXCIsIGpdLmpvaW4oXCJcIikpXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGlmKGluaXRfc3RyaW5nLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB2YXJzLnB1c2goXCJxXCIgKyBpICsgXCI9MFwiKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdmFycy5wdXNoKFtcInFcIiwgaSwgXCI9XCIsIGluaXRfc3RyaW5nLmpvaW4oXCIrXCIpXS5qb2luKFwiXCIpKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy9QcmVwYXJlIHRoaXMgdmFyaWFibGVzXHJcbiAgdmFyIHRoaXNWYXJzID0gdW5pcShbXS5jb25jYXQocHJvYy5wcmUudGhpc1ZhcnMpXHJcbiAgICAgICAgICAgICAgICAgICAgICAuY29uY2F0KHByb2MuYm9keS50aGlzVmFycylcclxuICAgICAgICAgICAgICAgICAgICAgIC5jb25jYXQocHJvYy5wb3N0LnRoaXNWYXJzKSlcclxuICB2YXJzID0gdmFycy5jb25jYXQodGhpc1ZhcnMpXHJcbiAgY29kZS5wdXNoKFwidmFyIFwiICsgdmFycy5qb2luKFwiLFwiKSlcclxuICBmb3IodmFyIGk9MDsgaTxwcm9jLmFycmF5QXJncy5sZW5ndGg7ICsraSkge1xyXG4gICAgY29kZS5wdXNoKFwicFwiK2krXCJ8PTBcIilcclxuICB9XHJcbiAgXHJcbiAgLy9JbmxpbmUgcHJlbHVkZVxyXG4gIGlmKHByb2MucHJlLmJvZHkubGVuZ3RoID4gMykge1xyXG4gICAgY29kZS5wdXNoKHByb2Nlc3NCbG9jayhwcm9jLnByZSwgcHJvYywgZHR5cGVzKSlcclxuICB9XHJcblxyXG4gIC8vUHJvY2VzcyBib2R5XHJcbiAgdmFyIGJvZHkgPSBwcm9jZXNzQmxvY2socHJvYy5ib2R5LCBwcm9jLCBkdHlwZXMpXHJcbiAgdmFyIG1hdGNoZWQgPSBjb3VudE1hdGNoZXMobG9vcE9yZGVycylcclxuICBpZihtYXRjaGVkIDwgZGltZW5zaW9uKSB7XHJcbiAgICBjb2RlLnB1c2gob3V0ZXJGaWxsKG1hdGNoZWQsIGxvb3BPcmRlcnNbMF0sIHByb2MsIGJvZHkpKSAvLyBUT0RPOiBSYXRoZXIgdGhhbiBwYXNzaW5nIGxvb3BPcmRlcnNbMF0sIGl0IG1pZ2h0IGJlIGludGVyZXN0aW5nIHRvIGxvb2sgYXQgcGFzc2luZyBhbiBvcmRlciB0aGF0IHJlcHJlc2VudHMgdGhlIG1ham9yaXR5IG9mIHRoZSBhcmd1bWVudHMgZm9yIGV4YW1wbGUuXHJcbiAgfSBlbHNlIHtcclxuICAgIGNvZGUucHVzaChpbm5lckZpbGwobG9vcE9yZGVyc1swXSwgcHJvYywgYm9keSkpXHJcbiAgfVxyXG5cclxuICAvL0lubGluZSBlcGlsb2dcclxuICBpZihwcm9jLnBvc3QuYm9keS5sZW5ndGggPiAzKSB7XHJcbiAgICBjb2RlLnB1c2gocHJvY2Vzc0Jsb2NrKHByb2MucG9zdCwgcHJvYywgZHR5cGVzKSlcclxuICB9XHJcbiAgXHJcbiAgaWYocHJvYy5kZWJ1Zykge1xyXG4gICAgY29uc29sZS5sb2coXCItLS0tLUdlbmVyYXRlZCBjd2lzZSByb3V0aW5lIGZvciBcIiwgdHlwZXNpZywgXCI6XFxuXCIgKyBjb2RlLmpvaW4oXCJcXG5cIikgKyBcIlxcbi0tLS0tLS0tLS1cIilcclxuICB9XHJcbiAgXHJcbiAgdmFyIGxvb3BOYW1lID0gWyhwcm9jLmZ1bmNOYW1lfHxcInVubmFtZWRcIiksIFwiX2N3aXNlX2xvb3BfXCIsIG9yZGVyc1swXS5qb2luKFwic1wiKSxcIm1cIixtYXRjaGVkLHR5cGVTdW1tYXJ5KGR0eXBlcyldLmpvaW4oXCJcIilcclxuICB2YXIgZiA9IG5ldyBGdW5jdGlvbihbXCJmdW5jdGlvbiBcIixsb29wTmFtZSxcIihcIiwgYXJnbGlzdC5qb2luKFwiLFwiKSxcIil7XCIsIGNvZGUuam9pbihcIlxcblwiKSxcIn0gcmV0dXJuIFwiLCBsb29wTmFtZV0uam9pbihcIlwiKSlcclxuICByZXR1cm4gZigpXHJcbn1cclxubW9kdWxlLmV4cG9ydHMgPSBnZW5lcmF0ZUNXaXNlT3BcclxuIiwiXCJ1c2Ugc3RyaWN0XCJcclxuXHJcbi8vIFRoZSBmdW5jdGlvbiBiZWxvdyBpcyBjYWxsZWQgd2hlbiBjb25zdHJ1Y3RpbmcgYSBjd2lzZSBmdW5jdGlvbiBvYmplY3QsIGFuZCBkb2VzIHRoZSBmb2xsb3dpbmc6XHJcbi8vIEEgZnVuY3Rpb24gb2JqZWN0IGlzIGNvbnN0cnVjdGVkIHdoaWNoIGFjY2VwdHMgYXMgYXJndW1lbnQgYSBjb21waWxhdGlvbiBmdW5jdGlvbiBhbmQgcmV0dXJucyBhbm90aGVyIGZ1bmN0aW9uLlxyXG4vLyBJdCBpcyB0aGlzIG90aGVyIGZ1bmN0aW9uIHRoYXQgaXMgZXZlbnR1YWxseSByZXR1cm5lZCBieSBjcmVhdGVUaHVuaywgYW5kIHRoaXMgZnVuY3Rpb24gaXMgdGhlIG9uZSB0aGF0IGFjdHVhbGx5XHJcbi8vIGNoZWNrcyB3aGV0aGVyIGEgY2VydGFpbiBwYXR0ZXJuIG9mIGFyZ3VtZW50cyBoYXMgYWxyZWFkeSBiZWVuIHVzZWQgYmVmb3JlIGFuZCBjb21waWxlcyBuZXcgbG9vcHMgYXMgbmVlZGVkLlxyXG4vLyBUaGUgY29tcGlsYXRpb24gcGFzc2VkIHRvIHRoZSBmaXJzdCBmdW5jdGlvbiBvYmplY3QgaXMgdXNlZCBmb3IgY29tcGlsaW5nIG5ldyBmdW5jdGlvbnMuXHJcbi8vIE9uY2UgdGhpcyBmdW5jdGlvbiBvYmplY3QgaXMgY3JlYXRlZCwgaXQgaXMgY2FsbGVkIHdpdGggY29tcGlsZSBhcyBhcmd1bWVudCwgd2hlcmUgdGhlIGZpcnN0IGFyZ3VtZW50IG9mIGNvbXBpbGVcclxuLy8gaXMgYm91bmQgdG8gXCJwcm9jXCIgKGVzc2VudGlhbGx5IGNvbnRhaW5pbmcgYSBwcmVwcm9jZXNzZWQgdmVyc2lvbiBvZiB0aGUgdXNlciBhcmd1bWVudHMgdG8gY3dpc2UpLlxyXG4vLyBTbyBjcmVhdGVUaHVuayByb3VnaGx5IHdvcmtzIGxpa2UgdGhpczpcclxuLy8gZnVuY3Rpb24gY3JlYXRlVGh1bmsocHJvYykge1xyXG4vLyAgIHZhciB0aHVuayA9IGZ1bmN0aW9uKGNvbXBpbGVCb3VuZCkge1xyXG4vLyAgICAgdmFyIENBQ0hFRCA9IHt9XHJcbi8vICAgICByZXR1cm4gZnVuY3Rpb24oYXJyYXlzIGFuZCBzY2FsYXJzKSB7XHJcbi8vICAgICAgIGlmIChkdHlwZSBhbmQgb3JkZXIgb2YgYXJyYXlzIGluIENBQ0hFRCkge1xyXG4vLyAgICAgICAgIHZhciBmdW5jID0gQ0FDSEVEW2R0eXBlIGFuZCBvcmRlciBvZiBhcnJheXNdXHJcbi8vICAgICAgIH0gZWxzZSB7XHJcbi8vICAgICAgICAgdmFyIGZ1bmMgPSBDQUNIRURbZHR5cGUgYW5kIG9yZGVyIG9mIGFycmF5c10gPSBjb21waWxlQm91bmQoZHR5cGUgYW5kIG9yZGVyIG9mIGFycmF5cylcclxuLy8gICAgICAgfVxyXG4vLyAgICAgICByZXR1cm4gZnVuYyhhcnJheXMgYW5kIHNjYWxhcnMpXHJcbi8vICAgICB9XHJcbi8vICAgfVxyXG4vLyAgIHJldHVybiB0aHVuayhjb21waWxlLmJpbmQxKHByb2MpKVxyXG4vLyB9XHJcblxyXG52YXIgY29tcGlsZSA9IHJlcXVpcmUoXCIuL2NvbXBpbGUuanNcIilcclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVRodW5rKHByb2MpIHtcclxuICB2YXIgY29kZSA9IFtcIid1c2Ugc3RyaWN0J1wiLCBcInZhciBDQUNIRUQ9e31cIl1cclxuICB2YXIgdmFycyA9IFtdXHJcbiAgdmFyIHRodW5rTmFtZSA9IHByb2MuZnVuY05hbWUgKyBcIl9jd2lzZV90aHVua1wiXHJcbiAgXHJcbiAgLy9CdWlsZCB0aHVua1xyXG4gIGNvZGUucHVzaChbXCJyZXR1cm4gZnVuY3Rpb24gXCIsIHRodW5rTmFtZSwgXCIoXCIsIHByb2Muc2hpbUFyZ3Muam9pbihcIixcIiksIFwiKXtcIl0uam9pbihcIlwiKSlcclxuICB2YXIgdHlwZXNpZyA9IFtdXHJcbiAgdmFyIHN0cmluZ190eXBlc2lnID0gW11cclxuICB2YXIgcHJvY19hcmdzID0gW1tcImFycmF5XCIscHJvYy5hcnJheUFyZ3NbMF0sXCIuc2hhcGUuc2xpY2UoXCIsIC8vIFNsaWNlIHNoYXBlIHNvIHRoYXQgd2Ugb25seSByZXRhaW4gdGhlIHNoYXBlIG92ZXIgd2hpY2ggd2UgaXRlcmF0ZSAod2hpY2ggZ2V0cyBwYXNzZWQgdG8gdGhlIGN3aXNlIG9wZXJhdG9yIGFzIFNTKS5cclxuICAgICAgICAgICAgICAgICAgICBNYXRoLm1heCgwLHByb2MuYXJyYXlCbG9ja0luZGljZXNbMF0pLHByb2MuYXJyYXlCbG9ja0luZGljZXNbMF08MD8oXCIsXCIrcHJvYy5hcnJheUJsb2NrSW5kaWNlc1swXStcIilcIik6XCIpXCJdLmpvaW4oXCJcIildXHJcbiAgdmFyIHNoYXBlTGVuZ3RoQ29uZGl0aW9ucyA9IFtdLCBzaGFwZUNvbmRpdGlvbnMgPSBbXVxyXG4gIC8vIFByb2Nlc3MgYXJyYXkgYXJndW1lbnRzXHJcbiAgZm9yKHZhciBpPTA7IGk8cHJvYy5hcnJheUFyZ3MubGVuZ3RoOyArK2kpIHtcclxuICAgIHZhciBqID0gcHJvYy5hcnJheUFyZ3NbaV1cclxuICAgIHZhcnMucHVzaChbXCJ0XCIsIGosIFwiPWFycmF5XCIsIGosIFwiLmR0eXBlLFwiLFxyXG4gICAgICAgICAgICAgICBcInJcIiwgaiwgXCI9YXJyYXlcIiwgaiwgXCIub3JkZXJcIl0uam9pbihcIlwiKSlcclxuICAgIHR5cGVzaWcucHVzaChcInRcIiArIGopXHJcbiAgICB0eXBlc2lnLnB1c2goXCJyXCIgKyBqKVxyXG4gICAgc3RyaW5nX3R5cGVzaWcucHVzaChcInRcIitqKVxyXG4gICAgc3RyaW5nX3R5cGVzaWcucHVzaChcInJcIitqK1wiLmpvaW4oKVwiKVxyXG4gICAgcHJvY19hcmdzLnB1c2goXCJhcnJheVwiICsgaiArIFwiLmRhdGFcIilcclxuICAgIHByb2NfYXJncy5wdXNoKFwiYXJyYXlcIiArIGogKyBcIi5zdHJpZGVcIilcclxuICAgIHByb2NfYXJncy5wdXNoKFwiYXJyYXlcIiArIGogKyBcIi5vZmZzZXR8MFwiKVxyXG4gICAgaWYgKGk+MCkgeyAvLyBHYXRoZXIgY29uZGl0aW9ucyB0byBjaGVjayBmb3Igc2hhcGUgZXF1YWxpdHkgKGlnbm9yaW5nIGJsb2NrIGluZGljZXMpXHJcbiAgICAgIHNoYXBlTGVuZ3RoQ29uZGl0aW9ucy5wdXNoKFwiYXJyYXlcIiArIHByb2MuYXJyYXlBcmdzWzBdICsgXCIuc2hhcGUubGVuZ3RoPT09YXJyYXlcIiArIGogKyBcIi5zaGFwZS5sZW5ndGgrXCIgKyAoTWF0aC5hYnMocHJvYy5hcnJheUJsb2NrSW5kaWNlc1swXSktTWF0aC5hYnMocHJvYy5hcnJheUJsb2NrSW5kaWNlc1tpXSkpKVxyXG4gICAgICBzaGFwZUNvbmRpdGlvbnMucHVzaChcImFycmF5XCIgKyBwcm9jLmFycmF5QXJnc1swXSArIFwiLnNoYXBlW3NoYXBlSW5kZXgrXCIgKyBNYXRoLm1heCgwLHByb2MuYXJyYXlCbG9ja0luZGljZXNbMF0pICsgXCJdPT09YXJyYXlcIiArIGogKyBcIi5zaGFwZVtzaGFwZUluZGV4K1wiICsgTWF0aC5tYXgoMCxwcm9jLmFycmF5QmxvY2tJbmRpY2VzW2ldKSArIFwiXVwiKVxyXG4gICAgfVxyXG4gIH1cclxuICAvLyBDaGVjayBmb3Igc2hhcGUgZXF1YWxpdHlcclxuICBpZiAocHJvYy5hcnJheUFyZ3MubGVuZ3RoID4gMSkge1xyXG4gICAgY29kZS5wdXNoKFwiaWYgKCEoXCIgKyBzaGFwZUxlbmd0aENvbmRpdGlvbnMuam9pbihcIiAmJiBcIikgKyBcIikpIHRocm93IG5ldyBFcnJvcignY3dpc2U6IEFycmF5cyBkbyBub3QgYWxsIGhhdmUgdGhlIHNhbWUgZGltZW5zaW9uYWxpdHkhJylcIilcclxuICAgIGNvZGUucHVzaChcImZvcih2YXIgc2hhcGVJbmRleD1hcnJheVwiICsgcHJvYy5hcnJheUFyZ3NbMF0gKyBcIi5zaGFwZS5sZW5ndGgtXCIgKyBNYXRoLmFicyhwcm9jLmFycmF5QmxvY2tJbmRpY2VzWzBdKSArIFwiOyBzaGFwZUluZGV4LS0+MDspIHtcIilcclxuICAgIGNvZGUucHVzaChcImlmICghKFwiICsgc2hhcGVDb25kaXRpb25zLmpvaW4oXCIgJiYgXCIpICsgXCIpKSB0aHJvdyBuZXcgRXJyb3IoJ2N3aXNlOiBBcnJheXMgZG8gbm90IGFsbCBoYXZlIHRoZSBzYW1lIHNoYXBlIScpXCIpXHJcbiAgICBjb2RlLnB1c2goXCJ9XCIpXHJcbiAgfVxyXG4gIC8vIFByb2Nlc3Mgc2NhbGFyIGFyZ3VtZW50c1xyXG4gIGZvcih2YXIgaT0wOyBpPHByb2Muc2NhbGFyQXJncy5sZW5ndGg7ICsraSkge1xyXG4gICAgcHJvY19hcmdzLnB1c2goXCJzY2FsYXJcIiArIHByb2Muc2NhbGFyQXJnc1tpXSlcclxuICB9XHJcbiAgLy8gQ2hlY2sgZm9yIGNhY2hlZCBmdW5jdGlvbiAoYW5kIGlmIG5vdCBwcmVzZW50LCBnZW5lcmF0ZSBpdClcclxuICB2YXJzLnB1c2goW1widHlwZT1bXCIsIHN0cmluZ190eXBlc2lnLmpvaW4oXCIsXCIpLCBcIl0uam9pbigpXCJdLmpvaW4oXCJcIikpXHJcbiAgdmFycy5wdXNoKFwicHJvYz1DQUNIRURbdHlwZV1cIilcclxuICBjb2RlLnB1c2goXCJ2YXIgXCIgKyB2YXJzLmpvaW4oXCIsXCIpKVxyXG4gIFxyXG4gIGNvZGUucHVzaChbXCJpZighcHJvYyl7XCIsXHJcbiAgICAgICAgICAgICBcIkNBQ0hFRFt0eXBlXT1wcm9jPWNvbXBpbGUoW1wiLCB0eXBlc2lnLmpvaW4oXCIsXCIpLCBcIl0pfVwiLFxyXG4gICAgICAgICAgICAgXCJyZXR1cm4gcHJvYyhcIiwgcHJvY19hcmdzLmpvaW4oXCIsXCIpLCBcIil9XCJdLmpvaW4oXCJcIikpXHJcblxyXG4gIGlmKHByb2MuZGVidWcpIHtcclxuICAgIGNvbnNvbGUubG9nKFwiLS0tLS1HZW5lcmF0ZWQgdGh1bms6XFxuXCIgKyBjb2RlLmpvaW4oXCJcXG5cIikgKyBcIlxcbi0tLS0tLS0tLS1cIilcclxuICB9XHJcbiAgXHJcbiAgLy9Db21waWxlIHRodW5rXHJcbiAgdmFyIHRodW5rID0gbmV3IEZ1bmN0aW9uKFwiY29tcGlsZVwiLCBjb2RlLmpvaW4oXCJcXG5cIikpXHJcbiAgcmV0dXJuIHRodW5rKGNvbXBpbGUuYmluZCh1bmRlZmluZWQsIHByb2MpKVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVRodW5rXHJcbiIsIi8qIVxuICAqIGRvbXJlYWR5IChjKSBEdXN0aW4gRGlheiAyMDE0IC0gTGljZW5zZSBNSVRcbiAgKi9cbiFmdW5jdGlvbiAobmFtZSwgZGVmaW5pdGlvbikge1xuXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9ICd1bmRlZmluZWQnKSBtb2R1bGUuZXhwb3J0cyA9IGRlZmluaXRpb24oKVxuICBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcpIGRlZmluZShkZWZpbml0aW9uKVxuICBlbHNlIHRoaXNbbmFtZV0gPSBkZWZpbml0aW9uKClcblxufSgnZG9tcmVhZHknLCBmdW5jdGlvbiAoKSB7XG5cbiAgdmFyIGZucyA9IFtdLCBsaXN0ZW5lclxuICAgICwgZG9jID0gZG9jdW1lbnRcbiAgICAsIGhhY2sgPSBkb2MuZG9jdW1lbnRFbGVtZW50LmRvU2Nyb2xsXG4gICAgLCBkb21Db250ZW50TG9hZGVkID0gJ0RPTUNvbnRlbnRMb2FkZWQnXG4gICAgLCBsb2FkZWQgPSAoaGFjayA/IC9ebG9hZGVkfF5jLyA6IC9ebG9hZGVkfF5pfF5jLykudGVzdChkb2MucmVhZHlTdGF0ZSlcblxuXG4gIGlmICghbG9hZGVkKVxuICBkb2MuYWRkRXZlbnRMaXN0ZW5lcihkb21Db250ZW50TG9hZGVkLCBsaXN0ZW5lciA9IGZ1bmN0aW9uICgpIHtcbiAgICBkb2MucmVtb3ZlRXZlbnRMaXN0ZW5lcihkb21Db250ZW50TG9hZGVkLCBsaXN0ZW5lcilcbiAgICBsb2FkZWQgPSAxXG4gICAgd2hpbGUgKGxpc3RlbmVyID0gZm5zLnNoaWZ0KCkpIGxpc3RlbmVyKClcbiAgfSlcblxuICByZXR1cm4gZnVuY3Rpb24gKGZuKSB7XG4gICAgbG9hZGVkID8gc2V0VGltZW91dChmbiwgMCkgOiBmbnMucHVzaChmbilcbiAgfVxuXG59KTtcbiIsIlwidXNlIHN0cmljdFwiXG5cbmZ1bmN0aW9uIGR1cGVfYXJyYXkoY291bnQsIHZhbHVlLCBpKSB7XG4gIHZhciBjID0gY291bnRbaV18MFxuICBpZihjIDw9IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGMpLCBqXG4gIGlmKGkgPT09IGNvdW50Lmxlbmd0aC0xKSB7XG4gICAgZm9yKGo9MDsgajxjOyArK2opIHtcbiAgICAgIHJlc3VsdFtqXSA9IHZhbHVlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvcihqPTA7IGo8YzsgKytqKSB7XG4gICAgICByZXN1bHRbal0gPSBkdXBlX2FycmF5KGNvdW50LCB2YWx1ZSwgaSsxKVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGR1cGVfbnVtYmVyKGNvdW50LCB2YWx1ZSkge1xuICB2YXIgcmVzdWx0LCBpXG4gIHJlc3VsdCA9IG5ldyBBcnJheShjb3VudClcbiAgZm9yKGk9MDsgaTxjb3VudDsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gdmFsdWVcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGR1cGUoY291bnQsIHZhbHVlKSB7XG4gIGlmKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHZhbHVlID0gMFxuICB9XG4gIHN3aXRjaCh0eXBlb2YgY291bnQpIHtcbiAgICBjYXNlIFwibnVtYmVyXCI6XG4gICAgICBpZihjb3VudCA+IDApIHtcbiAgICAgICAgcmV0dXJuIGR1cGVfbnVtYmVyKGNvdW50fDAsIHZhbHVlKVxuICAgICAgfVxuICAgIGJyZWFrXG4gICAgY2FzZSBcIm9iamVjdFwiOlxuICAgICAgaWYodHlwZW9mIChjb3VudC5sZW5ndGgpID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHJldHVybiBkdXBlX2FycmF5KGNvdW50LCB2YWx1ZSwgMClcbiAgICAgIH1cbiAgICBicmVha1xuICB9XG4gIHJldHVybiBbXVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGR1cGUiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfVxuICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUudHJhY2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gbm90IHN1cHBvcnRlZCBpbiBJRSAxMFxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCJpZih0eXBlb2Ygd2luZG93LnBlcmZvcm1hbmNlID09PSBcIm9iamVjdFwiKSB7XG4gIGlmKHdpbmRvdy5wZXJmb3JtYW5jZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpIH1cbiAgfSBlbHNlIGlmKHdpbmRvdy5wZXJmb3JtYW5jZS53ZWJraXROb3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gd2luZG93LnBlcmZvcm1hbmNlLndlYmtpdE5vdygpIH1cbiAgfVxufSBlbHNlIGlmKERhdGUubm93KSB7XG4gIG1vZHVsZS5leHBvcnRzID0gRGF0ZS5ub3dcbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7IHJldHVybiAobmV3IERhdGUoKSkuZ2V0VGltZSgpIH1cbn1cbiIsIi8vQWRhcHRlZCBmcm9tIGhlcmU6IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL1JlZmVyZW5jZS9FdmVudHMvd2hlZWw/cmVkaXJlY3Rsb2NhbGU9ZW4tVVMmcmVkaXJlY3RzbHVnPURPTSUyRk1vemlsbGFfZXZlbnRfcmVmZXJlbmNlJTJGd2hlZWxcblxudmFyIHByZWZpeCA9IFwiXCIsIF9hZGRFdmVudExpc3RlbmVyLCBvbndoZWVsLCBzdXBwb3J0O1xuXG4vLyBkZXRlY3QgZXZlbnQgbW9kZWxcbmlmICggd2luZG93LmFkZEV2ZW50TGlzdGVuZXIgKSB7XG4gIF9hZGRFdmVudExpc3RlbmVyID0gXCJhZGRFdmVudExpc3RlbmVyXCI7XG59IGVsc2Uge1xuICBfYWRkRXZlbnRMaXN0ZW5lciA9IFwiYXR0YWNoRXZlbnRcIjtcbiAgcHJlZml4ID0gXCJvblwiO1xufVxuXG4vLyBkZXRlY3QgYXZhaWxhYmxlIHdoZWVsIGV2ZW50XG5zdXBwb3J0ID0gXCJvbndoZWVsXCIgaW4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSA/IFwid2hlZWxcIiA6IC8vIE1vZGVybiBicm93c2VycyBzdXBwb3J0IFwid2hlZWxcIlxuICAgICAgICAgIGRvY3VtZW50Lm9ubW91c2V3aGVlbCAhPT0gdW5kZWZpbmVkID8gXCJtb3VzZXdoZWVsXCIgOiAvLyBXZWJraXQgYW5kIElFIHN1cHBvcnQgYXQgbGVhc3QgXCJtb3VzZXdoZWVsXCJcbiAgICAgICAgICBcIkRPTU1vdXNlU2Nyb2xsXCI7IC8vIGxldCdzIGFzc3VtZSB0aGF0IHJlbWFpbmluZyBicm93c2VycyBhcmUgb2xkZXIgRmlyZWZveFxuXG5mdW5jdGlvbiBfYWRkV2hlZWxMaXN0ZW5lciggZWxlbSwgZXZlbnROYW1lLCBjYWxsYmFjaywgdXNlQ2FwdHVyZSApIHtcbiAgZWxlbVsgX2FkZEV2ZW50TGlzdGVuZXIgXSggcHJlZml4ICsgZXZlbnROYW1lLCBzdXBwb3J0ID09IFwid2hlZWxcIiA/IGNhbGxiYWNrIDogZnVuY3Rpb24oIG9yaWdpbmFsRXZlbnQgKSB7XG4gICAgIW9yaWdpbmFsRXZlbnQgJiYgKCBvcmlnaW5hbEV2ZW50ID0gd2luZG93LmV2ZW50ICk7XG5cbiAgICAvLyBjcmVhdGUgYSBub3JtYWxpemVkIGV2ZW50IG9iamVjdFxuICAgIHZhciBldmVudCA9IHtcbiAgICAgIC8vIGtlZXAgYSByZWYgdG8gdGhlIG9yaWdpbmFsIGV2ZW50IG9iamVjdFxuICAgICAgb3JpZ2luYWxFdmVudDogb3JpZ2luYWxFdmVudCxcbiAgICAgIHRhcmdldDogb3JpZ2luYWxFdmVudC50YXJnZXQgfHwgb3JpZ2luYWxFdmVudC5zcmNFbGVtZW50LFxuICAgICAgdHlwZTogXCJ3aGVlbFwiLFxuICAgICAgZGVsdGFNb2RlOiBvcmlnaW5hbEV2ZW50LnR5cGUgPT0gXCJNb3pNb3VzZVBpeGVsU2Nyb2xsXCIgPyAwIDogMSxcbiAgICAgIGRlbHRhWDogMCxcbiAgICAgIGRlbGF0WjogMCxcbiAgICAgIHByZXZlbnREZWZhdWx0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgb3JpZ2luYWxFdmVudC5wcmV2ZW50RGVmYXVsdCA/XG4gICAgICAgICAgb3JpZ2luYWxFdmVudC5wcmV2ZW50RGVmYXVsdCgpIDpcbiAgICAgICAgICBvcmlnaW5hbEV2ZW50LnJldHVyblZhbHVlID0gZmFsc2U7XG4gICAgICB9XG4gICAgfTtcbiAgICBcbiAgICAvLyBjYWxjdWxhdGUgZGVsdGFZIChhbmQgZGVsdGFYKSBhY2NvcmRpbmcgdG8gdGhlIGV2ZW50XG4gICAgaWYgKCBzdXBwb3J0ID09IFwibW91c2V3aGVlbFwiICkge1xuICAgICAgZXZlbnQuZGVsdGFZID0gLSAxLzQwICogb3JpZ2luYWxFdmVudC53aGVlbERlbHRhO1xuICAgICAgLy8gV2Via2l0IGFsc28gc3VwcG9ydCB3aGVlbERlbHRhWFxuICAgICAgb3JpZ2luYWxFdmVudC53aGVlbERlbHRhWCAmJiAoIGV2ZW50LmRlbHRhWCA9IC0gMS80MCAqIG9yaWdpbmFsRXZlbnQud2hlZWxEZWx0YVggKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXZlbnQuZGVsdGFZID0gb3JpZ2luYWxFdmVudC5kZXRhaWw7XG4gICAgfVxuXG4gICAgLy8gaXQncyB0aW1lIHRvIGZpcmUgdGhlIGNhbGxiYWNrXG4gICAgcmV0dXJuIGNhbGxiYWNrKCBldmVudCApO1xuICB9LCB1c2VDYXB0dXJlIHx8IGZhbHNlICk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oIGVsZW0sIGNhbGxiYWNrLCB1c2VDYXB0dXJlICkge1xuICBfYWRkV2hlZWxMaXN0ZW5lciggZWxlbSwgc3VwcG9ydCwgY2FsbGJhY2ssIHVzZUNhcHR1cmUgKTtcblxuICAvLyBoYW5kbGUgTW96TW91c2VQaXhlbFNjcm9sbCBpbiBvbGRlciBGaXJlZm94XG4gIGlmKCBzdXBwb3J0ID09IFwiRE9NTW91c2VTY3JvbGxcIiApIHtcbiAgICBfYWRkV2hlZWxMaXN0ZW5lciggZWxlbSwgXCJNb3pNb3VzZVBpeGVsU2Nyb2xsXCIsIGNhbGxiYWNrLCB1c2VDYXB0dXJlICk7XG4gIH1cbn07IiwiLy8gaHR0cDovL3BhdWxpcmlzaC5jb20vMjAxMS9yZXF1ZXN0YW5pbWF0aW9uZnJhbWUtZm9yLXNtYXJ0LWFuaW1hdGluZy9cbi8vIGh0dHA6Ly9teS5vcGVyYS5jb20vZW1vbGxlci9ibG9nLzIwMTEvMTIvMjAvcmVxdWVzdGFuaW1hdGlvbmZyYW1lLWZvci1zbWFydC1lci1hbmltYXRpbmdcbiBcbi8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSBwb2x5ZmlsbCBieSBFcmlrIE3DtmxsZXIuIGZpeGVzIGZyb20gUGF1bCBJcmlzaCBhbmQgVGlubyBaaWpkZWxcbiBcbi8vIE1JVCBsaWNlbnNlXG52YXIgbGFzdFRpbWUgPSAwO1xudmFyIHZlbmRvcnMgPSBbJ21zJywgJ21veicsICd3ZWJraXQnLCAnbyddO1xuZm9yKHZhciB4ID0gMDsgeCA8IHZlbmRvcnMubGVuZ3RoICYmICF3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lOyArK3gpIHtcbiAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gd2luZG93W3ZlbmRvcnNbeF0rJ1JlcXVlc3RBbmltYXRpb25GcmFtZSddO1xuICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSA9IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxBbmltYXRpb25GcmFtZSddIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUnXTtcbn1cblxuaWYgKCF3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKVxuICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSBmdW5jdGlvbihjYWxsYmFjaywgZWxlbWVudCkge1xuICAgICAgICB2YXIgY3VyclRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgdmFyIHRpbWVUb0NhbGwgPSBNYXRoLm1heCgwLCAxNiAtIChjdXJyVGltZSAtIGxhc3RUaW1lKSk7XG4gICAgICAgIHZhciBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBjYWxsYmFjayhjdXJyVGltZSArIHRpbWVUb0NhbGwpOyB9LCBcbiAgICAgICAgICB0aW1lVG9DYWxsKTtcbiAgICAgICAgbGFzdFRpbWUgPSBjdXJyVGltZSArIHRpbWVUb0NhbGw7XG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9O1xuXG5pZiAoIXdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSlcbiAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgPSBmdW5jdGlvbihpZCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgIH07XG4iLCJcInVzZSBzdHJpY3RcIlxuXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZShcImV2ZW50c1wiKS5FdmVudEVtaXR0ZXJcbiAgLCB1dGlsICAgICAgICAgPSByZXF1aXJlKFwidXRpbFwiKVxuICAsIGRvbXJlYWR5ICAgICA9IHJlcXVpcmUoXCJkb21yZWFkeVwiKVxuICAsIHZrZXkgICAgICAgICA9IHJlcXVpcmUoXCJ2a2V5XCIpXG4gICwgaW52ZXJ0ICAgICAgID0gcmVxdWlyZShcImludmVydC1oYXNoXCIpXG4gICwgdW5pcSAgICAgICAgID0gcmVxdWlyZShcInVuaXFcIilcbiAgLCBic2VhcmNoICAgICAgPSByZXF1aXJlKFwiYmluYXJ5LXNlYXJjaC1ib3VuZHNcIilcbiAgLCBpb3RhICAgICAgICAgPSByZXF1aXJlKFwiaW90YS1hcnJheVwiKVxuICAsIG1pbiAgICAgICAgICA9IE1hdGgubWluXG5cbi8vQnJvd3NlciBjb21wYXRpYmlsaXR5IGhhY2tzXG5yZXF1aXJlKFwiLi9saWIvcmFmLXBvbHlmaWxsLmpzXCIpXG52YXIgYWRkTW91c2VXaGVlbCA9IHJlcXVpcmUoXCIuL2xpYi9tb3VzZXdoZWVsLXBvbHlmaWxsLmpzXCIpXG52YXIgaHJ0aW1lID0gcmVxdWlyZShcIi4vbGliL2hydGltZS1wb2x5ZmlsbC5qc1wiKVxuXG4vL1JlbW92ZSBhbmdsZSBicmFjZXMgYW5kIG90aGVyIHVzZWxlc3MgY3JhcFxudmFyIGZpbHRlcmVkX3ZrZXkgPSAoZnVuY3Rpb24oKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkoMjU2KVxuICAgICwgaSwgaiwga1xuICBmb3IoaT0wOyBpPDI1NjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gXCJVTktcIlxuICB9XG4gIGZvcihpIGluIHZrZXkpIHtcbiAgICBrID0gdmtleVtpXVxuICAgIGlmKGsuY2hhckF0KDApID09PSAnPCcgJiYgay5jaGFyQXQoay5sZW5ndGgtMSkgPT09ICc+Jykge1xuICAgICAgayA9IGsuc3Vic3RyaW5nKDEsIGsubGVuZ3RoLTEpXG4gICAgfVxuICAgIGsgPSBrLnJlcGxhY2UoL1xccy9nLCBcIi1cIilcbiAgICByZXN1bHRbcGFyc2VJbnQoaSldID0ga1xuICB9XG4gIHJldHVybiByZXN1bHRcbn0pKClcblxuLy9Db21wdXRlIG1pbmltYWwgY29tbW9uIHNldCBvZiBrZXlib2FyZCBmdW5jdGlvbnNcbnZhciBrZXlOYW1lcyA9IHVuaXEoT2JqZWN0LmtleXMoaW52ZXJ0KGZpbHRlcmVkX3ZrZXkpKSlcblxuLy9UcmFuc2xhdGVzIGEgdmlydHVhbCBrZXljb2RlIHRvIGEgbm9ybWFsaXplZCBrZXljb2RlXG5mdW5jdGlvbiB2aXJ0dWFsS2V5Q29kZShrZXkpIHtcbiAgcmV0dXJuIGJzZWFyY2guZXEoa2V5TmFtZXMsIGtleSlcbn1cblxuLy9NYXBzIGEgcGh5c2ljYWwga2V5Y29kZSB0byBhIG5vcm1hbGl6ZWQga2V5Y29kZVxuZnVuY3Rpb24gcGh5c2ljYWxLZXlDb2RlKGtleSkge1xuICByZXR1cm4gdmlydHVhbEtleUNvZGUoZmlsdGVyZWRfdmtleVtrZXldKVxufVxuXG4vL0dhbWUgc2hlbGxcbmZ1bmN0aW9uIEdhbWVTaGVsbCgpIHtcbiAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcbiAgdGhpcy5fY3VyS2V5U3RhdGUgID0gbmV3IEFycmF5KGtleU5hbWVzLmxlbmd0aClcbiAgdGhpcy5fcHJlc3NDb3VudCAgID0gbmV3IEFycmF5KGtleU5hbWVzLmxlbmd0aClcbiAgdGhpcy5fcmVsZWFzZUNvdW50ID0gbmV3IEFycmF5KGtleU5hbWVzLmxlbmd0aClcbiAgXG4gIHRoaXMuX3RpY2tJbnRlcnZhbCA9IG51bGxcbiAgdGhpcy5fcmFmSGFuZGxlID0gbnVsbFxuICB0aGlzLl90aWNrUmF0ZSA9IDBcbiAgdGhpcy5fbGFzdFRpY2sgPSBocnRpbWUoKVxuICB0aGlzLl9mcmFtZVRpbWUgPSAwLjBcbiAgdGhpcy5fcGF1c2VkID0gdHJ1ZVxuICB0aGlzLl93aWR0aCA9IDBcbiAgdGhpcy5faGVpZ2h0ID0gMFxuICBcbiAgdGhpcy5fd2FudEZ1bGxzY3JlZW4gPSBmYWxzZVxuICB0aGlzLl93YW50UG9pbnRlckxvY2sgPSBmYWxzZVxuICB0aGlzLl9mdWxsc2NyZWVuQWN0aXZlID0gZmFsc2VcbiAgdGhpcy5fcG9pbnRlckxvY2tBY3RpdmUgPSBmYWxzZVxuICBcbiAgdGhpcy5fcmVuZGVyID0gcmVuZGVyLmJpbmQodW5kZWZpbmVkLCB0aGlzKVxuXG4gIHRoaXMucHJldmVudERlZmF1bHRzID0gdHJ1ZVxuICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IGZhbHNlXG4gIFxuICBmb3IodmFyIGk9MDsgaTxrZXlOYW1lcy5sZW5ndGg7ICsraSkge1xuICAgIHRoaXMuX2N1cktleVN0YXRlW2ldID0gZmFsc2VcbiAgICB0aGlzLl9wcmVzc0NvdW50W2ldID0gdGhpcy5fcmVsZWFzZUNvdW50W2ldID0gMFxuICB9XG4gIFxuICAvL1B1YmxpYyBtZW1iZXJzXG4gIHRoaXMuZWxlbWVudCA9IG51bGxcbiAgdGhpcy5iaW5kaW5ncyA9IHt9XG4gIHRoaXMuZnJhbWVTa2lwID0gMTAwLjBcbiAgdGhpcy50aWNrQ291bnQgPSAwXG4gIHRoaXMuZnJhbWVDb3VudCA9IDBcbiAgdGhpcy5zdGFydFRpbWUgPSBocnRpbWUoKVxuICB0aGlzLnRpY2tUaW1lID0gdGhpcy5fdGlja1JhdGVcbiAgdGhpcy5mcmFtZVRpbWUgPSAxMC4wXG4gIHRoaXMuc3RpY2t5RnVsbHNjcmVlbiA9IGZhbHNlXG4gIHRoaXMuc3RpY2t5UG9pbnRlckxvY2sgPSBmYWxzZVxuICBcbiAgLy9TY3JvbGwgc3R1ZmZcbiAgdGhpcy5zY3JvbGwgPSBbMCwwLDBdXG4gICAgXG4gIC8vTW91c2Ugc3RhdGVcbiAgdGhpcy5tb3VzZVggPSAwXG4gIHRoaXMubW91c2VZID0gMFxuICB0aGlzLnByZXZNb3VzZVggPSAwXG4gIHRoaXMucHJldk1vdXNlWSA9IDBcbn1cblxudXRpbC5pbmhlcml0cyhHYW1lU2hlbGwsIEV2ZW50RW1pdHRlcilcblxudmFyIHByb3RvID0gR2FtZVNoZWxsLnByb3RvdHlwZVxuXG4vL0JpbmQga2V5bmFtZXNcbnByb3RvLmtleU5hbWVzID0ga2V5TmFtZXNcblxuLy9CaW5kcyBhIHZpcnR1YWwga2V5Ym9hcmQgZXZlbnQgdG8gYSBwaHlzaWNhbCBrZXlcbnByb3RvLmJpbmQgPSBmdW5jdGlvbih2aXJ0dWFsX2tleSkge1xuICAvL0xvb2sgdXAgcHJldmlvdXMga2V5IGJpbmRpbmdzXG4gIHZhciBhcnJcbiAgaWYodmlydHVhbF9rZXkgaW4gdGhpcy5iaW5kaW5ncykge1xuICAgIGFyciA9IHRoaXMuYmluZGluZ3NbdmlydHVhbF9rZXldXG4gIH0gZWxzZSB7XG4gICAgYXJyID0gW11cbiAgfVxuICAvL0FkZCBrZXlzIHRvIGxpc3RcbiAgdmFyIHBoeXNpY2FsX2tleVxuICBmb3IodmFyIGk9MSwgbj1hcmd1bWVudHMubGVuZ3RoOyBpPG47ICsraSkge1xuICAgIHBoeXNpY2FsX2tleSA9IGFyZ3VtZW50c1tpXVxuICAgIGlmKHZpcnR1YWxLZXlDb2RlKHBoeXNpY2FsX2tleSkgPj0gMCkge1xuICAgICAgYXJyLnB1c2gocGh5c2ljYWxfa2V5KVxuICAgIH0gZWxzZSBpZihwaHlzaWNhbF9rZXkgaW4gdGhpcy5iaW5kaW5ncykge1xuICAgICAgdmFyIGtleWJpbmRzID0gdGhpcy5iaW5kaW5nc1twaHlzaWNhbF9rZXldXG4gICAgICBmb3IodmFyIGo9MDsgajxrZXliaW5kcy5sZW5ndGg7ICsraikge1xuICAgICAgICBhcnIucHVzaChrZXliaW5kc1tqXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgLy9SZW1vdmUgYW55IGR1cGxpY2F0ZSBrZXlzXG4gIGFyciA9IHVuaXEoYXJyKVxuICBpZihhcnIubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuYmluZGluZ3NbdmlydHVhbF9rZXldID0gYXJyXG4gIH1cbiAgdGhpcy5lbWl0KCdiaW5kJywgdmlydHVhbF9rZXksIGFycilcbn1cblxuLy9VbmJpbmRzIGEgdmlydHVhbCBrZXlib2FyZCBldmVudFxucHJvdG8udW5iaW5kID0gZnVuY3Rpb24odmlydHVhbF9rZXkpIHtcbiAgaWYodmlydHVhbF9rZXkgaW4gdGhpcy5iaW5kaW5ncykge1xuICAgIGRlbGV0ZSB0aGlzLmJpbmRpbmdzW3ZpcnR1YWxfa2V5XVxuICB9XG4gIHRoaXMuZW1pdCgndW5iaW5kJywgdmlydHVhbF9rZXkpXG59XG5cbi8vQ2hlY2tzIGlmIGEga2V5IGlzIHNldCBpbiBhIGdpdmVuIHN0YXRlXG5mdW5jdGlvbiBsb29rdXBLZXkoc3RhdGUsIGJpbmRpbmdzLCBrZXkpIHtcbiAgaWYoa2V5IGluIGJpbmRpbmdzKSB7XG4gICAgdmFyIGFyciA9IGJpbmRpbmdzW2tleV1cbiAgICBmb3IodmFyIGk9MCwgbj1hcnIubGVuZ3RoOyBpPG47ICsraSkge1xuICAgICAgaWYoc3RhdGVbdmlydHVhbEtleUNvZGUoYXJyW2ldKV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgdmFyIGtjID0gdmlydHVhbEtleUNvZGUoa2V5KVxuICBpZihrYyA+PSAwKSB7XG4gICAgcmV0dXJuIHN0YXRlW2tjXVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG4vL0NoZWNrcyBpZiBhIGtleSBpcyBzZXQgaW4gYSBnaXZlbiBzdGF0ZVxuZnVuY3Rpb24gbG9va3VwQ291bnQoc3RhdGUsIGJpbmRpbmdzLCBrZXkpIHtcbiAgaWYoa2V5IGluIGJpbmRpbmdzKSB7XG4gICAgdmFyIGFyciA9IGJpbmRpbmdzW2tleV0sIHIgPSAwXG4gICAgZm9yKHZhciBpPTAsIG49YXJyLmxlbmd0aDsgaTxuOyArK2kpIHtcbiAgICAgIHIgKz0gc3RhdGVbdmlydHVhbEtleUNvZGUoYXJyW2ldKV1cbiAgICB9XG4gICAgcmV0dXJuIHJcbiAgfVxuICB2YXIga2MgPSB2aXJ0dWFsS2V5Q29kZShrZXkpXG4gIGlmKGtjID49IDApIHtcbiAgICByZXR1cm4gc3RhdGVba2NdXG4gIH1cbiAgcmV0dXJuIDBcbn1cblxuLy9DaGVja3MgaWYgYSBrZXkgKGVpdGhlciBwaHlzaWNhbCBvciB2aXJ0dWFsKSBpcyBjdXJyZW50bHkgaGVsZCBkb3duXG5wcm90by5kb3duID0gZnVuY3Rpb24oa2V5KSB7XG4gIHJldHVybiBsb29rdXBLZXkodGhpcy5fY3VyS2V5U3RhdGUsIHRoaXMuYmluZGluZ3MsIGtleSlcbn1cblxuLy9DaGVja3MgaWYgYSBrZXkgd2FzIGV2ZXIgZG93blxucHJvdG8ud2FzRG93biA9IGZ1bmN0aW9uKGtleSkge1xuICByZXR1cm4gdGhpcy5kb3duKGtleSkgfHwgISF0aGlzLnByZXNzKGtleSlcbn1cblxuLy9PcHBvc2l0ZSBvZiBkb3duXG5wcm90by51cCA9IGZ1bmN0aW9uKGtleSkge1xuICByZXR1cm4gIXRoaXMuZG93bihrZXkpXG59XG5cbi8vQ2hlY2tzIGlmIGEga2V5IHdhcyByZWxlYXNlZCBkdXJpbmcgcHJldmlvdXMgZnJhbWVcbnByb3RvLndhc1VwID0gZnVuY3Rpb24oa2V5KSB7XG4gIHJldHVybiB0aGlzLnVwKGtleSkgfHwgISF0aGlzLnJlbGVhc2Uoa2V5KVxufVxuXG4vL1JldHVybnMgdGhlIG51bWJlciBvZiB0aW1lcyBhIGtleSB3YXMgcHJlc3NlZCBzaW5jZSBsYXN0IHRpY2tcbnByb3RvLnByZXNzID0gZnVuY3Rpb24oa2V5KSB7XG4gIHJldHVybiBsb29rdXBDb3VudCh0aGlzLl9wcmVzc0NvdW50LCB0aGlzLmJpbmRpbmdzLCBrZXkpXG59XG5cbi8vUmV0dXJucyB0aGUgbnVtYmVyIG9mIHRpbWVzIGEga2V5IHdhcyByZWxlYXNlZCBzaW5jZSBsYXN0IHRpY2tcbnByb3RvLnJlbGVhc2UgPSBmdW5jdGlvbihrZXkpIHtcbiAgcmV0dXJuIGxvb2t1cENvdW50KHRoaXMuX3JlbGVhc2VDb3VudCwgdGhpcy5iaW5kaW5ncywga2V5KVxufVxuXG4vL1BhdXNlL3VucGF1c2UgdGhlIGdhbWUgbG9vcFxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCBcInBhdXNlZFwiLCB7XG4gIGdldDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3BhdXNlZFxuICB9LFxuICBzZXQ6IGZ1bmN0aW9uKHN0YXRlKSB7XG4gICAgdmFyIG5zID0gISFzdGF0ZVxuICAgIGlmKG5zICE9PSB0aGlzLl9wYXVzZWQpIHtcbiAgICAgIGlmKCF0aGlzLl9wYXVzZWQpIHtcbiAgICAgICAgdGhpcy5fcGF1c2VkID0gdHJ1ZVxuICAgICAgICB0aGlzLl9mcmFtZVRpbWUgPSBtaW4oMS4wLCAoaHJ0aW1lKCkgLSB0aGlzLl9sYXN0VGljaykgLyB0aGlzLl90aWNrUmF0ZSlcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl90aWNrSW50ZXJ2YWwpXG4gICAgICAgIC8vY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5fcmFmSGFuZGxlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcGF1c2VkID0gZmFsc2VcbiAgICAgICAgdGhpcy5fbGFzdFRpY2sgPSBocnRpbWUoKSAtIE1hdGguZmxvb3IodGhpcy5fZnJhbWVUaW1lICogdGhpcy5fdGlja1JhdGUpXG4gICAgICAgIHRoaXMuX3RpY2tJbnRlcnZhbCA9IHNldEludGVydmFsKHRpY2ssIHRoaXMuX3RpY2tSYXRlLCB0aGlzKVxuICAgICAgICB0aGlzLl9yYWZIYW5kbGUgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5fcmVuZGVyKVxuICAgICAgfVxuICAgIH1cbiAgfVxufSlcblxuLy9GdWxsc2NyZWVuIHN0YXRlIHRvZ2dsZVxuXG5mdW5jdGlvbiB0cnlGdWxsc2NyZWVuKHNoZWxsKSB7XG4gIC8vUmVxdWVzdCBmdWxsIHNjcmVlblxuICB2YXIgZWxlbSA9IHNoZWxsLmVsZW1lbnRcbiAgXG4gIGlmKHNoZWxsLl93YW50RnVsbHNjcmVlbiAmJiAhc2hlbGwuX2Z1bGxzY3JlZW5BY3RpdmUpIHtcbiAgICB2YXIgZnMgPSBlbGVtLnJlcXVlc3RGdWxsc2NyZWVuIHx8XG4gICAgICAgICAgICAgZWxlbS5yZXF1ZXN0RnVsbFNjcmVlbiB8fFxuICAgICAgICAgICAgIGVsZW0ud2Via2l0UmVxdWVzdEZ1bGxzY3JlZW4gfHxcbiAgICAgICAgICAgICBlbGVtLndlYmtpdFJlcXVlc3RGdWxsU2NyZWVuIHx8XG4gICAgICAgICAgICAgZWxlbS5tb3pSZXF1ZXN0RnVsbHNjcmVlbiB8fFxuICAgICAgICAgICAgIGVsZW0ubW96UmVxdWVzdEZ1bGxTY3JlZW4gfHxcbiAgICAgICAgICAgICBmdW5jdGlvbigpIHt9XG4gICAgZnMuY2FsbChlbGVtKVxuICB9XG4gIGlmKHNoZWxsLl93YW50UG9pbnRlckxvY2sgJiYgIXNoZWxsLl9wb2ludGVyTG9ja0FjdGl2ZSkge1xuICAgIHZhciBwbCA9ICBlbGVtLnJlcXVlc3RQb2ludGVyTG9jayB8fFxuICAgICAgICAgICAgICBlbGVtLndlYmtpdFJlcXVlc3RQb2ludGVyTG9jayB8fFxuICAgICAgICAgICAgICBlbGVtLm1velJlcXVlc3RQb2ludGVyTG9jayB8fFxuICAgICAgICAgICAgICBlbGVtLm1zUmVxdWVzdFBvaW50ZXJMb2NrIHx8XG4gICAgICAgICAgICAgIGVsZW0ub1JlcXVlc3RQb2ludGVyTG9jayB8fFxuICAgICAgICAgICAgICBmdW5jdGlvbigpIHt9XG4gICAgcGwuY2FsbChlbGVtKVxuICB9XG59XG5cbnZhciBjYW5jZWxGdWxsc2NyZWVuID0gZG9jdW1lbnQuZXhpdEZ1bGxzY3JlZW4gfHxcbiAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuY2FuY2VsRnVsbHNjcmVlbiB8fCAgLy9XaHkgY2FuIG5vIG9uZSBhZ3JlZSBvbiB0aGlzP1xuICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5jYW5jZWxGdWxsU2NyZWVuIHx8XG4gICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LndlYmtpdENhbmNlbEZ1bGxzY3JlZW4gfHxcbiAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQud2Via2l0Q2FuY2VsRnVsbFNjcmVlbiB8fFxuICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5tb3pDYW5jZWxGdWxsc2NyZWVuIHx8XG4gICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50Lm1vekNhbmNlbEZ1bGxTY3JlZW4gfHxcbiAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oKXt9XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm90bywgXCJmdWxsc2NyZWVuXCIsIHtcbiAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fZnVsbHNjcmVlbkFjdGl2ZVxuICB9LFxuICBzZXQ6IGZ1bmN0aW9uKHN0YXRlKSB7XG4gICAgdmFyIG5zID0gISFzdGF0ZVxuICAgIGlmKCFucykge1xuICAgICAgdGhpcy5fd2FudEZ1bGxzY3JlZW4gPSBmYWxzZVxuICAgICAgY2FuY2VsRnVsbHNjcmVlbi5jYWxsKGRvY3VtZW50KVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl93YW50RnVsbHNjcmVlbiA9IHRydWVcbiAgICAgIHRyeUZ1bGxzY3JlZW4odGhpcylcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2Z1bGxzY3JlZW5BY3RpdmVcbiAgfVxufSlcblxuZnVuY3Rpb24gaGFuZGxlRnVsbHNjcmVlbihzaGVsbCkge1xuICBzaGVsbC5fZnVsbHNjcmVlbkFjdGl2ZSA9IGRvY3VtZW50LmZ1bGxzY3JlZW4gfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5tb3pGdWxsU2NyZWVuIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQud2Via2l0SXNGdWxsU2NyZWVuIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmFsc2VcbiAgaWYoIXNoZWxsLnN0aWNreUZ1bGxzY3JlZW4gJiYgc2hlbGwuX2Z1bGxzY3JlZW5BY3RpdmUpIHtcbiAgICBzaGVsbC5fd2FudEZ1bGxzY3JlZW4gPSBmYWxzZVxuICB9XG59XG5cbi8vUG9pbnRlciBsb2NrIHN0YXRlIHRvZ2dsZVxudmFyIGV4aXRQb2ludGVyTG9jayA9IGRvY3VtZW50LmV4aXRQb2ludGVyTG9jayB8fFxuICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LndlYmtpdEV4aXRQb2ludGVyTG9jayB8fFxuICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50Lm1vekV4aXRQb2ludGVyTG9jayB8fFxuICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCkge31cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCBcInBvaW50ZXJMb2NrXCIsIHtcbiAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fcG9pbnRlckxvY2tBY3RpdmVcbiAgfSxcbiAgc2V0OiBmdW5jdGlvbihzdGF0ZSkge1xuICAgIHZhciBucyA9ICEhc3RhdGVcbiAgICBpZighbnMpIHtcbiAgICAgIHRoaXMuX3dhbnRQb2ludGVyTG9jayA9IGZhbHNlXG4gICAgICBleGl0UG9pbnRlckxvY2suY2FsbChkb2N1bWVudClcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fd2FudFBvaW50ZXJMb2NrID0gdHJ1ZVxuICAgICAgdHJ5RnVsbHNjcmVlbih0aGlzKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fcG9pbnRlckxvY2tBY3RpdmVcbiAgfVxufSlcblxuZnVuY3Rpb24gaGFuZGxlUG9pbnRlckxvY2tDaGFuZ2Uoc2hlbGwsIGV2ZW50KSB7XG4gIHNoZWxsLl9wb2ludGVyTG9ja0FjdGl2ZSA9IHNoZWxsLmVsZW1lbnQgPT09IChcbiAgICAgIGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCB8fFxuICAgICAgZG9jdW1lbnQubW96UG9pbnRlckxvY2tFbGVtZW50IHx8XG4gICAgICBkb2N1bWVudC53ZWJraXRQb2ludGVyTG9ja0VsZW1lbnQgfHxcbiAgICAgIG51bGwpXG4gIGlmKCFzaGVsbC5zdGlja3lQb2ludGVyTG9jayAmJiBzaGVsbC5fcG9pbnRlckxvY2tBY3RpdmUpIHtcbiAgICBzaGVsbC5fd2FudFBvaW50ZXJMb2NrID0gZmFsc2VcbiAgfVxufVxuXG4vL1dpZHRoIGFuZCBoZWlnaHRcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm90bywgXCJ3aWR0aFwiLCB7XG4gIGdldDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZWxlbWVudC5jbGllbnRXaWR0aFxuICB9XG59KVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCBcImhlaWdodFwiLCB7XG4gIGdldDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZWxlbWVudC5jbGllbnRIZWlnaHRcbiAgfVxufSlcblxuLy9TZXQga2V5IHN0YXRlXG5mdW5jdGlvbiBzZXRLZXlTdGF0ZShzaGVsbCwga2V5LCBzdGF0ZSkge1xuICB2YXIgcHMgPSBzaGVsbC5fY3VyS2V5U3RhdGVba2V5XVxuICBpZihwcyAhPT0gc3RhdGUpIHtcbiAgICBpZihzdGF0ZSkge1xuICAgICAgc2hlbGwuX3ByZXNzQ291bnRba2V5XSsrXG4gICAgfSBlbHNlIHtcbiAgICAgIHNoZWxsLl9yZWxlYXNlQ291bnRba2V5XSsrXG4gICAgfVxuICAgIHNoZWxsLl9jdXJLZXlTdGF0ZVtrZXldID0gc3RhdGVcbiAgfVxufVxuXG4vL1RpY2tzIHRoZSBnYW1lIHN0YXRlIG9uZSB1cGRhdGVcbmZ1bmN0aW9uIHRpY2soc2hlbGwpIHtcbiAgdmFyIHNraXAgPSBocnRpbWUoKSArIHNoZWxsLmZyYW1lU2tpcFxuICAgICwgcENvdW50ID0gc2hlbGwuX3ByZXNzQ291bnRcbiAgICAsIHJDb3VudCA9IHNoZWxsLl9yZWxlYXNlQ291bnRcbiAgICAsIGksIHMsIHRcbiAgICAsIHRyID0gc2hlbGwuX3RpY2tSYXRlXG4gICAgLCBuID0ga2V5TmFtZXMubGVuZ3RoXG4gIHdoaWxlKCFzaGVsbC5fcGF1c2VkICYmXG4gICAgICAgIGhydGltZSgpID49IHNoZWxsLl9sYXN0VGljayArIHRyKSB7XG4gICAgXG4gICAgLy9Ta2lwIGZyYW1lcyBpZiB3ZSBhcmUgb3ZlciBidWRnZXRcbiAgICBpZihocnRpbWUoKSA+IHNraXApIHtcbiAgICAgIHNoZWxsLl9sYXN0VGljayA9IGhydGltZSgpICsgdHJcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBcbiAgICAvL1RpY2sgdGhlIGdhbWVcbiAgICBzID0gaHJ0aW1lKClcbiAgICBzaGVsbC5lbWl0KFwidGlja1wiKVxuICAgIHQgPSBocnRpbWUoKVxuICAgIHNoZWxsLnRpY2tUaW1lID0gdCAtIHNcbiAgICBcbiAgICAvL1VwZGF0ZSBjb3VudGVycyBhbmQgdGltZVxuICAgICsrc2hlbGwudGlja0NvdW50XG4gICAgc2hlbGwuX2xhc3RUaWNrICs9IHRyXG4gICAgXG4gICAgLy9TaGlmdCBpbnB1dCBzdGF0ZVxuICAgIGZvcihpPTA7IGk8bjsgKytpKSB7XG4gICAgICBwQ291bnRbaV0gPSByQ291bnRbaV0gPSAwXG4gICAgfVxuICAgIGlmKHNoZWxsLl9wb2ludGVyTG9ja0FjdGl2ZSkge1xuICAgICAgc2hlbGwucHJldk1vdXNlWCA9IHNoZWxsLm1vdXNlWCA9IHNoZWxsLndpZHRoPj4xXG4gICAgICBzaGVsbC5wcmV2TW91c2VZID0gc2hlbGwubW91c2VZID0gc2hlbGwuaGVpZ2h0Pj4xXG4gICAgfSBlbHNlIHtcbiAgICAgIHNoZWxsLnByZXZNb3VzZVggPSBzaGVsbC5tb3VzZVhcbiAgICAgIHNoZWxsLnByZXZNb3VzZVkgPSBzaGVsbC5tb3VzZVlcbiAgICB9XG4gICAgc2hlbGwuc2Nyb2xsWzBdID0gc2hlbGwuc2Nyb2xsWzFdID0gc2hlbGwuc2Nyb2xsWzJdID0gMFxuICB9XG59XG5cbi8vUmVuZGVyIHN0dWZmXG5mdW5jdGlvbiByZW5kZXIoc2hlbGwpIHtcblxuICAvL1JlcXVlc3QgbmV4dCBmcmFtZVxuICBzaGVsbC5fcmFmSGFuZGxlID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHNoZWxsLl9yZW5kZXIpXG5cbiAgLy9UaWNrIHRoZSBzaGVsbFxuICB0aWNrKHNoZWxsKVxuICBcbiAgLy9Db21wdXRlIGZyYW1lIHRpbWVcbiAgdmFyIGR0XG4gIGlmKHNoZWxsLl9wYXVzZWQpIHtcbiAgICBkdCA9IHNoZWxsLl9mcmFtZVRpbWVcbiAgfSBlbHNlIHtcbiAgICBkdCA9IG1pbigxLjAsIChocnRpbWUoKSAtIHNoZWxsLl9sYXN0VGljaykgLyBzaGVsbC5fdGlja1JhdGUpXG4gIH1cbiAgXG4gIC8vRHJhdyBhIGZyYW1lXG4gICsrc2hlbGwuZnJhbWVDb3VudFxuICB2YXIgcyA9IGhydGltZSgpXG4gIHNoZWxsLmVtaXQoXCJyZW5kZXJcIiwgZHQpXG4gIHZhciB0ID0gaHJ0aW1lKClcbiAgc2hlbGwuZnJhbWVUaW1lID0gdCAtIHNcbiAgXG59XG5cbmZ1bmN0aW9uIGlzRm9jdXNlZChzaGVsbCkge1xuICByZXR1cm4gKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHx8XG4gICAgICAgICAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gc2hlbGwuZWxlbWVudClcbn1cblxuZnVuY3Rpb24gaGFuZGxlRXZlbnQoc2hlbGwsIGV2KSB7XG4gIGlmKHNoZWxsLnByZXZlbnREZWZhdWx0cykge1xuICAgIGV2LnByZXZlbnREZWZhdWx0KClcbiAgfVxuICBpZihzaGVsbC5zdG9wUHJvcGFnYXRpb24pIHtcbiAgICBldi5zdG9wUHJvcGFnYXRpb24oKVxuICB9XG59XG5cbi8vU2V0IGtleSB1cFxuZnVuY3Rpb24gaGFuZGxlS2V5VXAoc2hlbGwsIGV2KSB7XG4gIGhhbmRsZUV2ZW50KHNoZWxsLCBldilcbiAgdmFyIGtjID0gcGh5c2ljYWxLZXlDb2RlKGV2LmtleUNvZGUgfHwgZXYuY2hhciB8fCBldi53aGljaCB8fCBldi5jaGFyQ29kZSlcbiAgaWYoa2MgPj0gMCkge1xuICAgIHNldEtleVN0YXRlKHNoZWxsLCBrYywgZmFsc2UpXG4gIH1cbn1cblxuLy9TZXQga2V5IGRvd25cbmZ1bmN0aW9uIGhhbmRsZUtleURvd24oc2hlbGwsIGV2KSB7XG4gIGlmKCFpc0ZvY3VzZWQoc2hlbGwpKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgaGFuZGxlRXZlbnQoc2hlbGwsIGV2KVxuICBpZihldi5tZXRhS2V5KSB7XG4gICAgLy9IYWNrOiBDbGVhciBrZXkgc3RhdGUgd2hlbiBtZXRhIGdldHMgcHJlc3NlZCB0byBwcmV2ZW50IGtleXMgc3RpY2tpbmdcbiAgICBoYW5kbGVCbHVyKHNoZWxsLCBldilcbiAgfSBlbHNlIHtcbiAgICB2YXIga2MgPSBwaHlzaWNhbEtleUNvZGUoZXYua2V5Q29kZSB8fCBldi5jaGFyIHx8IGV2LndoaWNoIHx8IGV2LmNoYXJDb2RlKVxuICAgIGlmKGtjID49IDApIHtcbiAgICAgIHNldEtleVN0YXRlKHNoZWxsLCBrYywgdHJ1ZSlcbiAgICB9XG4gIH1cbn1cblxuLy9Nb3VzZSBldmVudHMgYXJlIHJlYWxseSBhbm5veWluZ1xudmFyIG1vdXNlQ29kZXMgPSBpb3RhKDMyKS5tYXAoZnVuY3Rpb24obikge1xuICByZXR1cm4gdmlydHVhbEtleUNvZGUoXCJtb3VzZS1cIiArIChuKzEpKVxufSlcblxuZnVuY3Rpb24gc2V0TW91c2VCdXR0b25zKHNoZWxsLCBidXR0b25zKSB7XG4gIGZvcih2YXIgaT0wOyBpPDMyOyArK2kpIHtcbiAgICBzZXRLZXlTdGF0ZShzaGVsbCwgbW91c2VDb2Rlc1tpXSwgISEoYnV0dG9ucyAmICgxPDxpKSkpXG4gIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlTW91c2VNb3ZlKHNoZWxsLCBldikge1xuICBoYW5kbGVFdmVudChzaGVsbCwgZXYpXG4gIGlmKHNoZWxsLl9wb2ludGVyTG9ja0FjdGl2ZSkge1xuICAgIHZhciBtb3ZlbWVudFggPSBldi5tb3ZlbWVudFggICAgICAgfHxcbiAgICAgICAgICAgICAgICAgICAgZXYubW96TW92ZW1lbnRYICAgIHx8XG4gICAgICAgICAgICAgICAgICAgIGV2LndlYmtpdE1vdmVtZW50WCB8fFxuICAgICAgICAgICAgICAgICAgICAwLFxuICAgICAgICBtb3ZlbWVudFkgPSBldi5tb3ZlbWVudFkgICAgICAgfHxcbiAgICAgICAgICAgICAgICAgICAgZXYubW96TW92ZW1lbnRZICAgIHx8XG4gICAgICAgICAgICAgICAgICAgIGV2LndlYmtpdE1vdmVtZW50WSB8fFxuICAgICAgICAgICAgICAgICAgICAwXG4gICAgc2hlbGwubW91c2VYICs9IG1vdmVtZW50WFxuICAgIHNoZWxsLm1vdXNlWSArPSBtb3ZlbWVudFlcbiAgfSBlbHNlIHtcbiAgICBzaGVsbC5tb3VzZVggPSBldi5jbGllbnRYIC0gc2hlbGwuZWxlbWVudC5vZmZzZXRMZWZ0XG4gICAgc2hlbGwubW91c2VZID0gZXYuY2xpZW50WSAtIHNoZWxsLmVsZW1lbnQub2Zmc2V0VG9wXG4gIH1cbiAgcmV0dXJuIGZhbHNlXG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1vdXNlRG93bihzaGVsbCwgZXYpIHtcbiAgaGFuZGxlRXZlbnQoc2hlbGwsIGV2KVxuICBzZXRLZXlTdGF0ZShzaGVsbCwgbW91c2VDb2Rlc1tldi5idXR0b25dLCB0cnVlKVxuICByZXR1cm4gZmFsc2Vcbn1cblxuZnVuY3Rpb24gaGFuZGxlTW91c2VVcChzaGVsbCwgZXYpIHtcbiAgaGFuZGxlRXZlbnQoc2hlbGwsIGV2KVxuICBzZXRLZXlTdGF0ZShzaGVsbCwgbW91c2VDb2Rlc1tldi5idXR0b25dLCBmYWxzZSlcbiAgcmV0dXJuIGZhbHNlXG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1vdXNlRW50ZXIoc2hlbGwsIGV2KSB7XG4gIGhhbmRsZUV2ZW50KHNoZWxsLCBldilcbiAgaWYoc2hlbGwuX3BvaW50ZXJMb2NrQWN0aXZlKSB7XG4gICAgc2hlbGwucHJldk1vdXNlWCA9IHNoZWxsLm1vdXNlWCA9IHNoZWxsLndpZHRoPj4xXG4gICAgc2hlbGwucHJldk1vdXNlWSA9IHNoZWxsLm1vdXNlWSA9IHNoZWxsLmhlaWdodD4+MVxuICB9IGVsc2Uge1xuICAgIHNoZWxsLnByZXZNb3VzZVggPSBzaGVsbC5tb3VzZVggPSBldi5jbGllbnRYIC0gc2hlbGwuZWxlbWVudC5vZmZzZXRMZWZ0XG4gICAgc2hlbGwucHJldk1vdXNlWSA9IHNoZWxsLm1vdXNlWSA9IGV2LmNsaWVudFkgLSBzaGVsbC5lbGVtZW50Lm9mZnNldFRvcFxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBoYW5kbGVNb3VzZUxlYXZlKHNoZWxsLCBldikge1xuICBoYW5kbGVFdmVudChzaGVsbCwgZXYpXG4gIHNldE1vdXNlQnV0dG9ucyhzaGVsbCwgMClcbiAgcmV0dXJuIGZhbHNlXG59XG5cbi8vSGFuZGxlIG1vdXNlIHdoZWVsIGV2ZW50c1xuZnVuY3Rpb24gaGFuZGxlTW91c2VXaGVlbChzaGVsbCwgZXYpIHtcbiAgaGFuZGxlRXZlbnQoc2hlbGwsIGV2KVxuICB2YXIgc2NhbGUgPSAxXG4gIHN3aXRjaChldi5kZWx0YU1vZGUpIHtcbiAgICBjYXNlIDA6IC8vUGl4ZWxcbiAgICAgIHNjYWxlID0gMVxuICAgIGJyZWFrXG4gICAgY2FzZSAxOiAvL0xpbmVcbiAgICAgIHNjYWxlID0gMTJcbiAgICBicmVha1xuICAgIGNhc2UgMjogLy9QYWdlXG4gICAgICAgc2NhbGUgPSBzaGVsbC5oZWlnaHRcbiAgICBicmVha1xuICB9XG4gIC8vQWRkIHNjcm9sbFxuICBzaGVsbC5zY3JvbGxbMF0gKz0gIGV2LmRlbHRhWCAqIHNjYWxlXG4gIHNoZWxsLnNjcm9sbFsxXSArPSAgZXYuZGVsdGFZICogc2NhbGVcbiAgc2hlbGwuc2Nyb2xsWzJdICs9IChldi5kZWx0YVogKiBzY2FsZSl8fDAuMFxuICByZXR1cm4gZmFsc2Vcbn1cblxuZnVuY3Rpb24gaGFuZGxlQ29udGV4TWVudShzaGVsbCwgZXYpIHtcbiAgaGFuZGxlRXZlbnQoc2hlbGwsIGV2KVxuICByZXR1cm4gZmFsc2Vcbn1cblxuZnVuY3Rpb24gaGFuZGxlQmx1cihzaGVsbCwgZXYpIHtcbiAgdmFyIG4gPSBrZXlOYW1lcy5sZW5ndGhcbiAgICAsIGMgPSBzaGVsbC5fY3VyS2V5U3RhdGVcbiAgICAsIHIgPSBzaGVsbC5fcmVsZWFzZUNvdW50XG4gICAgLCBpXG4gIGZvcihpPTA7IGk8bjsgKytpKSB7XG4gICAgaWYoY1tpXSkge1xuICAgICAgKytyW2ldXG4gICAgfVxuICAgIGNbaV0gPSBmYWxzZVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBoYW5kbGVSZXNpemVFbGVtZW50KHNoZWxsLCBldikge1xuICB2YXIgdyA9IHNoZWxsLmVsZW1lbnQuY2xpZW50V2lkdGh8MFxuICB2YXIgaCA9IHNoZWxsLmVsZW1lbnQuY2xpZW50SGVpZ2h0fDBcbiAgaWYoKHcgIT09IHNoZWxsLl93aWR0aCkgfHwgKGggIT09IHNoZWxsLl9oZWlnaHQpKSB7XG4gICAgc2hlbGwuX3dpZHRoID0gd1xuICAgIHNoZWxsLl9oZWlnaHQgPSBoXG4gICAgc2hlbGwuZW1pdChcInJlc2l6ZVwiLCB3LCBoKVxuICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VEZWZhdWx0Q29udGFpbmVyKCkge1xuICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKVxuICBjb250YWluZXIudGFiaW5kZXggPSAxXG4gIGNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIlxuICBjb250YWluZXIuc3R5bGUubGVmdCA9IFwiMHB4XCJcbiAgY29udGFpbmVyLnN0eWxlLnJpZ2h0ID0gXCIwcHhcIlxuICBjb250YWluZXIuc3R5bGUudG9wID0gXCIwcHhcIlxuICBjb250YWluZXIuc3R5bGUuYm90dG9tID0gXCIwcHhcIlxuICBjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gXCIxMDAlXCJcbiAgY29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIlxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcilcbiAgZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCIgLy9QcmV2ZW50IGJvdW5jZVxuICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IFwiMTAwJVwiXG4gIHJldHVybiBjb250YWluZXJcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2hlbGwob3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICBcbiAgLy9DaGVjayBmdWxsc2NyZWVuIGFuZCBwb2ludGVyIGxvY2sgZmxhZ3NcbiAgdmFyIHVzZUZ1bGxzY3JlZW4gPSAhIW9wdGlvbnMuZnVsbHNjcmVlblxuICB2YXIgdXNlUG9pbnRlckxvY2sgPSB1c2VGdWxsc2NyZWVuXG4gIGlmKHR5cGVvZiBvcHRpb25zLnBvaW50ZXJMb2NrICE9PSB1bmRlZmluZWQpIHtcbiAgICB1c2VQb2ludGVyTG9jayA9ICEhb3B0aW9ucy5wb2ludGVyTG9ja1xuICB9XG4gIFxuICAvL0NyZWF0ZSBpbml0aWFsIHNoZWxsXG4gIHZhciBzaGVsbCA9IG5ldyBHYW1lU2hlbGwoKVxuICBzaGVsbC5fdGlja1JhdGUgPSBvcHRpb25zLnRpY2tSYXRlIHx8IDMwXG4gIHNoZWxsLmZyYW1lU2tpcCA9IG9wdGlvbnMuZnJhbWVTa2lwIHx8IChzaGVsbC5fdGlja1JhdGUrNSkgKiA1XG4gIHNoZWxsLnN0aWNreUZ1bGxzY3JlZW4gPSAhIW9wdGlvbnMuc3RpY2t5RnVsbHNjcmVlbiB8fCAhIW9wdGlvbnMuc3RpY2t5XG4gIHNoZWxsLnN0aWNreVBvaW50ZXJMb2NrID0gISFvcHRpb25zLnN0aWNreVBvaW50ZXJMb2NrIHx8ICEhb3B0aW9ucy5zdGlja3lcbiAgXG4gIC8vU2V0IGJpbmRpbmdzXG4gIGlmKG9wdGlvbnMuYmluZGluZ3MpIHtcbiAgICBzaGVsbC5iaW5kaW5ncyA9IG9wdGlvbnMuYmluZGluZ3NcbiAgfVxuICBcbiAgLy9XYWl0IGZvciBkb20gdG8gaW50aWFpbGl6ZVxuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBkb21yZWFkeShmdW5jdGlvbiBpbml0R2FtZVNoZWxsKCkge1xuICAgIFxuICAgIC8vUmV0cmlldmUgZWxlbWVudFxuICAgIHZhciBlbGVtZW50ID0gb3B0aW9ucy5lbGVtZW50XG4gICAgaWYodHlwZW9mIGVsZW1lbnQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHZhciBlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlbGVtZW50KVxuICAgICAgaWYoIWUpIHtcbiAgICAgICAgZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGVsZW1lbnQpXG4gICAgICB9XG4gICAgICBpZighZSkge1xuICAgICAgICBlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5Q2xhc3MoZWxlbWVudClbMF1cbiAgICAgIH1cbiAgICAgIGlmKCFlKSB7XG4gICAgICAgIGUgPSBtYWtlRGVmYXVsdENvbnRhaW5lcigpXG4gICAgICB9XG4gICAgICBzaGVsbC5lbGVtZW50ID0gZVxuICAgIH0gZWxzZSBpZih0eXBlb2YgZWxlbWVudCA9PT0gXCJvYmplY3RcIiAmJiAhIWVsZW1lbnQpIHtcbiAgICAgIHNoZWxsLmVsZW1lbnQgPSBlbGVtZW50XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBlbGVtZW50ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHNoZWxsLmVsZW1lbnQgPSBlbGVtZW50KClcbiAgICB9IGVsc2Uge1xuICAgICAgc2hlbGwuZWxlbWVudCA9IG1ha2VEZWZhdWx0Q29udGFpbmVyKClcbiAgICB9XG4gICAgXG4gICAgLy9EaXNhYmxlIHVzZXItc2VsZWN0XG4gICAgaWYoc2hlbGwuZWxlbWVudC5zdHlsZSkge1xuICAgICAgc2hlbGwuZWxlbWVudC5zdHlsZVtcIi13ZWJraXQtdG91Y2gtY2FsbG91dFwiXSA9IFwibm9uZVwiXG4gICAgICBzaGVsbC5lbGVtZW50LnN0eWxlW1wiLXdlYmtpdC11c2VyLXNlbGVjdFwiXSA9IFwibm9uZVwiXG4gICAgICBzaGVsbC5lbGVtZW50LnN0eWxlW1wiLWtodG1sLXVzZXItc2VsZWN0XCJdID0gXCJub25lXCJcbiAgICAgIHNoZWxsLmVsZW1lbnQuc3R5bGVbXCItbW96LXVzZXItc2VsZWN0XCJdID0gXCJub25lXCJcbiAgICAgIHNoZWxsLmVsZW1lbnQuc3R5bGVbXCItbXMtdXNlci1zZWxlY3RcIl0gPSBcIm5vbmVcIlxuICAgICAgc2hlbGwuZWxlbWVudC5zdHlsZVtcInVzZXItc2VsZWN0XCJdID0gXCJub25lXCJcbiAgICB9XG4gICAgXG4gICAgLy9Ib29rIHJlc2l6ZSBoYW5kbGVyXG4gICAgc2hlbGwuX3dpZHRoID0gc2hlbGwuZWxlbWVudC5jbGllbnRXaWR0aFxuICAgIHNoZWxsLl9oZWlnaHQgPSBzaGVsbC5lbGVtZW50LmNsaWVudEhlaWdodFxuICAgIHZhciBoYW5kbGVSZXNpemUgPSBoYW5kbGVSZXNpemVFbGVtZW50LmJpbmQodW5kZWZpbmVkLCBzaGVsbClcbiAgICBpZih0eXBlb2YgTXV0YXRpb25PYnNlcnZlciAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgdmFyIG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoaGFuZGxlUmVzaXplKVxuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShzaGVsbC5lbGVtZW50LCB7XG4gICAgICAgIGF0dHJpYnV0ZXM6IHRydWUsXG4gICAgICAgIHN1YnRyZWU6IHRydWVcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHNoZWxsLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTVN1YnRyZWVNb2RpZmllZFwiLCBoYW5kbGVSZXNpemUsIGZhbHNlKVxuICAgIH1cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBoYW5kbGVSZXNpemUsIGZhbHNlKVxuICAgIFxuICAgIC8vSG9vayBrZXlib2FyZCBsaXN0ZW5lclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duLmJpbmQodW5kZWZpbmVkLCBzaGVsbCksIGZhbHNlKVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgaGFuZGxlS2V5VXAuYmluZCh1bmRlZmluZWQsIHNoZWxsKSwgZmFsc2UpXG4gICAgXG4gICAgLy9EaXNhYmxlIHJpZ2h0IGNsaWNrXG4gICAgc2hlbGwuZWxlbWVudC5vbmNvbnRleHRtZW51ID0gaGFuZGxlQ29udGV4TWVudS5iaW5kKHVuZGVmaW5lZCwgc2hlbGwpXG4gICAgXG4gICAgLy9Ib29rIG1vdXNlIGxpc3RlbmVyc1xuICAgIHNoZWxsLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZG93blwiLCBoYW5kbGVNb3VzZURvd24uYmluZCh1bmRlZmluZWQsIHNoZWxsKSwgZmFsc2UpXG4gICAgc2hlbGwuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBoYW5kbGVNb3VzZVVwLmJpbmQodW5kZWZpbmVkLCBzaGVsbCksIGZhbHNlKVxuICAgIHNoZWxsLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBoYW5kbGVNb3VzZU1vdmUuYmluZCh1bmRlZmluZWQsIHNoZWxsKSwgZmFsc2UpXG4gICAgc2hlbGwuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2VlbnRlclwiLCBoYW5kbGVNb3VzZUVudGVyLmJpbmQodW5kZWZpbmVkLCBzaGVsbCksIGZhbHNlKVxuICAgIFxuICAgIC8vTW91c2UgbGVhdmVcbiAgICB2YXIgbGVhdmUgPSBoYW5kbGVNb3VzZUxlYXZlLmJpbmQodW5kZWZpbmVkLCBzaGVsbClcbiAgICBzaGVsbC5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsIGxlYXZlLCBmYWxzZSlcbiAgICBzaGVsbC5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW91dFwiLCBsZWF2ZSwgZmFsc2UpXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsIGxlYXZlLCBmYWxzZSlcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3V0XCIsIGxlYXZlLCBmYWxzZSlcbiAgICBcbiAgICAvL0JsdXIgZXZlbnQgXG4gICAgdmFyIGJsdXIgPSBoYW5kbGVCbHVyLmJpbmQodW5kZWZpbmVkLCBzaGVsbClcbiAgICBzaGVsbC5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJibHVyXCIsIGJsdXIsIGZhbHNlKVxuICAgIHNoZWxsLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3Vzb3V0XCIsIGJsdXIsIGZhbHNlKVxuICAgIHNoZWxsLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzXCIsIGJsdXIsIGZhbHNlKVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiYmx1clwiLCBibHVyLCBmYWxzZSlcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3Vzb3V0XCIsIGJsdXIsIGZhbHNlKVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZm9jdXNcIiwgYmx1ciwgZmFsc2UpXG5cbiAgICAvL01vdXNlIHdoZWVsIGhhbmRsZXJcbiAgICBhZGRNb3VzZVdoZWVsKHNoZWxsLmVsZW1lbnQsIGhhbmRsZU1vdXNlV2hlZWwuYmluZCh1bmRlZmluZWQsIHNoZWxsKSwgZmFsc2UpXG5cbiAgICAvL0Z1bGxzY3JlZW4gaGFuZGxlclxuICAgIHZhciBmdWxsc2NyZWVuQ2hhbmdlID0gaGFuZGxlRnVsbHNjcmVlbi5iaW5kKHVuZGVmaW5lZCwgc2hlbGwpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImZ1bGxzY3JlZW5jaGFuZ2VcIiwgZnVsbHNjcmVlbkNoYW5nZSwgZmFsc2UpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vemZ1bGxzY3JlZW5jaGFuZ2VcIiwgZnVsbHNjcmVlbkNoYW5nZSwgZmFsc2UpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmtpdGZ1bGxzY3JlZW5jaGFuZ2VcIiwgZnVsbHNjcmVlbkNoYW5nZSwgZmFsc2UpXG5cbiAgICAvL1N0dXBpZCBmdWxsc2NyZWVuIGhhY2tcbiAgICBzaGVsbC5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCB0cnlGdWxsc2NyZWVuLmJpbmQodW5kZWZpbmVkLCBzaGVsbCksIGZhbHNlKVxuXG4gICAgLy9Qb2ludGVyIGxvY2sgY2hhbmdlIGhhbmRsZXJcbiAgICB2YXIgcG9pbnRlckxvY2tDaGFuZ2UgPSBoYW5kbGVQb2ludGVyTG9ja0NoYW5nZS5iaW5kKHVuZGVmaW5lZCwgc2hlbGwpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJsb2NrY2hhbmdlXCIsIHBvaW50ZXJMb2NrQ2hhbmdlLCBmYWxzZSlcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW96cG9pbnRlcmxvY2tjaGFuZ2VcIiwgcG9pbnRlckxvY2tDaGFuZ2UsIGZhbHNlKVxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJraXRwb2ludGVybG9ja2NoYW5nZVwiLCBwb2ludGVyTG9ja0NoYW5nZSwgZmFsc2UpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJsb2NrbG9zdFwiLCBwb2ludGVyTG9ja0NoYW5nZSwgZmFsc2UpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIndlYmtpdHBvaW50ZXJsb2NrbG9zdFwiLCBwb2ludGVyTG9ja0NoYW5nZSwgZmFsc2UpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1venBvaW50ZXJsb2NrbG9zdFwiLCBwb2ludGVyTG9ja0NoYW5nZSwgZmFsc2UpXG4gICAgXG4gICAgLy9VcGRhdGUgZmxhZ3NcbiAgICBzaGVsbC5mdWxsc2NyZWVuID0gdXNlRnVsbHNjcmVlblxuICAgIHNoZWxsLnBvaW50ZXJMb2NrID0gdXNlUG9pbnRlckxvY2tcbiAgXG4gICAgLy9EZWZhdWx0IG1vdXNlIGJ1dHRvbiBhbGlhc2VzXG4gICAgc2hlbGwuYmluZChcIm1vdXNlLWxlZnRcIiwgICBcIm1vdXNlLTFcIilcbiAgICBzaGVsbC5iaW5kKFwibW91c2UtcmlnaHRcIiwgIFwibW91c2UtM1wiKVxuICAgIHNoZWxsLmJpbmQoXCJtb3VzZS1taWRkbGVcIiwgXCJtb3VzZS0yXCIpXG4gICAgXG4gICAgLy9Jbml0aWFsaXplIHRpY2sgY291bnRlclxuICAgIHNoZWxsLl9sYXN0VGljayA9IGhydGltZSgpXG4gICAgc2hlbGwuc3RhcnRUaW1lID0gaHJ0aW1lKClcblxuICAgIC8vVW5wYXVzZSBzaGVsbFxuICAgIHNoZWxsLnBhdXNlZCA9IGZhbHNlXG4gICAgXG4gICAgLy9FbWl0IGluaXRpYWxpemUgZXZlbnRcbiAgICBzaGVsbC5lbWl0KFwiaW5pdFwiKVxuICB9KX0sIDApXG4gIFxuICByZXR1cm4gc2hlbGxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVTaGVsbFxuIiwiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIHBvb2wgPSByZXF1aXJlKFwidHlwZWRhcnJheS1wb29sXCIpXG52YXIgb3BzID0gcmVxdWlyZShcIm5kYXJyYXktb3BzXCIpXG52YXIgbmRhcnJheSA9IHJlcXVpcmUoXCJuZGFycmF5XCIpXG5cbnZhciBTVVBQT1JURURfVFlQRVMgPSBbXG4gIFwidWludDhcIixcbiAgXCJ1aW50OF9jbGFtcGVkXCIsXG4gIFwidWludDE2XCIsXG4gIFwidWludDMyXCIsXG4gIFwiaW50OFwiLFxuICBcImludDE2XCIsXG4gIFwiaW50MzJcIixcbiAgXCJmbG9hdDMyXCIgXVxuXG5mdW5jdGlvbiBHTEJ1ZmZlcihnbCwgdHlwZSwgaGFuZGxlLCBsZW5ndGgsIHVzYWdlKSB7XG4gIHRoaXMuZ2wgPSBnbFxuICB0aGlzLnR5cGUgPSB0eXBlXG4gIHRoaXMuaGFuZGxlID0gaGFuZGxlXG4gIHRoaXMubGVuZ3RoID0gbGVuZ3RoXG4gIHRoaXMudXNhZ2UgPSB1c2FnZVxufVxuXG52YXIgcHJvdG8gPSBHTEJ1ZmZlci5wcm90b3R5cGVcblxucHJvdG8uYmluZCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmhhbmRsZSlcbn1cblxucHJvdG8udW5iaW5kID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIG51bGwpXG59XG5cbnByb3RvLmRpc3Bvc2UgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nbC5kZWxldGVCdWZmZXIodGhpcy5oYW5kbGUpXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVR5cGVBcnJheShnbCwgdHlwZSwgbGVuLCB1c2FnZSwgZGF0YSwgb2Zmc2V0KSB7XG4gIHZhciBkYXRhTGVuID0gZGF0YS5sZW5ndGggKiBkYXRhLkJZVEVTX1BFUl9FTEVNRU5UXG4gIGlmKG9mZnNldCA8IDApIHtcbiAgICBnbC5idWZmZXJEYXRhKHR5cGUsIGRhdGEsIHVzYWdlKVxuICAgIHJldHVybiBkYXRhTGVuXG4gIH1cbiAgaWYoZGF0YUxlbiArIG9mZnNldCA+IGxlbikge1xuICAgIHRocm93IG5ldyBFcnJvcihcImdsLWJ1ZmZlcjogSWYgcmVzaXppbmcgYnVmZmVyLCBtdXN0IG5vdCBzcGVjaWZ5IG9mZnNldFwiKVxuICB9XG4gIGdsLmJ1ZmZlclN1YkRhdGEodHlwZSwgb2Zmc2V0LCBkYXRhKVxuICByZXR1cm4gbGVuXG59XG5cbmZ1bmN0aW9uIG1ha2VTY3JhdGNoVHlwZUFycmF5KGFycmF5LCBkdHlwZSkge1xuICB2YXIgcmVzID0gcG9vbC5tYWxsb2MoYXJyYXkubGVuZ3RoLCBkdHlwZSlcbiAgdmFyIG4gPSBhcnJheS5sZW5ndGhcbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgcmVzW2ldID0gYXJyYXlbaV1cbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbmZ1bmN0aW9uIGlzUGFja2VkKHNoYXBlLCBzdHJpZGUpIHtcbiAgdmFyIG4gPSAxXG4gIGZvcih2YXIgaT1zdHJpZGUubGVuZ3RoLTE7IGk+PTA7IC0taSkge1xuICAgIGlmKHN0cmlkZVtpXSAhPT0gbikge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICAgIG4gKj0gc2hhcGVbaV1cbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by51cGRhdGUgPSBmdW5jdGlvbihhcnJheSwgb2Zmc2V0KSB7XG4gIGlmKHR5cGVvZiBvZmZzZXQgIT09IFwibnVtYmVyXCIpIHtcbiAgICBvZmZzZXQgPSAtMVxuICB9XG4gIHRoaXMuYmluZCgpXG4gIGlmKHR5cGVvZiBhcnJheSA9PT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgYXJyYXkuc2hhcGUgIT09IFwidW5kZWZpbmVkXCIpIHsgLy9uZGFycmF5XG4gICAgdmFyIGR0eXBlID0gYXJyYXkuZHR5cGVcbiAgICBpZihTVVBQT1JURURfVFlQRVMuaW5kZXhPZihkdHlwZSkgPCAwKSB7XG4gICAgICBkdHlwZSA9IFwiZmxvYXQzMlwiXG4gICAgfVxuICAgIGlmKHRoaXMudHlwZSA9PT0gdGhpcy5nbC5FTEVNRU5UX0FSUkFZX0JVRkZFUikge1xuICAgICAgdmFyIGV4dCA9IGdsLmdldEV4dGVuc2lvbignT0VTX2VsZW1lbnRfaW5kZXhfdWludCcpXG4gICAgICBpZihleHQgJiYgZHR5cGUgIT09IFwidWludDE2XCIpIHtcbiAgICAgICAgZHR5cGUgPSBcInVpbnQzMlwiXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkdHlwZSA9IFwidWludDE2XCJcbiAgICAgIH1cbiAgICB9XG4gICAgaWYoZHR5cGUgPT09IGFycmF5LmR0eXBlICYmIGlzUGFja2VkKGFycmF5LnNoYXBlLCBhcnJheS5zdHJpZGUpKSB7XG4gICAgICBpZihhcnJheS5vZmZzZXQgPT09IDAgJiYgYXJyYXkuZGF0YS5sZW5ndGggPT09IGFycmF5LnNoYXBlWzBdKSB7XG4gICAgICAgIHRoaXMubGVuZ3RoID0gdXBkYXRlVHlwZUFycmF5KHRoaXMuZ2wsIHRoaXMudHlwZSwgdGhpcy5sZW5ndGgsIHRoaXMudXNhZ2UsIGFycmF5LmRhdGEsIG9mZnNldClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubGVuZ3RoID0gdXBkYXRlVHlwZUFycmF5KHRoaXMuZ2wsIHRoaXMudHlwZSwgdGhpcy5sZW5ndGgsIHRoaXMudXNhZ2UsIGFycmF5LmRhdGEuc3ViYXJyYXkoYXJyYXkub2Zmc2V0LCBhcnJheS5zaGFwZVswXSksIG9mZnNldClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHRtcCA9IHBvb2wubWFsbG9jKGFycmF5LnNpemUsIGR0eXBlKVxuICAgICAgdmFyIG5kdCA9IG5kYXJyYXkodG1wLCBhcnJheS5zaGFwZSlcbiAgICAgIG9wcy5hc3NpZ24obmR0LCBhcnJheSlcbiAgICAgIGlmKG9mZnNldCA8IDApIHtcbiAgICAgICAgdGhpcy5sZW5ndGggPSB1cGRhdGVUeXBlQXJyYXkodGhpcy5nbCwgdGhpcy50eXBlLCB0aGlzLmxlbmd0aCwgdGhpcy51c2FnZSwgdG1wLCBvZmZzZXQpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxlbmd0aCA9IHVwZGF0ZVR5cGVBcnJheSh0aGlzLmdsLCB0aGlzLnR5cGUsIHRoaXMubGVuZ3RoLCB0aGlzLnVzYWdlLCB0bXAuc3ViYXJyYXkoMCwgYXJyYXkuc2l6ZSksIG9mZnNldClcbiAgICAgIH1cbiAgICAgIHBvb2wuZnJlZSh0bXApXG4gICAgfVxuICB9IGVsc2UgaWYoQXJyYXkuaXNBcnJheShhcnJheSkpIHsgLy9WYW5pbGxhIGFycmF5XG4gICAgdmFyIHRcbiAgICBpZih0aGlzLnR5cGUgPT09IHRoaXMuZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIpIHtcbiAgICAgIHQgPSBtYWtlU2NyYXRjaFR5cGVBcnJheShhcnJheSwgXCJ1aW50MTZcIilcbiAgICB9IGVsc2Uge1xuICAgICAgdCA9IG1ha2VTY3JhdGNoVHlwZUFycmF5KGFycmF5LCBcImZsb2F0MzJcIilcbiAgICB9XG4gICAgaWYob2Zmc2V0IDwgMCkge1xuICAgICAgdGhpcy5sZW5ndGggPSB1cGRhdGVUeXBlQXJyYXkodGhpcy5nbCwgdGhpcy50eXBlLCB0aGlzLmxlbmd0aCwgdGhpcy51c2FnZSwgdCwgb2Zmc2V0KVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxlbmd0aCA9IHVwZGF0ZVR5cGVBcnJheSh0aGlzLmdsLCB0aGlzLnR5cGUsIHRoaXMubGVuZ3RoLCB0aGlzLnVzYWdlLCB0LnN1YmFycmF5KDAsIGFycmF5Lmxlbmd0aCksIG9mZnNldClcbiAgICB9XG4gICAgcG9vbC5mcmVlKHQpXG4gIH0gZWxzZSBpZih0eXBlb2YgYXJyYXkgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIGFycmF5Lmxlbmd0aCA9PT0gXCJudW1iZXJcIikgeyAvL1R5cGVkIGFycmF5XG4gICAgdGhpcy5sZW5ndGggPSB1cGRhdGVUeXBlQXJyYXkodGhpcy5nbCwgdGhpcy50eXBlLCB0aGlzLmxlbmd0aCwgdGhpcy51c2FnZSwgYXJyYXksIG9mZnNldClcbiAgfSBlbHNlIGlmKHR5cGVvZiBhcnJheSA9PT0gXCJudW1iZXJcIiB8fCBhcnJheSA9PT0gdW5kZWZpbmVkKSB7IC8vTnVtYmVyL2RlZmF1bHRcbiAgICBpZihvZmZzZXQgPj0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZ2wtYnVmZmVyOiBDYW5ub3Qgc3BlY2lmeSBvZmZzZXQgd2hlbiByZXNpemluZyBidWZmZXJcIilcbiAgICB9XG4gICAgYXJyYXkgPSBhcnJheSB8IDBcbiAgICBpZihhcnJheSA8PSAwKSB7XG4gICAgICBhcnJheSA9IDFcbiAgICB9XG4gICAgdGhpcy5nbC5idWZmZXJEYXRhKHRoaXMudHlwZSwgYXJyYXl8MCwgdGhpcy51c2FnZSlcbiAgICB0aGlzLmxlbmd0aCA9IGFycmF5XG4gIH0gZWxzZSB7IC8vRXJyb3IsIGNhc2Ugc2hvdWxkIG5vdCBoYXBwZW5cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJnbC1idWZmZXI6IEludmFsaWQgZGF0YSB0eXBlXCIpXG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQnVmZmVyKGdsLCBkYXRhLCB0eXBlLCB1c2FnZSkge1xuICB0eXBlID0gdHlwZSB8fCBnbC5BUlJBWV9CVUZGRVJcbiAgdXNhZ2UgPSB1c2FnZSB8fCBnbC5EWU5BTUlDX0RSQVdcbiAgaWYodHlwZSAhPT0gZ2wuQVJSQVlfQlVGRkVSICYmIHR5cGUgIT09IGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiZ2wtYnVmZmVyOiBJbnZhbGlkIHR5cGUgZm9yIHdlYmdsIGJ1ZmZlciwgbXVzdCBiZSBlaXRoZXIgZ2wuQVJSQVlfQlVGRkVSIG9yIGdsLkVMRU1FTlRfQVJSQVlfQlVGRkVSXCIpXG4gIH1cbiAgaWYodXNhZ2UgIT09IGdsLkRZTkFNSUNfRFJBVyAmJiB1c2FnZSAhPT0gZ2wuU1RBVElDX0RSQVcgJiYgdXNhZ2UgIT09IGdsLlNUUkVBTV9EUkFXKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiZ2wtYnVmZmVyOiBJbnZhbGlkIHVzYWdlIGZvciBidWZmZXIsIG11c3QgYmUgZWl0aGVyIGdsLkRZTkFNSUNfRFJBVywgZ2wuU1RBVElDX0RSQVcgb3IgZ2wuU1RSRUFNX0RSQVdcIilcbiAgfVxuICB2YXIgaGFuZGxlID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgdmFyIHJlc3VsdCA9IG5ldyBHTEJ1ZmZlcihnbCwgdHlwZSwgaGFuZGxlLCAwLCB1c2FnZSlcbiAgcmVzdWx0LnVwZGF0ZShkYXRhKVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQnVmZmVyXG4iLCIndXNlIHN0cmljdCdcblxudmFyIGNyZWF0ZVRleHR1cmUgPSByZXF1aXJlKCdnbC10ZXh0dXJlMmQnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUZCT1xuXG52YXIgY29sb3JBdHRhY2htZW50QXJyYXlzID0gbnVsbFxudmFyIEZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXG52YXIgRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXG52YXIgRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXG52YXIgRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRcblxuZnVuY3Rpb24gc2F2ZUZCT1N0YXRlKGdsKSB7XG4gIHZhciBmYm8gPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuRlJBTUVCVUZGRVJfQklORElORylcbiAgdmFyIHJibyA9IGdsLmdldFBhcmFtZXRlcihnbC5SRU5ERVJCVUZGRVJfQklORElORylcbiAgdmFyIHRleCA9IGdsLmdldFBhcmFtZXRlcihnbC5URVhUVVJFX0JJTkRJTkdfMkQpXG4gIHJldHVybiBbZmJvLCByYm8sIHRleF1cbn1cblxuZnVuY3Rpb24gcmVzdG9yZUZCT1N0YXRlKGdsLCBkYXRhKSB7XG4gIGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZGF0YVswXSlcbiAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihnbC5SRU5ERVJCVUZGRVIsIGRhdGFbMV0pXG4gIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGRhdGFbMl0pXG59XG5cbmZ1bmN0aW9uIGxhenlJbml0Q29sb3JBdHRhY2htZW50cyhnbCwgZXh0KSB7XG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gZ2wuZ2V0UGFyYW1ldGVyKGV4dC5NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wpXG4gIGNvbG9yQXR0YWNobWVudEFycmF5cyA9IG5ldyBBcnJheShtYXhDb2xvckF0dGFjaG1lbnRzICsgMSlcbiAgZm9yKHZhciBpPTA7IGk8PW1heENvbG9yQXR0YWNobWVudHM7ICsraSkge1xuICAgIHZhciB4ID0gbmV3IEFycmF5KG1heENvbG9yQXR0YWNobWVudHMpXG4gICAgZm9yKHZhciBqPTA7IGo8aTsgKytqKSB7XG4gICAgICB4W2pdID0gZ2wuQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgfVxuICAgIGZvcih2YXIgaj1pOyBqPG1heENvbG9yQXR0YWNobWVudHM7ICsraikge1xuICAgICAgeFtqXSA9IGdsLk5PTkVcbiAgICB9XG4gICAgY29sb3JBdHRhY2htZW50QXJyYXlzW2ldID0geFxuICB9XG59XG5cbi8vVGhyb3cgYW4gYXBwcm9wcmlhdGUgZXJyb3JcbmZ1bmN0aW9uIHRocm93RkJPRXJyb3Ioc3RhdHVzKSB7XG4gIHN3aXRjaChzdGF0dXMpe1xuICAgIGNhc2UgRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLWZibzogRnJhbWVidWZmZXIgdW5zdXBwb3J0ZWQnKVxuICAgIGNhc2UgRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UOlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC1mYm86IEZyYW1lYnVmZmVyIGluY29tcGxldGUgYXR0YWNobWVudCcpXG4gICAgY2FzZSBGUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlM6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLWZibzogRnJhbWVidWZmZXIgaW5jb21wbGV0ZSBkaW1lbnNpb25zJylcbiAgICBjYXNlIEZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UOlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC1mYm86IEZyYW1lYnVmZmVyIGluY29tcGxldGUgbWlzc2luZyBhdHRhY2htZW50JylcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC1mYm86IEZyYW1lYnVmZmVyIGZhaWxlZCBmb3IgdW5zcGVjaWZpZWQgcmVhc29uJylcbiAgfVxufVxuXG4vL0luaXRpYWxpemUgYSB0ZXh0dXJlIG9iamVjdFxuZnVuY3Rpb24gaW5pdFRleHR1cmUoZ2wsIHdpZHRoLCBoZWlnaHQsIHR5cGUsIGZvcm1hdCwgYXR0YWNobWVudCkge1xuICBpZighdHlwZSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cbiAgdmFyIHJlc3VsdCA9IGNyZWF0ZVRleHR1cmUoZ2wsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSlcbiAgcmVzdWx0Lm1hZ0ZpbHRlciA9IGdsLk5FQVJFU1RcbiAgcmVzdWx0Lm1pbkZpbHRlciA9IGdsLk5FQVJFU1RcbiAgcmVzdWx0Lm1pcFNhbXBsZXMgPSAxXG4gIHJlc3VsdC5iaW5kKClcbiAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGF0dGFjaG1lbnQsIGdsLlRFWFRVUkVfMkQsIHJlc3VsdC5oYW5kbGUsIDApXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy9Jbml0aWFsaXplIGEgcmVuZGVyIGJ1ZmZlciBvYmplY3RcbmZ1bmN0aW9uIGluaXRSZW5kZXJCdWZmZXIoZ2wsIHdpZHRoLCBoZWlnaHQsIGNvbXBvbmVudCwgYXR0YWNobWVudCkge1xuICB2YXIgcmVzdWx0ID0gZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKClcbiAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihnbC5SRU5ERVJCVUZGRVIsIHJlc3VsdClcbiAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShnbC5SRU5ERVJCVUZGRVIsIGNvbXBvbmVudCwgd2lkdGgsIGhlaWdodClcbiAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGF0dGFjaG1lbnQsIGdsLlJFTkRFUkJVRkZFUiwgcmVzdWx0KVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vUmVidWlsZCB0aGUgZnJhbWUgYnVmZmVyXG5mdW5jdGlvbiByZWJ1aWxkRkJPKGZibykge1xuXG4gIC8vU2F2ZSBGQk8gc3RhdGVcbiAgdmFyIHN0YXRlID0gc2F2ZUZCT1N0YXRlKGZiby5nbClcblxuICB2YXIgZ2wgPSBmYm8uZ2xcbiAgdmFyIGhhbmRsZSA9IGZiby5oYW5kbGUgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gIHZhciB3aWR0aCA9IGZiby5fc2hhcGVbMF1cbiAgdmFyIGhlaWdodCA9IGZiby5fc2hhcGVbMV1cbiAgdmFyIG51bUNvbG9ycyA9IGZiby5jb2xvci5sZW5ndGhcbiAgdmFyIGV4dCA9IGZiby5fZXh0XG4gIHZhciB1c2VTdGVuY2lsID0gZmJvLl91c2VTdGVuY2lsXG4gIHZhciB1c2VEZXB0aCA9IGZiby5fdXNlRGVwdGhcbiAgdmFyIGNvbG9yVHlwZSA9IGZiby5fY29sb3JUeXBlXG5cbiAgLy9CaW5kIHRoZSBmYm9cbiAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBoYW5kbGUpXG5cbiAgLy9BbGxvY2F0ZSBjb2xvciBidWZmZXJzXG4gIGZvcih2YXIgaT0wOyBpPG51bUNvbG9yczsgKytpKSB7XG4gICAgZmJvLmNvbG9yW2ldID0gaW5pdFRleHR1cmUoZ2wsIHdpZHRoLCBoZWlnaHQsIGNvbG9yVHlwZSwgZ2wuUkdCQSwgZ2wuQ09MT1JfQVRUQUNITUVOVDAgKyBpKVxuICB9XG4gIGlmKG51bUNvbG9ycyA9PT0gMCkge1xuICAgIGZiby5fY29sb3JfcmIgPSBpbml0UmVuZGVyQnVmZmVyKGdsLCB3aWR0aCwgaGVpZ2h0LCBnbC5SR0JBNCwgZ2wuQ09MT1JfQVRUQUNITUVOVDApXG4gICAgaWYoZXh0KSB7XG4gICAgICBleHQuZHJhd0J1ZmZlcnNXRUJHTChjb2xvckF0dGFjaG1lbnRBcnJheXNbMF0pXG4gICAgfVxuICB9IGVsc2UgaWYobnVtQ29sb3JzID4gMSkge1xuICAgIGV4dC5kcmF3QnVmZmVyc1dFQkdMKGNvbG9yQXR0YWNobWVudEFycmF5c1tudW1Db2xvcnNdKVxuICB9XG5cbiAgLy9BbGxvY2F0ZSBkZXB0aC9zdGVuY2lsIGJ1ZmZlcnNcbiAgdmFyIFdFQkdMX2RlcHRoX3RleHR1cmUgPSBnbC5nZXRFeHRlbnNpb24oJ1dFQkdMX2RlcHRoX3RleHR1cmUnKVxuICBpZihXRUJHTF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgaWYodXNlU3RlbmNpbCkge1xuICAgICAgZmJvLmRlcHRoID0gaW5pdFRleHR1cmUoZ2wsIHdpZHRoLCBoZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFdFQkdMX2RlcHRoX3RleHR1cmUuVU5TSUdORURfSU5UXzI0XzhfV0VCR0wsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGdsLkRFUFRIX1NURU5DSUwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGdsLkRFUFRIX1NURU5DSUxfQVRUQUNITUVOVClcbiAgICB9IGVsc2UgaWYodXNlRGVwdGgpIHtcbiAgICAgIGZiby5kZXB0aCA9IGluaXRUZXh0dXJlKGdsLCB3aWR0aCwgaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICBnbC5VTlNJR05FRF9TSE9SVCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZ2wuREVQVEhfQ09NUE9ORU5ULFxuICAgICAgICAgICAgICAgICAgICAgICAgICBnbC5ERVBUSF9BVFRBQ0hNRU5UKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZih1c2VEZXB0aCAmJiB1c2VTdGVuY2lsKSB7XG4gICAgICBmYm8uX2RlcHRoX3JiID0gaW5pdFJlbmRlckJ1ZmZlcihnbCwgd2lkdGgsIGhlaWdodCwgZ2wuREVQVEhfU1RFTkNJTCwgZ2wuREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5UKVxuICAgIH0gZWxzZSBpZih1c2VEZXB0aCkge1xuICAgICAgZmJvLl9kZXB0aF9yYiA9IGluaXRSZW5kZXJCdWZmZXIoZ2wsIHdpZHRoLCBoZWlnaHQsIGdsLkRFUFRIX0NPTVBPTkVOVDE2LCBnbC5ERVBUSF9BVFRBQ0hNRU5UKVxuICAgIH0gZWxzZSBpZih1c2VTdGVuY2lsKSB7XG4gICAgICBmYm8uX2RlcHRoX3JiID0gaW5pdFJlbmRlckJ1ZmZlcihnbCwgd2lkdGgsIGhlaWdodCwgZ2wuU1RFTkNJTF9JTkRFWCwgZ2wuU1RFTkNJTF9BVFRBQ0hNRU5UKVxuICAgIH1cbiAgfVxuXG4gIC8vQ2hlY2sgZnJhbWUgYnVmZmVyIHN0YXRlXG4gIHZhciBzdGF0dXMgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKGdsLkZSQU1FQlVGRkVSKVxuICBpZihzdGF0dXMgIT09IGdsLkZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG5cbiAgICAvL1JlbGVhc2UgYWxsIHBhcnRpYWxseSBhbGxvY2F0ZWQgcmVzb3VyY2VzXG4gICAgZmJvLl9kZXN0cm95ZWQgPSB0cnVlXG5cbiAgICAvL1JlbGVhc2UgYWxsIHJlc291cmNlc1xuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgbnVsbClcbiAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihmYm8uaGFuZGxlKVxuICAgIGZiby5oYW5kbGUgPSBudWxsXG4gICAgaWYoZmJvLmRlcHRoKSB7XG4gICAgICBmYm8uZGVwdGguZGlzcG9zZSgpXG4gICAgICBmYm8uZGVwdGggPSBudWxsXG4gICAgfVxuICAgIGlmKGZiby5fZGVwdGhfcmIpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihmYm8uX2RlcHRoX3JiKVxuICAgICAgZmJvLl9kZXB0aF9yYiA9IG51bGxcbiAgICB9XG4gICAgZm9yKHZhciBpPTA7IGk8ZmJvLmNvbG9yLmxlbmd0aDsgKytpKSB7XG4gICAgICBmYm8uY29sb3JbaV0uZGlzcG9zZSgpXG4gICAgICBmYm8uY29sb3JbaV0gPSBudWxsXG4gICAgfVxuICAgIGlmKGZiby5fY29sb3JfcmIpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihmYm8uX2NvbG9yX3JiKVxuICAgICAgZmJvLl9jb2xvcl9yYiA9IG51bGxcbiAgICB9XG5cbiAgICByZXN0b3JlRkJPU3RhdGUoZ2wsIHN0YXRlKVxuXG4gICAgLy9UaHJvdyB0aGUgZnJhbWUgYnVmZmVyIGVycm9yXG4gICAgdGhyb3dGQk9FcnJvcihzdGF0dXMpXG4gIH1cblxuICAvL0V2ZXJ5dGhpbmcgb2ssIGxldCdzIGdldCBvbiB3aXRoIGxpZmVcbiAgcmVzdG9yZUZCT1N0YXRlKGdsLCBzdGF0ZSlcbn1cblxuZnVuY3Rpb24gRnJhbWVidWZmZXIoZ2wsIHdpZHRoLCBoZWlnaHQsIGNvbG9yVHlwZSwgbnVtQ29sb3JzLCB1c2VEZXB0aCwgdXNlU3RlbmNpbCwgZXh0KSB7XG5cbiAgLy9IYW5kbGUgYW5kIHNldCBwcm9wZXJ0aWVzXG4gIHRoaXMuZ2wgPSBnbFxuICB0aGlzLl9zaGFwZSA9IFt3aWR0aHwwLCBoZWlnaHR8MF1cbiAgdGhpcy5fZGVzdHJveWVkID0gZmFsc2VcbiAgdGhpcy5fZXh0ID0gZXh0XG5cbiAgLy9BbGxvY2F0ZSBidWZmZXJzXG4gIHRoaXMuY29sb3IgPSBuZXcgQXJyYXkobnVtQ29sb3JzKVxuICBmb3IodmFyIGk9MDsgaTxudW1Db2xvcnM7ICsraSkge1xuICAgIHRoaXMuY29sb3JbaV0gPSBudWxsXG4gIH1cbiAgdGhpcy5fY29sb3JfcmIgPSBudWxsXG4gIHRoaXMuZGVwdGggPSBudWxsXG4gIHRoaXMuX2RlcHRoX3JiID0gbnVsbFxuXG4gIC8vU2F2ZSBkZXB0aCBhbmQgc3RlbmNpbCBmbGFnc1xuICB0aGlzLl9jb2xvclR5cGUgPSBjb2xvclR5cGVcbiAgdGhpcy5fdXNlRGVwdGggPSB1c2VEZXB0aFxuICB0aGlzLl91c2VTdGVuY2lsID0gdXNlU3RlbmNpbFxuXG4gIC8vU2hhcGUgdmVjdG9yIGZvciByZXNpemluZ1xuICB2YXIgcGFyZW50ID0gdGhpc1xuICB2YXIgc2hhcGVWZWN0b3IgPSBbd2lkdGh8MCwgaGVpZ2h0fDBdXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHNoYXBlVmVjdG9yLCB7XG4gICAgMDoge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHBhcmVudC5fc2hhcGVbMF1cbiAgICAgIH0sXG4gICAgICBzZXQ6IGZ1bmN0aW9uKHcpIHtcbiAgICAgICAgcmV0dXJuIHBhcmVudC53aWR0aCA9IHdcbiAgICAgIH1cbiAgICB9LFxuICAgIDE6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwYXJlbnQuX3NoYXBlWzFdXG4gICAgICB9LFxuICAgICAgc2V0OiBmdW5jdGlvbihoKSB7XG4gICAgICAgIHJldHVybiBwYXJlbnQuaGVpZ2h0ID0gaFxuICAgICAgfVxuICAgIH1cbiAgfSlcbiAgdGhpcy5fc2hhcGVWZWN0b3IgPSBzaGFwZVZlY3RvclxuXG4gIC8vSW5pdGlhbGl6ZSBhbGwgYXR0YWNobWVudHNcbiAgcmVidWlsZEZCTyh0aGlzKVxufVxuXG52YXIgcHJvdG8gPSBGcmFtZWJ1ZmZlci5wcm90b3R5cGVcblxuZnVuY3Rpb24gcmVzaGFwZUZCTyhmYm8sIHcsIGgpIHtcbiAgLy9JZiBmYm8gaXMgaW52YWxpZCwganVzdCBza2lwIHRoaXNcbiAgaWYoZmJvLl9kZXN0cm95ZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLWZibzogQ2FuXFwndCByZXNpemUgZGVzdHJveWVkIEZCTycpXG4gIH1cblxuICAvL0Rvbid0IHJlc2l6ZSBpZiBubyBjaGFuZ2UgaW4gc2hhcGVcbiAgaWYoIChmYm8uX3NoYXBlWzBdID09PSB3KSAmJlxuICAgICAgKGZiby5fc2hhcGVbMV0gPT09IGgpICkge1xuICAgIHJldHVyblxuICB9XG5cbiAgdmFyIGdsID0gZmJvLmdsXG5cbiAgLy9DaGVjayBwYXJhbWV0ZXIgcmFuZ2VzXG4gIHZhciBtYXhGQk9TaXplID0gZ2wuZ2V0UGFyYW1ldGVyKGdsLk1BWF9SRU5ERVJCVUZGRVJfU0laRSlcbiAgaWYoIHcgPCAwIHx8IHcgPiBtYXhGQk9TaXplIHx8XG4gICAgICBoIDwgMCB8fCBoID4gbWF4RkJPU2l6ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcignZ2wtZmJvOiBDYW5cXCd0IHJlc2l6ZSBGQk8sIGludmFsaWQgZGltZW5zaW9ucycpXG4gIH1cblxuICAvL1VwZGF0ZSBzaGFwZVxuICBmYm8uX3NoYXBlWzBdID0gd1xuICBmYm8uX3NoYXBlWzFdID0gaFxuXG4gIC8vU2F2ZSBmcmFtZWJ1ZmZlciBzdGF0ZVxuICB2YXIgc3RhdGUgPSBzYXZlRkJPU3RhdGUoZ2wpXG5cbiAgLy9SZXNpemUgZnJhbWVidWZmZXIgYXR0YWNobWVudHNcbiAgZm9yKHZhciBpPTA7IGk8ZmJvLmNvbG9yLmxlbmd0aDsgKytpKSB7XG4gICAgZmJvLmNvbG9yW2ldLnNoYXBlID0gZmJvLl9zaGFwZVxuICB9XG4gIGlmKGZiby5fY29sb3JfcmIpIHtcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKGdsLlJFTkRFUkJVRkZFUiwgZmJvLl9jb2xvcl9yYilcbiAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKGdsLlJFTkRFUkJVRkZFUiwgZ2wuUkdCQTQsIGZiby5fc2hhcGVbMF0sIGZiby5fc2hhcGVbMV0pXG4gIH1cbiAgaWYoZmJvLmRlcHRoKSB7XG4gICAgZmJvLmRlcHRoLnNoYXBlID0gZmJvLl9zaGFwZVxuICB9XG4gIGlmKGZiby5fZGVwdGhfcmIpIHtcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKGdsLlJFTkRFUkJVRkZFUiwgZmJvLl9kZXB0aF9yYilcbiAgICBpZihmYm8uX3VzZURlcHRoICYmIGZiby5fdXNlU3RlbmNpbCkge1xuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShnbC5SRU5ERVJCVUZGRVIsIGdsLkRFUFRIX1NURU5DSUwsIGZiby5fc2hhcGVbMF0sIGZiby5fc2hhcGVbMV0pXG4gICAgfSBlbHNlIGlmKGZiby5fdXNlRGVwdGgpIHtcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoZ2wuUkVOREVSQlVGRkVSLCBnbC5ERVBUSF9DT01QT05FTlQxNiwgZmJvLl9zaGFwZVswXSwgZmJvLl9zaGFwZVsxXSlcbiAgICB9IGVsc2UgaWYoZmJvLl91c2VTdGVuY2lsKSB7XG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKGdsLlJFTkRFUkJVRkZFUiwgZ2wuU1RFTkNJTF9JTkRFWCwgZmJvLl9zaGFwZVswXSwgZmJvLl9zaGFwZVsxXSlcbiAgICB9XG4gIH1cblxuICAvL0NoZWNrIEZCTyBzdGF0dXMgYWZ0ZXIgcmVzaXplLCBpZiBzb21ldGhpbmcgYnJva2UgdGhlbiBkaWUgaW4gYSBmaXJlXG4gIGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZmJvLmhhbmRsZSlcbiAgdmFyIHN0YXR1cyA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoZ2wuRlJBTUVCVUZGRVIpXG4gIGlmKHN0YXR1cyAhPT0gZ2wuRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcbiAgICBmYm8uZGlzcG9zZSgpXG4gICAgcmVzdG9yZUZCT1N0YXRlKGdsLCBzdGF0ZSlcbiAgICB0aHJvd0ZCT0Vycm9yKHN0YXR1cylcbiAgfVxuXG4gIC8vUmVzdG9yZSBmcmFtZWJ1ZmZlciBzdGF0ZVxuICByZXN0b3JlRkJPU3RhdGUoZ2wsIHN0YXRlKVxufVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydGllcyhwcm90bywge1xuICAnc2hhcGUnOiB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIGlmKHRoaXMuX2Rlc3Ryb3llZCkge1xuICAgICAgICByZXR1cm4gWzAsMF1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLl9zaGFwZVZlY3RvclxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih4KSB7XG4gICAgICBpZighQXJyYXkuaXNBcnJheSh4KSkge1xuICAgICAgICB4ID0gW3h8MCwgeHwwXVxuICAgICAgfVxuICAgICAgaWYoeC5sZW5ndGggIT09IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC1mYm86IFNoYXBlIHZlY3RvciBtdXN0IGJlIGxlbmd0aCAyJylcbiAgICAgIH1cblxuICAgICAgdmFyIHcgPSB4WzBdfDBcbiAgICAgIHZhciBoID0geFsxXXwwXG4gICAgICByZXNoYXBlRkJPKHRoaXMsIHcsIGgpXG5cbiAgICAgIHJldHVybiBbdywgaF1cbiAgICB9LFxuICAgIGVudW1lcmFibGU6IGZhbHNlXG4gIH0sXG4gICd3aWR0aCc6IHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgaWYodGhpcy5fZGVzdHJveWVkKSB7XG4gICAgICAgIHJldHVybiAwXG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5fc2hhcGVbMF1cbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odykge1xuICAgICAgdyA9IHd8MFxuICAgICAgcmVzaGFwZUZCTyh0aGlzLCB3LCB0aGlzLl9zaGFwZVsxXSlcbiAgICAgIHJldHVybiB3XG4gICAgfSxcbiAgICBlbnVtZXJhYmxlOiBmYWxzZVxuICB9LFxuICAnaGVpZ2h0Jzoge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICBpZih0aGlzLl9kZXN0cm95ZWQpIHtcbiAgICAgICAgcmV0dXJuIDBcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLl9zaGFwZVsxXVxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbihoKSB7XG4gICAgICBoID0gaHwwXG4gICAgICByZXNoYXBlRkJPKHRoaXMsIHRoaXMuX3NoYXBlWzBdLCBoKVxuICAgICAgcmV0dXJuIGhcbiAgICB9LFxuICAgIGVudW1lcmFibGU6IGZhbHNlXG4gIH1cbn0pXG5cbnByb3RvLmJpbmQgPSBmdW5jdGlvbigpIHtcbiAgaWYodGhpcy5fZGVzdHJveWVkKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgdmFyIGdsID0gdGhpcy5nbFxuICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIHRoaXMuaGFuZGxlKVxuICBnbC52aWV3cG9ydCgwLCAwLCB0aGlzLl9zaGFwZVswXSwgdGhpcy5fc2hhcGVbMV0pXG59XG5cbnByb3RvLmRpc3Bvc2UgPSBmdW5jdGlvbigpIHtcbiAgaWYodGhpcy5fZGVzdHJveWVkKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgdGhpcy5fZGVzdHJveWVkID0gdHJ1ZVxuICB2YXIgZ2wgPSB0aGlzLmdsXG4gIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKHRoaXMuaGFuZGxlKVxuICB0aGlzLmhhbmRsZSA9IG51bGxcbiAgaWYodGhpcy5kZXB0aCkge1xuICAgIHRoaXMuZGVwdGguZGlzcG9zZSgpXG4gICAgdGhpcy5kZXB0aCA9IG51bGxcbiAgfVxuICBpZih0aGlzLl9kZXB0aF9yYikge1xuICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcih0aGlzLl9kZXB0aF9yYilcbiAgICB0aGlzLl9kZXB0aF9yYiA9IG51bGxcbiAgfVxuICBmb3IodmFyIGk9MDsgaTx0aGlzLmNvbG9yLmxlbmd0aDsgKytpKSB7XG4gICAgdGhpcy5jb2xvcltpXS5kaXNwb3NlKClcbiAgICB0aGlzLmNvbG9yW2ldID0gbnVsbFxuICB9XG4gIGlmKHRoaXMuX2NvbG9yX3JiKSB7XG4gICAgZ2wuZGVsZXRlUmVuZGVyYnVmZmVyKHRoaXMuX2NvbG9yX3JiKVxuICAgIHRoaXMuX2NvbG9yX3JiID0gbnVsbFxuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZCTyhnbCwgd2lkdGgsIGhlaWdodCwgb3B0aW9ucykge1xuXG4gIC8vVXBkYXRlIGZyYW1lIGJ1ZmZlciBlcnJvciBjb2RlIHZhbHVlc1xuICBpZighRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQpIHtcbiAgICBGUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCA9IGdsLkZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXG4gICAgRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UID0gZ2wuRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXG4gICAgRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TID0gZ2wuRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXG4gICAgRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQgPSBnbC5GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVFxuICB9XG5cbiAgLy9MYXppbHkgaW5pdGlhbGl6ZSBjb2xvciBhdHRhY2htZW50IGFycmF5c1xuICB2YXIgV0VCR0xfZHJhd19idWZmZXJzID0gZ2wuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9kcmF3X2J1ZmZlcnMnKVxuICBpZighY29sb3JBdHRhY2htZW50QXJyYXlzICYmIFdFQkdMX2RyYXdfYnVmZmVycykge1xuICAgIGxhenlJbml0Q29sb3JBdHRhY2htZW50cyhnbCwgV0VCR0xfZHJhd19idWZmZXJzKVxuICB9XG5cbiAgLy9TcGVjaWFsIGNhc2U6IENhbiBhY2NlcHQgYW4gYXJyYXkgYXMgYXJndW1lbnRcbiAgaWYoQXJyYXkuaXNBcnJheSh3aWR0aCkpIHtcbiAgICBvcHRpb25zID0gaGVpZ2h0XG4gICAgaGVpZ2h0ID0gd2lkdGhbMV18MFxuICAgIHdpZHRoID0gd2lkdGhbMF18MFxuICB9XG5cbiAgaWYodHlwZW9mIHdpZHRoICE9PSAnbnVtYmVyJykge1xuICAgIHRocm93IG5ldyBFcnJvcignZ2wtZmJvOiBNaXNzaW5nIHNoYXBlIHBhcmFtZXRlcicpXG4gIH1cblxuICAvL1ZhbGlkYXRlIHdpZHRoL2hlaWdodCBwcm9wZXJ0aWVzXG4gIHZhciBtYXhGQk9TaXplID0gZ2wuZ2V0UGFyYW1ldGVyKGdsLk1BWF9SRU5ERVJCVUZGRVJfU0laRSlcbiAgaWYod2lkdGggPCAwIHx8IHdpZHRoID4gbWF4RkJPU2l6ZSB8fCBoZWlnaHQgPCAwIHx8IGhlaWdodCA+IG1heEZCT1NpemUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLWZibzogUGFyYW1ldGVycyBhcmUgdG9vIGxhcmdlIGZvciBGQk8nKVxuICB9XG5cbiAgLy9IYW5kbGUgZWFjaCBvcHRpb24gdHlwZVxuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuXG4gIC8vRmlndXJlIG91dCBudW1iZXIgb2YgY29sb3IgYnVmZmVycyB0byB1c2VcbiAgdmFyIG51bUNvbG9ycyA9IDFcbiAgaWYoJ2NvbG9yJyBpbiBvcHRpb25zKSB7XG4gICAgbnVtQ29sb3JzID0gTWF0aC5tYXgob3B0aW9ucy5jb2xvcnwwLCAwKVxuICAgIGlmKG51bUNvbG9ycyA8IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtZmJvOiBNdXN0IHNwZWNpZnkgYSBub25uZWdhdGl2ZSBudW1iZXIgb2YgY29sb3JzJylcbiAgICB9XG4gICAgaWYobnVtQ29sb3JzID4gMSkge1xuICAgICAgLy9DaGVjayBpZiBtdWx0aXBsZSByZW5kZXIgdGFyZ2V0cyBzdXBwb3J0ZWRcbiAgICAgIGlmKCFXRUJHTF9kcmF3X2J1ZmZlcnMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC1mYm86IE11bHRpcGxlIGRyYXcgYnVmZmVyIGV4dGVuc2lvbiBub3Qgc3VwcG9ydGVkJylcbiAgICAgIH0gZWxzZSBpZihudW1Db2xvcnMgPiBnbC5nZXRQYXJhbWV0ZXIoV0VCR0xfZHJhd19idWZmZXJzLk1BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC1mYm86IENvbnRleHQgZG9lcyBub3Qgc3VwcG9ydCAnICsgbnVtQ29sb3JzICsgJyBkcmF3IGJ1ZmZlcnMnKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vRGV0ZXJtaW5lIHdoZXRoZXIgdG8gdXNlIGZsb2F0aW5nIHBvaW50IHRleHR1cmVzXG4gIHZhciBjb2xvclR5cGUgPSBnbC5VTlNJR05FRF9CWVRFXG4gIHZhciBPRVNfdGV4dHVyZV9mbG9hdCA9IGdsLmdldEV4dGVuc2lvbignT0VTX3RleHR1cmVfZmxvYXQnKVxuICBpZihvcHRpb25zLmZsb2F0ICYmIG51bUNvbG9ycyA+IDApIHtcbiAgICBpZighT0VTX3RleHR1cmVfZmxvYXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtZmJvOiBDb250ZXh0IGRvZXMgbm90IHN1cHBvcnQgZmxvYXRpbmcgcG9pbnQgdGV4dHVyZXMnKVxuICAgIH1cbiAgICBjb2xvclR5cGUgPSBnbC5GTE9BVFxuICB9IGVsc2UgaWYob3B0aW9ucy5wcmVmZXJGbG9hdCAmJiBudW1Db2xvcnMgPiAwKSB7XG4gICAgaWYoT0VTX3RleHR1cmVfZmxvYXQpIHtcbiAgICAgIGNvbG9yVHlwZSA9IGdsLkZMT0FUXG4gICAgfVxuICB9XG5cbiAgLy9DaGVjayBpZiB3ZSBzaG91bGQgdXNlIGRlcHRoIGJ1ZmZlclxuICB2YXIgdXNlRGVwdGggPSB0cnVlXG4gIGlmKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgIHVzZURlcHRoID0gISFvcHRpb25zLmRlcHRoXG4gIH1cblxuICAvL0NoZWNrIGlmIHdlIHNob3VsZCB1c2UgYSBzdGVuY2lsIGJ1ZmZlclxuICB2YXIgdXNlU3RlbmNpbCA9IGZhbHNlXG4gIGlmKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgdXNlU3RlbmNpbCA9ICEhb3B0aW9ucy5zdGVuY2lsXG4gIH1cblxuICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyKFxuICAgIGdsLFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCxcbiAgICBjb2xvclR5cGUsXG4gICAgbnVtQ29sb3JzLFxuICAgIHVzZURlcHRoLFxuICAgIHVzZVN0ZW5jaWwsXG4gICAgV0VCR0xfZHJhd19idWZmZXJzKVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBhZGpvaW50O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGFkanVnYXRlIG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gYWRqb2ludChvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XTtcblxuICAgIG91dFswXSAgPSAgKGExMSAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIxICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgKyBhMzEgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSk7XG4gICAgb3V0WzFdICA9IC0oYTAxICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjEgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMSAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpKTtcbiAgICBvdXRbMl0gID0gIChhMDEgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSAtIGExMSAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMxICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFszXSAgPSAtKGEwMSAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpIC0gYTExICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikgKyBhMjEgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzRdICA9IC0oYTEwICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjAgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSArIGEzMCAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpKTtcbiAgICBvdXRbNV0gID0gIChhMDAgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMCAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMwICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikpO1xuICAgIG91dFs2XSAgPSAtKGEwMCAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpIC0gYTEwICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzAgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzddICA9ICAoYTAwICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikgLSBhMTAgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSArIGEyMCAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbOF0gID0gIChhMTAgKiAoYTIxICogYTMzIC0gYTIzICogYTMxKSAtIGEyMCAqIChhMTEgKiBhMzMgLSBhMTMgKiBhMzEpICsgYTMwICogKGExMSAqIGEyMyAtIGExMyAqIGEyMSkpO1xuICAgIG91dFs5XSAgPSAtKGEwMCAqIChhMjEgKiBhMzMgLSBhMjMgKiBhMzEpIC0gYTIwICogKGEwMSAqIGEzMyAtIGEwMyAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTIzIC0gYTAzICogYTIxKSk7XG4gICAgb3V0WzEwXSA9ICAoYTAwICogKGExMSAqIGEzMyAtIGExMyAqIGEzMSkgLSBhMTAgKiAoYTAxICogYTMzIC0gYTAzICogYTMxKSArIGEzMCAqIChhMDEgKiBhMTMgLSBhMDMgKiBhMTEpKTtcbiAgICBvdXRbMTFdID0gLShhMDAgKiAoYTExICogYTIzIC0gYTEzICogYTIxKSAtIGExMCAqIChhMDEgKiBhMjMgLSBhMDMgKiBhMjEpICsgYTIwICogKGEwMSAqIGExMyAtIGEwMyAqIGExMSkpO1xuICAgIG91dFsxMl0gPSAtKGExMCAqIChhMjEgKiBhMzIgLSBhMjIgKiBhMzEpIC0gYTIwICogKGExMSAqIGEzMiAtIGExMiAqIGEzMSkgKyBhMzAgKiAoYTExICogYTIyIC0gYTEyICogYTIxKSk7XG4gICAgb3V0WzEzXSA9ICAoYTAwICogKGEyMSAqIGEzMiAtIGEyMiAqIGEzMSkgLSBhMjAgKiAoYTAxICogYTMyIC0gYTAyICogYTMxKSArIGEzMCAqIChhMDEgKiBhMjIgLSBhMDIgKiBhMjEpKTtcbiAgICBvdXRbMTRdID0gLShhMDAgKiAoYTExICogYTMyIC0gYTEyICogYTMxKSAtIGExMCAqIChhMDEgKiBhMzIgLSBhMDIgKiBhMzEpICsgYTMwICogKGEwMSAqIGExMiAtIGEwMiAqIGExMSkpO1xuICAgIG91dFsxNV0gPSAgKGEwMCAqIChhMTEgKiBhMjIgLSBhMTIgKiBhMjEpIC0gYTEwICogKGEwMSAqIGEyMiAtIGEwMiAqIGEyMSkgKyBhMjAgKiAoYTAxICogYTEyIC0gYTAyICogYTExKSk7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBjbG9uZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IG1hdDQgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgbWF0cml4IHRvIGNsb25lXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5mdW5jdGlvbiBjbG9uZShhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBGbG9hdDMyQXJyYXkoMTYpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIG91dFs5XSA9IGFbOV07XG4gICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgIG91dFsxMV0gPSBhWzExXTtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBjb3B5O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSBtYXQ0IHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGNvcHkob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgb3V0WzldID0gYVs5XTtcbiAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgb3V0WzExXSA9IGFbMTFdO1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGlkZW50aXR5IG1hdDRcbiAqXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5mdW5jdGlvbiBjcmVhdGUoKSB7XG4gICAgdmFyIG91dCA9IG5ldyBGbG9hdDMyQXJyYXkoMTYpO1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAxO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDE7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBkZXRlcm1pbmFudDtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkZXRlcm1pbmFudCBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRldGVybWluYW50IG9mIGFcbiAqL1xuZnVuY3Rpb24gZGV0ZXJtaW5hbnQoYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdLFxuXG4gICAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzI7XG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50XG4gICAgcmV0dXJuIGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBmcm9tUXVhdDtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbWF0cml4IGZyb20gYSBxdWF0ZXJuaW9uIHJvdGF0aW9uLlxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdDR9IHEgUm90YXRpb24gcXVhdGVybmlvblxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBmcm9tUXVhdChvdXQsIHEpIHtcbiAgICB2YXIgeCA9IHFbMF0sIHkgPSBxWzFdLCB6ID0gcVsyXSwgdyA9IHFbM10sXG4gICAgICAgIHgyID0geCArIHgsXG4gICAgICAgIHkyID0geSArIHksXG4gICAgICAgIHoyID0geiArIHosXG5cbiAgICAgICAgeHggPSB4ICogeDIsXG4gICAgICAgIHl4ID0geSAqIHgyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgenggPSB6ICogeDIsXG4gICAgICAgIHp5ID0geiAqIHkyLFxuICAgICAgICB6eiA9IHogKiB6MixcbiAgICAgICAgd3ggPSB3ICogeDIsXG4gICAgICAgIHd5ID0gdyAqIHkyLFxuICAgICAgICB3eiA9IHcgKiB6MjtcblxuICAgIG91dFswXSA9IDEgLSB5eSAtIHp6O1xuICAgIG91dFsxXSA9IHl4ICsgd3o7XG4gICAgb3V0WzJdID0genggLSB3eTtcbiAgICBvdXRbM10gPSAwO1xuXG4gICAgb3V0WzRdID0geXggLSB3ejtcbiAgICBvdXRbNV0gPSAxIC0geHggLSB6ejtcbiAgICBvdXRbNl0gPSB6eSArIHd4O1xuICAgIG91dFs3XSA9IDA7XG5cbiAgICBvdXRbOF0gPSB6eCArIHd5O1xuICAgIG91dFs5XSA9IHp5IC0gd3g7XG4gICAgb3V0WzEwXSA9IDEgLSB4eCAtIHl5O1xuICAgIG91dFsxMV0gPSAwO1xuXG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZyb21Sb3RhdGlvblRyYW5zbGF0aW9uO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBtYXRyaXggZnJvbSBhIHF1YXRlcm5pb24gcm90YXRpb24gYW5kIHZlY3RvciB0cmFuc2xhdGlvblxuICogVGhpcyBpcyBlcXVpdmFsZW50IHRvIChidXQgbXVjaCBmYXN0ZXIgdGhhbik6XG4gKlxuICogICAgIG1hdDQuaWRlbnRpdHkoZGVzdCk7XG4gKiAgICAgbWF0NC50cmFuc2xhdGUoZGVzdCwgdmVjKTtcbiAqICAgICB2YXIgcXVhdE1hdCA9IG1hdDQuY3JlYXRlKCk7XG4gKiAgICAgcXVhdDQudG9NYXQ0KHF1YXQsIHF1YXRNYXQpO1xuICogICAgIG1hdDQubXVsdGlwbHkoZGVzdCwgcXVhdE1hdCk7XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCByZWNlaXZpbmcgb3BlcmF0aW9uIHJlc3VsdFxuICogQHBhcmFtIHtxdWF0NH0gcSBSb3RhdGlvbiBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3ZlYzN9IHYgVHJhbnNsYXRpb24gdmVjdG9yXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGZyb21Sb3RhdGlvblRyYW5zbGF0aW9uKG91dCwgcSwgdikge1xuICAgIC8vIFF1YXRlcm5pb24gbWF0aFxuICAgIHZhciB4ID0gcVswXSwgeSA9IHFbMV0sIHogPSBxWzJdLCB3ID0gcVszXSxcbiAgICAgICAgeDIgPSB4ICsgeCxcbiAgICAgICAgeTIgPSB5ICsgeSxcbiAgICAgICAgejIgPSB6ICsgeixcblxuICAgICAgICB4eCA9IHggKiB4MixcbiAgICAgICAgeHkgPSB4ICogeTIsXG4gICAgICAgIHh6ID0geCAqIHoyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgeXogPSB5ICogejIsXG4gICAgICAgIHp6ID0geiAqIHoyLFxuICAgICAgICB3eCA9IHcgKiB4MixcbiAgICAgICAgd3kgPSB3ICogeTIsXG4gICAgICAgIHd6ID0gdyAqIHoyO1xuXG4gICAgb3V0WzBdID0gMSAtICh5eSArIHp6KTtcbiAgICBvdXRbMV0gPSB4eSArIHd6O1xuICAgIG91dFsyXSA9IHh6IC0gd3k7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSB4eSAtIHd6O1xuICAgIG91dFs1XSA9IDEgLSAoeHggKyB6eik7XG4gICAgb3V0WzZdID0geXogKyB3eDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IHh6ICsgd3k7XG4gICAgb3V0WzldID0geXogLSB3eDtcbiAgICBvdXRbMTBdID0gMSAtICh4eCArIHl5KTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gdlswXTtcbiAgICBvdXRbMTNdID0gdlsxXTtcbiAgICBvdXRbMTRdID0gdlsyXTtcbiAgICBvdXRbMTVdID0gMTtcbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZydXN0dW07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgZnJ1c3R1bSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gYm91bmRzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHtOdW1iZXJ9IGxlZnQgTGVmdCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHJpZ2h0IFJpZ2h0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gYm90dG9tIEJvdHRvbSBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHRvcCBUb3AgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGZydXN0dW0ob3V0LCBsZWZ0LCByaWdodCwgYm90dG9tLCB0b3AsIG5lYXIsIGZhcikge1xuICAgIHZhciBybCA9IDEgLyAocmlnaHQgLSBsZWZ0KSxcbiAgICAgICAgdGIgPSAxIC8gKHRvcCAtIGJvdHRvbSksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSAobmVhciAqIDIpICogcmw7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAobmVhciAqIDIpICogdGI7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IChyaWdodCArIGxlZnQpICogcmw7XG4gICAgb3V0WzldID0gKHRvcCArIGJvdHRvbSkgKiB0YjtcbiAgICBvdXRbMTBdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzExXSA9IC0xO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAoZmFyICogbmVhciAqIDIpICogbmY7XG4gICAgb3V0WzE1XSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBpZGVudGl0eTtcblxuLyoqXG4gKiBTZXQgYSBtYXQ0IHRvIHRoZSBpZGVudGl0eSBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBpZGVudGl0eShvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gMTtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAxO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAwO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBjcmVhdGU6IHJlcXVpcmUoJy4vY3JlYXRlJylcbiAgLCBjbG9uZTogcmVxdWlyZSgnLi9jbG9uZScpXG4gICwgY29weTogcmVxdWlyZSgnLi9jb3B5JylcbiAgLCBpZGVudGl0eTogcmVxdWlyZSgnLi9pZGVudGl0eScpXG4gICwgdHJhbnNwb3NlOiByZXF1aXJlKCcuL3RyYW5zcG9zZScpXG4gICwgaW52ZXJ0OiByZXF1aXJlKCcuL2ludmVydCcpXG4gICwgYWRqb2ludDogcmVxdWlyZSgnLi9hZGpvaW50JylcbiAgLCBkZXRlcm1pbmFudDogcmVxdWlyZSgnLi9kZXRlcm1pbmFudCcpXG4gICwgbXVsdGlwbHk6IHJlcXVpcmUoJy4vbXVsdGlwbHknKVxuICAsIHRyYW5zbGF0ZTogcmVxdWlyZSgnLi90cmFuc2xhdGUnKVxuICAsIHNjYWxlOiByZXF1aXJlKCcuL3NjYWxlJylcbiAgLCByb3RhdGU6IHJlcXVpcmUoJy4vcm90YXRlJylcbiAgLCByb3RhdGVYOiByZXF1aXJlKCcuL3JvdGF0ZVgnKVxuICAsIHJvdGF0ZVk6IHJlcXVpcmUoJy4vcm90YXRlWScpXG4gICwgcm90YXRlWjogcmVxdWlyZSgnLi9yb3RhdGVaJylcbiAgLCBmcm9tUm90YXRpb25UcmFuc2xhdGlvbjogcmVxdWlyZSgnLi9mcm9tUm90YXRpb25UcmFuc2xhdGlvbicpXG4gICwgZnJvbVF1YXQ6IHJlcXVpcmUoJy4vZnJvbVF1YXQnKVxuICAsIGZydXN0dW06IHJlcXVpcmUoJy4vZnJ1c3R1bScpXG4gICwgcGVyc3BlY3RpdmU6IHJlcXVpcmUoJy4vcGVyc3BlY3RpdmUnKVxuICAsIHBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3OiByZXF1aXJlKCcuL3BlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3JylcbiAgLCBvcnRobzogcmVxdWlyZSgnLi9vcnRobycpXG4gICwgbG9va0F0OiByZXF1aXJlKCcuL2xvb2tBdCcpXG4gICwgc3RyOiByZXF1aXJlKCcuL3N0cicpXG59IiwibW9kdWxlLmV4cG9ydHMgPSBpbnZlcnQ7XG5cbi8qKlxuICogSW52ZXJ0cyBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGludmVydChvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XSxcblxuICAgICAgICBiMDAgPSBhMDAgKiBhMTEgLSBhMDEgKiBhMTAsXG4gICAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgICAgYjAyID0gYTAwICogYTEzIC0gYTAzICogYTEwLFxuICAgICAgICBiMDMgPSBhMDEgKiBhMTIgLSBhMDIgKiBhMTEsXG4gICAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgICAgYjA1ID0gYTAyICogYTEzIC0gYTAzICogYTEyLFxuICAgICAgICBiMDYgPSBhMjAgKiBhMzEgLSBhMjEgKiBhMzAsXG4gICAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgICAgYjA4ID0gYTIwICogYTMzIC0gYTIzICogYTMwLFxuICAgICAgICBiMDkgPSBhMjEgKiBhMzIgLSBhMjIgKiBhMzEsXG4gICAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgICAgYjExID0gYTIyICogYTMzIC0gYTIzICogYTMyLFxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gICAgaWYgKCFkZXQpIHsgXG4gICAgICAgIHJldHVybiBudWxsOyBcbiAgICB9XG4gICAgZGV0ID0gMS4wIC8gZGV0O1xuXG4gICAgb3V0WzBdID0gKGExMSAqIGIxMSAtIGExMiAqIGIxMCArIGExMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzFdID0gKGEwMiAqIGIxMCAtIGEwMSAqIGIxMSAtIGEwMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzJdID0gKGEzMSAqIGIwNSAtIGEzMiAqIGIwNCArIGEzMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzNdID0gKGEyMiAqIGIwNCAtIGEyMSAqIGIwNSAtIGEyMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzRdID0gKGExMiAqIGIwOCAtIGExMCAqIGIxMSAtIGExMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzVdID0gKGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzZdID0gKGEzMiAqIGIwMiAtIGEzMCAqIGIwNSAtIGEzMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzddID0gKGEyMCAqIGIwNSAtIGEyMiAqIGIwMiArIGEyMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzhdID0gKGExMCAqIGIxMCAtIGExMSAqIGIwOCArIGExMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzldID0gKGEwMSAqIGIwOCAtIGEwMCAqIGIxMCAtIGEwMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEwXSA9IChhMzAgKiBiMDQgLSBhMzEgKiBiMDIgKyBhMzMgKiBiMDApICogZGV0O1xuICAgIG91dFsxMV0gPSAoYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTJdID0gKGExMSAqIGIwNyAtIGExMCAqIGIwOSAtIGExMiAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEzXSA9IChhMDAgKiBiMDkgLSBhMDEgKiBiMDcgKyBhMDIgKiBiMDYpICogZGV0O1xuICAgIG91dFsxNF0gPSAoYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTVdID0gKGEyMCAqIGIwMyAtIGEyMSAqIGIwMSArIGEyMiAqIGIwMCkgKiBkZXQ7XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJ2YXIgaWRlbnRpdHkgPSByZXF1aXJlKCcuL2lkZW50aXR5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gbG9va0F0O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIGxvb2stYXQgbWF0cml4IHdpdGggdGhlIGdpdmVuIGV5ZSBwb3NpdGlvbiwgZm9jYWwgcG9pbnQsIGFuZCB1cCBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHt2ZWMzfSBleWUgUG9zaXRpb24gb2YgdGhlIHZpZXdlclxuICogQHBhcmFtIHt2ZWMzfSBjZW50ZXIgUG9pbnQgdGhlIHZpZXdlciBpcyBsb29raW5nIGF0XG4gKiBAcGFyYW0ge3ZlYzN9IHVwIHZlYzMgcG9pbnRpbmcgdXBcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gbG9va0F0KG91dCwgZXllLCBjZW50ZXIsIHVwKSB7XG4gICAgdmFyIHgwLCB4MSwgeDIsIHkwLCB5MSwgeTIsIHowLCB6MSwgejIsIGxlbixcbiAgICAgICAgZXlleCA9IGV5ZVswXSxcbiAgICAgICAgZXlleSA9IGV5ZVsxXSxcbiAgICAgICAgZXlleiA9IGV5ZVsyXSxcbiAgICAgICAgdXB4ID0gdXBbMF0sXG4gICAgICAgIHVweSA9IHVwWzFdLFxuICAgICAgICB1cHogPSB1cFsyXSxcbiAgICAgICAgY2VudGVyeCA9IGNlbnRlclswXSxcbiAgICAgICAgY2VudGVyeSA9IGNlbnRlclsxXSxcbiAgICAgICAgY2VudGVyeiA9IGNlbnRlclsyXTtcblxuICAgIGlmIChNYXRoLmFicyhleWV4IC0gY2VudGVyeCkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV5IC0gY2VudGVyeSkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV6IC0gY2VudGVyeikgPCAwLjAwMDAwMSkge1xuICAgICAgICByZXR1cm4gaWRlbnRpdHkob3V0KTtcbiAgICB9XG5cbiAgICB6MCA9IGV5ZXggLSBjZW50ZXJ4O1xuICAgIHoxID0gZXlleSAtIGNlbnRlcnk7XG4gICAgejIgPSBleWV6IC0gY2VudGVyejtcblxuICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQoejAgKiB6MCArIHoxICogejEgKyB6MiAqIHoyKTtcbiAgICB6MCAqPSBsZW47XG4gICAgejEgKj0gbGVuO1xuICAgIHoyICo9IGxlbjtcblxuICAgIHgwID0gdXB5ICogejIgLSB1cHogKiB6MTtcbiAgICB4MSA9IHVweiAqIHowIC0gdXB4ICogejI7XG4gICAgeDIgPSB1cHggKiB6MSAtIHVweSAqIHowO1xuICAgIGxlbiA9IE1hdGguc3FydCh4MCAqIHgwICsgeDEgKiB4MSArIHgyICogeDIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHgwID0gMDtcbiAgICAgICAgeDEgPSAwO1xuICAgICAgICB4MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeDAgKj0gbGVuO1xuICAgICAgICB4MSAqPSBsZW47XG4gICAgICAgIHgyICo9IGxlbjtcbiAgICB9XG5cbiAgICB5MCA9IHoxICogeDIgLSB6MiAqIHgxO1xuICAgIHkxID0gejIgKiB4MCAtIHowICogeDI7XG4gICAgeTIgPSB6MCAqIHgxIC0gejEgKiB4MDtcblxuICAgIGxlbiA9IE1hdGguc3FydCh5MCAqIHkwICsgeTEgKiB5MSArIHkyICogeTIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHkwID0gMDtcbiAgICAgICAgeTEgPSAwO1xuICAgICAgICB5MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeTAgKj0gbGVuO1xuICAgICAgICB5MSAqPSBsZW47XG4gICAgICAgIHkyICo9IGxlbjtcbiAgICB9XG5cbiAgICBvdXRbMF0gPSB4MDtcbiAgICBvdXRbMV0gPSB5MDtcbiAgICBvdXRbMl0gPSB6MDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHgxO1xuICAgIG91dFs1XSA9IHkxO1xuICAgIG91dFs2XSA9IHoxO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geDI7XG4gICAgb3V0WzldID0geTI7XG4gICAgb3V0WzEwXSA9IHoyO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAtKHgwICogZXlleCArIHgxICogZXlleSArIHgyICogZXlleik7XG4gICAgb3V0WzEzXSA9IC0oeTAgKiBleWV4ICsgeTEgKiBleWV5ICsgeTIgKiBleWV6KTtcbiAgICBvdXRbMTRdID0gLSh6MCAqIGV5ZXggKyB6MSAqIGV5ZXkgKyB6MiAqIGV5ZXopO1xuICAgIG91dFsxNV0gPSAxO1xuXG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBtdWx0aXBseTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byBtYXQ0J3NcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge21hdDR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIG11bHRpcGx5KG91dCwgYSwgYikge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdO1xuXG4gICAgLy8gQ2FjaGUgb25seSB0aGUgY3VycmVudCBsaW5lIG9mIHRoZSBzZWNvbmQgbWF0cml4XG4gICAgdmFyIGIwICA9IGJbMF0sIGIxID0gYlsxXSwgYjIgPSBiWzJdLCBiMyA9IGJbM107ICBcbiAgICBvdXRbMF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzFdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsyXSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbM10gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbNF07IGIxID0gYls1XTsgYjIgPSBiWzZdOyBiMyA9IGJbN107XG4gICAgb3V0WzRdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs1XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbNl0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzddID0gYjAqYTAzICsgYjEqYTEzICsgYjIqYTIzICsgYjMqYTMzO1xuXG4gICAgYjAgPSBiWzhdOyBiMSA9IGJbOV07IGIyID0gYlsxMF07IGIzID0gYlsxMV07XG4gICAgb3V0WzhdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs5XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTBdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxMV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbMTJdOyBiMSA9IGJbMTNdOyBiMiA9IGJbMTRdOyBiMyA9IGJbMTVdO1xuICAgIG91dFsxMl0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzEzXSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTRdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxNV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBvcnRobztcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBvcnRob2dvbmFsIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGJvdW5kc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgZnJ1c3R1bSBtYXRyaXggd2lsbCBiZSB3cml0dGVuIGludG9cbiAqIEBwYXJhbSB7bnVtYmVyfSBsZWZ0IExlZnQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSByaWdodCBSaWdodCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IGJvdHRvbSBCb3R0b20gYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSB0b3AgVG9wIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBvcnRobyhvdXQsIGxlZnQsIHJpZ2h0LCBib3R0b20sIHRvcCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGxyID0gMSAvIChsZWZ0IC0gcmlnaHQpLFxuICAgICAgICBidCA9IDEgLyAoYm90dG9tIC0gdG9wKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IC0yICogbHI7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAtMiAqIGJ0O1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDIgKiBuZjtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gKGxlZnQgKyByaWdodCkgKiBscjtcbiAgICBvdXRbMTNdID0gKHRvcCArIGJvdHRvbSkgKiBidDtcbiAgICBvdXRbMTRdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBwZXJzcGVjdGl2ZTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBwZXJzcGVjdGl2ZSBwcm9qZWN0aW9uIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92eSBWZXJ0aWNhbCBmaWVsZCBvZiB2aWV3IGluIHJhZGlhbnNcbiAqIEBwYXJhbSB7bnVtYmVyfSBhc3BlY3QgQXNwZWN0IHJhdGlvLiB0eXBpY2FsbHkgdmlld3BvcnQgd2lkdGgvaGVpZ2h0XG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBwZXJzcGVjdGl2ZShvdXQsIGZvdnksIGFzcGVjdCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGYgPSAxLjAgLyBNYXRoLnRhbihmb3Z5IC8gMiksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSBmIC8gYXNwZWN0O1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gZjtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAoZmFyICsgbmVhcikgKiBuZjtcbiAgICBvdXRbMTFdID0gLTE7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9ICgyICogZmFyICogbmVhcikgKiBuZjtcbiAgICBvdXRbMTVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHBlcnNwZWN0aXZlIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGZpZWxkIG9mIHZpZXcuXG4gKiBUaGlzIGlzIHByaW1hcmlseSB1c2VmdWwgZm9yIGdlbmVyYXRpbmcgcHJvamVjdGlvbiBtYXRyaWNlcyB0byBiZSB1c2VkXG4gKiB3aXRoIHRoZSBzdGlsbCBleHBlcmllbWVudGFsIFdlYlZSIEFQSS5cbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92IE9iamVjdCBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgdmFsdWVzOiB1cERlZ3JlZXMsIGRvd25EZWdyZWVzLCBsZWZ0RGVncmVlcywgcmlnaHREZWdyZWVzXG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBwZXJzcGVjdGl2ZUZyb21GaWVsZE9mVmlldyhvdXQsIGZvdiwgbmVhciwgZmFyKSB7XG4gICAgdmFyIHVwVGFuID0gTWF0aC50YW4oZm92LnVwRGVncmVlcyAqIE1hdGguUEkvMTgwLjApLFxuICAgICAgICBkb3duVGFuID0gTWF0aC50YW4oZm92LmRvd25EZWdyZWVzICogTWF0aC5QSS8xODAuMCksXG4gICAgICAgIGxlZnRUYW4gPSBNYXRoLnRhbihmb3YubGVmdERlZ3JlZXMgKiBNYXRoLlBJLzE4MC4wKSxcbiAgICAgICAgcmlnaHRUYW4gPSBNYXRoLnRhbihmb3YucmlnaHREZWdyZWVzICogTWF0aC5QSS8xODAuMCksXG4gICAgICAgIHhTY2FsZSA9IDIuMCAvIChsZWZ0VGFuICsgcmlnaHRUYW4pLFxuICAgICAgICB5U2NhbGUgPSAyLjAgLyAodXBUYW4gKyBkb3duVGFuKTtcblxuICAgIG91dFswXSA9IHhTY2FsZTtcbiAgICBvdXRbMV0gPSAwLjA7XG4gICAgb3V0WzJdID0gMC4wO1xuICAgIG91dFszXSA9IDAuMDtcbiAgICBvdXRbNF0gPSAwLjA7XG4gICAgb3V0WzVdID0geVNjYWxlO1xuICAgIG91dFs2XSA9IDAuMDtcbiAgICBvdXRbN10gPSAwLjA7XG4gICAgb3V0WzhdID0gLSgobGVmdFRhbiAtIHJpZ2h0VGFuKSAqIHhTY2FsZSAqIDAuNSk7XG4gICAgb3V0WzldID0gKCh1cFRhbiAtIGRvd25UYW4pICogeVNjYWxlICogMC41KTtcbiAgICBvdXRbMTBdID0gZmFyIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFsxMV0gPSAtMS4wO1xuICAgIG91dFsxMl0gPSAwLjA7XG4gICAgb3V0WzEzXSA9IDAuMDtcbiAgICBvdXRbMTRdID0gKGZhciAqIG5lYXIpIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFsxNV0gPSAwLjA7XG4gICAgcmV0dXJuIG91dDtcbn1cblxuIiwibW9kdWxlLmV4cG9ydHMgPSByb3RhdGU7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdDQgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEBwYXJhbSB7dmVjM30gYXhpcyB0aGUgYXhpcyB0byByb3RhdGUgYXJvdW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJvdGF0ZShvdXQsIGEsIHJhZCwgYXhpcykge1xuICAgIHZhciB4ID0gYXhpc1swXSwgeSA9IGF4aXNbMV0sIHogPSBheGlzWzJdLFxuICAgICAgICBsZW4gPSBNYXRoLnNxcnQoeCAqIHggKyB5ICogeSArIHogKiB6KSxcbiAgICAgICAgcywgYywgdCxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMyxcbiAgICAgICAgYjAwLCBiMDEsIGIwMixcbiAgICAgICAgYjEwLCBiMTEsIGIxMixcbiAgICAgICAgYjIwLCBiMjEsIGIyMjtcblxuICAgIGlmIChNYXRoLmFicyhsZW4pIDwgMC4wMDAwMDEpIHsgcmV0dXJuIG51bGw7IH1cbiAgICBcbiAgICBsZW4gPSAxIC8gbGVuO1xuICAgIHggKj0gbGVuO1xuICAgIHkgKj0gbGVuO1xuICAgIHogKj0gbGVuO1xuXG4gICAgcyA9IE1hdGguc2luKHJhZCk7XG4gICAgYyA9IE1hdGguY29zKHJhZCk7XG4gICAgdCA9IDEgLSBjO1xuXG4gICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICBhMTAgPSBhWzRdOyBhMTEgPSBhWzVdOyBhMTIgPSBhWzZdOyBhMTMgPSBhWzddO1xuICAgIGEyMCA9IGFbOF07IGEyMSA9IGFbOV07IGEyMiA9IGFbMTBdOyBhMjMgPSBhWzExXTtcblxuICAgIC8vIENvbnN0cnVjdCB0aGUgZWxlbWVudHMgb2YgdGhlIHJvdGF0aW9uIG1hdHJpeFxuICAgIGIwMCA9IHggKiB4ICogdCArIGM7IGIwMSA9IHkgKiB4ICogdCArIHogKiBzOyBiMDIgPSB6ICogeCAqIHQgLSB5ICogcztcbiAgICBiMTAgPSB4ICogeSAqIHQgLSB6ICogczsgYjExID0geSAqIHkgKiB0ICsgYzsgYjEyID0geiAqIHkgKiB0ICsgeCAqIHM7XG4gICAgYjIwID0geCAqIHogKiB0ICsgeSAqIHM7IGIyMSA9IHkgKiB6ICogdCAtIHggKiBzOyBiMjIgPSB6ICogeiAqIHQgKyBjO1xuXG4gICAgLy8gUGVyZm9ybSByb3RhdGlvbi1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbMF0gPSBhMDAgKiBiMDAgKyBhMTAgKiBiMDEgKyBhMjAgKiBiMDI7XG4gICAgb3V0WzFdID0gYTAxICogYjAwICsgYTExICogYjAxICsgYTIxICogYjAyO1xuICAgIG91dFsyXSA9IGEwMiAqIGIwMCArIGExMiAqIGIwMSArIGEyMiAqIGIwMjtcbiAgICBvdXRbM10gPSBhMDMgKiBiMDAgKyBhMTMgKiBiMDEgKyBhMjMgKiBiMDI7XG4gICAgb3V0WzRdID0gYTAwICogYjEwICsgYTEwICogYjExICsgYTIwICogYjEyO1xuICAgIG91dFs1XSA9IGEwMSAqIGIxMCArIGExMSAqIGIxMSArIGEyMSAqIGIxMjtcbiAgICBvdXRbNl0gPSBhMDIgKiBiMTAgKyBhMTIgKiBiMTEgKyBhMjIgKiBiMTI7XG4gICAgb3V0WzddID0gYTAzICogYjEwICsgYTEzICogYjExICsgYTIzICogYjEyO1xuICAgIG91dFs4XSA9IGEwMCAqIGIyMCArIGExMCAqIGIyMSArIGEyMCAqIGIyMjtcbiAgICBvdXRbOV0gPSBhMDEgKiBiMjAgKyBhMTEgKiBiMjEgKyBhMjEgKiBiMjI7XG4gICAgb3V0WzEwXSA9IGEwMiAqIGIyMCArIGExMiAqIGIyMSArIGEyMiAqIGIyMjtcbiAgICBvdXRbMTFdID0gYTAzICogYjIwICsgYTEzICogYjIxICsgYTIzICogYjIyO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCBsYXN0IHJvd1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gcm90YXRlWDtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0cml4IGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFggYXhpc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJvdGF0ZVgob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICBhMTAgPSBhWzRdLFxuICAgICAgICBhMTEgPSBhWzVdLFxuICAgICAgICBhMTIgPSBhWzZdLFxuICAgICAgICBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLFxuICAgICAgICBhMjEgPSBhWzldLFxuICAgICAgICBhMjIgPSBhWzEwXSxcbiAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIHJvd3NcbiAgICAgICAgb3V0WzBdICA9IGFbMF07XG4gICAgICAgIG91dFsxXSAgPSBhWzFdO1xuICAgICAgICBvdXRbMl0gID0gYVsyXTtcbiAgICAgICAgb3V0WzNdICA9IGFbM107XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzRdID0gYTEwICogYyArIGEyMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyArIGEyMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyArIGEyMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyArIGEyMyAqIHM7XG4gICAgb3V0WzhdID0gYTIwICogYyAtIGExMCAqIHM7XG4gICAgb3V0WzldID0gYTIxICogYyAtIGExMSAqIHM7XG4gICAgb3V0WzEwXSA9IGEyMiAqIGMgLSBhMTIgKiBzO1xuICAgIG91dFsxMV0gPSBhMjMgKiBjIC0gYTEzICogcztcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHJvdGF0ZVk7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdHJpeCBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBZIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiByb3RhdGVZKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKSxcbiAgICAgICAgYTAwID0gYVswXSxcbiAgICAgICAgYTAxID0gYVsxXSxcbiAgICAgICAgYTAyID0gYVsyXSxcbiAgICAgICAgYTAzID0gYVszXSxcbiAgICAgICAgYTIwID0gYVs4XSxcbiAgICAgICAgYTIxID0gYVs5XSxcbiAgICAgICAgYTIyID0gYVsxMF0sXG4gICAgICAgIGEyMyA9IGFbMTFdO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCByb3dzXG4gICAgICAgIG91dFs0XSAgPSBhWzRdO1xuICAgICAgICBvdXRbNV0gID0gYVs1XTtcbiAgICAgICAgb3V0WzZdICA9IGFbNl07XG4gICAgICAgIG91dFs3XSAgPSBhWzddO1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuXG4gICAgLy8gUGVyZm9ybSBheGlzLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFswXSA9IGEwMCAqIGMgLSBhMjAgKiBzO1xuICAgIG91dFsxXSA9IGEwMSAqIGMgLSBhMjEgKiBzO1xuICAgIG91dFsyXSA9IGEwMiAqIGMgLSBhMjIgKiBzO1xuICAgIG91dFszXSA9IGEwMyAqIGMgLSBhMjMgKiBzO1xuICAgIG91dFs4XSA9IGEwMCAqIHMgKyBhMjAgKiBjO1xuICAgIG91dFs5XSA9IGEwMSAqIHMgKyBhMjEgKiBjO1xuICAgIG91dFsxMF0gPSBhMDIgKiBzICsgYTIyICogYztcbiAgICBvdXRbMTFdID0gYTAzICogcyArIGEyMyAqIGM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSByb3RhdGVaO1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXRyaXggYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWiBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gcm90YXRlWihvdXQsIGEsIHJhZCkge1xuICAgIHZhciBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCksXG4gICAgICAgIGEwMCA9IGFbMF0sXG4gICAgICAgIGEwMSA9IGFbMV0sXG4gICAgICAgIGEwMiA9IGFbMl0sXG4gICAgICAgIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sXG4gICAgICAgIGExMSA9IGFbNV0sXG4gICAgICAgIGExMiA9IGFbNl0sXG4gICAgICAgIGExMyA9IGFbN107XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIGxhc3Qgcm93XG4gICAgICAgIG91dFs4XSAgPSBhWzhdO1xuICAgICAgICBvdXRbOV0gID0gYVs5XTtcbiAgICAgICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgICAgICBvdXRbMTFdID0gYVsxMV07XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzBdID0gYTAwICogYyArIGExMCAqIHM7XG4gICAgb3V0WzFdID0gYTAxICogYyArIGExMSAqIHM7XG4gICAgb3V0WzJdID0gYTAyICogYyArIGExMiAqIHM7XG4gICAgb3V0WzNdID0gYTAzICogYyArIGExMyAqIHM7XG4gICAgb3V0WzRdID0gYTEwICogYyAtIGEwMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyAtIGEwMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyAtIGEwMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyAtIGEwMyAqIHM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBzY2FsZTtcblxuLyoqXG4gKiBTY2FsZXMgdGhlIG1hdDQgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gc2NhbGVcbiAqIEBwYXJhbSB7dmVjM30gdiB0aGUgdmVjMyB0byBzY2FsZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKiovXG5mdW5jdGlvbiBzY2FsZShvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXTtcblxuICAgIG91dFswXSA9IGFbMF0gKiB4O1xuICAgIG91dFsxXSA9IGFbMV0gKiB4O1xuICAgIG91dFsyXSA9IGFbMl0gKiB4O1xuICAgIG91dFszXSA9IGFbM10gKiB4O1xuICAgIG91dFs0XSA9IGFbNF0gKiB5O1xuICAgIG91dFs1XSA9IGFbNV0gKiB5O1xuICAgIG91dFs2XSA9IGFbNl0gKiB5O1xuICAgIG91dFs3XSA9IGFbN10gKiB5O1xuICAgIG91dFs4XSA9IGFbOF0gKiB6O1xuICAgIG91dFs5XSA9IGFbOV0gKiB6O1xuICAgIG91dFsxMF0gPSBhWzEwXSAqIHo7XG4gICAgb3V0WzExXSA9IGFbMTFdICogejtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBzdHI7XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5mdW5jdGlvbiBzdHIoYSkge1xuICAgIHJldHVybiAnbWF0NCgnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgYVszXSArICcsICcgK1xuICAgICAgICAgICAgICAgICAgICBhWzRdICsgJywgJyArIGFbNV0gKyAnLCAnICsgYVs2XSArICcsICcgKyBhWzddICsgJywgJyArXG4gICAgICAgICAgICAgICAgICAgIGFbOF0gKyAnLCAnICsgYVs5XSArICcsICcgKyBhWzEwXSArICcsICcgKyBhWzExXSArICcsICcgKyBcbiAgICAgICAgICAgICAgICAgICAgYVsxMl0gKyAnLCAnICsgYVsxM10gKyAnLCAnICsgYVsxNF0gKyAnLCAnICsgYVsxNV0gKyAnKSc7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gdHJhbnNsYXRlO1xuXG4vKipcbiAqIFRyYW5zbGF0ZSBhIG1hdDQgYnkgdGhlIGdpdmVuIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byB0cmFuc2xhdGVcbiAqIEBwYXJhbSB7dmVjM30gdiB2ZWN0b3IgdG8gdHJhbnNsYXRlIGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHRyYW5zbGF0ZShvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXSxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMztcblxuICAgIGlmIChhID09PSBvdXQpIHtcbiAgICAgICAgb3V0WzEyXSA9IGFbMF0gKiB4ICsgYVs0XSAqIHkgKyBhWzhdICogeiArIGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxXSAqIHggKyBhWzVdICogeSArIGFbOV0gKiB6ICsgYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzJdICogeCArIGFbNl0gKiB5ICsgYVsxMF0gKiB6ICsgYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzNdICogeCArIGFbN10gKiB5ICsgYVsxMV0gKiB6ICsgYVsxNV07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICAgICAgYTEwID0gYVs0XTsgYTExID0gYVs1XTsgYTEyID0gYVs2XTsgYTEzID0gYVs3XTtcbiAgICAgICAgYTIwID0gYVs4XTsgYTIxID0gYVs5XTsgYTIyID0gYVsxMF07IGEyMyA9IGFbMTFdO1xuXG4gICAgICAgIG91dFswXSA9IGEwMDsgb3V0WzFdID0gYTAxOyBvdXRbMl0gPSBhMDI7IG91dFszXSA9IGEwMztcbiAgICAgICAgb3V0WzRdID0gYTEwOyBvdXRbNV0gPSBhMTE7IG91dFs2XSA9IGExMjsgb3V0WzddID0gYTEzO1xuICAgICAgICBvdXRbOF0gPSBhMjA7IG91dFs5XSA9IGEyMTsgb3V0WzEwXSA9IGEyMjsgb3V0WzExXSA9IGEyMztcblxuICAgICAgICBvdXRbMTJdID0gYTAwICogeCArIGExMCAqIHkgKyBhMjAgKiB6ICsgYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhMDEgKiB4ICsgYTExICogeSArIGEyMSAqIHogKyBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGEwMiAqIHggKyBhMTIgKiB5ICsgYTIyICogeiArIGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYTAzICogeCArIGExMyAqIHkgKyBhMjMgKiB6ICsgYVsxNV07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSB0cmFuc3Bvc2U7XG5cbi8qKlxuICogVHJhbnNwb3NlIHRoZSB2YWx1ZXMgb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiB0cmFuc3Bvc2Uob3V0LCBhKSB7XG4gICAgLy8gSWYgd2UgYXJlIHRyYW5zcG9zaW5nIG91cnNlbHZlcyB3ZSBjYW4gc2tpcCBhIGZldyBzdGVwcyBidXQgaGF2ZSB0byBjYWNoZSBzb21lIHZhbHVlc1xuICAgIGlmIChvdXQgPT09IGEpIHtcbiAgICAgICAgdmFyIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgICAgICBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGEwMTtcbiAgICAgICAgb3V0WzZdID0gYVs5XTtcbiAgICAgICAgb3V0WzddID0gYVsxM107XG4gICAgICAgIG91dFs4XSA9IGEwMjtcbiAgICAgICAgb3V0WzldID0gYTEyO1xuICAgICAgICBvdXRbMTFdID0gYVsxNF07XG4gICAgICAgIG91dFsxMl0gPSBhMDM7XG4gICAgICAgIG91dFsxM10gPSBhMTM7XG4gICAgICAgIG91dFsxNF0gPSBhMjM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgb3V0WzBdID0gYVswXTtcbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGFbMV07XG4gICAgICAgIG91dFs1XSA9IGFbNV07XG4gICAgICAgIG91dFs2XSA9IGFbOV07XG4gICAgICAgIG91dFs3XSA9IGFbMTNdO1xuICAgICAgICBvdXRbOF0gPSBhWzJdO1xuICAgICAgICBvdXRbOV0gPSBhWzZdO1xuICAgICAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgICAgIG91dFsxMV0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzEyXSA9IGFbM107XG4gICAgICAgIG91dFsxM10gPSBhWzddO1xuICAgICAgICBvdXRbMTRdID0gYVsxMV07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07IiwiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIG1ha2VHYW1lU2hlbGwgPSByZXF1aXJlKFwiZ2FtZS1zaGVsbFwiKVxudmFyIHdlYmdsZXcgPSByZXF1aXJlKFwid2ViZ2xld1wiKVxuXG5mdW5jdGlvbiBjcmVhdGVHTFNoZWxsKG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgXG4gIHZhciBleHRlbnNpb25zID0gb3B0aW9ucy5leHRlbnNpb25zIHx8IFtdXG5cbiAgLy9GaXJzdCBjcmVhdGUgc2hlbGxcbiAgdmFyIHNoZWxsID0gbWFrZUdhbWVTaGVsbChvcHRpb25zKVxuICB2YXIgc2NhbGUgPSBzaGVsbC5zY2FsZSB8fCAxXG4gIHZhciBjb250ZXh0T3B0aW9ucyA9IG9wdGlvbnMuZ2xPcHRpb25zXG5cbiAgc2hlbGwub24oXCJpbml0XCIsIGZ1bmN0aW9uIGluaXRHTE5vdygpIHtcbiAgXG4gICAgLy9DcmVhdGUgY2FudmFzXG4gICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIilcbiAgICBcbiAgICAvL1RyeSBpbml0aWFsaXppbmcgV2ViR0xcbiAgICB2YXIgZ2wgPSBjYW52YXMuZ2V0Q29udGV4dChcIndlYmdsXCIsIGNvbnRleHRPcHRpb25zKSB8fCBcbiAgICAgICAgICAgICBjYW52YXMuZ2V0Q29udGV4dChcImV4cGVyaW1lbnRhbC13ZWJnbFwiLCBjb250ZXh0T3B0aW9ucylcbiAgICBpZighZ2wpIHtcbiAgICAgIHNoZWxsLmVtaXQoXCJnbC1lcnJvclwiLCBuZXcgRXJyb3IoXCJVbmFibGUgdG8gaW5pdGlhbGl6ZSBXZWJHTFwiKSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBcbiAgICAvL0NoZWNrIGV4dGVuc2lvbnNcbiAgICB2YXIgZXh0ID0gd2ViZ2xldyhnbClcbiAgICBmb3IodmFyIGk9MDsgaTxleHRlbnNpb25zLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZighKGV4dGVuc2lvbnNbaV0gaW4gZXh0KSkge1xuICAgICAgICBzaGVsbC5lbWl0KFwiZ2wtZXJyb3JcIiwgbmV3IEVycm9yKFwiTWlzc2luZyBleHRlbnNpb246IFwiICsgZXh0ZW5zaW9uc1tpXSkpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cblxuICAgIC8vU2V0IGNhbnZhcyBzdHlsZVxuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIlxuICAgIGNhbnZhcy5zdHlsZS5sZWZ0ID0gXCIwcHhcIlxuICAgIGNhbnZhcy5zdHlsZS50b3AgPSBcIjBweFwiXG4gICAgc2hlbGwuZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgICAvL0FkZCB2YXJpYWJsZXMgdG8gZ2FtZS1zaGVsbFxuICAgIHNoZWxsLmNhbnZhcyA9IGNhbnZhc1xuICAgIHNoZWxsLmdsID0gZ2xcblxuICAgIC8vTG9hZCB3aWR0aC9oZWlnaHRcbiAgICByZXNpemUoKVxuXG4gICAgLy9Mb2FkIGRlZmF1bHQgcGFyYW1ldGVyc1xuICAgIHNoZWxsLmNsZWFyRmxhZ3MgPSBvcHRpb25zLmNsZWFyRmxhZ3MgPT09IHVuZGVmaW5lZCA/IChnbC5DT0xPUl9CVUZGRVJfQklUIHwgZ2wuREVQVEhfQlVGRkVSX0JJVCkgOiBvcHRpb25zLmNsZWFyRmxhZ3NcbiAgICBzaGVsbC5jbGVhckNvbG9yID0gb3B0aW9ucy5jbGVhckNvbG9yIHx8IFswLDAsMCwwXVxuICAgIHNoZWxsLmNsZWFyRGVwdGggPSBvcHRpb25zLmNsZWFyRGVwdGggfHwgMS4wXG4gICAgc2hlbGwuY2xlYXJTdGVuY2lsID0gb3B0aW9ucy5jbGVhclN0ZW5jaWwgfHwgMFxuXG4gICAgc2hlbGwub24oXCJyZXNpemVcIiwgcmVzaXplKVxuXG4gICAgLy9Ib29rIHJlbmRlciBldmVudFxuICAgIHNoZWxsLm9uKFwicmVuZGVyXCIsIGZ1bmN0aW9uIHJlbmRlckdMTm93KHQpIHtcbiAgICBcbiAgICAgIC8vQmluZCBkZWZhdWx0IGZyYW1lYnVmZmVyXG4gICAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIG51bGwpXG4gICAgICBcbiAgICAgIC8vU2V0IHZpZXdwb3J0XG4gICAgICBnbC52aWV3cG9ydCgwLCAwLCAoc2hlbGwuX3dpZHRoIC8gc2NhbGUpfDAsIChzaGVsbC5faGVpZ2h0IC8gc2NhbGUpfDApXG5cbiAgICAgIC8vQ2xlYXIgYnVmZmVyc1xuICAgICAgaWYoc2hlbGwuY2xlYXJGbGFncyAmIGdsLlNURU5DSUxfQlVGRkVSX0JJVCkge1xuICAgICAgICBnbC5jbGVhclN0ZW5jaWwoc2hlbGwuY2xlYXJTdGVuY2lsKVxuICAgICAgfVxuICAgICAgaWYoc2hlbGwuY2xlYXJGbGFncyAmIGdsLkNPTE9SX0JVRkZFUl9CSVQpIHtcbiAgICAgICAgZ2wuY2xlYXJDb2xvcihzaGVsbC5jbGVhckNvbG9yWzBdLCBzaGVsbC5jbGVhckNvbG9yWzFdLCBzaGVsbC5jbGVhckNvbG9yWzJdLCBzaGVsbC5jbGVhckNvbG9yWzNdKVxuICAgICAgfVxuICAgICAgaWYoc2hlbGwuY2xlYXJGbGFncyAmIGdsLkRFUFRIX0JVRkZFUl9CSVQpIHtcbiAgICAgICAgZ2wuY2xlYXJEZXB0aChzaGVsbC5jbGVhckRlcHRoKVxuICAgICAgfVxuICAgICAgaWYoc2hlbGwuY2xlYXJGbGFncykge1xuICAgICAgICBnbC5jbGVhcihnbC5DT0xPUl9CVUZGRVJfQklUIHwgZ2wuREVQVEhfQlVGRkVSX0JJVCB8IGdsLlNURU5DSUxfQlVGRkVSX0JJVClcbiAgICAgIH1cbiAgICBcbiAgICAgIC8vUmVuZGVyIGZyYW1lXG4gICAgICBzaGVsbC5lbWl0KFwiZ2wtcmVuZGVyXCIsIHQpXG4gICAgfSlcbiAgICBcbiAgICAvL1dlYkdMIGluaXRpYWxpemVkXG4gICAgc2hlbGwuZW1pdChcImdsLWluaXRcIilcbiAgfSlcblxuICBmdW5jdGlvbiByZXNpemUoKSB7XG4gICAgdmFyIG53ID0gKHNoZWxsLl93aWR0aC9zY2FsZSl8MFxuICAgIHZhciBuaCA9IChzaGVsbC5faGVpZ2h0L3NjYWxlKXwwXG4gICAgc2hlbGwuY2FudmFzLndpZHRoID0gbndcbiAgICBzaGVsbC5jYW52YXMuaGVpZ2h0ID0gbmhcbiAgICBzaGVsbC5jYW52YXMuc3R5bGUud2lkdGggPSBzaGVsbC5fd2lkdGggKyAncHgnXG4gICAgc2hlbGwuY2FudmFzLnN0eWxlLmhlaWdodCA9IHNoZWxsLl9oZWlnaHQgKyAncHgnXG4gICAgc2hlbGwuZW1pdChcImdsLXJlc2l6ZVwiLCBudywgbmgpXG4gIH1cblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoc2hlbGwsICdzY2FsZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHNjYWxlXG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKF9zY2FsZSkge1xuICAgICAgX3NjYWxlID0gK19zY2FsZVxuICAgICAgaWYoKF9zY2FsZSA8PSAwKSB8fCBpc05hTihfc2NhbGUpIHx8IChzY2FsZSA9PT0gX3NjYWxlKSkge1xuICAgICAgICByZXR1cm4gc2NhbGVcbiAgICAgIH1cbiAgICAgIHNjYWxlID0gX3NjYWxlXG4gICAgICByZXNpemUoKVxuICAgICAgcmV0dXJuIHNjYWxlXG4gICAgfVxuICB9KVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShzaGVsbCwgXCJ3aWR0aFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAoc2hlbGwuX3dpZHRoIC8gc2NhbGUpfDBcbiAgICB9XG4gIH0pXG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHNoZWxsLCBcImhlaWdodFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAoc2hlbGwuX2hlaWdodCAvIHNjYWxlKXwwXG4gICAgfVxuICB9KVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShzaGVsbCwgXCJtb3VzZVwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBbc2hlbGwubW91c2VYL3NjYWxlLCBzaGVsbC5tb3VzZVkvc2NhbGVdXG4gICAgfVxuICB9KVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShzaGVsbCwgXCJwcmV2TW91c2VcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gW3NoZWxsLnByZXZNb3VzZVgvc2NhbGUsIHNoZWxsLnByZXZNb3VzZVkvc2NhbGVdXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiBzaGVsbFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUdMU2hlbGwiLCIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVBdHRyaWJ1dGVXcmFwcGVyXG5cbi8vU2hhZGVyIGF0dHJpYnV0ZSBjbGFzc1xuZnVuY3Rpb24gU2hhZGVyQXR0cmlidXRlKGdsLCBwcm9ncmFtLCBsb2NhdGlvbiwgZGltZW5zaW9uLCBuYW1lLCBjb25zdEZ1bmMsIHJlbGluaykge1xuICB0aGlzLl9nbCA9IGdsXG4gIHRoaXMuX3Byb2dyYW0gPSBwcm9ncmFtXG4gIHRoaXMuX2xvY2F0aW9uID0gbG9jYXRpb25cbiAgdGhpcy5fZGltZW5zaW9uID0gZGltZW5zaW9uXG4gIHRoaXMuX25hbWUgPSBuYW1lXG4gIHRoaXMuX2NvbnN0RnVuYyA9IGNvbnN0RnVuY1xuICB0aGlzLl9yZWxpbmsgPSByZWxpbmtcbn1cblxudmFyIHByb3RvID0gU2hhZGVyQXR0cmlidXRlLnByb3RvdHlwZVxuXG5wcm90by5wb2ludGVyID0gZnVuY3Rpb24gc2V0QXR0cmliUG9pbnRlcih0eXBlLCBub3JtYWxpemVkLCBzdHJpZGUsIG9mZnNldCkge1xuICB2YXIgZ2wgPSB0aGlzLl9nbFxuICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHRoaXMuX2xvY2F0aW9uLCB0aGlzLl9kaW1lbnNpb24sIHR5cGV8fGdsLkZMT0FULCAhIW5vcm1hbGl6ZWQsIHN0cmlkZXx8MCwgb2Zmc2V0fHwwKVxuICB0aGlzLl9nbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSh0aGlzLl9sb2NhdGlvbilcbn1cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCAnbG9jYXRpb24nLCB7XG4gIGdldDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX2xvY2F0aW9uXG4gIH1cbiAgLCBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICBpZih2ICE9PSB0aGlzLl9sb2NhdGlvbikge1xuICAgICAgdGhpcy5fbG9jYXRpb24gPSB2XG4gICAgICB0aGlzLl9nbC5iaW5kQXR0cmliTG9jYXRpb24odGhpcy5fcHJvZ3JhbSwgdiwgdGhpcy5fbmFtZSlcbiAgICAgIHRoaXMuX2dsLmxpbmtQcm9ncmFtKHRoaXMuX3Byb2dyYW0pXG4gICAgICB0aGlzLl9yZWxpbmsoKVxuICAgIH1cbiAgfVxufSlcblxuXG4vL0FkZHMgYSB2ZWN0b3IgYXR0cmlidXRlIHRvIG9ialxuZnVuY3Rpb24gYWRkVmVjdG9yQXR0cmlidXRlKGdsLCBwcm9ncmFtLCBsb2NhdGlvbiwgZGltZW5zaW9uLCBvYmosIG5hbWUsIGRvTGluaykge1xuICB2YXIgY29uc3RGdW5jQXJncyA9IFsgJ2dsJywgJ3YnIF1cbiAgdmFyIHZhck5hbWVzID0gW11cbiAgZm9yKHZhciBpPTA7IGk8ZGltZW5zaW9uOyArK2kpIHtcbiAgICBjb25zdEZ1bmNBcmdzLnB1c2goJ3gnK2kpXG4gICAgdmFyTmFtZXMucHVzaCgneCcraSlcbiAgfVxuICBjb25zdEZ1bmNBcmdzLnB1c2goW1xuICAgICdpZih4MC5sZW5ndGg9PT12b2lkIDApe3JldHVybiBnbC52ZXJ0ZXhBdHRyaWInLCBkaW1lbnNpb24sICdmKHYsJywgdmFyTmFtZXMuam9pbigpLCAnKX1lbHNle3JldHVybiBnbC52ZXJ0ZXhBdHRyaWInLCBkaW1lbnNpb24sICdmdih2LHgwKX0nXG4gIF0uam9pbignJykpXG4gIHZhciBjb25zdEZ1bmMgPSBGdW5jdGlvbi5hcHBseSh1bmRlZmluZWQsIGNvbnN0RnVuY0FyZ3MpXG4gIHZhciBhdHRyID0gbmV3IFNoYWRlckF0dHJpYnV0ZShnbCwgcHJvZ3JhbSwgbG9jYXRpb24sIGRpbWVuc2lvbiwgbmFtZSwgY29uc3RGdW5jLCBkb0xpbmspXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIG5hbWUsIHtcbiAgICBzZXQ6IGZ1bmN0aW9uKHgpIHtcbiAgICAgIGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShhdHRyLl9sb2NhdGlvbilcbiAgICAgIGNvbnN0RnVuYyhnbCwgYXR0ci5fbG9jYXRpb24sIHgpXG4gICAgICByZXR1cm4geFxuICAgIH1cbiAgICAsIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gYXR0clxuICAgIH1cbiAgICAsIGVudW1lcmFibGU6IHRydWVcbiAgfSlcbn1cblxuLy9DcmVhdGUgc2hpbXMgZm9yIGF0dHJpYnV0ZXNcbmZ1bmN0aW9uIGNyZWF0ZUF0dHJpYnV0ZVdyYXBwZXIoZ2wsIHByb2dyYW0sIGF0dHJpYnV0ZXMsIGRvTGluaykge1xuICB2YXIgb2JqID0ge31cbiAgZm9yKHZhciBpPTAsIG49YXR0cmlidXRlcy5sZW5ndGg7IGk8bjsgKytpKSB7XG4gICAgdmFyIGEgPSBhdHRyaWJ1dGVzW2ldXG4gICAgdmFyIG5hbWUgPSBhLm5hbWVcbiAgICB2YXIgdHlwZSA9IGEudHlwZVxuICAgIHZhciBsb2NhdGlvbiA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIG5hbWUpXG4gICAgXG4gICAgc3dpdGNoKHR5cGUpIHtcbiAgICAgIGNhc2UgJ2Jvb2wnOlxuICAgICAgY2FzZSAnaW50JzpcbiAgICAgIGNhc2UgJ2Zsb2F0JzpcbiAgICAgICAgYWRkVmVjdG9yQXR0cmlidXRlKGdsLCBwcm9ncmFtLCBsb2NhdGlvbiwgMSwgb2JqLCBuYW1lLCBkb0xpbmspXG4gICAgICBicmVha1xuICAgICAgXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZih0eXBlLmluZGV4T2YoJ3ZlYycpID49IDApIHtcbiAgICAgICAgICB2YXIgZCA9IHR5cGUuY2hhckNvZGVBdCh0eXBlLmxlbmd0aC0xKSAtIDQ4XG4gICAgICAgICAgaWYoZCA8IDIgfHwgZCA+IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtc2hhZGVyOiBJbnZhbGlkIGRhdGEgdHlwZSBmb3IgYXR0cmlidXRlICcgKyBuYW1lICsgJzogJyArIHR5cGUpXG4gICAgICAgICAgfVxuICAgICAgICAgIGFkZFZlY3RvckF0dHJpYnV0ZShnbCwgcHJvZ3JhbSwgbG9jYXRpb24sIGQsIG9iaiwgbmFtZSwgZG9MaW5rKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtc2hhZGVyOiBVbmtub3duIGRhdGEgdHlwZSBmb3IgYXR0cmlidXRlICcgKyBuYW1lICsgJzogJyArIHR5cGUpXG4gICAgICAgIH1cbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiBvYmpcbn0iLCIndXNlIHN0cmljdCdcblxudmFyIGR1cCA9IHJlcXVpcmUoJ2R1cCcpXG52YXIgY29hbGxlc2NlVW5pZm9ybXMgPSByZXF1aXJlKCcuL3JlZmxlY3QnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVVuaWZvcm1XcmFwcGVyXG5cbi8vQmluZHMgYSBmdW5jdGlvbiBhbmQgcmV0dXJucyBhIHZhbHVlXG5mdW5jdGlvbiBpZGVudGl0eSh4KSB7XG4gIHZhciBjID0gbmV3IEZ1bmN0aW9uKCd5JywgJ3JldHVybiBmdW5jdGlvbigpe3JldHVybiB5fScpXG4gIHJldHVybiBjKHgpXG59XG5cbi8vQ3JlYXRlIHNoaW1zIGZvciB1bmlmb3Jtc1xuZnVuY3Rpb24gY3JlYXRlVW5pZm9ybVdyYXBwZXIoZ2wsIHByb2dyYW0sIHVuaWZvcm1zLCBsb2NhdGlvbnMpIHtcblxuICBmdW5jdGlvbiBtYWtlR2V0dGVyKGluZGV4KSB7XG4gICAgdmFyIHByb2MgPSBuZXcgRnVuY3Rpb24oJ2dsJywgJ3Byb2cnLCAnbG9jYXRpb25zJywgXG4gICAgICAncmV0dXJuIGZ1bmN0aW9uKCl7cmV0dXJuIGdsLmdldFVuaWZvcm0ocHJvZyxsb2NhdGlvbnNbJyArIGluZGV4ICsgJ10pfScpIFxuICAgIHJldHVybiBwcm9jKGdsLCBwcm9ncmFtLCBsb2NhdGlvbnMpXG4gIH1cblxuICBmdW5jdGlvbiBtYWtlUHJvcFNldHRlcihwYXRoLCBpbmRleCwgdHlwZSkge1xuICAgIHN3aXRjaCh0eXBlKSB7XG4gICAgICBjYXNlICdib29sJzpcbiAgICAgIGNhc2UgJ2ludCc6XG4gICAgICBjYXNlICdzYW1wbGVyMkQnOlxuICAgICAgY2FzZSAnc2FtcGxlckN1YmUnOlxuICAgICAgICByZXR1cm4gJ2dsLnVuaWZvcm0xaShsb2NhdGlvbnNbJyArIGluZGV4ICsgJ10sb2JqJyArIHBhdGggKyAnKSdcbiAgICAgIGNhc2UgJ2Zsb2F0JzpcbiAgICAgICAgcmV0dXJuICdnbC51bmlmb3JtMWYobG9jYXRpb25zWycgKyBpbmRleCArICddLG9iaicgKyBwYXRoICsgJyknXG4gICAgICBkZWZhdWx0OlxuICAgICAgICB2YXIgdmlkeCA9IHR5cGUuaW5kZXhPZigndmVjJylcbiAgICAgICAgaWYoMCA8PSB2aWR4ICYmIHZpZHggPD0gMSAmJiB0eXBlLmxlbmd0aCA9PT0gNCArIHZpZHgpIHtcbiAgICAgICAgICB2YXIgZCA9IHR5cGUuY2hhckNvZGVBdCh0eXBlLmxlbmd0aC0xKSAtIDQ4XG4gICAgICAgICAgaWYoZCA8IDIgfHwgZCA+IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtc2hhZGVyOiBJbnZhbGlkIGRhdGEgdHlwZScpXG4gICAgICAgICAgfVxuICAgICAgICAgIHN3aXRjaCh0eXBlLmNoYXJBdCgwKSkge1xuICAgICAgICAgICAgY2FzZSAnYic6XG4gICAgICAgICAgICBjYXNlICdpJzpcbiAgICAgICAgICAgICAgcmV0dXJuICdnbC51bmlmb3JtJyArIGQgKyAnaXYobG9jYXRpb25zWycgKyBpbmRleCArICddLG9iaicgKyBwYXRoICsgJyknXG4gICAgICAgICAgICBjYXNlICd2JzpcbiAgICAgICAgICAgICAgcmV0dXJuICdnbC51bmlmb3JtJyArIGQgKyAnZnYobG9jYXRpb25zWycgKyBpbmRleCArICddLG9iaicgKyBwYXRoICsgJyknXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXNoYWRlcjogVW5yZWNvZ25pemVkIGRhdGEgdHlwZSBmb3IgdmVjdG9yICcgKyBuYW1lICsgJzogJyArIHR5cGUpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYodHlwZS5pbmRleE9mKCdtYXQnKSA9PT0gMCAmJiB0eXBlLmxlbmd0aCA9PT0gNCkge1xuICAgICAgICAgIHZhciBkID0gdHlwZS5jaGFyQ29kZUF0KHR5cGUubGVuZ3RoLTEpIC0gNDhcbiAgICAgICAgICBpZihkIDwgMiB8fCBkID4gNCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC1zaGFkZXI6IEludmFsaWQgdW5pZm9ybSBkaW1lbnNpb24gdHlwZSBmb3IgbWF0cml4ICcgKyBuYW1lICsgJzogJyArIHR5cGUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiAnZ2wudW5pZm9ybU1hdHJpeCcgKyBkICsgJ2Z2KGxvY2F0aW9uc1snICsgaW5kZXggKyAnXSxmYWxzZSxvYmonICsgcGF0aCArICcpJ1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtc2hhZGVyOiBVbmtub3duIHVuaWZvcm0gZGF0YSB0eXBlIGZvciAnICsgbmFtZSArICc6ICcgKyB0eXBlKVxuICAgICAgICB9XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVudW1lcmF0ZUluZGljZXMocHJlZml4LCB0eXBlKSB7XG4gICAgaWYodHlwZW9mIHR5cGUgIT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gWyBbcHJlZml4LCB0eXBlXSBdXG4gICAgfVxuICAgIHZhciBpbmRpY2VzID0gW11cbiAgICBmb3IodmFyIGlkIGluIHR5cGUpIHtcbiAgICAgIHZhciBwcm9wID0gdHlwZVtpZF1cbiAgICAgIHZhciB0cHJlZml4ID0gcHJlZml4XG4gICAgICBpZihwYXJzZUludChpZCkgKyAnJyA9PT0gaWQpIHtcbiAgICAgICAgdHByZWZpeCArPSAnWycgKyBpZCArICddJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHByZWZpeCArPSAnLicgKyBpZFxuICAgICAgfVxuICAgICAgaWYodHlwZW9mIHByb3AgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGluZGljZXMucHVzaC5hcHBseShpbmRpY2VzLCBlbnVtZXJhdGVJbmRpY2VzKHRwcmVmaXgsIHByb3ApKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5kaWNlcy5wdXNoKFt0cHJlZml4LCBwcm9wXSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGluZGljZXNcbiAgfVxuXG4gIGZ1bmN0aW9uIG1ha2VTZXR0ZXIodHlwZSkge1xuICAgIHZhciBjb2RlID0gWyAncmV0dXJuIGZ1bmN0aW9uIHVwZGF0ZVByb3BlcnR5KG9iail7JyBdXG4gICAgdmFyIGluZGljZXMgPSBlbnVtZXJhdGVJbmRpY2VzKCcnLCB0eXBlKVxuICAgIGZvcih2YXIgaT0wOyBpPGluZGljZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBpdGVtID0gaW5kaWNlc1tpXVxuICAgICAgdmFyIHBhdGggPSBpdGVtWzBdXG4gICAgICB2YXIgaWR4ICA9IGl0ZW1bMV1cbiAgICAgIGlmKGxvY2F0aW9uc1tpZHhdKSB7XG4gICAgICAgIGNvZGUucHVzaChtYWtlUHJvcFNldHRlcihwYXRoLCBpZHgsIHVuaWZvcm1zW2lkeF0udHlwZSkpXG4gICAgICB9XG4gICAgfVxuICAgIGNvZGUucHVzaCgncmV0dXJuIG9ian0nKVxuICAgIHZhciBwcm9jID0gbmV3IEZ1bmN0aW9uKCdnbCcsICdwcm9nJywgJ2xvY2F0aW9ucycsIGNvZGUuam9pbignXFxuJykpXG4gICAgcmV0dXJuIHByb2MoZ2wsIHByb2dyYW0sIGxvY2F0aW9ucylcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlZmF1bHRWYWx1ZSh0eXBlKSB7XG4gICAgc3dpdGNoKHR5cGUpIHtcbiAgICAgIGNhc2UgJ2Jvb2wnOlxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIGNhc2UgJ2ludCc6XG4gICAgICBjYXNlICdzYW1wbGVyMkQnOlxuICAgICAgY2FzZSAnc2FtcGxlckN1YmUnOlxuICAgICAgICByZXR1cm4gMFxuICAgICAgY2FzZSAnZmxvYXQnOlxuICAgICAgICByZXR1cm4gMC4wXG4gICAgICBkZWZhdWx0OlxuICAgICAgICB2YXIgdmlkeCA9IHR5cGUuaW5kZXhPZigndmVjJylcbiAgICAgICAgaWYoMCA8PSB2aWR4ICYmIHZpZHggPD0gMSAmJiB0eXBlLmxlbmd0aCA9PT0gNCArIHZpZHgpIHtcbiAgICAgICAgICB2YXIgZCA9IHR5cGUuY2hhckNvZGVBdCh0eXBlLmxlbmd0aC0xKSAtIDQ4XG4gICAgICAgICAgaWYoZCA8IDIgfHwgZCA+IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtc2hhZGVyOiBJbnZhbGlkIGRhdGEgdHlwZScpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmKHR5cGUuY2hhckF0KDApID09PSAnYicpIHtcbiAgICAgICAgICAgIHJldHVybiBkdXAoZCwgZmFsc2UpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBkdXAoZClcbiAgICAgICAgfSBlbHNlIGlmKHR5cGUuaW5kZXhPZignbWF0JykgPT09IDAgJiYgdHlwZS5sZW5ndGggPT09IDQpIHtcbiAgICAgICAgICB2YXIgZCA9IHR5cGUuY2hhckNvZGVBdCh0eXBlLmxlbmd0aC0xKSAtIDQ4XG4gICAgICAgICAgaWYoZCA8IDIgfHwgZCA+IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtc2hhZGVyOiBJbnZhbGlkIHVuaWZvcm0gZGltZW5zaW9uIHR5cGUgZm9yIG1hdHJpeCAnICsgbmFtZSArICc6ICcgKyB0eXBlKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gZHVwKFtkLGRdKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtc2hhZGVyOiBVbmtub3duIHVuaWZvcm0gZGF0YSB0eXBlIGZvciAnICsgbmFtZSArICc6ICcgKyB0eXBlKVxuICAgICAgICB9XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3JlUHJvcGVydHkob2JqLCBwcm9wLCB0eXBlKSB7XG4gICAgaWYodHlwZW9mIHR5cGUgPT09ICdvYmplY3QnKSB7XG4gICAgICB2YXIgY2hpbGQgPSBwcm9jZXNzT2JqZWN0KHR5cGUpXG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG4gICAgICAgIGdldDogaWRlbnRpdHkoY2hpbGQpLFxuICAgICAgICBzZXQ6IG1ha2VTZXR0ZXIodHlwZSksXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2VcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmKGxvY2F0aW9uc1t0eXBlXSkge1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG4gICAgICAgICAgZ2V0OiBtYWtlR2V0dGVyKHR5cGUpLFxuICAgICAgICAgIHNldDogbWFrZVNldHRlcih0eXBlKSxcbiAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2VcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9ialtwcm9wXSA9IGRlZmF1bHRWYWx1ZSh1bmlmb3Jtc1t0eXBlXS50eXBlKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHByb2Nlc3NPYmplY3Qob2JqKSB7XG4gICAgdmFyIHJlc3VsdFxuICAgIGlmKEFycmF5LmlzQXJyYXkob2JqKSkge1xuICAgICAgcmVzdWx0ID0gbmV3IEFycmF5KG9iai5sZW5ndGgpXG4gICAgICBmb3IodmFyIGk9MDsgaTxvYmoubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgc3RvcmVQcm9wZXJ0eShyZXN1bHQsIGksIG9ialtpXSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0ge31cbiAgICAgIGZvcih2YXIgaWQgaW4gb2JqKSB7XG4gICAgICAgIHN0b3JlUHJvcGVydHkocmVzdWx0LCBpZCwgb2JqW2lkXSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy9SZXR1cm4gZGF0YVxuICB2YXIgY29hbGxlc2NlZCA9IGNvYWxsZXNjZVVuaWZvcm1zKHVuaWZvcm1zLCB0cnVlKVxuICByZXR1cm4ge1xuICAgIGdldDogaWRlbnRpdHkocHJvY2Vzc09iamVjdChjb2FsbGVzY2VkKSksXG4gICAgc2V0OiBtYWtlU2V0dGVyKGNvYWxsZXNjZWQpLFxuICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgY29uZmlndXJhYmxlOiB0cnVlXG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1ha2VSZWZsZWN0VHlwZXNcblxuLy9Db25zdHJ1Y3QgdHlwZSBpbmZvIGZvciByZWZsZWN0aW9uLlxuLy9cbi8vIFRoaXMgaXRlcmF0ZXMgb3ZlciB0aGUgZmxhdHRlbmVkIGxpc3Qgb2YgdW5pZm9ybSB0eXBlIHZhbHVlcyBhbmQgc21hc2hlcyB0aGVtIGludG8gYSBKU09OIG9iamVjdC5cbi8vXG4vLyBUaGUgbGVhdmVzIG9mIHRoZSByZXN1bHRpbmcgb2JqZWN0IGFyZSBlaXRoZXIgaW5kaWNlcyBvciB0eXBlIHN0cmluZ3MgcmVwcmVzZW50aW5nIHByaW1pdGl2ZSBnbHNsaWZ5IHR5cGVzXG5mdW5jdGlvbiBtYWtlUmVmbGVjdFR5cGVzKHVuaWZvcm1zLCB1c2VJbmRleCkge1xuICB2YXIgb2JqID0ge31cbiAgZm9yKHZhciBpPTA7IGk8dW5pZm9ybXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbiA9IHVuaWZvcm1zW2ldLm5hbWVcbiAgICB2YXIgcGFydHMgPSBuLnNwbGl0KFwiLlwiKVxuICAgIHZhciBvID0gb2JqXG4gICAgZm9yKHZhciBqPTA7IGo8cGFydHMubGVuZ3RoOyArK2opIHtcbiAgICAgIHZhciB4ID0gcGFydHNbal0uc3BsaXQoXCJbXCIpXG4gICAgICBpZih4Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgaWYoISh4WzBdIGluIG8pKSB7XG4gICAgICAgICAgb1t4WzBdXSA9IFtdXG4gICAgICAgIH1cbiAgICAgICAgbyA9IG9beFswXV1cbiAgICAgICAgZm9yKHZhciBrPTE7IGs8eC5sZW5ndGg7ICsraykge1xuICAgICAgICAgIHZhciB5ID0gcGFyc2VJbnQoeFtrXSlcbiAgICAgICAgICBpZihrPHgubGVuZ3RoLTEgfHwgajxwYXJ0cy5sZW5ndGgtMSkge1xuICAgICAgICAgICAgaWYoISh5IGluIG8pKSB7XG4gICAgICAgICAgICAgIGlmKGsgPCB4Lmxlbmd0aC0xKSB7XG4gICAgICAgICAgICAgICAgb1t5XSA9IFtdXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb1t5XSA9IHt9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG8gPSBvW3ldXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmKHVzZUluZGV4KSB7XG4gICAgICAgICAgICAgIG9beV0gPSBpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBvW3ldID0gdW5pZm9ybXNbaV0udHlwZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmKGogPCBwYXJ0cy5sZW5ndGgtMSkge1xuICAgICAgICBpZighKHhbMF0gaW4gbykpIHtcbiAgICAgICAgICBvW3hbMF1dID0ge31cbiAgICAgICAgfVxuICAgICAgICBvID0gb1t4WzBdXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYodXNlSW5kZXgpIHtcbiAgICAgICAgICBvW3hbMF1dID0gaVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG9beFswXV0gPSB1bmlmb3Jtc1tpXS50eXBlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9ialxufSIsIid1c2Ugc3RyaWN0J1xuXG52YXIgY3JlYXRlVW5pZm9ybVdyYXBwZXIgPSByZXF1aXJlKCcuL2xpYi9jcmVhdGUtdW5pZm9ybXMnKVxudmFyIGNyZWF0ZUF0dHJpYnV0ZVdyYXBwZXIgPSByZXF1aXJlKCcuL2xpYi9jcmVhdGUtYXR0cmlidXRlcycpXG52YXIgbWFrZVJlZmxlY3QgPSByZXF1aXJlKCcuL2xpYi9yZWZsZWN0JylcblxuLy9TaGFkZXIgb2JqZWN0XG5mdW5jdGlvbiBTaGFkZXIoZ2wsIHByb2csIHZlcnRTaGFkZXIsIGZyYWdTaGFkZXIpIHtcbiAgdGhpcy5nbCA9IGdsXG4gIHRoaXMuaGFuZGxlID0gcHJvZ1xuICB0aGlzLmF0dHJpYnV0ZXMgPSBudWxsXG4gIHRoaXMudW5pZm9ybXMgPSBudWxsXG4gIHRoaXMudHlwZXMgPSBudWxsXG4gIHRoaXMudmVydGV4U2hhZGVyID0gdmVydFNoYWRlclxuICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ1NoYWRlclxufVxuXG4vL0JpbmRzIHRoZSBzaGFkZXJcblNoYWRlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdsLnVzZVByb2dyYW0odGhpcy5oYW5kbGUpXG59XG5cbi8vRGVzdHJveSBzaGFkZXIsIHJlbGVhc2UgcmVzb3VyY2VzXG5TaGFkZXIucHJvdG90eXBlLmRpc3Bvc2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGdsID0gdGhpcy5nbFxuICBnbC5kZWxldGVTaGFkZXIodGhpcy52ZXJ0ZXhTaGFkZXIpXG4gIGdsLmRlbGV0ZVNoYWRlcih0aGlzLmZyYWdtZW50U2hhZGVyKVxuICBnbC5kZWxldGVQcm9ncmFtKHRoaXMuaGFuZGxlKVxufVxuXG5TaGFkZXIucHJvdG90eXBlLnVwZGF0ZUV4cG9ydHMgPSBmdW5jdGlvbih1bmlmb3JtcywgYXR0cmlidXRlcykge1xuICB2YXIgbG9jYXRpb25zID0gbmV3IEFycmF5KHVuaWZvcm1zLmxlbmd0aClcbiAgdmFyIHByb2dyYW0gPSB0aGlzLmhhbmRsZVxuICB2YXIgZ2wgPSB0aGlzLmdsXG5cbiAgdmFyIGRvTGluayA9IHJlbGlua1VuaWZvcm1zLmJpbmQodm9pZCAwLFxuICAgIGdsLFxuICAgIHByb2dyYW0sXG4gICAgbG9jYXRpb25zLFxuICAgIHVuaWZvcm1zXG4gIClcbiAgZG9MaW5rKClcblxuICB0aGlzLnR5cGVzID0ge1xuICAgIHVuaWZvcm1zOiBtYWtlUmVmbGVjdCh1bmlmb3JtcyksXG4gICAgYXR0cmlidXRlczogbWFrZVJlZmxlY3QoYXR0cmlidXRlcylcbiAgfVxuXG4gIHRoaXMuYXR0cmlidXRlcyA9IGNyZWF0ZUF0dHJpYnV0ZVdyYXBwZXIoXG4gICAgZ2wsXG4gICAgcHJvZ3JhbSxcbiAgICBhdHRyaWJ1dGVzLFxuICAgIGRvTGlua1xuICApXG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICd1bmlmb3JtcycsIGNyZWF0ZVVuaWZvcm1XcmFwcGVyKFxuICAgIGdsLFxuICAgIHByb2dyYW0sXG4gICAgdW5pZm9ybXMsXG4gICAgbG9jYXRpb25zXG4gICkpXG59XG5cbi8vUmVsaW5rcyBhbGwgdW5pZm9ybXNcbmZ1bmN0aW9uIHJlbGlua1VuaWZvcm1zKGdsLCBwcm9ncmFtLCBsb2NhdGlvbnMsIHVuaWZvcm1zKSB7XG4gIGZvcih2YXIgaT0wOyBpPHVuaWZvcm1zLmxlbmd0aDsgKytpKSB7XG4gICAgbG9jYXRpb25zW2ldID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIHVuaWZvcm1zW2ldLm5hbWUpXG4gIH1cbn1cblxuLy9Db21waWxlcyBhbmQgbGlua3MgYSBzaGFkZXIgcHJvZ3JhbSB3aXRoIHRoZSBnaXZlbiBhdHRyaWJ1dGUgYW5kIHZlcnRleCBsaXN0XG5mdW5jdGlvbiBjcmVhdGVTaGFkZXIoXG4gICAgZ2xcbiAgLCB2ZXJ0U291cmNlXG4gICwgZnJhZ1NvdXJjZVxuICAsIHVuaWZvcm1zXG4gICwgYXR0cmlidXRlcykge1xuICBcbiAgLy9Db21waWxlIHZlcnRleCBzaGFkZXJcbiAgdmFyIHZlcnRTaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIoZ2wuVkVSVEVYX1NIQURFUilcbiAgZ2wuc2hhZGVyU291cmNlKHZlcnRTaGFkZXIsIHZlcnRTb3VyY2UpXG4gIGdsLmNvbXBpbGVTaGFkZXIodmVydFNoYWRlcilcbiAgaWYoIWdsLmdldFNoYWRlclBhcmFtZXRlcih2ZXJ0U2hhZGVyLCBnbC5DT01QSUxFX1NUQVRVUykpIHtcbiAgICB2YXIgZXJyTG9nID0gZ2wuZ2V0U2hhZGVySW5mb0xvZyh2ZXJ0U2hhZGVyKVxuICAgIGNvbnNvbGUuZXJyb3IoJ2dsLXNoYWRlcjogRXJyb3IgY29tcGxpbmcgdmVydGV4IHNoYWRlcjonLCBlcnJMb2cpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdnbC1zaGFkZXI6IEVycm9yIGNvbXBpbGluZyB2ZXJ0ZXggc2hhZGVyOicgKyBlcnJMb2cpXG4gIH1cbiAgXG4gIC8vQ29tcGlsZSBmcmFnbWVudCBzaGFkZXJcbiAgdmFyIGZyYWdTaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSKVxuICBnbC5zaGFkZXJTb3VyY2UoZnJhZ1NoYWRlciwgZnJhZ1NvdXJjZSlcbiAgZ2wuY29tcGlsZVNoYWRlcihmcmFnU2hhZGVyKVxuICBpZighZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKGZyYWdTaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSkge1xuICAgIHZhciBlcnJMb2cgPSBnbC5nZXRTaGFkZXJJbmZvTG9nKGZyYWdTaGFkZXIpXG4gICAgY29uc29sZS5lcnJvcignZ2wtc2hhZGVyOiBFcnJvciBjb21waWxpbmcgZnJhZ21lbnQgc2hhZGVyOicsIGVyckxvZylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXNoYWRlcjogRXJyb3IgY29tcGlsaW5nIGZyYWdtZW50IHNoYWRlcjonICsgZXJyTG9nKVxuICB9XG4gIFxuICAvL0xpbmsgcHJvZ3JhbVxuICB2YXIgcHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKVxuICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG5cbiAgLy9PcHRpb25hbCBkZWZhdWx0IGF0dHJpdWJ0ZSBsb2NhdGlvbnNcbiAgYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGEpIHtcbiAgICBpZiAodHlwZW9mIGEubG9jYXRpb24gPT09ICdudW1iZXInKSBcbiAgICAgIGdsLmJpbmRBdHRyaWJMb2NhdGlvbihwcm9ncmFtLCBhLmxvY2F0aW9uLCBhLm5hbWUpXG4gIH0pXG5cbiAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgaWYoIWdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgZ2wuTElOS19TVEFUVVMpKSB7XG4gICAgdmFyIGVyckxvZyA9IGdsLmdldFByb2dyYW1JbmZvTG9nKHByb2dyYW0pXG4gICAgY29uc29sZS5lcnJvcignZ2wtc2hhZGVyOiBFcnJvciBsaW5raW5nIHNoYWRlciBwcm9ncmFtOicsIGVyckxvZylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXNoYWRlcjogRXJyb3IgbGlua2luZyBzaGFkZXIgcHJvZ3JhbTonICsgZXJyTG9nKVxuICB9XG4gIFxuICAvL1JldHVybiBmaW5hbCBsaW5rZWQgc2hhZGVyIG9iamVjdFxuICB2YXIgc2hhZGVyID0gbmV3IFNoYWRlcihcbiAgICBnbCxcbiAgICBwcm9ncmFtLFxuICAgIHZlcnRTaGFkZXIsXG4gICAgZnJhZ1NoYWRlclxuICApXG4gIHNoYWRlci51cGRhdGVFeHBvcnRzKHVuaWZvcm1zLCBhdHRyaWJ1dGVzKVxuXG4gIHJldHVybiBzaGFkZXJcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVTaGFkZXJcbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgbmRhcnJheSA9IHJlcXVpcmUoJ25kYXJyYXknKVxudmFyIG9wcyAgICAgPSByZXF1aXJlKCduZGFycmF5LW9wcycpXG52YXIgcG9vbCAgICA9IHJlcXVpcmUoJ3R5cGVkYXJyYXktcG9vbCcpXG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlVGV4dHVyZTJEXG5cbnZhciBsaW5lYXJUeXBlcyA9IG51bGxcbnZhciBmaWx0ZXJUeXBlcyA9IG51bGxcbnZhciB3cmFwVHlwZXMgICA9IG51bGxcblxuZnVuY3Rpb24gbGF6eUluaXRMaW5lYXJUeXBlcyhnbCkge1xuICBsaW5lYXJUeXBlcyA9IFtcbiAgICBnbC5MSU5FQVIsXG4gICAgZ2wuTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgIGdsLkxJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICBnbC5MSU5FQVJfTUlQTUFQX05FQVJFU1RcbiAgXVxuICBmaWx0ZXJUeXBlcyA9IFtcbiAgICBnbC5ORUFSRVNULFxuICAgIGdsLkxJTkVBUixcbiAgICBnbC5ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICAgIGdsLk5FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgICBnbC5MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gICAgZ2wuTElORUFSX01JUE1BUF9MSU5FQVJcbiAgXVxuICB3cmFwVHlwZXMgPSBbXG4gICAgZ2wuUkVQRUFULFxuICAgIGdsLkNMQU1QX1RPX0VER0UsXG4gICAgZ2wuTUlSUk9SRURfUkVQRUFUXG4gIF1cbn1cblxuZnVuY3Rpb24gYWNjZXB0VGV4dHVyZURPTSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgKCd1bmRlZmluZWQnICE9IHR5cGVvZiBIVE1MQ2FudmFzRWxlbWVudCAmJiBvYmogaW5zdGFuY2VvZiBIVE1MQ2FudmFzRWxlbWVudCkgfHxcbiAgICAoJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIEhUTUxJbWFnZUVsZW1lbnQgJiYgb2JqIGluc3RhbmNlb2YgSFRNTEltYWdlRWxlbWVudCkgfHxcbiAgICAoJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIEhUTUxWaWRlb0VsZW1lbnQgJiYgb2JqIGluc3RhbmNlb2YgSFRNTFZpZGVvRWxlbWVudCkgfHxcbiAgICAoJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIEltYWdlRGF0YSAmJiBvYmogaW5zdGFuY2VvZiBJbWFnZURhdGEpKVxufVxuXG52YXIgY29udmVydEZsb2F0VG9VaW50OCA9IGZ1bmN0aW9uKG91dCwgaW5wKSB7XG4gIG9wcy5tdWxzKG91dCwgaW5wLCAyNTUuMClcbn1cblxuZnVuY3Rpb24gcmVzaGFwZVRleHR1cmUodGV4LCB3LCBoKSB7XG4gIHZhciBnbCA9IHRleC5nbFxuICB2YXIgbWF4U2l6ZSA9IGdsLmdldFBhcmFtZXRlcihnbC5NQVhfVEVYVFVSRV9TSVpFKVxuICBpZih3IDwgMCB8fCB3ID4gbWF4U2l6ZSB8fCBoIDwgMCB8fCBoID4gbWF4U2l6ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBJbnZhbGlkIHRleHR1cmUgc2l6ZScpXG4gIH1cbiAgdGV4Ll9zaGFwZSA9IFt3LCBoXVxuICB0ZXguYmluZCgpXG4gIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgMCwgdGV4LmZvcm1hdCwgdywgaCwgMCwgdGV4LmZvcm1hdCwgdGV4LnR5cGUsIG51bGwpXG4gIHRleC5fbWlwTGV2ZWxzID0gWzBdXG4gIHJldHVybiB0ZXhcbn1cblxuZnVuY3Rpb24gVGV4dHVyZTJEKGdsLCBoYW5kbGUsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSkge1xuICB0aGlzLmdsID0gZ2xcbiAgdGhpcy5oYW5kbGUgPSBoYW5kbGVcbiAgdGhpcy5mb3JtYXQgPSBmb3JtYXRcbiAgdGhpcy50eXBlID0gdHlwZVxuICB0aGlzLl9zaGFwZSA9IFt3aWR0aCwgaGVpZ2h0XVxuICB0aGlzLl9taXBMZXZlbHMgPSBbMF1cbiAgdGhpcy5fbWFnRmlsdGVyID0gZ2wuTkVBUkVTVFxuICB0aGlzLl9taW5GaWx0ZXIgPSBnbC5ORUFSRVNUXG4gIHRoaXMuX3dyYXBTID0gZ2wuQ0xBTVBfVE9fRURHRVxuICB0aGlzLl93cmFwVCA9IGdsLkNMQU1QX1RPX0VER0VcbiAgdGhpcy5fYW5pc29TYW1wbGVzID0gMVxuXG4gIHZhciBwYXJlbnQgPSB0aGlzXG4gIHZhciB3cmFwVmVjdG9yID0gW3RoaXMuX3dyYXBTLCB0aGlzLl93cmFwVF1cbiAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMod3JhcFZlY3RvciwgW1xuICAgIHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwYXJlbnQuX3dyYXBTXG4gICAgICB9LFxuICAgICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiBwYXJlbnQud3JhcFMgPSB2XG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcGFyZW50Ll93cmFwVFxuICAgICAgfSxcbiAgICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICByZXR1cm4gcGFyZW50LndyYXBUID0gdlxuICAgICAgfVxuICAgIH1cbiAgXSlcbiAgdGhpcy5fd3JhcFZlY3RvciA9IHdyYXBWZWN0b3JcblxuICB2YXIgc2hhcGVWZWN0b3IgPSBbdGhpcy5fc2hhcGVbMF0sIHRoaXMuX3NoYXBlWzFdXVxuICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhzaGFwZVZlY3RvciwgW1xuICAgIHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwYXJlbnQuX3NoYXBlWzBdXG4gICAgICB9LFxuICAgICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiBwYXJlbnQud2lkdGggPSB2XG4gICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcGFyZW50Ll9zaGFwZVsxXVxuICAgICAgfSxcbiAgICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICByZXR1cm4gcGFyZW50LmhlaWdodCA9IHZcbiAgICAgIH1cbiAgICB9XG4gIF0pXG4gIHRoaXMuX3NoYXBlVmVjdG9yID0gc2hhcGVWZWN0b3Jcbn1cblxudmFyIHByb3RvID0gVGV4dHVyZTJELnByb3RvdHlwZVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydGllcyhwcm90bywge1xuICBtaW5GaWx0ZXI6IHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMuX21pbkZpbHRlclxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICB0aGlzLmJpbmQoKVxuICAgICAgdmFyIGdsID0gdGhpcy5nbFxuICAgICAgaWYodGhpcy50eXBlID09PSBnbC5GTE9BVCAmJiBsaW5lYXJUeXBlcy5pbmRleE9mKHYpID49IDApIHtcbiAgICAgICAgaWYoIWdsLmdldEV4dGVuc2lvbignT0VTX3RleHR1cmVfZmxvYXRfbGluZWFyJykpIHtcbiAgICAgICAgICB2ID0gZ2wuTkVBUkVTVFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZihmaWx0ZXJUeXBlcy5pbmRleE9mKHYpIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXRleHR1cmUyZDogVW5rbm93biBmaWx0ZXIgbW9kZSAnICsgdilcbiAgICAgIH1cbiAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NSU5fRklMVEVSLCB2KVxuICAgICAgcmV0dXJuIHRoaXMuX21pbkZpbHRlciA9IHZcbiAgICB9XG4gIH0sXG4gIG1hZ0ZpbHRlcjoge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5fbWFnRmlsdGVyXG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgIHRoaXMuYmluZCgpXG4gICAgICB2YXIgZ2wgPSB0aGlzLmdsXG4gICAgICBpZih0aGlzLnR5cGUgPT09IGdsLkZMT0FUICYmIGxpbmVhclR5cGVzLmluZGV4T2YodikgPj0gMCkge1xuICAgICAgICBpZighZ2wuZ2V0RXh0ZW5zaW9uKCdPRVNfdGV4dHVyZV9mbG9hdF9saW5lYXInKSkge1xuICAgICAgICAgIHYgPSBnbC5ORUFSRVNUXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmKGZpbHRlclR5cGVzLmluZGV4T2YodikgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBVbmtub3duIGZpbHRlciBtb2RlICcgKyB2KVxuICAgICAgfVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01BR19GSUxURVIsIHYpXG4gICAgICByZXR1cm4gdGhpcy5fbWFnRmlsdGVyID0gdlxuICAgIH1cbiAgfSxcbiAgbWlwU2FtcGxlczoge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5fYW5pc29TYW1wbGVzXG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKGkpIHtcbiAgICAgIHZhciBwc2FtcGxlcyA9IHRoaXMuX2FuaXNvU2FtcGxlc1xuICAgICAgdGhpcy5fYW5pc29TYW1wbGVzID0gTWF0aC5tYXgoaSwgMSl8MFxuICAgICAgaWYocHNhbXBsZXMgIT09IHRoaXMuX2FuaXNvU2FtcGxlcykge1xuICAgICAgICB2YXIgZXh0ID0gdGhpcy5nbC5nZXRFeHRlbnNpb24oJ0VYVF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYycpXG4gICAgICAgIGlmKGV4dCkge1xuICAgICAgICAgIHRoaXMuZ2wudGV4UGFyYW1ldGVyZih0aGlzLmdsLlRFWFRVUkVfMkQsIGV4dC5URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgdGhpcy5fYW5pc29TYW1wbGVzKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5fYW5pc29TYW1wbGVzXG4gICAgfVxuICB9LFxuICB3cmFwUzoge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5fd3JhcFNcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgdGhpcy5iaW5kKClcbiAgICAgIGlmKHdyYXBUeXBlcy5pbmRleE9mKHYpIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXRleHR1cmUyZDogVW5rbm93biB3cmFwIG1vZGUgJyArIHYpXG4gICAgICB9XG4gICAgICB0aGlzLmdsLnRleFBhcmFtZXRlcmkodGhpcy5nbC5URVhUVVJFXzJELCB0aGlzLmdsLlRFWFRVUkVfV1JBUF9TLCB2KVxuICAgICAgcmV0dXJuIHRoaXMuX3dyYXBTID0gdlxuICAgIH1cbiAgfSxcbiAgd3JhcFQ6IHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMuX3dyYXBUXG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgIHRoaXMuYmluZCgpXG4gICAgICBpZih3cmFwVHlwZXMuaW5kZXhPZih2KSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC10ZXh0dXJlMmQ6IFVua25vd24gd3JhcCBtb2RlICcgKyB2KVxuICAgICAgfVxuICAgICAgdGhpcy5nbC50ZXhQYXJhbWV0ZXJpKHRoaXMuZ2wuVEVYVFVSRV8yRCwgdGhpcy5nbC5URVhUVVJFX1dSQVBfVCwgdilcbiAgICAgIHJldHVybiB0aGlzLl93cmFwVCA9IHZcbiAgICB9XG4gIH0sXG4gIHdyYXA6IHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMuX3dyYXBWZWN0b3JcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgaWYoIUFycmF5LmlzQXJyYXkodikpIHtcbiAgICAgICAgdiA9IFt2LHZdXG4gICAgICB9XG4gICAgICBpZih2Lmxlbmd0aCAhPT0gMikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXRleHR1cmUyZDogTXVzdCBzcGVjaWZ5IHdyYXAgbW9kZSBmb3Igcm93cyBhbmQgY29sdW1ucycpXG4gICAgICB9XG4gICAgICBmb3IodmFyIGk9MDsgaTwyOyArK2kpIHtcbiAgICAgICAgaWYod3JhcFR5cGVzLmluZGV4T2YodltpXSkgPCAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdnbC10ZXh0dXJlMmQ6IFVua25vd24gd3JhcCBtb2RlICcgKyB2KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLl93cmFwUyA9IHZbMF1cbiAgICAgIHRoaXMuX3dyYXBUID0gdlsxXVxuXG4gICAgICB2YXIgZ2wgPSB0aGlzLmdsXG4gICAgICB0aGlzLmJpbmQoKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfUywgdGhpcy5fd3JhcFMpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9ULCB0aGlzLl93cmFwVClcblxuICAgICAgcmV0dXJuIHZcbiAgICB9XG4gIH0sXG4gIHNoYXBlOiB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zaGFwZVZlY3RvclxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih4KSB7XG4gICAgICBpZighQXJyYXkuaXNBcnJheSh4KSkge1xuICAgICAgICB4ID0gW3h8MCx4fDBdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZih4Lmxlbmd0aCAhPT0gMikge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBJbnZhbGlkIHRleHR1cmUgc2hhcGUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXNoYXBlVGV4dHVyZSh0aGlzLCB4WzBdfDAsIHhbMV18MClcbiAgICAgIHJldHVybiBbeFswXXwwLCB4WzFdfDBdXG4gICAgfVxuICB9LFxuICB3aWR0aDoge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5fc2hhcGVbMF1cbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odykge1xuICAgICAgdyA9IHd8MFxuICAgICAgcmVzaGFwZVRleHR1cmUodGhpcywgdywgdGhpcy5fc2hhcGVbMV0pXG4gICAgICByZXR1cm4gd1xuICAgIH1cbiAgfSxcbiAgaGVpZ2h0OiB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zaGFwZVsxXVxuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbihoKSB7XG4gICAgICBoID0gaHwwXG4gICAgICByZXNoYXBlVGV4dHVyZSh0aGlzLCB0aGlzLl9zaGFwZVswXSwgaClcbiAgICAgIHJldHVybiBoXG4gICAgfVxuICB9XG59KVxuXG5wcm90by5iaW5kID0gZnVuY3Rpb24odW5pdCkge1xuICB2YXIgZ2wgPSB0aGlzLmdsXG4gIGlmKHVuaXQgIT09IHVuZGVmaW5lZCkge1xuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyAodW5pdHwwKSlcbiAgfVxuICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0aGlzLmhhbmRsZSlcbiAgaWYodW5pdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuICh1bml0fDApXG4gIH1cbiAgcmV0dXJuIGdsLmdldFBhcmFtZXRlcihnbC5BQ1RJVkVfVEVYVFVSRSkgLSBnbC5URVhUVVJFMFxufVxuXG5wcm90by5kaXNwb3NlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZ2wuZGVsZXRlVGV4dHVyZSh0aGlzLmhhbmRsZSlcbn1cblxucHJvdG8uZ2VuZXJhdGVNaXBtYXAgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5iaW5kKClcbiAgdGhpcy5nbC5nZW5lcmF0ZU1pcG1hcCh0aGlzLmdsLlRFWFRVUkVfMkQpXG5cbiAgLy9VcGRhdGUgbWlwIGxldmVsc1xuICB2YXIgbCA9IE1hdGgubWluKHRoaXMuX3NoYXBlWzBdLCB0aGlzLl9zaGFwZVsxXSlcbiAgZm9yKHZhciBpPTA7IGw+MDsgKytpLCBsPj4+PTEpIHtcbiAgICBpZih0aGlzLl9taXBMZXZlbHMuaW5kZXhPZihpKSA8IDApIHtcbiAgICAgIHRoaXMuX21pcExldmVscy5wdXNoKGkpXG4gICAgfVxuICB9XG59XG5cbnByb3RvLnNldFBpeGVscyA9IGZ1bmN0aW9uKGRhdGEsIHhfb2ZmLCB5X29mZiwgbWlwX2xldmVsKSB7XG4gIHZhciBnbCA9IHRoaXMuZ2xcbiAgdGhpcy5iaW5kKClcbiAgaWYoQXJyYXkuaXNBcnJheSh4X29mZikpIHtcbiAgICBtaXBfbGV2ZWwgPSB5X29mZlxuICAgIHlfb2ZmID0geF9vZmZbMV18MFxuICAgIHhfb2ZmID0geF9vZmZbMF18MFxuICB9IGVsc2Uge1xuICAgIHhfb2ZmID0geF9vZmYgfHwgMFxuICAgIHlfb2ZmID0geV9vZmYgfHwgMFxuICB9XG4gIG1pcF9sZXZlbCA9IG1pcF9sZXZlbCB8fCAwXG4gIHZhciBkaXJlY3REYXRhID0gYWNjZXB0VGV4dHVyZURPTShkYXRhKSA/IGRhdGEgOiBkYXRhLnJhd1xuICBpZihkaXJlY3REYXRhKSB7XG4gICAgdmFyIG5lZWRzTWlwID0gdGhpcy5fbWlwTGV2ZWxzLmluZGV4T2YobWlwX2xldmVsKSA8IDBcbiAgICBpZihuZWVkc01pcCkge1xuICAgICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCB0aGlzLmZvcm1hdCwgdGhpcy5mb3JtYXQsIHRoaXMudHlwZSwgZGlyZWN0RGF0YSlcbiAgICAgIHRoaXMuX21pcExldmVscy5wdXNoKG1pcF9sZXZlbClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChnbC5URVhUVVJFXzJELCBtaXBfbGV2ZWwsIHhfb2ZmLCB5X29mZiwgdGhpcy5mb3JtYXQsIHRoaXMudHlwZSwgZGlyZWN0RGF0YSlcbiAgICB9XG4gIH0gZWxzZSBpZihkYXRhLnNoYXBlICYmIGRhdGEuc3RyaWRlICYmIGRhdGEuZGF0YSkge1xuICAgIGlmKGRhdGEuc2hhcGUubGVuZ3RoIDwgMiB8fFxuICAgICAgIHhfb2ZmICsgZGF0YS5zaGFwZVsxXSA+IHRoaXMuX3NoYXBlWzFdPj4+bWlwX2xldmVsIHx8XG4gICAgICAgeV9vZmYgKyBkYXRhLnNoYXBlWzBdID4gdGhpcy5fc2hhcGVbMF0+Pj5taXBfbGV2ZWwgfHxcbiAgICAgICB4X29mZiA8IDAgfHxcbiAgICAgICB5X29mZiA8IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBUZXh0dXJlIGRpbWVuc2lvbnMgYXJlIG91dCBvZiBib3VuZHMnKVxuICAgIH1cbiAgICB0ZXhTdWJJbWFnZUFycmF5KGdsLCB4X29mZiwgeV9vZmYsIG1pcF9sZXZlbCwgdGhpcy5mb3JtYXQsIHRoaXMudHlwZSwgdGhpcy5fbWlwTGV2ZWxzLCBkYXRhKVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBVbnN1cHBvcnRlZCBkYXRhIHR5cGUnKVxuICB9XG59XG5cblxuZnVuY3Rpb24gaXNQYWNrZWQoc2hhcGUsIHN0cmlkZSkge1xuICBpZihzaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICByZXR1cm4gIChzdHJpZGVbMl0gPT09IDEpICYmXG4gICAgICAgICAgICAoc3RyaWRlWzFdID09PSBzaGFwZVswXSpzaGFwZVsyXSkgJiZcbiAgICAgICAgICAgIChzdHJpZGVbMF0gPT09IHNoYXBlWzJdKVxuICB9XG4gIHJldHVybiAgKHN0cmlkZVswXSA9PT0gMSkgJiZcbiAgICAgICAgICAoc3RyaWRlWzFdID09PSBzaGFwZVswXSlcbn1cblxuZnVuY3Rpb24gdGV4U3ViSW1hZ2VBcnJheShnbCwgeF9vZmYsIHlfb2ZmLCBtaXBfbGV2ZWwsIGNmb3JtYXQsIGN0eXBlLCBtaXBMZXZlbHMsIGFycmF5KSB7XG4gIHZhciBkdHlwZSA9IGFycmF5LmR0eXBlXG4gIHZhciBzaGFwZSA9IGFycmF5LnNoYXBlLnNsaWNlKClcbiAgaWYoc2hhcGUubGVuZ3RoIDwgMiB8fCBzaGFwZS5sZW5ndGggPiAzKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdnbC10ZXh0dXJlMmQ6IEludmFsaWQgbmRhcnJheSwgbXVzdCBiZSAyZCBvciAzZCcpXG4gIH1cbiAgdmFyIHR5cGUgPSAwLCBmb3JtYXQgPSAwXG4gIHZhciBwYWNrZWQgPSBpc1BhY2tlZChzaGFwZSwgYXJyYXkuc3RyaWRlLnNsaWNlKCkpXG4gIGlmKGR0eXBlID09PSAnZmxvYXQzMicpIHtcbiAgICB0eXBlID0gZ2wuRkxPQVRcbiAgfSBlbHNlIGlmKGR0eXBlID09PSAnZmxvYXQ2NCcpIHtcbiAgICB0eXBlID0gZ2wuRkxPQVRcbiAgICBwYWNrZWQgPSBmYWxzZVxuICAgIGR0eXBlID0gJ2Zsb2F0MzInXG4gIH0gZWxzZSBpZihkdHlwZSA9PT0gJ3VpbnQ4Jykge1xuICAgIHR5cGUgPSBnbC5VTlNJR05FRF9CWVRFXG4gIH0gZWxzZSB7XG4gICAgdHlwZSA9IGdsLlVOU0lHTkVEX0JZVEVcbiAgICBwYWNrZWQgPSBmYWxzZVxuICAgIGR0eXBlID0gJ3VpbnQ4J1xuICB9XG4gIHZhciBjaGFubmVscyA9IDFcbiAgaWYoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgZm9ybWF0ID0gZ2wuTFVNSU5BTkNFXG4gICAgc2hhcGUgPSBbc2hhcGVbMF0sIHNoYXBlWzFdLCAxXVxuICAgIGFycmF5ID0gbmRhcnJheShhcnJheS5kYXRhLCBzaGFwZSwgW2FycmF5LnN0cmlkZVswXSwgYXJyYXkuc3RyaWRlWzFdLCAxXSwgYXJyYXkub2Zmc2V0KVxuICB9IGVsc2UgaWYoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgaWYoc2hhcGVbMl0gPT09IDEpIHtcbiAgICAgIGZvcm1hdCA9IGdsLkFMUEhBXG4gICAgfSBlbHNlIGlmKHNoYXBlWzJdID09PSAyKSB7XG4gICAgICBmb3JtYXQgPSBnbC5MVU1JTkFOQ0VfQUxQSEFcbiAgICB9IGVsc2UgaWYoc2hhcGVbMl0gPT09IDMpIHtcbiAgICAgIGZvcm1hdCA9IGdsLlJHQlxuICAgIH0gZWxzZSBpZihzaGFwZVsyXSA9PT0gNCkge1xuICAgICAgZm9ybWF0ID0gZ2wuUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXRleHR1cmUyZDogSW52YWxpZCBzaGFwZSBmb3IgcGl4ZWwgY29vcmRzJylcbiAgICB9XG4gICAgY2hhbm5lbHMgPSBzaGFwZVsyXVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBJbnZhbGlkIHNoYXBlIGZvciB0ZXh0dXJlJylcbiAgfVxuICAvL0ZvciAxLWNoYW5uZWwgdGV4dHVyZXMgYWxsb3cgY29udmVyc2lvbiBiZXR3ZWVuIGZvcm1hdHNcbiAgaWYoKGZvcm1hdCAgPT09IGdsLkxVTUlOQU5DRSB8fCBmb3JtYXQgID09PSBnbC5BTFBIQSkgJiZcbiAgICAgKGNmb3JtYXQgPT09IGdsLkxVTUlOQU5DRSB8fCBjZm9ybWF0ID09PSBnbC5BTFBIQSkpIHtcbiAgICBmb3JtYXQgPSBjZm9ybWF0XG4gIH1cbiAgaWYoZm9ybWF0ICE9PSBjZm9ybWF0KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdnbC10ZXh0dXJlMmQ6IEluY29tcGF0aWJsZSB0ZXh0dXJlIGZvcm1hdCBmb3Igc2V0UGl4ZWxzJylcbiAgfVxuICB2YXIgc2l6ZSA9IGFycmF5LnNpemVcbiAgdmFyIG5lZWRzTWlwID0gbWlwTGV2ZWxzLmluZGV4T2YobWlwX2xldmVsKSA8IDBcbiAgaWYobmVlZHNNaXApIHtcbiAgICBtaXBMZXZlbHMucHVzaChtaXBfbGV2ZWwpXG4gIH1cbiAgaWYodHlwZSA9PT0gY3R5cGUgJiYgcGFja2VkKSB7XG4gICAgLy9BcnJheSBkYXRhIHR5cGVzIGFyZSBjb21wYXRpYmxlLCBjYW4gZGlyZWN0bHkgY29weSBpbnRvIHRleHR1cmVcbiAgICBpZihhcnJheS5vZmZzZXQgPT09IDAgJiYgYXJyYXkuZGF0YS5sZW5ndGggPT09IHNpemUpIHtcbiAgICAgIGlmKG5lZWRzTWlwKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgbWlwX2xldmVsLCBjZm9ybWF0LCBzaGFwZVswXSwgc2hhcGVbMV0sIDAsIGNmb3JtYXQsIGN0eXBlLCBhcnJheS5kYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wudGV4U3ViSW1hZ2UyRChnbC5URVhUVVJFXzJELCBtaXBfbGV2ZWwsIHhfb2ZmLCB5X29mZiwgc2hhcGVbMF0sIHNoYXBlWzFdLCBjZm9ybWF0LCBjdHlwZSwgYXJyYXkuZGF0YSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYobmVlZHNNaXApIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCBtaXBfbGV2ZWwsIGNmb3JtYXQsIHNoYXBlWzBdLCBzaGFwZVsxXSwgMCwgY2Zvcm1hdCwgY3R5cGUsIGFycmF5LmRhdGEuc3ViYXJyYXkoYXJyYXkub2Zmc2V0LCBhcnJheS5vZmZzZXQrc2l6ZSkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC50ZXhTdWJJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIG1pcF9sZXZlbCwgeF9vZmYsIHlfb2ZmLCBzaGFwZVswXSwgc2hhcGVbMV0sIGNmb3JtYXQsIGN0eXBlLCBhcnJheS5kYXRhLnN1YmFycmF5KGFycmF5Lm9mZnNldCwgYXJyYXkub2Zmc2V0K3NpemUpKVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvL05lZWQgdG8gZG8gdHlwZSBjb252ZXJzaW9uIHRvIHBhY2sgZGF0YSBpbnRvIGJ1ZmZlclxuICAgIHZhciBwYWNrX2J1ZmZlclxuICAgIGlmKGN0eXBlID09PSBnbC5GTE9BVCkge1xuICAgICAgcGFja19idWZmZXIgPSBwb29sLm1hbGxvY0Zsb2F0MzIoc2l6ZSlcbiAgICB9IGVsc2Uge1xuICAgICAgcGFja19idWZmZXIgPSBwb29sLm1hbGxvY1VpbnQ4KHNpemUpXG4gICAgfVxuICAgIHZhciBwYWNrX3ZpZXcgPSBuZGFycmF5KHBhY2tfYnVmZmVyLCBzaGFwZSwgW3NoYXBlWzJdLCBzaGFwZVsyXSpzaGFwZVswXSwgMV0pXG4gICAgaWYodHlwZSA9PT0gZ2wuRkxPQVQgJiYgY3R5cGUgPT09IGdsLlVOU0lHTkVEX0JZVEUpIHtcbiAgICAgIGNvbnZlcnRGbG9hdFRvVWludDgocGFja192aWV3LCBhcnJheSlcbiAgICB9IGVsc2Uge1xuICAgICAgb3BzLmFzc2lnbihwYWNrX3ZpZXcsIGFycmF5KVxuICAgIH1cbiAgICBpZihuZWVkc01pcCkge1xuICAgICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCBtaXBfbGV2ZWwsIGNmb3JtYXQsIHNoYXBlWzBdLCBzaGFwZVsxXSwgMCwgY2Zvcm1hdCwgY3R5cGUsIHBhY2tfYnVmZmVyLnN1YmFycmF5KDAsIHNpemUpKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIG1pcF9sZXZlbCwgeF9vZmYsIHlfb2ZmLCBzaGFwZVswXSwgc2hhcGVbMV0sIGNmb3JtYXQsIGN0eXBlLCBwYWNrX2J1ZmZlci5zdWJhcnJheSgwLCBzaXplKSlcbiAgICB9XG4gICAgaWYoY3R5cGUgPT09IGdsLkZMT0FUKSB7XG4gICAgICBwb29sLmZyZWVGbG9hdDMyKHBhY2tfYnVmZmVyKVxuICAgIH0gZWxzZSB7XG4gICAgICBwb29sLmZyZWVVaW50OChwYWNrX2J1ZmZlcilcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gaW5pdFRleHR1cmUoZ2wpIHtcbiAgdmFyIHRleCA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0ZXgpXG4gIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NSU5fRklMVEVSLCBnbC5ORUFSRVNUKVxuICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgZ2wuTkVBUkVTVClcbiAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfUywgZ2wuQ0xBTVBfVE9fRURHRSlcbiAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSlcbiAgcmV0dXJuIHRleFxufVxuXG5mdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2hhcGUoZ2wsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSkge1xuICB2YXIgbWF4VGV4dHVyZVNpemUgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuTUFYX1RFWFRVUkVfU0laRSlcbiAgaWYod2lkdGggPCAwIHx8IHdpZHRoID4gbWF4VGV4dHVyZVNpemUgfHwgaGVpZ2h0IDwgMCB8fCBoZWlnaHQgID4gbWF4VGV4dHVyZVNpemUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXRleHR1cmUyZDogSW52YWxpZCB0ZXh0dXJlIHNoYXBlJylcbiAgfVxuICBpZih0eXBlID09PSBnbC5GTE9BVCAmJiAhZ2wuZ2V0RXh0ZW5zaW9uKCdPRVNfdGV4dHVyZV9mbG9hdCcpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdnbC10ZXh0dXJlMmQ6IEZsb2F0aW5nIHBvaW50IHRleHR1cmVzIG5vdCBzdXBwb3J0ZWQgb24gdGhpcyBwbGF0Zm9ybScpXG4gIH1cbiAgdmFyIHRleCA9IGluaXRUZXh0dXJlKGdsKVxuICBnbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBudWxsKVxuICByZXR1cm4gbmV3IFRleHR1cmUyRChnbCwgdGV4LCB3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVET00oZ2wsIGRpcmVjdERhdGEsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSkge1xuICB2YXIgdGV4ID0gaW5pdFRleHR1cmUoZ2wpXG4gIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgMCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGRpcmVjdERhdGEpXG4gIHJldHVybiBuZXcgVGV4dHVyZTJEKGdsLCB0ZXgsIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSlcbn1cblxuLy9DcmVhdGVzIGEgdGV4dHVyZSBmcm9tIGFuIG5kYXJyYXlcbmZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVBcnJheShnbCwgYXJyYXkpIHtcbiAgdmFyIGR0eXBlID0gYXJyYXkuZHR5cGVcbiAgdmFyIHNoYXBlID0gYXJyYXkuc2hhcGUuc2xpY2UoKVxuICB2YXIgbWF4U2l6ZSA9IGdsLmdldFBhcmFtZXRlcihnbC5NQVhfVEVYVFVSRV9TSVpFKVxuICBpZihzaGFwZVswXSA8IDAgfHwgc2hhcGVbMF0gPiBtYXhTaXplIHx8IHNoYXBlWzFdIDwgMCB8fCBzaGFwZVsxXSA+IG1heFNpemUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXRleHR1cmUyZDogSW52YWxpZCB0ZXh0dXJlIHNpemUnKVxuICB9XG4gIHZhciBwYWNrZWQgPSBpc1BhY2tlZChzaGFwZSwgYXJyYXkuc3RyaWRlLnNsaWNlKCkpXG4gIHZhciB0eXBlID0gMFxuICBpZihkdHlwZSA9PT0gJ2Zsb2F0MzInKSB7XG4gICAgdHlwZSA9IGdsLkZMT0FUXG4gIH0gZWxzZSBpZihkdHlwZSA9PT0gJ2Zsb2F0NjQnKSB7XG4gICAgdHlwZSA9IGdsLkZMT0FUXG4gICAgcGFja2VkID0gZmFsc2VcbiAgICBkdHlwZSA9ICdmbG9hdDMyJ1xuICB9IGVsc2UgaWYoZHR5cGUgPT09ICd1aW50OCcpIHtcbiAgICB0eXBlID0gZ2wuVU5TSUdORURfQllURVxuICB9IGVsc2Uge1xuICAgIHR5cGUgPSBnbC5VTlNJR05FRF9CWVRFXG4gICAgcGFja2VkID0gZmFsc2VcbiAgICBkdHlwZSA9ICd1aW50OCdcbiAgfVxuICB2YXIgZm9ybWF0ID0gMFxuICBpZihzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICBmb3JtYXQgPSBnbC5MVU1JTkFOQ0VcbiAgICBzaGFwZSA9IFtzaGFwZVswXSwgc2hhcGVbMV0sIDFdXG4gICAgYXJyYXkgPSBuZGFycmF5KGFycmF5LmRhdGEsIHNoYXBlLCBbYXJyYXkuc3RyaWRlWzBdLCBhcnJheS5zdHJpZGVbMV0sIDFdLCBhcnJheS5vZmZzZXQpXG4gIH0gZWxzZSBpZihzaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICBpZihzaGFwZVsyXSA9PT0gMSkge1xuICAgICAgZm9ybWF0ID0gZ2wuQUxQSEFcbiAgICB9IGVsc2UgaWYoc2hhcGVbMl0gPT09IDIpIHtcbiAgICAgIGZvcm1hdCA9IGdsLkxVTUlOQU5DRV9BTFBIQVxuICAgIH0gZWxzZSBpZihzaGFwZVsyXSA9PT0gMykge1xuICAgICAgZm9ybWF0ID0gZ2wuUkdCXG4gICAgfSBlbHNlIGlmKHNoYXBlWzJdID09PSA0KSB7XG4gICAgICBmb3JtYXQgPSBnbC5SR0JBXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBJbnZhbGlkIHNoYXBlIGZvciBwaXhlbCBjb29yZHMnKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2dsLXRleHR1cmUyZDogSW52YWxpZCBzaGFwZSBmb3IgdGV4dHVyZScpXG4gIH1cbiAgaWYodHlwZSA9PT0gZ2wuRkxPQVQgJiYgIWdsLmdldEV4dGVuc2lvbignT0VTX3RleHR1cmVfZmxvYXQnKSkge1xuICAgIHR5cGUgPSBnbC5VTlNJR05FRF9CWVRFXG4gICAgcGFja2VkID0gZmFsc2VcbiAgfVxuICB2YXIgYnVmZmVyLCBidWZfc3RvcmVcbiAgdmFyIHNpemUgPSBhcnJheS5zaXplXG4gIGlmKCFwYWNrZWQpIHtcbiAgICB2YXIgc3RyaWRlID0gW3NoYXBlWzJdLCBzaGFwZVsyXSpzaGFwZVswXSwgMV1cbiAgICBidWZfc3RvcmUgPSBwb29sLm1hbGxvYyhzaXplLCBkdHlwZSlcbiAgICB2YXIgYnVmX2FycmF5ID0gbmRhcnJheShidWZfc3RvcmUsIHNoYXBlLCBzdHJpZGUsIDApXG4gICAgaWYoKGR0eXBlID09PSAnZmxvYXQzMicgfHwgZHR5cGUgPT09ICdmbG9hdDY0JykgJiYgdHlwZSA9PT0gZ2wuVU5TSUdORURfQllURSkge1xuICAgICAgY29udmVydEZsb2F0VG9VaW50OChidWZfYXJyYXksIGFycmF5KVxuICAgIH0gZWxzZSB7XG4gICAgICBvcHMuYXNzaWduKGJ1Zl9hcnJheSwgYXJyYXkpXG4gICAgfVxuICAgIGJ1ZmZlciA9IGJ1Zl9zdG9yZS5zdWJhcnJheSgwLCBzaXplKVxuICB9IGVsc2UgaWYgKGFycmF5Lm9mZnNldCA9PT0gMCAmJiBhcnJheS5kYXRhLmxlbmd0aCA9PT0gc2l6ZSkge1xuICAgIGJ1ZmZlciA9IGFycmF5LmRhdGFcbiAgfSBlbHNlIHtcbiAgICBidWZmZXIgPSBhcnJheS5kYXRhLnN1YmFycmF5KGFycmF5Lm9mZnNldCwgYXJyYXkub2Zmc2V0ICsgc2l6ZSlcbiAgfVxuICB2YXIgdGV4ID0gaW5pdFRleHR1cmUoZ2wpXG4gIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgMCwgZm9ybWF0LCBzaGFwZVswXSwgc2hhcGVbMV0sIDAsIGZvcm1hdCwgdHlwZSwgYnVmZmVyKVxuICBpZighcGFja2VkKSB7XG4gICAgcG9vbC5mcmVlKGJ1Zl9zdG9yZSlcbiAgfVxuICByZXR1cm4gbmV3IFRleHR1cmUyRChnbCwgdGV4LCBzaGFwZVswXSwgc2hhcGVbMV0sIGZvcm1hdCwgdHlwZSlcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGV4dHVyZTJEKGdsKSB7XG4gIGlmKGFyZ3VtZW50cy5sZW5ndGggPD0gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcignZ2wtdGV4dHVyZTJkOiBNaXNzaW5nIGFyZ3VtZW50cyBmb3IgdGV4dHVyZTJkIGNvbnN0cnVjdG9yJylcbiAgfVxuICBpZighbGluZWFyVHlwZXMpIHtcbiAgICBsYXp5SW5pdExpbmVhclR5cGVzKGdsKVxuICB9XG4gIGlmKHR5cGVvZiBhcmd1bWVudHNbMV0gPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIGNyZWF0ZVRleHR1cmVTaGFwZShnbCwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0sIGFyZ3VtZW50c1szXXx8Z2wuUkdCQSwgYXJndW1lbnRzWzRdfHxnbC5VTlNJR05FRF9CWVRFKVxuICB9XG4gIGlmKEFycmF5LmlzQXJyYXkoYXJndW1lbnRzWzFdKSkge1xuICAgIHJldHVybiBjcmVhdGVUZXh0dXJlU2hhcGUoZ2wsIGFyZ3VtZW50c1sxXVswXXwwLCBhcmd1bWVudHNbMV1bMV18MCwgYXJndW1lbnRzWzJdfHxnbC5SR0JBLCBhcmd1bWVudHNbM118fGdsLlVOU0lHTkVEX0JZVEUpXG4gIH1cbiAgaWYodHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gJ29iamVjdCcpIHtcbiAgICB2YXIgb2JqID0gYXJndW1lbnRzWzFdXG4gICAgdmFyIGRpcmVjdERhdGEgPSBhY2NlcHRUZXh0dXJlRE9NKG9iaikgPyBvYmogOiBvYmoucmF3XG4gICAgaWYgKGRpcmVjdERhdGEpIHtcbiAgICAgIHJldHVybiBjcmVhdGVUZXh0dXJlRE9NKGdsLCBkaXJlY3REYXRhLCBvYmoud2lkdGh8MCwgb2JqLmhlaWdodHwwLCBhcmd1bWVudHNbMl18fGdsLlJHQkEsIGFyZ3VtZW50c1szXXx8Z2wuVU5TSUdORURfQllURSlcbiAgICB9IGVsc2UgaWYob2JqLnNoYXBlICYmIG9iai5kYXRhICYmIG9iai5zdHJpZGUpIHtcbiAgICAgIHJldHVybiBjcmVhdGVUZXh0dXJlQXJyYXkoZ2wsIG9iailcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCdnbC10ZXh0dXJlMmQ6IEludmFsaWQgYXJndW1lbnRzIGZvciB0ZXh0dXJlMmQgY29uc3RydWN0b3InKVxufVxuIiwiXCJ1c2Ugc3RyaWN0XCJcblxuZnVuY3Rpb24gZG9CaW5kKGdsLCBlbGVtZW50cywgYXR0cmlidXRlcykge1xuICBpZihlbGVtZW50cykge1xuICAgIGVsZW1lbnRzLmJpbmQoKVxuICB9IGVsc2Uge1xuICAgIGdsLmJpbmRCdWZmZXIoZ2wuRUxFTUVOVF9BUlJBWV9CVUZGRVIsIG51bGwpXG4gIH1cbiAgdmFyIG5hdHRyaWJzID0gZ2wuZ2V0UGFyYW1ldGVyKGdsLk1BWF9WRVJURVhfQVRUUklCUyl8MFxuICBpZihhdHRyaWJ1dGVzKSB7XG4gICAgaWYoYXR0cmlidXRlcy5sZW5ndGggPiBuYXR0cmlicykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZ2wtdmFvOiBUb28gbWFueSB2ZXJ0ZXggYXR0cmlidXRlc1wiKVxuICAgIH1cbiAgICBmb3IodmFyIGk9MDsgaTxhdHRyaWJ1dGVzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgYXR0cmliID0gYXR0cmlidXRlc1tpXVxuICAgICAgaWYoYXR0cmliLmJ1ZmZlcikge1xuICAgICAgICB2YXIgYnVmZmVyID0gYXR0cmliLmJ1ZmZlclxuICAgICAgICB2YXIgc2l6ZSA9IGF0dHJpYi5zaXplIHx8IDRcbiAgICAgICAgdmFyIHR5cGUgPSBhdHRyaWIudHlwZSB8fCBnbC5GTE9BVFxuICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhYXR0cmliLm5vcm1hbGl6ZWRcbiAgICAgICAgdmFyIHN0cmlkZSA9IGF0dHJpYi5zdHJpZGUgfHwgMFxuICAgICAgICB2YXIgb2Zmc2V0ID0gYXR0cmliLm9mZnNldCB8fCAwXG4gICAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoaSlcbiAgICAgICAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihpLCBzaXplLCB0eXBlLCBub3JtYWxpemVkLCBzdHJpZGUsIG9mZnNldClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmKHR5cGVvZiBhdHRyaWIgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICBnbC52ZXJ0ZXhBdHRyaWIxZihpLCBhdHRyaWIpXG4gICAgICAgIH0gZWxzZSBpZihhdHRyaWIubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgZ2wudmVydGV4QXR0cmliMWYoaSwgYXR0cmliWzBdKVxuICAgICAgICB9IGVsc2UgaWYoYXR0cmliLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgIGdsLnZlcnRleEF0dHJpYjJmKGksIGF0dHJpYlswXSwgYXR0cmliWzFdKVxuICAgICAgICB9IGVsc2UgaWYoYXR0cmliLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIGdsLnZlcnRleEF0dHJpYjNmKGksIGF0dHJpYlswXSwgYXR0cmliWzFdLCBhdHRyaWJbMl0pXG4gICAgICAgIH0gZWxzZSBpZihhdHRyaWIubGVuZ3RoID09PSA0KSB7XG4gICAgICAgICAgZ2wudmVydGV4QXR0cmliNGYoaSwgYXR0cmliWzBdLCBhdHRyaWJbMV0sIGF0dHJpYlsyXSwgYXR0cmliWzNdKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImdsLXZhbzogSW52YWxpZCB2ZXJ0ZXggYXR0cmlidXRlXCIpXG4gICAgICAgIH1cbiAgICAgICAgZ2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGkpXG4gICAgICB9XG4gICAgfVxuICAgIGZvcig7IGk8bmF0dHJpYnM7ICsraSkge1xuICAgICAgZ2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGkpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBudWxsKVxuICAgIGZvcih2YXIgaT0wOyBpPG5hdHRyaWJzOyArK2kpIHtcbiAgICAgIGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShpKVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRvQmluZCIsIlwidXNlIHN0cmljdFwiXG5cbnZhciBiaW5kQXR0cmlicyA9IHJlcXVpcmUoXCIuL2RvLWJpbmQuanNcIilcblxuZnVuY3Rpb24gVkFPRW11bGF0ZWQoZ2wpIHtcbiAgdGhpcy5nbCA9IGdsXG4gIHRoaXMuX2VsZW1lbnRzID0gbnVsbFxuICB0aGlzLl9hdHRyaWJ1dGVzID0gbnVsbFxuICB0aGlzLl9lbGVtZW50c1R5cGUgPSBnbC5VTlNJR05FRF9TSE9SVFxufVxuXG5WQU9FbXVsYXRlZC5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uKCkge1xuICBiaW5kQXR0cmlicyh0aGlzLmdsLCB0aGlzLl9lbGVtZW50cywgdGhpcy5fYXR0cmlidXRlcylcbn1cblxuVkFPRW11bGF0ZWQucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKGF0dHJpYnV0ZXMsIGVsZW1lbnRzLCBlbGVtZW50c1R5cGUpIHtcbiAgdGhpcy5fZWxlbWVudHMgPSBlbGVtZW50c1xuICB0aGlzLl9hdHRyaWJ1dGVzID0gYXR0cmlidXRlc1xuICB0aGlzLl9lbGVtZW50c1R5cGUgPSBlbGVtZW50c1R5cGUgfHwgdGhpcy5nbC5VTlNJR05FRF9TSE9SVFxufVxuXG5WQU9FbXVsYXRlZC5wcm90b3R5cGUuZGlzcG9zZSA9IGZ1bmN0aW9uKCkgeyB9XG5WQU9FbXVsYXRlZC5wcm90b3R5cGUudW5iaW5kID0gZnVuY3Rpb24oKSB7IH1cblxuVkFPRW11bGF0ZWQucHJvdG90eXBlLmRyYXcgPSBmdW5jdGlvbihtb2RlLCBjb3VudCwgb2Zmc2V0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8fCAwXG4gIHZhciBnbCA9IHRoaXMuZ2xcbiAgaWYodGhpcy5fZWxlbWVudHMpIHtcbiAgICBnbC5kcmF3RWxlbWVudHMobW9kZSwgY291bnQsIHRoaXMuX2VsZW1lbnRzVHlwZSwgb2Zmc2V0KVxuICB9IGVsc2Uge1xuICAgIGdsLmRyYXdBcnJheXMobW9kZSwgb2Zmc2V0LCBjb3VudClcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVWQU9FbXVsYXRlZChnbCkge1xuICByZXR1cm4gbmV3IFZBT0VtdWxhdGVkKGdsKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVZBT0VtdWxhdGVkIiwiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIGJpbmRBdHRyaWJzID0gcmVxdWlyZShcIi4vZG8tYmluZC5qc1wiKVxuXG5mdW5jdGlvbiBWZXJ0ZXhBdHRyaWJ1dGUobG9jYXRpb24sIGRpbWVuc2lvbiwgYSwgYiwgYywgZCkge1xuICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgdGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgdGhpcy5hID0gYVxuICB0aGlzLmIgPSBiXG4gIHRoaXMuYyA9IGNcbiAgdGhpcy5kID0gZFxufVxuXG5WZXJ0ZXhBdHRyaWJ1dGUucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbihnbCkge1xuICBzd2l0Y2godGhpcy5kaW1lbnNpb24pIHtcbiAgICBjYXNlIDE6XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWIxZih0aGlzLmxvY2F0aW9uLCB0aGlzLmEpXG4gICAgYnJlYWtcbiAgICBjYXNlIDI6XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWIyZih0aGlzLmxvY2F0aW9uLCB0aGlzLmEsIHRoaXMuYilcbiAgICBicmVha1xuICAgIGNhc2UgMzpcbiAgICAgIGdsLnZlcnRleEF0dHJpYjNmKHRoaXMubG9jYXRpb24sIHRoaXMuYSwgdGhpcy5iLCB0aGlzLmMpXG4gICAgYnJlYWtcbiAgICBjYXNlIDQ6XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWI0Zih0aGlzLmxvY2F0aW9uLCB0aGlzLmEsIHRoaXMuYiwgdGhpcy5jLCB0aGlzLmQpXG4gICAgYnJlYWtcbiAgfVxufVxuXG5mdW5jdGlvbiBWQU9OYXRpdmUoZ2wsIGV4dCwgaGFuZGxlKSB7XG4gIHRoaXMuZ2wgPSBnbFxuICB0aGlzLl9leHQgPSBleHRcbiAgdGhpcy5oYW5kbGUgPSBoYW5kbGVcbiAgdGhpcy5fYXR0cmlicyA9IFtdXG4gIHRoaXMuX3VzZUVsZW1lbnRzID0gZmFsc2VcbiAgdGhpcy5fZWxlbWVudHNUeXBlID0gZ2wuVU5TSUdORURfU0hPUlRcbn1cblxuVkFPTmF0aXZlLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuX2V4dC5iaW5kVmVydGV4QXJyYXlPRVModGhpcy5oYW5kbGUpXG4gIGZvcih2YXIgaT0wOyBpPHRoaXMuX2F0dHJpYnMubGVuZ3RoOyArK2kpIHtcbiAgICB0aGlzLl9hdHRyaWJzW2ldLmJpbmQodGhpcy5nbClcbiAgfVxufVxuXG5WQU9OYXRpdmUucHJvdG90eXBlLnVuYmluZCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLl9leHQuYmluZFZlcnRleEFycmF5T0VTKG51bGwpXG59XG5cblZBT05hdGl2ZS5wcm90b3R5cGUuZGlzcG9zZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLl9leHQuZGVsZXRlVmVydGV4QXJyYXlPRVModGhpcy5oYW5kbGUpXG59XG5cblZBT05hdGl2ZS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24oYXR0cmlidXRlcywgZWxlbWVudHMsIGVsZW1lbnRzVHlwZSkge1xuICB0aGlzLmJpbmQoKVxuICBiaW5kQXR0cmlicyh0aGlzLmdsLCBlbGVtZW50cywgYXR0cmlidXRlcylcbiAgdGhpcy51bmJpbmQoKVxuICB0aGlzLl9hdHRyaWJzLmxlbmd0aCA9IDBcbiAgaWYoYXR0cmlidXRlcylcbiAgZm9yKHZhciBpPTA7IGk8YXR0cmlidXRlcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBhID0gYXR0cmlidXRlc1tpXVxuICAgIGlmKHR5cGVvZiBhID09PSBcIm51bWJlclwiKSB7XG4gICAgICB0aGlzLl9hdHRyaWJzLnB1c2gobmV3IFZlcnRleEF0dHJpYnV0ZShpLCAxLCBhKSlcbiAgICB9IGVsc2UgaWYoQXJyYXkuaXNBcnJheShhKSkge1xuICAgICAgdGhpcy5fYXR0cmlicy5wdXNoKG5ldyBWZXJ0ZXhBdHRyaWJ1dGUoaSwgYS5sZW5ndGgsIGFbMF0sIGFbMV0sIGFbMl0sIGFbM10pKVxuICAgIH1cbiAgfVxuICB0aGlzLl91c2VFbGVtZW50cyA9ICEhZWxlbWVudHNcbiAgdGhpcy5fZWxlbWVudHNUeXBlID0gZWxlbWVudHNUeXBlIHx8IHRoaXMuZ2wuVU5TSUdORURfU0hPUlRcbn1cblxuVkFPTmF0aXZlLnByb3RvdHlwZS5kcmF3ID0gZnVuY3Rpb24obW9kZSwgY291bnQsIG9mZnNldCkge1xuICBvZmZzZXQgPSBvZmZzZXQgfHwgMFxuICB2YXIgZ2wgPSB0aGlzLmdsXG4gIGlmKHRoaXMuX3VzZUVsZW1lbnRzKSB7XG4gICAgZ2wuZHJhd0VsZW1lbnRzKG1vZGUsIGNvdW50LCB0aGlzLl9lbGVtZW50c1R5cGUsIG9mZnNldClcbiAgfSBlbHNlIHtcbiAgICBnbC5kcmF3QXJyYXlzKG1vZGUsIG9mZnNldCwgY291bnQpXG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlVkFPTmF0aXZlKGdsLCBleHQpIHtcbiAgcmV0dXJuIG5ldyBWQU9OYXRpdmUoZ2wsIGV4dCwgZXh0LmNyZWF0ZVZlcnRleEFycmF5T0VTKCkpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlVkFPTmF0aXZlIiwiXCJ1c2Ugc3RyaWN0XCJcblxudmFyIGNyZWF0ZVZBT05hdGl2ZSA9IHJlcXVpcmUoXCIuL2xpYi92YW8tbmF0aXZlLmpzXCIpXG52YXIgY3JlYXRlVkFPRW11bGF0ZWQgPSByZXF1aXJlKFwiLi9saWIvdmFvLWVtdWxhdGVkLmpzXCIpXG5cbmZ1bmN0aW9uIEV4dGVuc2lvblNoaW0gKGdsKSB7XG4gIHRoaXMuYmluZFZlcnRleEFycmF5T0VTID0gZ2wuYmluZFZlcnRleEFycmF5LmJpbmQoZ2wpXG4gIHRoaXMuY3JlYXRlVmVydGV4QXJyYXlPRVMgPSBnbC5jcmVhdGVWZXJ0ZXhBcnJheS5iaW5kKGdsKVxuICB0aGlzLmRlbGV0ZVZlcnRleEFycmF5T0VTID0gZ2wuZGVsZXRlVmVydGV4QXJyYXkuYmluZChnbClcbn1cblxuZnVuY3Rpb24gY3JlYXRlVkFPKGdsLCBhdHRyaWJ1dGVzLCBlbGVtZW50cywgZWxlbWVudHNUeXBlKSB7XG4gIHZhciBleHQgPSBnbC5jcmVhdGVWZXJ0ZXhBcnJheVxuICAgID8gbmV3IEV4dGVuc2lvblNoaW0oZ2wpXG4gICAgOiBnbC5nZXRFeHRlbnNpb24oJ09FU192ZXJ0ZXhfYXJyYXlfb2JqZWN0JylcbiAgdmFyIHZhb1xuXG4gIGlmKGV4dCkge1xuICAgIHZhbyA9IGNyZWF0ZVZBT05hdGl2ZShnbCwgZXh0KVxuICB9IGVsc2Uge1xuICAgIHZhbyA9IGNyZWF0ZVZBT0VtdWxhdGVkKGdsKVxuICB9XG4gIHZhby51cGRhdGUoYXR0cmlidXRlcywgZWxlbWVudHMsIGVsZW1lbnRzVHlwZSlcbiAgcmV0dXJuIHZhb1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVZBT1xuIiwibW9kdWxlLmV4cG9ydHMgPSBwcm9ncmFtaWZ5XG5cbnZhciBzaGFkZXIgPSByZXF1aXJlKCdnbC1zaGFkZXItY29yZScpXG5cbmZ1bmN0aW9uIHByb2dyYW1pZnkodmVydGV4LCBmcmFnbWVudCwgdW5pZm9ybXMsIGF0dHJpYnV0ZXMpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGdsKSB7XG4gICAgcmV0dXJuIHNoYWRlcihnbCwgdmVydGV4LCBmcmFnbWVudCwgdW5pZm9ybXMsIGF0dHJpYnV0ZXMpXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gbm9vcFxuXG5mdW5jdGlvbiBub29wKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAnWW91IHNob3VsZCBidW5kbGUgeW91ciBjb2RlICcgK1xuICAgICAgJ3VzaW5nIGBnbHNsaWZ5YCBhcyBhIHRyYW5zZm9ybS4nXG4gIClcbn1cbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uIChidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtXG4gIHZhciBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxXG4gIHZhciBlTWF4ID0gKDEgPDwgZUxlbikgLSAxXG4gIHZhciBlQmlhcyA9IGVNYXggPj4gMVxuICB2YXIgbkJpdHMgPSAtN1xuICB2YXIgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwXG4gIHZhciBkID0gaXNMRSA/IC0xIDogMVxuICB2YXIgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXVxuXG4gIGkgKz0gZFxuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpXG4gIHMgPj49ICgtbkJpdHMpXG4gIG5CaXRzICs9IGVMZW5cbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCkge31cblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKVxuICBlID4+PSAoLW5CaXRzKVxuICBuQml0cyArPSBtTGVuXG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpIHt9XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzXG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KVxuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbilcbiAgICBlID0gZSAtIGVCaWFzXG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbilcbn1cblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uIChidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgY1xuICB2YXIgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMVxuICB2YXIgZU1heCA9ICgxIDw8IGVMZW4pIC0gMVxuICB2YXIgZUJpYXMgPSBlTWF4ID4+IDFcbiAgdmFyIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKVxuICB2YXIgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpXG4gIHZhciBkID0gaXNMRSA/IDEgOiAtMVxuICB2YXIgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMFxuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpXG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDBcbiAgICBlID0gZU1heFxuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKVxuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLVxuICAgICAgYyAqPSAyXG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKVxuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrK1xuICAgICAgYyAvPSAyXG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMFxuICAgICAgZSA9IGVNYXhcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbilcbiAgICAgIGUgPSBlICsgZUJpYXNcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pXG4gICAgICBlID0gMFxuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpIHt9XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbVxuICBlTGVuICs9IG1MZW5cbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KSB7fVxuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyOFxufVxuIiwiXCJ1c2Ugc3RyaWN0XCJcblxuZnVuY3Rpb24gaW52ZXJ0KGhhc2gpIHtcbiAgdmFyIHJlc3VsdCA9IHt9XG4gIGZvcih2YXIgaSBpbiBoYXNoKSB7XG4gICAgaWYoaGFzaC5oYXNPd25Qcm9wZXJ0eShpKSkge1xuICAgICAgcmVzdWx0W2hhc2hbaV1dID0gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaW52ZXJ0IiwiXCJ1c2Ugc3RyaWN0XCJcblxuZnVuY3Rpb24gaW90YShuKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobilcbiAgZm9yKHZhciBpPTA7IGk8bjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gaVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpb3RhIiwiXG4vKipcbiAqIGlzQXJyYXlcbiAqL1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5cbi8qKlxuICogdG9TdHJpbmdcbiAqL1xuXG52YXIgc3RyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxuLyoqXG4gKiBXaGV0aGVyIG9yIG5vdCB0aGUgZ2l2ZW4gYHZhbGBcbiAqIGlzIGFuIGFycmF5LlxuICpcbiAqIGV4YW1wbGU6XG4gKlxuICogICAgICAgIGlzQXJyYXkoW10pO1xuICogICAgICAgIC8vID4gdHJ1ZVxuICogICAgICAgIGlzQXJyYXkoYXJndW1lbnRzKTtcbiAqICAgICAgICAvLyA+IGZhbHNlXG4gKiAgICAgICAgaXNBcnJheSgnJyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICpcbiAqIEBwYXJhbSB7bWl4ZWR9IHZhbFxuICogQHJldHVybiB7Ym9vbH1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJyYXkgfHwgZnVuY3Rpb24gKHZhbCkge1xuICByZXR1cm4gISEgdmFsICYmICdbb2JqZWN0IEFycmF5XScgPT0gc3RyLmNhbGwodmFsKTtcbn07XG4iLCIvKiFcbiAqIERldGVybWluZSBpZiBhbiBvYmplY3QgaXMgYSBCdWZmZXJcbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuXG4vLyBUaGUgX2lzQnVmZmVyIGNoZWNrIGlzIGZvciBTYWZhcmkgNS03IHN1cHBvcnQsIGJlY2F1c2UgaXQncyBtaXNzaW5nXG4vLyBPYmplY3QucHJvdG90eXBlLmNvbnN0cnVjdG9yLiBSZW1vdmUgdGhpcyBldmVudHVhbGx5XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIG9iaiAhPSBudWxsICYmIChpc0J1ZmZlcihvYmopIHx8IGlzU2xvd0J1ZmZlcihvYmopIHx8ICEhb2JqLl9pc0J1ZmZlcilcbn1cblxuZnVuY3Rpb24gaXNCdWZmZXIgKG9iaikge1xuICByZXR1cm4gISFvYmouY29uc3RydWN0b3IgJiYgdHlwZW9mIG9iai5jb25zdHJ1Y3Rvci5pc0J1ZmZlciA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmouY29uc3RydWN0b3IuaXNCdWZmZXIob2JqKVxufVxuXG4vLyBGb3IgTm9kZSB2MC4xMCBzdXBwb3J0LiBSZW1vdmUgdGhpcyBldmVudHVhbGx5LlxuZnVuY3Rpb24gaXNTbG93QnVmZmVyIChvYmopIHtcbiAgcmV0dXJuIHR5cGVvZiBvYmoucmVhZEZsb2F0TEUgPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIG9iai5zbGljZSA9PT0gJ2Z1bmN0aW9uJyAmJiBpc0J1ZmZlcihvYmouc2xpY2UoMCwgMCkpXG59XG4iLCJcInVzZSBzdHJpY3RcIlxuXG52YXIgY29tcGlsZSA9IHJlcXVpcmUoXCJjd2lzZS1jb21waWxlclwiKVxuXG52YXIgRW1wdHlQcm9jID0ge1xuICBib2R5OiBcIlwiLFxuICBhcmdzOiBbXSxcbiAgdGhpc1ZhcnM6IFtdLFxuICBsb2NhbFZhcnM6IFtdXG59XG5cbmZ1bmN0aW9uIGZpeHVwKHgpIHtcbiAgaWYoIXgpIHtcbiAgICByZXR1cm4gRW1wdHlQcm9jXG4gIH1cbiAgZm9yKHZhciBpPTA7IGk8eC5hcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGEgPSB4LmFyZ3NbaV1cbiAgICBpZihpID09PSAwKSB7XG4gICAgICB4LmFyZ3NbaV0gPSB7bmFtZTogYSwgbHZhbHVlOnRydWUsIHJ2YWx1ZTogISF4LnJ2YWx1ZSwgY291bnQ6eC5jb3VudHx8MSB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHguYXJnc1tpXSA9IHtuYW1lOiBhLCBsdmFsdWU6ZmFsc2UsIHJ2YWx1ZTp0cnVlLCBjb3VudDogMX1cbiAgICB9XG4gIH1cbiAgaWYoIXgudGhpc1ZhcnMpIHtcbiAgICB4LnRoaXNWYXJzID0gW11cbiAgfVxuICBpZigheC5sb2NhbFZhcnMpIHtcbiAgICB4LmxvY2FsVmFycyA9IFtdXG4gIH1cbiAgcmV0dXJuIHhcbn1cblxuZnVuY3Rpb24gcGNvbXBpbGUodXNlcl9hcmdzKSB7XG4gIHJldHVybiBjb21waWxlKHtcbiAgICBhcmdzOiAgICAgdXNlcl9hcmdzLmFyZ3MsXG4gICAgcHJlOiAgICAgIGZpeHVwKHVzZXJfYXJncy5wcmUpLFxuICAgIGJvZHk6ICAgICBmaXh1cCh1c2VyX2FyZ3MuYm9keSksXG4gICAgcG9zdDogICAgIGZpeHVwKHVzZXJfYXJncy5wcm9jKSxcbiAgICBmdW5jTmFtZTogdXNlcl9hcmdzLmZ1bmNOYW1lXG4gIH0pXG59XG5cbmZ1bmN0aW9uIG1ha2VPcCh1c2VyX2FyZ3MpIHtcbiAgdmFyIGFyZ3MgPSBbXVxuICBmb3IodmFyIGk9MDsgaTx1c2VyX2FyZ3MuYXJncy5sZW5ndGg7ICsraSkge1xuICAgIGFyZ3MucHVzaChcImFcIitpKVxuICB9XG4gIHZhciB3cmFwcGVyID0gbmV3IEZ1bmN0aW9uKFwiUFwiLCBbXG4gICAgXCJyZXR1cm4gZnVuY3Rpb24gXCIsIHVzZXJfYXJncy5mdW5jTmFtZSwgXCJfbmRhcnJheW9wcyhcIiwgYXJncy5qb2luKFwiLFwiKSwgXCIpIHtQKFwiLCBhcmdzLmpvaW4oXCIsXCIpLCBcIik7cmV0dXJuIGEwfVwiXG4gIF0uam9pbihcIlwiKSlcbiAgcmV0dXJuIHdyYXBwZXIocGNvbXBpbGUodXNlcl9hcmdzKSlcbn1cblxudmFyIGFzc2lnbl9vcHMgPSB7XG4gIGFkZDogIFwiK1wiLFxuICBzdWI6ICBcIi1cIixcbiAgbXVsOiAgXCIqXCIsXG4gIGRpdjogIFwiL1wiLFxuICBtb2Q6ICBcIiVcIixcbiAgYmFuZDogXCImXCIsXG4gIGJvcjogIFwifFwiLFxuICBieG9yOiBcIl5cIixcbiAgbHNoaWZ0OiBcIjw8XCIsXG4gIHJzaGlmdDogXCI+PlwiLFxuICBycnNoaWZ0OiBcIj4+PlwiXG59XG47KGZ1bmN0aW9uKCl7XG4gIGZvcih2YXIgaWQgaW4gYXNzaWduX29wcykge1xuICAgIHZhciBvcCA9IGFzc2lnbl9vcHNbaWRdXG4gICAgZXhwb3J0c1tpZF0gPSBtYWtlT3Aoe1xuICAgICAgYXJnczogW1wiYXJyYXlcIixcImFycmF5XCIsXCJhcnJheVwiXSxcbiAgICAgIGJvZHk6IHthcmdzOltcImFcIixcImJcIixcImNcIl0sXG4gICAgICAgICAgICAgYm9keTogXCJhPWJcIitvcCtcImNcIn0sXG4gICAgICBmdW5jTmFtZTogaWRcbiAgICB9KVxuICAgIGV4cG9ydHNbaWQrXCJlcVwiXSA9IG1ha2VPcCh7XG4gICAgICBhcmdzOiBbXCJhcnJheVwiLFwiYXJyYXlcIl0sXG4gICAgICBib2R5OiB7YXJnczpbXCJhXCIsXCJiXCJdLFxuICAgICAgICAgICAgIGJvZHk6XCJhXCIrb3ArXCI9YlwifSxcbiAgICAgIHJ2YWx1ZTogdHJ1ZSxcbiAgICAgIGZ1bmNOYW1lOiBpZCtcImVxXCJcbiAgICB9KVxuICAgIGV4cG9ydHNbaWQrXCJzXCJdID0gbWFrZU9wKHtcbiAgICAgIGFyZ3M6IFtcImFycmF5XCIsIFwiYXJyYXlcIiwgXCJzY2FsYXJcIl0sXG4gICAgICBib2R5OiB7YXJnczpbXCJhXCIsXCJiXCIsXCJzXCJdLFxuICAgICAgICAgICAgIGJvZHk6XCJhPWJcIitvcCtcInNcIn0sXG4gICAgICBmdW5jTmFtZTogaWQrXCJzXCJcbiAgICB9KVxuICAgIGV4cG9ydHNbaWQrXCJzZXFcIl0gPSBtYWtlT3Aoe1xuICAgICAgYXJnczogW1wiYXJyYXlcIixcInNjYWxhclwiXSxcbiAgICAgIGJvZHk6IHthcmdzOltcImFcIixcInNcIl0sXG4gICAgICAgICAgICAgYm9keTpcImFcIitvcCtcIj1zXCJ9LFxuICAgICAgcnZhbHVlOiB0cnVlLFxuICAgICAgZnVuY05hbWU6IGlkK1wic2VxXCJcbiAgICB9KVxuICB9XG59KSgpO1xuXG52YXIgdW5hcnlfb3BzID0ge1xuICBub3Q6IFwiIVwiLFxuICBibm90OiBcIn5cIixcbiAgbmVnOiBcIi1cIixcbiAgcmVjaXA6IFwiMS4wL1wiXG59XG47KGZ1bmN0aW9uKCl7XG4gIGZvcih2YXIgaWQgaW4gdW5hcnlfb3BzKSB7XG4gICAgdmFyIG9wID0gdW5hcnlfb3BzW2lkXVxuICAgIGV4cG9ydHNbaWRdID0gbWFrZU9wKHtcbiAgICAgIGFyZ3M6IFtcImFycmF5XCIsIFwiYXJyYXlcIl0sXG4gICAgICBib2R5OiB7YXJnczpbXCJhXCIsXCJiXCJdLFxuICAgICAgICAgICAgIGJvZHk6XCJhPVwiK29wK1wiYlwifSxcbiAgICAgIGZ1bmNOYW1lOiBpZFxuICAgIH0pXG4gICAgZXhwb3J0c1tpZCtcImVxXCJdID0gbWFrZU9wKHtcbiAgICAgIGFyZ3M6IFtcImFycmF5XCJdLFxuICAgICAgYm9keToge2FyZ3M6W1wiYVwiXSxcbiAgICAgICAgICAgICBib2R5OlwiYT1cIitvcCtcImFcIn0sXG4gICAgICBydmFsdWU6IHRydWUsXG4gICAgICBjb3VudDogMixcbiAgICAgIGZ1bmNOYW1lOiBpZCtcImVxXCJcbiAgICB9KVxuICB9XG59KSgpO1xuXG52YXIgYmluYXJ5X29wcyA9IHtcbiAgYW5kOiBcIiYmXCIsXG4gIG9yOiBcInx8XCIsXG4gIGVxOiBcIj09PVwiLFxuICBuZXE6IFwiIT09XCIsXG4gIGx0OiBcIjxcIixcbiAgZ3Q6IFwiPlwiLFxuICBsZXE6IFwiPD1cIixcbiAgZ2VxOiBcIj49XCJcbn1cbjsoZnVuY3Rpb24oKSB7XG4gIGZvcih2YXIgaWQgaW4gYmluYXJ5X29wcykge1xuICAgIHZhciBvcCA9IGJpbmFyeV9vcHNbaWRdXG4gICAgZXhwb3J0c1tpZF0gPSBtYWtlT3Aoe1xuICAgICAgYXJnczogW1wiYXJyYXlcIixcImFycmF5XCIsXCJhcnJheVwiXSxcbiAgICAgIGJvZHk6IHthcmdzOltcImFcIiwgXCJiXCIsIFwiY1wiXSxcbiAgICAgICAgICAgICBib2R5OlwiYT1iXCIrb3ArXCJjXCJ9LFxuICAgICAgZnVuY05hbWU6IGlkXG4gICAgfSlcbiAgICBleHBvcnRzW2lkK1wic1wiXSA9IG1ha2VPcCh7XG4gICAgICBhcmdzOiBbXCJhcnJheVwiLFwiYXJyYXlcIixcInNjYWxhclwiXSxcbiAgICAgIGJvZHk6IHthcmdzOltcImFcIiwgXCJiXCIsIFwic1wiXSxcbiAgICAgICAgICAgICBib2R5OlwiYT1iXCIrb3ArXCJzXCJ9LFxuICAgICAgZnVuY05hbWU6IGlkK1wic1wiXG4gICAgfSlcbiAgICBleHBvcnRzW2lkK1wiZXFcIl0gPSBtYWtlT3Aoe1xuICAgICAgYXJnczogW1wiYXJyYXlcIiwgXCJhcnJheVwiXSxcbiAgICAgIGJvZHk6IHthcmdzOltcImFcIiwgXCJiXCJdLFxuICAgICAgICAgICAgIGJvZHk6XCJhPWFcIitvcCtcImJcIn0sXG4gICAgICBydmFsdWU6dHJ1ZSxcbiAgICAgIGNvdW50OjIsXG4gICAgICBmdW5jTmFtZTogaWQrXCJlcVwiXG4gICAgfSlcbiAgICBleHBvcnRzW2lkK1wic2VxXCJdID0gbWFrZU9wKHtcbiAgICAgIGFyZ3M6IFtcImFycmF5XCIsIFwic2NhbGFyXCJdLFxuICAgICAgYm9keToge2FyZ3M6W1wiYVwiLFwic1wiXSxcbiAgICAgICAgICAgICBib2R5OlwiYT1hXCIrb3ArXCJzXCJ9LFxuICAgICAgcnZhbHVlOnRydWUsXG4gICAgICBjb3VudDoyLFxuICAgICAgZnVuY05hbWU6IGlkK1wic2VxXCJcbiAgICB9KVxuICB9XG59KSgpO1xuXG52YXIgbWF0aF91bmFyeSA9IFtcbiAgXCJhYnNcIixcbiAgXCJhY29zXCIsXG4gIFwiYXNpblwiLFxuICBcImF0YW5cIixcbiAgXCJjZWlsXCIsXG4gIFwiY29zXCIsXG4gIFwiZXhwXCIsXG4gIFwiZmxvb3JcIixcbiAgXCJsb2dcIixcbiAgXCJyb3VuZFwiLFxuICBcInNpblwiLFxuICBcInNxcnRcIixcbiAgXCJ0YW5cIlxuXVxuOyhmdW5jdGlvbigpIHtcbiAgZm9yKHZhciBpPTA7IGk8bWF0aF91bmFyeS5sZW5ndGg7ICsraSkge1xuICAgIHZhciBmID0gbWF0aF91bmFyeVtpXVxuICAgIGV4cG9ydHNbZl0gPSBtYWtlT3Aoe1xuICAgICAgICAgICAgICAgICAgICBhcmdzOiBbXCJhcnJheVwiLCBcImFycmF5XCJdLFxuICAgICAgICAgICAgICAgICAgICBwcmU6IHthcmdzOltdLCBib2R5OlwidGhpc19mPU1hdGguXCIrZiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgICAgICAgICAgICAgICAgICAgYm9keToge2FyZ3M6W1wiYVwiLFwiYlwiXSwgYm9keTpcImE9dGhpc19mKGIpXCIsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICAgIGZ1bmNOYW1lOiBmXG4gICAgICAgICAgICAgICAgICB9KVxuICAgIGV4cG9ydHNbZitcImVxXCJdID0gbWFrZU9wKHtcbiAgICAgICAgICAgICAgICAgICAgICBhcmdzOiBbXCJhcnJheVwiXSxcbiAgICAgICAgICAgICAgICAgICAgICBwcmU6IHthcmdzOltdLCBib2R5OlwidGhpc19mPU1hdGguXCIrZiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgICAgICAgICAgICAgICAgICAgICBib2R5OiB7YXJnczogW1wiYVwiXSwgYm9keTpcImE9dGhpc19mKGEpXCIsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICAgICAgcnZhbHVlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgIGNvdW50OiAyLFxuICAgICAgICAgICAgICAgICAgICAgIGZ1bmNOYW1lOiBmK1wiZXFcIlxuICAgICAgICAgICAgICAgICAgICB9KVxuICB9XG59KSgpO1xuXG52YXIgbWF0aF9jb21tID0gW1xuICBcIm1heFwiLFxuICBcIm1pblwiLFxuICBcImF0YW4yXCIsXG4gIFwicG93XCJcbl1cbjsoZnVuY3Rpb24oKXtcbiAgZm9yKHZhciBpPTA7IGk8bWF0aF9jb21tLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGY9IG1hdGhfY29tbVtpXVxuICAgIGV4cG9ydHNbZl0gPSBtYWtlT3Aoe1xuICAgICAgICAgICAgICAgICAgYXJnczpbXCJhcnJheVwiLCBcImFycmF5XCIsIFwiYXJyYXlcIl0sXG4gICAgICAgICAgICAgICAgICBwcmU6IHthcmdzOltdLCBib2R5OlwidGhpc19mPU1hdGguXCIrZiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgICAgICAgICAgICAgICAgIGJvZHk6IHthcmdzOltcImFcIixcImJcIixcImNcIl0sIGJvZHk6XCJhPXRoaXNfZihiLGMpXCIsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICBmdW5jTmFtZTogZlxuICAgICAgICAgICAgICAgIH0pXG4gICAgZXhwb3J0c1tmK1wic1wiXSA9IG1ha2VPcCh7XG4gICAgICAgICAgICAgICAgICBhcmdzOltcImFycmF5XCIsIFwiYXJyYXlcIiwgXCJzY2FsYXJcIl0sXG4gICAgICAgICAgICAgICAgICBwcmU6IHthcmdzOltdLCBib2R5OlwidGhpc19mPU1hdGguXCIrZiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgICAgICAgICAgICAgICAgIGJvZHk6IHthcmdzOltcImFcIixcImJcIixcImNcIl0sIGJvZHk6XCJhPXRoaXNfZihiLGMpXCIsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICBmdW5jTmFtZTogZitcInNcIlxuICAgICAgICAgICAgICAgICAgfSlcbiAgICBleHBvcnRzW2YrXCJlcVwiXSA9IG1ha2VPcCh7IGFyZ3M6W1wiYXJyYXlcIiwgXCJhcnJheVwiXSxcbiAgICAgICAgICAgICAgICAgIHByZToge2FyZ3M6W10sIGJvZHk6XCJ0aGlzX2Y9TWF0aC5cIitmLCB0aGlzVmFyczpbXCJ0aGlzX2ZcIl19LFxuICAgICAgICAgICAgICAgICAgYm9keToge2FyZ3M6W1wiYVwiLFwiYlwiXSwgYm9keTpcImE9dGhpc19mKGEsYilcIiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgICAgICAgICAgICAgICAgIHJ2YWx1ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgIGNvdW50OiAyLFxuICAgICAgICAgICAgICAgICAgZnVuY05hbWU6IGYrXCJlcVwiXG4gICAgICAgICAgICAgICAgICB9KVxuICAgIGV4cG9ydHNbZitcInNlcVwiXSA9IG1ha2VPcCh7IGFyZ3M6W1wiYXJyYXlcIiwgXCJzY2FsYXJcIl0sXG4gICAgICAgICAgICAgICAgICBwcmU6IHthcmdzOltdLCBib2R5OlwidGhpc19mPU1hdGguXCIrZiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgICAgICAgICAgICAgICAgIGJvZHk6IHthcmdzOltcImFcIixcImJcIl0sIGJvZHk6XCJhPXRoaXNfZihhLGIpXCIsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICBydmFsdWU6dHJ1ZSxcbiAgICAgICAgICAgICAgICAgIGNvdW50OjIsXG4gICAgICAgICAgICAgICAgICBmdW5jTmFtZTogZitcInNlcVwiXG4gICAgICAgICAgICAgICAgICB9KVxuICB9XG59KSgpO1xuXG52YXIgbWF0aF9ub25jb21tID0gW1xuICBcImF0YW4yXCIsXG4gIFwicG93XCJcbl1cbjsoZnVuY3Rpb24oKXtcbiAgZm9yKHZhciBpPTA7IGk8bWF0aF9ub25jb21tLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGY9IG1hdGhfbm9uY29tbVtpXVxuICAgIGV4cG9ydHNbZitcIm9wXCJdID0gbWFrZU9wKHtcbiAgICAgICAgICAgICAgICAgIGFyZ3M6W1wiYXJyYXlcIiwgXCJhcnJheVwiLCBcImFycmF5XCJdLFxuICAgICAgICAgICAgICAgICAgcHJlOiB7YXJnczpbXSwgYm9keTpcInRoaXNfZj1NYXRoLlwiK2YsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICBib2R5OiB7YXJnczpbXCJhXCIsXCJiXCIsXCJjXCJdLCBib2R5OlwiYT10aGlzX2YoYyxiKVwiLCB0aGlzVmFyczpbXCJ0aGlzX2ZcIl19LFxuICAgICAgICAgICAgICAgICAgZnVuY05hbWU6IGYrXCJvcFwiXG4gICAgICAgICAgICAgICAgfSlcbiAgICBleHBvcnRzW2YrXCJvcHNcIl0gPSBtYWtlT3Aoe1xuICAgICAgICAgICAgICAgICAgYXJnczpbXCJhcnJheVwiLCBcImFycmF5XCIsIFwic2NhbGFyXCJdLFxuICAgICAgICAgICAgICAgICAgcHJlOiB7YXJnczpbXSwgYm9keTpcInRoaXNfZj1NYXRoLlwiK2YsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICBib2R5OiB7YXJnczpbXCJhXCIsXCJiXCIsXCJjXCJdLCBib2R5OlwiYT10aGlzX2YoYyxiKVwiLCB0aGlzVmFyczpbXCJ0aGlzX2ZcIl19LFxuICAgICAgICAgICAgICAgICAgZnVuY05hbWU6IGYrXCJvcHNcIlxuICAgICAgICAgICAgICAgICAgfSlcbiAgICBleHBvcnRzW2YrXCJvcGVxXCJdID0gbWFrZU9wKHsgYXJnczpbXCJhcnJheVwiLCBcImFycmF5XCJdLFxuICAgICAgICAgICAgICAgICAgcHJlOiB7YXJnczpbXSwgYm9keTpcInRoaXNfZj1NYXRoLlwiK2YsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICBib2R5OiB7YXJnczpbXCJhXCIsXCJiXCJdLCBib2R5OlwiYT10aGlzX2YoYixhKVwiLCB0aGlzVmFyczpbXCJ0aGlzX2ZcIl19LFxuICAgICAgICAgICAgICAgICAgcnZhbHVlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgY291bnQ6IDIsXG4gICAgICAgICAgICAgICAgICBmdW5jTmFtZTogZitcIm9wZXFcIlxuICAgICAgICAgICAgICAgICAgfSlcbiAgICBleHBvcnRzW2YrXCJvcHNlcVwiXSA9IG1ha2VPcCh7IGFyZ3M6W1wiYXJyYXlcIiwgXCJzY2FsYXJcIl0sXG4gICAgICAgICAgICAgICAgICBwcmU6IHthcmdzOltdLCBib2R5OlwidGhpc19mPU1hdGguXCIrZiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgICAgICAgICAgICAgICAgIGJvZHk6IHthcmdzOltcImFcIixcImJcIl0sIGJvZHk6XCJhPXRoaXNfZihiLGEpXCIsIHRoaXNWYXJzOltcInRoaXNfZlwiXX0sXG4gICAgICAgICAgICAgICAgICBydmFsdWU6dHJ1ZSxcbiAgICAgICAgICAgICAgICAgIGNvdW50OjIsXG4gICAgICAgICAgICAgICAgICBmdW5jTmFtZTogZitcIm9wc2VxXCJcbiAgICAgICAgICAgICAgICAgIH0pXG4gIH1cbn0pKCk7XG5cbmV4cG9ydHMuYW55ID0gY29tcGlsZSh7XG4gIGFyZ3M6W1wiYXJyYXlcIl0sXG4gIHByZTogRW1wdHlQcm9jLFxuICBib2R5OiB7YXJnczpbe25hbWU6XCJhXCIsIGx2YWx1ZTpmYWxzZSwgcnZhbHVlOnRydWUsIGNvdW50OjF9XSwgYm9keTogXCJpZihhKXtyZXR1cm4gdHJ1ZX1cIiwgbG9jYWxWYXJzOiBbXSwgdGhpc1ZhcnM6IFtdfSxcbiAgcG9zdDoge2FyZ3M6W10sIGxvY2FsVmFyczpbXSwgdGhpc1ZhcnM6W10sIGJvZHk6XCJyZXR1cm4gZmFsc2VcIn0sXG4gIGZ1bmNOYW1lOiBcImFueVwiXG59KVxuXG5leHBvcnRzLmFsbCA9IGNvbXBpbGUoe1xuICBhcmdzOltcImFycmF5XCJdLFxuICBwcmU6IEVtcHR5UHJvYyxcbiAgYm9keToge2FyZ3M6W3tuYW1lOlwieFwiLCBsdmFsdWU6ZmFsc2UsIHJ2YWx1ZTp0cnVlLCBjb3VudDoxfV0sIGJvZHk6IFwiaWYoIXgpe3JldHVybiBmYWxzZX1cIiwgbG9jYWxWYXJzOiBbXSwgdGhpc1ZhcnM6IFtdfSxcbiAgcG9zdDoge2FyZ3M6W10sIGxvY2FsVmFyczpbXSwgdGhpc1ZhcnM6W10sIGJvZHk6XCJyZXR1cm4gdHJ1ZVwifSxcbiAgZnVuY05hbWU6IFwiYWxsXCJcbn0pXG5cbmV4cG9ydHMuc3VtID0gY29tcGlsZSh7XG4gIGFyZ3M6W1wiYXJyYXlcIl0sXG4gIHByZToge2FyZ3M6W10sIGxvY2FsVmFyczpbXSwgdGhpc1ZhcnM6W1widGhpc19zXCJdLCBib2R5OlwidGhpc19zPTBcIn0sXG4gIGJvZHk6IHthcmdzOlt7bmFtZTpcImFcIiwgbHZhbHVlOmZhbHNlLCBydmFsdWU6dHJ1ZSwgY291bnQ6MX1dLCBib2R5OiBcInRoaXNfcys9YVwiLCBsb2NhbFZhcnM6IFtdLCB0aGlzVmFyczogW1widGhpc19zXCJdfSxcbiAgcG9zdDoge2FyZ3M6W10sIGxvY2FsVmFyczpbXSwgdGhpc1ZhcnM6W1widGhpc19zXCJdLCBib2R5OlwicmV0dXJuIHRoaXNfc1wifSxcbiAgZnVuY05hbWU6IFwic3VtXCJcbn0pXG5cbmV4cG9ydHMucHJvZCA9IGNvbXBpbGUoe1xuICBhcmdzOltcImFycmF5XCJdLFxuICBwcmU6IHthcmdzOltdLCBsb2NhbFZhcnM6W10sIHRoaXNWYXJzOltcInRoaXNfc1wiXSwgYm9keTpcInRoaXNfcz0xXCJ9LFxuICBib2R5OiB7YXJnczpbe25hbWU6XCJhXCIsIGx2YWx1ZTpmYWxzZSwgcnZhbHVlOnRydWUsIGNvdW50OjF9XSwgYm9keTogXCJ0aGlzX3MqPWFcIiwgbG9jYWxWYXJzOiBbXSwgdGhpc1ZhcnM6IFtcInRoaXNfc1wiXX0sXG4gIHBvc3Q6IHthcmdzOltdLCBsb2NhbFZhcnM6W10sIHRoaXNWYXJzOltcInRoaXNfc1wiXSwgYm9keTpcInJldHVybiB0aGlzX3NcIn0sXG4gIGZ1bmNOYW1lOiBcInByb2RcIlxufSlcblxuZXhwb3J0cy5ub3JtMnNxdWFyZWQgPSBjb21waWxlKHtcbiAgYXJnczpbXCJhcnJheVwiXSxcbiAgcHJlOiB7YXJnczpbXSwgbG9jYWxWYXJzOltdLCB0aGlzVmFyczpbXCJ0aGlzX3NcIl0sIGJvZHk6XCJ0aGlzX3M9MFwifSxcbiAgYm9keToge2FyZ3M6W3tuYW1lOlwiYVwiLCBsdmFsdWU6ZmFsc2UsIHJ2YWx1ZTp0cnVlLCBjb3VudDoyfV0sIGJvZHk6IFwidGhpc19zKz1hKmFcIiwgbG9jYWxWYXJzOiBbXSwgdGhpc1ZhcnM6IFtcInRoaXNfc1wiXX0sXG4gIHBvc3Q6IHthcmdzOltdLCBsb2NhbFZhcnM6W10sIHRoaXNWYXJzOltcInRoaXNfc1wiXSwgYm9keTpcInJldHVybiB0aGlzX3NcIn0sXG4gIGZ1bmNOYW1lOiBcIm5vcm0yc3F1YXJlZFwiXG59KVxuICBcbmV4cG9ydHMubm9ybTIgPSBjb21waWxlKHtcbiAgYXJnczpbXCJhcnJheVwiXSxcbiAgcHJlOiB7YXJnczpbXSwgbG9jYWxWYXJzOltdLCB0aGlzVmFyczpbXCJ0aGlzX3NcIl0sIGJvZHk6XCJ0aGlzX3M9MFwifSxcbiAgYm9keToge2FyZ3M6W3tuYW1lOlwiYVwiLCBsdmFsdWU6ZmFsc2UsIHJ2YWx1ZTp0cnVlLCBjb3VudDoyfV0sIGJvZHk6IFwidGhpc19zKz1hKmFcIiwgbG9jYWxWYXJzOiBbXSwgdGhpc1ZhcnM6IFtcInRoaXNfc1wiXX0sXG4gIHBvc3Q6IHthcmdzOltdLCBsb2NhbFZhcnM6W10sIHRoaXNWYXJzOltcInRoaXNfc1wiXSwgYm9keTpcInJldHVybiBNYXRoLnNxcnQodGhpc19zKVwifSxcbiAgZnVuY05hbWU6IFwibm9ybTJcIlxufSlcbiAgXG5cbmV4cG9ydHMubm9ybWluZiA9IGNvbXBpbGUoe1xuICBhcmdzOltcImFycmF5XCJdLFxuICBwcmU6IHthcmdzOltdLCBsb2NhbFZhcnM6W10sIHRoaXNWYXJzOltcInRoaXNfc1wiXSwgYm9keTpcInRoaXNfcz0wXCJ9LFxuICBib2R5OiB7YXJnczpbe25hbWU6XCJhXCIsIGx2YWx1ZTpmYWxzZSwgcnZhbHVlOnRydWUsIGNvdW50OjR9XSwgYm9keTpcImlmKC1hPnRoaXNfcyl7dGhpc19zPS1hfWVsc2UgaWYoYT50aGlzX3Mpe3RoaXNfcz1hfVwiLCBsb2NhbFZhcnM6IFtdLCB0aGlzVmFyczogW1widGhpc19zXCJdfSxcbiAgcG9zdDoge2FyZ3M6W10sIGxvY2FsVmFyczpbXSwgdGhpc1ZhcnM6W1widGhpc19zXCJdLCBib2R5OlwicmV0dXJuIHRoaXNfc1wifSxcbiAgZnVuY05hbWU6IFwibm9ybWluZlwiXG59KVxuXG5leHBvcnRzLm5vcm0xID0gY29tcGlsZSh7XG4gIGFyZ3M6W1wiYXJyYXlcIl0sXG4gIHByZToge2FyZ3M6W10sIGxvY2FsVmFyczpbXSwgdGhpc1ZhcnM6W1widGhpc19zXCJdLCBib2R5OlwidGhpc19zPTBcIn0sXG4gIGJvZHk6IHthcmdzOlt7bmFtZTpcImFcIiwgbHZhbHVlOmZhbHNlLCBydmFsdWU6dHJ1ZSwgY291bnQ6M31dLCBib2R5OiBcInRoaXNfcys9YTwwPy1hOmFcIiwgbG9jYWxWYXJzOiBbXSwgdGhpc1ZhcnM6IFtcInRoaXNfc1wiXX0sXG4gIHBvc3Q6IHthcmdzOltdLCBsb2NhbFZhcnM6W10sIHRoaXNWYXJzOltcInRoaXNfc1wiXSwgYm9keTpcInJldHVybiB0aGlzX3NcIn0sXG4gIGZ1bmNOYW1lOiBcIm5vcm0xXCJcbn0pXG5cbmV4cG9ydHMuc3VwID0gY29tcGlsZSh7XG4gIGFyZ3M6IFsgXCJhcnJheVwiIF0sXG4gIHByZTpcbiAgIHsgYm9keTogXCJ0aGlzX2g9LUluZmluaXR5XCIsXG4gICAgIGFyZ3M6IFtdLFxuICAgICB0aGlzVmFyczogWyBcInRoaXNfaFwiIF0sXG4gICAgIGxvY2FsVmFyczogW10gfSxcbiAgYm9keTpcbiAgIHsgYm9keTogXCJpZihfaW5saW5lXzFfYXJnMF8+dGhpc19oKXRoaXNfaD1faW5saW5lXzFfYXJnMF9cIixcbiAgICAgYXJnczogW3tcIm5hbWVcIjpcIl9pbmxpbmVfMV9hcmcwX1wiLFwibHZhbHVlXCI6ZmFsc2UsXCJydmFsdWVcIjp0cnVlLFwiY291bnRcIjoyfSBdLFxuICAgICB0aGlzVmFyczogWyBcInRoaXNfaFwiIF0sXG4gICAgIGxvY2FsVmFyczogW10gfSxcbiAgcG9zdDpcbiAgIHsgYm9keTogXCJyZXR1cm4gdGhpc19oXCIsXG4gICAgIGFyZ3M6IFtdLFxuICAgICB0aGlzVmFyczogWyBcInRoaXNfaFwiIF0sXG4gICAgIGxvY2FsVmFyczogW10gfVxuIH0pXG5cbmV4cG9ydHMuaW5mID0gY29tcGlsZSh7XG4gIGFyZ3M6IFsgXCJhcnJheVwiIF0sXG4gIHByZTpcbiAgIHsgYm9keTogXCJ0aGlzX2g9SW5maW5pdHlcIixcbiAgICAgYXJnczogW10sXG4gICAgIHRoaXNWYXJzOiBbIFwidGhpc19oXCIgXSxcbiAgICAgbG9jYWxWYXJzOiBbXSB9LFxuICBib2R5OlxuICAgeyBib2R5OiBcImlmKF9pbmxpbmVfMV9hcmcwXzx0aGlzX2gpdGhpc19oPV9pbmxpbmVfMV9hcmcwX1wiLFxuICAgICBhcmdzOiBbe1wibmFtZVwiOlwiX2lubGluZV8xX2FyZzBfXCIsXCJsdmFsdWVcIjpmYWxzZSxcInJ2YWx1ZVwiOnRydWUsXCJjb3VudFwiOjJ9IF0sXG4gICAgIHRoaXNWYXJzOiBbIFwidGhpc19oXCIgXSxcbiAgICAgbG9jYWxWYXJzOiBbXSB9LFxuICBwb3N0OlxuICAgeyBib2R5OiBcInJldHVybiB0aGlzX2hcIixcbiAgICAgYXJnczogW10sXG4gICAgIHRoaXNWYXJzOiBbIFwidGhpc19oXCIgXSxcbiAgICAgbG9jYWxWYXJzOiBbXSB9XG4gfSlcblxuZXhwb3J0cy5hcmdtaW4gPSBjb21waWxlKHtcbiAgYXJnczpbXCJpbmRleFwiLFwiYXJyYXlcIixcInNoYXBlXCJdLFxuICBwcmU6e1xuICAgIGJvZHk6XCJ7dGhpc192PUluZmluaXR5O3RoaXNfaT1faW5saW5lXzBfYXJnMl8uc2xpY2UoMCl9XCIsXG4gICAgYXJnczpbXG4gICAgICB7bmFtZTpcIl9pbmxpbmVfMF9hcmcwX1wiLGx2YWx1ZTpmYWxzZSxydmFsdWU6ZmFsc2UsY291bnQ6MH0sXG4gICAgICB7bmFtZTpcIl9pbmxpbmVfMF9hcmcxX1wiLGx2YWx1ZTpmYWxzZSxydmFsdWU6ZmFsc2UsY291bnQ6MH0sXG4gICAgICB7bmFtZTpcIl9pbmxpbmVfMF9hcmcyX1wiLGx2YWx1ZTpmYWxzZSxydmFsdWU6dHJ1ZSxjb3VudDoxfVxuICAgICAgXSxcbiAgICB0aGlzVmFyczpbXCJ0aGlzX2lcIixcInRoaXNfdlwiXSxcbiAgICBsb2NhbFZhcnM6W119LFxuICBib2R5OntcbiAgICBib2R5Olwie2lmKF9pbmxpbmVfMV9hcmcxXzx0aGlzX3Ype3RoaXNfdj1faW5saW5lXzFfYXJnMV87Zm9yKHZhciBfaW5saW5lXzFfaz0wO19pbmxpbmVfMV9rPF9pbmxpbmVfMV9hcmcwXy5sZW5ndGg7KytfaW5saW5lXzFfayl7dGhpc19pW19pbmxpbmVfMV9rXT1faW5saW5lXzFfYXJnMF9bX2lubGluZV8xX2tdfX19XCIsXG4gICAgYXJnczpbXG4gICAgICB7bmFtZTpcIl9pbmxpbmVfMV9hcmcwX1wiLGx2YWx1ZTpmYWxzZSxydmFsdWU6dHJ1ZSxjb3VudDoyfSxcbiAgICAgIHtuYW1lOlwiX2lubGluZV8xX2FyZzFfXCIsbHZhbHVlOmZhbHNlLHJ2YWx1ZTp0cnVlLGNvdW50OjJ9XSxcbiAgICB0aGlzVmFyczpbXCJ0aGlzX2lcIixcInRoaXNfdlwiXSxcbiAgICBsb2NhbFZhcnM6W1wiX2lubGluZV8xX2tcIl19LFxuICBwb3N0OntcbiAgICBib2R5Olwie3JldHVybiB0aGlzX2l9XCIsXG4gICAgYXJnczpbXSxcbiAgICB0aGlzVmFyczpbXCJ0aGlzX2lcIl0sXG4gICAgbG9jYWxWYXJzOltdfVxufSlcblxuZXhwb3J0cy5hcmdtYXggPSBjb21waWxlKHtcbiAgYXJnczpbXCJpbmRleFwiLFwiYXJyYXlcIixcInNoYXBlXCJdLFxuICBwcmU6e1xuICAgIGJvZHk6XCJ7dGhpc192PS1JbmZpbml0eTt0aGlzX2k9X2lubGluZV8wX2FyZzJfLnNsaWNlKDApfVwiLFxuICAgIGFyZ3M6W1xuICAgICAge25hbWU6XCJfaW5saW5lXzBfYXJnMF9cIixsdmFsdWU6ZmFsc2UscnZhbHVlOmZhbHNlLGNvdW50OjB9LFxuICAgICAge25hbWU6XCJfaW5saW5lXzBfYXJnMV9cIixsdmFsdWU6ZmFsc2UscnZhbHVlOmZhbHNlLGNvdW50OjB9LFxuICAgICAge25hbWU6XCJfaW5saW5lXzBfYXJnMl9cIixsdmFsdWU6ZmFsc2UscnZhbHVlOnRydWUsY291bnQ6MX1cbiAgICAgIF0sXG4gICAgdGhpc1ZhcnM6W1widGhpc19pXCIsXCJ0aGlzX3ZcIl0sXG4gICAgbG9jYWxWYXJzOltdfSxcbiAgYm9keTp7XG4gICAgYm9keTpcIntpZihfaW5saW5lXzFfYXJnMV8+dGhpc192KXt0aGlzX3Y9X2lubGluZV8xX2FyZzFfO2Zvcih2YXIgX2lubGluZV8xX2s9MDtfaW5saW5lXzFfazxfaW5saW5lXzFfYXJnMF8ubGVuZ3RoOysrX2lubGluZV8xX2spe3RoaXNfaVtfaW5saW5lXzFfa109X2lubGluZV8xX2FyZzBfW19pbmxpbmVfMV9rXX19fVwiLFxuICAgIGFyZ3M6W1xuICAgICAge25hbWU6XCJfaW5saW5lXzFfYXJnMF9cIixsdmFsdWU6ZmFsc2UscnZhbHVlOnRydWUsY291bnQ6Mn0sXG4gICAgICB7bmFtZTpcIl9pbmxpbmVfMV9hcmcxX1wiLGx2YWx1ZTpmYWxzZSxydmFsdWU6dHJ1ZSxjb3VudDoyfV0sXG4gICAgdGhpc1ZhcnM6W1widGhpc19pXCIsXCJ0aGlzX3ZcIl0sXG4gICAgbG9jYWxWYXJzOltcIl9pbmxpbmVfMV9rXCJdfSxcbiAgcG9zdDp7XG4gICAgYm9keTpcIntyZXR1cm4gdGhpc19pfVwiLFxuICAgIGFyZ3M6W10sXG4gICAgdGhpc1ZhcnM6W1widGhpc19pXCJdLFxuICAgIGxvY2FsVmFyczpbXX1cbn0pICBcblxuZXhwb3J0cy5yYW5kb20gPSBtYWtlT3Aoe1xuICBhcmdzOiBbXCJhcnJheVwiXSxcbiAgcHJlOiB7YXJnczpbXSwgYm9keTpcInRoaXNfZj1NYXRoLnJhbmRvbVwiLCB0aGlzVmFyczpbXCJ0aGlzX2ZcIl19LFxuICBib2R5OiB7YXJnczogW1wiYVwiXSwgYm9keTpcImE9dGhpc19mKClcIiwgdGhpc1ZhcnM6W1widGhpc19mXCJdfSxcbiAgZnVuY05hbWU6IFwicmFuZG9tXCJcbn0pXG5cbmV4cG9ydHMuYXNzaWduID0gbWFrZU9wKHtcbiAgYXJnczpbXCJhcnJheVwiLCBcImFycmF5XCJdLFxuICBib2R5OiB7YXJnczpbXCJhXCIsIFwiYlwiXSwgYm9keTpcImE9YlwifSxcbiAgZnVuY05hbWU6IFwiYXNzaWduXCIgfSlcblxuZXhwb3J0cy5hc3NpZ25zID0gbWFrZU9wKHtcbiAgYXJnczpbXCJhcnJheVwiLCBcInNjYWxhclwiXSxcbiAgYm9keToge2FyZ3M6W1wiYVwiLCBcImJcIl0sIGJvZHk6XCJhPWJcIn0sXG4gIGZ1bmNOYW1lOiBcImFzc2lnbnNcIiB9KVxuXG5cbmV4cG9ydHMuZXF1YWxzID0gY29tcGlsZSh7XG4gIGFyZ3M6W1wiYXJyYXlcIiwgXCJhcnJheVwiXSxcbiAgcHJlOiBFbXB0eVByb2MsXG4gIGJvZHk6IHthcmdzOlt7bmFtZTpcInhcIiwgbHZhbHVlOmZhbHNlLCBydmFsdWU6dHJ1ZSwgY291bnQ6MX0sXG4gICAgICAgICAgICAgICB7bmFtZTpcInlcIiwgbHZhbHVlOmZhbHNlLCBydmFsdWU6dHJ1ZSwgY291bnQ6MX1dLCBcbiAgICAgICAgYm9keTogXCJpZih4IT09eSl7cmV0dXJuIGZhbHNlfVwiLCBcbiAgICAgICAgbG9jYWxWYXJzOiBbXSwgXG4gICAgICAgIHRoaXNWYXJzOiBbXX0sXG4gIHBvc3Q6IHthcmdzOltdLCBsb2NhbFZhcnM6W10sIHRoaXNWYXJzOltdLCBib2R5OlwicmV0dXJuIHRydWVcIn0sXG4gIGZ1bmNOYW1lOiBcImVxdWFsc1wiXG59KVxuXG5cbiIsInZhciBpb3RhID0gcmVxdWlyZShcImlvdGEtYXJyYXlcIilcbnZhciBpc0J1ZmZlciA9IHJlcXVpcmUoXCJpcy1idWZmZXJcIilcblxudmFyIGhhc1R5cGVkQXJyYXlzICA9ICgodHlwZW9mIEZsb2F0NjRBcnJheSkgIT09IFwidW5kZWZpbmVkXCIpXG5cbmZ1bmN0aW9uIGNvbXBhcmUxc3QoYSwgYikge1xuICByZXR1cm4gYVswXSAtIGJbMF1cbn1cblxuZnVuY3Rpb24gb3JkZXIoKSB7XG4gIHZhciBzdHJpZGUgPSB0aGlzLnN0cmlkZVxuICB2YXIgdGVybXMgPSBuZXcgQXJyYXkoc3RyaWRlLmxlbmd0aClcbiAgdmFyIGlcbiAgZm9yKGk9MDsgaTx0ZXJtcy5sZW5ndGg7ICsraSkge1xuICAgIHRlcm1zW2ldID0gW01hdGguYWJzKHN0cmlkZVtpXSksIGldXG4gIH1cbiAgdGVybXMuc29ydChjb21wYXJlMXN0KVxuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KHRlcm1zLmxlbmd0aClcbiAgZm9yKGk9MDsgaTxyZXN1bHQubGVuZ3RoOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSB0ZXJtc1tpXVsxXVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gY29tcGlsZUNvbnN0cnVjdG9yKGR0eXBlLCBkaW1lbnNpb24pIHtcbiAgdmFyIGNsYXNzTmFtZSA9IFtcIlZpZXdcIiwgZGltZW5zaW9uLCBcImRcIiwgZHR5cGVdLmpvaW4oXCJcIilcbiAgaWYoZGltZW5zaW9uIDwgMCkge1xuICAgIGNsYXNzTmFtZSA9IFwiVmlld19OaWxcIiArIGR0eXBlXG4gIH1cbiAgdmFyIHVzZUdldHRlcnMgPSAoZHR5cGUgPT09IFwiZ2VuZXJpY1wiKVxuXG4gIGlmKGRpbWVuc2lvbiA9PT0gLTEpIHtcbiAgICAvL1NwZWNpYWwgY2FzZSBmb3IgdHJpdmlhbCBhcnJheXNcbiAgICB2YXIgY29kZSA9XG4gICAgICBcImZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIihhKXt0aGlzLmRhdGE9YTt9O1xcXG52YXIgcHJvdG89XCIrY2xhc3NOYW1lK1wiLnByb3RvdHlwZTtcXFxucHJvdG8uZHR5cGU9J1wiK2R0eXBlK1wiJztcXFxucHJvdG8uaW5kZXg9ZnVuY3Rpb24oKXtyZXR1cm4gLTF9O1xcXG5wcm90by5zaXplPTA7XFxcbnByb3RvLmRpbWVuc2lvbj0tMTtcXFxucHJvdG8uc2hhcGU9cHJvdG8uc3RyaWRlPXByb3RvLm9yZGVyPVtdO1xcXG5wcm90by5sbz1wcm90by5oaT1wcm90by50cmFuc3Bvc2U9cHJvdG8uc3RlcD1cXFxuZnVuY3Rpb24oKXtyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIih0aGlzLmRhdGEpO307XFxcbnByb3RvLmdldD1wcm90by5zZXQ9ZnVuY3Rpb24oKXt9O1xcXG5wcm90by5waWNrPWZ1bmN0aW9uKCl7cmV0dXJuIG51bGx9O1xcXG5yZXR1cm4gZnVuY3Rpb24gY29uc3RydWN0X1wiK2NsYXNzTmFtZStcIihhKXtyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIihhKTt9XCJcbiAgICB2YXIgcHJvY2VkdXJlID0gbmV3IEZ1bmN0aW9uKGNvZGUpXG4gICAgcmV0dXJuIHByb2NlZHVyZSgpXG4gIH0gZWxzZSBpZihkaW1lbnNpb24gPT09IDApIHtcbiAgICAvL1NwZWNpYWwgY2FzZSBmb3IgMGQgYXJyYXlzXG4gICAgdmFyIGNvZGUgPVxuICAgICAgXCJmdW5jdGlvbiBcIitjbGFzc05hbWUrXCIoYSxkKSB7XFxcbnRoaXMuZGF0YSA9IGE7XFxcbnRoaXMub2Zmc2V0ID0gZFxcXG59O1xcXG52YXIgcHJvdG89XCIrY2xhc3NOYW1lK1wiLnByb3RvdHlwZTtcXFxucHJvdG8uZHR5cGU9J1wiK2R0eXBlK1wiJztcXFxucHJvdG8uaW5kZXg9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5vZmZzZXR9O1xcXG5wcm90by5kaW1lbnNpb249MDtcXFxucHJvdG8uc2l6ZT0xO1xcXG5wcm90by5zaGFwZT1cXFxucHJvdG8uc3RyaWRlPVxcXG5wcm90by5vcmRlcj1bXTtcXFxucHJvdG8ubG89XFxcbnByb3RvLmhpPVxcXG5wcm90by50cmFuc3Bvc2U9XFxcbnByb3RvLnN0ZXA9ZnVuY3Rpb24gXCIrY2xhc3NOYW1lK1wiX2NvcHkoKSB7XFxcbnJldHVybiBuZXcgXCIrY2xhc3NOYW1lK1wiKHRoaXMuZGF0YSx0aGlzLm9mZnNldClcXFxufTtcXFxucHJvdG8ucGljaz1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfcGljaygpe1xcXG5yZXR1cm4gVHJpdmlhbEFycmF5KHRoaXMuZGF0YSk7XFxcbn07XFxcbnByb3RvLnZhbHVlT2Y9cHJvdG8uZ2V0PWZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIl9nZXQoKXtcXFxucmV0dXJuIFwiKyh1c2VHZXR0ZXJzID8gXCJ0aGlzLmRhdGEuZ2V0KHRoaXMub2Zmc2V0KVwiIDogXCJ0aGlzLmRhdGFbdGhpcy5vZmZzZXRdXCIpK1xuXCJ9O1xcXG5wcm90by5zZXQ9ZnVuY3Rpb24gXCIrY2xhc3NOYW1lK1wiX3NldCh2KXtcXFxucmV0dXJuIFwiKyh1c2VHZXR0ZXJzID8gXCJ0aGlzLmRhdGEuc2V0KHRoaXMub2Zmc2V0LHYpXCIgOiBcInRoaXMuZGF0YVt0aGlzLm9mZnNldF09dlwiKStcIlxcXG59O1xcXG5yZXR1cm4gZnVuY3Rpb24gY29uc3RydWN0X1wiK2NsYXNzTmFtZStcIihhLGIsYyxkKXtyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIihhLGQpfVwiXG4gICAgdmFyIHByb2NlZHVyZSA9IG5ldyBGdW5jdGlvbihcIlRyaXZpYWxBcnJheVwiLCBjb2RlKVxuICAgIHJldHVybiBwcm9jZWR1cmUoQ0FDSEVEX0NPTlNUUlVDVE9SU1tkdHlwZV1bMF0pXG4gIH1cblxuICB2YXIgY29kZSA9IFtcIid1c2Ugc3RyaWN0J1wiXVxuXG4gIC8vQ3JlYXRlIGNvbnN0cnVjdG9yIGZvciB2aWV3XG4gIHZhciBpbmRpY2VzID0gaW90YShkaW1lbnNpb24pXG4gIHZhciBhcmdzID0gaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkgeyByZXR1cm4gXCJpXCIraSB9KVxuICB2YXIgaW5kZXhfc3RyID0gXCJ0aGlzLm9mZnNldCtcIiArIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgcmV0dXJuIFwidGhpcy5zdHJpZGVbXCIgKyBpICsgXCJdKmlcIiArIGlcbiAgICAgIH0pLmpvaW4oXCIrXCIpXG4gIHZhciBzaGFwZUFyZyA9IGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImJcIitpXG4gICAgfSkuam9pbihcIixcIilcbiAgdmFyIHN0cmlkZUFyZyA9IGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImNcIitpXG4gICAgfSkuam9pbihcIixcIilcbiAgY29kZS5wdXNoKFxuICAgIFwiZnVuY3Rpb24gXCIrY2xhc3NOYW1lK1wiKGEsXCIgKyBzaGFwZUFyZyArIFwiLFwiICsgc3RyaWRlQXJnICsgXCIsZCl7dGhpcy5kYXRhPWFcIixcbiAgICAgIFwidGhpcy5zaGFwZT1bXCIgKyBzaGFwZUFyZyArIFwiXVwiLFxuICAgICAgXCJ0aGlzLnN0cmlkZT1bXCIgKyBzdHJpZGVBcmcgKyBcIl1cIixcbiAgICAgIFwidGhpcy5vZmZzZXQ9ZHwwfVwiLFxuICAgIFwidmFyIHByb3RvPVwiK2NsYXNzTmFtZStcIi5wcm90b3R5cGVcIixcbiAgICBcInByb3RvLmR0eXBlPSdcIitkdHlwZStcIidcIixcbiAgICBcInByb3RvLmRpbWVuc2lvbj1cIitkaW1lbnNpb24pXG5cbiAgLy92aWV3LnNpemU6XG4gIGNvZGUucHVzaChcIk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm90bywnc2l6ZScse2dldDpmdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfc2l6ZSgpe1xcXG5yZXR1cm4gXCIraW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkgeyByZXR1cm4gXCJ0aGlzLnNoYXBlW1wiK2krXCJdXCIgfSkuam9pbihcIipcIiksXG5cIn19KVwiKVxuXG4gIC8vdmlldy5vcmRlcjpcbiAgaWYoZGltZW5zaW9uID09PSAxKSB7XG4gICAgY29kZS5wdXNoKFwicHJvdG8ub3JkZXI9WzBdXCIpXG4gIH0gZWxzZSB7XG4gICAgY29kZS5wdXNoKFwiT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCdvcmRlcicse2dldDpcIilcbiAgICBpZihkaW1lbnNpb24gPCA0KSB7XG4gICAgICBjb2RlLnB1c2goXCJmdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfb3JkZXIoKXtcIilcbiAgICAgIGlmKGRpbWVuc2lvbiA9PT0gMikge1xuICAgICAgICBjb2RlLnB1c2goXCJyZXR1cm4gKE1hdGguYWJzKHRoaXMuc3RyaWRlWzBdKT5NYXRoLmFicyh0aGlzLnN0cmlkZVsxXSkpP1sxLDBdOlswLDFdfX0pXCIpXG4gICAgICB9IGVsc2UgaWYoZGltZW5zaW9uID09PSAzKSB7XG4gICAgICAgIGNvZGUucHVzaChcblwidmFyIHMwPU1hdGguYWJzKHRoaXMuc3RyaWRlWzBdKSxzMT1NYXRoLmFicyh0aGlzLnN0cmlkZVsxXSksczI9TWF0aC5hYnModGhpcy5zdHJpZGVbMl0pO1xcXG5pZihzMD5zMSl7XFxcbmlmKHMxPnMyKXtcXFxucmV0dXJuIFsyLDEsMF07XFxcbn1lbHNlIGlmKHMwPnMyKXtcXFxucmV0dXJuIFsxLDIsMF07XFxcbn1lbHNle1xcXG5yZXR1cm4gWzEsMCwyXTtcXFxufVxcXG59ZWxzZSBpZihzMD5zMil7XFxcbnJldHVybiBbMiwwLDFdO1xcXG59ZWxzZSBpZihzMj5zMSl7XFxcbnJldHVybiBbMCwxLDJdO1xcXG59ZWxzZXtcXFxucmV0dXJuIFswLDIsMV07XFxcbn19fSlcIilcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29kZS5wdXNoKFwiT1JERVJ9KVwiKVxuICAgIH1cbiAgfVxuXG4gIC8vdmlldy5zZXQoaTAsIC4uLiwgdik6XG4gIGNvZGUucHVzaChcblwicHJvdG8uc2V0PWZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIl9zZXQoXCIrYXJncy5qb2luKFwiLFwiKStcIix2KXtcIilcbiAgaWYodXNlR2V0dGVycykge1xuICAgIGNvZGUucHVzaChcInJldHVybiB0aGlzLmRhdGEuc2V0KFwiK2luZGV4X3N0citcIix2KX1cIilcbiAgfSBlbHNlIHtcbiAgICBjb2RlLnB1c2goXCJyZXR1cm4gdGhpcy5kYXRhW1wiK2luZGV4X3N0citcIl09dn1cIilcbiAgfVxuXG4gIC8vdmlldy5nZXQoaTAsIC4uLik6XG4gIGNvZGUucHVzaChcInByb3RvLmdldD1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfZ2V0KFwiK2FyZ3Muam9pbihcIixcIikrXCIpe1wiKVxuICBpZih1c2VHZXR0ZXJzKSB7XG4gICAgY29kZS5wdXNoKFwicmV0dXJuIHRoaXMuZGF0YS5nZXQoXCIraW5kZXhfc3RyK1wiKX1cIilcbiAgfSBlbHNlIHtcbiAgICBjb2RlLnB1c2goXCJyZXR1cm4gdGhpcy5kYXRhW1wiK2luZGV4X3N0citcIl19XCIpXG4gIH1cblxuICAvL3ZpZXcuaW5kZXg6XG4gIGNvZGUucHVzaChcbiAgICBcInByb3RvLmluZGV4PWZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIl9pbmRleChcIiwgYXJncy5qb2luKCksIFwiKXtyZXR1cm4gXCIraW5kZXhfc3RyK1wifVwiKVxuXG4gIC8vdmlldy5oaSgpOlxuICBjb2RlLnB1c2goXCJwcm90by5oaT1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfaGkoXCIrYXJncy5qb2luKFwiLFwiKStcIil7cmV0dXJuIG5ldyBcIitjbGFzc05hbWUrXCIodGhpcy5kYXRhLFwiK1xuICAgIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBbXCIodHlwZW9mIGlcIixpLFwiIT09J251bWJlcid8fGlcIixpLFwiPDApP3RoaXMuc2hhcGVbXCIsIGksIFwiXTppXCIsIGksXCJ8MFwiXS5qb2luKFwiXCIpXG4gICAgfSkuam9pbihcIixcIikrXCIsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwidGhpcy5zdHJpZGVbXCIraSArIFwiXVwiXG4gICAgfSkuam9pbihcIixcIikrXCIsdGhpcy5vZmZzZXQpfVwiKVxuXG4gIC8vdmlldy5sbygpOlxuICB2YXIgYV92YXJzID0gaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkgeyByZXR1cm4gXCJhXCIraStcIj10aGlzLnNoYXBlW1wiK2krXCJdXCIgfSlcbiAgdmFyIGNfdmFycyA9IGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHsgcmV0dXJuIFwiY1wiK2krXCI9dGhpcy5zdHJpZGVbXCIraStcIl1cIiB9KVxuICBjb2RlLnB1c2goXCJwcm90by5sbz1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfbG8oXCIrYXJncy5qb2luKFwiLFwiKStcIil7dmFyIGI9dGhpcy5vZmZzZXQsZD0wLFwiK2FfdmFycy5qb2luKFwiLFwiKStcIixcIitjX3ZhcnMuam9pbihcIixcIikpXG4gIGZvcih2YXIgaT0wOyBpPGRpbWVuc2lvbjsgKytpKSB7XG4gICAgY29kZS5wdXNoKFxuXCJpZih0eXBlb2YgaVwiK2krXCI9PT0nbnVtYmVyJyYmaVwiK2krXCI+PTApe1xcXG5kPWlcIitpK1wifDA7XFxcbmIrPWNcIitpK1wiKmQ7XFxcbmFcIitpK1wiLT1kfVwiKVxuICB9XG4gIGNvZGUucHVzaChcInJldHVybiBuZXcgXCIrY2xhc3NOYW1lK1wiKHRoaXMuZGF0YSxcIitcbiAgICBpbmRpY2VzLm1hcChmdW5jdGlvbihpKSB7XG4gICAgICByZXR1cm4gXCJhXCIraVxuICAgIH0pLmpvaW4oXCIsXCIpK1wiLFwiK1xuICAgIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImNcIitpXG4gICAgfSkuam9pbihcIixcIikrXCIsYil9XCIpXG5cbiAgLy92aWV3LnN0ZXAoKTpcbiAgY29kZS5wdXNoKFwicHJvdG8uc3RlcD1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfc3RlcChcIithcmdzLmpvaW4oXCIsXCIpK1wiKXt2YXIgXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwiYVwiK2krXCI9dGhpcy5zaGFwZVtcIitpK1wiXVwiXG4gICAgfSkuam9pbihcIixcIikrXCIsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwiYlwiK2krXCI9dGhpcy5zdHJpZGVbXCIraStcIl1cIlxuICAgIH0pLmpvaW4oXCIsXCIpK1wiLGM9dGhpcy5vZmZzZXQsZD0wLGNlaWw9TWF0aC5jZWlsXCIpXG4gIGZvcih2YXIgaT0wOyBpPGRpbWVuc2lvbjsgKytpKSB7XG4gICAgY29kZS5wdXNoKFxuXCJpZih0eXBlb2YgaVwiK2krXCI9PT0nbnVtYmVyJyl7XFxcbmQ9aVwiK2krXCJ8MDtcXFxuaWYoZDwwKXtcXFxuYys9YlwiK2krXCIqKGFcIitpK1wiLTEpO1xcXG5hXCIraStcIj1jZWlsKC1hXCIraStcIi9kKVxcXG59ZWxzZXtcXFxuYVwiK2krXCI9Y2VpbChhXCIraStcIi9kKVxcXG59XFxcbmJcIitpK1wiKj1kXFxcbn1cIilcbiAgfVxuICBjb2RlLnB1c2goXCJyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIih0aGlzLmRhdGEsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwiYVwiICsgaVxuICAgIH0pLmpvaW4oXCIsXCIpK1wiLFwiK1xuICAgIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImJcIiArIGlcbiAgICB9KS5qb2luKFwiLFwiKStcIixjKX1cIilcblxuICAvL3ZpZXcudHJhbnNwb3NlKCk6XG4gIHZhciB0U2hhcGUgPSBuZXcgQXJyYXkoZGltZW5zaW9uKVxuICB2YXIgdFN0cmlkZSA9IG5ldyBBcnJheShkaW1lbnNpb24pXG4gIGZvcih2YXIgaT0wOyBpPGRpbWVuc2lvbjsgKytpKSB7XG4gICAgdFNoYXBlW2ldID0gXCJhW2lcIitpK1wiXVwiXG4gICAgdFN0cmlkZVtpXSA9IFwiYltpXCIraStcIl1cIlxuICB9XG4gIGNvZGUucHVzaChcInByb3RvLnRyYW5zcG9zZT1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfdHJhbnNwb3NlKFwiK2FyZ3MrXCIpe1wiK1xuICAgIGFyZ3MubWFwKGZ1bmN0aW9uKG4saWR4KSB7IHJldHVybiBuICsgXCI9KFwiICsgbiArIFwiPT09dW5kZWZpbmVkP1wiICsgaWR4ICsgXCI6XCIgKyBuICsgXCJ8MClcIn0pLmpvaW4oXCI7XCIpLFxuICAgIFwidmFyIGE9dGhpcy5zaGFwZSxiPXRoaXMuc3RyaWRlO3JldHVybiBuZXcgXCIrY2xhc3NOYW1lK1wiKHRoaXMuZGF0YSxcIit0U2hhcGUuam9pbihcIixcIikrXCIsXCIrdFN0cmlkZS5qb2luKFwiLFwiKStcIix0aGlzLm9mZnNldCl9XCIpXG5cbiAgLy92aWV3LnBpY2soKTpcbiAgY29kZS5wdXNoKFwicHJvdG8ucGljaz1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfcGljayhcIithcmdzK1wiKXt2YXIgYT1bXSxiPVtdLGM9dGhpcy5vZmZzZXRcIilcbiAgZm9yKHZhciBpPTA7IGk8ZGltZW5zaW9uOyArK2kpIHtcbiAgICBjb2RlLnB1c2goXCJpZih0eXBlb2YgaVwiK2krXCI9PT0nbnVtYmVyJyYmaVwiK2krXCI+PTApe2M9KGMrdGhpcy5zdHJpZGVbXCIraStcIl0qaVwiK2krXCIpfDB9ZWxzZXthLnB1c2godGhpcy5zaGFwZVtcIitpK1wiXSk7Yi5wdXNoKHRoaXMuc3RyaWRlW1wiK2krXCJdKX1cIilcbiAgfVxuICBjb2RlLnB1c2goXCJ2YXIgY3Rvcj1DVE9SX0xJU1RbYS5sZW5ndGgrMV07cmV0dXJuIGN0b3IodGhpcy5kYXRhLGEsYixjKX1cIilcblxuICAvL0FkZCByZXR1cm4gc3RhdGVtZW50XG4gIGNvZGUucHVzaChcInJldHVybiBmdW5jdGlvbiBjb25zdHJ1Y3RfXCIrY2xhc3NOYW1lK1wiKGRhdGEsc2hhcGUsc3RyaWRlLG9mZnNldCl7cmV0dXJuIG5ldyBcIitjbGFzc05hbWUrXCIoZGF0YSxcIitcbiAgICBpbmRpY2VzLm1hcChmdW5jdGlvbihpKSB7XG4gICAgICByZXR1cm4gXCJzaGFwZVtcIitpK1wiXVwiXG4gICAgfSkuam9pbihcIixcIikrXCIsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwic3RyaWRlW1wiK2krXCJdXCJcbiAgICB9KS5qb2luKFwiLFwiKStcIixvZmZzZXQpfVwiKVxuXG4gIC8vQ29tcGlsZSBwcm9jZWR1cmVcbiAgdmFyIHByb2NlZHVyZSA9IG5ldyBGdW5jdGlvbihcIkNUT1JfTElTVFwiLCBcIk9SREVSXCIsIGNvZGUuam9pbihcIlxcblwiKSlcbiAgcmV0dXJuIHByb2NlZHVyZShDQUNIRURfQ09OU1RSVUNUT1JTW2R0eXBlXSwgb3JkZXIpXG59XG5cbmZ1bmN0aW9uIGFycmF5RFR5cGUoZGF0YSkge1xuICBpZihpc0J1ZmZlcihkYXRhKSkge1xuICAgIHJldHVybiBcImJ1ZmZlclwiXG4gIH1cbiAgaWYoaGFzVHlwZWRBcnJheXMpIHtcbiAgICBzd2l0Y2goT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpKSB7XG4gICAgICBjYXNlIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6XG4gICAgICAgIHJldHVybiBcImZsb2F0NjRcIlxuICAgICAgY2FzZSBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJmbG9hdDMyXCJcbiAgICAgIGNhc2UgXCJbb2JqZWN0IEludDhBcnJheV1cIjpcbiAgICAgICAgcmV0dXJuIFwiaW50OFwiXG4gICAgICBjYXNlIFwiW29iamVjdCBJbnQxNkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJpbnQxNlwiXG4gICAgICBjYXNlIFwiW29iamVjdCBJbnQzMkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJpbnQzMlwiXG4gICAgICBjYXNlIFwiW29iamVjdCBVaW50OEFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJ1aW50OFwiXG4gICAgICBjYXNlIFwiW29iamVjdCBVaW50MTZBcnJheV1cIjpcbiAgICAgICAgcmV0dXJuIFwidWludDE2XCJcbiAgICAgIGNhc2UgXCJbb2JqZWN0IFVpbnQzMkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJ1aW50MzJcIlxuICAgICAgY2FzZSBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6XG4gICAgICAgIHJldHVybiBcInVpbnQ4X2NsYW1wZWRcIlxuICAgIH1cbiAgfVxuICBpZihBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgcmV0dXJuIFwiYXJyYXlcIlxuICB9XG4gIHJldHVybiBcImdlbmVyaWNcIlxufVxuXG52YXIgQ0FDSEVEX0NPTlNUUlVDVE9SUyA9IHtcbiAgXCJmbG9hdDMyXCI6W10sXG4gIFwiZmxvYXQ2NFwiOltdLFxuICBcImludDhcIjpbXSxcbiAgXCJpbnQxNlwiOltdLFxuICBcImludDMyXCI6W10sXG4gIFwidWludDhcIjpbXSxcbiAgXCJ1aW50MTZcIjpbXSxcbiAgXCJ1aW50MzJcIjpbXSxcbiAgXCJhcnJheVwiOltdLFxuICBcInVpbnQ4X2NsYW1wZWRcIjpbXSxcbiAgXCJidWZmZXJcIjpbXSxcbiAgXCJnZW5lcmljXCI6W11cbn1cblxuOyhmdW5jdGlvbigpIHtcbiAgZm9yKHZhciBpZCBpbiBDQUNIRURfQ09OU1RSVUNUT1JTKSB7XG4gICAgQ0FDSEVEX0NPTlNUUlVDVE9SU1tpZF0ucHVzaChjb21waWxlQ29uc3RydWN0b3IoaWQsIC0xKSlcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHdyYXBwZWROREFycmF5Q3RvcihkYXRhLCBzaGFwZSwgc3RyaWRlLCBvZmZzZXQpIHtcbiAgaWYoZGF0YSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdmFyIGN0b3IgPSBDQUNIRURfQ09OU1RSVUNUT1JTLmFycmF5WzBdXG4gICAgcmV0dXJuIGN0b3IoW10pXG4gIH0gZWxzZSBpZih0eXBlb2YgZGF0YSA9PT0gXCJudW1iZXJcIikge1xuICAgIGRhdGEgPSBbZGF0YV1cbiAgfVxuICBpZihzaGFwZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgc2hhcGUgPSBbIGRhdGEubGVuZ3RoIF1cbiAgfVxuICB2YXIgZCA9IHNoYXBlLmxlbmd0aFxuICBpZihzdHJpZGUgPT09IHVuZGVmaW5lZCkge1xuICAgIHN0cmlkZSA9IG5ldyBBcnJheShkKVxuICAgIGZvcih2YXIgaT1kLTEsIHN6PTE7IGk+PTA7IC0taSkge1xuICAgICAgc3RyaWRlW2ldID0gc3pcbiAgICAgIHN6ICo9IHNoYXBlW2ldXG4gICAgfVxuICB9XG4gIGlmKG9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgb2Zmc2V0ID0gMFxuICAgIGZvcih2YXIgaT0wOyBpPGQ7ICsraSkge1xuICAgICAgaWYoc3RyaWRlW2ldIDwgMCkge1xuICAgICAgICBvZmZzZXQgLT0gKHNoYXBlW2ldLTEpKnN0cmlkZVtpXVxuICAgICAgfVxuICAgIH1cbiAgfVxuICB2YXIgZHR5cGUgPSBhcnJheURUeXBlKGRhdGEpXG4gIHZhciBjdG9yX2xpc3QgPSBDQUNIRURfQ09OU1RSVUNUT1JTW2R0eXBlXVxuICB3aGlsZShjdG9yX2xpc3QubGVuZ3RoIDw9IGQrMSkge1xuICAgIGN0b3JfbGlzdC5wdXNoKGNvbXBpbGVDb25zdHJ1Y3RvcihkdHlwZSwgY3Rvcl9saXN0Lmxlbmd0aC0xKSlcbiAgfVxuICB2YXIgY3RvciA9IGN0b3JfbGlzdFtkKzFdXG4gIHJldHVybiBjdG9yKGRhdGEsIHNoYXBlLCBzdHJpZGUsIG9mZnNldClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB3cmFwcGVkTkRBcnJheUN0b3JcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhbk11dGF0aW9uT2JzZXJ2ZXIgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5NdXRhdGlvbk9ic2VydmVyO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIHZhciBxdWV1ZSA9IFtdO1xuXG4gICAgaWYgKGNhbk11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgdmFyIGhpZGRlbkRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHZhciBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBxdWV1ZUxpc3QgPSBxdWV1ZS5zbGljZSgpO1xuICAgICAgICAgICAgcXVldWUubGVuZ3RoID0gMDtcbiAgICAgICAgICAgIHF1ZXVlTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShoaWRkZW5EaXYsIHsgYXR0cmlidXRlczogdHJ1ZSB9KTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIGlmICghcXVldWUubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgaGlkZGVuRGl2LnNldEF0dHJpYnV0ZSgneWVzJywgJ25vJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCxCdWZmZXIpe1xuJ3VzZSBzdHJpY3QnXG5cbnZhciBiaXRzID0gcmVxdWlyZSgnYml0LXR3aWRkbGUnKVxudmFyIGR1cCA9IHJlcXVpcmUoJ2R1cCcpXG5cbi8vTGVnYWN5IHBvb2wgc3VwcG9ydFxuaWYoIWdsb2JhbC5fX1RZUEVEQVJSQVlfUE9PTCkge1xuICBnbG9iYWwuX19UWVBFREFSUkFZX1BPT0wgPSB7XG4gICAgICBVSU5UOCAgIDogZHVwKFszMiwgMF0pXG4gICAgLCBVSU5UMTYgIDogZHVwKFszMiwgMF0pXG4gICAgLCBVSU5UMzIgIDogZHVwKFszMiwgMF0pXG4gICAgLCBJTlQ4ICAgIDogZHVwKFszMiwgMF0pXG4gICAgLCBJTlQxNiAgIDogZHVwKFszMiwgMF0pXG4gICAgLCBJTlQzMiAgIDogZHVwKFszMiwgMF0pXG4gICAgLCBGTE9BVCAgIDogZHVwKFszMiwgMF0pXG4gICAgLCBET1VCTEUgIDogZHVwKFszMiwgMF0pXG4gICAgLCBEQVRBICAgIDogZHVwKFszMiwgMF0pXG4gICAgLCBVSU5UOEMgIDogZHVwKFszMiwgMF0pXG4gICAgLCBCVUZGRVIgIDogZHVwKFszMiwgMF0pXG4gIH1cbn1cblxudmFyIGhhc1VpbnQ4QyA9ICh0eXBlb2YgVWludDhDbGFtcGVkQXJyYXkpICE9PSAndW5kZWZpbmVkJ1xudmFyIFBPT0wgPSBnbG9iYWwuX19UWVBFREFSUkFZX1BPT0xcblxuLy9VcGdyYWRlIHBvb2xcbmlmKCFQT09MLlVJTlQ4Qykge1xuICBQT09MLlVJTlQ4QyA9IGR1cChbMzIsIDBdKVxufVxuaWYoIVBPT0wuQlVGRkVSKSB7XG4gIFBPT0wuQlVGRkVSID0gZHVwKFszMiwgMF0pXG59XG5cbi8vTmV3IHRlY2huaXF1ZTogT25seSBhbGxvY2F0ZSBmcm9tIEFycmF5QnVmZmVyVmlldyBhbmQgQnVmZmVyXG52YXIgREFUQSAgICA9IFBPT0wuREFUQVxuICAsIEJVRkZFUiAgPSBQT09MLkJVRkZFUlxuXG5leHBvcnRzLmZyZWUgPSBmdW5jdGlvbiBmcmVlKGFycmF5KSB7XG4gIGlmKEJ1ZmZlci5pc0J1ZmZlcihhcnJheSkpIHtcbiAgICBCVUZGRVJbYml0cy5sb2cyKGFycmF5Lmxlbmd0aCldLnB1c2goYXJyYXkpXG4gIH0gZWxzZSB7XG4gICAgaWYoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFycmF5KSAhPT0gJ1tvYmplY3QgQXJyYXlCdWZmZXJdJykge1xuICAgICAgYXJyYXkgPSBhcnJheS5idWZmZXJcbiAgICB9XG4gICAgaWYoIWFycmF5KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFyIG4gPSBhcnJheS5sZW5ndGggfHwgYXJyYXkuYnl0ZUxlbmd0aFxuICAgIHZhciBsb2dfbiA9IGJpdHMubG9nMihuKXwwXG4gICAgREFUQVtsb2dfbl0ucHVzaChhcnJheSlcbiAgfVxufVxuXG5mdW5jdGlvbiBmcmVlQXJyYXlCdWZmZXIoYnVmZmVyKSB7XG4gIGlmKCFidWZmZXIpIHtcbiAgICByZXR1cm5cbiAgfVxuICB2YXIgbiA9IGJ1ZmZlci5sZW5ndGggfHwgYnVmZmVyLmJ5dGVMZW5ndGhcbiAgdmFyIGxvZ19uID0gYml0cy5sb2cyKG4pXG4gIERBVEFbbG9nX25dLnB1c2goYnVmZmVyKVxufVxuXG5mdW5jdGlvbiBmcmVlVHlwZWRBcnJheShhcnJheSkge1xuICBmcmVlQXJyYXlCdWZmZXIoYXJyYXkuYnVmZmVyKVxufVxuXG5leHBvcnRzLmZyZWVVaW50OCA9XG5leHBvcnRzLmZyZWVVaW50MTYgPVxuZXhwb3J0cy5mcmVlVWludDMyID1cbmV4cG9ydHMuZnJlZUludDggPVxuZXhwb3J0cy5mcmVlSW50MTYgPVxuZXhwb3J0cy5mcmVlSW50MzIgPVxuZXhwb3J0cy5mcmVlRmxvYXQzMiA9IFxuZXhwb3J0cy5mcmVlRmxvYXQgPVxuZXhwb3J0cy5mcmVlRmxvYXQ2NCA9IFxuZXhwb3J0cy5mcmVlRG91YmxlID0gXG5leHBvcnRzLmZyZWVVaW50OENsYW1wZWQgPSBcbmV4cG9ydHMuZnJlZURhdGFWaWV3ID0gZnJlZVR5cGVkQXJyYXlcblxuZXhwb3J0cy5mcmVlQXJyYXlCdWZmZXIgPSBmcmVlQXJyYXlCdWZmZXJcblxuZXhwb3J0cy5mcmVlQnVmZmVyID0gZnVuY3Rpb24gZnJlZUJ1ZmZlcihhcnJheSkge1xuICBCVUZGRVJbYml0cy5sb2cyKGFycmF5Lmxlbmd0aCldLnB1c2goYXJyYXkpXG59XG5cbmV4cG9ydHMubWFsbG9jID0gZnVuY3Rpb24gbWFsbG9jKG4sIGR0eXBlKSB7XG4gIGlmKGR0eXBlID09PSB1bmRlZmluZWQgfHwgZHR5cGUgPT09ICdhcnJheWJ1ZmZlcicpIHtcbiAgICByZXR1cm4gbWFsbG9jQXJyYXlCdWZmZXIobilcbiAgfSBlbHNlIHtcbiAgICBzd2l0Y2goZHR5cGUpIHtcbiAgICAgIGNhc2UgJ3VpbnQ4JzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY1VpbnQ4KG4pXG4gICAgICBjYXNlICd1aW50MTYnOlxuICAgICAgICByZXR1cm4gbWFsbG9jVWludDE2KG4pXG4gICAgICBjYXNlICd1aW50MzInOlxuICAgICAgICByZXR1cm4gbWFsbG9jVWludDMyKG4pXG4gICAgICBjYXNlICdpbnQ4JzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY0ludDgobilcbiAgICAgIGNhc2UgJ2ludDE2JzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY0ludDE2KG4pXG4gICAgICBjYXNlICdpbnQzMic6XG4gICAgICAgIHJldHVybiBtYWxsb2NJbnQzMihuKVxuICAgICAgY2FzZSAnZmxvYXQnOlxuICAgICAgY2FzZSAnZmxvYXQzMic6XG4gICAgICAgIHJldHVybiBtYWxsb2NGbG9hdChuKVxuICAgICAgY2FzZSAnZG91YmxlJzpcbiAgICAgIGNhc2UgJ2Zsb2F0NjQnOlxuICAgICAgICByZXR1cm4gbWFsbG9jRG91YmxlKG4pXG4gICAgICBjYXNlICd1aW50OF9jbGFtcGVkJzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY1VpbnQ4Q2xhbXBlZChuKVxuICAgICAgY2FzZSAnYnVmZmVyJzpcbiAgICAgICAgcmV0dXJuIG1hbGxvY0J1ZmZlcihuKVxuICAgICAgY2FzZSAnZGF0YSc6XG4gICAgICBjYXNlICdkYXRhdmlldyc6XG4gICAgICAgIHJldHVybiBtYWxsb2NEYXRhVmlldyhuKVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbFxufVxuXG5mdW5jdGlvbiBtYWxsb2NBcnJheUJ1ZmZlcihuKSB7XG4gIHZhciBuID0gYml0cy5uZXh0UG93MihuKVxuICB2YXIgbG9nX24gPSBiaXRzLmxvZzIobilcbiAgdmFyIGQgPSBEQVRBW2xvZ19uXVxuICBpZihkLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZC5wb3AoKVxuICB9XG4gIHJldHVybiBuZXcgQXJyYXlCdWZmZXIobilcbn1cbmV4cG9ydHMubWFsbG9jQXJyYXlCdWZmZXIgPSBtYWxsb2NBcnJheUJ1ZmZlclxuXG5mdW5jdGlvbiBtYWxsb2NVaW50OChuKSB7XG4gIHJldHVybiBuZXcgVWludDhBcnJheShtYWxsb2NBcnJheUJ1ZmZlcihuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jVWludDggPSBtYWxsb2NVaW50OFxuXG5mdW5jdGlvbiBtYWxsb2NVaW50MTYobikge1xuICByZXR1cm4gbmV3IFVpbnQxNkFycmF5KG1hbGxvY0FycmF5QnVmZmVyKDIqbiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY1VpbnQxNiA9IG1hbGxvY1VpbnQxNlxuXG5mdW5jdGlvbiBtYWxsb2NVaW50MzIobikge1xuICByZXR1cm4gbmV3IFVpbnQzMkFycmF5KG1hbGxvY0FycmF5QnVmZmVyKDQqbiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY1VpbnQzMiA9IG1hbGxvY1VpbnQzMlxuXG5mdW5jdGlvbiBtYWxsb2NJbnQ4KG4pIHtcbiAgcmV0dXJuIG5ldyBJbnQ4QXJyYXkobWFsbG9jQXJyYXlCdWZmZXIobiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY0ludDggPSBtYWxsb2NJbnQ4XG5cbmZ1bmN0aW9uIG1hbGxvY0ludDE2KG4pIHtcbiAgcmV0dXJuIG5ldyBJbnQxNkFycmF5KG1hbGxvY0FycmF5QnVmZmVyKDIqbiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY0ludDE2ID0gbWFsbG9jSW50MTZcblxuZnVuY3Rpb24gbWFsbG9jSW50MzIobikge1xuICByZXR1cm4gbmV3IEludDMyQXJyYXkobWFsbG9jQXJyYXlCdWZmZXIoNCpuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jSW50MzIgPSBtYWxsb2NJbnQzMlxuXG5mdW5jdGlvbiBtYWxsb2NGbG9hdChuKSB7XG4gIHJldHVybiBuZXcgRmxvYXQzMkFycmF5KG1hbGxvY0FycmF5QnVmZmVyKDQqbiksIDAsIG4pXG59XG5leHBvcnRzLm1hbGxvY0Zsb2F0MzIgPSBleHBvcnRzLm1hbGxvY0Zsb2F0ID0gbWFsbG9jRmxvYXRcblxuZnVuY3Rpb24gbWFsbG9jRG91YmxlKG4pIHtcbiAgcmV0dXJuIG5ldyBGbG9hdDY0QXJyYXkobWFsbG9jQXJyYXlCdWZmZXIoOCpuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jRmxvYXQ2NCA9IGV4cG9ydHMubWFsbG9jRG91YmxlID0gbWFsbG9jRG91YmxlXG5cbmZ1bmN0aW9uIG1hbGxvY1VpbnQ4Q2xhbXBlZChuKSB7XG4gIGlmKGhhc1VpbnQ4Qykge1xuICAgIHJldHVybiBuZXcgVWludDhDbGFtcGVkQXJyYXkobWFsbG9jQXJyYXlCdWZmZXIobiksIDAsIG4pXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG1hbGxvY1VpbnQ4KG4pXG4gIH1cbn1cbmV4cG9ydHMubWFsbG9jVWludDhDbGFtcGVkID0gbWFsbG9jVWludDhDbGFtcGVkXG5cbmZ1bmN0aW9uIG1hbGxvY0RhdGFWaWV3KG4pIHtcbiAgcmV0dXJuIG5ldyBEYXRhVmlldyhtYWxsb2NBcnJheUJ1ZmZlcihuKSwgMCwgbilcbn1cbmV4cG9ydHMubWFsbG9jRGF0YVZpZXcgPSBtYWxsb2NEYXRhVmlld1xuXG5mdW5jdGlvbiBtYWxsb2NCdWZmZXIobikge1xuICBuID0gYml0cy5uZXh0UG93MihuKVxuICB2YXIgbG9nX24gPSBiaXRzLmxvZzIobilcbiAgdmFyIGNhY2hlID0gQlVGRkVSW2xvZ19uXVxuICBpZihjYWNoZS5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGNhY2hlLnBvcCgpXG4gIH1cbiAgcmV0dXJuIG5ldyBCdWZmZXIobilcbn1cbmV4cG9ydHMubWFsbG9jQnVmZmVyID0gbWFsbG9jQnVmZmVyXG5cbmV4cG9ydHMuY2xlYXJDYWNoZSA9IGZ1bmN0aW9uIGNsZWFyQ2FjaGUoKSB7XG4gIGZvcih2YXIgaT0wOyBpPDMyOyArK2kpIHtcbiAgICBQT09MLlVJTlQ4W2ldLmxlbmd0aCA9IDBcbiAgICBQT09MLlVJTlQxNltpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5VSU5UMzJbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuSU5UOFtpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5JTlQxNltpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5JTlQzMltpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5GTE9BVFtpXS5sZW5ndGggPSAwXG4gICAgUE9PTC5ET1VCTEVbaV0ubGVuZ3RoID0gMFxuICAgIFBPT0wuVUlOVDhDW2ldLmxlbmd0aCA9IDBcbiAgICBEQVRBW2ldLmxlbmd0aCA9IDBcbiAgICBCVUZGRVJbaV0ubGVuZ3RoID0gMFxuICB9XG59XG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcilcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb24vanNvbjtjaGFyc2V0OnV0Zi04O2Jhc2U2NCxleUoyWlhKemFXOXVJam96TENKemIzVnlZMlZ6SWpwYkltNXZaR1ZmYlc5a2RXeGxjeTkwZVhCbFpHRnljbUY1TFhCdmIyd3ZjRzl2YkM1cWN5SmRMQ0p1WVcxbGN5STZXMTBzSW0xaGNIQnBibWR6SWpvaU8wRkJRVUU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFaUxDSm1hV3hsSWpvaVoyVnVaWEpoZEdWa0xtcHpJaXdpYzI5MWNtTmxVbTl2ZENJNklpSXNJbk52ZFhKalpYTkRiMjUwWlc1MElqcGJJaWQxYzJVZ2MzUnlhV04wSjF4dVhHNTJZWElnWW1sMGN5QTlJSEpsY1hWcGNtVW9KMkpwZEMxMGQybGtaR3hsSnlsY2JuWmhjaUJrZFhBZ1BTQnlaWEYxYVhKbEtDZGtkWEFuS1Z4dVhHNHZMMHhsWjJGamVTQndiMjlzSUhOMWNIQnZjblJjYm1sbUtDRm5iRzlpWVd3dVgxOVVXVkJGUkVGU1VrRlpYMUJQVDB3cElIdGNiaUFnWjJ4dlltRnNMbDlmVkZsUVJVUkJVbEpCV1Y5UVQwOU1JRDBnZTF4dUlDQWdJQ0FnVlVsT1ZEZ2dJQ0E2SUdSMWNDaGJNeklzSURCZEtWeHVJQ0FnSUN3Z1ZVbE9WREUySUNBNklHUjFjQ2hiTXpJc0lEQmRLVnh1SUNBZ0lDd2dWVWxPVkRNeUlDQTZJR1IxY0NoYk16SXNJREJkS1Z4dUlDQWdJQ3dnU1U1VU9DQWdJQ0E2SUdSMWNDaGJNeklzSURCZEtWeHVJQ0FnSUN3Z1NVNVVNVFlnSUNBNklHUjFjQ2hiTXpJc0lEQmRLVnh1SUNBZ0lDd2dTVTVVTXpJZ0lDQTZJR1IxY0NoYk16SXNJREJkS1Z4dUlDQWdJQ3dnUmt4UFFWUWdJQ0E2SUdSMWNDaGJNeklzSURCZEtWeHVJQ0FnSUN3Z1JFOVZRa3hGSUNBNklHUjFjQ2hiTXpJc0lEQmRLVnh1SUNBZ0lDd2dSRUZVUVNBZ0lDQTZJR1IxY0NoYk16SXNJREJkS1Z4dUlDQWdJQ3dnVlVsT1ZEaERJQ0E2SUdSMWNDaGJNeklzSURCZEtWeHVJQ0FnSUN3Z1FsVkdSa1ZTSUNBNklHUjFjQ2hiTXpJc0lEQmRLVnh1SUNCOVhHNTlYRzVjYm5aaGNpQm9ZWE5WYVc1ME9FTWdQU0FvZEhsd1pXOW1JRlZwYm5RNFEyeGhiWEJsWkVGeWNtRjVLU0FoUFQwZ0ozVnVaR1ZtYVc1bFpDZGNiblpoY2lCUVQwOU1JRDBnWjJ4dlltRnNMbDlmVkZsUVJVUkJVbEpCV1Y5UVQwOU1YRzVjYmk4dlZYQm5jbUZrWlNCd2IyOXNYRzVwWmlnaFVFOVBUQzVWU1U1VU9FTXBJSHRjYmlBZ1VFOVBUQzVWU1U1VU9FTWdQU0JrZFhBb1d6TXlMQ0F3WFNsY2JuMWNibWxtS0NGUVQwOU1Ma0pWUmtaRlVpa2dlMXh1SUNCUVQwOU1Ma0pWUmtaRlVpQTlJR1IxY0NoYk16SXNJREJkS1Z4dWZWeHVYRzR2TDA1bGR5QjBaV05vYm1seGRXVTZJRTl1YkhrZ1lXeHNiMk5oZEdVZ1puSnZiU0JCY25KaGVVSjFabVpsY2xacFpYY2dZVzVrSUVKMVptWmxjbHh1ZG1GeUlFUkJWRUVnSUNBZ1BTQlFUMDlNTGtSQlZFRmNiaUFnTENCQ1ZVWkdSVklnSUQwZ1VFOVBUQzVDVlVaR1JWSmNibHh1Wlhod2IzSjBjeTVtY21WbElEMGdablZ1WTNScGIyNGdabkpsWlNoaGNuSmhlU2tnZTF4dUlDQnBaaWhDZFdabVpYSXVhWE5DZFdabVpYSW9ZWEp5WVhrcEtTQjdYRzRnSUNBZ1FsVkdSa1ZTVzJKcGRITXViRzluTWloaGNuSmhlUzVzWlc1bmRHZ3BYUzV3ZFhOb0tHRnljbUY1S1Z4dUlDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUdsbUtFOWlhbVZqZEM1d2NtOTBiM1I1Y0dVdWRHOVRkSEpwYm1jdVkyRnNiQ2hoY25KaGVTa2dJVDA5SUNkYmIySnFaV04wSUVGeWNtRjVRblZtWm1WeVhTY3BJSHRjYmlBZ0lDQWdJR0Z5Y21GNUlEMGdZWEp5WVhrdVluVm1abVZ5WEc0Z0lDQWdmVnh1SUNBZ0lHbG1LQ0ZoY25KaGVTa2dlMXh1SUNBZ0lDQWdjbVYwZFhKdVhHNGdJQ0FnZlZ4dUlDQWdJSFpoY2lCdUlEMGdZWEp5WVhrdWJHVnVaM1JvSUh4OElHRnljbUY1TG1KNWRHVk1aVzVuZEdoY2JpQWdJQ0IyWVhJZ2JHOW5YMjRnUFNCaWFYUnpMbXh2WnpJb2JpbDhNRnh1SUNBZ0lFUkJWRUZiYkc5blgyNWRMbkIxYzJnb1lYSnlZWGtwWEc0Z0lIMWNibjFjYmx4dVpuVnVZM1JwYjI0Z1puSmxaVUZ5Y21GNVFuVm1abVZ5S0dKMVptWmxjaWtnZTF4dUlDQnBaaWdoWW5WbVptVnlLU0I3WEc0Z0lDQWdjbVYwZFhKdVhHNGdJSDFjYmlBZ2RtRnlJRzRnUFNCaWRXWm1aWEl1YkdWdVozUm9JSHg4SUdKMVptWmxjaTVpZVhSbFRHVnVaM1JvWEc0Z0lIWmhjaUJzYjJkZmJpQTlJR0pwZEhNdWJHOW5NaWh1S1Z4dUlDQkVRVlJCVzJ4dloxOXVYUzV3ZFhOb0tHSjFabVpsY2lsY2JuMWNibHh1Wm5WdVkzUnBiMjRnWm5KbFpWUjVjR1ZrUVhKeVlYa29ZWEp5WVhrcElIdGNiaUFnWm5KbFpVRnljbUY1UW5WbVptVnlLR0Z5Y21GNUxtSjFabVpsY2lsY2JuMWNibHh1Wlhod2IzSjBjeTVtY21WbFZXbHVkRGdnUFZ4dVpYaHdiM0owY3k1bWNtVmxWV2x1ZERFMklEMWNibVY0Y0c5eWRITXVabkpsWlZWcGJuUXpNaUE5WEc1bGVIQnZjblJ6TG1aeVpXVkpiblE0SUQxY2JtVjRjRzl5ZEhNdVpuSmxaVWx1ZERFMklEMWNibVY0Y0c5eWRITXVabkpsWlVsdWRETXlJRDFjYm1WNGNHOXlkSE11Wm5KbFpVWnNiMkYwTXpJZ1BTQmNibVY0Y0c5eWRITXVabkpsWlVac2IyRjBJRDFjYm1WNGNHOXlkSE11Wm5KbFpVWnNiMkYwTmpRZ1BTQmNibVY0Y0c5eWRITXVabkpsWlVSdmRXSnNaU0E5SUZ4dVpYaHdiM0owY3k1bWNtVmxWV2x1ZERoRGJHRnRjR1ZrSUQwZ1hHNWxlSEJ2Y25SekxtWnlaV1ZFWVhSaFZtbGxkeUE5SUdaeVpXVlVlWEJsWkVGeWNtRjVYRzVjYm1WNGNHOXlkSE11Wm5KbFpVRnljbUY1UW5WbVptVnlJRDBnWm5KbFpVRnljbUY1UW5WbVptVnlYRzVjYm1WNGNHOXlkSE11Wm5KbFpVSjFabVpsY2lBOUlHWjFibU4wYVc5dUlHWnlaV1ZDZFdabVpYSW9ZWEp5WVhrcElIdGNiaUFnUWxWR1JrVlNXMkpwZEhNdWJHOW5NaWhoY25KaGVTNXNaVzVuZEdncFhTNXdkWE5vS0dGeWNtRjVLVnh1ZlZ4dVhHNWxlSEJ2Y25SekxtMWhiR3h2WXlBOUlHWjFibU4wYVc5dUlHMWhiR3h2WXlodUxDQmtkSGx3WlNrZ2UxeHVJQ0JwWmloa2RIbHdaU0E5UFQwZ2RXNWtaV1pwYm1Wa0lIeDhJR1IwZVhCbElEMDlQU0FuWVhKeVlYbGlkV1ptWlhJbktTQjdYRzRnSUNBZ2NtVjBkWEp1SUcxaGJHeHZZMEZ5Y21GNVFuVm1abVZ5S0c0cFhHNGdJSDBnWld4elpTQjdYRzRnSUNBZ2MzZHBkR05vS0dSMGVYQmxLU0I3WEc0Z0lDQWdJQ0JqWVhObElDZDFhVzUwT0NjNlhHNGdJQ0FnSUNBZ0lISmxkSFZ5YmlCdFlXeHNiMk5WYVc1ME9DaHVLVnh1SUNBZ0lDQWdZMkZ6WlNBbmRXbHVkREUySnpwY2JpQWdJQ0FnSUNBZ2NtVjBkWEp1SUcxaGJHeHZZMVZwYm5ReE5paHVLVnh1SUNBZ0lDQWdZMkZ6WlNBbmRXbHVkRE15SnpwY2JpQWdJQ0FnSUNBZ2NtVjBkWEp1SUcxaGJHeHZZMVZwYm5Rek1paHVLVnh1SUNBZ0lDQWdZMkZ6WlNBbmFXNTBPQ2M2WEc0Z0lDQWdJQ0FnSUhKbGRIVnliaUJ0WVd4c2IyTkpiblE0S0c0cFhHNGdJQ0FnSUNCallYTmxJQ2RwYm5ReE5pYzZYRzRnSUNBZ0lDQWdJSEpsZEhWeWJpQnRZV3hzYjJOSmJuUXhOaWh1S1Z4dUlDQWdJQ0FnWTJGelpTQW5hVzUwTXpJbk9seHVJQ0FnSUNBZ0lDQnlaWFIxY200Z2JXRnNiRzlqU1c1ME16SW9iaWxjYmlBZ0lDQWdJR05oYzJVZ0oyWnNiMkYwSnpwY2JpQWdJQ0FnSUdOaGMyVWdKMlpzYjJGME16SW5PbHh1SUNBZ0lDQWdJQ0J5WlhSMWNtNGdiV0ZzYkc5alJteHZZWFFvYmlsY2JpQWdJQ0FnSUdOaGMyVWdKMlJ2ZFdKc1pTYzZYRzRnSUNBZ0lDQmpZWE5sSUNkbWJHOWhkRFkwSnpwY2JpQWdJQ0FnSUNBZ2NtVjBkWEp1SUcxaGJHeHZZMFJ2ZFdKc1pTaHVLVnh1SUNBZ0lDQWdZMkZ6WlNBbmRXbHVkRGhmWTJ4aGJYQmxaQ2M2WEc0Z0lDQWdJQ0FnSUhKbGRIVnliaUJ0WVd4c2IyTlZhVzUwT0VOc1lXMXdaV1FvYmlsY2JpQWdJQ0FnSUdOaGMyVWdKMkoxWm1abGNpYzZYRzRnSUNBZ0lDQWdJSEpsZEhWeWJpQnRZV3hzYjJOQ2RXWm1aWElvYmlsY2JpQWdJQ0FnSUdOaGMyVWdKMlJoZEdFbk9seHVJQ0FnSUNBZ1kyRnpaU0FuWkdGMFlYWnBaWGNuT2x4dUlDQWdJQ0FnSUNCeVpYUjFjbTRnYldGc2JHOWpSR0YwWVZacFpYY29iaWxjYmx4dUlDQWdJQ0FnWkdWbVlYVnNkRHBjYmlBZ0lDQWdJQ0FnY21WMGRYSnVJRzUxYkd4Y2JpQWdJQ0I5WEc0Z0lIMWNiaUFnY21WMGRYSnVJRzUxYkd4Y2JuMWNibHh1Wm5WdVkzUnBiMjRnYldGc2JHOWpRWEp5WVhsQ2RXWm1aWElvYmlrZ2UxeHVJQ0IyWVhJZ2JpQTlJR0pwZEhNdWJtVjRkRkJ2ZHpJb2JpbGNiaUFnZG1GeUlHeHZaMTl1SUQwZ1ltbDBjeTVzYjJjeUtHNHBYRzRnSUhaaGNpQmtJRDBnUkVGVVFWdHNiMmRmYmwxY2JpQWdhV1lvWkM1c1pXNW5kR2dnUGlBd0tTQjdYRzRnSUNBZ2NtVjBkWEp1SUdRdWNHOXdLQ2xjYmlBZ2ZWeHVJQ0J5WlhSMWNtNGdibVYzSUVGeWNtRjVRblZtWm1WeUtHNHBYRzU5WEc1bGVIQnZjblJ6TG0xaGJHeHZZMEZ5Y21GNVFuVm1abVZ5SUQwZ2JXRnNiRzlqUVhKeVlYbENkV1ptWlhKY2JseHVablZ1WTNScGIyNGdiV0ZzYkc5alZXbHVkRGdvYmlrZ2UxeHVJQ0J5WlhSMWNtNGdibVYzSUZWcGJuUTRRWEp5WVhrb2JXRnNiRzlqUVhKeVlYbENkV1ptWlhJb2Jpa3NJREFzSUc0cFhHNTlYRzVsZUhCdmNuUnpMbTFoYkd4dlkxVnBiblE0SUQwZ2JXRnNiRzlqVldsdWREaGNibHh1Wm5WdVkzUnBiMjRnYldGc2JHOWpWV2x1ZERFMktHNHBJSHRjYmlBZ2NtVjBkWEp1SUc1bGR5QlZhVzUwTVRaQmNuSmhlU2h0WVd4c2IyTkJjbkpoZVVKMVptWmxjaWd5S200cExDQXdMQ0J1S1Z4dWZWeHVaWGh3YjNKMGN5NXRZV3hzYjJOVmFXNTBNVFlnUFNCdFlXeHNiMk5WYVc1ME1UWmNibHh1Wm5WdVkzUnBiMjRnYldGc2JHOWpWV2x1ZERNeUtHNHBJSHRjYmlBZ2NtVjBkWEp1SUc1bGR5QlZhVzUwTXpKQmNuSmhlU2h0WVd4c2IyTkJjbkpoZVVKMVptWmxjaWcwS200cExDQXdMQ0J1S1Z4dWZWeHVaWGh3YjNKMGN5NXRZV3hzYjJOVmFXNTBNeklnUFNCdFlXeHNiMk5WYVc1ME16SmNibHh1Wm5WdVkzUnBiMjRnYldGc2JHOWpTVzUwT0NodUtTQjdYRzRnSUhKbGRIVnliaUJ1WlhjZ1NXNTBPRUZ5Y21GNUtHMWhiR3h2WTBGeWNtRjVRblZtWm1WeUtHNHBMQ0F3TENCdUtWeHVmVnh1Wlhod2IzSjBjeTV0WVd4c2IyTkpiblE0SUQwZ2JXRnNiRzlqU1c1ME9GeHVYRzVtZFc1amRHbHZiaUJ0WVd4c2IyTkpiblF4TmlodUtTQjdYRzRnSUhKbGRIVnliaUJ1WlhjZ1NXNTBNVFpCY25KaGVTaHRZV3hzYjJOQmNuSmhlVUoxWm1abGNpZ3lLbTRwTENBd0xDQnVLVnh1ZlZ4dVpYaHdiM0owY3k1dFlXeHNiMk5KYm5ReE5pQTlJRzFoYkd4dlkwbHVkREUyWEc1Y2JtWjFibU4wYVc5dUlHMWhiR3h2WTBsdWRETXlLRzRwSUh0Y2JpQWdjbVYwZFhKdUlHNWxkeUJKYm5Rek1rRnljbUY1S0cxaGJHeHZZMEZ5Y21GNVFuVm1abVZ5S0RRcWJpa3NJREFzSUc0cFhHNTlYRzVsZUhCdmNuUnpMbTFoYkd4dlkwbHVkRE15SUQwZ2JXRnNiRzlqU1c1ME16SmNibHh1Wm5WdVkzUnBiMjRnYldGc2JHOWpSbXh2WVhRb2Jpa2dlMXh1SUNCeVpYUjFjbTRnYm1WM0lFWnNiMkYwTXpKQmNuSmhlU2h0WVd4c2IyTkJjbkpoZVVKMVptWmxjaWcwS200cExDQXdMQ0J1S1Z4dWZWeHVaWGh3YjNKMGN5NXRZV3hzYjJOR2JHOWhkRE15SUQwZ1pYaHdiM0owY3k1dFlXeHNiMk5HYkc5aGRDQTlJRzFoYkd4dlkwWnNiMkYwWEc1Y2JtWjFibU4wYVc5dUlHMWhiR3h2WTBSdmRXSnNaU2h1S1NCN1hHNGdJSEpsZEhWeWJpQnVaWGNnUm14dllYUTJORUZ5Y21GNUtHMWhiR3h2WTBGeWNtRjVRblZtWm1WeUtEZ3FiaWtzSURBc0lHNHBYRzU5WEc1bGVIQnZjblJ6TG0xaGJHeHZZMFpzYjJGME5qUWdQU0JsZUhCdmNuUnpMbTFoYkd4dlkwUnZkV0pzWlNBOUlHMWhiR3h2WTBSdmRXSnNaVnh1WEc1bWRXNWpkR2x2YmlCdFlXeHNiMk5WYVc1ME9FTnNZVzF3WldRb2Jpa2dlMXh1SUNCcFppaG9ZWE5WYVc1ME9FTXBJSHRjYmlBZ0lDQnlaWFIxY200Z2JtVjNJRlZwYm5RNFEyeGhiWEJsWkVGeWNtRjVLRzFoYkd4dlkwRnljbUY1UW5WbVptVnlLRzRwTENBd0xDQnVLVnh1SUNCOUlHVnNjMlVnZTF4dUlDQWdJSEpsZEhWeWJpQnRZV3hzYjJOVmFXNTBPQ2h1S1Z4dUlDQjlYRzU5WEc1bGVIQnZjblJ6TG0xaGJHeHZZMVZwYm5RNFEyeGhiWEJsWkNBOUlHMWhiR3h2WTFWcGJuUTRRMnhoYlhCbFpGeHVYRzVtZFc1amRHbHZiaUJ0WVd4c2IyTkVZWFJoVm1sbGR5aHVLU0I3WEc0Z0lISmxkSFZ5YmlCdVpYY2dSR0YwWVZacFpYY29iV0ZzYkc5alFYSnlZWGxDZFdabVpYSW9iaWtzSURBc0lHNHBYRzU5WEc1bGVIQnZjblJ6TG0xaGJHeHZZMFJoZEdGV2FXVjNJRDBnYldGc2JHOWpSR0YwWVZacFpYZGNibHh1Wm5WdVkzUnBiMjRnYldGc2JHOWpRblZtWm1WeUtHNHBJSHRjYmlBZ2JpQTlJR0pwZEhNdWJtVjRkRkJ2ZHpJb2JpbGNiaUFnZG1GeUlHeHZaMTl1SUQwZ1ltbDBjeTVzYjJjeUtHNHBYRzRnSUhaaGNpQmpZV05vWlNBOUlFSlZSa1pGVWx0c2IyZGZibDFjYmlBZ2FXWW9ZMkZqYUdVdWJHVnVaM1JvSUQ0Z01Da2dlMXh1SUNBZ0lISmxkSFZ5YmlCallXTm9aUzV3YjNBb0tWeHVJQ0I5WEc0Z0lISmxkSFZ5YmlCdVpYY2dRblZtWm1WeUtHNHBYRzU5WEc1bGVIQnZjblJ6TG0xaGJHeHZZMEoxWm1abGNpQTlJRzFoYkd4dlkwSjFabVpsY2x4dVhHNWxlSEJ2Y25SekxtTnNaV0Z5UTJGamFHVWdQU0JtZFc1amRHbHZiaUJqYkdWaGNrTmhZMmhsS0NrZ2UxeHVJQ0JtYjNJb2RtRnlJR2s5TURzZ2FUd3pNanNnS3l0cEtTQjdYRzRnSUNBZ1VFOVBUQzVWU1U1VU9GdHBYUzVzWlc1bmRHZ2dQU0F3WEc0Z0lDQWdVRTlQVEM1VlNVNVVNVFpiYVYwdWJHVnVaM1JvSUQwZ01GeHVJQ0FnSUZCUFQwd3VWVWxPVkRNeVcybGRMbXhsYm1kMGFDQTlJREJjYmlBZ0lDQlFUMDlNTGtsT1ZEaGJhVjB1YkdWdVozUm9JRDBnTUZ4dUlDQWdJRkJQVDB3dVNVNVVNVFpiYVYwdWJHVnVaM1JvSUQwZ01GeHVJQ0FnSUZCUFQwd3VTVTVVTXpKYmFWMHViR1Z1WjNSb0lEMGdNRnh1SUNBZ0lGQlBUMHd1Umt4UFFWUmJhVjB1YkdWdVozUm9JRDBnTUZ4dUlDQWdJRkJQVDB3dVJFOVZRa3hGVzJsZExteGxibWQwYUNBOUlEQmNiaUFnSUNCUVQwOU1MbFZKVGxRNFExdHBYUzVzWlc1bmRHZ2dQU0F3WEc0Z0lDQWdSRUZVUVZ0cFhTNXNaVzVuZEdnZ1BTQXdYRzRnSUNBZ1FsVkdSa1ZTVzJsZExteGxibWQwYUNBOUlEQmNiaUFnZlZ4dWZTSmRmUT09IiwiXCJ1c2Ugc3RyaWN0XCJcblxuZnVuY3Rpb24gdW5pcXVlX3ByZWQobGlzdCwgY29tcGFyZSkge1xuICB2YXIgcHRyID0gMVxuICAgICwgbGVuID0gbGlzdC5sZW5ndGhcbiAgICAsIGE9bGlzdFswXSwgYj1saXN0WzBdXG4gIGZvcih2YXIgaT0xOyBpPGxlbjsgKytpKSB7XG4gICAgYiA9IGFcbiAgICBhID0gbGlzdFtpXVxuICAgIGlmKGNvbXBhcmUoYSwgYikpIHtcbiAgICAgIGlmKGkgPT09IHB0cikge1xuICAgICAgICBwdHIrK1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgbGlzdFtwdHIrK10gPSBhXG4gICAgfVxuICB9XG4gIGxpc3QubGVuZ3RoID0gcHRyXG4gIHJldHVybiBsaXN0XG59XG5cbmZ1bmN0aW9uIHVuaXF1ZV9lcShsaXN0KSB7XG4gIHZhciBwdHIgPSAxXG4gICAgLCBsZW4gPSBsaXN0Lmxlbmd0aFxuICAgICwgYT1saXN0WzBdLCBiID0gbGlzdFswXVxuICBmb3IodmFyIGk9MTsgaTxsZW47ICsraSwgYj1hKSB7XG4gICAgYiA9IGFcbiAgICBhID0gbGlzdFtpXVxuICAgIGlmKGEgIT09IGIpIHtcbiAgICAgIGlmKGkgPT09IHB0cikge1xuICAgICAgICBwdHIrK1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgbGlzdFtwdHIrK10gPSBhXG4gICAgfVxuICB9XG4gIGxpc3QubGVuZ3RoID0gcHRyXG4gIHJldHVybiBsaXN0XG59XG5cbmZ1bmN0aW9uIHVuaXF1ZShsaXN0LCBjb21wYXJlLCBzb3J0ZWQpIHtcbiAgaWYobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbGlzdFxuICB9XG4gIGlmKGNvbXBhcmUpIHtcbiAgICBpZighc29ydGVkKSB7XG4gICAgICBsaXN0LnNvcnQoY29tcGFyZSlcbiAgICB9XG4gICAgcmV0dXJuIHVuaXF1ZV9wcmVkKGxpc3QsIGNvbXBhcmUpXG4gIH1cbiAgaWYoIXNvcnRlZCkge1xuICAgIGxpc3Quc29ydCgpXG4gIH1cbiAgcmV0dXJuIHVuaXF1ZV9lcShsaXN0KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHVuaXF1ZVxuIiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKCdfcHJvY2VzcycpLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJbTV2WkdWZmJXOWtkV3hsY3k5MWRHbHNMM1YwYVd3dWFuTWlYU3dpYm1GdFpYTWlPbHRkTENKdFlYQndhVzVuY3lJNklqdEJRVUZCTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRWlMQ0ptYVd4bElqb2laMlZ1WlhKaGRHVmtMbXB6SWl3aWMyOTFjbU5sVW05dmRDSTZJaUlzSW5OdmRYSmpaWE5EYjI1MFpXNTBJanBiSWk4dklFTnZjSGx5YVdkb2RDQktiM2xsYm5Rc0lFbHVZeTRnWVc1a0lHOTBhR1Z5SUU1dlpHVWdZMjl1ZEhKcFluVjBiM0p6TGx4dUx5OWNiaTh2SUZCbGNtMXBjM05wYjI0Z2FYTWdhR1Z5WldKNUlHZHlZVzUwWldRc0lHWnlaV1VnYjJZZ1kyaGhjbWRsTENCMGJ5QmhibmtnY0dWeWMyOXVJRzlpZEdGcGJtbHVaeUJoWEc0dkx5QmpiM0I1SUc5bUlIUm9hWE1nYzI5bWRIZGhjbVVnWVc1a0lHRnpjMjlqYVdGMFpXUWdaRzlqZFcxbGJuUmhkR2x2YmlCbWFXeGxjeUFvZEdobFhHNHZMeUJjSWxOdlpuUjNZWEpsWENJcExDQjBieUJrWldGc0lHbHVJSFJvWlNCVGIyWjBkMkZ5WlNCM2FYUm9iM1YwSUhKbGMzUnlhV04wYVc5dUxDQnBibU5zZFdScGJtZGNiaTh2SUhkcGRHaHZkWFFnYkdsdGFYUmhkR2x2YmlCMGFHVWdjbWxuYUhSeklIUnZJSFZ6WlN3Z1kyOXdlU3dnYlc5a2FXWjVMQ0J0WlhKblpTd2djSFZpYkdsemFDeGNiaTh2SUdScGMzUnlhV0oxZEdVc0lITjFZbXhwWTJWdWMyVXNJR0Z1WkM5dmNpQnpaV3hzSUdOdmNHbGxjeUJ2WmlCMGFHVWdVMjltZEhkaGNtVXNJR0Z1WkNCMGJ5QndaWEp0YVhSY2JpOHZJSEJsY25OdmJuTWdkRzhnZDJodmJTQjBhR1VnVTI5bWRIZGhjbVVnYVhNZ1puVnlibWx6YUdWa0lIUnZJR1J2SUhOdkxDQnpkV0pxWldOMElIUnZJSFJvWlZ4dUx5OGdabTlzYkc5M2FXNW5JR052Ym1ScGRHbHZibk02WEc0dkwxeHVMeThnVkdobElHRmliM1psSUdOdmNIbHlhV2RvZENCdWIzUnBZMlVnWVc1a0lIUm9hWE1nY0dWeWJXbHpjMmx2YmlCdWIzUnBZMlVnYzJoaGJHd2dZbVVnYVc1amJIVmtaV1JjYmk4dklHbHVJR0ZzYkNCamIzQnBaWE1nYjNJZ2MzVmljM1JoYm5ScFlXd2djRzl5ZEdsdmJuTWdiMllnZEdobElGTnZablIzWVhKbExseHVMeTljYmk4dklGUklSU0JUVDBaVVYwRlNSU0JKVXlCUVVrOVdTVVJGUkNCY0lrRlRJRWxUWENJc0lGZEpWRWhQVlZRZ1YwRlNVa0ZPVkZrZ1QwWWdRVTVaSUV0SlRrUXNJRVZZVUZKRlUxTmNiaTh2SUU5U0lFbE5VRXhKUlVRc0lFbE9RMHhWUkVsT1J5QkNWVlFnVGs5VUlFeEpUVWxVUlVRZ1ZFOGdWRWhGSUZkQlVsSkJUbFJKUlZNZ1QwWmNiaTh2SUUxRlVrTklRVTVVUVVKSlRFbFVXU3dnUmtsVVRrVlRVeUJHVDFJZ1FTQlFRVkpVU1VOVlRFRlNJRkJWVWxCUFUwVWdRVTVFSUU1UFRrbE9SbEpKVGtkRlRVVk9WQzRnU1U1Y2JpOHZJRTVQSUVWV1JVNVVJRk5JUVV4TUlGUklSU0JCVlZSSVQxSlRJRTlTSUVOUFVGbFNTVWRJVkNCSVQweEVSVkpUSUVKRklFeEpRVUpNUlNCR1QxSWdRVTVaSUVOTVFVbE5MRnh1THk4Z1JFRk5RVWRGVXlCUFVpQlBWRWhGVWlCTVNVRkNTVXhKVkZrc0lGZElSVlJJUlZJZ1NVNGdRVTRnUVVOVVNVOU9JRTlHSUVOUFRsUlNRVU5VTENCVVQxSlVJRTlTWEc0dkx5QlBWRWhGVWxkSlUwVXNJRUZTU1ZOSlRrY2dSbEpQVFN3Z1QxVlVJRTlHSUU5U0lFbE9JRU5QVGs1RlExUkpUMDRnVjBsVVNDQlVTRVVnVTA5R1ZGZEJVa1VnVDFJZ1ZFaEZYRzR2THlCVlUwVWdUMUlnVDFSSVJWSWdSRVZCVEVsT1IxTWdTVTRnVkVoRklGTlBSbFJYUVZKRkxseHVYRzUyWVhJZ1ptOXliV0YwVW1WblJYaHdJRDBnTHlWYmMyUnFKVjB2Wnp0Y2JtVjRjRzl5ZEhNdVptOXliV0YwSUQwZ1puVnVZM1JwYjI0b1ppa2dlMXh1SUNCcFppQW9JV2x6VTNSeWFXNW5LR1lwS1NCN1hHNGdJQ0FnZG1GeUlHOWlhbVZqZEhNZ1BTQmJYVHRjYmlBZ0lDQm1iM0lnS0haaGNpQnBJRDBnTURzZ2FTQThJR0Z5WjNWdFpXNTBjeTVzWlc1bmRHZzdJR2tyS3lrZ2UxeHVJQ0FnSUNBZ2IySnFaV04wY3k1d2RYTm9LR2x1YzNCbFkzUW9ZWEpuZFcxbGJuUnpXMmxkS1NrN1hHNGdJQ0FnZlZ4dUlDQWdJSEpsZEhWeWJpQnZZbXBsWTNSekxtcHZhVzRvSnlBbktUdGNiaUFnZlZ4dVhHNGdJSFpoY2lCcElEMGdNVHRjYmlBZ2RtRnlJR0Z5WjNNZ1BTQmhjbWQxYldWdWRITTdYRzRnSUhaaGNpQnNaVzRnUFNCaGNtZHpMbXhsYm1kMGFEdGNiaUFnZG1GeUlITjBjaUE5SUZOMGNtbHVaeWhtS1M1eVpYQnNZV05sS0dadmNtMWhkRkpsWjBWNGNDd2dablZ1WTNScGIyNG9lQ2tnZTF4dUlDQWdJR2xtSUNoNElEMDlQU0FuSlNVbktTQnlaWFIxY200Z0p5VW5PMXh1SUNBZ0lHbG1JQ2hwSUQ0OUlHeGxiaWtnY21WMGRYSnVJSGc3WEc0Z0lDQWdjM2RwZEdOb0lDaDRLU0I3WEc0Z0lDQWdJQ0JqWVhObElDY2xjeWM2SUhKbGRIVnliaUJUZEhKcGJtY29ZWEpuYzF0cEt5dGRLVHRjYmlBZ0lDQWdJR05oYzJVZ0p5VmtKem9nY21WMGRYSnVJRTUxYldKbGNpaGhjbWR6VzJrcksxMHBPMXh1SUNBZ0lDQWdZMkZ6WlNBbkpXb25PbHh1SUNBZ0lDQWdJQ0IwY25rZ2UxeHVJQ0FnSUNBZ0lDQWdJSEpsZEhWeWJpQktVMDlPTG5OMGNtbHVaMmxtZVNoaGNtZHpXMmtySzEwcE8xeHVJQ0FnSUNBZ0lDQjlJR05oZEdOb0lDaGZLU0I3WEc0Z0lDQWdJQ0FnSUNBZ2NtVjBkWEp1SUNkYlEybHlZM1ZzWVhKZEp6dGNiaUFnSUNBZ0lDQWdmVnh1SUNBZ0lDQWdaR1ZtWVhWc2REcGNiaUFnSUNBZ0lDQWdjbVYwZFhKdUlIZzdYRzRnSUNBZ2ZWeHVJQ0I5S1R0Y2JpQWdabTl5SUNoMllYSWdlQ0E5SUdGeVozTmJhVjA3SUdrZ1BDQnNaVzQ3SUhnZ1BTQmhjbWR6V3lzcmFWMHBJSHRjYmlBZ0lDQnBaaUFvYVhOT2RXeHNLSGdwSUh4OElDRnBjMDlpYW1WamRDaDRLU2tnZTF4dUlDQWdJQ0FnYzNSeUlDczlJQ2NnSnlBcklIZzdYRzRnSUNBZ2ZTQmxiSE5sSUh0Y2JpQWdJQ0FnSUhOMGNpQXJQU0FuSUNjZ0t5QnBibk53WldOMEtIZ3BPMXh1SUNBZ0lIMWNiaUFnZlZ4dUlDQnlaWFIxY200Z2MzUnlPMXh1ZlR0Y2JseHVYRzR2THlCTllYSnJJSFJvWVhRZ1lTQnRaWFJvYjJRZ2MyaHZkV3hrSUc1dmRDQmlaU0IxYzJWa0xseHVMeThnVW1WMGRYSnVjeUJoSUcxdlpHbG1hV1ZrSUdaMWJtTjBhVzl1SUhkb2FXTm9JSGRoY201eklHOXVZMlVnWW5rZ1pHVm1ZWFZzZEM1Y2JpOHZJRWxtSUMwdGJtOHRaR1Z3Y21WallYUnBiMjRnYVhNZ2MyVjBMQ0IwYUdWdUlHbDBJR2x6SUdFZ2JtOHRiM0F1WEc1bGVIQnZjblJ6TG1SbGNISmxZMkYwWlNBOUlHWjFibU4wYVc5dUtHWnVMQ0J0YzJjcElIdGNiaUFnTHk4Z1FXeHNiM2NnWm05eUlHUmxjSEpsWTJGMGFXNW5JSFJvYVc1bmN5QnBiaUIwYUdVZ2NISnZZMlZ6Y3lCdlppQnpkR0Z5ZEdsdVp5QjFjQzVjYmlBZ2FXWWdLR2x6Vlc1a1pXWnBibVZrS0dkc2IySmhiQzV3Y205alpYTnpLU2tnZTF4dUlDQWdJSEpsZEhWeWJpQm1kVzVqZEdsdmJpZ3BJSHRjYmlBZ0lDQWdJSEpsZEhWeWJpQmxlSEJ2Y25SekxtUmxjSEpsWTJGMFpTaG1iaXdnYlhObktTNWhjSEJzZVNoMGFHbHpMQ0JoY21kMWJXVnVkSE1wTzF4dUlDQWdJSDA3WEc0Z0lIMWNibHh1SUNCcFppQW9jSEp2WTJWemN5NXViMFJsY0hKbFkyRjBhVzl1SUQwOVBTQjBjblZsS1NCN1hHNGdJQ0FnY21WMGRYSnVJR1p1TzF4dUlDQjlYRzVjYmlBZ2RtRnlJSGRoY201bFpDQTlJR1poYkhObE8xeHVJQ0JtZFc1amRHbHZiaUJrWlhCeVpXTmhkR1ZrS0NrZ2UxeHVJQ0FnSUdsbUlDZ2hkMkZ5Ym1Wa0tTQjdYRzRnSUNBZ0lDQnBaaUFvY0hKdlkyVnpjeTUwYUhKdmQwUmxjSEpsWTJGMGFXOXVLU0I3WEc0Z0lDQWdJQ0FnSUhSb2NtOTNJRzVsZHlCRmNuSnZjaWh0YzJjcE8xeHVJQ0FnSUNBZ2ZTQmxiSE5sSUdsbUlDaHdjbTlqWlhOekxuUnlZV05sUkdWd2NtVmpZWFJwYjI0cElIdGNiaUFnSUNBZ0lDQWdZMjl1YzI5c1pTNTBjbUZqWlNodGMyY3BPMXh1SUNBZ0lDQWdmU0JsYkhObElIdGNiaUFnSUNBZ0lDQWdZMjl1YzI5c1pTNWxjbkp2Y2lodGMyY3BPMXh1SUNBZ0lDQWdmVnh1SUNBZ0lDQWdkMkZ5Ym1Wa0lEMGdkSEoxWlR0Y2JpQWdJQ0I5WEc0Z0lDQWdjbVYwZFhKdUlHWnVMbUZ3Y0d4NUtIUm9hWE1zSUdGeVozVnRaVzUwY3lrN1hHNGdJSDFjYmx4dUlDQnlaWFIxY200Z1pHVndjbVZqWVhSbFpEdGNibjA3WEc1Y2JseHVkbUZ5SUdSbFluVm5jeUE5SUh0OU8xeHVkbUZ5SUdSbFluVm5SVzUyYVhKdmJqdGNibVY0Y0c5eWRITXVaR1ZpZFdkc2IyY2dQU0JtZFc1amRHbHZiaWh6WlhRcElIdGNiaUFnYVdZZ0tHbHpWVzVrWldacGJtVmtLR1JsWW5WblJXNTJhWEp2YmlrcFhHNGdJQ0FnWkdWaWRXZEZiblpwY205dUlEMGdjSEp2WTJWemN5NWxibll1VGs5RVJWOUVSVUpWUnlCOGZDQW5KenRjYmlBZ2MyVjBJRDBnYzJWMExuUnZWWEJ3WlhKRFlYTmxLQ2s3WEc0Z0lHbG1JQ2doWkdWaWRXZHpXM05sZEYwcElIdGNiaUFnSUNCcFppQW9ibVYzSUZKbFowVjRjQ2duWEZ4Y1hHSW5JQ3NnYzJWMElDc2dKMXhjWEZ4aUp5d2dKMmtuS1M1MFpYTjBLR1JsWW5WblJXNTJhWEp2YmlrcElIdGNiaUFnSUNBZ0lIWmhjaUJ3YVdRZ1BTQndjbTlqWlhOekxuQnBaRHRjYmlBZ0lDQWdJR1JsWW5WbmMxdHpaWFJkSUQwZ1puVnVZM1JwYjI0b0tTQjdYRzRnSUNBZ0lDQWdJSFpoY2lCdGMyY2dQU0JsZUhCdmNuUnpMbVp2Y20xaGRDNWhjSEJzZVNobGVIQnZjblJ6TENCaGNtZDFiV1Z1ZEhNcE8xeHVJQ0FnSUNBZ0lDQmpiMjV6YjJ4bExtVnljbTl5S0NjbGN5QWxaRG9nSlhNbkxDQnpaWFFzSUhCcFpDd2diWE5uS1R0Y2JpQWdJQ0FnSUgwN1hHNGdJQ0FnZlNCbGJITmxJSHRjYmlBZ0lDQWdJR1JsWW5WbmMxdHpaWFJkSUQwZ1puVnVZM1JwYjI0b0tTQjdmVHRjYmlBZ0lDQjlYRzRnSUgxY2JpQWdjbVYwZFhKdUlHUmxZblZuYzF0elpYUmRPMXh1ZlR0Y2JseHVYRzR2S2lwY2JpQXFJRVZqYUc5eklIUm9aU0IyWVd4MVpTQnZaaUJoSUhaaGJIVmxMaUJVY25seklIUnZJSEJ5YVc1MElIUm9aU0IyWVd4MVpTQnZkWFJjYmlBcUlHbHVJSFJvWlNCaVpYTjBJSGRoZVNCd2IzTnphV0pzWlNCbmFYWmxiaUIwYUdVZ1pHbG1abVZ5Wlc1MElIUjVjR1Z6TGx4dUlDcGNiaUFxSUVCd1lYSmhiU0I3VDJKcVpXTjBmU0J2WW1vZ1ZHaGxJRzlpYW1WamRDQjBieUJ3Y21sdWRDQnZkWFF1WEc0Z0tpQkFjR0Z5WVcwZ2UwOWlhbVZqZEgwZ2IzQjBjeUJQY0hScGIyNWhiQ0J2Y0hScGIyNXpJRzlpYW1WamRDQjBhR0YwSUdGc2RHVnljeUIwYUdVZ2IzVjBjSFYwTGx4dUlDb3ZYRzR2S2lCc1pXZGhZM2s2SUc5aWFpd2djMmh2ZDBocFpHUmxiaXdnWkdWd2RHZ3NJR052Ykc5eWN5b3ZYRzVtZFc1amRHbHZiaUJwYm5Od1pXTjBLRzlpYWl3Z2IzQjBjeWtnZTF4dUlDQXZMeUJrWldaaGRXeDBJRzl3ZEdsdmJuTmNiaUFnZG1GeUlHTjBlQ0E5SUh0Y2JpQWdJQ0J6WldWdU9pQmJYU3hjYmlBZ0lDQnpkSGxzYVhwbE9pQnpkSGxzYVhwbFRtOURiMnh2Y2x4dUlDQjlPMXh1SUNBdkx5QnNaV2RoWTNrdUxpNWNiaUFnYVdZZ0tHRnlaM1Z0Wlc1MGN5NXNaVzVuZEdnZ1BqMGdNeWtnWTNSNExtUmxjSFJvSUQwZ1lYSm5kVzFsYm5Seld6SmRPMXh1SUNCcFppQW9ZWEpuZFcxbGJuUnpMbXhsYm1kMGFDQStQU0EwS1NCamRIZ3VZMjlzYjNKeklEMGdZWEpuZFcxbGJuUnpXek5kTzF4dUlDQnBaaUFvYVhOQ2IyOXNaV0Z1S0c5d2RITXBLU0I3WEc0Z0lDQWdMeThnYkdWbllXTjVMaTR1WEc0Z0lDQWdZM1I0TG5Ob2IzZElhV1JrWlc0Z1BTQnZjSFJ6TzF4dUlDQjlJR1ZzYzJVZ2FXWWdLRzl3ZEhNcElIdGNiaUFnSUNBdkx5Qm5iM1FnWVc0Z1hDSnZjSFJwYjI1elhDSWdiMkpxWldOMFhHNGdJQ0FnWlhod2IzSjBjeTVmWlhoMFpXNWtLR04wZUN3Z2IzQjBjeWs3WEc0Z0lIMWNiaUFnTHk4Z2MyVjBJR1JsWm1GMWJIUWdiM0IwYVc5dWMxeHVJQ0JwWmlBb2FYTlZibVJsWm1sdVpXUW9ZM1I0TG5Ob2IzZElhV1JrWlc0cEtTQmpkSGd1YzJodmQwaHBaR1JsYmlBOUlHWmhiSE5sTzF4dUlDQnBaaUFvYVhOVmJtUmxabWx1WldRb1kzUjRMbVJsY0hSb0tTa2dZM1I0TG1SbGNIUm9JRDBnTWp0Y2JpQWdhV1lnS0dselZXNWtaV1pwYm1Wa0tHTjBlQzVqYjJ4dmNuTXBLU0JqZEhndVkyOXNiM0p6SUQwZ1ptRnNjMlU3WEc0Z0lHbG1JQ2hwYzFWdVpHVm1hVzVsWkNoamRIZ3VZM1Z6ZEc5dFNXNXpjR1ZqZENrcElHTjBlQzVqZFhOMGIyMUpibk53WldOMElEMGdkSEoxWlR0Y2JpQWdhV1lnS0dOMGVDNWpiMnh2Y25NcElHTjBlQzV6ZEhsc2FYcGxJRDBnYzNSNWJHbDZaVmRwZEdoRGIyeHZjanRjYmlBZ2NtVjBkWEp1SUdadmNtMWhkRlpoYkhWbEtHTjBlQ3dnYjJKcUxDQmpkSGd1WkdWd2RHZ3BPMXh1ZlZ4dVpYaHdiM0owY3k1cGJuTndaV04wSUQwZ2FXNXpjR1ZqZER0Y2JseHVYRzR2THlCb2RIUndPaTh2Wlc0dWQybHJhWEJsWkdsaExtOXlaeTkzYVd0cEwwRk9VMGxmWlhOallYQmxYMk52WkdValozSmhjR2hwWTNOY2JtbHVjM0JsWTNRdVkyOXNiM0p6SUQwZ2UxeHVJQ0FuWW05c1pDY2dPaUJiTVN3Z01qSmRMRnh1SUNBbmFYUmhiR2xqSnlBNklGc3pMQ0F5TTEwc1hHNGdJQ2QxYm1SbGNteHBibVVuSURvZ1d6UXNJREkwWFN4Y2JpQWdKMmx1ZG1WeWMyVW5JRG9nV3pjc0lESTNYU3hjYmlBZ0ozZG9hWFJsSnlBNklGc3pOeXdnTXpsZExGeHVJQ0FuWjNKbGVTY2dPaUJiT1RBc0lETTVYU3hjYmlBZ0oySnNZV05ySnlBNklGc3pNQ3dnTXpsZExGeHVJQ0FuWW14MVpTY2dPaUJiTXpRc0lETTVYU3hjYmlBZ0oyTjVZVzRuSURvZ1d6TTJMQ0F6T1Ywc1hHNGdJQ2RuY21WbGJpY2dPaUJiTXpJc0lETTVYU3hjYmlBZ0oyMWhaMlZ1ZEdFbklEb2dXek0xTENBek9WMHNYRzRnSUNkeVpXUW5JRG9nV3pNeExDQXpPVjBzWEc0Z0lDZDVaV3hzYjNjbklEb2dXek16TENBek9WMWNibjA3WEc1Y2JpOHZJRVJ2YmlkMElIVnpaU0FuWW14MVpTY2dibTkwSUhacGMybGliR1VnYjI0Z1kyMWtMbVY0WlZ4dWFXNXpjR1ZqZEM1emRIbHNaWE1nUFNCN1hHNGdJQ2R6Y0dWamFXRnNKem9nSjJONVlXNG5MRnh1SUNBbmJuVnRZbVZ5SnpvZ0ozbGxiR3h2ZHljc1hHNGdJQ2RpYjI5c1pXRnVKem9nSjNsbGJHeHZkeWNzWEc0Z0lDZDFibVJsWm1sdVpXUW5PaUFuWjNKbGVTY3NYRzRnSUNkdWRXeHNKem9nSjJKdmJHUW5MRnh1SUNBbmMzUnlhVzVuSnpvZ0oyZHlaV1Z1Snl4Y2JpQWdKMlJoZEdVbk9pQW5iV0ZuWlc1MFlTY3NYRzRnSUM4dklGd2libUZ0WlZ3aU9pQnBiblJsYm5ScGIyNWhiR3g1SUc1dmRDQnpkSGxzYVc1blhHNGdJQ2R5WldkbGVIQW5PaUFuY21Wa0oxeHVmVHRjYmx4dVhHNW1kVzVqZEdsdmJpQnpkSGxzYVhwbFYybDBhRU52Ykc5eUtITjBjaXdnYzNSNWJHVlVlWEJsS1NCN1hHNGdJSFpoY2lCemRIbHNaU0E5SUdsdWMzQmxZM1F1YzNSNWJHVnpXM04wZVd4bFZIbHdaVjA3WEc1Y2JpQWdhV1lnS0hOMGVXeGxLU0I3WEc0Z0lDQWdjbVYwZFhKdUlDZGNYSFV3TURGaVd5Y2dLeUJwYm5Od1pXTjBMbU52Ykc5eWMxdHpkSGxzWlYxYk1GMGdLeUFuYlNjZ0t5QnpkSElnSzF4dUlDQWdJQ0FnSUNBZ0lDQW5YRngxTURBeFlsc25JQ3NnYVc1emNHVmpkQzVqYjJ4dmNuTmJjM1I1YkdWZFd6RmRJQ3NnSjIwbk8xeHVJQ0I5SUdWc2MyVWdlMXh1SUNBZ0lISmxkSFZ5YmlCemRISTdYRzRnSUgxY2JuMWNibHh1WEc1bWRXNWpkR2x2YmlCemRIbHNhWHBsVG05RGIyeHZjaWh6ZEhJc0lITjBlV3hsVkhsd1pTa2dlMXh1SUNCeVpYUjFjbTRnYzNSeU8xeHVmVnh1WEc1Y2JtWjFibU4wYVc5dUlHRnljbUY1Vkc5SVlYTm9LR0Z5Y21GNUtTQjdYRzRnSUhaaGNpQm9ZWE5vSUQwZ2UzMDdYRzVjYmlBZ1lYSnlZWGt1Wm05eVJXRmphQ2htZFc1amRHbHZiaWgyWVd3c0lHbGtlQ2tnZTF4dUlDQWdJR2hoYzJoYmRtRnNYU0E5SUhSeWRXVTdYRzRnSUgwcE8xeHVYRzRnSUhKbGRIVnliaUJvWVhOb08xeHVmVnh1WEc1Y2JtWjFibU4wYVc5dUlHWnZjbTFoZEZaaGJIVmxLR04wZUN3Z2RtRnNkV1VzSUhKbFkzVnljMlZVYVcxbGN5a2dlMXh1SUNBdkx5QlFjbTkyYVdSbElHRWdhRzl2YXlCbWIzSWdkWE5sY2kxemNHVmphV1pwWldRZ2FXNXpjR1ZqZENCbWRXNWpkR2x2Ym5NdVhHNGdJQzh2SUVOb1pXTnJJSFJvWVhRZ2RtRnNkV1VnYVhNZ1lXNGdiMkpxWldOMElIZHBkR2dnWVc0Z2FXNXpjR1ZqZENCbWRXNWpkR2x2YmlCdmJpQnBkRnh1SUNCcFppQW9ZM1I0TG1OMWMzUnZiVWx1YzNCbFkzUWdKaVpjYmlBZ0lDQWdJSFpoYkhWbElDWW1YRzRnSUNBZ0lDQnBjMFoxYm1OMGFXOXVLSFpoYkhWbExtbHVjM0JsWTNRcElDWW1YRzRnSUNBZ0lDQXZMeUJHYVd4MFpYSWdiM1YwSUhSb1pTQjFkR2xzSUcxdlpIVnNaU3dnYVhRbmN5QnBibk53WldOMElHWjFibU4wYVc5dUlHbHpJSE53WldOcFlXeGNiaUFnSUNBZ0lIWmhiSFZsTG1sdWMzQmxZM1FnSVQwOUlHVjRjRzl5ZEhNdWFXNXpjR1ZqZENBbUpseHVJQ0FnSUNBZ0x5OGdRV3h6YnlCbWFXeDBaWElnYjNWMElHRnVlU0J3Y205MGIzUjVjR1VnYjJKcVpXTjBjeUIxYzJsdVp5QjBhR1VnWTJseVkzVnNZWElnWTJobFkyc3VYRzRnSUNBZ0lDQWhLSFpoYkhWbExtTnZibk4wY25WamRHOXlJQ1ltSUhaaGJIVmxMbU52Ym5OMGNuVmpkRzl5TG5CeWIzUnZkSGx3WlNBOVBUMGdkbUZzZFdVcEtTQjdYRzRnSUNBZ2RtRnlJSEpsZENBOUlIWmhiSFZsTG1sdWMzQmxZM1FvY21WamRYSnpaVlJwYldWekxDQmpkSGdwTzF4dUlDQWdJR2xtSUNnaGFYTlRkSEpwYm1jb2NtVjBLU2tnZTF4dUlDQWdJQ0FnY21WMElEMGdabTl5YldGMFZtRnNkV1VvWTNSNExDQnlaWFFzSUhKbFkzVnljMlZVYVcxbGN5azdYRzRnSUNBZ2ZWeHVJQ0FnSUhKbGRIVnliaUJ5WlhRN1hHNGdJSDFjYmx4dUlDQXZMeUJRY21sdGFYUnBkbVVnZEhsd1pYTWdZMkZ1Ym05MElHaGhkbVVnY0hKdmNHVnlkR2xsYzF4dUlDQjJZWElnY0hKcGJXbDBhWFpsSUQwZ1ptOXliV0YwVUhKcGJXbDBhWFpsS0dOMGVDd2dkbUZzZFdVcE8xeHVJQ0JwWmlBb2NISnBiV2wwYVhabEtTQjdYRzRnSUNBZ2NtVjBkWEp1SUhCeWFXMXBkR2wyWlR0Y2JpQWdmVnh1WEc0Z0lDOHZJRXh2YjJzZ2RYQWdkR2hsSUd0bGVYTWdiMllnZEdobElHOWlhbVZqZEM1Y2JpQWdkbUZ5SUd0bGVYTWdQU0JQWW1wbFkzUXVhMlY1Y3loMllXeDFaU2s3WEc0Z0lIWmhjaUIyYVhOcFlteGxTMlY1Y3lBOUlHRnljbUY1Vkc5SVlYTm9LR3RsZVhNcE8xeHVYRzRnSUdsbUlDaGpkSGd1YzJodmQwaHBaR1JsYmlrZ2UxeHVJQ0FnSUd0bGVYTWdQU0JQWW1wbFkzUXVaMlYwVDNkdVVISnZjR1Z5ZEhsT1lXMWxjeWgyWVd4MVpTazdYRzRnSUgxY2JseHVJQ0F2THlCSlJTQmtiMlZ6YmlkMElHMWhhMlVnWlhKeWIzSWdabWxsYkdSeklHNXZiaTFsYm5WdFpYSmhZbXhsWEc0Z0lDOHZJR2gwZEhBNkx5OXRjMlJ1TG0xcFkzSnZjMjltZEM1amIyMHZaVzR0ZFhNdmJHbGljbUZ5ZVM5cFpTOWtkM2MxTW5OaWRDaDJQWFp6TGprMEtTNWhjM0I0WEc0Z0lHbG1JQ2hwYzBWeWNtOXlLSFpoYkhWbEtWeHVJQ0FnSUNBZ0ppWWdLR3RsZVhNdWFXNWtaWGhQWmlnbmJXVnpjMkZuWlNjcElENDlJREFnZkh3Z2EyVjVjeTVwYm1SbGVFOW1LQ2RrWlhOamNtbHdkR2x2YmljcElENDlJREFwS1NCN1hHNGdJQ0FnY21WMGRYSnVJR1p2Y20xaGRFVnljbTl5S0haaGJIVmxLVHRjYmlBZ2ZWeHVYRzRnSUM4dklGTnZiV1VnZEhsd1pTQnZaaUJ2WW1wbFkzUWdkMmwwYUc5MWRDQndjbTl3WlhKMGFXVnpJR05oYmlCaVpTQnphRzl5ZEdOMWRIUmxaQzVjYmlBZ2FXWWdLR3RsZVhNdWJHVnVaM1JvSUQwOVBTQXdLU0I3WEc0Z0lDQWdhV1lnS0dselJuVnVZM1JwYjI0b2RtRnNkV1VwS1NCN1hHNGdJQ0FnSUNCMllYSWdibUZ0WlNBOUlIWmhiSFZsTG01aGJXVWdQeUFuT2lBbklDc2dkbUZzZFdVdWJtRnRaU0E2SUNjbk8xeHVJQ0FnSUNBZ2NtVjBkWEp1SUdOMGVDNXpkSGxzYVhwbEtDZGJSblZ1WTNScGIyNG5JQ3NnYm1GdFpTQXJJQ2RkSnl3Z0ozTndaV05wWVd3bktUdGNiaUFnSUNCOVhHNGdJQ0FnYVdZZ0tHbHpVbVZuUlhod0tIWmhiSFZsS1NrZ2UxeHVJQ0FnSUNBZ2NtVjBkWEp1SUdOMGVDNXpkSGxzYVhwbEtGSmxaMFY0Y0M1d2NtOTBiM1I1Y0dVdWRHOVRkSEpwYm1jdVkyRnNiQ2gyWVd4MVpTa3NJQ2R5WldkbGVIQW5LVHRjYmlBZ0lDQjlYRzRnSUNBZ2FXWWdLR2x6UkdGMFpTaDJZV3gxWlNrcElIdGNiaUFnSUNBZ0lISmxkSFZ5YmlCamRIZ3VjM1I1YkdsNlpTaEVZWFJsTG5CeWIzUnZkSGx3WlM1MGIxTjBjbWx1Wnk1allXeHNLSFpoYkhWbEtTd2dKMlJoZEdVbktUdGNiaUFnSUNCOVhHNGdJQ0FnYVdZZ0tHbHpSWEp5YjNJb2RtRnNkV1VwS1NCN1hHNGdJQ0FnSUNCeVpYUjFjbTRnWm05eWJXRjBSWEp5YjNJb2RtRnNkV1VwTzF4dUlDQWdJSDFjYmlBZ2ZWeHVYRzRnSUhaaGNpQmlZWE5sSUQwZ0p5Y3NJR0Z5Y21GNUlEMGdabUZzYzJVc0lHSnlZV05sY3lBOUlGc25leWNzSUNkOUoxMDdYRzVjYmlBZ0x5OGdUV0ZyWlNCQmNuSmhlU0J6WVhrZ2RHaGhkQ0IwYUdWNUlHRnlaU0JCY25KaGVWeHVJQ0JwWmlBb2FYTkJjbkpoZVNoMllXeDFaU2twSUh0Y2JpQWdJQ0JoY25KaGVTQTlJSFJ5ZFdVN1hHNGdJQ0FnWW5KaFkyVnpJRDBnV3lkYkp5d2dKMTBuWFR0Y2JpQWdmVnh1WEc0Z0lDOHZJRTFoYTJVZ1puVnVZM1JwYjI1eklITmhlU0IwYUdGMElIUm9aWGtnWVhKbElHWjFibU4wYVc5dWMxeHVJQ0JwWmlBb2FYTkdkVzVqZEdsdmJpaDJZV3gxWlNrcElIdGNiaUFnSUNCMllYSWdiaUE5SUhaaGJIVmxMbTVoYldVZ1B5QW5PaUFuSUNzZ2RtRnNkV1V1Ym1GdFpTQTZJQ2NuTzF4dUlDQWdJR0poYzJVZ1BTQW5JRnRHZFc1amRHbHZiaWNnS3lCdUlDc2dKMTBuTzF4dUlDQjlYRzVjYmlBZ0x5OGdUV0ZyWlNCU1pXZEZlSEJ6SUhOaGVTQjBhR0YwSUhSb1pYa2dZWEpsSUZKbFowVjRjSE5jYmlBZ2FXWWdLR2x6VW1WblJYaHdLSFpoYkhWbEtTa2dlMXh1SUNBZ0lHSmhjMlVnUFNBbklDY2dLeUJTWldkRmVIQXVjSEp2ZEc5MGVYQmxMblJ2VTNSeWFXNW5MbU5oYkd3b2RtRnNkV1VwTzF4dUlDQjlYRzVjYmlBZ0x5OGdUV0ZyWlNCa1lYUmxjeUIzYVhSb0lIQnliM0JsY25ScFpYTWdabWx5YzNRZ2MyRjVJSFJvWlNCa1lYUmxYRzRnSUdsbUlDaHBjMFJoZEdVb2RtRnNkV1VwS1NCN1hHNGdJQ0FnWW1GelpTQTlJQ2NnSnlBcklFUmhkR1V1Y0hKdmRHOTBlWEJsTG5SdlZWUkRVM1J5YVc1bkxtTmhiR3dvZG1Gc2RXVXBPMXh1SUNCOVhHNWNiaUFnTHk4Z1RXRnJaU0JsY25KdmNpQjNhWFJvSUcxbGMzTmhaMlVnWm1seWMzUWdjMkY1SUhSb1pTQmxjbkp2Y2x4dUlDQnBaaUFvYVhORmNuSnZjaWgyWVd4MVpTa3BJSHRjYmlBZ0lDQmlZWE5sSUQwZ0p5QW5JQ3NnWm05eWJXRjBSWEp5YjNJb2RtRnNkV1VwTzF4dUlDQjlYRzVjYmlBZ2FXWWdLR3RsZVhNdWJHVnVaM1JvSUQwOVBTQXdJQ1ltSUNnaFlYSnlZWGtnZkh3Z2RtRnNkV1V1YkdWdVozUm9JRDA5SURBcEtTQjdYRzRnSUNBZ2NtVjBkWEp1SUdKeVlXTmxjMXN3WFNBcklHSmhjMlVnS3lCaWNtRmpaWE5iTVYwN1hHNGdJSDFjYmx4dUlDQnBaaUFvY21WamRYSnpaVlJwYldWeklEd2dNQ2tnZTF4dUlDQWdJR2xtSUNocGMxSmxaMFY0Y0NoMllXeDFaU2twSUh0Y2JpQWdJQ0FnSUhKbGRIVnliaUJqZEhndWMzUjViR2w2WlNoU1pXZEZlSEF1Y0hKdmRHOTBlWEJsTG5SdlUzUnlhVzVuTG1OaGJHd29kbUZzZFdVcExDQW5jbVZuWlhod0p5azdYRzRnSUNBZ2ZTQmxiSE5sSUh0Y2JpQWdJQ0FnSUhKbGRIVnliaUJqZEhndWMzUjViR2w2WlNnblcwOWlhbVZqZEYwbkxDQW5jM0JsWTJsaGJDY3BPMXh1SUNBZ0lIMWNiaUFnZlZ4dVhHNGdJR04wZUM1elpXVnVMbkIxYzJnb2RtRnNkV1VwTzF4dVhHNGdJSFpoY2lCdmRYUndkWFE3WEc0Z0lHbG1JQ2hoY25KaGVTa2dlMXh1SUNBZ0lHOTFkSEIxZENBOUlHWnZjbTFoZEVGeWNtRjVLR04wZUN3Z2RtRnNkV1VzSUhKbFkzVnljMlZVYVcxbGN5d2dkbWx6YVdKc1pVdGxlWE1zSUd0bGVYTXBPMXh1SUNCOUlHVnNjMlVnZTF4dUlDQWdJRzkxZEhCMWRDQTlJR3RsZVhNdWJXRndLR1oxYm1OMGFXOXVLR3RsZVNrZ2UxeHVJQ0FnSUNBZ2NtVjBkWEp1SUdadmNtMWhkRkJ5YjNCbGNuUjVLR04wZUN3Z2RtRnNkV1VzSUhKbFkzVnljMlZVYVcxbGN5d2dkbWx6YVdKc1pVdGxlWE1zSUd0bGVTd2dZWEp5WVhrcE8xeHVJQ0FnSUgwcE8xeHVJQ0I5WEc1Y2JpQWdZM1I0TG5ObFpXNHVjRzl3S0NrN1hHNWNiaUFnY21WMGRYSnVJSEpsWkhWalpWUnZVMmx1WjJ4bFUzUnlhVzVuS0c5MWRIQjFkQ3dnWW1GelpTd2dZbkpoWTJWektUdGNibjFjYmx4dVhHNW1kVzVqZEdsdmJpQm1iM0p0WVhSUWNtbHRhWFJwZG1Vb1kzUjRMQ0IyWVd4MVpTa2dlMXh1SUNCcFppQW9hWE5WYm1SbFptbHVaV1FvZG1Gc2RXVXBLVnh1SUNBZ0lISmxkSFZ5YmlCamRIZ3VjM1I1YkdsNlpTZ25kVzVrWldacGJtVmtKeXdnSjNWdVpHVm1hVzVsWkNjcE8xeHVJQ0JwWmlBb2FYTlRkSEpwYm1jb2RtRnNkV1VwS1NCN1hHNGdJQ0FnZG1GeUlITnBiWEJzWlNBOUlDZGNYQ2NuSUNzZ1NsTlBUaTV6ZEhKcGJtZHBabmtvZG1Gc2RXVXBMbkpsY0d4aFkyVW9MMTVjSW54Y0lpUXZaeXdnSnljcFhHNGdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQXVjbVZ3YkdGalpTZ3ZKeTluTENCY0lseGNYRnduWENJcFhHNGdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQXVjbVZ3YkdGalpTZ3ZYRnhjWEZ3aUwyY3NJQ2RjSWljcElDc2dKMXhjSnljN1hHNGdJQ0FnY21WMGRYSnVJR04wZUM1emRIbHNhWHBsS0hOcGJYQnNaU3dnSjNOMGNtbHVaeWNwTzF4dUlDQjlYRzRnSUdsbUlDaHBjMDUxYldKbGNpaDJZV3gxWlNrcFhHNGdJQ0FnY21WMGRYSnVJR04wZUM1emRIbHNhWHBsS0NjbklDc2dkbUZzZFdVc0lDZHVkVzFpWlhJbktUdGNiaUFnYVdZZ0tHbHpRbTl2YkdWaGJpaDJZV3gxWlNrcFhHNGdJQ0FnY21WMGRYSnVJR04wZUM1emRIbHNhWHBsS0NjbklDc2dkbUZzZFdVc0lDZGliMjlzWldGdUp5azdYRzRnSUM4dklFWnZjaUJ6YjIxbElISmxZWE52YmlCMGVYQmxiMllnYm5Wc2JDQnBjeUJjSW05aWFtVmpkRndpTENCemJ5QnpjR1ZqYVdGc0lHTmhjMlVnYUdWeVpTNWNiaUFnYVdZZ0tHbHpUblZzYkNoMllXeDFaU2twWEc0Z0lDQWdjbVYwZFhKdUlHTjBlQzV6ZEhsc2FYcGxLQ2R1ZFd4c0p5d2dKMjUxYkd3bktUdGNibjFjYmx4dVhHNW1kVzVqZEdsdmJpQm1iM0p0WVhSRmNuSnZjaWgyWVd4MVpTa2dlMXh1SUNCeVpYUjFjbTRnSjFzbklDc2dSWEp5YjNJdWNISnZkRzkwZVhCbExuUnZVM1J5YVc1bkxtTmhiR3dvZG1Gc2RXVXBJQ3NnSjEwbk8xeHVmVnh1WEc1Y2JtWjFibU4wYVc5dUlHWnZjbTFoZEVGeWNtRjVLR04wZUN3Z2RtRnNkV1VzSUhKbFkzVnljMlZVYVcxbGN5d2dkbWx6YVdKc1pVdGxlWE1zSUd0bGVYTXBJSHRjYmlBZ2RtRnlJRzkxZEhCMWRDQTlJRnRkTzF4dUlDQm1iM0lnS0haaGNpQnBJRDBnTUN3Z2JDQTlJSFpoYkhWbExteGxibWQwYURzZ2FTQThJR3c3SUNzcmFTa2dlMXh1SUNBZ0lHbG1JQ2hvWVhOUGQyNVFjbTl3WlhKMGVTaDJZV3gxWlN3Z1UzUnlhVzVuS0drcEtTa2dlMXh1SUNBZ0lDQWdiM1YwY0hWMExuQjFjMmdvWm05eWJXRjBVSEp2Y0dWeWRIa29ZM1I0TENCMllXeDFaU3dnY21WamRYSnpaVlJwYldWekxDQjJhWE5wWW14bFMyVjVjeXhjYmlBZ0lDQWdJQ0FnSUNCVGRISnBibWNvYVNrc0lIUnlkV1VwS1R0Y2JpQWdJQ0I5SUdWc2MyVWdlMXh1SUNBZ0lDQWdiM1YwY0hWMExuQjFjMmdvSnljcE8xeHVJQ0FnSUgxY2JpQWdmVnh1SUNCclpYbHpMbVp2Y2tWaFkyZ29ablZ1WTNScGIyNG9hMlY1S1NCN1hHNGdJQ0FnYVdZZ0tDRnJaWGt1YldGMFkyZ29MMTVjWEdRckpDOHBLU0I3WEc0Z0lDQWdJQ0J2ZFhSd2RYUXVjSFZ6YUNobWIzSnRZWFJRY205d1pYSjBlU2hqZEhnc0lIWmhiSFZsTENCeVpXTjFjbk5sVkdsdFpYTXNJSFpwYzJsaWJHVkxaWGx6TEZ4dUlDQWdJQ0FnSUNBZ0lHdGxlU3dnZEhKMVpTa3BPMXh1SUNBZ0lIMWNiaUFnZlNrN1hHNGdJSEpsZEhWeWJpQnZkWFJ3ZFhRN1hHNTlYRzVjYmx4dVpuVnVZM1JwYjI0Z1ptOXliV0YwVUhKdmNHVnlkSGtvWTNSNExDQjJZV3gxWlN3Z2NtVmpkWEp6WlZScGJXVnpMQ0IyYVhOcFlteGxTMlY1Y3l3Z2EyVjVMQ0JoY25KaGVTa2dlMXh1SUNCMllYSWdibUZ0WlN3Z2MzUnlMQ0JrWlhOak8xeHVJQ0JrWlhOaklEMGdUMkpxWldOMExtZGxkRTkzYmxCeWIzQmxjblI1UkdWelkzSnBjSFJ2Y2loMllXeDFaU3dnYTJWNUtTQjhmQ0I3SUhaaGJIVmxPaUIyWVd4MVpWdHJaWGxkSUgwN1hHNGdJR2xtSUNoa1pYTmpMbWRsZENrZ2UxeHVJQ0FnSUdsbUlDaGtaWE5qTG5ObGRDa2dlMXh1SUNBZ0lDQWdjM1J5SUQwZ1kzUjRMbk4wZVd4cGVtVW9KMXRIWlhSMFpYSXZVMlYwZEdWeVhTY3NJQ2R6Y0dWamFXRnNKeWs3WEc0Z0lDQWdmU0JsYkhObElIdGNiaUFnSUNBZ0lITjBjaUE5SUdOMGVDNXpkSGxzYVhwbEtDZGJSMlYwZEdWeVhTY3NJQ2R6Y0dWamFXRnNKeWs3WEc0Z0lDQWdmVnh1SUNCOUlHVnNjMlVnZTF4dUlDQWdJR2xtSUNoa1pYTmpMbk5sZENrZ2UxeHVJQ0FnSUNBZ2MzUnlJRDBnWTNSNExuTjBlV3hwZW1Vb0oxdFRaWFIwWlhKZEp5d2dKM053WldOcFlXd25LVHRjYmlBZ0lDQjlYRzRnSUgxY2JpQWdhV1lnS0NGb1lYTlBkMjVRY205d1pYSjBlU2gyYVhOcFlteGxTMlY1Y3l3Z2EyVjVLU2tnZTF4dUlDQWdJRzVoYldVZ1BTQW5XeWNnS3lCclpYa2dLeUFuWFNjN1hHNGdJSDFjYmlBZ2FXWWdLQ0Z6ZEhJcElIdGNiaUFnSUNCcFppQW9ZM1I0TG5ObFpXNHVhVzVrWlhoUFppaGtaWE5qTG5aaGJIVmxLU0E4SURBcElIdGNiaUFnSUNBZ0lHbG1JQ2hwYzA1MWJHd29jbVZqZFhKelpWUnBiV1Z6S1NrZ2UxeHVJQ0FnSUNBZ0lDQnpkSElnUFNCbWIzSnRZWFJXWVd4MVpTaGpkSGdzSUdSbGMyTXVkbUZzZFdVc0lHNTFiR3dwTzF4dUlDQWdJQ0FnZlNCbGJITmxJSHRjYmlBZ0lDQWdJQ0FnYzNSeUlEMGdabTl5YldGMFZtRnNkV1VvWTNSNExDQmtaWE5qTG5aaGJIVmxMQ0J5WldOMWNuTmxWR2x0WlhNZ0xTQXhLVHRjYmlBZ0lDQWdJSDFjYmlBZ0lDQWdJR2xtSUNoemRISXVhVzVrWlhoUFppZ25YRnh1SnlrZ1BpQXRNU2tnZTF4dUlDQWdJQ0FnSUNCcFppQW9ZWEp5WVhrcElIdGNiaUFnSUNBZ0lDQWdJQ0J6ZEhJZ1BTQnpkSEl1YzNCc2FYUW9KMXhjYmljcExtMWhjQ2htZFc1amRHbHZiaWhzYVc1bEtTQjdYRzRnSUNBZ0lDQWdJQ0FnSUNCeVpYUjFjbTRnSnlBZ0p5QXJJR3hwYm1VN1hHNGdJQ0FnSUNBZ0lDQWdmU2t1YW05cGJpZ25YRnh1SnlrdWMzVmljM1J5S0RJcE8xeHVJQ0FnSUNBZ0lDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUNBZ0lDQWdJSE4wY2lBOUlDZGNYRzRuSUNzZ2MzUnlMbk53YkdsMEtDZGNYRzRuS1M1dFlYQW9ablZ1WTNScGIyNG9iR2x1WlNrZ2UxeHVJQ0FnSUNBZ0lDQWdJQ0FnY21WMGRYSnVJQ2NnSUNBbklDc2diR2x1WlR0Y2JpQWdJQ0FnSUNBZ0lDQjlLUzVxYjJsdUtDZGNYRzRuS1R0Y2JpQWdJQ0FnSUNBZ2ZWeHVJQ0FnSUNBZ2ZWeHVJQ0FnSUgwZ1pXeHpaU0I3WEc0Z0lDQWdJQ0J6ZEhJZ1BTQmpkSGd1YzNSNWJHbDZaU2duVzBOcGNtTjFiR0Z5WFNjc0lDZHpjR1ZqYVdGc0p5azdYRzRnSUNBZ2ZWeHVJQ0I5WEc0Z0lHbG1JQ2hwYzFWdVpHVm1hVzVsWkNodVlXMWxLU2tnZTF4dUlDQWdJR2xtSUNoaGNuSmhlU0FtSmlCclpYa3ViV0YwWTJnb0wxNWNYR1FySkM4cEtTQjdYRzRnSUNBZ0lDQnlaWFIxY200Z2MzUnlPMXh1SUNBZ0lIMWNiaUFnSUNCdVlXMWxJRDBnU2xOUFRpNXpkSEpwYm1kcFpua29KeWNnS3lCclpYa3BPMXh1SUNBZ0lHbG1JQ2h1WVcxbExtMWhkR05vS0M5ZVhDSW9XMkV0ZWtFdFdsOWRXMkV0ZWtFdFdsOHdMVGxkS2lsY0lpUXZLU2tnZTF4dUlDQWdJQ0FnYm1GdFpTQTlJRzVoYldVdWMzVmljM1J5S0RFc0lHNWhiV1V1YkdWdVozUm9JQzBnTWlrN1hHNGdJQ0FnSUNCdVlXMWxJRDBnWTNSNExuTjBlV3hwZW1Vb2JtRnRaU3dnSjI1aGJXVW5LVHRjYmlBZ0lDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUNBZ2JtRnRaU0E5SUc1aGJXVXVjbVZ3YkdGalpTZ3ZKeTluTENCY0lseGNYRnduWENJcFhHNGdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDNXlaWEJzWVdObEtDOWNYRnhjWENJdlp5d2dKMXdpSnlsY2JpQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0xuSmxjR3hoWTJVb0x5aGVYQ0o4WENJa0tTOW5MQ0JjSWlkY0lpazdYRzRnSUNBZ0lDQnVZVzFsSUQwZ1kzUjRMbk4wZVd4cGVtVW9ibUZ0WlN3Z0ozTjBjbWx1WnljcE8xeHVJQ0FnSUgxY2JpQWdmVnh1WEc0Z0lISmxkSFZ5YmlCdVlXMWxJQ3NnSnpvZ0p5QXJJSE4wY2p0Y2JuMWNibHh1WEc1bWRXNWpkR2x2YmlCeVpXUjFZMlZVYjFOcGJtZHNaVk4wY21sdVp5aHZkWFJ3ZFhRc0lHSmhjMlVzSUdKeVlXTmxjeWtnZTF4dUlDQjJZWElnYm5WdFRHbHVaWE5GYzNRZ1BTQXdPMXh1SUNCMllYSWdiR1Z1WjNSb0lEMGdiM1YwY0hWMExuSmxaSFZqWlNobWRXNWpkR2x2Ymlod2NtVjJMQ0JqZFhJcElIdGNiaUFnSUNCdWRXMU1hVzVsYzBWemRDc3JPMXh1SUNBZ0lHbG1JQ2hqZFhJdWFXNWtaWGhQWmlnblhGeHVKeWtnUGowZ01Da2diblZ0VEdsdVpYTkZjM1FyS3p0Y2JpQWdJQ0J5WlhSMWNtNGdjSEpsZGlBcklHTjFjaTV5WlhCc1lXTmxLQzljWEhVd01ERmlYRnhiWEZ4a1hGeGtQMjB2Wnl3Z0p5Y3BMbXhsYm1kMGFDQXJJREU3WEc0Z0lIMHNJREFwTzF4dVhHNGdJR2xtSUNoc1pXNW5kR2dnUGlBMk1Da2dlMXh1SUNBZ0lISmxkSFZ5YmlCaWNtRmpaWE5iTUYwZ0sxeHVJQ0FnSUNBZ0lDQWdJQ0FvWW1GelpTQTlQVDBnSnljZ1B5QW5KeUE2SUdKaGMyVWdLeUFuWEZ4dUlDY3BJQ3RjYmlBZ0lDQWdJQ0FnSUNBZ0p5QW5JQ3RjYmlBZ0lDQWdJQ0FnSUNBZ2IzVjBjSFYwTG1wdmFXNG9KeXhjWEc0Z0lDY3BJQ3RjYmlBZ0lDQWdJQ0FnSUNBZ0p5QW5JQ3RjYmlBZ0lDQWdJQ0FnSUNBZ1luSmhZMlZ6V3pGZE8xeHVJQ0I5WEc1Y2JpQWdjbVYwZFhKdUlHSnlZV05sYzFzd1hTQXJJR0poYzJVZ0t5QW5JQ2NnS3lCdmRYUndkWFF1YW05cGJpZ25MQ0FuS1NBcklDY2dKeUFySUdKeVlXTmxjMXN4WFR0Y2JuMWNibHh1WEc0dkx5Qk9UMVJGT2lCVWFHVnpaU0IwZVhCbElHTm9aV05yYVc1bklHWjFibU4wYVc5dWN5QnBiblJsYm5ScGIyNWhiR3g1SUdSdmJpZDBJSFZ6WlNCZ2FXNXpkR0Z1WTJWdlptQmNiaTh2SUdKbFkyRjFjMlVnYVhRZ2FYTWdabkpoWjJsc1pTQmhibVFnWTJGdUlHSmxJR1ZoYzJsc2VTQm1ZV3RsWkNCM2FYUm9JR0JQWW1wbFkzUXVZM0psWVhSbEtDbGdMbHh1Wm5WdVkzUnBiMjRnYVhOQmNuSmhlU2hoY2lrZ2UxeHVJQ0J5WlhSMWNtNGdRWEp5WVhrdWFYTkJjbkpoZVNoaGNpazdYRzU5WEc1bGVIQnZjblJ6TG1selFYSnlZWGtnUFNCcGMwRnljbUY1TzF4dVhHNW1kVzVqZEdsdmJpQnBjMEp2YjJ4bFlXNG9ZWEpuS1NCN1hHNGdJSEpsZEhWeWJpQjBlWEJsYjJZZ1lYSm5JRDA5UFNBblltOXZiR1ZoYmljN1hHNTlYRzVsZUhCdmNuUnpMbWx6UW05dmJHVmhiaUE5SUdselFtOXZiR1ZoYmp0Y2JseHVablZ1WTNScGIyNGdhWE5PZFd4c0tHRnlaeWtnZTF4dUlDQnlaWFIxY200Z1lYSm5JRDA5UFNCdWRXeHNPMXh1ZlZ4dVpYaHdiM0owY3k1cGMwNTFiR3dnUFNCcGMwNTFiR3c3WEc1Y2JtWjFibU4wYVc5dUlHbHpUblZzYkU5eVZXNWtaV1pwYm1Wa0tHRnlaeWtnZTF4dUlDQnlaWFIxY200Z1lYSm5JRDA5SUc1MWJHdzdYRzU5WEc1bGVIQnZjblJ6TG1selRuVnNiRTl5Vlc1a1pXWnBibVZrSUQwZ2FYTk9kV3hzVDNKVmJtUmxabWx1WldRN1hHNWNibVoxYm1OMGFXOXVJR2x6VG5WdFltVnlLR0Z5WnlrZ2UxeHVJQ0J5WlhSMWNtNGdkSGx3Wlc5bUlHRnlaeUE5UFQwZ0oyNTFiV0psY2ljN1hHNTlYRzVsZUhCdmNuUnpMbWx6VG5WdFltVnlJRDBnYVhOT2RXMWlaWEk3WEc1Y2JtWjFibU4wYVc5dUlHbHpVM1J5YVc1bktHRnlaeWtnZTF4dUlDQnlaWFIxY200Z2RIbHdaVzltSUdGeVp5QTlQVDBnSjNOMGNtbHVaeWM3WEc1OVhHNWxlSEJ2Y25SekxtbHpVM1J5YVc1bklEMGdhWE5UZEhKcGJtYzdYRzVjYm1aMWJtTjBhVzl1SUdselUzbHRZbTlzS0dGeVp5a2dlMXh1SUNCeVpYUjFjbTRnZEhsd1pXOW1JR0Z5WnlBOVBUMGdKM041YldKdmJDYzdYRzU5WEc1bGVIQnZjblJ6TG1selUzbHRZbTlzSUQwZ2FYTlRlVzFpYjJ3N1hHNWNibVoxYm1OMGFXOXVJR2x6Vlc1a1pXWnBibVZrS0dGeVp5a2dlMXh1SUNCeVpYUjFjbTRnWVhKbklEMDlQU0IyYjJsa0lEQTdYRzU5WEc1bGVIQnZjblJ6TG1selZXNWtaV1pwYm1Wa0lEMGdhWE5WYm1SbFptbHVaV1E3WEc1Y2JtWjFibU4wYVc5dUlHbHpVbVZuUlhod0tISmxLU0I3WEc0Z0lISmxkSFZ5YmlCcGMwOWlhbVZqZENoeVpTa2dKaVlnYjJKcVpXTjBWRzlUZEhKcGJtY29jbVVwSUQwOVBTQW5XMjlpYW1WamRDQlNaV2RGZUhCZEp6dGNibjFjYm1WNGNHOXlkSE11YVhOU1pXZEZlSEFnUFNCcGMxSmxaMFY0Y0R0Y2JseHVablZ1WTNScGIyNGdhWE5QWW1wbFkzUW9ZWEpuS1NCN1hHNGdJSEpsZEhWeWJpQjBlWEJsYjJZZ1lYSm5JRDA5UFNBbmIySnFaV04wSnlBbUppQmhjbWNnSVQwOUlHNTFiR3c3WEc1OVhHNWxlSEJ2Y25SekxtbHpUMkpxWldOMElEMGdhWE5QWW1wbFkzUTdYRzVjYm1aMWJtTjBhVzl1SUdselJHRjBaU2hrS1NCN1hHNGdJSEpsZEhWeWJpQnBjMDlpYW1WamRDaGtLU0FtSmlCdlltcGxZM1JVYjFOMGNtbHVaeWhrS1NBOVBUMGdKMXR2WW1wbFkzUWdSR0YwWlYwbk8xeHVmVnh1Wlhod2IzSjBjeTVwYzBSaGRHVWdQU0JwYzBSaGRHVTdYRzVjYm1aMWJtTjBhVzl1SUdselJYSnliM0lvWlNrZ2UxeHVJQ0J5WlhSMWNtNGdhWE5QWW1wbFkzUW9aU2tnSmlaY2JpQWdJQ0FnSUNodlltcGxZM1JVYjFOMGNtbHVaeWhsS1NBOVBUMGdKMXR2WW1wbFkzUWdSWEp5YjNKZEp5QjhmQ0JsSUdsdWMzUmhibU5sYjJZZ1JYSnliM0lwTzF4dWZWeHVaWGh3YjNKMGN5NXBjMFZ5Y205eUlEMGdhWE5GY25KdmNqdGNibHh1Wm5WdVkzUnBiMjRnYVhOR2RXNWpkR2x2YmloaGNtY3BJSHRjYmlBZ2NtVjBkWEp1SUhSNWNHVnZaaUJoY21jZ1BUMDlJQ2RtZFc1amRHbHZiaWM3WEc1OVhHNWxlSEJ2Y25SekxtbHpSblZ1WTNScGIyNGdQU0JwYzBaMWJtTjBhVzl1TzF4dVhHNW1kVzVqZEdsdmJpQnBjMUJ5YVcxcGRHbDJaU2hoY21jcElIdGNiaUFnY21WMGRYSnVJR0Z5WnlBOVBUMGdiblZzYkNCOGZGeHVJQ0FnSUNBZ0lDQWdkSGx3Wlc5bUlHRnlaeUE5UFQwZ0oySnZiMnhsWVc0bklIeDhYRzRnSUNBZ0lDQWdJQ0IwZVhCbGIyWWdZWEpuSUQwOVBTQW5iblZ0WW1WeUp5QjhmRnh1SUNBZ0lDQWdJQ0FnZEhsd1pXOW1JR0Z5WnlBOVBUMGdKM04wY21sdVp5Y2dmSHhjYmlBZ0lDQWdJQ0FnSUhSNWNHVnZaaUJoY21jZ1BUMDlJQ2R6ZVcxaWIyd25JSHg4SUNBdkx5QkZVellnYzNsdFltOXNYRzRnSUNBZ0lDQWdJQ0IwZVhCbGIyWWdZWEpuSUQwOVBTQW5kVzVrWldacGJtVmtKenRjYm4xY2JtVjRjRzl5ZEhNdWFYTlFjbWx0YVhScGRtVWdQU0JwYzFCeWFXMXBkR2wyWlR0Y2JseHVaWGh3YjNKMGN5NXBjMEoxWm1abGNpQTlJSEpsY1hWcGNtVW9KeTR2YzNWd2NHOXlkQzlwYzBKMVptWmxjaWNwTzF4dVhHNW1kVzVqZEdsdmJpQnZZbXBsWTNSVWIxTjBjbWx1WnlodktTQjdYRzRnSUhKbGRIVnliaUJQWW1wbFkzUXVjSEp2ZEc5MGVYQmxMblJ2VTNSeWFXNW5MbU5oYkd3b2J5azdYRzU5WEc1Y2JseHVablZ1WTNScGIyNGdjR0ZrS0c0cElIdGNiaUFnY21WMGRYSnVJRzRnUENBeE1DQS9JQ2N3SnlBcklHNHVkRzlUZEhKcGJtY29NVEFwSURvZ2JpNTBiMU4wY21sdVp5Z3hNQ2s3WEc1OVhHNWNibHh1ZG1GeUlHMXZiblJvY3lBOUlGc25TbUZ1Snl3Z0owWmxZaWNzSUNkTllYSW5MQ0FuUVhCeUp5d2dKMDFoZVNjc0lDZEtkVzRuTENBblNuVnNKeXdnSjBGMVp5Y3NJQ2RUWlhBbkxGeHVJQ0FnSUNBZ0lDQWdJQ0FnSUNBblQyTjBKeXdnSjA1dmRpY3NJQ2RFWldNblhUdGNibHh1THk4Z01qWWdSbVZpSURFMk9qRTVPak0wWEc1bWRXNWpkR2x2YmlCMGFXMWxjM1JoYlhBb0tTQjdYRzRnSUhaaGNpQmtJRDBnYm1WM0lFUmhkR1VvS1R0Y2JpQWdkbUZ5SUhScGJXVWdQU0JiY0dGa0tHUXVaMlYwU0c5MWNuTW9LU2tzWEc0Z0lDQWdJQ0FnSUNBZ0lDQWdJSEJoWkNoa0xtZGxkRTFwYm5WMFpYTW9LU2tzWEc0Z0lDQWdJQ0FnSUNBZ0lDQWdJSEJoWkNoa0xtZGxkRk5sWTI5dVpITW9LU2xkTG1wdmFXNG9Kem9uS1R0Y2JpQWdjbVYwZFhKdUlGdGtMbWRsZEVSaGRHVW9LU3dnYlc5dWRHaHpXMlF1WjJWMFRXOXVkR2dvS1Ywc0lIUnBiV1ZkTG1wdmFXNG9KeUFuS1R0Y2JuMWNibHh1WEc0dkx5QnNiMmNnYVhNZ2FuVnpkQ0JoSUhSb2FXNGdkM0poY0hCbGNpQjBieUJqYjI1emIyeGxMbXh2WnlCMGFHRjBJSEJ5WlhCbGJtUnpJR0VnZEdsdFpYTjBZVzF3WEc1bGVIQnZjblJ6TG14dlp5QTlJR1oxYm1OMGFXOXVLQ2tnZTF4dUlDQmpiMjV6YjJ4bExteHZaeWduSlhNZ0xTQWxjeWNzSUhScGJXVnpkR0Z0Y0NncExDQmxlSEJ2Y25SekxtWnZjbTFoZEM1aGNIQnNlU2hsZUhCdmNuUnpMQ0JoY21kMWJXVnVkSE1wS1R0Y2JuMDdYRzVjYmx4dUx5b3FYRzRnS2lCSmJtaGxjbWwwSUhSb1pTQndjbTkwYjNSNWNHVWdiV1YwYUc5a2N5Qm1jbTl0SUc5dVpTQmpiMjV6ZEhKMVkzUnZjaUJwYm5SdklHRnViM1JvWlhJdVhHNGdLbHh1SUNvZ1ZHaGxJRVoxYm1OMGFXOXVMbkJ5YjNSdmRIbHdaUzVwYm1obGNtbDBjeUJtY205dElHeGhibWN1YW5NZ2NtVjNjbWwwZEdWdUlHRnpJR0VnYzNSaGJtUmhiRzl1WlZ4dUlDb2dablZ1WTNScGIyNGdLRzV2ZENCdmJpQkdkVzVqZEdsdmJpNXdjbTkwYjNSNWNHVXBMaUJPVDFSRk9pQkpaaUIwYUdseklHWnBiR1VnYVhNZ2RHOGdZbVVnYkc5aFpHVmtYRzRnS2lCa2RYSnBibWNnWW05dmRITjBjbUZ3Y0dsdVp5QjBhR2x6SUdaMWJtTjBhVzl1SUc1bFpXUnpJSFJ2SUdKbElISmxkM0pwZEhSbGJpQjFjMmx1WnlCemIyMWxJRzVoZEdsMlpWeHVJQ29nWm5WdVkzUnBiMjV6SUdGeklIQnliM1J2ZEhsd1pTQnpaWFIxY0NCMWMybHVaeUJ1YjNKdFlXd2dTbUYyWVZOamNtbHdkQ0JrYjJWeklHNXZkQ0IzYjNKcklHRnpYRzRnS2lCbGVIQmxZM1JsWkNCa2RYSnBibWNnWW05dmRITjBjbUZ3Y0dsdVp5QW9jMlZsSUcxcGNuSnZjaTVxY3lCcGJpQnlNVEUwT1RBektTNWNiaUFxWEc0Z0tpQkFjR0Z5WVcwZ2UyWjFibU4wYVc5dWZTQmpkRzl5SUVOdmJuTjBjblZqZEc5eUlHWjFibU4wYVc5dUlIZG9hV05vSUc1bFpXUnpJSFJ2SUdsdWFHVnlhWFFnZEdobFhHNGdLaUFnSUNBZ2NISnZkRzkwZVhCbExseHVJQ29nUUhCaGNtRnRJSHRtZFc1amRHbHZibjBnYzNWd1pYSkRkRzl5SUVOdmJuTjBjblZqZEc5eUlHWjFibU4wYVc5dUlIUnZJR2x1YUdWeWFYUWdjSEp2ZEc5MGVYQmxJR1p5YjIwdVhHNGdLaTljYm1WNGNHOXlkSE11YVc1b1pYSnBkSE1nUFNCeVpYRjFhWEpsS0NkcGJtaGxjbWwwY3ljcE8xeHVYRzVsZUhCdmNuUnpMbDlsZUhSbGJtUWdQU0JtZFc1amRHbHZiaWh2Y21sbmFXNHNJR0ZrWkNrZ2UxeHVJQ0F2THlCRWIyNG5kQ0JrYnlCaGJubDBhR2x1WnlCcFppQmhaR1FnYVhOdUozUWdZVzRnYjJKcVpXTjBYRzRnSUdsbUlDZ2hZV1JrSUh4OElDRnBjMDlpYW1WamRDaGhaR1FwS1NCeVpYUjFjbTRnYjNKcFoybHVPMXh1WEc0Z0lIWmhjaUJyWlhseklEMGdUMkpxWldOMExtdGxlWE1vWVdSa0tUdGNiaUFnZG1GeUlHa2dQU0JyWlhsekxteGxibWQwYUR0Y2JpQWdkMmhwYkdVZ0tHa3RMU2tnZTF4dUlDQWdJRzl5YVdkcGJsdHJaWGx6VzJsZFhTQTlJR0ZrWkZ0clpYbHpXMmxkWFR0Y2JpQWdmVnh1SUNCeVpYUjFjbTRnYjNKcFoybHVPMXh1ZlR0Y2JseHVablZ1WTNScGIyNGdhR0Z6VDNkdVVISnZjR1Z5ZEhrb2IySnFMQ0J3Y205d0tTQjdYRzRnSUhKbGRIVnliaUJQWW1wbFkzUXVjSEp2ZEc5MGVYQmxMbWhoYzA5M2JsQnliM0JsY25SNUxtTmhiR3dvYjJKcUxDQndjbTl3S1R0Y2JuMWNiaUpkZlE9PSIsInZhciB1YSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93Lm5hdmlnYXRvci51c2VyQWdlbnQgOiAnJ1xuICAsIGlzT1NYID0gL09TIFgvLnRlc3QodWEpXG4gICwgaXNPcGVyYSA9IC9PcGVyYS8udGVzdCh1YSlcbiAgLCBtYXliZUZpcmVmb3ggPSAhL2xpa2UgR2Vja28vLnRlc3QodWEpICYmICFpc09wZXJhXG5cbnZhciBpLCBvdXRwdXQgPSBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgMDogIGlzT1NYID8gJzxtZW51PicgOiAnPFVOSz4nXG4sIDE6ICAnPG1vdXNlIDE+J1xuLCAyOiAgJzxtb3VzZSAyPidcbiwgMzogICc8YnJlYWs+J1xuLCA0OiAgJzxtb3VzZSAzPidcbiwgNTogICc8bW91c2UgND4nXG4sIDY6ICAnPG1vdXNlIDU+J1xuLCA4OiAgJzxiYWNrc3BhY2U+J1xuLCA5OiAgJzx0YWI+J1xuLCAxMjogJzxjbGVhcj4nXG4sIDEzOiAnPGVudGVyPidcbiwgMTY6ICc8c2hpZnQ+J1xuLCAxNzogJzxjb250cm9sPidcbiwgMTg6ICc8YWx0PidcbiwgMTk6ICc8cGF1c2U+J1xuLCAyMDogJzxjYXBzLWxvY2s+J1xuLCAyMTogJzxpbWUtaGFuZ3VsPidcbiwgMjM6ICc8aW1lLWp1bmphPidcbiwgMjQ6ICc8aW1lLWZpbmFsPidcbiwgMjU6ICc8aW1lLWthbmppPidcbiwgMjc6ICc8ZXNjYXBlPidcbiwgMjg6ICc8aW1lLWNvbnZlcnQ+J1xuLCAyOTogJzxpbWUtbm9uY29udmVydD4nXG4sIDMwOiAnPGltZS1hY2NlcHQ+J1xuLCAzMTogJzxpbWUtbW9kZS1jaGFuZ2U+J1xuLCAyNzogJzxlc2NhcGU+J1xuLCAzMjogJzxzcGFjZT4nXG4sIDMzOiAnPHBhZ2UtdXA+J1xuLCAzNDogJzxwYWdlLWRvd24+J1xuLCAzNTogJzxlbmQ+J1xuLCAzNjogJzxob21lPidcbiwgMzc6ICc8bGVmdD4nXG4sIDM4OiAnPHVwPidcbiwgMzk6ICc8cmlnaHQ+J1xuLCA0MDogJzxkb3duPidcbiwgNDE6ICc8c2VsZWN0PidcbiwgNDI6ICc8cHJpbnQ+J1xuLCA0MzogJzxleGVjdXRlPidcbiwgNDQ6ICc8c25hcHNob3Q+J1xuLCA0NTogJzxpbnNlcnQ+J1xuLCA0NjogJzxkZWxldGU+J1xuLCA0NzogJzxoZWxwPidcbiwgOTE6ICc8bWV0YT4nICAvLyBtZXRhLWxlZnQgLS0gbm8gb25lIGhhbmRsZXMgbGVmdCBhbmQgcmlnaHQgcHJvcGVybHksIHNvIHdlIGNvZXJjZSBpbnRvIG9uZS5cbiwgOTI6ICc8bWV0YT4nICAvLyBtZXRhLXJpZ2h0XG4sIDkzOiBpc09TWCA/ICc8bWV0YT4nIDogJzxtZW51PicgICAgICAvLyBjaHJvbWUsb3BlcmEsc2FmYXJpIGFsbCByZXBvcnQgdGhpcyBmb3IgbWV0YS1yaWdodCAob3N4IG1icCkuXG4sIDk1OiAnPHNsZWVwPidcbiwgMTA2OiAnPG51bS0qPidcbiwgMTA3OiAnPG51bS0rPidcbiwgMTA4OiAnPG51bS1lbnRlcj4nXG4sIDEwOTogJzxudW0tLT4nXG4sIDExMDogJzxudW0tLj4nXG4sIDExMTogJzxudW0tLz4nXG4sIDE0NDogJzxudW0tbG9jaz4nXG4sIDE0NTogJzxzY3JvbGwtbG9jaz4nXG4sIDE2MDogJzxzaGlmdC1sZWZ0PidcbiwgMTYxOiAnPHNoaWZ0LXJpZ2h0PidcbiwgMTYyOiAnPGNvbnRyb2wtbGVmdD4nXG4sIDE2MzogJzxjb250cm9sLXJpZ2h0PidcbiwgMTY0OiAnPGFsdC1sZWZ0PidcbiwgMTY1OiAnPGFsdC1yaWdodD4nXG4sIDE2NjogJzxicm93c2VyLWJhY2s+J1xuLCAxNjc6ICc8YnJvd3Nlci1mb3J3YXJkPidcbiwgMTY4OiAnPGJyb3dzZXItcmVmcmVzaD4nXG4sIDE2OTogJzxicm93c2VyLXN0b3A+J1xuLCAxNzA6ICc8YnJvd3Nlci1zZWFyY2g+J1xuLCAxNzE6ICc8YnJvd3Nlci1mYXZvcml0ZXM+J1xuLCAxNzI6ICc8YnJvd3Nlci1ob21lPidcblxuICAvLyBmZi9vc3ggcmVwb3J0cyAnPHZvbHVtZS1tdXRlPicgZm9yICctJ1xuLCAxNzM6IGlzT1NYICYmIG1heWJlRmlyZWZveCA/ICctJyA6ICc8dm9sdW1lLW11dGU+J1xuLCAxNzQ6ICc8dm9sdW1lLWRvd24+J1xuLCAxNzU6ICc8dm9sdW1lLXVwPidcbiwgMTc2OiAnPG5leHQtdHJhY2s+J1xuLCAxNzc6ICc8cHJldi10cmFjaz4nXG4sIDE3ODogJzxzdG9wPidcbiwgMTc5OiAnPHBsYXktcGF1c2U+J1xuLCAxODA6ICc8bGF1bmNoLW1haWw+J1xuLCAxODE6ICc8bGF1bmNoLW1lZGlhLXNlbGVjdD4nXG4sIDE4MjogJzxsYXVuY2gtYXBwIDE+J1xuLCAxODM6ICc8bGF1bmNoLWFwcCAyPidcbiwgMTg2OiAnOydcbiwgMTg3OiAnPSdcbiwgMTg4OiAnLCdcbiwgMTg5OiAnLSdcbiwgMTkwOiAnLidcbiwgMTkxOiAnLydcbiwgMTkyOiAnYCdcbiwgMjE5OiAnWydcbiwgMjIwOiAnXFxcXCdcbiwgMjIxOiAnXSdcbiwgMjIyOiBcIidcIlxuLCAyMjM6ICc8bWV0YT4nXG4sIDIyNDogJzxtZXRhPicgICAgICAgLy8gZmlyZWZveCByZXBvcnRzIG1ldGEgaGVyZS5cbiwgMjI2OiAnPGFsdC1ncj4nXG4sIDIyOTogJzxpbWUtcHJvY2Vzcz4nXG4sIDIzMTogaXNPcGVyYSA/ICdgJyA6ICc8dW5pY29kZT4nXG4sIDI0NjogJzxhdHRlbnRpb24+J1xuLCAyNDc6ICc8Y3JzZWw+J1xuLCAyNDg6ICc8ZXhzZWw+J1xuLCAyNDk6ICc8ZXJhc2UtZW9mPidcbiwgMjUwOiAnPHBsYXk+J1xuLCAyNTE6ICc8em9vbT4nXG4sIDI1MjogJzxuby1uYW1lPidcbiwgMjUzOiAnPHBhLTE+J1xuLCAyNTQ6ICc8Y2xlYXI+J1xufVxuXG5mb3IoaSA9IDU4OyBpIDwgNjU7ICsraSkge1xuICBvdXRwdXRbaV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGkpXG59XG5cbi8vIDAtOVxuZm9yKGkgPSA0ODsgaSA8IDU4OyArK2kpIHtcbiAgb3V0cHV0W2ldID0gKGkgLSA0OCkrJydcbn1cblxuLy8gQS1aXG5mb3IoaSA9IDY1OyBpIDwgOTE7ICsraSkge1xuICBvdXRwdXRbaV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGkpXG59XG5cbi8vIG51bTAtOVxuZm9yKGkgPSA5NjsgaSA8IDEwNjsgKytpKSB7XG4gIG91dHB1dFtpXSA9ICc8bnVtLScrKGkgLSA5NikrJz4nXG59XG5cbi8vIEYxLUYyNFxuZm9yKGkgPSAxMTI7IGkgPCAxMzY7ICsraSkge1xuICBvdXRwdXRbaV0gPSAnRicrKGktMTExKVxufVxuIiwiLy8gQ29weXJpZ2h0IChDKSAyMDExIEdvb2dsZSBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5cbi8qKlxuICogQGZpbGVvdmVydmlldyBJbnN0YWxsIGEgbGVha3kgV2Vha01hcCBlbXVsYXRpb24gb24gcGxhdGZvcm1zIHRoYXRcbiAqIGRvbid0IHByb3ZpZGUgYSBidWlsdC1pbiBvbmUuXG4gKlxuICogPHA+QXNzdW1lcyB0aGF0IGFuIEVTNSBwbGF0Zm9ybSB3aGVyZSwgaWYge0Bjb2RlIFdlYWtNYXB9IGlzXG4gKiBhbHJlYWR5IHByZXNlbnQsIHRoZW4gaXQgY29uZm9ybXMgdG8gdGhlIGFudGljaXBhdGVkIEVTNlxuICogc3BlY2lmaWNhdGlvbi4gVG8gcnVuIHRoaXMgZmlsZSBvbiBhbiBFUzUgb3IgYWxtb3N0IEVTNVxuICogaW1wbGVtZW50YXRpb24gd2hlcmUgdGhlIHtAY29kZSBXZWFrTWFwfSBzcGVjaWZpY2F0aW9uIGRvZXMgbm90XG4gKiBxdWl0ZSBjb25mb3JtLCBydW4gPGNvZGU+cmVwYWlyRVM1LmpzPC9jb2RlPiBmaXJzdC5cbiAqXG4gKiA8cD5FdmVuIHRob3VnaCBXZWFrTWFwTW9kdWxlIGlzIG5vdCBnbG9iYWwsIHRoZSBsaW50ZXIgdGhpbmtzIGl0XG4gKiBpcywgd2hpY2ggaXMgd2h5IGl0IGlzIGluIHRoZSBvdmVycmlkZXMgbGlzdCBiZWxvdy5cbiAqXG4gKiA8cD5OT1RFOiBCZWZvcmUgdXNpbmcgdGhpcyBXZWFrTWFwIGVtdWxhdGlvbiBpbiBhIG5vbi1TRVNcbiAqIGVudmlyb25tZW50LCBzZWUgdGhlIG5vdGUgYmVsb3cgYWJvdXQgaGlkZGVuUmVjb3JkLlxuICpcbiAqIEBhdXRob3IgTWFyayBTLiBNaWxsZXJcbiAqIEByZXF1aXJlcyBjcnlwdG8sIEFycmF5QnVmZmVyLCBVaW50OEFycmF5LCBuYXZpZ2F0b3IsIGNvbnNvbGVcbiAqIEBvdmVycmlkZXMgV2Vha01hcCwgc2VzLCBQcm94eVxuICogQG92ZXJyaWRlcyBXZWFrTWFwTW9kdWxlXG4gKi9cblxuLyoqXG4gKiBUaGlzIHtAY29kZSBXZWFrTWFwfSBlbXVsYXRpb24gaXMgb2JzZXJ2YWJseSBlcXVpdmFsZW50IHRvIHRoZVxuICogRVMtSGFybW9ueSBXZWFrTWFwLCBidXQgd2l0aCBsZWFraWVyIGdhcmJhZ2UgY29sbGVjdGlvbiBwcm9wZXJ0aWVzLlxuICpcbiAqIDxwPkFzIHdpdGggdHJ1ZSBXZWFrTWFwcywgaW4gdGhpcyBlbXVsYXRpb24sIGEga2V5IGRvZXMgbm90XG4gKiByZXRhaW4gbWFwcyBpbmRleGVkIGJ5IHRoYXQga2V5IGFuZCAoY3J1Y2lhbGx5KSBhIG1hcCBkb2VzIG5vdFxuICogcmV0YWluIHRoZSBrZXlzIGl0IGluZGV4ZXMuIEEgbWFwIGJ5IGl0c2VsZiBhbHNvIGRvZXMgbm90IHJldGFpblxuICogdGhlIHZhbHVlcyBhc3NvY2lhdGVkIHdpdGggdGhhdCBtYXAuXG4gKlxuICogPHA+SG93ZXZlciwgdGhlIHZhbHVlcyBhc3NvY2lhdGVkIHdpdGggYSBrZXkgaW4gc29tZSBtYXAgYXJlXG4gKiByZXRhaW5lZCBzbyBsb25nIGFzIHRoYXQga2V5IGlzIHJldGFpbmVkIGFuZCB0aG9zZSBhc3NvY2lhdGlvbnMgYXJlXG4gKiBub3Qgb3ZlcnJpZGRlbi4gRm9yIGV4YW1wbGUsIHdoZW4gdXNlZCB0byBzdXBwb3J0IG1lbWJyYW5lcywgYWxsXG4gKiB2YWx1ZXMgZXhwb3J0ZWQgZnJvbSBhIGdpdmVuIG1lbWJyYW5lIHdpbGwgbGl2ZSBmb3IgdGhlIGxpZmV0aW1lXG4gKiB0aGV5IHdvdWxkIGhhdmUgaGFkIGluIHRoZSBhYnNlbmNlIG9mIGFuIGludGVycG9zZWQgbWVtYnJhbmUuIEV2ZW5cbiAqIHdoZW4gdGhlIG1lbWJyYW5lIGlzIHJldm9rZWQsIGFsbCBvYmplY3RzIHRoYXQgd291bGQgaGF2ZSBiZWVuXG4gKiByZWFjaGFibGUgaW4gdGhlIGFic2VuY2Ugb2YgcmV2b2NhdGlvbiB3aWxsIHN0aWxsIGJlIHJlYWNoYWJsZSwgYXNcbiAqIGZhciBhcyB0aGUgR0MgY2FuIHRlbGwsIGV2ZW4gdGhvdWdoIHRoZXkgd2lsbCBubyBsb25nZXIgYmUgcmVsZXZhbnRcbiAqIHRvIG9uZ29pbmcgY29tcHV0YXRpb24uXG4gKlxuICogPHA+VGhlIEFQSSBpbXBsZW1lbnRlZCBoZXJlIGlzIGFwcHJveGltYXRlbHkgdGhlIEFQSSBhcyBpbXBsZW1lbnRlZFxuICogaW4gRkY2LjBhMSBhbmQgYWdyZWVkIHRvIGJ5IE1hcmtNLCBBbmRyZWFzIEdhbCwgYW5kIERhdmUgSGVybWFuLFxuICogcmF0aGVyIHRoYW4gdGhlIG9mZmlhbGx5IGFwcHJvdmVkIHByb3Bvc2FsIHBhZ2UuIFRPRE8oZXJpZ2h0cyk6XG4gKiB1cGdyYWRlIHRoZSBlY21hc2NyaXB0IFdlYWtNYXAgcHJvcG9zYWwgcGFnZSB0byBleHBsYWluIHRoaXMgQVBJXG4gKiBjaGFuZ2UgYW5kIHByZXNlbnQgdG8gRWNtYVNjcmlwdCBjb21taXR0ZWUgZm9yIHRoZWlyIGFwcHJvdmFsLlxuICpcbiAqIDxwPlRoZSBmaXJzdCBkaWZmZXJlbmNlIGJldHdlZW4gdGhlIGVtdWxhdGlvbiBoZXJlIGFuZCB0aGF0IGluXG4gKiBGRjYuMGExIGlzIHRoZSBwcmVzZW5jZSBvZiBub24gZW51bWVyYWJsZSB7QGNvZGUgZ2V0X19fLCBoYXNfX18sXG4gKiBzZXRfX18sIGFuZCBkZWxldGVfX199IG1ldGhvZHMgb24gV2Vha01hcCBpbnN0YW5jZXMgdG8gcmVwcmVzZW50XG4gKiB3aGF0IHdvdWxkIGJlIHRoZSBoaWRkZW4gaW50ZXJuYWwgcHJvcGVydGllcyBvZiBhIHByaW1pdGl2ZVxuICogaW1wbGVtZW50YXRpb24uIFdoZXJlYXMgdGhlIEZGNi4wYTEgV2Vha01hcC5wcm90b3R5cGUgbWV0aG9kc1xuICogcmVxdWlyZSB0aGVpciB7QGNvZGUgdGhpc30gdG8gYmUgYSBnZW51aW5lIFdlYWtNYXAgaW5zdGFuY2UgKGkuZS4sXG4gKiBhbiBvYmplY3Qgb2Yge0Bjb2RlIFtbQ2xhc3NdXX0gXCJXZWFrTWFwfSksIHNpbmNlIHRoZXJlIGlzIG5vdGhpbmdcbiAqIHVuZm9yZ2VhYmxlIGFib3V0IHRoZSBwc2V1ZG8taW50ZXJuYWwgbWV0aG9kIG5hbWVzIHVzZWQgaGVyZSxcbiAqIG5vdGhpbmcgcHJldmVudHMgdGhlc2UgZW11bGF0ZWQgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBiZWluZ1xuICogYXBwbGllZCB0byBub24tV2Vha01hcHMgd2l0aCBwc2V1ZG8taW50ZXJuYWwgbWV0aG9kcyBvZiB0aGUgc2FtZVxuICogbmFtZXMuXG4gKlxuICogPHA+QW5vdGhlciBkaWZmZXJlbmNlIGlzIHRoYXQgb3VyIGVtdWxhdGVkIHtAY29kZVxuICogV2Vha01hcC5wcm90b3R5cGV9IGlzIG5vdCBpdHNlbGYgYSBXZWFrTWFwLiBBIHByb2JsZW0gd2l0aCB0aGVcbiAqIGN1cnJlbnQgRkY2LjBhMSBBUEkgaXMgdGhhdCBXZWFrTWFwLnByb3RvdHlwZSBpcyBpdHNlbGYgYSBXZWFrTWFwXG4gKiBwcm92aWRpbmcgYW1iaWVudCBtdXRhYmlsaXR5IGFuZCBhbiBhbWJpZW50IGNvbW11bmljYXRpb25zXG4gKiBjaGFubmVsLiBUaHVzLCBpZiBhIFdlYWtNYXAgaXMgYWxyZWFkeSBwcmVzZW50IGFuZCBoYXMgdGhpc1xuICogcHJvYmxlbSwgcmVwYWlyRVM1LmpzIHdyYXBzIGl0IGluIGEgc2FmZSB3cmFwcHBlciBpbiBvcmRlciB0b1xuICogcHJldmVudCBhY2Nlc3MgdG8gdGhpcyBjaGFubmVsLiAoU2VlXG4gKiBQQVRDSF9NVVRBQkxFX0ZST1pFTl9XRUFLTUFQX1BST1RPIGluIHJlcGFpckVTNS5qcykuXG4gKi9cblxuLyoqXG4gKiBJZiB0aGlzIGlzIGEgZnVsbCA8YSBocmVmPVxuICogXCJodHRwOi8vY29kZS5nb29nbGUuY29tL3AvZXMtbGFiL3dpa2kvU2VjdXJlYWJsZUVTNVwiXG4gKiA+c2VjdXJlYWJsZSBFUzU8L2E+IHBsYXRmb3JtIGFuZCB0aGUgRVMtSGFybW9ueSB7QGNvZGUgV2Vha01hcH0gaXNcbiAqIGFic2VudCwgaW5zdGFsbCBhbiBhcHByb3hpbWF0ZSBlbXVsYXRpb24uXG4gKlxuICogPHA+SWYgV2Vha01hcCBpcyBwcmVzZW50IGJ1dCBjYW5ub3Qgc3RvcmUgc29tZSBvYmplY3RzLCB1c2Ugb3VyIGFwcHJveGltYXRlXG4gKiBlbXVsYXRpb24gYXMgYSB3cmFwcGVyLlxuICpcbiAqIDxwPklmIHRoaXMgaXMgYWxtb3N0IGEgc2VjdXJlYWJsZSBFUzUgcGxhdGZvcm0sIHRoZW4gV2Vha01hcC5qc1xuICogc2hvdWxkIGJlIHJ1biBhZnRlciByZXBhaXJFUzUuanMuXG4gKlxuICogPHA+U2VlIHtAY29kZSBXZWFrTWFwfSBmb3IgZG9jdW1lbnRhdGlvbiBvZiB0aGUgZ2FyYmFnZSBjb2xsZWN0aW9uXG4gKiBwcm9wZXJ0aWVzIG9mIHRoaXMgV2Vha01hcCBlbXVsYXRpb24uXG4gKi9cbihmdW5jdGlvbiBXZWFrTWFwTW9kdWxlKCkge1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBpZiAodHlwZW9mIHNlcyAhPT0gJ3VuZGVmaW5lZCcgJiYgc2VzLm9rICYmICFzZXMub2soKSkge1xuICAgIC8vIGFscmVhZHkgdG9vIGJyb2tlbiwgc28gZ2l2ZSB1cFxuICAgIHJldHVybjtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbiBzb21lIGNhc2VzIChjdXJyZW50IEZpcmVmb3gpLCB3ZSBtdXN0IG1ha2UgYSBjaG9pY2UgYmV0d2VlZW4gYVxuICAgKiBXZWFrTWFwIHdoaWNoIGlzIGNhcGFibGUgb2YgdXNpbmcgYWxsIHZhcmlldGllcyBvZiBob3N0IG9iamVjdHMgYXNcbiAgICoga2V5cyBhbmQgb25lIHdoaWNoIGlzIGNhcGFibGUgb2Ygc2FmZWx5IHVzaW5nIHByb3hpZXMgYXMga2V5cy4gU2VlXG4gICAqIGNvbW1lbnRzIGJlbG93IGFib3V0IEhvc3RXZWFrTWFwIGFuZCBEb3VibGVXZWFrTWFwIGZvciBkZXRhaWxzLlxuICAgKlxuICAgKiBUaGlzIGZ1bmN0aW9uICh3aGljaCBpcyBhIGdsb2JhbCwgbm90IGV4cG9zZWQgdG8gZ3Vlc3RzKSBtYXJrcyBhXG4gICAqIFdlYWtNYXAgYXMgcGVybWl0dGVkIHRvIGRvIHdoYXQgaXMgbmVjZXNzYXJ5IHRvIGluZGV4IGFsbCBob3N0XG4gICAqIG9iamVjdHMsIGF0IHRoZSBjb3N0IG9mIG1ha2luZyBpdCB1bnNhZmUgZm9yIHByb3hpZXMuXG4gICAqXG4gICAqIERvIG5vdCBhcHBseSB0aGlzIGZ1bmN0aW9uIHRvIGFueXRoaW5nIHdoaWNoIGlzIG5vdCBhIGdlbnVpbmVcbiAgICogZnJlc2ggV2Vha01hcC5cbiAgICovXG4gIGZ1bmN0aW9uIHdlYWtNYXBQZXJtaXRIb3N0T2JqZWN0cyhtYXApIHtcbiAgICAvLyBpZGVudGl0eSBvZiBmdW5jdGlvbiB1c2VkIGFzIGEgc2VjcmV0IC0tIGdvb2QgZW5vdWdoIGFuZCBjaGVhcFxuICAgIGlmIChtYXAucGVybWl0SG9zdE9iamVjdHNfX18pIHtcbiAgICAgIG1hcC5wZXJtaXRIb3N0T2JqZWN0c19fXyh3ZWFrTWFwUGVybWl0SG9zdE9iamVjdHMpO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHNlcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBzZXMud2Vha01hcFBlcm1pdEhvc3RPYmplY3RzID0gd2Vha01hcFBlcm1pdEhvc3RPYmplY3RzO1xuICB9XG5cbiAgLy8gSUUgMTEgaGFzIG5vIFByb3h5IGJ1dCBoYXMgYSBicm9rZW4gV2Vha01hcCBzdWNoIHRoYXQgd2UgbmVlZCB0byBwYXRjaFxuICAvLyBpdCB1c2luZyBEb3VibGVXZWFrTWFwOyB0aGlzIGZsYWcgdGVsbHMgRG91YmxlV2Vha01hcCBzby5cbiAgdmFyIGRvdWJsZVdlYWtNYXBDaGVja1NpbGVudEZhaWx1cmUgPSBmYWxzZTtcblxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IGEgZ29vZC1lbm91Z2ggV2Vha01hcCBpbXBsZW1lbnRhdGlvbiwgYW5kIGlmIHNvXG4gIC8vIGV4aXQgd2l0aG91dCByZXBsYWNpbmcgaXQuXG4gIGlmICh0eXBlb2YgV2Vha01hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBIb3N0V2Vha01hcCA9IFdlYWtNYXA7XG4gICAgLy8gVGhlcmUgaXMgYSBXZWFrTWFwIC0tIGlzIGl0IGdvb2QgZW5vdWdoP1xuICAgIGlmICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAvRmlyZWZveC8udGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSkge1xuICAgICAgLy8gV2UncmUgbm93ICphc3N1bWluZyBub3QqLCBiZWNhdXNlIGFzIG9mIHRoaXMgd3JpdGluZyAoMjAxMy0wNS0wNilcbiAgICAgIC8vIEZpcmVmb3gncyBXZWFrTWFwcyBoYXZlIGEgbWlzY2VsbGFueSBvZiBvYmplY3RzIHRoZXkgd29uJ3QgYWNjZXB0LCBhbmRcbiAgICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gbWFrZSBhbiBleGhhdXN0aXZlIGxpc3QsIGFuZCB0ZXN0aW5nIGZvciBqdXN0IG9uZVxuICAgICAgLy8gd2lsbCBiZSBhIHByb2JsZW0gaWYgdGhhdCBvbmUgaXMgZml4ZWQgYWxvbmUgKGFzIHRoZXkgZGlkIGZvciBFdmVudCkuXG5cbiAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGxhdGZvcm0gdGhhdCB3ZSAqY2FuKiByZWxpYWJseSB0ZXN0IG9uLCBoZXJlJ3MgaG93IHRvXG4gICAgICAvLyBkbyBpdDpcbiAgICAgIC8vICB2YXIgcHJvYmxlbWF0aWMgPSAuLi4gO1xuICAgICAgLy8gIHZhciB0ZXN0SG9zdE1hcCA9IG5ldyBIb3N0V2Vha01hcCgpO1xuICAgICAgLy8gIHRyeSB7XG4gICAgICAvLyAgICB0ZXN0SG9zdE1hcC5zZXQocHJvYmxlbWF0aWMsIDEpOyAgLy8gRmlyZWZveCAyMCB3aWxsIHRocm93IGhlcmVcbiAgICAgIC8vICAgIGlmICh0ZXN0SG9zdE1hcC5nZXQocHJvYmxlbWF0aWMpID09PSAxKSB7XG4gICAgICAvLyAgICAgIHJldHVybjtcbiAgICAgIC8vICAgIH1cbiAgICAgIC8vICB9IGNhdGNoIChlKSB7fVxuXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIElFIDExIGJ1ZzogV2Vha01hcHMgc2lsZW50bHkgZmFpbCB0byBzdG9yZSBmcm96ZW4gb2JqZWN0cy5cbiAgICAgIHZhciB0ZXN0TWFwID0gbmV3IEhvc3RXZWFrTWFwKCk7XG4gICAgICB2YXIgdGVzdE9iamVjdCA9IE9iamVjdC5mcmVlemUoe30pO1xuICAgICAgdGVzdE1hcC5zZXQodGVzdE9iamVjdCwgMSk7XG4gICAgICBpZiAodGVzdE1hcC5nZXQodGVzdE9iamVjdCkgIT09IDEpIHtcbiAgICAgICAgZG91YmxlV2Vha01hcENoZWNrU2lsZW50RmFpbHVyZSA9IHRydWU7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaCB0byBpbnN0YWxsaW5nIG91ciBXZWFrTWFwLlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBXZWFrTWFwO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGhvcCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG4gIHZhciBnb3BuID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXM7XG4gIHZhciBkZWZQcm9wID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuICB2YXIgaXNFeHRlbnNpYmxlID0gT2JqZWN0LmlzRXh0ZW5zaWJsZTtcblxuICAvKipcbiAgICogU2VjdXJpdHkgZGVwZW5kcyBvbiBISURERU5fTkFNRSBiZWluZyBib3RoIDxpPnVuZ3Vlc3NhYmxlPC9pPiBhbmRcbiAgICogPGk+dW5kaXNjb3ZlcmFibGU8L2k+IGJ5IHVudHJ1c3RlZCBjb2RlLlxuICAgKlxuICAgKiA8cD5HaXZlbiB0aGUga25vd24gd2Vha25lc3NlcyBvZiBNYXRoLnJhbmRvbSgpIG9uIGV4aXN0aW5nXG4gICAqIGJyb3dzZXJzLCBpdCBkb2VzIG5vdCBnZW5lcmF0ZSB1bmd1ZXNzYWJpbGl0eSB3ZSBjYW4gYmUgY29uZmlkZW50XG4gICAqIG9mLlxuICAgKlxuICAgKiA8cD5JdCBpcyB0aGUgbW9ua2V5IHBhdGNoaW5nIGxvZ2ljIGluIHRoaXMgZmlsZSB0aGF0IGlzIGludGVuZGVkXG4gICAqIHRvIGVuc3VyZSB1bmRpc2NvdmVyYWJpbGl0eS4gVGhlIGJhc2ljIGlkZWEgaXMgdGhhdCB0aGVyZSBhcmVcbiAgICogdGhyZWUgZnVuZGFtZW50YWwgbWVhbnMgb2YgZGlzY292ZXJpbmcgcHJvcGVydGllcyBvZiBhbiBvYmplY3Q6XG4gICAqIFRoZSBmb3IvaW4gbG9vcCwgT2JqZWN0LmtleXMoKSwgYW5kIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKCksXG4gICAqIGFzIHdlbGwgYXMgc29tZSBwcm9wb3NlZCBFUzYgZXh0ZW5zaW9ucyB0aGF0IGFwcGVhciBvbiBvdXJcbiAgICogd2hpdGVsaXN0LiBUaGUgZmlyc3QgdHdvIG9ubHkgZGlzY292ZXIgZW51bWVyYWJsZSBwcm9wZXJ0aWVzLCBhbmRcbiAgICogd2Ugb25seSB1c2UgSElEREVOX05BTUUgdG8gbmFtZSBhIG5vbi1lbnVtZXJhYmxlIHByb3BlcnR5LCBzbyB0aGVcbiAgICogb25seSByZW1haW5pbmcgdGhyZWF0IHNob3VsZCBiZSBnZXRPd25Qcm9wZXJ0eU5hbWVzIGFuZCBzb21lXG4gICAqIHByb3Bvc2VkIEVTNiBleHRlbnNpb25zIHRoYXQgYXBwZWFyIG9uIG91ciB3aGl0ZWxpc3QuIFdlIG1vbmtleVxuICAgKiBwYXRjaCB0aGVtIHRvIHJlbW92ZSBISURERU5fTkFNRSBmcm9tIHRoZSBsaXN0IG9mIHByb3BlcnRpZXMgdGhleVxuICAgKiByZXR1cm5zLlxuICAgKlxuICAgKiA8cD5UT0RPKGVyaWdodHMpOiBPbiBhIHBsYXRmb3JtIHdpdGggYnVpbHQtaW4gUHJveGllcywgcHJveGllc1xuICAgKiBjb3VsZCBiZSB1c2VkIHRvIHRyYXAgYW5kIHRoZXJlYnkgZGlzY292ZXIgdGhlIEhJRERFTl9OQU1FLCBzbyB3ZVxuICAgKiBuZWVkIHRvIG1vbmtleSBwYXRjaCBQcm94eS5jcmVhdGUsIFByb3h5LmNyZWF0ZUZ1bmN0aW9uLCBldGMsIGluXG4gICAqIG9yZGVyIHRvIHdyYXAgdGhlIHByb3ZpZGVkIGhhbmRsZXIgd2l0aCB0aGUgcmVhbCBoYW5kbGVyIHdoaWNoXG4gICAqIGZpbHRlcnMgb3V0IGFsbCB0cmFwcyB1c2luZyBISURERU5fTkFNRS5cbiAgICpcbiAgICogPHA+VE9ETyhlcmlnaHRzKTogUmV2aXNpdCBNaWtlIFN0YXkncyBzdWdnZXN0aW9uIHRoYXQgd2UgdXNlIGFuXG4gICAqIGVuY2Fwc3VsYXRlZCBmdW5jdGlvbiBhdCBhIG5vdC1uZWNlc3NhcmlseS1zZWNyZXQgbmFtZSwgd2hpY2hcbiAgICogdXNlcyB0aGUgU3RpZWdsZXIgc2hhcmVkLXN0YXRlIHJpZ2h0cyBhbXBsaWZpY2F0aW9uIHBhdHRlcm4gdG9cbiAgICogcmV2ZWFsIHRoZSBhc3NvY2lhdGVkIHZhbHVlIG9ubHkgdG8gdGhlIFdlYWtNYXAgaW4gd2hpY2ggdGhpcyBrZXlcbiAgICogaXMgYXNzb2NpYXRlZCB3aXRoIHRoYXQgdmFsdWUuIFNpbmNlIG9ubHkgdGhlIGtleSByZXRhaW5zIHRoZVxuICAgKiBmdW5jdGlvbiwgdGhlIGZ1bmN0aW9uIGNhbiBhbHNvIHJlbWVtYmVyIHRoZSBrZXkgd2l0aG91dCBjYXVzaW5nXG4gICAqIGxlYWthZ2Ugb2YgdGhlIGtleSwgc28gdGhpcyBkb2Vzbid0IHZpb2xhdGUgb3VyIGdlbmVyYWwgZ2NcbiAgICogZ29hbHMuIEluIGFkZGl0aW9uLCBiZWNhdXNlIHRoZSBuYW1lIG5lZWQgbm90IGJlIGEgZ3VhcmRlZFxuICAgKiBzZWNyZXQsIHdlIGNvdWxkIGVmZmljaWVudGx5IGhhbmRsZSBjcm9zcy1mcmFtZSBmcm96ZW4ga2V5cy5cbiAgICovXG4gIHZhciBISURERU5fTkFNRV9QUkVGSVggPSAnd2Vha21hcDonO1xuICB2YXIgSElEREVOX05BTUUgPSBISURERU5fTkFNRV9QUkVGSVggKyAnaWRlbnQ6JyArIE1hdGgucmFuZG9tKCkgKyAnX19fJztcblxuICBpZiAodHlwZW9mIGNyeXB0byAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgIHR5cGVvZiBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICB0eXBlb2YgQXJyYXlCdWZmZXIgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHR5cGVvZiBVaW50OEFycmF5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGFiID0gbmV3IEFycmF5QnVmZmVyKDI1KTtcbiAgICB2YXIgdThzID0gbmV3IFVpbnQ4QXJyYXkoYWIpO1xuICAgIGNyeXB0by5nZXRSYW5kb21WYWx1ZXModThzKTtcbiAgICBISURERU5fTkFNRSA9IEhJRERFTl9OQU1FX1BSRUZJWCArICdyYW5kOicgK1xuICAgICAgQXJyYXkucHJvdG90eXBlLm1hcC5jYWxsKHU4cywgZnVuY3Rpb24odTgpIHtcbiAgICAgICAgcmV0dXJuICh1OCAlIDM2KS50b1N0cmluZygzNik7XG4gICAgICB9KS5qb2luKCcnKSArICdfX18nO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNOb3RIaWRkZW5OYW1lKG5hbWUpIHtcbiAgICByZXR1cm4gIShcbiAgICAgICAgbmFtZS5zdWJzdHIoMCwgSElEREVOX05BTUVfUFJFRklYLmxlbmd0aCkgPT0gSElEREVOX05BTUVfUFJFRklYICYmXG4gICAgICAgIG5hbWUuc3Vic3RyKG5hbWUubGVuZ3RoIC0gMykgPT09ICdfX18nKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNb25rZXkgcGF0Y2ggZ2V0T3duUHJvcGVydHlOYW1lcyB0byBhdm9pZCByZXZlYWxpbmcgdGhlXG4gICAqIEhJRERFTl9OQU1FLlxuICAgKlxuICAgKiA8cD5UaGUgRVM1LjEgc3BlYyByZXF1aXJlcyBlYWNoIG5hbWUgdG8gYXBwZWFyIG9ubHkgb25jZSwgYnV0IGFzXG4gICAqIG9mIHRoaXMgd3JpdGluZywgdGhpcyByZXF1aXJlbWVudCBpcyBjb250cm92ZXJzaWFsIGZvciBFUzYsIHNvIHdlXG4gICAqIG1hZGUgdGhpcyBjb2RlIHJvYnVzdCBhZ2FpbnN0IHRoaXMgY2FzZS4gSWYgdGhlIHJlc3VsdGluZyBleHRyYVxuICAgKiBzZWFyY2ggdHVybnMgb3V0IHRvIGJlIGV4cGVuc2l2ZSwgd2UgY2FuIHByb2JhYmx5IHJlbGF4IHRoaXMgb25jZVxuICAgKiBFUzYgaXMgYWRlcXVhdGVseSBzdXBwb3J0ZWQgb24gYWxsIG1ham9yIGJyb3dzZXJzLCBpZmYgbm8gYnJvd3NlclxuICAgKiB2ZXJzaW9ucyB3ZSBzdXBwb3J0IGF0IHRoYXQgdGltZSBoYXZlIHJlbGF4ZWQgdGhpcyBjb25zdHJhaW50XG4gICAqIHdpdGhvdXQgcHJvdmlkaW5nIGJ1aWx0LWluIEVTNiBXZWFrTWFwcy5cbiAgICovXG4gIGRlZlByb3AoT2JqZWN0LCAnZ2V0T3duUHJvcGVydHlOYW1lcycsIHtcbiAgICB2YWx1ZTogZnVuY3Rpb24gZmFrZUdldE93blByb3BlcnR5TmFtZXMob2JqKSB7XG4gICAgICByZXR1cm4gZ29wbihvYmopLmZpbHRlcihpc05vdEhpZGRlbk5hbWUpO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIGdldFByb3BlcnR5TmFtZXMgaXMgbm90IGluIEVTNSBidXQgaXQgaXMgcHJvcG9zZWQgZm9yIEVTNiBhbmRcbiAgICogZG9lcyBhcHBlYXIgaW4gb3VyIHdoaXRlbGlzdCwgc28gd2UgbmVlZCB0byBjbGVhbiBpdCB0b28uXG4gICAqL1xuICBpZiAoJ2dldFByb3BlcnR5TmFtZXMnIGluIE9iamVjdCkge1xuICAgIHZhciBvcmlnaW5hbEdldFByb3BlcnR5TmFtZXMgPSBPYmplY3QuZ2V0UHJvcGVydHlOYW1lcztcbiAgICBkZWZQcm9wKE9iamVjdCwgJ2dldFByb3BlcnR5TmFtZXMnLCB7XG4gICAgICB2YWx1ZTogZnVuY3Rpb24gZmFrZUdldFByb3BlcnR5TmFtZXMob2JqKSB7XG4gICAgICAgIHJldHVybiBvcmlnaW5hbEdldFByb3BlcnR5TmFtZXMob2JqKS5maWx0ZXIoaXNOb3RIaWRkZW5OYW1lKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiA8cD5UbyB0cmVhdCBvYmplY3RzIGFzIGlkZW50aXR5LWtleXMgd2l0aCByZWFzb25hYmxlIGVmZmljaWVuY3lcbiAgICogb24gRVM1IGJ5IGl0c2VsZiAoaS5lLiwgd2l0aG91dCBhbnkgb2JqZWN0LWtleWVkIGNvbGxlY3Rpb25zKSwgd2VcbiAgICogbmVlZCB0byBhZGQgYSBoaWRkZW4gcHJvcGVydHkgdG8gc3VjaCBrZXkgb2JqZWN0cyB3aGVuIHdlXG4gICAqIGNhbi4gVGhpcyByYWlzZXMgc2V2ZXJhbCBpc3N1ZXM6XG4gICAqIDx1bD5cbiAgICogPGxpPkFycmFuZ2luZyB0byBhZGQgdGhpcyBwcm9wZXJ0eSB0byBvYmplY3RzIGJlZm9yZSB3ZSBsb3NlIHRoZVxuICAgKiAgICAgY2hhbmNlLCBhbmRcbiAgICogPGxpPkhpZGluZyB0aGUgZXhpc3RlbmNlIG9mIHRoaXMgbmV3IHByb3BlcnR5IGZyb20gbW9zdFxuICAgKiAgICAgSmF2YVNjcmlwdCBjb2RlLlxuICAgKiA8bGk+UHJldmVudGluZyA8aT5jZXJ0aWZpY2F0aW9uIHRoZWZ0PC9pPiwgd2hlcmUgb25lIG9iamVjdCBpc1xuICAgKiAgICAgY3JlYXRlZCBmYWxzZWx5IGNsYWltaW5nIHRvIGJlIHRoZSBrZXkgb2YgYW4gYXNzb2NpYXRpb25cbiAgICogICAgIGFjdHVhbGx5IGtleWVkIGJ5IGFub3RoZXIgb2JqZWN0LlxuICAgKiA8bGk+UHJldmVudGluZyA8aT52YWx1ZSB0aGVmdDwvaT4sIHdoZXJlIHVudHJ1c3RlZCBjb2RlIHdpdGhcbiAgICogICAgIGFjY2VzcyB0byBhIGtleSBvYmplY3QgYnV0IG5vdCBhIHdlYWsgbWFwIG5ldmVydGhlbGVzc1xuICAgKiAgICAgb2J0YWlucyBhY2Nlc3MgdG8gdGhlIHZhbHVlIGFzc29jaWF0ZWQgd2l0aCB0aGF0IGtleSBpbiB0aGF0XG4gICAqICAgICB3ZWFrIG1hcC5cbiAgICogPC91bD5cbiAgICogV2UgZG8gc28gYnlcbiAgICogPHVsPlxuICAgKiA8bGk+TWFraW5nIHRoZSBuYW1lIG9mIHRoZSBoaWRkZW4gcHJvcGVydHkgdW5ndWVzc2FibGUsIHNvIFwiW11cIlxuICAgKiAgICAgaW5kZXhpbmcsIHdoaWNoIHdlIGNhbm5vdCBpbnRlcmNlcHQsIGNhbm5vdCBiZSB1c2VkIHRvIGFjY2Vzc1xuICAgKiAgICAgYSBwcm9wZXJ0eSB3aXRob3V0IGtub3dpbmcgdGhlIG5hbWUuXG4gICAqIDxsaT5NYWtpbmcgdGhlIGhpZGRlbiBwcm9wZXJ0eSBub24tZW51bWVyYWJsZSwgc28gd2UgbmVlZCBub3RcbiAgICogICAgIHdvcnJ5IGFib3V0IGZvci1pbiBsb29wcyBvciB7QGNvZGUgT2JqZWN0LmtleXN9LFxuICAgKiA8bGk+bW9ua2V5IHBhdGNoaW5nIHRob3NlIHJlZmxlY3RpdmUgbWV0aG9kcyB0aGF0IHdvdWxkXG4gICAqICAgICBwcmV2ZW50IGV4dGVuc2lvbnMsIHRvIGFkZCB0aGlzIGhpZGRlbiBwcm9wZXJ0eSBmaXJzdCxcbiAgICogPGxpPm1vbmtleSBwYXRjaGluZyB0aG9zZSBtZXRob2RzIHRoYXQgd291bGQgcmV2ZWFsIHRoaXNcbiAgICogICAgIGhpZGRlbiBwcm9wZXJ0eS5cbiAgICogPC91bD5cbiAgICogVW5mb3J0dW5hdGVseSwgYmVjYXVzZSBvZiBzYW1lLW9yaWdpbiBpZnJhbWVzLCB3ZSBjYW5ub3QgcmVsaWFibHlcbiAgICogYWRkIHRoaXMgaGlkZGVuIHByb3BlcnR5IGJlZm9yZSBhbiBvYmplY3QgYmVjb21lc1xuICAgKiBub24tZXh0ZW5zaWJsZS4gSW5zdGVhZCwgaWYgd2UgZW5jb3VudGVyIGEgbm9uLWV4dGVuc2libGUgb2JqZWN0XG4gICAqIHdpdGhvdXQgYSBoaWRkZW4gcmVjb3JkIHRoYXQgd2UgY2FuIGRldGVjdCAod2hldGhlciBvciBub3QgaXQgaGFzXG4gICAqIGEgaGlkZGVuIHJlY29yZCBzdG9yZWQgdW5kZXIgYSBuYW1lIHNlY3JldCB0byB1cyksIHRoZW4gd2UganVzdFxuICAgKiB1c2UgdGhlIGtleSBvYmplY3QgaXRzZWxmIHRvIHJlcHJlc2VudCBpdHMgaWRlbnRpdHkgaW4gYSBicnV0ZVxuICAgKiBmb3JjZSBsZWFreSBtYXAgc3RvcmVkIGluIHRoZSB3ZWFrIG1hcCwgbG9zaW5nIGFsbCB0aGUgYWR2YW50YWdlc1xuICAgKiBvZiB3ZWFrbmVzcyBmb3IgdGhlc2UuXG4gICAqL1xuICBmdW5jdGlvbiBnZXRIaWRkZW5SZWNvcmQoa2V5KSB7XG4gICAgaWYgKGtleSAhPT0gT2JqZWN0KGtleSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ05vdCBhbiBvYmplY3Q6ICcgKyBrZXkpO1xuICAgIH1cbiAgICB2YXIgaGlkZGVuUmVjb3JkID0ga2V5W0hJRERFTl9OQU1FXTtcbiAgICBpZiAoaGlkZGVuUmVjb3JkICYmIGhpZGRlblJlY29yZC5rZXkgPT09IGtleSkgeyByZXR1cm4gaGlkZGVuUmVjb3JkOyB9XG4gICAgaWYgKCFpc0V4dGVuc2libGUoa2V5KSkge1xuICAgICAgLy8gV2VhayBtYXAgbXVzdCBicnV0ZSBmb3JjZSwgYXMgZXhwbGFpbmVkIGluIGRvYy1jb21tZW50IGFib3ZlLlxuICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICB9XG5cbiAgICAvLyBUaGUgaGlkZGVuUmVjb3JkIGFuZCB0aGUga2V5IHBvaW50IGRpcmVjdGx5IGF0IGVhY2ggb3RoZXIsIHZpYVxuICAgIC8vIHRoZSBcImtleVwiIGFuZCBISURERU5fTkFNRSBwcm9wZXJ0aWVzIHJlc3BlY3RpdmVseS4gVGhlIGtleVxuICAgIC8vIGZpZWxkIGlzIGZvciBxdWlja2x5IHZlcmlmeWluZyB0aGF0IHRoaXMgaGlkZGVuIHJlY29yZCBpcyBhblxuICAgIC8vIG93biBwcm9wZXJ0eSwgbm90IGEgaGlkZGVuIHJlY29yZCBmcm9tIHVwIHRoZSBwcm90b3R5cGUgY2hhaW4uXG4gICAgLy9cbiAgICAvLyBOT1RFOiBCZWNhdXNlIHRoaXMgV2Vha01hcCBlbXVsYXRpb24gaXMgbWVhbnQgb25seSBmb3Igc3lzdGVtcyBsaWtlXG4gICAgLy8gU0VTIHdoZXJlIE9iamVjdC5wcm90b3R5cGUgaXMgZnJvemVuIHdpdGhvdXQgYW55IG51bWVyaWNcbiAgICAvLyBwcm9wZXJ0aWVzLCBpdCBpcyBvayB0byB1c2UgYW4gb2JqZWN0IGxpdGVyYWwgZm9yIHRoZSBoaWRkZW5SZWNvcmQuXG4gICAgLy8gVGhpcyBoYXMgdHdvIGFkdmFudGFnZXM6XG4gICAgLy8gKiBJdCBpcyBtdWNoIGZhc3RlciBpbiBhIHBlcmZvcm1hbmNlIGNyaXRpY2FsIHBsYWNlXG4gICAgLy8gKiBJdCBhdm9pZHMgcmVseWluZyBvbiBPYmplY3QuY3JlYXRlKG51bGwpLCB3aGljaCBoYWQgYmVlblxuICAgIC8vICAgcHJvYmxlbWF0aWMgb24gQ2hyb21lIDI4LjAuMTQ4MC4wLiBTZWVcbiAgICAvLyAgIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvZ29vZ2xlLWNhamEvaXNzdWVzL2RldGFpbD9pZD0xNjg3XG4gICAgaGlkZGVuUmVjb3JkID0geyBrZXk6IGtleSB9O1xuXG4gICAgLy8gV2hlbiB1c2luZyB0aGlzIFdlYWtNYXAgZW11bGF0aW9uIG9uIHBsYXRmb3JtcyB3aGVyZVxuICAgIC8vIE9iamVjdC5wcm90b3R5cGUgbWlnaHQgbm90IGJlIGZyb3plbiBhbmQgT2JqZWN0LmNyZWF0ZShudWxsKSBpc1xuICAgIC8vIHJlbGlhYmxlLCB1c2UgdGhlIGZvbGxvd2luZyB0d28gY29tbWVudGVkIG91dCBsaW5lcyBpbnN0ZWFkLlxuICAgIC8vIGhpZGRlblJlY29yZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgLy8gaGlkZGVuUmVjb3JkLmtleSA9IGtleTtcblxuICAgIC8vIFBsZWFzZSBjb250YWN0IHVzIGlmIHlvdSBuZWVkIHRoaXMgdG8gd29yayBvbiBwbGF0Zm9ybXMgd2hlcmVcbiAgICAvLyBPYmplY3QucHJvdG90eXBlIG1pZ2h0IG5vdCBiZSBmcm96ZW4gYW5kXG4gICAgLy8gT2JqZWN0LmNyZWF0ZShudWxsKSBtaWdodCBub3QgYmUgcmVsaWFibGUuXG5cbiAgICB0cnkge1xuICAgICAgZGVmUHJvcChrZXksIEhJRERFTl9OQU1FLCB7XG4gICAgICAgIHZhbHVlOiBoaWRkZW5SZWNvcmQsXG4gICAgICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2VcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGhpZGRlblJlY29yZDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gVW5kZXIgc29tZSBjaXJjdW1zdGFuY2VzLCBpc0V4dGVuc2libGUgc2VlbXMgdG8gbWlzcmVwb3J0IHdoZXRoZXJcbiAgICAgIC8vIHRoZSBISURERU5fTkFNRSBjYW4gYmUgZGVmaW5lZC5cbiAgICAgIC8vIFRoZSBjaXJjdW1zdGFuY2VzIGhhdmUgbm90IGJlZW4gaXNvbGF0ZWQsIGJ1dCBhdCBsZWFzdCBhZmZlY3RcbiAgICAgIC8vIE5vZGUuanMgdjAuMTAuMjYgb24gVHJhdmlzQ0kgLyBMaW51eCwgYnV0IG5vdCB0aGUgc2FtZSB2ZXJzaW9uIG9mXG4gICAgICAvLyBOb2RlLmpzIG9uIE9TIFguXG4gICAgICByZXR1cm4gdm9pZCAwO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBNb25rZXkgcGF0Y2ggb3BlcmF0aW9ucyB0aGF0IHdvdWxkIG1ha2UgdGhlaXIgYXJndW1lbnRcbiAgICogbm9uLWV4dGVuc2libGUuXG4gICAqXG4gICAqIDxwPlRoZSBtb25rZXkgcGF0Y2hlZCB2ZXJzaW9ucyB0aHJvdyBhIFR5cGVFcnJvciBpZiB0aGVpclxuICAgKiBhcmd1bWVudCBpcyBub3QgYW4gb2JqZWN0LCBzbyBpdCBzaG91bGQgb25seSBiZSBkb25lIHRvIGZ1bmN0aW9uc1xuICAgKiB0aGF0IHNob3VsZCB0aHJvdyBhIFR5cGVFcnJvciBhbnl3YXkgaWYgdGhlaXIgYXJndW1lbnQgaXMgbm90IGFuXG4gICAqIG9iamVjdC5cbiAgICovXG4gIChmdW5jdGlvbigpe1xuICAgIHZhciBvbGRGcmVlemUgPSBPYmplY3QuZnJlZXplO1xuICAgIGRlZlByb3AoT2JqZWN0LCAnZnJlZXplJywge1xuICAgICAgdmFsdWU6IGZ1bmN0aW9uIGlkZW50aWZ5aW5nRnJlZXplKG9iaikge1xuICAgICAgICBnZXRIaWRkZW5SZWNvcmQob2JqKTtcbiAgICAgICAgcmV0dXJuIG9sZEZyZWV6ZShvYmopO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHZhciBvbGRTZWFsID0gT2JqZWN0LnNlYWw7XG4gICAgZGVmUHJvcChPYmplY3QsICdzZWFsJywge1xuICAgICAgdmFsdWU6IGZ1bmN0aW9uIGlkZW50aWZ5aW5nU2VhbChvYmopIHtcbiAgICAgICAgZ2V0SGlkZGVuUmVjb3JkKG9iaik7XG4gICAgICAgIHJldHVybiBvbGRTZWFsKG9iaik7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdmFyIG9sZFByZXZlbnRFeHRlbnNpb25zID0gT2JqZWN0LnByZXZlbnRFeHRlbnNpb25zO1xuICAgIGRlZlByb3AoT2JqZWN0LCAncHJldmVudEV4dGVuc2lvbnMnLCB7XG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaWRlbnRpZnlpbmdQcmV2ZW50RXh0ZW5zaW9ucyhvYmopIHtcbiAgICAgICAgZ2V0SGlkZGVuUmVjb3JkKG9iaik7XG4gICAgICAgIHJldHVybiBvbGRQcmV2ZW50RXh0ZW5zaW9ucyhvYmopO1xuICAgICAgfVxuICAgIH0pO1xuICB9KSgpO1xuXG4gIGZ1bmN0aW9uIGNvbnN0RnVuYyhmdW5jKSB7XG4gICAgZnVuYy5wcm90b3R5cGUgPSBudWxsO1xuICAgIHJldHVybiBPYmplY3QuZnJlZXplKGZ1bmMpO1xuICB9XG5cbiAgdmFyIGNhbGxlZEFzRnVuY3Rpb25XYXJuaW5nRG9uZSA9IGZhbHNlO1xuICBmdW5jdGlvbiBjYWxsZWRBc0Z1bmN0aW9uV2FybmluZygpIHtcbiAgICAvLyBGdXR1cmUgRVM2IFdlYWtNYXAgaXMgY3VycmVudGx5ICgyMDEzLTA5LTEwKSBleHBlY3RlZCB0byByZWplY3QgV2Vha01hcCgpXG4gICAgLy8gYnV0IHdlIHVzZWQgdG8gcGVybWl0IGl0IGFuZCBkbyBpdCBvdXJzZWx2ZXMsIHNvIHdhcm4gb25seS5cbiAgICBpZiAoIWNhbGxlZEFzRnVuY3Rpb25XYXJuaW5nRG9uZSAmJiB0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNhbGxlZEFzRnVuY3Rpb25XYXJuaW5nRG9uZSA9IHRydWU7XG4gICAgICBjb25zb2xlLndhcm4oJ1dlYWtNYXAgc2hvdWxkIGJlIGludm9rZWQgYXMgbmV3IFdlYWtNYXAoKSwgbm90ICcgK1xuICAgICAgICAgICdXZWFrTWFwKCkuIFRoaXMgd2lsbCBiZSBhbiBlcnJvciBpbiB0aGUgZnV0dXJlLicpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBuZXh0SWQgPSAwO1xuXG4gIHZhciBPdXJXZWFrTWFwID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE91cldlYWtNYXApKSB7ICAvLyBhcHByb3hpbWF0ZSB0ZXN0IGZvciBuZXcgLi4uKClcbiAgICAgIGNhbGxlZEFzRnVuY3Rpb25XYXJuaW5nKCk7XG4gICAgfVxuXG4gICAgLy8gV2UgYXJlIGN1cnJlbnRseSAoMTIvMjUvMjAxMikgbmV2ZXIgZW5jb3VudGVyaW5nIGFueSBwcmVtYXR1cmVseVxuICAgIC8vIG5vbi1leHRlbnNpYmxlIGtleXMuXG4gICAgdmFyIGtleXMgPSBbXTsgLy8gYnJ1dGUgZm9yY2UgZm9yIHByZW1hdHVyZWx5IG5vbi1leHRlbnNpYmxlIGtleXMuXG4gICAgdmFyIHZhbHVlcyA9IFtdOyAvLyBicnV0ZSBmb3JjZSBmb3IgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG4gICAgdmFyIGlkID0gbmV4dElkKys7XG5cbiAgICBmdW5jdGlvbiBnZXRfX18oa2V5LCBvcHRfZGVmYXVsdCkge1xuICAgICAgdmFyIGluZGV4O1xuICAgICAgdmFyIGhpZGRlblJlY29yZCA9IGdldEhpZGRlblJlY29yZChrZXkpO1xuICAgICAgaWYgKGhpZGRlblJlY29yZCkge1xuICAgICAgICByZXR1cm4gaWQgaW4gaGlkZGVuUmVjb3JkID8gaGlkZGVuUmVjb3JkW2lkXSA6IG9wdF9kZWZhdWx0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5kZXggPSBrZXlzLmluZGV4T2Yoa2V5KTtcbiAgICAgICAgcmV0dXJuIGluZGV4ID49IDAgPyB2YWx1ZXNbaW5kZXhdIDogb3B0X2RlZmF1bHQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFzX19fKGtleSkge1xuICAgICAgdmFyIGhpZGRlblJlY29yZCA9IGdldEhpZGRlblJlY29yZChrZXkpO1xuICAgICAgaWYgKGhpZGRlblJlY29yZCkge1xuICAgICAgICByZXR1cm4gaWQgaW4gaGlkZGVuUmVjb3JkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtleXMuaW5kZXhPZihrZXkpID49IDA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0X19fKGtleSwgdmFsdWUpIHtcbiAgICAgIHZhciBpbmRleDtcbiAgICAgIHZhciBoaWRkZW5SZWNvcmQgPSBnZXRIaWRkZW5SZWNvcmQoa2V5KTtcbiAgICAgIGlmIChoaWRkZW5SZWNvcmQpIHtcbiAgICAgICAgaGlkZGVuUmVjb3JkW2lkXSA9IHZhbHVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5kZXggPSBrZXlzLmluZGV4T2Yoa2V5KTtcbiAgICAgICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgICB2YWx1ZXNbaW5kZXhdID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gU2luY2Ugc29tZSBicm93c2VycyBwcmVlbXB0aXZlbHkgdGVybWluYXRlIHNsb3cgdHVybnMgYnV0XG4gICAgICAgICAgLy8gdGhlbiBjb250aW51ZSBjb21wdXRpbmcgd2l0aCBwcmVzdW1hYmx5IGNvcnJ1cHRlZCBoZWFwXG4gICAgICAgICAgLy8gc3RhdGUsIHdlIGhlcmUgZGVmZW5zaXZlbHkgZ2V0IGtleXMubGVuZ3RoIGZpcnN0IGFuZCB0aGVuXG4gICAgICAgICAgLy8gdXNlIGl0IHRvIHVwZGF0ZSBib3RoIHRoZSB2YWx1ZXMgYW5kIGtleXMgYXJyYXlzLCBrZWVwaW5nXG4gICAgICAgICAgLy8gdGhlbSBpbiBzeW5jLlxuICAgICAgICAgIGluZGV4ID0ga2V5cy5sZW5ndGg7XG4gICAgICAgICAgdmFsdWVzW2luZGV4XSA9IHZhbHVlO1xuICAgICAgICAgIC8vIElmIHdlIGNyYXNoIGhlcmUsIHZhbHVlcyB3aWxsIGJlIG9uZSBsb25nZXIgdGhhbiBrZXlzLlxuICAgICAgICAgIGtleXNbaW5kZXhdID0ga2V5O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZWxldGVfX18oa2V5KSB7XG4gICAgICB2YXIgaGlkZGVuUmVjb3JkID0gZ2V0SGlkZGVuUmVjb3JkKGtleSk7XG4gICAgICB2YXIgaW5kZXgsIGxhc3RJbmRleDtcbiAgICAgIGlmIChoaWRkZW5SZWNvcmQpIHtcbiAgICAgICAgcmV0dXJuIGlkIGluIGhpZGRlblJlY29yZCAmJiBkZWxldGUgaGlkZGVuUmVjb3JkW2lkXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGluZGV4ID0ga2V5cy5pbmRleE9mKGtleSk7XG4gICAgICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2luY2Ugc29tZSBicm93c2VycyBwcmVlbXB0aXZlbHkgdGVybWluYXRlIHNsb3cgdHVybnMgYnV0XG4gICAgICAgIC8vIHRoZW4gY29udGludWUgY29tcHV0aW5nIHdpdGggcG90ZW50aWFsbHkgY29ycnVwdGVkIGhlYXBcbiAgICAgICAgLy8gc3RhdGUsIHdlIGhlcmUgZGVmZW5zaXZlbHkgZ2V0IGtleXMubGVuZ3RoIGZpcnN0IGFuZCB0aGVuIHVzZVxuICAgICAgICAvLyBpdCB0byB1cGRhdGUgYm90aCB0aGUga2V5cyBhbmQgdGhlIHZhbHVlcyBhcnJheSwga2VlcGluZ1xuICAgICAgICAvLyB0aGVtIGluIHN5bmMuIFdlIHVwZGF0ZSB0aGUgdHdvIHdpdGggYW4gb3JkZXIgb2YgYXNzaWdubWVudHMsXG4gICAgICAgIC8vIHN1Y2ggdGhhdCBhbnkgcHJlZml4IG9mIHRoZXNlIGFzc2lnbm1lbnRzIHdpbGwgcHJlc2VydmUgdGhlXG4gICAgICAgIC8vIGtleS92YWx1ZSBjb3JyZXNwb25kZW5jZSwgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgZGVsZXRlLlxuICAgICAgICAvLyBOb3RlIHRoYXQgdGhpcyBuZWVkcyB0byB3b3JrIGNvcnJlY3RseSB3aGVuIGluZGV4ID09PSBsYXN0SW5kZXguXG4gICAgICAgIGxhc3RJbmRleCA9IGtleXMubGVuZ3RoIC0gMTtcbiAgICAgICAga2V5c1tpbmRleF0gPSB2b2lkIDA7XG4gICAgICAgIC8vIElmIHdlIGNyYXNoIGhlcmUsIHRoZXJlJ3MgYSB2b2lkIDAgaW4gdGhlIGtleXMgYXJyYXksIGJ1dFxuICAgICAgICAvLyBubyBvcGVyYXRpb24gd2lsbCBjYXVzZSBhIFwia2V5cy5pbmRleE9mKHZvaWQgMClcIiwgc2luY2VcbiAgICAgICAgLy8gZ2V0SGlkZGVuUmVjb3JkKHZvaWQgMCkgd2lsbCBhbHdheXMgdGhyb3cgYW4gZXJyb3IgZmlyc3QuXG4gICAgICAgIHZhbHVlc1tpbmRleF0gPSB2YWx1ZXNbbGFzdEluZGV4XTtcbiAgICAgICAgLy8gSWYgd2UgY3Jhc2ggaGVyZSwgdmFsdWVzW2luZGV4XSBjYW5ub3QgYmUgZm91bmQgaGVyZSxcbiAgICAgICAgLy8gYmVjYXVzZSBrZXlzW2luZGV4XSBpcyB2b2lkIDAuXG4gICAgICAgIGtleXNbaW5kZXhdID0ga2V5c1tsYXN0SW5kZXhdO1xuICAgICAgICAvLyBJZiBpbmRleCA9PT0gbGFzdEluZGV4IGFuZCB3ZSBjcmFzaCBoZXJlLCB0aGVuIGtleXNbaW5kZXhdXG4gICAgICAgIC8vIGlzIHN0aWxsIHZvaWQgMCwgc2luY2UgdGhlIGFsaWFzaW5nIGtpbGxlZCB0aGUgcHJldmlvdXMga2V5LlxuICAgICAgICBrZXlzLmxlbmd0aCA9IGxhc3RJbmRleDtcbiAgICAgICAgLy8gSWYgd2UgY3Jhc2ggaGVyZSwga2V5cyB3aWxsIGJlIG9uZSBzaG9ydGVyIHRoYW4gdmFsdWVzLlxuICAgICAgICB2YWx1ZXMubGVuZ3RoID0gbGFzdEluZGV4O1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZShPdXJXZWFrTWFwLnByb3RvdHlwZSwge1xuICAgICAgZ2V0X19fOiAgICB7IHZhbHVlOiBjb25zdEZ1bmMoZ2V0X19fKSB9LFxuICAgICAgaGFzX19fOiAgICB7IHZhbHVlOiBjb25zdEZ1bmMoaGFzX19fKSB9LFxuICAgICAgc2V0X19fOiAgICB7IHZhbHVlOiBjb25zdEZ1bmMoc2V0X19fKSB9LFxuICAgICAgZGVsZXRlX19fOiB7IHZhbHVlOiBjb25zdEZ1bmMoZGVsZXRlX19fKSB9XG4gICAgfSk7XG4gIH07XG5cbiAgT3VyV2Vha01hcC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKE9iamVjdC5wcm90b3R5cGUsIHtcbiAgICBnZXQ6IHtcbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJuIHRoZSB2YWx1ZSBtb3N0IHJlY2VudGx5IGFzc29jaWF0ZWQgd2l0aCBrZXksIG9yXG4gICAgICAgKiBvcHRfZGVmYXVsdCBpZiBub25lLlxuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gZ2V0KGtleSwgb3B0X2RlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0X19fKGtleSwgb3B0X2RlZmF1bHQpO1xuICAgICAgfSxcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSxcblxuICAgIGhhczoge1xuICAgICAgLyoqXG4gICAgICAgKiBJcyB0aGVyZSBhIHZhbHVlIGFzc29jaWF0ZWQgd2l0aCBrZXkgaW4gdGhpcyBXZWFrTWFwP1xuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaGFzKGtleSkge1xuICAgICAgICByZXR1cm4gdGhpcy5oYXNfX18oa2V5KTtcbiAgICAgIH0sXG4gICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0sXG5cbiAgICBzZXQ6IHtcbiAgICAgIC8qKlxuICAgICAgICogQXNzb2NpYXRlIHZhbHVlIHdpdGgga2V5IGluIHRoaXMgV2Vha01hcCwgb3ZlcndyaXRpbmcgYW55XG4gICAgICAgKiBwcmV2aW91cyBhc3NvY2lhdGlvbiBpZiBwcmVzZW50LlxuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0X19fKGtleSwgdmFsdWUpO1xuICAgICAgfSxcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSxcblxuICAgICdkZWxldGUnOiB7XG4gICAgICAvKipcbiAgICAgICAqIFJlbW92ZSBhbnkgYXNzb2NpYXRpb24gZm9yIGtleSBpbiB0aGlzIFdlYWtNYXAsIHJldHVybmluZ1xuICAgICAgICogd2hldGhlciB0aGVyZSB3YXMgb25lLlxuICAgICAgICpcbiAgICAgICAqIDxwPk5vdGUgdGhhdCB0aGUgYm9vbGVhbiByZXR1cm4gaGVyZSBkb2VzIG5vdCB3b3JrIGxpa2UgdGhlXG4gICAgICAgKiB7QGNvZGUgZGVsZXRlfSBvcGVyYXRvci4gVGhlIHtAY29kZSBkZWxldGV9IG9wZXJhdG9yIHJldHVybnNcbiAgICAgICAqIHdoZXRoZXIgdGhlIGRlbGV0aW9uIHN1Y2NlZWRzIGF0IGJyaW5naW5nIGFib3V0IGEgc3RhdGUgaW5cbiAgICAgICAqIHdoaWNoIHRoZSBkZWxldGVkIHByb3BlcnR5IGlzIGFic2VudC4gVGhlIHtAY29kZSBkZWxldGV9XG4gICAgICAgKiBvcGVyYXRvciB0aGVyZWZvcmUgcmV0dXJucyB0cnVlIGlmIHRoZSBwcm9wZXJ0eSB3YXMgYWxyZWFkeVxuICAgICAgICogYWJzZW50LCB3aGVyZWFzIHRoaXMge0Bjb2RlIGRlbGV0ZX0gbWV0aG9kIHJldHVybnMgZmFsc2UgaWZcbiAgICAgICAqIHRoZSBhc3NvY2lhdGlvbiB3YXMgYWxyZWFkeSBhYnNlbnQuXG4gICAgICAgKi9cbiAgICAgIHZhbHVlOiBmdW5jdGlvbiByZW1vdmUoa2V5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRlbGV0ZV9fXyhrZXkpO1xuICAgICAgfSxcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfVxuICB9KTtcblxuICBpZiAodHlwZW9mIEhvc3RXZWFrTWFwID09PSAnZnVuY3Rpb24nKSB7XG4gICAgKGZ1bmN0aW9uKCkge1xuICAgICAgLy8gSWYgd2UgZ290IGhlcmUsIHRoZW4gdGhlIHBsYXRmb3JtIGhhcyBhIFdlYWtNYXAgYnV0IHdlIGFyZSBjb25jZXJuZWRcbiAgICAgIC8vIHRoYXQgaXQgbWF5IHJlZnVzZSB0byBzdG9yZSBzb21lIGtleSB0eXBlcy4gVGhlcmVmb3JlLCBtYWtlIGEgbWFwXG4gICAgICAvLyBpbXBsZW1lbnRhdGlvbiB3aGljaCBtYWtlcyB1c2Ugb2YgYm90aCBhcyBwb3NzaWJsZS5cblxuICAgICAgLy8gSW4gdGhpcyBtb2RlIHdlIGFyZSBhbHdheXMgdXNpbmcgZG91YmxlIG1hcHMsIHNvIHdlIGFyZSBub3QgcHJveHktc2FmZS5cbiAgICAgIC8vIFRoaXMgY29tYmluYXRpb24gZG9lcyBub3Qgb2NjdXIgaW4gYW55IGtub3duIGJyb3dzZXIsIGJ1dCB3ZSBoYWQgYmVzdFxuICAgICAgLy8gYmUgc2FmZS5cbiAgICAgIGlmIChkb3VibGVXZWFrTWFwQ2hlY2tTaWxlbnRGYWlsdXJlICYmIHR5cGVvZiBQcm94eSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgUHJveHkgPSB1bmRlZmluZWQ7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIERvdWJsZVdlYWtNYXAoKSB7XG4gICAgICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBPdXJXZWFrTWFwKSkgeyAgLy8gYXBwcm94aW1hdGUgdGVzdCBmb3IgbmV3IC4uLigpXG4gICAgICAgICAgY2FsbGVkQXNGdW5jdGlvbldhcm5pbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByZWZlcmFibGUsIHRydWx5IHdlYWsgbWFwLlxuICAgICAgICB2YXIgaG1hcCA9IG5ldyBIb3N0V2Vha01hcCgpO1xuXG4gICAgICAgIC8vIE91ciBoaWRkZW4tcHJvcGVydHktYmFzZWQgcHNldWRvLXdlYWstbWFwLiBMYXppbHkgaW5pdGlhbGl6ZWQgaW4gdGhlXG4gICAgICAgIC8vICdzZXQnIGltcGxlbWVudGF0aW9uOyB0aHVzIHdlIGNhbiBhdm9pZCBwZXJmb3JtaW5nIGV4dHJhIGxvb2t1cHMgaWZcbiAgICAgICAgLy8gd2Uga25vdyBhbGwgZW50cmllcyBhY3R1YWxseSBzdG9yZWQgYXJlIGVudGVyZWQgaW4gJ2htYXAnLlxuICAgICAgICB2YXIgb21hcCA9IHVuZGVmaW5lZDtcblxuICAgICAgICAvLyBIaWRkZW4tcHJvcGVydHkgbWFwcyBhcmUgbm90IGNvbXBhdGlibGUgd2l0aCBwcm94aWVzIGJlY2F1c2UgcHJveGllc1xuICAgICAgICAvLyBjYW4gb2JzZXJ2ZSB0aGUgaGlkZGVuIG5hbWUgYW5kIGVpdGhlciBhY2NpZGVudGFsbHkgZXhwb3NlIGl0IG9yIGZhaWxcbiAgICAgICAgLy8gdG8gYWxsb3cgdGhlIGhpZGRlbiBwcm9wZXJ0eSB0byBiZSBzZXQuIFRoZXJlZm9yZSwgd2UgZG8gbm90IGFsbG93XG4gICAgICAgIC8vIGFyYml0cmFyeSBXZWFrTWFwcyB0byBzd2l0Y2ggdG8gdXNpbmcgaGlkZGVuIHByb3BlcnRpZXMsIGJ1dCBvbmx5XG4gICAgICAgIC8vIHRob3NlIHdoaWNoIG5lZWQgdGhlIGFiaWxpdHksIGFuZCB1bnByaXZpbGVnZWQgY29kZSBpcyBub3QgYWxsb3dlZFxuICAgICAgICAvLyB0byBzZXQgdGhlIGZsYWcuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIChFeGNlcHQgaW4gZG91YmxlV2Vha01hcENoZWNrU2lsZW50RmFpbHVyZSBtb2RlIGluIHdoaWNoIGNhc2Ugd2VcbiAgICAgICAgLy8gZGlzYWJsZSBwcm94aWVzLilcbiAgICAgICAgdmFyIGVuYWJsZVN3aXRjaGluZyA9IGZhbHNlO1xuXG4gICAgICAgIGZ1bmN0aW9uIGRnZXQoa2V5LCBvcHRfZGVmYXVsdCkge1xuICAgICAgICAgIGlmIChvbWFwKSB7XG4gICAgICAgICAgICByZXR1cm4gaG1hcC5oYXMoa2V5KSA/IGhtYXAuZ2V0KGtleSlcbiAgICAgICAgICAgICAgICA6IG9tYXAuZ2V0X19fKGtleSwgb3B0X2RlZmF1bHQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gaG1hcC5nZXQoa2V5LCBvcHRfZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGhhcyhrZXkpIHtcbiAgICAgICAgICByZXR1cm4gaG1hcC5oYXMoa2V5KSB8fCAob21hcCA/IG9tYXAuaGFzX19fKGtleSkgOiBmYWxzZSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZHNldDtcbiAgICAgICAgaWYgKGRvdWJsZVdlYWtNYXBDaGVja1NpbGVudEZhaWx1cmUpIHtcbiAgICAgICAgICBkc2V0ID0gZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgaG1hcC5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICBpZiAoIWhtYXAuaGFzKGtleSkpIHtcbiAgICAgICAgICAgICAgaWYgKCFvbWFwKSB7IG9tYXAgPSBuZXcgT3VyV2Vha01hcCgpOyB9XG4gICAgICAgICAgICAgIG9tYXAuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkc2V0ID0gZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKGVuYWJsZVN3aXRjaGluZykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGhtYXAuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFvbWFwKSB7IG9tYXAgPSBuZXcgT3VyV2Vha01hcCgpOyB9XG4gICAgICAgICAgICAgICAgb21hcC5zZXRfX18oa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGhtYXAuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRkZWxldGUoa2V5KSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9ICEhaG1hcFsnZGVsZXRlJ10oa2V5KTtcbiAgICAgICAgICBpZiAob21hcCkgeyByZXR1cm4gb21hcC5kZWxldGVfX18oa2V5KSB8fCByZXN1bHQ7IH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5jcmVhdGUoT3VyV2Vha01hcC5wcm90b3R5cGUsIHtcbiAgICAgICAgICBnZXRfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhkZ2V0KSB9LFxuICAgICAgICAgIGhhc19fXzogICAgeyB2YWx1ZTogY29uc3RGdW5jKGRoYXMpIH0sXG4gICAgICAgICAgc2V0X19fOiAgICB7IHZhbHVlOiBjb25zdEZ1bmMoZHNldCkgfSxcbiAgICAgICAgICBkZWxldGVfX186IHsgdmFsdWU6IGNvbnN0RnVuYyhkZGVsZXRlKSB9LFxuICAgICAgICAgIHBlcm1pdEhvc3RPYmplY3RzX19fOiB7IHZhbHVlOiBjb25zdEZ1bmMoZnVuY3Rpb24odG9rZW4pIHtcbiAgICAgICAgICAgIGlmICh0b2tlbiA9PT0gd2Vha01hcFBlcm1pdEhvc3RPYmplY3RzKSB7XG4gICAgICAgICAgICAgIGVuYWJsZVN3aXRjaGluZyA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2JvZ3VzIGNhbGwgdG8gcGVybWl0SG9zdE9iamVjdHNfX18nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KX1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBEb3VibGVXZWFrTWFwLnByb3RvdHlwZSA9IE91cldlYWtNYXAucHJvdG90eXBlO1xuICAgICAgbW9kdWxlLmV4cG9ydHMgPSBEb3VibGVXZWFrTWFwO1xuXG4gICAgICAvLyBkZWZpbmUgLmNvbnN0cnVjdG9yIHRvIGhpZGUgT3VyV2Vha01hcCBjdG9yXG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoV2Vha01hcC5wcm90b3R5cGUsICdjb25zdHJ1Y3RvcicsIHtcbiAgICAgICAgdmFsdWU6IFdlYWtNYXAsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLCAgLy8gYXMgZGVmYXVsdCAuY29uc3RydWN0b3IgaXNcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZVxuICAgICAgfSk7XG4gICAgfSkoKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBUaGVyZSBpcyBubyBob3N0IFdlYWtNYXAsIHNvIHdlIG11c3QgdXNlIHRoZSBlbXVsYXRpb24uXG5cbiAgICAvLyBFbXVsYXRlZCBXZWFrTWFwcyBhcmUgaW5jb21wYXRpYmxlIHdpdGggbmF0aXZlIHByb3hpZXMgKGJlY2F1c2UgcHJveGllc1xuICAgIC8vIGNhbiBvYnNlcnZlIHRoZSBoaWRkZW4gbmFtZSksIHNvIHdlIG11c3QgZGlzYWJsZSBQcm94eSB1c2FnZSAoaW5cbiAgICAvLyBBcnJheUxpa2UgYW5kIERvbWFkbywgY3VycmVudGx5KS5cbiAgICBpZiAodHlwZW9mIFByb3h5ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgUHJveHkgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBPdXJXZWFrTWFwO1xuICB9XG59KSgpO1xuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciB3ZWFrTWFwID0gdHlwZW9mIFdlYWtNYXAgPT09ICd1bmRlZmluZWQnID8gcmVxdWlyZSgnd2Vhay1tYXAnKSA6IFdlYWtNYXBcblxudmFyIFdlYkdMRVdTdHJ1Y3QgPSBuZXcgd2Vha01hcCgpXG5cbmZ1bmN0aW9uIGJhc2VOYW1lKGV4dF9uYW1lKSB7XG4gIHJldHVybiBleHRfbmFtZS5yZXBsYWNlKC9eW0EtWl0rXy8sICcnKVxufVxuXG5mdW5jdGlvbiBpbml0V2ViR0xFVyhnbCkge1xuICB2YXIgc3RydWN0ID0gV2ViR0xFV1N0cnVjdC5nZXQoZ2wpXG4gIGlmKHN0cnVjdCkge1xuICAgIHJldHVybiBzdHJ1Y3RcbiAgfVxuICB2YXIgZXh0ZW5zaW9ucyA9IHt9XG4gIHZhciBzdXBwb3J0ZWQgPSBnbC5nZXRTdXBwb3J0ZWRFeHRlbnNpb25zKClcbiAgZm9yKHZhciBpPTA7IGk8c3VwcG9ydGVkLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGV4dE5hbWUgPSBzdXBwb3J0ZWRbaV1cblxuICAgIC8vU2tpcCBNT1pfIGV4dGVuc2lvbnNcbiAgICBpZihleHROYW1lLmluZGV4T2YoJ01PWl8nKSA9PT0gMCkge1xuICAgICAgY29udGludWVcbiAgICB9XG4gICAgdmFyIGV4dCA9IGdsLmdldEV4dGVuc2lvbihzdXBwb3J0ZWRbaV0pXG4gICAgaWYoIWV4dCkge1xuICAgICAgY29udGludWVcbiAgICB9XG4gICAgd2hpbGUodHJ1ZSkge1xuICAgICAgZXh0ZW5zaW9uc1tleHROYW1lXSA9IGV4dFxuICAgICAgdmFyIGJhc2UgPSBiYXNlTmFtZShleHROYW1lKVxuICAgICAgaWYoYmFzZSA9PT0gZXh0TmFtZSkge1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgICAgZXh0TmFtZSA9IGJhc2VcbiAgICB9XG4gIH1cbiAgV2ViR0xFV1N0cnVjdC5zZXQoZ2wsIGV4dGVuc2lvbnMpXG4gIHJldHVybiBleHRlbnNpb25zXG59XG5tb2R1bGUuZXhwb3J0cyA9IGluaXRXZWJHTEVXIiwiLyoganNoaW50IHVudXNlZDp0cnVlLCBhc2k6dHJ1ZSwgbGF4Y29tbWE6dHJ1ZSwgLVcwOTcsIC1XMDA4ICovXG4vKiBnbG9iYWwgbW9kdWxlICovXG5cInVzZSBzdHJpY3RcIjtcblxuLy8gXG4vLyBIZWxwZXIgY2xhc3MgdG8gbWFuYWdlIHBvbHlnb24gZGF0YSBmb3IgdGhpcyBwcm9qZWN0LlxuLy8gXG4vLyB2ZXJ0QXJyIGlzIFt4LHkseiwgeHl6LCB4eXosICAgLi5dIHBlciBwb2x5IChsZW49MypudW1WZXJ0cylcbi8vIGNvbEFyciA9IFtyLGcsYixhLCByZ2JhLCByZ2JhLCAuLl0gcGVyIHBvbHkgKGxlbj00Km51bVZlcnRzKVxuLy9cblxudmFyIHZlcnRBcnIsIGNvbEFycixcblx0XHRvbGRWZXJ0QXJyLCBvbGRDb2xBcnJcblxuXG4vLyBleHBlcmltZW50YWwgc2V0dGluZ3MuLi5cbnZhciBtaW5BbHBoYSA9IC4wMVxudmFyIG1heEFscGhhID0gLjZcbnZhciBmbGF0dGVuZWRaID0gZmFsc2VcblxuLy8gdHlwaW5nXG52YXIgZmxvb3IgPSBNYXRoLmZsb29yXG52YXIgcmFuZCA9IE1hdGgucmFuZG9tXG5cblxuXG5cbmZ1bmN0aW9uIGluaXQobnVtVHJpcykge1xuXHR2ZXJ0QXJyID0gW11cblx0Y29sQXJyID0gW11cblx0dmFyIGlcblx0Zm9yIChpPTA7IGk8bnVtVHJpczsgaSsrKSB7XG5cdFx0YWRkUG9seSgpXG5cdH1cblx0Ly8gc29ydCBpbml0aWFsbHlcblx0c29ydFBvbHlnb25zQnlaKClcbn1cblxuLy8gZm9yIHJlYWRpbmcgaW4gZGF0YSBhbHJlYWR5IGNhbGN1bGF0ZWRcbmZ1bmN0aW9uIHNldEFycmF5cyh2YXJyLGNhcnIpIHtcblx0dmVydEFyciA9IHZhcnIuc2xpY2UoKVxuXHRjb2xBcnIgID0gY2Fyci5zbGljZSgpXG59XG5cblxuXG4vLyBnZW5lcmF0ZSBzY2FsZWQgYWxwaGEgdmFsdWVzXG5mdW5jdGlvbiBuZXdBbHBoYSgpIHtcblx0dmFyIGEgPSByYW5kKClcblx0cmV0dXJuIGEqKG1heEFscGhhLW1pbkFscGhhKSArIG1pbkFscGhhXG59XG5cbi8vIGFkZCBhIHJhbmRvbSBwb2x5XG5mdW5jdGlvbiBhZGRQb2x5KCkge1xuXHRmb3IgKHZhciBpPTA7IGk8OTsgaSsrKSB7XG5cdFx0dmVydEFyci5wdXNoKHJhbmQoKSlcblx0fVxuXHRpZiAoZmxhdHRlbmVkWikge1xuXHRcdHZhciBsZW4gPSB2ZXJ0QXJyLmxlbmd0aFxuXHRcdHZlcnRBcnJbbGVuLTFdID0gdmVydEFycltsZW4tNF0gPSB2ZXJ0QXJyW2xlbi03XVxuXHR9XG5cdGZvciAoaT0wOyBpPDEyOyBpKyspIHtcblx0XHR2YXIgYyA9IChpJTQ9PTMpID8gbmV3QWxwaGEoKSA6IHJhbmQoKVxuXHRcdGNvbEFyci5wdXNoKGMpXG5cdH1cbn1cblxuLy8gYWRkIGEgbmV3IHBvbHkgdGhhdCdzIGEgY2xvbmUgb2YgYW4gZXhpc3Rpbmcgb25lIHdpdGggb25lIHZlcnRleCBtb3ZlZFxuLy8gY29uY2VwdHVhbGx5IGxpa2UgbWFraW5nIGEgMy1wb2x5IGludG8gYSBmb2xkZWQgcXVhZFxuZnVuY3Rpb24gY2xvbmVQb2x5KCkge1xuXHR2YXIgaW5kZXggPSBmbG9vciggdmVydEFyci5sZW5ndGgvOSAqIHJhbmQoKSApXG5cdC8vIGNsb25lIGNvbG9ycyBhcy1hcmVcblx0Zm9yIChpPTA7IGk8MTI7IGkrKykge1xuXHRcdGNvbEFyci5wdXNoKCBjb2xBcnJbaW5kZXgqMTIraV0gKVxuXHR9XG5cdC8vIGNsb25lIDIgb2YgMyBwb3NpdGlvbiB2ZXJ0aWNlcywgdGhlbiBwdXNoIGEgcmFuZG9tIG9uZVxuXHR2YXIgc2tpcCA9IGZsb29yKCAzKnJhbmQoKSApXG5cdGZvciAodmFyIGk9MDsgaTw5OyBpKyspIHtcblx0XHRpZiAoZmxvb3IoaS8zKSE9c2tpcCkgeyB2ZXJ0QXJyLnB1c2godmVydEFycltpbmRleCo5K2ldKSB9XG5cdH1cblx0Zm9yIChpPTA7IGk8MzsgaSsrKSB7IHZlcnRBcnIucHVzaCggcmFuZCgpICkgfVxuXHQvLyBpbiBmbGF0IG1vZGUsIGdpdmUgbmV3IHBvc2l0aW9uIHogZnJvbSBvbmUgb2YgdGhlIG90aGVyc1xuXHRpZiAoZmxhdHRlbmVkWikge1xuXHRcdHZhciBsZW4gPSB2ZXJ0QXJyLmxlbmd0aFxuXHRcdHZlcnRBcnJbbGVuLTFdID0gKHJhbmQoKT4uNSkgPyB2ZXJ0QXJyW2xlbi00XSA6IHZlcnRBcnJbbGVuLTddXG5cdH1cbn1cblxuLy8gcmVtb3ZlIGEgcmFuZG9tIHBvbHlcbmZ1bmN0aW9uIHJlbW92ZVBvbHkoKSB7XG5cdGlmICh2ZXJ0QXJyLmxlbmd0aCA8IDE4KSB7IHJldHVybiB9IC8vIGFscmVhZHkgYXQgMSBwb2x5XG5cdHZhciBpbmRleCA9IGZsb29yKCB2ZXJ0QXJyLmxlbmd0aC85ICogcmFuZCgpIClcblx0dmVydEFyci5zcGxpY2UoaW5kZXgqOSwgOSlcblx0Y29sQXJyLnNwbGljZShpbmRleCoxMiwgMTIpXG59XG5cbi8vIHJhbmRvbWl6ZSBvbmUgUkdCQS9YWVogdmFsdWVcbmZ1bmN0aW9uIG11dGF0ZVZhbHVlKCkge1xuXHRpZiAocmFuZCgpIDwgMC41KSB7IC8vIGRvIGEgY29sb3Jcblx0XHR2YXIgaSA9IGZsb29yKCBjb2xBcnIubGVuZ3RoICogcmFuZCgpIClcblx0XHRjb2xBcnJbaV0gPSAoaSU0PT0zKSA/IG5ld0FscGhhKCkgOiByYW5kKClcblx0fSBlbHNlIHsgLy8gZG8gYSBwb3NpdGlvblxuXHRcdHZhciB2ID0gZmxvb3IoIHZlcnRBcnIubGVuZ3RoLzMgKiByYW5kKCkgKVxuXHRcdHZhciBvZmZzID0gKGZsYXR0ZW5lZFopID8gMiA6IDNcblx0XHR2YXIgb2Zmc2V0ID0gZmxvb3IoIHJhbmQoKSAqIG9mZnMgKVxuXHRcdHZlcnRBcnJbdiozICsgb2Zmc2V0XSA9IHJhbmQoKVxuXHR9XG59XG5cbi8vIHJhbmRvbWl6ZSBlaXRoZXIgYWxsIFJHQkEgb3IgYWxsIFhZWiBvZiBvbmUgdmVydGV4XG5mdW5jdGlvbiBtdXRhdGVWZXJ0ZXgoKSB7XG5cdHZhciB2bnVtID0gZmxvb3IoIGdldE51bVZlcnRzKCkqcmFuZCgpIClcblx0aWYgKHJhbmQoKSA8IDAuNSkgeyAvLyByYW5kb21pemUgYSB2ZXJ0ZXgncyBjb2xvclxuXHRcdGNvbEFyclt2bnVtKjRdICAgPSByYW5kKClcblx0XHRjb2xBcnJbdm51bSo0KzFdID0gcmFuZCgpXG5cdFx0Y29sQXJyW3ZudW0qNCsyXSA9IHJhbmQoKVxuXHRcdGNvbEFyclt2bnVtKjQrM10gPSBuZXdBbHBoYSgpXG5cdH0gZWxzZSB7IC8vIHJhbmRvbWl6ZSBhIHBvc2l0aW9uXG5cdFx0dmVydEFyclt2bnVtKjNdICAgPSByYW5kKClcblx0XHR2ZXJ0QXJyW3ZudW0qMysxXSA9IHJhbmQoKVxuXHRcdHZlcnRBcnJbdm51bSozKzJdID0gcmFuZCgpXG5cdFx0XG5cdFx0aWYgKGZsYXR0ZW5lZFopIHsgLy8gaWYgZmxhdCBwb2x5cywgY2hhbmdlIFogb2Ygd2hvbGUgcG9seVxuXHRcdFx0dmFyIHogPSB2ZXJ0QXJyW3ZudW0qMysyXVxuXHRcdFx0dmFyIHBudW0gPSBmbG9vcih2bnVtLzMpXG5cdFx0XHR2ZXJ0QXJyW3BudW0qOSsyXSA9IHpcblx0XHRcdHZlcnRBcnJbcG51bSo5KzVdID0gelxuXHRcdFx0dmVydEFycltwbnVtKjkrOF0gPSB6XG5cdFx0fVxuXHR9XG59XG5cblxuXG5cblxuXG5cbmZ1bmN0aW9uIGNhY2hlRGF0YU5vdygpIHtcblx0b2xkVmVydEFyciA9IHZlcnRBcnIuc2xpY2UoKVxuXHRvbGRDb2xBcnIgPSBjb2xBcnIuc2xpY2UoKVxufVxuZnVuY3Rpb24gcmVzdG9yZUNhY2hlZERhdGEoKSB7XG5cdHZlcnRBcnIgPSBvbGRWZXJ0QXJyXG5cdGNvbEFyciA9IG9sZENvbEFyclxufVxuXG5mdW5jdGlvbiBzb3J0UG9seWdvbnNCeVooKSB7XG5cdHZhciBpLGpcblx0Ly8gbWFrZSBhbmQgc29ydCBhbiBhcnIgb2YgeiB2YWx1ZXMgYXZlcmFnZWQgb3ZlciBlYWNoIHBvbHlcblx0dmFyIHNvcnRkYXQgPSBbXVxuXHRmb3IgKGk9MDsgaTx2ZXJ0QXJyLmxlbmd0aDsgaSs9OSkge1xuXHRcdHZhciB6YXZnID0gKHZlcnRBcnJbaSsyXSArIHZlcnRBcnJbaSs1XSArIHZlcnRBcnJbaSs4XSkgLyAzXG5cdFx0c29ydGRhdC5wdXNoKHsgaW5kZXg6aS85LCB6OnphdmcgfSlcblx0fVxuXHRzb3J0ZGF0LnNvcnQoc29ydEZjbilcblx0dmFyIG9sZFYgPSB2ZXJ0QXJyLnNsaWNlKClcblx0dmFyIG9sZEMgPSBjb2xBcnIuc2xpY2UoKVxuXHRmb3IgKGk9MDsgaTxzb3J0ZGF0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0dmFyIGl0ZW0gPSBzb3J0ZGF0W2ldXG5cdFx0Zm9yIChqPTA7IGo8OTsgaisrKSB7XG5cdFx0XHR2ZXJ0QXJyW2kqOStqXSA9IG9sZFZbaXRlbS5pbmRleCo5K2pdXG5cdFx0fVxuXHRcdGZvciAoaj0wOyBqPDEyOyBqKyspIHtcblx0XHRcdGNvbEFycltpKjEyK2pdID0gIG9sZENbaXRlbS5pbmRleCoxMitqXVxuXHRcdH1cblx0fVxufVxuZnVuY3Rpb24gc29ydEZjbihhLGIpIHtcblx0cmV0dXJuIChhLno8Yi56KSA/IDEgOiAtMVxufVxuXG5cblxuZnVuY3Rpb24gc2V0QWxwaGFSYW5nZShhLGIpIHtcblx0YSA9IHBhcnNlRmxvYXQoYSlcblx0YiA9IHBhcnNlRmxvYXQoYilcblx0bWluQWxwaGEgPSBNYXRoLm1pbihhLGIpXG5cdG1heEFscGhhID0gTWF0aC5tYXgoYSxiKVxufVxuXG5mdW5jdGlvbiBzZXRGbGF0dGVuZWRuZXNzKGJvb2wpIHtcblx0ZmxhdHRlbmVkWiA9IGJvb2xcbn1cblxuXG5mdW5jdGlvbiBnZXROdW1WZXJ0cygpIHtcblx0cmV0dXJuIHZlcnRBcnIubGVuZ3RoIC8gM1xufVxuXG5cbnZhciBwb2x5ID0ge1xuXHQgIGluaXQ6IGluaXRcblx0LCBzZXRBcnJheXM6IHNldEFycmF5c1xuXHQsIHNvcnRQb2x5Z29uc0J5Wjogc29ydFBvbHlnb25zQnlaXG5cdCwgY2FjaGVEYXRhTm93OiBjYWNoZURhdGFOb3dcblx0LCByZXN0b3JlQ2FjaGVkRGF0YTogcmVzdG9yZUNhY2hlZERhdGFcblx0LCBtdXRhdGVWZXJ0ZXg6IG11dGF0ZVZlcnRleFxuXHQsIG11dGF0ZVZhbHVlOiBtdXRhdGVWYWx1ZVxuXHQsIGFkZFBvbHk6IGFkZFBvbHlcblx0LCBjbG9uZVBvbHk6IGNsb25lUG9seVxuXHQsIHJlbW92ZVBvbHk6IHJlbW92ZVBvbHlcblx0LCBzZXRBbHBoYVJhbmdlOiBzZXRBbHBoYVJhbmdlXG5cdCwgc2V0RmxhdHRlbmVkbmVzczogc2V0RmxhdHRlbmVkbmVzc1xuLy9cdCwgZGVidWc6IGRlYnVnXG5cdCwgbWFrZVRlc3REYXRhOiBtYWtlVGVzdERhdGFcbi8vXHQsIHRlc3RBbHBoYTogdGVzdEFscGhhXG59XG5PYmplY3QuZGVmaW5lUHJvcGVydHkocG9seSwgJ251bVZlcnRzJyx7Z2V0OiBmdW5jdGlvbigpeyByZXR1cm4gZ2V0TnVtVmVydHMoKSB9fSlcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwb2x5LCAndmVydEFycicsIHtnZXQ6IGZ1bmN0aW9uKCl7IHJldHVybiB2ZXJ0QXJyIH19KVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHBvbHksICdjb2xBcnInLCAge2dldDogZnVuY3Rpb24oKXsgcmV0dXJuIGNvbEFyciB9fSlcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwb2x5LCAnbWluQWxwaGEnLCAge2dldDogZnVuY3Rpb24oKXsgcmV0dXJuIG1pbkFscGhhIH19KVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KHBvbHksICdtYXhBbHBoYScsICB7Z2V0OiBmdW5jdGlvbigpeyByZXR1cm4gbWF4QWxwaGEgfX0pXG5cdFxuXG5tb2R1bGUuZXhwb3J0cyA9IHBvbHlcblxuXG5cblxuXG4vL2Z1bmN0aW9uIGxvZ0FycihhcnIpIHtcbi8vXHRjb25zb2xlLmxvZyhhcnIubWFwKGZ1bmN0aW9uKG4peyByZXR1cm4oTWF0aC5yb3VuZChuKjEwMCkpIH0pKVxuLy99XG4vL1xuLy9mdW5jdGlvbiBkZWJ1ZyhsYWJlbCkge1xuLy8vL1x0Y29uc29sZS5sb2cobGFiZWwsICcgdmVydDogJyxcbi8vLy9cdFx0XHRcdFx0XHRcdHZlcnRBcnIubWFwKGZ1bmN0aW9uKG4peyByZXR1cm4oTWF0aC5yb3VuZChuKjEwMCkpIH0pIClcbi8vXHRjb25zb2xlLmxvZyhsYWJlbCwgJyBjb2xyOiAnLFxuLy9cdFx0XHRcdFx0XHRcdGNvbEFyci5tYXAoZnVuY3Rpb24obil7IHJldHVybihNYXRoLnJvdW5kKG4qMTAwKSkgfSkgKVxuLy99XG4vL2Z1bmN0aW9uIHRlc3RBbHBoYShsYWJlbCkge1xuLy9cdGZvciAodmFyIGk9MzsgaTxjb2xBcnIubGVuZ3RoOyBpKz00KSB7XG4vL1x0XHR2YXIgYyA9IGNvbEFycltpXSBcbi8vXHRcdGlmIChjPG1pbkFscGhhIHx8IGM+bWF4QWxwaGEpIHtcbi8vXHRcdFx0Y29uc29sZS5sb2coJ2Vycj8nLCBpLCBjKVxuLy9cdFx0XHRyZXR1cm4gdHJ1ZSB9XG4vL1x0fVxuLy9cdHJldHVybiBmYWxzZVxuLy99XG5mdW5jdGlvbiBtYWtlVGVzdERhdGEoKSB7XG5cdGluaXQoMylcblx0dmVydEFyciA9IFsgMCwwLC41LCAgMSwwLC41LCAgMCwxLC41LFxuXHRcdFx0XHRcdFx0ICAxLDEsMSwgIDEsMCwxLCAgMCwxLDEsXG5cdFx0XHRcdFx0XHQgIDAsMCwwLCAgMCwxLDAsICAxLDEsMFxuXHRcdFx0XHRcdFx0XVxuXHR2YXIgYyA9IC43XG5cdHZhciBhID0gLjJcblx0Y29sQXJyID0gWyBjLDAsMCxhLCAgYywwLDAsYSwgIGMsMCwwLGEsIFxuXHRcdFx0XHRcdFx0IDAsYywwLDEsICAwLGMsMCwxLCAgMCxjLDAsMSwgXG5cdFx0XHRcdFx0XHQgMCwwLGMsYSwgIDAsMCxjLGEsICAwLDAsYyxhIFxuXHRcdFx0XHRcdFx0XVxuXHRzb3J0UG9seWdvbnNCeVooKVxufSJdfQ==