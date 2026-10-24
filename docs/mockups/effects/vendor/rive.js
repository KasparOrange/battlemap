(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["rive"] = factory();
	else
		root["rive"] = factory();
})(this, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Animation: () => (/* reexport safe */ _Animation__WEBPACK_IMPORTED_MODULE_0__.Animation)
/* harmony export */ });
/* harmony import */ var _Animation__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2);



/***/ }),
/* 2 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Animation: () => (/* binding */ Animation)
/* harmony export */ });
/**
 * Represents an animation that can be played on an Artboard.
 * Wraps animations and instances from the runtime and keeps track of playback state.
 *
 * The `Animation` class manages the state and behavior of a single animation instance,
 * including its current time, loop count, and ability to scrub to a specific time.
 *
 * The class provides methods to advance the animation, apply its interpolated keyframe
 * values to the Artboard, and clean up the underlying animation instance when the
 * animation is no longer needed.
 */
var Animation = /** @class */ (function () {
    /**
     * Constructs a new animation
     * @constructor
     * @param {any} animation: runtime animation object
     * @param {any} instance: runtime animation instance object
     */
    function Animation(animation, artboard, runtime, playing) {
        this.animation = animation;
        this.artboard = artboard;
        this.playing = playing;
        this.loopCount = 0;
        /**
         * The time to which the animation should move to on the next render.
         * If not null, the animation will scrub to this time instead of advancing by the given time.
         */
        this.scrubTo = null;
        this.instance = new runtime.LinearAnimationInstance(animation, artboard);
    }
    Object.defineProperty(Animation.prototype, "name", {
        /**
         * Returns the animation's name
         */
        get: function () {
            return this.animation.name;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Animation.prototype, "time", {
        /**
         * Returns the animation's name
         */
        get: function () {
            return this.instance.time;
        },
        /**
         * Sets the animation's current time
         */
        set: function (value) {
            this.instance.time = value;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Animation.prototype, "loopValue", {
        /**
         * Returns the animation's loop type
         */
        get: function () {
            return this.animation.loopValue;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Animation.prototype, "needsScrub", {
        /**
         * Indicates whether the animation needs to be scrubbed.
         * @returns `true` if the animation needs to be scrubbed, `false` otherwise.
         */
        get: function () {
            return this.scrubTo !== null;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Advances the animation by the give time. If the animation needs scrubbing,
     * time is ignored and the stored scrub value is used.
     * @param time the time to advance the animation by if no scrubbing required
     */
    Animation.prototype.advance = function (time) {
        if (this.scrubTo === null) {
            this.instance.advance(time);
        }
        else {
            this.instance.time = 0;
            this.instance.advance(this.scrubTo);
            this.scrubTo = null;
        }
    };
    /**
     * Apply interpolated keyframe values to the artboard. This should be called after calling
     * .advance() on an animation instance so that new values are applied to properties.
     *
     * Note: This does not advance the artboard, which updates all objects on the artboard
     * @param mix - Mix value for the animation from 0 to 1
     */
    Animation.prototype.apply = function (mix) {
        this.instance.apply(mix);
    };
    /**
     * Deletes the backing Wasm animation instance; once this is called, this
     * animation is no more.
     */
    Animation.prototype.cleanup = function () {
        this.instance.delete();
    };
    return Animation;
}());



/***/ }),
/* 3 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   RuntimeLoader: () => (/* binding */ RuntimeLoader)
/* harmony export */ });
/* harmony import */ var _rive_advanced_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(4);
/* harmony import */ var _rive_threads_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(5);
/* harmony import */ var _rive_threads_mjs__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_rive_threads_mjs__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var package_json__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(6);
var __assign = (undefined && undefined.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};



// A module with a shared memory, an atomic load and a SIMD constant.
var threadsProbe = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x09, 0x02, 0x60, 0x00,
    0x01, 0x7f, 0x60, 0x00, 0x01, 0x7b, 0x03, 0x03, 0x02, 0x00, 0x01, 0x05, 0x04,
    0x01, 0x03, 0x01, 0x01, 0x0a, 0x1f, 0x02, 0x08, 0x00, 0x41, 0x00, 0xfe, 0x10,
    0x02, 0x00, 0x0b, 0x14, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b,
]);
// Null when this page can run the threaded build, else why not. A page that
// is not isolated gets no shared memory, and the threaded build never loads.
function threadsRefusal() {
    if (globalThis.crossOriginIsolated !== true) {
        return "the page is not cross origin isolated";
    }
    try {
        new MessageChannel().port1.postMessage(new SharedArrayBuffer(1));
    }
    catch (_a) {
        return "the page cannot share memory with workers";
    }
    if (!WebAssembly.validate(threadsProbe)) {
        return "the browser cannot run wasm threads with SIMD";
    }
    return null;
}
// Runtime singleton; use getInstance to provide a callback that returns the
// Rive runtime
var RuntimeLoader = /** @class */ (function () {
    // Class is never instantiated
    function RuntimeLoader() {
    }
    // Rejects all pending awaitInstance() promises and resets loading state so
    // the next call to getInstance() / awaitInstance() can retry with a new URL.
    RuntimeLoader.notifyError = function (error) {
        var _a;
        RuntimeLoader.isLoading = false;
        while (RuntimeLoader.errorCallbackQueue.length > 0) {
            (_a = RuntimeLoader.errorCallbackQueue.shift()) === null || _a === void 0 ? void 0 : _a(error);
        }
        RuntimeLoader.callBackQueue = [];
    };
    RuntimeLoader.loaded = function (rive) {
        var _a;
        if (RuntimeLoader.enablePerfMarks) {
            performance.mark('rive:wasm-init:end');
            performance.measure('rive:wasm-init', 'rive:wasm-init:start', 'rive:wasm-init:end');
        }
        RuntimeLoader.runtime = rive;
        RuntimeLoader.errorCallbackQueue = [];
        // Fire all the callbacks
        while (RuntimeLoader.callBackQueue.length > 0) {
            (_a = RuntimeLoader.callBackQueue.shift()) === null || _a === void 0 ? void 0 : _a(RuntimeLoader.runtime);
        }
    };
    // Loads the runtime, threaded once per page where it can be, and otherwise
    // without threads.
    RuntimeLoader.loadRuntime = function () {
        // Other packages bundle an empty module here, which webpack's interop
        // hands over as an object rather than undefined.
        var threaded = (_rive_threads_mjs__WEBPACK_IMPORTED_MODULE_1___default());
        var threadsUrl = RuntimeLoader.wasmThreadsURL;
        // A host's own binary is a build without threads.
        if (typeof threaded !== "function" ||
            threadsUrl === null ||
            RuntimeLoader.wasmBinary !== null ||
            RuntimeLoader.triedThreads) {
            RuntimeLoader.loadUnthreaded();
            return;
        }
        RuntimeLoader.triedThreads = true;
        var refusal = threadsRefusal();
        if (refusal !== null) {
            console.warn("Rive is running without threads: ".concat(refusal, "."));
            RuntimeLoader.loadUnthreaded();
            return;
        }
        if (RuntimeLoader.enablePerfMarks)
            performance.mark('rive:wasm-init:start');
        // Not a catch, which would also take a throw from a callback.
        threaded({ locateFile: function () { return threadsUrl; } }).then(RuntimeLoader.loaded, function (error) {
            var _a;
            console.warn("Rive is running without threads: the threaded build failed to load (".concat((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : error, ")."));
            RuntimeLoader.loadUnthreaded();
        });
    };
    RuntimeLoader.loadUnthreaded = function () {
        // Capture the URL at call time so the catch closure always refers to the
        // URL this particular attempt used, even if wasmURL is mutated for a retry.
        var attemptedUrl = RuntimeLoader.wasmURL;
        var wasmBinary = RuntimeLoader.wasmBinary;
        if (RuntimeLoader.enablePerfMarks)
            performance.mark('rive:wasm-init:start');
        _rive_advanced_mjs__WEBPACK_IMPORTED_MODULE_0__["default"](__assign({ 
            // Loads Wasm bundle
            locateFile: function () { return attemptedUrl; } }, (wasmBinary ? { wasmBinary: wasmBinary } : {})))
            .then(RuntimeLoader.loaded)
            .catch(function (error) {
            // Capture specific error details
            var errorDetails = {
                message: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
                type: (error === null || error === void 0 ? void 0 : error.name) || "Error",
                // Some browsers may provide additional WebAssembly-specific details
                wasmError: error instanceof WebAssembly.CompileError ||
                    error instanceof WebAssembly.RuntimeError,
                originalError: error,
            };
            // Log detailed error for debugging
            console.debug("Rive WASM load error details:", errorDetails);
            // In case the primary URL fails, or the wasm was not supported, try the
            // fallback URL (a rive_fallback.wasm compiled for older architectures).
            // The fallback can be customised or disabled via setWasmFallbackUrl().
            // TODO: (Gordon): preemptively test browser support and load the correct wasm file. Then use the fallback only if the primary fails.
            var fallbackUrl = RuntimeLoader.wasmFallbackURL;
            var alreadyOnFallback = fallbackUrl !== null &&
                attemptedUrl.toLowerCase() === fallbackUrl.toLowerCase();
            if (fallbackUrl !== null && !alreadyOnFallback) {
                console.warn("Failed to load WASM from ".concat(attemptedUrl, " (").concat(errorDetails.message, "), trying fallback URL: ").concat(fallbackUrl));
                // Clear wasmBinary so the retry actually fetches via locateFile
                // instead of re-using the same (failing) in-memory binary.
                RuntimeLoader.wasmBinary = null;
                RuntimeLoader.setWasmUrl(fallbackUrl);
                RuntimeLoader.loadUnthreaded();
            }
            else {
                // When alreadyOnFallback is true, wasmURL has already been overwritten
                // with the fallback URL, so we can no longer recover the original
                // primary URL here. The primary URL was logged in the earlier warning.
                var triedUrls = alreadyOnFallback
                    ? "the configured WASM URL or its fallback (".concat(fallbackUrl, ")")
                    : attemptedUrl;
                var errorMessage = [
                    "Could not load Rive WASM file from ".concat(triedUrls, "."),
                    "Possible reasons:",
                    "- Network connection is down",
                    "- WebAssembly is not supported in this environment",
                    "- The WASM file is corrupted or incompatible",
                    "\nError details:",
                    "- Type: ".concat(errorDetails.type),
                    "- Message: ".concat(errorDetails.message),
                    "- WebAssembly-specific error: ".concat(errorDetails.wasmError),
                    "\nTo resolve, you may need to:",
                    "1. Check your network connection",
                    "2. Set a new WASM source via RuntimeLoader.setWasmUrl()",
                    "3. Call RuntimeLoader.awaitInstance() again",
                ].join("\n");
                console.error(errorMessage);
                RuntimeLoader.notifyError(new Error(errorMessage));
            }
        });
    };
    // Provides a runtime instance via a callback
    RuntimeLoader.getInstance = function (callback, onError) {
        // If it's not loading, start loading runtime
        if (!RuntimeLoader.isLoading) {
            RuntimeLoader.isLoading = true;
            RuntimeLoader.loadRuntime();
        }
        if (!RuntimeLoader.runtime) {
            RuntimeLoader.callBackQueue.push(callback);
            if (onError) {
                RuntimeLoader.errorCallbackQueue.push(onError);
            }
        }
        else {
            callback(RuntimeLoader.runtime);
        }
    };
    // Provides a runtime instance via a promise; rejects if WASM fails to load.
    RuntimeLoader.awaitInstance = function () {
        return new Promise(function (resolve, reject) {
            return RuntimeLoader.getInstance(resolve, reject);
        });
    };
    // Manually sets the wasm url
    RuntimeLoader.setWasmUrl = function (url) {
        RuntimeLoader.wasmURL = url;
    };
    // Gets the current wasm url
    RuntimeLoader.getWasmUrl = function () {
        return RuntimeLoader.wasmURL;
    };
    /**
     * Sets the URL used as a fallback when the primary WASM URL fails to load.
     * Pass `null` to disable the fallback entirely.
     *
     * Defaults to pulling from the jsdelivr CDN.
     */
    RuntimeLoader.setWasmFallbackUrl = function (url) {
        RuntimeLoader.wasmFallbackURL = url;
    };
    // Gets the current fallback wasm url (null means fallback is disabled)
    RuntimeLoader.getWasmFallbackUrl = function () {
        return RuntimeLoader.wasmFallbackURL;
    };
    /**
     * Sets the URL of the threaded build's wasm, which
     * `@rive-app/webgl2-threads` loads on a cross origin isolated page. Pass
     * `null` to always load the build without threads. Other packages have no
     * threaded build and ignore it.
     *
     * Defaults to pulling from the unpkg CDN.
     */
    RuntimeLoader.setWasmThreadsUrl = function (url) {
        RuntimeLoader.wasmThreadsURL = url;
    };
    // Gets the threaded build's wasm url (null means threads are off)
    RuntimeLoader.getWasmThreadsUrl = function () {
        return RuntimeLoader.wasmThreadsURL;
    };
    // Manually sets the wasm binary or clears it with null
    RuntimeLoader.setWasmBinary = function (value) {
        if ((value instanceof ArrayBuffer) || value === null) {
            RuntimeLoader.wasmBinary = value;
            return;
        }
        console.error("setWasmBinary expects an ArrayBuffer or null");
    };
    // Gets the current wasm build as ArrayBuffer or null
    RuntimeLoader.getWasmBinary = function () {
        return RuntimeLoader.wasmBinary;
    };
    // Flag to indicate that loading has started/completed
    RuntimeLoader.isLoading = false;
    // List of callbacks for the runtime that come in while loading
    RuntimeLoader.callBackQueue = [];
    // Path to the Wasm file; default path works for testing only;
    // if embedded wasm is used then this is never used.
    RuntimeLoader.wasmURL = "https://unpkg.com/".concat(package_json__WEBPACK_IMPORTED_MODULE_2__.name, "@").concat(package_json__WEBPACK_IMPORTED_MODULE_2__.version, "/rive.wasm");
    // Fallback WASM URL tried when the primary URL fails. Set to null to disable
    // the fallback entirely. Defaults to pulling from the jsdelivr CDN.
    RuntimeLoader.wasmFallbackURL = "https://cdn.jsdelivr.net/npm/".concat(package_json__WEBPACK_IMPORTED_MODULE_2__.name, "@").concat(package_json__WEBPACK_IMPORTED_MODULE_2__.version, "/rive_fallback.wasm");
    RuntimeLoader.wasmBinary = null;
    // The threaded build's wasm, tried first on a page that can run it. Null
    // in packages without one, or to stay on the build without threads.
    RuntimeLoader.wasmThreadsURL = typeof (_rive_threads_mjs__WEBPACK_IMPORTED_MODULE_1___default()) === "function"
        ? "https://unpkg.com/".concat(package_json__WEBPACK_IMPORTED_MODULE_2__.name, "@").concat(package_json__WEBPACK_IMPORTED_MODULE_2__.version, "/rive_threads.wasm")
        : null;
    RuntimeLoader.triedThreads = false;
    // Error callbacks enqueued from .getInstance()
    RuntimeLoader.errorCallbackQueue = [];
    /**
     * When true, performance.mark / performance.measure entries are emitted for
     * WASM initialization.
     */
    RuntimeLoader.enablePerfMarks = false;
    return RuntimeLoader;
}());



/***/ }),
/* 4 */
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
var Rive=(()=>{var _scriptName=globalThis.document?.currentScript?.src;return async function(moduleArg={}){var moduleRtn;var G=moduleArg,ea=!!globalThis.window,na=!!globalThis.WorkerGlobalScope;
function sa(){function d(D){const F=r;l=f=0;r=new Map;F.forEach(K=>{try{K(D)}catch(P){console.error(P)}});this.bc();z&&z.ad()}let f=0,l=0,r=new Map,z=null,C=null;this.requestAnimationFrame=function(D){f||=requestAnimationFrame(d.bind(this));const F=++l;r.set(F,D);return F};this.cancelAnimationFrame=function(D){r.delete(D);f&&0==r.size&&(cancelAnimationFrame(f),f=0)};this.Vc=function(D){C&&(document.body.remove(C),C=null);D||(C=document.createElement("div"),C.style.backgroundColor="black",C.style.position=
"fixed",C.style.right=0,C.style.top=0,C.style.color="white",C.style.padding="4px",C.innerHTML="RIVE FPS",D=function(F){C.innerHTML="RIVE FPS "+F.toFixed(1)},document.body.appendChild(C));z=new function(){let F=0,K=0;this.ad=function(){var P=performance.now();K?(++F,P-=K,1E3<P&&(D(1E3*F/P),F=K=0)):(K=P,F=0)}}};this.Sc=function(){C&&(document.body.remove(C),C=null);z=null};this.bc=function(){}}
function ta(){console.assert(!0);const d=new Map;let f=-Infinity;this.push=function(l){l=l+255>>8;d.has(l)&&clearTimeout(d.get(l));d.set(l,setTimeout(function(){d.delete(l);0==d.length?f=-Infinity:l==f&&(f=Math.max(...d.keys()),console.assert(f<l))},1E3));f=Math.max(l,f);return f<<8}}function ua(d){return function(){d();const f=G.riveScripting;if(f)for(const l of f.frameBoundary())console.warn(l)}}const xa=G.onRuntimeInitialized;
G.onRuntimeInitialized=function(){xa&&xa();G.startFileScripts=function(D){const F=G.riveScripting;return D&&F&&D.startScripts?F.prepare().then(function(){D.startScripts();return D}):Promise.resolve(D)};let d=G.decodeAudio;G.decodeAudio=function(D,F,K=null){D=d(D,K??null);F(D)};let f=G.decodeFont;G.decodeFont=function(D,F,K=null){D=f(D,K??null);F(D)};const l=G.FileAsset.prototype.decode;G.FileAsset.prototype.decode=function(D,F){return l.call(this,D,F??null)};let r=G.setFallbackFontCb;G.setFallbackFontCallback=
"function"===typeof r?function(D){r(D)}:function(){console.warn("Module.setFallbackFontCallback called, but text support is not enabled in this build.")};const z=G.FileAssetLoader;G.ptrToAsset=D=>{let F=G.ptrToFileAsset(D);return F.isImage?G.ptrToImageAsset(D):F.isFont?G.ptrToFontAsset(D):F.isAudio?G.ptrToAudioAsset(D):F};G.CustomFileAssetLoader=z.extend("CustomFileAssetLoader",{__construct:function({loadContents:D}){this.__parent.__construct.call(this);this.Ac=D},loadContents:function(D,F){D=G.ptrToAsset(D);
return this.Ac(D,F)}});G.CDNFileAssetLoader=z.extend("CDNFileAssetLoader",{__construct:function(D){this.__parent.__construct.call(this);this.Dc=D??null},loadContents:function(D){let F=G.ptrToAsset(D);D=F.cdnUuid;if(""===D)return!1;const K=this.Dc??null;(function(P,X){var W=new XMLHttpRequest;W.responseType="arraybuffer";W.onreadystatechange=function(){4==W.readyState&&200==W.status&&X(W)};W.open("GET",P,!0);W.send(null)})(F.cdnBaseUrl+"/"+D,P=>{F.decode(new Uint8Array(P.response),K)});return!0}});
G.FallbackFileAssetLoader=z.extend("FallbackFileAssetLoader",{__construct:function(){this.__parent.__construct.call(this);this.Zb=[]},addLoader:function(D){this.Zb.push(D)},loadContents:function(D,F){for(let K of this.Zb)if(K.loadContents(D,F))return!0;return!1}});let C=G.computeAlignment;G.computeAlignment=function(D,F,K,P,X=1){return C.call(this,D,F,K,P,X)}};
(function(){function d(p,a,e=null){const c=p.Kc,n=p.za,q=p.ya,v=p.La??{i:!1};let h=null;const b=()=>{const A=a().buffer;if(null===h||h.buffer!==A)h=new Uint8Array(A);return h},g=(A,w)=>{if(0>w||(A>>>0)+w>b().length)throw new RangeError("module range out of bounds");A=4096<w?p.tb(w):p.Xa(w);if(0===A)throw Error(`could not stage ${w} bytes for the host`);return A},k=(A,w)=>{const t=g(A,w);A>>>=0;p.ca().set(h.subarray(A,A+w),t);v.i&&(v.Ja+=w);return t},m=(A,w)=>{0!==A&&4096<w&&p.ma(A)},x=(A,w,t)=>{0!==
t&&(b().set(p.ca().subarray(A,A+t),w>>>0),v.i&&(v.Ha+=t))},L=(A,w)=>{const t=z(a().buffer,A),y=n();let u=0;try{u=k(A,t),w(u,t)}finally{m(u,t),q(y)}},T=A=>w=>L(w,(t,y)=>c.$e(A,t,y));return{env:{seed:()=>Date.now()*Math.random(),emscripten_get_now:()=>performance.now(),emscripten_date_now:()=>Date.now(),trace:(A,w,t,y,u,E,N)=>L(A,(R,ra)=>c.dk(R,ra,w,t,y,u,E,N)),"console.log":T(0),"console.debug":T(0),"console.info":T(0),"console.warn":T(0),"console.error":T(0),"console.time":T(1),"console.timeLog":T(2),
"console.timeEnd":T(3)},rive_rt_v1:(null===e||"rive_rt_v1"===e)&&{log:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t),c.ej(A,u,t)}finally{m(u,t),q(y)}},mark_needs_update:c.fj,budget_exceeded:c.Zi,error:(A,w)=>{const t=n();let y=0;try{y=k(A,w),c.cj(y,w)}finally{m(y,w),q(t)}},now:()=>performance.now(),date_now:()=>Date.now(),debug_enter:c.$i,debug_line:c.bj,debug_leave:c.aj,utc_offset:c.gj,is_dst:c.dj,zone_name:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.hj(A,u,t);x(u,w,t);return E}finally{m(u,
t),q(y)}}},rive_data_v1:(null===e||"rive_data_v1"===e)&&{view_model:c.Yf,root_view_model:c.Sf,global_view_model:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.yf(A,u,t)}finally{m(u,t),q(y)}},global_view_model_names:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.zf(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},context:c.mf,context_parent:c.nf,context_view_model:c.qf,context_release:c.pf,has_view_model:(A,w)=>{const t=n();let y=0;try{return y=k(A,w),c.Af(y,w)}finally{m(y,w),q(t)}},new_view_model:(A,
w,t,y)=>{const u=n();let E=0,N=0;try{return E=k(A,w),N=k(t,y),c.Of(E,w,N,y)}finally{m(N,y),m(E,w),q(u)}},vmi_release:c.mg,vmi_number:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.kg(A,u,t)}finally{m(u,t),q(y)}},vmi_boolean:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.cg(A,u,t)}finally{m(u,t),q(y)}},vmi_string:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.ng(A,u,t)}finally{m(u,t),q(y)}},vmi_trigger:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.pg(A,u,t)}finally{m(u,t),q(y)}},
vmi_color:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.dg(A,u,t)}finally{m(u,t),q(y)}},vmi_view_model:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.qg(A,u,t)}finally{m(u,t),q(y)}},vmi_property:(A,w,t,y,u)=>{const E=n();let N=0,R=0;try{N=k(w,t);R=k(y,4*u);const ra=c.lg(A,N,t,R,u);x(R,y,4*u);return ra}finally{m(R,4*u),m(N,t),q(E)}},vmi_instance:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.ig(A,u,t)}finally{m(u,t),q(y)}},vmi_symbol_index:c.og,vmi_equal:c.fg,view_model_get:c.Zf,vmi_list:(A,
w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.jg(A,u,t)}finally{m(u,t),q(y)}},vmi_enum:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.eg(A,u,t)}finally{m(u,t),q(y)}},vmi_image:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.hg(A,u,t)}finally{m(u,t),q(y)}},vmi_font:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.gg(A,u,t)}finally{m(u,t),q(y)}},vmi_blob:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.bg(A,u,t)}finally{m(u,t),q(y)}},vmi_artboard:(A,w,t)=>{const y=n();let u=0;try{return u=
k(w,t),c.ag(A,u,t)}finally{m(u,t),q(y)}},image_get:c.Bf,image_set:c.Cf,font_get:c.vf,font_set:c.xf,font_release:c.wf,blob_present:c.ff,blob_get:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.df(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},blob_name:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.ef(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},blob_set:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t),c.gf(A,u,t)}finally{m(u,t),q(y)}},blob_clear:c.cf,artboard_get:c.af,artboard_set:c.bf,enum_get:(A,
w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.sf(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},enum_set:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t),c.tf(A,u,t)}finally{m(u,t),q(y)}},enum_values:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.uf(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},prop_release:c.Rf,trigger_fire:c.Wf,list_length:c.Gf,list_push:c.If,list_pop:c.Hf,list_shift:c.Mf,list_clear:c.Df,list_swap:c.Nf,list_insert:c.Ff,list_remove:c.Jf,list_remove_at:c.Lf,list_remove_all_of:c.Kf,
list_get:c.Ef,view_model_set:c.$f,color_get:c.kf,color_set:c.lf,number_get:c.Pf,number_set:c.Qf,boolean_get:c.hf,boolean_set:c.jf,string_get:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.Uf(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},string_changed:c.Tf,string_set:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t),c.Vf(A,u,t)}finally{m(u,t),q(y)}},watch:c.rg,unwatch:c.Xf,convert_result:(A,w,t,y,u,E)=>{const N=n();let R=0;try{R=k(u,E),c.rf(A,w,t,y,R,E)}finally{m(R,E),q(N)}}},rive_artboard_v1:(null===
e||"rive_artboard_v1"===e)&&{release:c.je,advance:c.Dd,draw:c.Ld,instance:c.Vd,data:c.Kd,width:c.oe,height:c.Ud,set_width:c.ne,set_height:c.me,frame_origin:c.Sd,set_frame_origin:c.le,bounds:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t),c.Jd(A,u,t),x(u,w,4*t)}finally{m(u,4*t),q(y)}},pointer_event:c.he,scroll_event:c.ke,gamepad_event:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Td(A,u,t)}finally{m(u,t),q(y)}},animation:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Ed(A,u,t)}finally{m(u,
t),q(y)}},animation_release:c.Hd,animation_duration:c.Gd,animation_advance:c.Fd,animation_set_time:c.Id,add_to_path:c.Cd,node:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Wd(A,u,t)}finally{m(u,t),q(y)}},node_release:c.ce,node_transform:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t),c.fe(A,u,t),x(u,w,4*t)}finally{m(u,4*t),q(y)}},node_set:c.de,node_world_transform:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t),c.ge(A,u,t),x(u,w,4*t)}finally{m(u,4*t),q(y)}},node_set_world_transform:(A,w,t)=>{const y=
n();let u=0;try{u=k(w,4*t),c.ee(A,u,t)}finally{m(u,4*t),q(y)}},node_decompose:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t),c.Yd(A,u,t)}finally{m(u,4*t),q(y)}},node_path_verbs:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.be(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},node_path_points:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.ae(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},node_paint:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.Zd(A,u,t);x(u,w,4*t);return E}finally{m(u,
4*t),q(y)}},node_children:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.Xd(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},node_parent:c.$d,property_key:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.ie(A,u,t)}finally{m(u,t),q(y)}},draw_visit:c.Nd,draw_modulated:c.Md,drawable_draw:c.Od,drawable_value:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,4*y);const N=c.Rd(A,w,E,y);x(E,t,4*y);return N}finally{m(E,4*y),q(u)}},drawable_string:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,y);const N=
c.Qd(A,w,E,y);x(E,t,y);return N}finally{m(E,y),q(u)}},drawable_properties:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=c.Pd(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}}},rive_audio_v1:(null===e||"rive_audio_v1"===e)&&{source:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.He(A,u,t)}finally{m(u,t),q(y)}},source_release:c.Ke,source_duration:c.Je,source_sample_rate:c.Le,source_channels:c.Ie,play:c.pe,play_at_time:c.re,play_in_time:c.te,play_at_frame:c.qe,play_in_frame:c.se,time:c.Me,time_frame:c.Ne,
sample_rate:c.ue,sound_release:c.ye,sound_play:c.xe,sound_pause:c.we,sound_resume:c.ze,sound_stop:c.De,sound_seek:c.Ae,sound_seek_frame:c.Be,sound_completed:c.ve,sound_time:c.Ee,sound_time_frame:c.Fe,sound_volume:c.Ge,sound_set_volume:c.Ce},rive_path_v1:(null===e||"rive_path_v1"===e)&&{"new":c.Ki,update:(A,w,t,y,u,E)=>{const N=n();let R=0,ra=0;try{R=k(w,t),ra=k(y,4*u),c.Ni(A,R,t,ra,u,E)}finally{m(ra,4*u),m(R,t),q(N)}},release:c.Mi,add:c.Ii,verbs:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t);const E=
c.Oi(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},points:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.Li(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},effect_result:(A,w,t,y)=>{const u=n();let E=0,N=0;try{E=k(A,w),N=k(t,4*y),c.Ji(E,w,N,y)}finally{m(N,4*y),m(E,w),q(u)}}},rive_measure_v1:(null===e||"rive_measure_v1"===e)&&{path_new:(A,w,t,y)=>{const u=n();let E=0,N=0;try{return E=k(A,w),N=k(t,4*y),c.mi(E,w,N,y)}finally{m(N,4*y),m(E,w),q(u)}},contours_new:(A,w,t,y)=>{const u=n();let E=
0,N=0;try{return E=k(A,w),N=k(t,4*y),c.gi(E,w,N,y)}finally{m(N,4*y),m(E,w),q(u)}},contour_next:c.fi,length:c.li,is_closed:c.ki,pos_tan:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,4*y),c.ni(A,w,E,y),x(E,t,4*y)}finally{m(E,4*y),q(u)}},warp:(A,w,t,y,u)=>{const E=n();let N=0;try{N=k(y,4*u),c.pi(A,w,t,N,u),x(N,y,4*u)}finally{m(N,4*u),q(E)}},extract:c.hi,extract_read:(A,w,t,y,u)=>{const E=n();let N=0,R=0;try{N=k(w,t);R=k(y,4*u);const ra=c.ii(A,N,t,R,u);x(N,w,t);x(R,y,4*u);return ra}finally{m(R,4*u),m(N,t),
q(E)}},release:c.oi},rive_paint_v1:(null===e||"rive_paint_v1"===e)&&{"new":c.Ci,release:c.Di,style:c.Gi,color:c.zi,thickness:c.Hi,join:c.Bi,cap:c.yi,blend_mode:c.xi,feather:c.Ai,shader:c.Ei,shader_transform:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t),c.Fi(A,u,t)}finally{m(u,4*t),q(y)}}},rive_canvas_v1:(null===e||"rive_canvas_v1"===e)&&{"new":c.We,release:c.Xe,width:c.Ze,height:c.Ue,resize:c.Ye,image:c.Ve,begin_frame:c.Se,end_frame:c.Te},rive_gpu_v1:(null===e||"rive_gpu_v1"===e)&&{features:(A,w)=>
{const t=n();let y=0;try{y=k(A,4*w);const u=c.gh(y,w);x(y,A,4*w);return u}finally{m(y,4*w),q(t)}},canvas_new:c.dh,canvas_release:c.eh,canvas_color_view:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.ah(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},canvas_image:c.bh,canvas_resize:(A,w,t,y,u)=>{const E=n();let N=0;try{N=k(y,4*u);const R=c.fh(A,w,t,N,u);x(N,y,4*u);return R}finally{m(N,4*u),q(E)}},target_view:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.Fh(A,u,t);x(u,w,4*t);return E}finally{m(u,
4*t),q(y)}},pass_begin:(A,w,t,y)=>{const u=n();let E=0,N=0;try{return E=k(A,w),N=k(t,y),c.ih(E,w,N,y)}finally{m(N,y),m(E,w),q(u)}},pass_set_pipeline:c.qh,pass_set_vertex_buffer:c.th,pass_set_index_buffer:c.ph,pass_set_bind_group:(A,w,t,y,u)=>{const E=n();let N=0;try{N=k(y,u),c.nh(A,w,t,N,u)}finally{m(N,u),q(E)}},pass_set_viewport:c.uh,pass_set_scissor:c.rh,pass_set_stencil_reference:c.sh,pass_set_blend_color:c.oh,pass_draw:c.jh,pass_draw_indexed:c.kh,pass_finish:c.lh,pass_release:c.mh,image_view:c.hh,
buffer_new:(A,w,t,y,u)=>{const E=n();let N=0;try{return N=k(y,u),c.Wg(A,w,t,N,u)}finally{m(N,u),q(E)}},buffer_update:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,y),c.Zg(A,w,E,y)}finally{m(E,y),q(u)}},buffer_update_blob:c.$g,buffer_new_blob:c.Xg,buffer_release:c.Yg,texture_new:(A,w)=>{const t=n();let y=0;try{return y=k(A,w),c.Gh(y,w)}finally{m(y,w),q(t)}},texture_upload:(A,w,t,y,u)=>{const E=n();let N=0,R=0;try{N=k(w,t),R=k(y,u),c.Ih(A,N,t,R,u)}finally{m(R,u),m(N,t),q(E)}},texture_release:c.Hh,sampler_new:(A,
w)=>{const t=n();let y=0;try{return y=k(A,w),c.xh(y,w)}finally{m(y,w),q(t)}},sampler_release:c.yh,texture_view_new:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Jh(A,u,t)}finally{m(u,t),q(y)}},texture_view_release:c.Kh,shader_target:c.Eh,shader_asset_bytes:(A,w,t,y,u)=>{const E=n();let N=0,R=0;try{N=k(w,t);R=k(y,u);const ra=c.zh(A,N,t,R,u);x(R,y,u);return ra}finally{m(R,u),m(N,t),q(E)}},shader_asset_id:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Ah(A,u,t)}finally{m(u,t),q(y)}},shader_module_from_asset:(A,
w,t,y)=>{const u=n();let E=0;try{return E=k(w,t),c.Bh(A,E,t,y)}finally{m(E,t),q(u)}},shader_module_from_rstb:(A,w,t,y)=>{const u=n();let E=0;try{return E=k(A,w),c.Ch(E,w,t,y)}finally{m(E,w),q(u)}},shader_module_release:c.Dh,bind_group_layout_new:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Sg(A,u,t)}finally{m(u,t),q(y)}},bind_group_layout_release:c.Tg,bind_group_layout_from_shader:(A,w,t,y)=>{const u=n();let E=0;try{return E=k(t,4*y),c.Qg(A,w,E,y)}finally{m(E,4*y),q(u)}},bind_group_layout_from_shaders:(A,
w,t,y,u)=>{const E=n();let N=0;try{return N=k(y,4*u),c.Rg(A,w,t,N,u)}finally{m(N,4*u),q(E)}},bind_group_layout_from_entries:(A,w,t,y,u,E,N)=>{const R=n();let ra=0,Ba=0;try{return ra=k(w,t),Ba=k(u,E),c.Pg(A,ra,t,y,Ba,E,N)}finally{m(Ba,E),m(ra,t),q(R)}},bind_group_new:(A,w,t,y,u,E,N)=>{const R=n();let ra=0,Ba=0,Ma=0;try{return ra=k(w,t),Ba=k(y,u),Ma=k(E,N),c.Ug(A,ra,t,Ba,u,Ma,N)}finally{m(Ma,N),m(Ba,u),m(ra,t),q(R)}},bind_group_release:c.Vg,pipeline_new:(A,w,t,y)=>{const u=n();let E=0,N=0;try{return E=
k(A,w),N=k(t,y),c.vh(E,w,N,y)}finally{m(N,y),m(E,w),q(u)}},pipeline_release:c.wh},rive_mat4_v1:(null===e||"rive_mat4_v1"===e)&&{multiply:(A,w,t,y,u,E)=>{const N=n();let R=0,ra=0,Ba=0;try{R=k(A,w),ra=k(t,y),Ba=k(u,E),c.ei(R,w,ra,y,Ba,E),x(R,A,w)}finally{m(Ba,E),m(ra,y),m(R,w),q(N)}},invert:(A,w,t,y)=>{const u=n();let E=0,N=0;try{E=k(A,w);N=k(t,y);const R=c.di(E,w,N,y);x(E,A,w);return R}finally{m(N,y),m(E,w),q(u)}}},rive_buffer_v1:(null===e||"rive_buffer_v1"===e)&&{"new":c.Pe,update:(A,w,t)=>{const y=
n();let u=0;try{u=k(w,t),c.Re(A,u,t)}finally{m(u,t),q(y)}},release:c.Qe},rive_mesh_instances_v1:(null===e||"rive_mesh_instances_v1"===e)&&{"new":c.ri,resize:c.ti,update:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,y),c.ui(A,w,E,y)}finally{m(E,y),q(u)}},release:c.si},rive_blob_v1:(null===e||"rive_blob_v1"===e)&&{asset_bytes:(A,w,t,y,u)=>{const E=n();let N=0,R=0;try{N=k(w,t);R=k(y,u);const ra=c.Oe(A,N,t,R,u);x(R,y,u);return ra}finally{m(R,u),m(N,t),q(E)}}},rive_image_v1:(null===e||"rive_image_v1"===e)&&
{from_asset:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Nh(A,u,t)}finally{m(u,t),q(y)}},width:c.Qh,height:c.Oh,release:c.Ph,decode:(A,w,t)=>{const y=n();let u=0;try{return u=k(A,w),c.Lh(u,w,t)}finally{m(u,w),q(y)}},decode_cancel:c.Mh},rive_font_v1:(null===e||"rive_font_v1"===e)&&{from_asset:(A,w,t)=>{const y=n();let u=0;try{return u=k(w,t),c.Gg(A,u,t)}finally{m(u,t),q(y)}},decode:(A,w)=>{const t=n();let y=0;try{return y=k(A,w),c.Eg(y,w)}finally{m(y,w),q(t)}},release:c.Mg,metrics:(A,w,t)=>
{const y=n();let u=0;try{u=k(w,4*t),c.Lg(A,u,t),x(u,w,4*t)}finally{m(u,4*t),q(y)}},weight:c.Ng,is_italic:c.Kg,axis_count:c.Cg,axis:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,4*y),c.Bg(A,w,E,y),x(E,t,4*y)}finally{m(E,4*y),q(u)}},axis_value:c.Dg,features:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.Fg(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},has_glyph:c.Jg,with_options:(A,w,t,y,u)=>{const E=n();let N=0,R=0;try{return N=k(w,4*t),R=k(y,4*u),c.Og(A,N,t,R,u)}finally{m(R,4*u),m(N,4*t),
q(E)}},glyph_verbs:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,y);const N=c.Ig(A,w,E,y);x(E,t,y);return N}finally{m(E,y),q(u)}},glyph_points:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,4*y);const N=c.Hg(A,w,E,y);x(E,t,4*y);return N}finally{m(E,4*y),q(u)}}},rive_text_v1:(null===e||"rive_text_v1"===e)&&{"new":c.$j,release:c.ak,append:(A,w,t,y,u,E,N,R,ra)=>{const Ba=n();let Ma=0;try{Ma=k(w,t),c.Qj(A,Ma,t,y,u,E,N,R,ra)}finally{m(Ma,t),q(Ba)}},clear:c.Tj,layout:(A,w,t)=>{const y=n();let u=0;try{u=k(w,t),c.Xj(A,
u,t)}finally{m(u,t),q(y)}},draw:c.Uj,bounds:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t),c.Rj(A,u,t),x(u,w,4*t)}finally{m(u,4*t),q(y)}},length:c.Yj,lines:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.Zj(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},runs:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.bk(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},glyphs:(A,w,t)=>{const y=n();let u=0;try{u=k(w,4*t);const E=c.Vj(A,u,t);x(u,w,4*t);return E}finally{m(u,4*t),q(y)}},hit_test:c.Wj,
caret:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,4*y);const N=c.Sj(A,w,E,y);x(E,t,4*y);return N}finally{m(E,4*y),q(u)}},selection_rects:(A,w,t,y,u)=>{const E=n();let N=0;try{N=k(y,4*u);const R=c.ck(A,w,t,N,u);x(N,y,4*u);return R}finally{m(N,4*u),q(E)}}},rive_shader_v1:(null===e||"rive_shader_v1"===e)&&{linear:c.ij,radial:c.jj,release:c.kj},rive_test_v1:(null===e||"rive_test_v1"===e)&&{blob:(A,w,t,y)=>{const u=n();let E=0,N=0;try{E=k(A,w);N=k(t,y);const R=c.Pj(E,w,N,y);x(N,t,y);return R}finally{m(N,
y),m(E,w),q(u)}}},rive_transition_v1:(null===e||"rive_transition_v1"===e)&&{child_draw:c.ek,child_width:c.gk,child_height:c.fk},rive_renderer_v1:(null===e||"rive_renderer_v1"===e)&&{save:c.Xi,restore:c.Wi,transform:c.Yi,draw_path:c.Ti,clip_path:c.Pi,modulate_opacity:c.Vi,modulate_color:c.Ui,draw_image:c.Qi,draw_image_mesh:c.Ri,draw_image_mesh_instanced:c.Si},rive_net_v1:(null===e||"rive_net_v1"===e)&&{fetch:(A,w,t)=>{const y=n();let u=0;try{return u=k(A,w),c.vi(u,w,t)}finally{m(u,w),q(y)}},fetch_cancel:c.wi},
rive_file_v1:(null===e||"rive_file_v1"===e)&&{decode:(A,w,t,y)=>{const u=n();let E=0,N=0;try{E=k(A,w);N=k(t,4*y);const R=c.zg(E,w,N,y);x(N,t,4*y);return R}finally{m(N,4*y),m(E,w),q(u)}},release:c.Ag,artboard_count:c.sg,artboard_name:(A,w,t,y)=>{const u=n();let E=0;try{E=k(t,y);const N=c.tg(A,w,E,y);x(E,t,y);return N}finally{m(E,y),q(u)}},bindable:(A,w,t,y)=>{const u=n();let E=0;try{return E=k(w,t),c.ug(A,E,t,y)}finally{m(E,t),q(u)}},bindable_release:c.yg,bindable_name:(A,w,t)=>{const y=n();let u=
0;try{u=k(w,t);const E=c.xg(A,u,t);x(u,w,t);return E}finally{m(u,t),q(y)}},bindable_data:c.vg,bindable_equal:c.wg},rive_lanes_v1:(null===e||"rive_lanes_v1"===e)&&{start:(A,w,t,y,u,E)=>{const N=n();let R=0,ra=0;try{return R=k(t,y),ra=k(u,4*E),c.Yh(A,w,R,y,ra,E)}finally{m(ra,4*E),m(R,y),q(N)}},state:c.Zh,failed:(A,w,t)=>{const y=n();let u=0;try{u=g(w,t);const E=c.Vh(A,u,t);x(u,w,E>>>0<=t?E>>>0:0);return E}finally{m(u,t),q(y)}},stop:c.$h,release:c.Wh,result:c.Xh,watch:c.ci,wait:c.ai,cancel_wait:c.Uh,
wait_within:c.bi},rive_jobs_v1:(null===e||"rive_jobs_v1"===e)&&{threads:c.Th,join:c.Rh,join_any:(A,w,t)=>{const y=n();let u=0;try{return u=k(A,4*w),c.Sh(u,w,t)}finally{m(u,4*w),q(y)}}},rive_shared_v1:(null===e||"rive_shared_v1"===e)&&{region_create:c.tj,region_size:c.xj,region_lock:c.uj,region_unlock:c.yj,region_read:(A,w,t,y)=>{const u=n();let E=0;try{E=g(t,y);const N=c.wj(A,w,E,y);x(E,t,0!==N?y:0);return N}finally{m(E,y),q(u)}},region_write:(A,w,t,y)=>{const u=n();let E=0;try{return E=k(t,y),c.zj(A,
w,E,y)}finally{m(E,y),q(u)}},region_poisoned:c.vj,atomic_load:c.nj,atomic_store:c.oj,atomic_add:c.lj,atomic_cas:c.mj,ring_create:c.Cj,ring_write:(A,w,t,y,u)=>{const E=n();let N=0,R=0;try{return N=k(w,t),R=k(y,4*u),c.Hj(A,N,t,R,u)}finally{m(R,4*u),m(N,t),q(E)}},ring_read:(A,w,t)=>{const y=n();let u=0;try{u=g(w,t);const E=c.Ej(A,u,t);A=E-1;x(u,w,A>>>0<=t?A>>>0:0);return E}finally{m(u,t),q(y)}},ring_drop:c.Dj,ring_used:c.Gj,ring_signal:c.Fj,snapshot_create:c.Lj,snapshot_publish:(A,w,t,y,u)=>{const E=
n();let N=0,R=0;try{return N=k(w,t),R=k(y,4*u),c.Mj(A,N,t,R,u)}finally{m(R,4*u),m(N,t),q(E)}},snapshot_read:(A,w,t)=>{const y=n();let u=0;try{u=g(w,t);const E=c.Nj(A,u,t);A=E-1;x(u,w,A>>>0<=t?A>>>0:0);return E}finally{m(u,t),q(y)}},snapshot_seq:c.Oj,read_done:c.sj,signal_create:c.Ij,signal_notify:c.Jj,signal_seq:c.Kj,blob_create:(A,w)=>{const t=n();let y=0;try{return y=k(A,w),c.pj(y,w)}finally{m(y,w),q(t)}},blob_size:c.rj,blob_read:(A,w,t,y)=>{const u=n();let E=0;try{E=g(t,y);const N=c.qj(A,w,E,y);
x(E,t,N>>>0<=y?N>>>0:0);return N}finally{m(E,y),q(u)}},retain:c.Bj,release:c.Aj}}}function f(p,a,e=null){const c=a.La??{i:!1},n=()=>{const h=Error(a.j);a.j=null;throw h;},q=()=>{throw Error("librive faulted in a nested script call");},v=()=>{throw Error("script VM was released");};return{ej:(null===e||"rive_rt_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(0)),fj:(null===e||"rive_rt_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;
try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(1)),Zi:(null===e||"rive_rt_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(2)),cj:(null===e||"rive_rt_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(3)),$i:(null===e||"rive_rt_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(4)),
bj:(null===e||"rive_rt_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(5)),aj:(null===e||"rive_rt_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{h(a.g)}catch(g){var b=g;a.h=!0;throw b;}a.h&&q();null!==a.j&&n()})(p(6)),gj:(null===e||"rive_rt_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(7)),dj:(null===e||"rive_rt_v1"===e)&&(h=>b=>{0===
a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(8)),hj:(null===e||"rive_rt_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(9)),Yf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(10)),Sf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;
let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(11)),yf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(12)),zf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(13)),mf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;
try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(14)),nf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(15)),qf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(16)),pf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=
g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(17)),Af:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(18)),Of:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(19)),mg:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();
null!==a.j&&n()})(p(20)),kg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(21)),cg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(22)),ng:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();
null!==a.j&&n();return m})(p(23)),pg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(24)),dg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(25)),qg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&
q();null!==a.j&&n();return m})(p(26)),lg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(27)),ig:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(28)),og:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;
}a.h&&q();null!==a.j&&n();return g})(p(29)),fg:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(30)),Zf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(31)),jg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&
q();null!==a.j&&n();return m})(p(32)),eg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(33)),hg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(34)),gg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,
b;}a.h&&q();null!==a.j&&n();return m})(p(35)),bg:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(36)),ag:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(37)),Bf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;
}a.h&&q();null!==a.j&&n();return g})(p(38)),Cf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(39)),vf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(40)),xf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(41)),
wf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(42)),ff:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(43)),df:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(44)),ef:(null===e||"rive_data_v1"===
e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(45)),gf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(46)),cf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(47)),af:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;
let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(48)),bf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(49)),sf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(50)),tf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=
m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(51)),uf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(52)),Rf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(53)),Wf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(54)),
Gf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(55)),If:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(56)),Hf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(57)),Mf:(null===e||"rive_data_v1"===e)&&
(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(58)),Df:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(59)),Nf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(60)),Ff:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,
b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(61)),Jf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(62)),Lf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(63)),Kf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&
n()})(p(64)),Ef:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(65)),$f:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(66)),kf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(67)),lf:(null===e||
"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(68)),Pf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(69)),Qf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(70)),hf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&
c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(71)),jf:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(72)),Uf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(73)),Tf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,
b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(74)),Vf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(75)),rg:(null===e||"rive_data_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(76)),Xf:(null===e||"rive_data_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==
a.j&&n()})(p(77)),rf:(null===e||"rive_data_v1"===e)&&(h=>(b,g,k,m,x,L)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(78)),je:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(79)),Dd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(80)),Ld:(null===
e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(81)),Vd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(82)),Kd:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(83)),oe:(null===e||"rive_artboard_v1"===
e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(84)),Ud:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(85)),ne:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(86)),me:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===
a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(87)),Sd:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(88)),le:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(89)),Jd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,
b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(90)),he:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(91)),ke:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k,m,x,L,T,A,w)=>{0===a.g&&v();c.i&&c.l++;let t;try{t=h(a.g,b,g,k,m,x,L,T,A,w)}catch(y){throw b=y,a.h=!0,b;}a.h&&q();null!==a.j&&n();return t})(p(92)),Td:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>
{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(93)),Ed:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(94)),Hd:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(95)),Gd:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();
c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(96)),Fd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(97)),Id:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(98)),Cd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k,m,x,L,T,A)=>{0===a.g&&
v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L,T,A)}catch(w){throw b=w,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(99)),Wd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(100)),ce:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(101)),fe:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;
try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(102)),de:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(103)),ge:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(104)),ee:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=
m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(105)),Yd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(106)),be:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(107)),ae:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,
a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(108)),Zd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(109)),Xd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(110)),$d:(null===e||"rive_artboard_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=
k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(111)),ie:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(112)),Nd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(113)),Md:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=
!0,b;}a.h&&q();null!==a.j&&n()})(p(114)),Od:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(115)),Rd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(116)),Qd:(null===e||"rive_artboard_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=
!0,b;}a.h&&q();null!==a.j&&n();return x})(p(117)),Pd:(null===e||"rive_artboard_v1"===e)&&(h=>void 0===h?l("rive_artboard_v1","drawable_properties"):(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(118)),He:(null===e||"rive_audio_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(119)),Ke:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&
v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(120)),Je:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(121)),Le:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(122)),Ie:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,
b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(123)),pe:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(124)),re:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(125)),te:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=
m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(126)),qe:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(127)),se:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(128)),Me:(null===e||"rive_audio_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=
!0,b;}a.h&&q();null!==a.j&&n();return b})(p(129)),Ne:(null===e||"rive_audio_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(130)),ue:(null===e||"rive_audio_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(131)),ye:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(132)),
xe:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(133)),we:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(134)),ze:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(135)),De:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&
c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(136)),Ae:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(137)),Be:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(138)),ve:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=
h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(139)),Ee:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(140)),Fe:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(141)),Ge:(null===e||"rive_audio_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=
k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(142)),Ce:(null===e||"rive_audio_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(143)),Ki:(null===e||"rive_path_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(144)),Ni:(null===e||"rive_path_v1"===e)&&(h=>(b,g,k,m,x,L)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L)}catch(T){throw b=T,a.h=!0,b;}a.h&&
q();null!==a.j&&n()})(p(145)),Mi:(null===e||"rive_path_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(146)),Ii:(null===e||"rive_path_v1"===e)&&(h=>(b,g,k,m,x,L,T,A)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L,T,A)}catch(w){throw b=w,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(147)),Oi:(null===e||"rive_path_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(148)),
Li:(null===e||"rive_path_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(149)),Ji:(null===e||"rive_path_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(150)),mi:(null===e||"rive_measure_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(151)),
gi:(null===e||"rive_measure_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(152)),fi:(null===e||"rive_measure_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(153)),li:(null===e||"rive_measure_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(154)),
ki:(null===e||"rive_measure_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(155)),ni:(null===e||"rive_measure_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(156)),pi:(null===e||"rive_measure_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(157)),hi:(null===
e||"rive_measure_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(158)),ii:(null===e||"rive_measure_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(159)),oi:(null===e||"rive_measure_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(160)),Ci:(null===
e||"rive_paint_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(161)),Di:(null===e||"rive_paint_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(162)),Gi:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(163)),zi:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&
v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(164)),Hi:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(165)),Bi:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(166)),yi:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,
a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(167)),xi:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(168)),Ai:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(169)),Ei:(null===e||"rive_paint_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(170)),Fi:(null===
e||"rive_paint_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(171)),We:(null===e||"rive_canvas_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(172)),Xe:(null===e||"rive_canvas_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(173)),Ze:(null===e||"rive_canvas_v1"===e)&&(h=>b=>
{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(174)),Ue:(null===e||"rive_canvas_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(175)),Ye:(null===e||"rive_canvas_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(176)),Ve:(null===e||"rive_canvas_v1"===e)&&(h=>b=>{0===
a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(177)),Se:(null===e||"rive_canvas_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(178)),Te:(null===e||"rive_canvas_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(179)),gh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;
try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(180)),dh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(181)),eh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(182)),ah:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=
x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(183)),bh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(184)),fh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(185)),Fh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=
x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(186)),ih:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(187)),qh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(188)),th:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&
q();null!==a.j&&n()})(p(189)),ph:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(190)),nh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(191)),uh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x,L,T)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L,T)}catch(A){throw b=A,a.h=!0,b;}a.h&&q();null!==a.j&&
n()})(p(192)),rh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(193)),sh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(194)),oh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(195)),jh:(null===e||"rive_gpu_v1"===
e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(196)),kh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x,L)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(197)),lh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(198)),mh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;
try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(199)),hh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(200)),Wg:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(201)),Zg:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,
b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(202)),$g:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(203)),Xg:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(204)),Yg:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=
g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(205)),Gh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(206)),Ih:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(207)),Hh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&
n()})(p(208)),xh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(209)),yh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(210)),Jh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(211)),Kh:(null===
e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(212)),Eh:(null===e||"rive_gpu_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(213)),zh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(214)),Ah:(null===e||"rive_gpu_v1"===e)&&
(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(215)),Bh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(216)),Ch:(null===e||"rive_gpu_v1"===e)&&(h=>void 0===h?l("rive_gpu_v1","shader_module_from_rstb"):(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();
null!==a.j&&n();return x})(p(217)),Dh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(218)),Sg:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(219)),Tg:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(220)),Qg:(null===
e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(221)),Rg:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(222)),Pg:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x,L,T)=>{0===a.g&&v();c.i&&c.l++;let A;try{A=h(a.g,b,g,k,m,x,L,T)}catch(w){throw b=w,a.h=!0,b;}a.h&&q();null!==a.j&&
n();return A})(p(223)),Ug:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m,x,L,T)=>{0===a.g&&v();c.i&&c.l++;let A;try{A=h(a.g,b,g,k,m,x,L,T)}catch(w){throw b=w,a.h=!0,b;}a.h&&q();null!==a.j&&n();return A})(p(224)),Vg:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(225)),vh:(null===e||"rive_gpu_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&
n();return x})(p(226)),wh:(null===e||"rive_gpu_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(227)),ei:(null===e||"rive_mat4_v1"===e)&&(h=>(b,g,k,m,x,L)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(228)),di:(null===e||"rive_mat4_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(229)),
Pe:(null===e||"rive_buffer_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(230)),Re:(null===e||"rive_buffer_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(231)),Qe:(null===e||"rive_buffer_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(232)),ri:(null===e||"rive_mesh_instances_v1"===
e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(233)),ti:(null===e||"rive_mesh_instances_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(234)),ui:(null===e||"rive_mesh_instances_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(235)),si:(null===e||"rive_mesh_instances_v1"===e)&&
(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(236)),Oe:(null===e||"rive_blob_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(237)),Nh:(null===e||"rive_image_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(238)),Qh:(null===e||"rive_image_v1"===e)&&(h=>b=>
{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(239)),Oh:(null===e||"rive_image_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(240)),Ph:(null===e||"rive_image_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(241)),Lh:(null===e||"rive_image_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;
try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(242)),Mh:(null===e||"rive_image_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(243)),Gg:(null===e||"rive_font_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(244)),Eg:(null===e||"rive_font_v1"===e)&&(h=>void 0===h?l("rive_font_v1","decode"):(b,g)=>{0===a.g&&
v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(245)),Mg:(null===e||"rive_font_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(246)),Lg:(null===e||"rive_font_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(247)),Ng:(null===e||"rive_font_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=
k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(248)),Kg:(null===e||"rive_font_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(249)),Cg:(null===e||"rive_font_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(250)),Bg:(null===e||"rive_font_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m)}catch(x){throw b=x,a.h=!0,b;}a.h&&
q();null!==a.j&&n()})(p(251)),Dg:(null===e||"rive_font_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(252)),Fg:(null===e||"rive_font_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(253)),Jg:(null===e||"rive_font_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==
a.j&&n();return k})(p(254)),Og:(null===e||"rive_font_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(255)),Ig:(null===e||"rive_font_v1"===e)&&(h=>void 0===h?l("rive_font_v1","glyph_verbs"):(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(256)),Hg:(null===e||"rive_font_v1"===e)&&(h=>void 0===h?l("rive_font_v1","glyph_points"):
(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(257)),$j:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","new"):()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(258)),ak:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","release"):b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(259)),
Qj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","append"):(b,g,k,m,x,L,T,A,w)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L,T,A,w)}catch(t){throw b=t,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(260)),Tj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","clear"):b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(261)),Xj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","layout"):(b,g,k)=>{0===a.g&&v();c.i&&
c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(262)),Uj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","draw"):(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(263)),Rj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","bounds"):(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(264)),Yj:(null===e||"rive_text_v1"===e)&&
(h=>void 0===h?l("rive_text_v1","length"):b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(265)),Zj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","lines"):(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(266)),bk:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","runs"):(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,
g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(267)),Vj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","glyphs"):(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(268)),Wj:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","hit_test"):(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(269)),Sj:(null===
e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","caret"):(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(270)),ck:(null===e||"rive_text_v1"===e)&&(h=>void 0===h?l("rive_text_v1","selection_rects"):(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(271)),ij:(null===e||"rive_shader_v1"===e)&&(h=>(b,g,k,m,x,L,T)=>{0===a.g&&v();c.i&&
c.l++;let A;try{A=h(a.g,b,g,k,m,x,L,T)}catch(w){throw b=w,a.h=!0,b;}a.h&&q();null!==a.j&&n();return A})(p(272)),jj:(null===e||"rive_shader_v1"===e)&&(h=>(b,g,k,m,x,L)=>{0===a.g&&v();c.i&&c.l++;let T;try{T=h(a.g,b,g,k,m,x,L)}catch(A){throw b=A,a.h=!0,b;}a.h&&q();null!==a.j&&n();return T})(p(273)),kj:(null===e||"rive_shader_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(274)),Pj:(null===e||"rive_test_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&
v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(275)),ek:(null===e||"rive_transition_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(276)),gk:(null===e||"rive_transition_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(277)),fk:(null===e||"rive_transition_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&
c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(278)),Xi:(null===e||"rive_renderer_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(279)),Wi:(null===e||"rive_renderer_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(280)),Yi:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g,k,m,x,L,T)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,
L,T)}catch(A){throw b=A,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(281)),Ti:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(282)),Pi:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(283)),Vi:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g)}catch(k){throw b=k,a.h=!0,b;}a.h&&
q();null!==a.j&&n()})(p(284)),Ui:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(285)),Qi:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(286)),Ri:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g,k,m,x,L,T,A)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L,T,A)}catch(w){throw b=w,a.h=!0,b;}a.h&&
q();null!==a.j&&n()})(p(287)),Si:(null===e||"rive_renderer_v1"===e)&&(h=>(b,g,k,m,x,L,T)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L,T)}catch(A){throw b=A,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(288)),vi:(null===e||"rive_net_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(289)),wi:(null===e||"rive_net_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&
n()})(p(290)),zg:(null===e||"rive_file_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(291)),Ag:(null===e||"rive_file_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(292)),sg:(null===e||"rive_file_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(293)),tg:(null===
e||"rive_file_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(294)),ug:(null===e||"rive_file_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(295)),yg:(null===e||"rive_file_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(296)),xg:(null===e||"rive_file_v1"===
e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(297)),vg:(null===e||"rive_file_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(298)),wg:(null===e||"rive_file_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(299)),Yh:(null===e||"rive_lanes_v1"===e)&&
(h=>(b,g,k,m,x,L)=>{0===a.g&&v();c.i&&c.l++;let T;try{T=h(a.g,b,g,k,m,x,L)}catch(A){throw b=A,a.h=!0,b;}a.h&&q();null!==a.j&&n();return T})(p(300)),Zh:(null===e||"rive_lanes_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(301)),Vh:(null===e||"rive_lanes_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(302)),$h:(null===e||"rive_lanes_v1"===
e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(303)),Wh:(null===e||"rive_lanes_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(304)),Xh:(null===e||"rive_lanes_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(305)),ci:(null===e||"rive_lanes_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;
try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(306)),ai:(null===e||"rive_lanes_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(307)),Uh:(null===e||"rive_lanes_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(308)),bi:(null===e||"rive_lanes_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,
k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(309)),Th:(null===e||"rive_jobs_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(310)),Rh:(null===e||"rive_jobs_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(311)),Sh:(null===e||"rive_jobs_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=
x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(312)),tj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(313)),xj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(314)),uj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=
!0,b;}a.h&&q();null!==a.j&&n();return k})(p(315)),yj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(316)),wj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(317)),zj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,
b;}a.h&&q();null!==a.j&&n();return x})(p(318)),vj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(319)),nj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(320)),oj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=
!0,b;}a.h&&q();null!==a.j&&n();return m})(p(321)),lj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(322)),mj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(323)),Cj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=
k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(324)),Hj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(325)),Ej:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(326)),Dj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,
b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(327)),Gj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(328)),Fj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(329)),Lj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=
k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(330)),Mj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k,m,x)=>{0===a.g&&v();c.i&&c.l++;let L;try{L=h(a.g,b,g,k,m,x)}catch(T){throw b=T,a.h=!0,b;}a.h&&q();null!==a.j&&n();return L})(p(331)),Nj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;let m;try{m=h(a.g,b,g,k)}catch(x){throw b=x,a.h=!0,b;}a.h&&q();null!==a.j&&n();return m})(p(332)),Oj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=
k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(333)),sj:(null===e||"rive_shared_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{h(a.g)}catch(g){var b=g;a.h=!0;throw b;}a.h&&q();null!==a.j&&n()})(p(334)),Ij:(null===e||"rive_shared_v1"===e)&&(h=>()=>{0===a.g&&v();c.i&&c.l++;try{var b=h(a.g)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n();return b})(p(335)),Jj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(336)),
Kj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(337)),pj:(null===e||"rive_shared_v1"===e)&&(h=>(b,g)=>{0===a.g&&v();c.i&&c.l++;let k;try{k=h(a.g,b,g)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n();return k})(p(338)),rj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(339)),qj:(null===
e||"rive_shared_v1"===e)&&(h=>(b,g,k,m)=>{0===a.g&&v();c.i&&c.l++;let x;try{x=h(a.g,b,g,k,m)}catch(L){throw b=L,a.h=!0,b;}a.h&&q();null!==a.j&&n();return x})(p(340)),Bj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;let g;try{g=h(a.g,b)}catch(k){throw b=k,a.h=!0,b;}a.h&&q();null!==a.j&&n();return g})(p(341)),Aj:(null===e||"rive_shared_v1"===e)&&(h=>b=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b)}catch(g){throw b=g,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(342)),$e:(null===e||"env"===e)&&
(h=>(b,g,k)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k)}catch(m){throw b=m,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(343)),dk:(null===e||"env"===e)&&(h=>(b,g,k,m,x,L,T,A)=>{0===a.g&&v();c.i&&c.l++;try{h(a.g,b,g,k,m,x,L,T,A)}catch(w){throw b=w,a.h=!0,b;}a.h&&q();null!==a.j&&n()})(p(344))}}function l(p,a){return()=>{throw Error("failed to call unlinked import function "+p+"."+a);}}function r(p,a,e){if(a+e>p.byteLength)throw Error("out of bounds memory access");}function z(p,a){a>>>=0;if(4>a)return 0;r(p,
a,0);const e=(new DataView(p)).getUint32(a-4,!0);r(p,a,e);return e}function C(p,a,e){a>>>=0;e>>>=0;r(p,a,e);if("undefined"!==typeof TextDecoder)return(new TextDecoder("utf-16le",{ignoreBOM:!0})).decode(new Uint8Array(p,a,e));p=0===a%2?new Uint16Array(p,a,e>>1):new Uint16Array(p.slice(a,a+e-e%2));a="";for(e=0;e<p.length;e+=4096)a+=String.fromCharCode.apply(null,p.subarray(e,e+4096));return a}function D(p,a){let e=Qb.get(a);if(void 0===e){for(let c=0;32>c&&void 0===e;c++){const n=a+16+4*c>>>2;0===Atomics.compareExchange(p,
n,0,1)&&(e={pa:n,Db:2+c})}e??={pa:-1,Db:34+Atomics.add(p,a+144>>>2,1)};Qb.set(a,e)}return e}function F(p,a,e,c,n=null,q=()=>{}){a>>>=0;const v=e%4294967296,h=Math.floor(e/4294967296);let b=null,g=null,k=null,m=null,x=null,L=null;const T=()=>{const I=p();I!==b&&(b=I,g=new Uint8Array(b),k=new Int32Array(b),m=new Uint32Array(b))};T();const A=D(k,a);null!==n&&Atomics.store(n,2,A.Db);const w=(I,Z)=>{const aa=c().buffer;aa!==x&&(x=aa,L=new Uint8Array(aa));return I+Z<=L.length?L:null},t=(I,Z,aa,ca,ha)=>
{for(let ia=0;ia<ha;ia++)I[Z+ia]=aa[ca+ia]},y=I=>{for(null!==n&&Atomics.store(n,3,I);0!==Atomics.compareExchange(k,I>>>2,0,A.Db););},u=I=>{Atomics.store(k,I>>>2,0);null!==n&&Atomics.store(n,3,0)};let E=0;const N=(I,Z)=>{T();I>>>=0;if(0===(I&2147483648))return 0;var aa=(I&2147483647)>>>12,ca=Atomics.load(m,a+148+4*(aa>>>10)>>>2);if(0===ca)return 0;aa=ca+24*(aa&1023);ca=aa>>>2;if(0<=A.pa){if(Atomics.store(m,A.pa,aa),ca=Atomics.load(m,ca),0===(ca&4096)||0!==((ca^I)&4095))return Atomics.store(m,A.pa,
1),0}else for(;;){const ha=Atomics.load(m,ca);if(0===(ha&4096)||0!==((ha^I)&4095))return 0;if(Atomics.compareExchange(m,ca,ha,ha+8192)===ha)break}E=aa;I=Atomics.load(m,aa+4>>>2);return m[I>>>2]!==Z||m[aa+16>>>2]!==v||m[aa+20>>>2]!==h?(R(),0):I},R=()=>{0<=A.pa?Atomics.store(m,A.pa,1):Atomics.sub(m,E+0>>>2,8192)},ra=I=>{I=N(I,3);if(0!==I){4294967295===Atomics.add(m,I+24>>>2,1)&&Atomics.add(m,I+28>>>2,1);y(I+4);try{const Z=m[I+16>>>2],aa=m[I+32>>>2]>>>2;for(let ca=0;ca<Z;ca++){const ha=m[aa+ca]+0>>>
2;Atomics.add(k,ha,1);Atomics.notify(k,ha)}}finally{u(I+4),R()}}},Ba=(I,Z,aa,ca,ha)=>{const ia=Math.min(ha,m[I+8>>>2]-Z);t(g,I+32+Z,aa,ca,ia);t(g,I+32,aa,ca+ia,ha-ia)},Ma=(I,Z,aa,ca,ha)=>{var ia=m[I+8>>>2];Z%=ia;ia=Math.min(ha,ia-Z);t(aa,ca,g,I+32+Z,ia);t(aa,ca+ia,g,I+32,ha-ia)},ob=new Uint8Array(4),vb=new Uint32Array(ob.buffer),Va=()=>{q("a processor cannot pass shared objects through rings or snapshots, as the audio thread may not hold or give them back; pass them in Audio.start's argument");return 0},
ja=(I,Z,aa,ca)=>{I=N(I,1);if(0===I)return 0;let ha=0,ia=0;y(I+4);try{const Fa=m[I+20>>>2];if(0===Fa)return 0;const Ca=m[I+16>>>2];Ma(I,Ca,ob,0,4);ia=vb[0];if(0!==(ia&2147483648))return Va();if(null===Z){if(ia<=ca)return 0}else{if(0===aa||ia>ca)return ia+1;Ma(I,Ca+4,Z,aa,ia)}m[I+16>>>2]=(Ca+4+ia)%m[I+8>>>2];m[I+20>>>2]=Fa-4-ia;ha=m[I+28>>>2]}finally{u(I+4),R()}ra(ha);return ia+1},za=(I,Z,aa)=>{I=N(I,0);if(0===I)return-1;try{Z>>>=0;var ca=0!==(Z&3)||Z+4>m[I+8>>>2]?-1:I+32+Z>>>2;return 0>ca?-1:aa(ca)>>>
0}finally{R()}};return{region_create:()=>0,region_size:I=>{I=N(I,0);if(0===I)return 0;I=m[I+8>>>2];R();return I},region_lock:()=>0,region_unlock:()=>{},region_read:()=>0,region_write:()=>0,region_poisoned:I=>{I=N(I,0);if(0===I)return 0;I=0!==m[I+16>>>2]?1:0;R();return I},atomic_load:(I,Z)=>za(I,Z,aa=>Atomics.load(k,aa)),atomic_store:(I,Z,aa)=>za(I,Z,ca=>{Atomics.store(k,ca,aa|0);return 0}),atomic_add:(I,Z,aa)=>za(I,Z,ca=>Atomics.add(k,ca,aa|0)),atomic_cas:(I,Z,aa,ca)=>za(I,Z,ha=>Atomics.compareExchange(k,
ha,aa|0,ca|0)),ring_create:()=>0,ring_write:(I,Z,aa,ca,ha)=>{Z>>>=0;aa>>>=0;ca=w(Z,aa);I=null!==ca?N(I,1):0;if(0===I)return 0;if(0!==ha)return R(),Va();ha=0;y(I+4);try{const ia=m[I+8>>>2];if(4+aa>ia)return 2;const Fa=m[I+20>>>2];if(Fa+4+aa>ia)return 0;const Ca=m[I+16>>>2];vb[0]=aa;Ba(I,(Ca+Fa)%ia,ob,0,4);Ba(I,(Ca+Fa+4)%ia,ca,Z,aa);m[I+20>>>2]=Fa+4+aa;ha=m[I+24>>>2]}finally{u(I+4),R()}ra(ha);return 1},ring_read:(I,Z,aa)=>{Z>>>=0;aa>>>=0;const ca=w(Z,aa);return null!==ca?ja(I,ca,Z,aa):0},ring_drop:(I,
Z)=>ja(I,null,0,Z>>>0),ring_used:I=>{I=N(I,1);if(0===I)return 0;y(I+4);const Z=m[I+20>>>2];u(I+4);R();return Z},ring_signal:(I,Z)=>{I=N(I,1);if(0===I)return 0;Z=m[I+(0!==Z?28:24)>>>2];R();return Z},snapshot_create:()=>0,snapshot_publish:(I,Z,aa,ca,ha)=>{Z>>>=0;aa>>>=0;ca=w(Z,aa);I=null!==ca?N(I,2):0;if(0===I)return 0;try{const Fa=m[I+8>>>2];if(0!==ha)return Va();if(aa>Fa)return 0;y(I+4);try{ha=I+16>>>2;var ia=Atomics.load(m,ha);const Ca=I+40>>>2;if(0!==((0!==ia?Atomics.load(m,Ca+ia-1):0)&2147483648))return Va();
ia%=2;const Wa=(I+32>>>2)+ia,Xa=Atomics.load(m,Wa)|1;Atomics.store(m,Wa,Xa);Atomics.load(m,Wa);t(g,I+48+ia*Fa,ca,Z,aa);Atomics.store(m,Ca+ia,aa);Atomics.store(m,Wa,Xa+1);Atomics.store(m,ha,ia+1);4294967295===Atomics.add(m,I+24>>>2,1)&&Atomics.add(m,I+28>>>2,1)}finally{u(I+4)}return 1}finally{R()}},snapshot_read:(I,Z,aa)=>{Z>>>=0;aa>>>=0;const ca=w(Z,aa);I=null!==ca?N(I,2):0;if(0===I)return 0;try{for(;;){const ia=Atomics.load(m,I+16>>>2);if(0===ia)return 0;var ha=ia-1;const Fa=(I+32>>>2)+ha,Ca=Atomics.load(m,
Fa);if(0!==(Ca&1))continue;const Wa=Atomics.load(m,(I+40>>>2)+ha),Xa=m[I+8>>>2];ha=I+48+ha*Xa;const Rb=0!==(Wa&2147483648),jb=Math.min(Wa,Xa);!Rb&&0!==Z&&jb<=aa&&t(ca,Z,g,ha,jb);if(Atomics.compareExchange(m,Fa,Ca,Ca)===Ca)return Rb?Va():jb+1}}finally{R()}},snapshot_seq:I=>{I=N(I,2);if(0===I)return 0;I=4294967296*Atomics.load(m,I+28>>>2)+Atomics.load(m,I+24>>>2);R();return I},signal_create:()=>0,signal_notify:I=>ra(I),signal_seq:I=>{I=N(I,3);if(0===I)return 0;I=4294967296*Atomics.load(m,I+28>>>2)+
Atomics.load(m,I+24>>>2);R();return I},blob_create:()=>0,blob_size:I=>{I=N(I,4);if(0===I)return 0;I=m[I+8>>>2];R();return I},blob_read:(I,Z,aa,ca)=>{Z>>>=0;aa>>>=0;ca>>>=0;const ha=w(aa,ca);I=null!==ha?N(I,4):0;if(0===I)return 0;const ia=m[I+8>>>2];ca=Z<ia?Math.min(ca,ia-Z):0;t(ha,aa,g,I+16+Z,ca);R();return ca},retain:()=>0,release:()=>{}}}function K(p,a,e){const c=Atomics.load(e,2);2>c||(p=new Int32Array(p()),e=Atomics.load(e,3),0!==e&&Atomics.compareExchange(p,e>>>2,c,0),34>c&&Atomics.store(p,((a>>>
0)+16>>>2)+c-2,0))}function P(p){return String(p?.message??p)}function X(p,a,e=new Map){const c=v=>{const h=p().buffer;return C(h,v,z(h,v))},n={};for(var q of wb)n[q]=v=>a(c(v));q=v=>h=>{h=c(h);const b=e.get(h);void 0===b?a(`Timer '${h}' does not exist`):(v&&e.delete(h),a(`${h}: ${(Za()-b).toFixed(3)}ms`))};n["console.time"]=v=>e.set(c(v),Za());n["console.timeLog"]=q(!1);n["console.timeEnd"]=q(!0);return n}function W(p){let a=null,e=null;const c=q=>e??P(q),n={env:X(()=>a,p.log,p.Za),rive_shared_v1:p.Ab(()=>
a),rive_lane_v1:{error:(q,v)=>{e=C(a.buffer,q,v);p.td?.(e)},fuel_check:p.ob??xb}};void 0!==p.ub&&(n[p.ub]=p.cc(()=>a));try{const q=(new WebAssembly.Instance(p.module,n)).exports;a=q.memory;return{exports:q,memory:a,nb:c}}catch(q){return{error:e??P(q)}}}function Y(p,a,e=!1){try{const c=p.exports;c[e?"__riveLaneReset":"__riveLiftedStart"]?.();const n=a.input,q=c.__rive_lane_alloc(n.length)>>>0;(new Uint8Array(p.memory.buffer,q,n.length)).set(n);const v=c[a.prefix+a.mb](q,n.length,...(a.Ec??[]));a.ma&&
c.__rive_lane_free(q);return{result:v}}catch(c){return{error:p.nb(c)}}}function ba(p){const a=W(p);p=void 0===a.error?Y(a,p):a;return void 0===p.error?{...a,result:p.result}:p}function fa(p,a,e,c,n,q){let v=null;const h=T=>{v??=T};var b=Za()+1E3,g="processor init overran its budget";const k=ba({module:p,Ab:T=>n(T,h),log:q,ob:()=>{if(Za()>b)throw g;},prefix:Ra.processor,mb:a,input:e,Ec:[c.sampleRate,c.rd,c.channels],ma:!0});if(void 0!==k.error||null!==v)return{error:k.error??v};b=Infinity;g="processor overran its block budget";
const m=k.exports,x=k.memory;let L=null;return{wa:{zb(T,A,w,t=0){0<t&&(b=Za()+t);try{const y=m.__rive_processor_process(T,A)>>>0;if(null!==v)return v;const u=T*c.channels;if(null===L||L.buffer!==x.buffer||L.byteOffset!==y||L.length!==u)L=new Float32Array(x.buffer,y,u);w(L);m.__riveFrameMinor?.();return null}catch(y){return k.nb(y)}finally{b=Infinity}}}}}function pa(p){p=[0,...p,11];return new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,p.length+2,1,p.length,...p])}function va(p){let a=
0,e=8;const c=()=>{const [g,k]=wa(p,e);e=k;return g},n=()=>{const g=p[e++];123===g&&(a=Math.max(a,1));return 99!==g&&100!==g},q=()=>{var g=p[e++];if(253===g)g=c(),a=Math.max(a,256<=g&&275>=g?2:1),11>=g||92===g||93===g?(c()&64&&c(),c()):12===g||13===g?e+=16:21<=g&&34>=g?e+=1:84<=g&&91>=g&&(c()&64&&c(),c(),e+=1);else if(252===g){g=c();if(g>=M.length)return!1;for(let k=0;k<M[g];k++)c()}else if(254===g)3===c()?e+=1:(c()&64&&c(),c());else if(40<=g&&62>=g)c()&64&&c(),c();else if(2<=g&&4>=g)123===p[e]&&
(a=Math.max(a,1)),c();else if(14===g)for(g=c();0<=g&&e<p.length;g--)c();else if(28===g)for(g=c();0<g&&e<p.length;g--){if(!n())return!1}else if(17===g||19===g)c(),c();else if(67===g||68===g)e+=67===g?4:8;else if(32<=g&&38>=g||U.includes(g))c();else if(!(1>=g||5===g||11===g||15===g||26===g||27===g||209===g||69<=g&&196>=g))return!1;return!0};for(;e<p.length;){var v=p[e];const [g,k]=wa(p,e+1);e=k;if(1===v)for(v=c();0<v&&e<p.length;v--){if(96!==p[e++])return-1;for(var h=0;2>h;h++)for(var b=c();0<b&&e<
p.length;b--)if(!n())return-1}else if(10===v)for(v=c();0<v&&e<p.length;v--){h=Math.min(c()+e,p.length);for(b=c();0<b&&e<h;b--)if(c(),!n())return-1;for(;e<h;)if(!q())return-1}e=k+g}return a}function wa(p,a){let e=0,c=0,n;do n=p[a++],e|=(n&127)<<c,c+=7;while(n&128);return[e>>>0,a]}function ma(p){const a=[];do{const e=p&127;p>>>=7;a.push(p?e|128:e)}while(p);return a}function ya(p){const a=[];for(let e=8;e<p.length;){const [c,n]=wa(p,e+1);a.push({id:p[e],at:e,body:n,end:n+c});e=n+c}return a}function Oa(p){const a=
[];for(const e of ya(p)){if(0!==e.id)continue;const [c,n]=wa(p,e.body);V.some(q=>q.length===c&&q.every((v,h)=>p[n+h]===v))&&a.push(p.subarray(n+c,e.end))}return a}function Ka(p){var a=ya(p);const e=a.find(v=>8===v.id);var c=a.filter(v=>v!==e);if(void 0===e||!c.some(v=>7===v.id))return p;const n=wa(p,e.body)[0];a=[p.subarray(0,8)];for(var q of c){c=p.subarray(q.body,q.end);if(7===q.id){const [v,h]=wa(p,q.body);c=Array.from("__riveLiftedStart",b=>b.charCodeAt(0));c=Uint8Array.from([...ma(v+1),...p.subarray(h,
q.end),...ma(c.length),...c,0,...ma(n)])}a.push(Uint8Array.from([q.id,...ma(c.length)]),c)}p=new Uint8Array(a.reduce((v,h)=>v+h.length,0));q=0;for(const v of a)p.set(v,q),q+=v.length;return p}function kb(p,a,e,c){switch(c){case 0:return p();case 1:return p(a[e]);case 2:return p(a[e],a[e+1]);case 3:return p(a[e],a[e+1],a[e+2]);case 4:return p(a[e],a[e+1],a[e+2],a[e+3]);case 5:return p(a[e],a[e+1],a[e+2],a[e+3],a[e+4]);case 6:return p(a[e],a[e+1],a[e+2],a[e+3],a[e+4],a[e+5]);case 7:return p(a[e],a[e+
1],a[e+2],a[e+3],a[e+4],a[e+5],a[e+6]);case 8:return p(a[e],a[e+1],a[e+2],a[e+3],a[e+4],a[e+5],a[e+6],a[e+7]);default:return p(...a.subarray(e,e+c))}}const wb=["console.log","console.debug","console.info","console.warn","console.error"],yb=[["rive_lanes_v1","wait_within",[],"blocks on a signal, which only the main lane may; a worker awaits Signal.next or Port.receive instead"],["rive_shared_v1","region_lock",["job","worker"],"locks a shared region, which the audio thread may not wait on; share through atomics, rings and snapshots instead"],
["rive_shared_v1","read_done",[],null],["rive_shared_v1",null,["job","worker","processor"],null],["rive_lane_v1",null,["job","worker","processor"],null],["rive_job_v1",null,["job"],null],["rive_worker_v1",null,["worker"],null],["env","console.log",["job","worker","processor"],null],["env","console.debug",["job","worker","processor"],null],["env","console.info",["job","worker","processor"],null],["env","console.warn",["job","worker","processor"],null],["env","console.error",["job","worker","processor"],
null],["env","console.time",["job","worker"],null],["env","console.timeLog",["job","worker"],null],["env","console.timeEnd",["job","worker"],null]],pb=[["rive.jobs","job"],["rive.workers","worker"],["rive.audio","processor"]],Ra={job:"__rive_job_",worker:"__rive_worker_",processor:"__rive_processor_"},eb={starting:0,running:1,done:2,failed:3,stopped:4},Qb=new Map,Za=void 0!==globalThis.performance?()=>globalThis.performance.now():Date.now,xb=()=>{},zb=[253,12,...Array(16).fill(0)],kc=pa([...zb]),
H=pa([...zb,...zb,253,128,2]),M=[0,0,0,0,0,0,0,0,2,1,2,1,2,1,2,1,1,1],U=[12,13,16,18,63,64,65,66,208,210],V=pb.map(([p])=>Array.from(p,a=>a.charCodeAt(0)));(function(p){function a(B,J=null){return{Kc:f(ja.jd,B,J),ca:ja.ca,za:ja.za,Xa:ja.Xa,ya:ja.ya,tb:ja.tb,ma:ja.ma,La:I}}function e(B){ca??={lc:Z(kc),jc:Z(H)};B=[B,...Oa(B)];if(ca.lc&&ca.jc||B.every(J=>Z(J)))return null;B=Math.max(...B.map(va));return!ca.lc&&0<B?"this browser lacks WebAssembly SIMD, so this file's scripts are off; bake with wasmSimd: off to support it":
ca.jc||2!==B?null:"this browser lacks WebAssembly relaxed SIMD, so this file's scripts are off; bake with wasmSimd: on to support it"}function c(B,J){const Q=d(a(B.N),()=>{if(null===B.memory)throw Error("script passed memory to the host while its module was still starting");return B.memory});for(const S of WebAssembly.Module.imports(J))if("function"===S.kind){let da,ka,oa,la;(oa=(da=Q)[ka=S.module]??(da[ka]={}))[la=S.name]??(oa[la]=l(S.module,S.name))}return Q}function n(B,J){const Q=ja.za();for(const {name:S}of WebAssembly.Module.exports(J)){if(!S.startsWith("__rive"))continue;
J=3*S.length+1;const da=ja.Xa(J);ja.tc(S,da,J);ja.exports._rive_web_vm_module_export(B.N.g,da)}ja.ya(Q);B=ja.exports._rive_web_vm_start_refusal(B.N.g);if(0!==B)throw Error(ja.Ca(B));}function q(B,J){B.memory=J.exports.memory;B.aa=null;B.Jc=Object.keys(J.exports).filter(qa=>qa.startsWith("__riveCall")).map(qa=>J.exports[qa]).filter(qa=>{if(!(qa instanceof WebAssembly.Global))return!1;try{return qa.value=qa.value,!0}catch{return!1}});B.Ic=[];const Q=ja.exports._rive_web_vm_start_fuel(B.N.g),S=J.exports.__riveFuelArm,
da=J.exports.__riveFuelEnd,ka=0<Q&&void 0!==S&&void 0!==da,oa=ja.exports._rive_web_vm_booting;oa(B.N.g);const la=ja.za();B.instance=J;try{ka&&S(Q),J.exports.__riveLiftedStart?.(),ka&&da()}catch(qa){throw B.instance=null,ja.ya(la),B.N.j=null,qa;}finally{oa(0)}}async function v(B){try{const S=await WebAssembly.compile(Ka(B.aa));if(0!==B.N.g){n(B,S);var J=m(S),Q=await WebAssembly.instantiate(S,c(B,S));await J;0!==B.N.g&&q(B,Q)}}catch(S){B.error=P(S)}}function h(B,J){if(B.length!==J.length)return!1;for(let Q=
0;Q<B.length;Q++)if(B[Q]!==J[Q])return!1;return!0}function b(B,J,Q){B={aa:B,module:J,error:Q,va:new Set,qb:null};ha.push(B);8<ha.length&&ha.shift();return B}function g(B,J){if(!Fa(B)){b(B,J,null);for(const Q of ia())Q.postMessage({riveLane:{bytes:B,module:J}})}}function k(B,J){for(const da of WebAssembly.Module.imports(B)){a:{B=J;var Q=da.module,S=da.name;for(const [ka,oa,la,qa]of yb)if(Q===ka&&(null===oa||S===oa)){B=la.includes(B)?null:qa??"";break a}B=""}if(null!==B)throw Error("lane module imports "+
da.module+"."+da.name+", which it cannot reach");}}function m(B,J=!1){const Q=[];for(const [S,da]of pb)for(const ka of WebAssembly.Module.customSections(B,S)){const oa=Ka(new Uint8Array(ka));if(Fa(oa))continue;const la=qa=>{k(qa,da);g(oa,qa)};if(J)try{la(new WebAssembly.Module(oa))}catch(qa){}else Q.push(WebAssembly.compile(oa).then(la).catch(()=>{}))}return Promise.all(Q)}function x(B,J,Q){let S=ha.find(da=>da.va.has(B));if(void 0===S){const da=J();S=ha.find(ka=>h(ka.aa,da));if(void 0===S){S=b(da,
null,null);try{const ka=new WebAssembly.Module(da);k(ka,Q);S.module=ka}catch(ka){S.error=P(ka)}}S.va.add(B);8<S.va.size&&S.va.delete(S.va.values().next().value)}return S}function L(B=!1,J=0){return(Q,S)=>B?F(()=>ja.ca().buffer,ja.exports._rive_shared_table(),J,Q,null,S):d(a({g:1,j:null,h:!1,La:I},"rive_shared_v1"),Q,"rive_shared_v1").rive_shared_v1}function T(B){B=ja.pd(B);if(null!==B)throw B;}function A(B){const J=B.qb;B.qb=null;if(null!==J)return J.Za.clear(),J;const Q={wa:0,Pb:null,Za:new Map,
reset:!1};return Object.assign(Q,W({module:B.module,ub:"rive_job_v1",cc:()=>({cancelled:()=>Q.Pb()}),Ab:L(),log:S=>ja.sb(Q.wa,S),Za:Q.Za,ob:()=>T(Q.wa)}))}function w(){let B=[],J=null;return{ea(Q){null!==J?J(Q):B.push(Q)},open(Q){J=Q;for(const S of B)J(S);B=[]},Yc(Q){for(const S of B)Va({id:S.id,kind:"failed",text:Q});B=[]}}}function t(B){return{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{memory:ja.memory(),table:ja.exports._rive_shared_table(),counter:B.buffer}}}function y(B){for(const J of[...Aa.da.keys()])Va({id:J,
kind:"failed",text:B})}function u(B,J,Q,S,da,ka=da){let oa=!1,la=-1,qa=0;const Ja=setInterval(()=>{if("closed"===B.state)clearInterval(Ja),ka("script audio context closed");else{var Ga=Atomics.load(J,0),lc=(0<Aa.da.size||0<qa)&&"running"===B.state;qa=Ga===la&&lc?qa+1:0;la=Ga;Ga=oa?0!==Atomics.load(J,1)?30:S:Q;qa>=Ga&&(clearInterval(Ja),da(oa?"processor stalled the audio thread":"script audio worklet never answered"))}},50);return{ready(){oa=!0;qa=0},stop:()=>clearInterval(Ja)}}function E(B,J,Q=!0){B.hc.Yc(J);
Aa.output===B&&(Aa.output=null);Q&&void 0===Ha.audioContext&&B.context.close?.()}function N(B){let J=mc.get(B);void 0===J&&(J={Fb:new Int32Array(new SharedArrayBuffer(16)),Bb:!1},mc.set(B,J),B.addEventListener("statechange",()=>{"closed"!==B.state||J.Bb||Rc(J.Fb)}));return J}function R(){const B=new AudioContext,J=["pointerdown","pointerup","keydown","touchend"],Q=()=>B.resume(),S=setTimeout(()=>console.warn("script audio waits for a click, tap or key press on the page"),1E3),da=()=>{if("running"===
B.state||"closed"===B.state){clearTimeout(S);B.removeEventListener("statechange",da);for(const ka of J)globalThis.removeEventListener(ka,Q,{capture:!0})}};for(const ka of J)globalThis.addEventListener(ka,Q,{capture:!0});B.addEventListener("statechange",da);da();return B}function ra(){const B=Ha.audioContext??R(),J=w(),Q={context:B,ea:J.ea,oa:new Set,hc:J},S=N(B);let da=null;const ka=la=>{Aa.output===Q&&(oa.stop(),y(la),E(Q,la,!1))},oa=u(B,S.Fb,Infinity,20,la=>{S.Bb=!0;da.port.onmessage=null;da.port.postMessage({kind:"end"});
da.disconnect();y(la);E(Q,la,!1)},ka);B.addEventListener("statechange",()=>{"closed"===B.state&&ka("script audio context closed")});B.audioWorklet.addModule(Ha.audioWorkletUrl).then(()=>{da=new AudioWorkletNode(B,"rive-processors",t(S.Fb));da.port.onmessage=la=>Va(la.data);da.connect(B.destination);oa.ready();J.open(la=>da.port.postMessage(la))}).catch(la=>{oa.stop();E(Q,nc(la))});return Q}function Ba(){const B=Ha.audioWorkletUrl;let J=Ha.audioContext;void 0===J&&(globalThis.nrdp.audio.output.open(),
J=new AudioContext);J.forceStart?.();const Q=w(),S={context:J,ea:Q.ea,oa:new Set,hc:Q},da=new Int32Array(new SharedArrayBuffer(16));let ka=null,oa=!1,la=!1;const qa=La=>{if(!la){la=!0;Ja.stop();ka?.terminate();if(oa){for(const qb=Za()+200;Za()<qb;);Rc(da);y(La)}E(S,La)}},Ja=u(J,da,40,2,qa),Ga=La=>(...qb)=>{try{La(...qb)}catch(Sb){qa(nc(Sb))}},lc=Ga(()=>{(new AudioWorkletNode(J,"rive-processors",t(da))).connect(J.destination);oa=!0;Ja.ready();Q.open(La=>ka.send(La))});fetch(B).then(La=>{if(!La.ok)throw Error(B+
" answered HTTP "+La.status);return La.text()}).then(La=>{if(!la){var qb=J.audioWorklet;qb.active=!0;qb.init(Ga(()=>{la||(ka=globalThis.nrdp.thread.start({url:B,source:La,audio:J}),ka.addEventListener("raw-message",Sb=>"ready"===Sb.kind?lc():Va(Sb)))}))}}).catch(La=>qa(nc(La)));return S}function Ma(){let B;(B=Aa).output??(B.output=void 0!==globalThis.nrdp?.audio?.output?Ba():ra());return Aa.output}function ob(B){const J=new Set([...Aa.da.values()].map(Q=>Q.$b));for(const Q of B.oa){if(8>=B.oa.size)break;
J.has(Q)||(B.oa.delete(Q),B.ea({kind:"forget",moduleId:Q}))}}function vb(B,J,Q){const S=J.Nc;B.oa.add(J.$b);B.ea({...J.start,bytes:Q?S.aa:null})}function Va(B){const J=Aa.da.get(B.id);void 0!==J&&("resend"===B.kind?null!==Aa.output&&vb(Aa.output,J,!0):ja.yd(J.ud,ae[B.kind],B.text??""))}let ja=null;const za=new Map,I={i:!1,l:0,Ja:0,Ha:0,Ia:0,Ka:0},Z=p.riveScriptingValidate??(B=>WebAssembly.validate(B)),aa=!0===p.riveScriptingLaneTwin;let ca=null;const ha=[];let ia=()=>[];const Fa=B=>ha.some(J=>h(J.aa,
B)),Ca=B=>{B=B?.riveLane;void 0!==B&&g(B.bytes,B.module)},Wa=globalThis.process?.uk?.("worker_threads");!1===Wa?.vk?Wa.yk.i("message",Ca):void 0!==globalThis.WorkerGlobalScope&&globalThis.addEventListener("message",B=>Ca(B.data));const Xa=new Map;let Rb=1;const jb=new Map;let be=1;const Aa={output:null,da:new Map,next:1},Rc=B=>K(()=>ja.memory().buffer,ja.exports._rive_shared_table(),B),nc=B=>"script audio has no worklet: "+P(B),mc=new WeakMap,ae={running:eb.running,failed:eb.failed,log:4294967295},
Ha={Gc(B){ja??=B},sk(B){ia=B},register(B,J){J=J.slice();za.set(B,{N:{g:B,j:null,h:!1,La:I},aa:J,instance:null,memory:null,fa:null,error:e(J),names:new Map})},release(B){const J=za.get(B);J&&(J.N.g=0,za.delete(B))},xd(){const B=[];for(const J of za.values())if(null===J.instance&&null===J.error){let Q;(Q=J).fa??(Q.fa=v(J));B.push(J.fa)}return Promise.all(B)},start(B){B=za.get(B);if(!B)return"script module was never registered";if(null===B.instance&&null===B.error){if(null!==B.fa)return"script module is still being prepared";
try{const J=new WebAssembly.Module(Ka(B.aa));n(B,J);m(J,!0);q(B,new WebAssembly.Instance(J,c(B,J)))}catch(J){B.error=P(J)}}return B.error},fa(B){B=za.get(B);return null===B?.instance&&null===B.error&&null!==B.fa?1:0},gd(B,J){return"function"===typeof za.get(B)?.instance?.exports[ja.Ca(J)]?1:0},call(B,J,Q,S,da,ka,oa){B=za.get(B);if(!B||null===B.instance)return 1;let la=B.names.get(J);void 0===la&&(la=B.instance.exports[ja.Ca(J)]??null,B.names.set(J,la));if("function"!==typeof la)return 1;J=B.Jc;const qa=
B.Ic,Ja=qa.length;for(let Ga=0;Ga<J.length;Ga++)qa.push(J[Ga].value);try{const Ga=kb(la,ja.Xb(),S>>3,Q);ja.Xb()[da>>3]="number"===typeof Ga?Ga:0;return 0}catch(Ga){return B.N.j=null,ja.tc(P(Ga),ka,oa),B.N.h?3:2}finally{for(Q=0;Q<J.length;Q++)J[Q].value=qa[Ja+Q];qa.length=Ja}},zd(B,J){if(B=za.get(B))B.N.j=ja.Ca(J)},read(B,J,Q,S){B=za.get(B)?.memory;if(!B||J+S>B.buffer.byteLength)return 0;ja.ca().set(new Uint8Array(B.buffer,J,S),Q);I.i&&(I.Ia+=S);return 1},write(B,J,Q,S){B=za.get(B)?.memory;if(!B||
J+S>B.buffer.byteLength)return 0;(new Uint8Array(B.buffer,J,S)).set(ja.ca().subarray(Q,Q+S));I.i&&(I.Ka+=S);return 1},mk(B,J){B=za.get(B)?.memory;if(!B||J>=B.buffer.byteLength)return-1;B=(new Uint8Array(B.buffer)).indexOf(0,J);return 0>B?-1:B-J},vd(B){return(B=za.get(B)?.memory)?B.buffer.byteLength/65536:0},$c(){const B=[];for(const J of za.keys()){const Q=ja.exports._rive_web_vm_frame_boundary(J);0!==Q&&B.push(ja.Ca(Q))}return B},Qc(B){I.i=!!B;I.l=0;I.Ja=0;I.Ha=0;I.Ia=0;I.Ka=0},kd(){return{hostCalls:I.l,
bytesStaged:I.Ja,bytesCopiedOut:I.Ha,bytesRead:I.Ia,bytesWritten:I.Ka}},runJob:function(B,J,Q,S,da,ka){J=x(J,Q,"job");if(null!==J.error)return{ok:!1,error:J.error};Q=A(J);if(void 0!==Q.error)return{ok:!1,error:Q.error};Q.wa=B;Q.Pb=ka;B=Y(Q,{prefix:Ra.job,mb:S,input:da},Q.reset);if(void 0!==B.error)return{ok:!1,error:B.error};try{const oa=Q.memory.buffer,la=new Uint32Array(oa,B.result>>>0,2),qa=0===la[1]?new Uint8Array(0):new Uint8Array(oa,la[0],la[1]);void 0!==Q.exports.__riveLaneReset&&16777216>=
oa.byteLength&&!ka()&&(Q.reset=!0,J.qb=Q);return{ok:!0,output:qa}}catch(oa){return{ok:!1,error:Q.nb(oa)}}},workerStart:function(B,J,Q,S,da,ka){J=x(J,Q,"worker");if(null!==J.error)return{ok:!1,error:J.error};S=ba({module:J.module,ub:"rive_worker_v1",cc:oa=>({finished:(la,qa,Ja)=>ka.finished(la,new Uint8Array(oa().buffer,qa>>>0,Ja>>>0)),wait:ka.wait,stopping:ka.lk}),td:oa=>ja.od(B,oa),Ab:L(),log:oa=>ja.sb(B,oa),ob:()=>T(B),prefix:Ra.worker,mb:S,input:da,ma:!0});if(void 0!==S.error)return{ok:!1,error:S.error};
da=Rb++;Xa.set(da,{wake:S.exports.__rive_worker_wake,Mc:S.exports.__riveFrameMinor});return{ok:!0,id:da}},workerWake:function(B,J,Q){try{return Xa.get(B).wake(J,Q),null}catch(S){return P(S)}},workerCollect:function(B){try{return Xa.get(B)?.Mc?.(),null}catch(J){return P(J)}},workerEnd:function(B){Xa.delete(B)},processorStart:function(B,J,Q,S,da,ka,oa){J=x(J,Q,"processor");if(null!==J.error)return{ok:!1,error:J.error};S=fa(J.module,S,da,ka,L(aa,oa),la=>ja.sb(B,la));if(void 0!==S.error)return{ok:!1,
error:S.error};da=be++;jb.set(da,S.wa);return{ok:!0,id:da}},processorRender:function(B,J,Q,S){return jb.get(B).zb(J,Q,S)},processorEnd:function(B){jb.delete(B)},audioRefusal:function(){if(void 0===globalThis.nrdp?.audio?.output&&!0!==globalThis.crossOriginIsolated)return"real time audio needs cross origin isolation";if("undefined"===typeof SharedArrayBuffer||!(ja.memory().buffer instanceof SharedArrayBuffer))return"real time audio needs librive built with threads";if("string"!==typeof Ha.audioWorkletUrl)return"real time audio needs riveScripting.audioWorkletUrl";
if("undefined"===typeof AudioContext)return"real time audio needs Web Audio";const B=Ha.audioContext;return"closed"===B?.state?"real time audio cannot start on a closed AudioContext":mc.get(B)?.Bb?"real time audio stalled the host's AudioContext; hand riveScripting a new one":null},audioSampleRate:()=>Ma().context.sampleRate,audioStart:function(B,J,Q,S,da,ka,oa,la){const qa=x(J,Q,"processor");if(null!==qa.error)return{ok:!1,error:qa.error};Q=Ma();const Ja=Aa.next++;B={ud:B,$b:J,Nc:qa,start:{kind:"start",
id:Ja,moduleId:J,entry:S,input:da,format:{sampleRate:ka.sampleRate,maxFrames:ka.rd,channels:ka.channels},hardBlocks:oa,sharedOwner:la}};Aa.da.set(Ja,B);vb(Q,B,!Q.oa.has(J));ob(Q);return{ok:!0,id:Ja}},audioStop:function(B){Aa.da.delete(B);null!==Aa.output&&(Aa.output.ea({kind:"stop",id:B}),ob(Aa.output))},audioState:()=>({context:Aa.output?.context.state??"none",processors:Aa.da.size})};Ha.prepare=Ha.xd;Ha.frameBoundary=Ha.$c;Ha.countHostCalls=Ha.Qc;Ha.hostCallCounts=Ha.kd;return p.riveScripting=Ha})(G)})();
function Da(){}const Ea=new Int32Array(5);function Ia(d,f,l,r,z){d(f,l,Ea);d=Math.max(Ea[0],0);const C=Math.max(Ea[1],0);f=Math.min(Ea[2],Math.ceil(r*f));l=Math.min(Ea[3],Math.ceil(z*l));Ea[4]=d!==Ea[0]||C!==Ea[1]||f!==Ea[2]||l!==Ea[3]?1:0;Ea[0]=d;Ea[1]=C;Ea[2]=f;Ea[3]=l;return f>d&&l>C}function Na(){var d=(d=Pa())?d.Bc:0;return 0===d?0:d}
function Qa(d,f,l,r,z,C,D,F,K,P,X){var W=Na(),Y=W-1,ba=Y-6;if(!(0<ba))return P(),Da;let fa=1,pa=1;if(!Ia(F,fa,pa,l,r))return P(),Da;const va=Ea[2]-Ea[0],wa=Ea[3]-Ea[1];if(va>Y||wa>Y)if(fa*=Math.min(1,ba/va),pa*=Math.min(1,ba/wa),!Ia(F,fa,pa,l,r))return P(),Da;l=Ea[0];r=Ea[1];Y=Ea[2];ba=Ea[3];F=0!==Ea[4];if(1>fa||1>pa)--l,--r,Y+=1,ba+=1;const ma=Y-l,ya=ba-r;d.s||(d.s=new G.DynamicRectanizer(W),d.s.reset(512,512));W=d.s.addRect(ma+1,ya+1);if(0>W&&(X(),W=d.s.addRect(ma+1,ya+1),0>W))return console.assert(!1,
"draw does not fit in an empty atlas"),P(),Da;const Oa=W&65535,Ka=W>>16;d.A.push({Fc:[fa*z[0],pa*z[1],fa*z[2],pa*z[3],fa*z[4]-l+Oa,pa*z[5]-r+Ka],Nb:Oa,Ob:Ka,qk:ma,hd:ya,ac:F,Pc:K,Bd:()=>{P()}});const kb=l/fa,wb=r/pa,yb=ma/fa,pb=ya/pa,Ra=d.O;return function(){const eb=Ra.canvas();eb&&(f.save(),f.resetTransform(),f.globalCompositeOperation=C,f.globalAlpha=D,f.drawImage(eb,Oa,Ka,ma,ya,kb,wb,yb,pb),f.restore())}}
class Sa{constructor(){this.O=new Ta;this.s=null;this.A=[];this.Ra=new ta;this.W=new ta}}let Ua=null,Ya=!1,$a=!1,ab=null;
function bb(d){const f=document.createElement("canvas");f.width=1;f.height=1;var l={alpha:!0,depth:d,stencil:d,antialias:d,premultipliedAlpha:!0,preserveDrawingBuffer:0,powerPreference:"high-performance",failIfMajorPerformanceCaveat:0,enableExtensionsByDefault:!1,explicitSwapControl:0,renderViaOffscreenBackBuffer:0};d=f.getContext("webgl2",l);if(!d)return null;f.addEventListener("webglcontextlost",function(){$a||($a=!0,console.error("WebGL context lost. Draws that rely on the WebGL2 renderer will be dropped."))});
l=cb(d,l);db(l);const r=G.makeWebGL2Renderer(f.width,f.height);if(!r)return fb(l),null;r.eb=l;r.ra=f;r.yc=d;r.Mb=f.width;r.Jb=f.height;r.zc=!!d.getExtension("WEBGL_shader_pixel_local_storage");r.Bc=Math.min(d.getParameter(d.MAX_RENDERBUFFER_SIZE),d.getParameter(d.MAX_TEXTURE_SIZE));return r}
function Pa(){if($a)return null;if(Ya)return Ua;Ya=!0;var d=bb(!0);if(!d)return console.log("No WebGL2 support. Draws that Canvas2D can't make will be dropped."),null;if(d.zc)var f=!0;else{f=d.yc;var l=f.getExtension("WEBGL_debug_renderer_info");if(l){var r=f.getParameter(l.UNMASKED_RENDERER_WEBGL);f=f.getParameter(l.UNMASKED_VENDOR_WEBGL).includes("Google")&&r.includes("ANGLE Metal Renderer")}else f=!1}return f&&(db(d.eb),d["delete"](),fb(d.eb),d=bb(!1),!d)?null:Ua=d}
class gb{constructor(d){this.ga=d;this.path=G.makeWebGL2Path();this.path.fillRule(d)}moveTo(d,f){this.path.moveTo(d,f)}lineTo(d,f){this.path.lineTo(d,f)}Qb(d,f,l,r,z,C){this.path.cubicTo(d,f,l,r,z,C)}close(){this.path.close()}addPath(d,f,l,r,z,C,D){const F=new gb(this.ga);for(const K of d)K(F);F.Na();this.path.addPath(F.path,f,l,r,z,C,D);F.dispose()}Na(){}sc(){return!1}dispose(){this.path.unref();this.path=null}}
class Ta{constructor(){this.mc=!0}canvas(){return $a||!Ua?null:Ua.ra}zb(d,f,l){const r=Pa();if(r){db(r.eb);const z=r.ra;if(z.width!==d||z.height!==f)z.width=d,z.height=f;if(r.Mb!==d||r.Jb!==f)r.resize(d,f),r.Mb=d,r.Jb=f;r.clear();ab||=new G.Mat2D;d=ab;for(const C of l)r.save(),C.ac&&r.saveClipRect(C.Nb,C.Ob,C.Nb+C.qk,C.Ob+C.hd),l=C.Fc,d.xx=l[0],d.xy=l[1],d.yx=l[2],d.yy=l[3],d.tx=l[4],d.ty=l[5],r.transform(d),C.Pc(r),C.ac&&r.restoreClipRect(),r.restore();r.flush()}}}const hb=new Sa;
function ib(d,f,l,r,z,C){const D=new DOMMatrix;D.a=d;D.b=f;D.c=l;D.d=r;D.e=z;D.f=C;return D}const lb="createConicGradient createImageData createLinearGradient createPattern createRadialGradient getContextAttributes getImageData getLineDash getTransform isContextLost isPointInPath isPointInStroke measureText".split(" "),mb=G.onRuntimeInitialized;
G.onRuntimeInitialized=function(){function d(H){switch(H){case ba.srcOver:return"source-over";case ba.rk:return"plus-lighter";case ba.screen:return"screen";case ba.overlay:return"overlay";case ba.darken:return"darken";case ba.lighten:return"lighten";case ba.colorDodge:return"color-dodge";case ba.colorBurn:return"color-burn";case ba.hardLight:return"hard-light";case ba.softLight:return"soft-light";case ba.difference:return"difference";case ba.exclusion:return"exclusion";case ba.multiply:return"multiply";
case ba.hue:return"hue";case ba.saturation:return"saturation";case ba.color:return"color";case ba.luminosity:return"luminosity"}}function f(H){return"rgba("+((16711680&H)>>>16)+","+((65280&H)>>>8)+","+((255&H)>>>0)+","+((4278190080&H)>>>24)/255+")"}function l(H,M,U,V,p){return{nc:H,oc:M,Tb:U,Ub:V,Yb:p,Cb:[],la:null}}function r(H,M,U,V){if(M.ja===pa&&!(0<M.ka))return null;U=1===U;return{wb:H.Gb(U?M.gb:null),gradientTransform:U?M.sa:null,nk:U?M.ka*M.jb:M.ka,fillRule:H.ga===va?"evenodd":"nonzero",opacity:V,
style:M.ja,color:M.bb,Wb:M.T,Lc:M.ab,join:M.hb,Hc:M.$a}}function z(H,M){return M.ja!==pa||0<M.ka?{path:H.vc(H.ga),vb:M.wc()}:null}function C(){if(0!==ma.A.length){var H=Na();0!==H&&ma.O.zb(Math.min(ma.Ra.push(ma.s.drawWidth()),H),Math.min(ma.W.push(ma.s.drawHeight()),H),ma.A)}for(const M of Ra){for(const U of M.L)U();M.L=[]}Ra.clear();for(const M of ma.A)M.Bd();ma.A=[];ma.s&&ma.s.reset(512,512)}mb&&mb();var D=G.RenderPaintStyle,F=G.FillRule;const K=G.RenderPath,P=G.RenderPaint,X=G.Renderer,W=G.StrokeCap,
Y=G.StrokeJoin,ba=G.BlendMode,fa=D.fill,pa=D.stroke,va=F.evenOdd,wa=F.nonZero,ma=hb,ya=ma.O;var Oa=G.RenderImage.extend("CanvasRenderImage",{__construct:function({xa:H,Va:M}={}){this.__parent.__construct.call(this);this.xa=H;this.Va=M;this.Cc=this.ta=this.Ea=this.Kb=null},__destruct:function(){this.ta&&(this.ta.unref(),this.ta=null);this.Ea&&URL.revokeObjectURL(this.Ea);this.__parent.__destruct.call(this)},decode:function(H){var M=this;M.Va&&M.Va(M);var U=new Image;M.Ea=URL.createObjectURL(new Blob([H],
{type:"image/png"}));U.onload=function(){M.Kb=U;M.ta=G.adoptWebGL2Image(U,U.width,U.height);M.size(U.width,U.height);M.xa&&M.xa(M)};U.src=M.Ea}});class Ka{constructor(H){this.s=H;this.path=new Path2D;this.A=null;this.W=!1}O(){null!==this.A&&(this.path.lineTo(this.A.x,this.A.y),this.A=null)}moveTo(H,M){this.O();let U=H,V=M;null!==this.s&&(H=this.s.transformPoint({x:H,y:M}),U=H.x,V=H.y);this.path.moveTo(U,V);this.A={x:U,y:V}}lineTo(H,M){this.A=null;null!==this.s?(H=this.s.transformPoint({x:H,y:M}),
this.path.lineTo(H.x,H.y)):this.path.lineTo(H,M)}Qb(H,M,U,V,p,a){this.A=null;null!==this.s?(H=this.s.transformPoint({x:H,y:M}),U=this.s.transformPoint({x:U,y:V}),p=this.s.transformPoint({x:p,y:a}),this.path.bezierCurveTo(H.x,H.y,U.x,U.y,p.x,p.y)):this.path.bezierCurveTo(H,M,U,V,p,a)}close(){this.A=null;this.path.closePath()}addPath(H,M,U,V,p,a,e){this.O();const c=new Ka(null);for(const n of H)n(c);c.Na();H=ib(M,U,V,p,a,e);null!==this.s&&(H=this.s.multiply(H));this.path.addPath(c.path,H)}Na(){null===
this.A||this.W||(this.O(),this.W=!0)}sc(){return this.W}dispose(){}}class kb{constructor(H){this.qd=H;this.W=this.O=0;this.A=null;this.s=H(null)}clear(){this.Ra(null)}kb(H,M){for(((null===M?null!==this.A:null===this.A||this.A.a!==M.a||this.A.b!==M.b||this.A.c!==M.c||this.A.d!==M.d||this.A.e!==M.e||this.A.f!==M.f)||this.W<H.length&&(0<this.O||this.s.sc()))&&this.Ra(M);this.W<H.length;)H[this.W++](this.s);this.s.Na();this.O++;return this.s.path}yb(H){null!==this.s&&H===this.s.path&&this.O--}dispose(){this.s.dispose();
this.s=null}Ra(H){this.s.dispose();this.W=this.O=0;this.A=H;this.s=this.qd(H)}}var wb=K.extend("CanvasRenderPath",{__construct:function(){this.__parent.__construct.call(this);this.ha=[];this.Fa=new kb(H=>new Ka(H));this.Ga=new kb(H=>new Ka(H));this.ia=new Map;this.ga=wa;this.fb=!1},__destruct:function(){this.Fa.dispose();this.Ga.dispose();for(const H of this.ia.values())H.dispose();this.ia.clear();this.__parent.__destruct.call(this)},rewind:function(){this.ha.length=0;this.Fa.clear();this.Ga.clear();
for(const H of this.ia.values())H.clear();this.fb=!1},addPath:function(H,M,U,V,p,a,e){const c=H.ha.slice();this.qa(n=>n.addPath(c,M,U,V,p,a,e))},fillRule:function(H){this.ga=H},moveTo:function(H,M){this.fb=!0;this.qa(U=>U.moveTo(H,M))},lineTo:function(H,M){this.Ib();this.qa(U=>U.lineTo(H,M))},cubicTo:function(H,M,U,V,p,a){this.Ib();this.qa(e=>e.Qb(H,M,U,V,p,a))},close:function(){this.qa(H=>H.close())},Ib:function(){this.fb||this.moveTo(0,0)},qa:function(H){this.ha.push(H)},Gb:function(H){H=null===
H?this.Fa.kb(this.ha,null):this.Ga.kb(this.ha,H);H.ref&&H.ref();return H},vc:function(H){var M=this.ia.get(H);void 0===M&&(M=new kb(()=>new gb(H)),this.ia.set(H,M));M=M.kb(this.ha,null);M.ref&&M.ref();return M},ib:function(H){this.Fa.yb(H);this.Ga.yb(H);for(const M of this.ia.values())M.yb(H);H.unref&&H.unref()}});const yb=l(0,0,0,0,!1);var pb=P.extend("CanvasRenderPaint",{__construct:function(){this.__parent.__construct.call(this);this.ja=fa;this.bb=4278190080;this.ka=1;this.hb=Y.miter;this.ab=W.butt;
this.cb=0;this.$a=d(ba.srcOver);this.gb=this.sa=this.T=null;this.jb=1;this.K=0;this.Z=null;this.Lb=-1},__destruct:function(){null!==this.Z&&(G.unrefWebGL2Paint(this.Z),this.Z=null);this.__parent.__destruct.call(this)},color:function(H){this.bb=H;this.T=null;this.K++},thickness:function(H){this.ka=Math.abs(H);this.K++},join:function(H){this.hb=H;this.K++},cap:function(H){this.ab=H;this.K++},feather:function(H){this.cb=Math.abs(H);this.K++},style:function(H){this.ja=H;this.K++},blendMode:function(H){this.$a=
d(H);this.K++},clearGradient:function(){this.T=null;this.K++},linearGradient:function(H,M,U,V){this.T=l(H,M,U,V,!1);this.K++},radialGradient:function(H,M,U,V){this.T=l(H,M,U,V,!0);this.K++},addStop:function(H,M){this.T.Cb.push({color:H,stop:M});this.T.la=null;this.K++},completeGradient:function(){},_setGradientTransform:function(H,M,U,V,p,a,e,c,n,q,v,h,b){1===H&&0===M&&0===U&&1===V&&0===p&&0===a?this.gb=this.sa=null:(this.sa=ib(H,M,U,V,p,a),this.gb=ib(e,c,n,q,v,h));this.jb=b;this.K++},wc:function(){if(this.Lb!==
this.K){null!==this.Z&&G.unrefWebGL2Paint(this.Z);const M=null!==this.T?this.T:yb;let U=null,V=null;if(null!==this.T){var H=M.Cb;U=new Uint32Array(H.length);V=new Float32Array(H.length);for(let v=0,h=H.length;v<h;v++)U[v]=H[v].color,V[v]=H[v].stop}H=1;let p=0,a=0,e=1,c=0,n=0;const q=this.sa;null!==q&&(H=q.a,p=q.b,a=q.c,e=q.d,c=q.e,n=q.f);this.Z=G.makeWebGL2Paint(this.ja,this.bb,this.ka,this.hb,this.ab,this.cb,U,V,M.Yb,M.nc,M.oc,M.Tb,M.Ub,H,p,a,e,c,n);this.Lb=this.K}G.refWebGL2Paint(this.Z);return this.Z}});
const Ra=new Set,eb=Object.prototype.hasOwnProperty;var Qb=G.CanvasRenderer=X.extend("Renderer",{__construct:function(H){this.__parent.__construct.call(this);this.U=[1,0,0,1,0,0];this.J=[1];this.C=H.getContext("2d");this.ra=H;this.L=[]},save:function(){this.U.push(...this.U.slice(this.U.length-6));this.J.push(this.J[this.J.length-1]);this.L.push(this.C.save.bind(this.C))},restore:function(){const H=this.U.length-6;if(6>H)throw"restore() called without matching save().";this.U.splice(H);this.J.pop();
this.L.push(this.C.restore.bind(this.C))},transform:function(H,M,U,V,p,a){const e=this.U,c=e.length-6;e.splice(c,6,e[c]*H+e[c+2]*M,e[c+1]*H+e[c+3]*M,e[c]*U+e[c+2]*V,e[c+1]*U+e[c+3]*V,e[c]*p+e[c+2]*a+e[c+4],e[c+1]*p+e[c+3]*a+e[c+5]);this.L.push(this.C.transform.bind(this.C,H,M,U,V,p,a))},rotate:function(H){const M=Math.sin(H);H=Math.cos(H);this.transform(H,M,-M,H,0,0)},modulateOpacity:function(H){this.J[this.J.length-1]*=H},_drawPath:function(H,M){const U=Math.max(0,this.J[this.J.length-1]),V=0!==
M.cb?ya.mc?2:0:null===M.T||null===M.sa?0:M.ja!==pa||0<M.jb?1:ya.mc?2:0;if(2===V)this.xc(H,M,U);else{var p=r(H,M,V,U);null!==p&&this.L.push(()=>{var a=this.C;const e=a.globalCompositeOperation,c=a.globalAlpha;a.globalCompositeOperation=p.Hc;a.globalAlpha=p.opacity;if(null!==p.Wb){var n=p.Wb;if(null===n.la){var q=n.nc;const b=n.oc;var v=n.Tb,h=n.Ub;n.Yb?(v-=q,h-=b,n.la=a.createRadialGradient(q,b,0,q,b,Math.sqrt(v*v+h*h))):n.la=a.createLinearGradient(q,b,v,h);q=n.Cb;for(let g=0,k=q.length;g<k;g++)n.la.addColorStop(q[g].stop,
f(q[g].color))}n=n.la}else n=f(p.color);null!==p.gradientTransform&&(a.save(),a.transform(p.gradientTransform.a,p.gradientTransform.b,p.gradientTransform.c,p.gradientTransform.d,p.gradientTransform.e,p.gradientTransform.f));switch(p.style){case pa:a.strokeStyle=n;a.lineWidth=p.nk;a:{switch(p.Lc){case W.butt:n="butt";break a;case W.round:n="round";break a;case W.square:n="square";break a}n=void 0}a.lineCap=n;a:{switch(p.join){case Y.miter:n="miter";break a;case Y.round:n="round";break a;case Y.bevel:n=
"bevel";break a}n=void 0}a.lineJoin=n;a.miterLimit=4;a.stroke(p.wb);break;case fa:a.fillStyle=n,a.fill(p.wb,p.fillRule)}null!==p.gradientTransform&&a.restore();a.globalCompositeOperation=e;a.globalAlpha=c;H.ib(p.wb)})}},xc:function(H,M,U){const V=z(H,M);if(null!==V){var p=this.U.slice(this.U.length-6);M=Qa(ma,this.C,this.C.canvas.width,this.C.canvas.height,p,M.$a,U,(a,e,c)=>G.webGL2PathPixelBounds(V.path,V.vb,a*p[0],e*p[1],a*p[2],e*p[3],a*p[4],e*p[5],c),a=>a.drawPath(V.path,V.vb),()=>{H.ib(V.path);
G.unrefWebGL2Paint(V.vb)},C);Ra.add(this);this.L.push(M)}},_drawRiveImage:function(H,M,U){var V=H.Kb;if(V){var p=this.C,a=d(M),e=Math.max(0,U*this.J[this.J.length-1]);this.L.push(function(){p.globalCompositeOperation=a;p.globalAlpha=e;p.drawImage(V,0,0);p.globalAlpha=1})}},_getMatrix:function(H){const M=this.U,U=M.length-6;for(let V=0;6>V;++V)H[V]=M[U+V]},_drawImageMesh:function(H,M,U,V,p,a,e,c){const n=H.ta;n?this.Hb(U,V,p,a,e,c,q=>G.drawWebGL2PendingMesh(q,M,n),()=>M.unref()):M.unref()},_drawImageMeshFromHeap:function(H,
M,U,V,p,a,e,c,n,q,v,h,b){if(H.Cc){try{var g=G.HEAPF32.slice(V>>2,(V>>2)+p);var k=G.HEAPF32.slice(a>>2,(a>>2)+e);var m=G.HEAPU16.slice(c>>1,(c>>1)+n)}catch(x){console.error("[Rive] _drawImageMesh: failed to read mesh data from WASM heap. Mesh skipped for this frame.");return}this.Hb(M,U,q,v,h,b,{image:H,Bk:g,Ak:k,indices:m},()=>{})}},Hb:function(H,M,U,V,p,a,e,c){H=Qa(ma,this.C,this.C.canvas.width,this.C.canvas.height,this.U.slice(this.U.length-6),d(H),Math.max(0,M*this.J[this.J.length-1]),(n,q,v)=>
{v[0]=Math.floor(U*n);v[1]=Math.floor(V*q);v[2]=Math.ceil(p*n);v[3]=Math.ceil(a*q)},e,c,C);Ra.add(this);this.L.push(H)},_clipPath:function(H){const M=H.ga===va?"evenodd":"nonzero",U=H.Gb(null);this.L.push(()=>{this.C.clip(U,M);H.ib(U)})},beginFrame:function(H=!0){Ra.add(this);H&&this.L.push(this.C.clearRect.bind(this.C,0,0,this.ra.width,this.ra.height))},clear:function(){this.beginFrame(!0)},flush:function(){},translate:function(H,M){this.transform(1,0,0,1,H,M)}});G.makeRenderer=function(H){const M=
new Qb(H),U=M.C;let V=null,p=null;const a={attachSession:function(c){if(c&&V===c)return!0;if(!c||V||"function"!==typeof G.c2dDeferredClaim||"function"!==typeof G.c2dDeferredRenderer||!G.c2dDeferredClaim(c))return!1;const n=G.c2dDeferredRenderer(c);if(!n)return!1;V=c;p=n;return!0},detachSession:function(){V&&G.c2dDeferredDetach(V);p=V=null},deferredActive:function(){return null!==p}},e={save:function(){G.c2dDeferredSave(V)},restore:function(){G.c2dDeferredRestore(V)},transform:function(c,n,q,v,h,b){G.c2dDeferredTransform(V,
c,n,q,v,h,b)},translate:function(c,n){G.c2dDeferredTransform(V,1,0,0,1,c,n)},rotate:function(c){const n=Math.sin(c);c=Math.cos(c);G.c2dDeferredTransform(V,c,n,-n,c,0,0)},align:function(c,n,q,v,h){G.c2dDeferredAlign(V,c,n,q.minX,q.minY,q.maxX,q.maxY,v.minX,v.minY,v.maxX,v.maxY,void 0===h?1:h)},beginFrame:function(c=!0){M.beginFrame(c);G.c2dDeferredBeginFrame(V)},clear:function(){M.beginFrame(!0);G.c2dDeferredBeginFrame(V)},flush:function(){G.c2dDeferredReplay(V,M)}};return new Proxy(M,{get(c,n){if(eb.call(a,
n))return a[n];if("_deferredRecorder"===n)return p;if(null!==p&&eb.call(e,n))return e[n];if("function"===typeof c[n])return function(...q){return c[n].apply(c,q)};if("function"===typeof U[n]){if(-1<lb.indexOf(n))throw Error("RiveException: Method call to '"+n+"()' is not allowed, as the renderer cannot immediately pass through the return                 values of any canvas 2d context methods.");return function(...q){M.L.push(U[n].bind(U,...q))}}return c[n]},set(c,n,q){if(n in U)return M.L.push(()=>
{U[n]=q}),!0}})};G.decodeImage=function(H,M){(new Oa({xa:M})).decode(H)};G.renderFactory={makeRenderPaint:function(){return new pb},makeRenderPath:function(){return new wb},makeRenderImage:function(){let H=xb;return new Oa({Va:()=>{H.total++},xa:()=>{H.loaded++;if(H.loaded===H.total){const M=H.ready;M&&(M(),H.ready=null)}}})}};let Za=G.load,xb=null;G.load=function(H,M,U=!0,V=null){const p=new G.FallbackFileAssetLoader;void 0!==M&&p.addLoader(M);U&&(M=new G.CDNFileAssetLoader(V),p.addLoader(M));return(new Promise(function(a){let e=
null;xb={total:0,loaded:0,ready:function(){a(e)}};e=Za(H,p,V??null);const c=G.riveScripting;c&&c.prepare();0==xb.total&&a(e)})).then(G.startFileScripts)};const zb=G.Artboard.prototype.draw;G.Artboard.prototype.draw=function(H){zb.call(this,H._deferredRecorder||H)};let kc=G.RendererWrapper.prototype.align;G.RendererWrapper.prototype.align=function(H,M,U,V,p=1){kc.call(this,H,M,U,V,p)};D=new sa;G.requestAnimationFrame=D.requestAnimationFrame.bind(D);G.cancelAnimationFrame=D.cancelAnimationFrame.bind(D);
G.enableFPSCounter=D.Vc.bind(D);G.disableFPSCounter=D.Sc;F=ua(C);D.bc=F;G.resolveAnimationFrame=F;G.cleanup=function(){ma.s&&(ma.s["delete"](),ma.s=null)}};var nb="./this.program";na&&(_scriptName=self.location.href);var rb="",sb,tb;
if(ea||na){try{rb=(new URL(".",_scriptName)).href}catch{}na&&(tb=d=>{var f=new XMLHttpRequest;f.open("GET",d,!1);f.responseType="arraybuffer";f.send(null);return new Uint8Array(f.response)});sb=async d=>{if(ub(d))return new Promise((l,r)=>{var z=new XMLHttpRequest;z.open("GET",d,!0);z.responseType="arraybuffer";z.onload=()=>{200==z.status||0==z.status&&z.response?l(z.response):r(z.status)};z.onerror=r;z.send(null)});var f=await fetch(d,{credentials:"same-origin"});if(f.ok)return f.arrayBuffer();throw Error(f.status+
" : "+f.url);}}var Ab=console.log.bind(console),Bb=console.error.bind(console),Cb,Db=!1,ub=d=>d.startsWith("file://"),Eb,Fb,Gb,Hb,Ib,Jb,Kb,Lb,Mb,Nb,Ob=!1;function Pb(){var d=Tb.buffer;G.HEAP8=Gb=new Int8Array(d);Ib=new Int16Array(d);G.HEAPU8=Hb=new Uint8Array(d);G.HEAPU16=Jb=new Uint16Array(d);G.HEAP32=Kb=new Int32Array(d);G.HEAPU32=Lb=new Uint32Array(d);G.HEAPF32=Mb=new Float32Array(d);Nb=new Float64Array(d)}
function Ub(d){G.onAbort?.(d);d="Aborted("+d+")";Bb(d);Db=!0;d=new WebAssembly.RuntimeError(d+". Build with -sASSERTIONS for more info.");Fb?.(d);throw d;}var Vb;async function Wb(d){if(!Cb)try{var f=await sb(d);return new Uint8Array(f)}catch{}if(d==Vb&&Cb)d=new Uint8Array(Cb);else if(tb)d=tb(d);else throw"both async and sync fetching of the wasm failed";return d}
async function Xb(d,f){try{var l=await Wb(d);return await WebAssembly.instantiate(l,f)}catch(r){Bb(`failed to asynchronously prepare wasm: ${r}`),Ub(r)}}async function Yb(d){var f=Vb;if(!Cb&&!ub(f))try{var l=fetch(f,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(l,d)}catch(r){Bb(`wasm streaming compile failed: ${r}`),Bb("falling back to ArrayBuffer instantiation")}return Xb(f,d)}
var Zb,$b,ac=d=>{for(;0<d.length;)d.shift()(G)},bc=[],cc=[],dc=()=>{var d=G.preRun.shift();cc.push(d)},fc=d=>ec(d),hc=()=>gc(),ic=globalThis.TextDecoder&&new TextDecoder,jc=(d,f,l,r)=>{l=f+l;if(r)return l;for(;d[f]&&!(f>=l);)++f;return f},oc=(d,f=0,l,r)=>{l=jc(d,f,l,r);if(16<l-f&&d.buffer&&ic)return ic.decode(d.subarray(f,l));for(r="";f<l;){var z=d[f++];if(z&128){var C=d[f++]&63;if(192==(z&224))r+=String.fromCharCode((z&31)<<6|C);else{var D=d[f++]&63;z=224==(z&240)?(z&15)<<12|C<<6|D:(z&7)<<18|C<<
12|D<<6|d[f++]&63;65536>z?r+=String.fromCharCode(z):(z-=65536,r+=String.fromCharCode(55296|z>>10,56320|z&1023))}}else r+=String.fromCharCode(z)}return r},pc=(d,f)=>Object.defineProperty(f,"name",{value:d}),qc=[],rc=[0,1,,1,null,1,!0,1,!1,1],sc=class extends Error{constructor(d){super(d);this.name="BindingError"}},tc=d=>{if(!d)throw new sc(`Cannot use deleted val. handle = ${d}`);return rc[d]},uc=d=>{switch(d){case void 0:return 2;case null:return 4;case !0:return 6;case !1:return 8;default:const f=
qc.pop()||rc.length;rc[f]=d;rc[f+1]=1;return f}};class vc extends Error{}
var wc=d=>{for(var f="";;){var l=Hb[d++];if(!l)return f;f+=String.fromCharCode(l)}},xc={},yc=(d,f)=>{if(void 0===f)throw new sc("ptr should not be undefined");for(;d.G;)f=d.Ba(f),d=d.G;return f},zc={},Cc=d=>{d=Ac(d);var f=wc(d);Bc(d);return f},Dc=(d,f)=>{var l=zc[d];if(void 0===l)throw d=`${f} has unknown type ${Cc(d)}`,new sc(d);return l},Ec=()=>{},Fc=!1,Gc=d=>{if(!globalThis.FinalizationRegistry)return Gc=f=>f,d;Fc=new FinalizationRegistry(f=>{f=f.m;--f.count.value;0===f.count.value&&(f.H?f.R.X(f.H):
f.B.o.X(f.v))});Gc=f=>{var l=f.m;l.H&&Fc.register(f,{m:l},f);return f};Ec=f=>{Fc.unregister(f)};return Gc(d)},Hc={},Ic=d=>{for(;d.length;){var f=d.pop();d.pop()(f)}};function Jc(d){return this.u(Lb[d>>2])}
var Kc={},Lc={},Mc=class extends Error{constructor(d){super(d);this.name="InternalError"}},Oc=(d,f,l)=>{function r(F){F=l(F);if(F.length!==d.length)throw new Mc("Mismatched type converter count");for(var K=0;K<d.length;++K)Nc(d[K],F[K])}d.forEach(F=>Lc[F]=f);var z=Array(f.length),C=[],D=0;for(let [F,K]of f.entries())zc.hasOwnProperty(K)?z[F]=zc[K]:(C.push(K),Kc.hasOwnProperty(K)||(Kc[K]=[]),Kc[K].push(()=>{z[F]=zc[K];++D;D===C.length&&r(z)}));0===C.length&&r(z)};
function Pc(d,f,l={}){var r=f.name;if(!d)throw new sc(`type "${r}" must have a positive integer typeid pointer`);if(zc.hasOwnProperty(d)){if(l.ld)return;throw new sc(`Cannot register type '${r}' twice`);}zc[d]=f;delete Lc[d];Kc.hasOwnProperty(d)&&(f=Kc[d],delete Kc[d],f.forEach(z=>z()))}function Nc(d,f,l={}){return Pc(d,f,l)}var Qc=d=>{throw new sc(d.m.B.o.name+" instance already deleted");},Sc=[];function Tc(){}
var Uc={},Vc=(d,f,l)=>{if(void 0===d[f].D){var r=d[f];d[f]=function(...z){if(!d[f].D.hasOwnProperty(z.length))throw new sc(`Function '${l}' called with an invalid number of arguments (${z.length}) - expects one of (${d[f].D})!`);return d[f].D[z.length].apply(this,z)};d[f].D=[];d[f].D[r.Y]=r}},Wc=(d,f,l)=>{if(G.hasOwnProperty(d)){if(void 0===l||void 0!==G[d].D&&void 0!==G[d].D[l])throw new sc(`Cannot register public name '${d}' twice`);Vc(G,d,d);if(G[d].D.hasOwnProperty(l))throw new sc(`Cannot register multiple overloads of a function with the same number of arguments (${l})!`);
G[d].D[l]=f}else G[d]=f,G[d].Y=l},Xc=d=>{d=d.replace(/[^a-zA-Z0-9_]/g,"$");var f=d.charCodeAt(0);return 48<=f&&57>=f?`_${d}`:d};function Yc(d,f,l,r,z,C,D,F){this.name=d;this.constructor=f;this.V=l;this.X=r;this.G=z;this.bd=C;this.Ba=D;this.Tc=F;this.ec=[]}
var Zc=(d,f,l)=>{for(;f!==l;){if(!f.Ba)throw new sc(`Expected null or instance of ${l.name}, got an instance of ${f.name}`);d=f.Ba(d);f=f.G}return d},$c=d=>{if(null===d)return"null";var f=typeof d;return"object"===f||"array"===f||"function"===f?d.toString():""+d};
function ad(d,f){if(null===f){if(this.pb)throw new sc(`null is not a valid ${this.name}`);return 0}if(!f.m)throw new sc(`Cannot pass "${$c(f)}" as a ${this.name}`);if(!f.m.v)throw new sc(`Cannot pass deleted object as a pointer of type ${this.name}`);return Zc(f.m.v,f.m.B.o,this.o)}
function bd(d,f){if(null===f){if(this.pb)throw new sc(`null is not a valid ${this.name}`);if(this.Qa){var l=this.xb();null!==d&&d.push(this.X,l);return l}return 0}if(!f||!f.m)throw new sc(`Cannot pass "${$c(f)}" as a ${this.name}`);if(!f.m.v)throw new sc(`Cannot pass deleted object as a pointer of type ${this.name}`);if(!this.Pa&&f.m.B.Pa)throw new sc(`Cannot convert argument of type ${f.m.R?f.m.R.name:f.m.B.name} to parameter type ${this.name}`);l=Zc(f.m.v,f.m.B.o,this.o);if(this.Qa){if(void 0===
f.m.H)throw new sc("Passing raw pointer to smart pointer is illegal");switch(this.kk){case 0:if(f.m.R===this)l=f.m.H;else throw new sc(`Cannot convert argument of type ${f.m.R?f.m.R.name:f.m.B.name} to parameter type ${this.name}`);break;case 1:l=f.m.H;break;case 2:if(f.m.R===this)l=f.m.H;else{var r=f.clone();l=this.Ad(l,uc(()=>r["delete"]()));null!==d&&d.push(this.X,l)}break;default:throw new sc("Unsupported sharing policy");}}return l}
function cd(d,f){if(null===f){if(this.pb)throw new sc(`null is not a valid ${this.name}`);return 0}if(!f.m)throw new sc(`Cannot pass "${$c(f)}" as a ${this.name}`);if(!f.m.v)throw new sc(`Cannot pass deleted object as a pointer of type ${this.name}`);if(f.m.B.Pa)throw new sc(`Cannot convert argument of type ${f.m.B.name} to parameter type ${this.name}`);return Zc(f.m.v,f.m.B.o,this.o)}
var dd=(d,f,l)=>{if(f===l)return d;if(void 0===l.G)return null;d=dd(d,f,l.G);return null===d?null:l.Tc(d)},ed=(d,f)=>{f=yc(d,f);return xc[f]},fd=(d,f)=>{if(!f.B||!f.v)throw new Mc("makeClassHandle requires ptr and ptrType");if(!!f.R!==!!f.H)throw new Mc("Both smartPtrType and smartPtr must be specified");f.count={value:1};return Gc(Object.create(d,{m:{value:f,writable:!0}}))};
function gd(d,f,l,r,z,C,D,F,K,P,X){this.name=d;this.o=f;this.pb=l;this.Pa=r;this.Qa=z;this.wd=C;this.kk=D;this.ic=F;this.xb=K;this.Ad=P;this.X=X;z||void 0!==f.G?this.F=bd:(this.F=r?ad:cd,this.M=null)}
var hd=(d,f,l)=>{if(!G.hasOwnProperty(d))throw new Mc("Replacing nonexistent public symbol");void 0!==G[d].D&&void 0!==l?G[d].D[l]=f:(G[d]=f,G[d].Y=l)},jd={},ld=(d,f,l=[])=>{d.includes("j")?(d=d.replace(/p/g,"i"),f=(0,jd[d])(f,...l)):f=kd.get(f)(...l);return f},md=(d,f)=>(...l)=>ld(d,f,l),nd=(d,f)=>{d=wc(d);var l=d.includes("j")?md(d,f):kd.get(f);if("function"!=typeof l)throw new sc(`unknown function pointer with signature ${d}: ${f}`);return l};class od extends Error{}
var pd=(d,f)=>{function l(C){z[C]||zc[C]||(Lc[C]?Lc[C].forEach(l):(r.push(C),z[C]=!0))}var r=[],z={};f.forEach(l);throw new od(`${d}: `+r.map(Cc).join([", "]));};function qd(d){for(var f=1;f<d.length;++f)if(null!==d[f]&&void 0===d[f].M)return!0;return!1}
function rd(d,f,l,r,z){var C=f.length;if(2>C)throw new sc("argTypes array size mismatch! Must at least get return value and 'this' types!");var D=null!==f[1]&&null!==l,F=qd(f),K=!f[0].nd,P=C-2,X=Array(P),W=[],Y=[];return pc(d,function(...ba){Y.length=0;W.length=D?2:1;W[0]=z;if(D){var fa=f[1].F(Y,this);W[1]=fa}for(var pa=0;pa<P;++pa)X[pa]=f[pa+2].F(Y,ba[pa]),W.push(X[pa]);ba=r(...W);if(F)Ic(Y);else for(pa=D?1:2;pa<f.length;pa++){var va=1===pa?fa:X[pa-2];null!==f[pa].M&&f[pa].M(va)}fa=K?f[0].u(ba):
void 0;return fa})}
var sd=(d,f)=>{for(var l=[],r=0;r<d;r++)l.push(Lb[f+4*r>>2]);return l},td=d=>{d=d.trim();const f=d.indexOf("(");return-1===f?d:d.slice(0,f)},ud=(d,f,l)=>{if(!(d instanceof Object))throw new sc(`${l} with invalid "this": ${d}`);if(!(d instanceof f.o.constructor))throw new sc(`${l} incompatible with "this" of type ${d.constructor.name}`);if(!d.m.v)throw new sc(`cannot call emscripten binding method ${l} on deleted object`);return Zc(d.m.v,d.m.B.o,f.o)},vd=d=>{9<d&&0===--rc[d+1]&&(rc[d]=void 0,qc.push(d))},
wd={name:"emscripten::val",u:d=>{var f=tc(d);vd(d);return f},F:(d,f)=>uc(f),P:Jc,M:null},xd=(d,f,l)=>{switch(f){case 1:return l?function(r){return this.u(Gb[r])}:function(r){return this.u(Hb[r])};case 2:return l?function(r){return this.u(Ib[r>>1])}:function(r){return this.u(Jb[r>>1])};case 4:return l?function(r){return this.u(Kb[r>>2])}:function(r){return this.u(Lb[r>>2])};default:throw new TypeError(`invalid integer width (${f}): ${d}`);}},yd=(d,f)=>{switch(f){case 4:return function(l){return this.u(Mb[l>>
2])};case 8:return function(l){return this.u(Nb[l>>3])};default:throw new TypeError(`invalid float width (${f}): ${d}`);}},zd=(d,f,l)=>{switch(f){case 1:return l?r=>Gb[r]:r=>Hb[r];case 2:return l?r=>Ib[r>>1]:r=>Jb[r>>1];case 4:return l?r=>Kb[r>>2]:r=>Lb[r>>2];default:throw new TypeError(`invalid integer width (${f}): ${d}`);}},Ad=(d,f,l)=>{var r=Hb;if(!(0<l))return 0;var z=f;l=f+l-1;for(var C=0;C<d.length;++C){var D=d.codePointAt(C);if(127>=D){if(f>=l)break;r[f++]=D}else if(2047>=D){if(f+1>=l)break;
r[f++]=192|D>>6;r[f++]=128|D&63}else if(65535>=D){if(f+2>=l)break;r[f++]=224|D>>12;r[f++]=128|D>>6&63;r[f++]=128|D&63}else{if(f+3>=l)break;r[f++]=240|D>>18;r[f++]=128|D>>12&63;r[f++]=128|D>>6&63;r[f++]=128|D&63;C++}}r[f]=0;return f-z},Bd=d=>{for(var f=0,l=0;l<d.length;++l){var r=d.charCodeAt(l);127>=r?f++:2047>=r?f+=2:55296<=r&&57343>=r?(f+=4,++l):f+=3}return f},Cd=globalThis.TextDecoder?new TextDecoder("utf-16le"):void 0,Dd=(d,f,l)=>{d>>=1;f=jc(Jb,d,f/2,l);if(16<f-d&&Cd)return Cd.decode(Jb.subarray(d,
f));for(l="";d<f;++d)l+=String.fromCharCode(Jb[d]);return l},Ed=(d,f,l)=>{l??=2147483647;if(2>l)return 0;l-=2;var r=f;l=l<2*d.length?l/2:d.length;for(var z=0;z<l;++z)Ib[f>>1]=d.charCodeAt(z),f+=2;Ib[f>>1]=0;return f-r},Fd=d=>2*d.length,Gd=(d,f,l)=>{var r="";d>>=2;for(var z=0;!(z>=f/4);z++){var C=Lb[d+z];if(!C&&!l)break;r+=String.fromCodePoint(C)}return r},Hd=(d,f,l)=>{l??=2147483647;if(4>l)return 0;var r=f;l=r+l-4;for(var z=0;z<d.length;++z){var C=d.codePointAt(z);65535<C&&z++;Kb[f>>2]=C;f+=4;if(f+
4>l)break}Kb[f>>2]=0;return f-r},Id=d=>{for(var f=0,l=0;l<d.length;++l)65535<d.codePointAt(l)&&l++,f+=4;return f},Jd=[],Kd=d=>{var f=Jd.length;Jd.push(d);return f},Ld=(d,f)=>{for(var l=Array(d),r=0;r<d;++r)l[r]=Dc(Lb[f+4*r>>2],`parameter ${r}`);return l},Md={},Nd=d=>{var f=Md[d];return void 0===f?wc(d):f},Od=[0,31,60,91,121,152,182,213,244,274,305,335],Pd=[0,31,59,90,120,151,181,212,243,273,304,334],Qd=[],Rd=d=>{d.tk=d.getExtension("WEBGL_draw_instanced_base_vertex_base_instance")},Sd=d=>{d.xk=d.getExtension("WEBGL_multi_draw_instanced_base_vertex_base_instance")},
O,Td=d=>{var f="EXT_color_buffer_float EXT_conservative_depth EXT_disjoint_timer_query_webgl2 EXT_texture_norm16 NV_shader_noperspective_interpolation WEBGL_clip_cull_distance EXT_clip_control EXT_color_buffer_half_float EXT_depth_clamp EXT_float_blend EXT_polygon_offset_clamp EXT_texture_compression_bptc EXT_texture_compression_rgtc EXT_texture_filter_anisotropic KHR_parallel_shader_compile OES_texture_float_linear WEBGL_blend_func_extended WEBGL_compressed_texture_astc WEBGL_compressed_texture_etc WEBGL_compressed_texture_etc1 WEBGL_compressed_texture_s3tc WEBGL_compressed_texture_s3tc_srgb WEBGL_debug_renderer_info WEBGL_debug_shaders WEBGL_lose_context WEBGL_multi_draw WEBGL_polygon_mode".split(" ");
return(d.getSupportedExtensions()||[]).filter(l=>f.includes(l))},Ud=1,Vd=[],Wd=[],Xd=[],Yd=[],Zd=[],$d=[],ce=[],de=[],ee=[],fe=[],ge={},he=4,ie=0,je=d=>{for(var f=Ud++,l=d.length;l<f;l++)d[l]=null;return f},le=(d,f,l,r)=>{for(var z=0;z<d;z++){var C=O[l](),D=C&&je(r);C?(C.name=D,r[D]=C):ke||=1282;Kb[f+4*z>>2]=D}},cb=(d,f)=>{var l=je(de),r={handle:l,attributes:f,version:f.wk,I:d};d.canvas&&(d.canvas.uc=r);de[l]=r;if("undefined"==typeof f.Uc||f.Uc)if((d=r)||(d=me),!d.md){d.md=!0;f=d.I;f.sd=f.getExtension("WEBGL_multi_draw");
f.Xc=f.getExtension("EXT_polygon_offset_clamp");f.Wc=f.getExtension("EXT_clip_control");f.pk=f.getExtension("WEBGL_polygon_mode");Rd(f);Sd(f);2<=d.version&&(f.Sb=f.getExtension("EXT_disjoint_timer_query_webgl2"));if(2>d.version||!f.Sb)f.Sb=f.getExtension("EXT_disjoint_timer_query");for(var z of Td(f))z.includes("lose_context")||z.includes("debug")||f.getExtension(z)}return l},db=d=>{me=de[d];G.ctx=O=me?.I;return!(d&&!O)},fb=d=>{me===de[d]&&(me=null);"object"==typeof JSEvents&&JSEvents.zk(de[d].I.canvas);
de[d]?.I.canvas&&(de[d].I.canvas.uc=void 0);de[d]=null},ke,me,ne={},pe=()=>{if(!oe){var d={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:(globalThis.navigator?.language??"C").replace("-","_")+".UTF-8",_:nb||"./this.program"},f;for(f in ne)void 0===ne[f]?delete d[f]:d[f]=ne[f];var l=[];for(f in d)l.push(`${f}=${d[f]}`);oe=l}return oe},oe,qe=[null,[],[]],re=[],se=()=>{var d=Td(O);return d=d.concat(d.map(f=>"GL_"+f))},te=(d,f)=>{if(f){var l=void 0;switch(d){case 36346:l=
1;break;case 36344:return;case 34814:case 36345:l=0;break;case 34466:var r=O.getParameter(34467);l=r?r.length:0;break;case 33309:if(2>me.version){ke||=1282;return}l=se().length;break;case 33307:case 33308:if(2>me.version){ke||=1280;return}l=33307==d?3:0}if(void 0===l)switch(r=O.getParameter(d),typeof r){case "number":l=r;break;case "boolean":l=r?1:0;break;case "string":ke||=1280;return;case "object":if(null===r)switch(d){case 34964:case 35725:case 34965:case 36006:case 36007:case 32873:case 34229:case 36662:case 36663:case 35053:case 35055:case 36010:case 35097:case 35869:case 32874:case 36389:case 35983:case 35368:case 34068:l=
0;break;default:ke||=1280;return}else{if(r instanceof Float32Array||r instanceof Uint32Array||r instanceof Int32Array||r instanceof Array){for(d=0;d<r.length;++d)Kb[f+4*d>>2]=r[d];return}try{l=r.name|0}catch(z){ke||=1280;Bb(`GL_INVALID_ENUM in glGet${0}v: Unknown object returned from WebGL getParameter(${d})! (error: ${z})`);return}}break;default:ke||=1280;Bb(`GL_INVALID_ENUM in glGet${0}v: Native code calling glGet${0}v(${d}) and it returns ${r} of type ${typeof r}!`);return}Kb[f>>2]=l}else ke||=
1281},ve=d=>{var f=Bd(d)+1,l=ue(f);l&&Ad(d,l,f);return l},we=d=>"]"==d.slice(-1)&&d.lastIndexOf("["),xe=d=>{d-=5120;return 0==d?Gb:1==d?Hb:2==d?Ib:4==d?Kb:6==d?Mb:5==d||28922==d||28520==d||30779==d||30782==d?Lb:Jb},ze=d=>ye(d);
(()=>{let d=Tc.prototype;Object.assign(d,{isAliasOf:function(l){if(!(this instanceof Tc&&l instanceof Tc))return!1;var r=this.m.B.o,z=this.m.v;l.m=l.m;var C=l.m.B.o;for(l=l.m.v;r.G;)z=r.Ba(z),r=r.G;for(;C.G;)l=C.Ba(l),C=C.G;return r===C&&z===l},clone:function(){this.m.v||Qc(this);if(this.m.na)return this.m.count.value+=1,this;var l=Gc,r=Object,z=r.create,C=Object.getPrototypeOf(this),D=this.m;l=l(z.call(r,C,{m:{value:{count:D.count,ua:D.ua,na:D.na,v:D.v,B:D.B,H:D.H,R:D.R}}}));l.m.count.value+=1;l.m.ua=
!1;return l},["delete"](){this.m.v||Qc(this);if(this.m.ua&&!this.m.na)throw new sc("Object already scheduled for deletion");Ec(this);var l=this.m;--l.count.value;0===l.count.value&&(l.H?l.R.X(l.H):l.B.o.X(l.v));this.m.na||(this.m.H=void 0,this.m.v=void 0)},isDeleted:function(){return!this.m.v},deleteLater:function(){this.m.v||Qc(this);if(this.m.ua&&!this.m.na)throw new sc("Object already scheduled for deletion");Sc.push(this);this.m.ua=!0;return this}});const f=Symbol.dispose;f&&(d[f]=d["delete"])})();
Object.assign(gd.prototype,{cd(d){this.ic&&(d=this.ic(d));return d},Rb(d){this.X?.(d)},P:Jc,u:function(d){function f(){return this.Qa?fd(this.o.V,{B:this.wd,v:l,R:this,H:d}):fd(this.o.V,{B:this,v:d})}var l=this.cd(d);if(!l)return this.Rb(d),null;var r=ed(this.o,l);if(void 0!==r){if(0===r.m.count.value)return r.m.v=l,r.m.H=d,r.clone();r=r.clone();this.Rb(d);return r}r=this.o.bd(l);r=Uc[r];if(!r)return f.call(this);r=this.Pa?r.Oc:r.pointerType;var z=dd(l,this.o,r.o);return null===z?f.call(this):this.Qa?
fd(r.o.V,{B:r,v:z,R:this,H:d}):fd(r.o.V,{B:r,v:z})}});for(let d=0;32>d;++d)re.push(Array(d));G.print&&(Ab=G.print);G.printErr&&(Bb=G.printErr);G.wasmBinary&&(Cb=G.wasmBinary);G.thisProgram&&(nb=G.thisProgram);if(G.preInit)for("function"==typeof G.preInit&&(G.preInit=[G.preInit]);0<G.preInit.length;)G.preInit.shift()();
var De={341417:(d,f,l,r,z)=>{if("undefined"===typeof window||void 0===(window.AudioContext||window.webkitAudioContext))return 0;if("undefined"===typeof window.miniaudio){window.miniaudio={referenceCount:0};window.miniaudio.device_type={};window.miniaudio.device_type.playback=d;window.miniaudio.device_type.capture=f;window.miniaudio.device_type.duplex=l;window.miniaudio.device_state={};window.miniaudio.device_state.stopped=r;window.miniaudio.device_state.started=z;let C=window.miniaudio;C.devices=
[];C.track_device=function(D){for(var F=0;F<C.devices.length;++F)if(null==C.devices[F])return C.devices[F]=D,F;C.devices.push(D);return C.devices.length-1};C.untrack_device_by_index=function(D){for(C.devices[D]=null;0<C.devices.length;)if(null==C.devices[C.devices.length-1])C.devices.pop();else break};C.untrack_device=function(D){for(var F=0;F<C.devices.length;++F)if(C.devices[F]==D)return C.untrack_device_by_index(F)};C.get_device_by_index=function(D){return C.devices[D]};C.unlock_event_types=["touchend",
"click"];C.unlock=function(){for(var D=0;D<C.devices.length;++D){var F=C.devices[D];null!=F&&null!=F.S&&F.state===C.device_state.started&&F.S.resume().then(()=>{Ae(F.dc)},K=>{console.error("Failed to resume audiocontext",K)})}C.unlock_event_types.map(function(K){document.removeEventListener(K,C.unlock,!0)})};C.unlock_event_types.map(function(D){document.addEventListener(D,C.unlock,!0)})}window.miniaudio.referenceCount+=1;return 1},343595:()=>{"undefined"!==typeof window.miniaudio&&(window.miniaudio.unlock_event_types.map(function(d){document.removeEventListener(d,
window.miniaudio.unlock,!0)}),--window.miniaudio.referenceCount,0===window.miniaudio.referenceCount&&delete window.miniaudio)},343899:()=>void 0!==navigator.mediaDevices&&void 0!==navigator.mediaDevices.getUserMedia,344003:()=>{try{var d=new (window.AudioContext||window.webkitAudioContext),f=d.sampleRate;d.close();return f}catch(l){return 0}},344174:(d,f,l,r,z,C)=>{if("undefined"===typeof window.miniaudio)return-1;var D={},F={};d==window.miniaudio.device_type.playback&&0!=l&&(F.sampleRate=l);D.S=
new (window.AudioContext||window.webkitAudioContext)(F);D.S.suspend();D.state=window.miniaudio.device_state.stopped;l=0;d!=window.miniaudio.device_type.playback&&(l=f);D.$=D.S.createScriptProcessor(r,l,f);D.$.onaudioprocess=function(K){if(null==D.Oa||0==D.Oa.length)D.Oa=new Float32Array(Mb.buffer,z,r*f);if(d==window.miniaudio.device_type.capture||d==window.miniaudio.device_type.duplex){for(var P=0;P<f;P+=1)for(var X=K.inputBuffer.getChannelData(P),W=D.Oa,Y=0;Y<r;Y+=1)W[Y*f+P]=X[Y];Be(C,r,z)}if(d==
window.miniaudio.device_type.playback||d==window.miniaudio.device_type.duplex)for(Ce(C,r,z),P=0;P<K.outputBuffer.numberOfChannels;++P)for(X=K.outputBuffer.getChannelData(P),W=D.Oa,Y=0;Y<r;Y+=1)X[Y]=W[Y*f+P];else for(P=0;P<K.outputBuffer.numberOfChannels;++P)K.outputBuffer.getChannelData(P).fill(0)};d!=window.miniaudio.device_type.capture&&d!=window.miniaudio.device_type.duplex||navigator.mediaDevices.getUserMedia({audio:!0,video:!1}).then(function(K){D.Ya=D.S.createMediaStreamSource(K);D.Ya.connect(D.$);
D.$.connect(D.S.destination)}).catch(function(K){console.log("Failed to get user media: "+K)});d==window.miniaudio.device_type.playback&&D.$.connect(D.S.destination);D.dc=C;return window.miniaudio.track_device(D)},347051:d=>window.miniaudio.get_device_by_index(d).S.sampleRate,347124:d=>{d=window.miniaudio.get_device_by_index(d);void 0!==d.$&&(d.$.onaudioprocess=function(){},d.$.disconnect(),d.$=void 0);void 0!==d.Ya&&(d.Ya.disconnect(),d.Ya=void 0);d.S.close();d.S=void 0;d.dc=void 0},347524:d=>{window.miniaudio.untrack_device_by_index(d)},
347574:d=>{d=window.miniaudio.get_device_by_index(d);d.S.resume();d.state=window.miniaudio.device_state.started},347713:d=>{d=window.miniaudio.get_device_by_index(d);d.S.suspend();d.state=window.miniaudio.device_state.stopped}},Bc,ue,Ac,Ee,Fe,Ge,He,Ie,Je,Ke,Le,Me,Ne,Oe,Ae,Be,Ce,Pe,Qe,ec,ye,gc,Tb,kd,Se={__syscall_fcntl64:function(){return 0},__syscall_ioctl:function(){return 0},__syscall_openat:function(){},_abort_js:()=>Ub(""),_embind_create_inheriting_constructor:(d,f,l)=>{d=wc(d);f=Dc(f,"wrapper");
l=tc(l);var r=f.o,z=r.V,C=r.G.V,D=r.G.constructor;d=pc(d,function(...F){for(var K of r.G.ec)if(this[K]===C[K])throw new vc(`Pure virtual function ${K} must be implemented in JavaScript`);Object.defineProperty(this,"__parent",{value:z});this.__construct(...F)});z.__construct=function(...F){if(this===z)throw new sc("Pass correct 'this' to __construct");F=D.implement(this,...F);Ec(F);var K=F.m;F.notifyOnDestruction();K.na=!0;Object.defineProperties(this,{m:{value:K}});Gc(this);F=K.v;F=yc(r,F);if(xc.hasOwnProperty(F))throw new sc(`Tried to register registered instance: ${F}`);
xc[F]=this};z.__destruct=function(){if(this===z)throw new sc("Pass correct 'this' to __destruct");Ec(this);var F=this.m.v;F=yc(r,F);if(xc.hasOwnProperty(F))delete xc[F];else throw new sc(`Tried to unregister unregistered instance: ${F}`);};d.prototype=Object.create(z);Object.assign(d.prototype,l);return uc(d)},_embind_finalize_value_object:d=>{var f=Hc[d];delete Hc[d];var l=f.xb,r=f.X,z=f.Vb,C=z.map(D=>D.fd).concat(z.map(D=>D.ik));Oc([d],C,D=>{var F={},K,P;for([K,P]of z.entries()){const X=D[K],W=
P.dd,Y=P.ed,ba=D[K+z.length],fa=P.hk,pa=P.jk;F[P.Zc]={read:va=>X.u(W(Y,va)),write:(va,wa)=>{var ma=[];fa(pa,va,ba.F(ma,wa));Ic(ma)},optional:X.optional}}return[{name:f.name,u:X=>{var W={},Y;for(Y in F)W[Y]=F[Y].read(X);r(X);return W},F:(X,W)=>{for(var Y in F)if(!(Y in W||F[Y].optional))throw new TypeError(`Missing field: "${Y}"`);var ba=l();for(Y in F)F[Y].write(ba,W[Y]);null!==X&&X.push(r,ba);return ba},P:Jc,M:r}]})},_embind_register_bigint:()=>{},_embind_register_bool:(d,f,l,r)=>{f=wc(f);Nc(d,{name:f,
u:function(z){return!!z},F:function(z,C){return C?l:r},P:function(z){return this.u(Hb[z])},M:null})},_embind_register_class:(d,f,l,r,z,C,D,F,K,P,X,W,Y)=>{X=wc(X);C=nd(z,C);F&&=nd(D,F);P&&=nd(K,P);Y=nd(W,Y);var ba=Xc(X);Wc(ba,function(){pd(`Cannot construct ${X} due to unbound types`,[r])});Oc([d,f,l],r?[r]:[],fa=>{fa=fa[0];if(r){var pa=fa.o;var va=pa.V}else va=Tc.prototype;fa=pc(X,function(...Oa){if(Object.getPrototypeOf(this)!==wa)throw new sc(`Use 'new' to construct ${X}`);if(void 0===ma.ba)throw new sc(`${X} has no accessible constructor`);
var Ka=ma.ba[Oa.length];if(void 0===Ka)throw new sc(`Tried to invoke ctor of ${X} with invalid number of parameters (${Oa.length}) - expected (${Object.keys(ma.ba).toString()}) parameters instead!`);return Ka.apply(this,Oa)});var wa=Object.create(va,{constructor:{value:fa}});fa.prototype=wa;var ma=new Yc(X,fa,wa,Y,pa,C,F,P);if(ma.G){var ya;(ya=ma.G).Da??(ya.Da=[]);ma.G.Da.push(ma)}pa=new gd(X,ma,!0,!1,!1);ya=new gd(X+"*",ma,!1,!1,!1);va=new gd(X+" const*",ma,!1,!0,!1);Uc[d]={pointerType:ya,Oc:va};
hd(ba,fa);return[pa,ya,va]})},_embind_register_class_class_function:(d,f,l,r,z,C,D)=>{var F=sd(l,r);f=wc(f);f=td(f);C=nd(z,C);Oc([],[d],K=>{function P(){pd(`Cannot call ${X} due to unbound types`,F)}K=K[0];var X=`${K.name}.${f}`;f.startsWith("@@")&&(f=Symbol[f.substring(2)]);var W=K.o.constructor;void 0===W[f]?(P.Y=l-1,W[f]=P):(Vc(W,f,X),W[f].D[l-1]=P);Oc([],F,Y=>{Y=rd(X,[Y[0],null].concat(Y.slice(1)),null,C,D);void 0===W[f].D?(Y.Y=l-1,W[f]=Y):W[f].D[l-1]=Y;if(K.o.Da)for(const ba of K.o.Da)ba.constructor.hasOwnProperty(f)||
(ba.constructor[f]=Y);return[]});return[]})},_embind_register_class_class_property:(d,f,l,r,z,C,D,F)=>{f=wc(f);C=nd(z,C);Oc([],[d],K=>{K=K[0];var P=`${K.name}.${f}`,X={get(){pd(`Cannot access ${P} due to unbound types`,[l])},enumerable:!0,configurable:!0};X.set=F?()=>{pd(`Cannot access ${P} due to unbound types`,[l])}:()=>{throw new sc(`${P} is a read-only property`);};Object.defineProperty(K.o.constructor,f,X);Oc([],[l],W=>{W=W[0];var Y={get(){return W.u(C(r))},enumerable:!0};F&&(F=nd(D,F),Y.set=
ba=>{var fa=[];F(r,W.F(fa,ba));Ic(fa)});Object.defineProperty(K.o.constructor,f,Y);return[]});return[]})},_embind_register_class_constructor:(d,f,l,r,z,C)=>{var D=sd(f,l);z=nd(r,z);Oc([],[d],F=>{F=F[0];var K=`constructor ${F.name}`;void 0===F.o.ba&&(F.o.ba=[]);if(void 0!==F.o.ba[f-1])throw new sc(`Cannot register multiple constructors with identical number of parameters (${f-1}) for class '${F.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`);
F.o.ba[f-1]=()=>{pd(`Cannot construct ${F.name} due to unbound types`,D)};Oc([],D,P=>{P.splice(1,0,null);F.o.ba[f-1]=rd(K,P,null,z,C);return[]});return[]})},_embind_register_class_function:(d,f,l,r,z,C,D,F)=>{var K=sd(l,r);f=wc(f);f=td(f);C=nd(z,C);Oc([],[d],P=>{function X(){pd(`Cannot call ${W} due to unbound types`,K)}P=P[0];var W=`${P.name}.${f}`;f.startsWith("@@")&&(f=Symbol[f.substring(2)]);F&&P.o.ec.push(f);var Y=P.o.V,ba=Y[f];void 0===ba||void 0===ba.D&&ba.className!==P.name&&ba.Y===l-2?(X.Y=
l-2,X.className=P.name,Y[f]=X):(Vc(Y,f,W),Y[f].D[l-2]=X);Oc([],K,fa=>{fa=rd(W,fa,P,C,D);void 0===Y[f].D?(fa.Y=l-2,Y[f]=fa):Y[f].D[l-2]=fa;return[]});return[]})},_embind_register_class_property:(d,f,l,r,z,C,D,F,K,P)=>{f=wc(f);z=nd(r,z);Oc([],[d],X=>{X=X[0];var W=`${X.name}.${f}`,Y={get(){pd(`Cannot access ${W} due to unbound types`,[l,D])},enumerable:!0,configurable:!0};Y.set=K?()=>pd(`Cannot access ${W} due to unbound types`,[l,D]):()=>{throw new sc(W+" is a read-only property");};Object.defineProperty(X.o.V,
f,Y);Oc([],K?[l,D]:[l],ba=>{var fa=ba[0],pa={get(){var wa=ud(this,X,W+" getter");return fa.u(z(C,wa))},enumerable:!0};if(K){K=nd(F,K);var va=ba[1];pa.set=function(wa){var ma=ud(this,X,W+" setter"),ya=[];K(P,ma,va.F(ya,wa));Ic(ya)}}Object.defineProperty(X.o.V,f,pa);return[]});return[]})},_embind_register_emval:d=>Nc(d,wd),_embind_register_enum:(d,f,l,r,z)=>{f=wc(f);z=0===z?"object":1===z?"number":"string";switch(z){case "object":function D(){}D.values={};Nc(d,{name:f,constructor:D,valueType:z,u:function(F){return this.constructor.values[F]},
F:(F,K)=>K.value,P:xd(f,l,r),M:null});Wc(f,D);break;case "number":var C={};Nc(d,{name:f,rb:C,valueType:z,u:F=>F,F:(F,K)=>K,P:xd(f,l,r),M:null});Wc(f,C);delete G[f].Y;break;case "string":C={},Nc(d,{name:f,rc:{},kc:{},rb:C,valueType:z,u:function(F){return this.kc[F]},F:function(F,K){return this.rc[K]},P:xd(f,l,r),M:null}),Wc(f,C),delete G[f].Y}},_embind_register_enum_value:(d,f,l)=>{var r=Dc(d,"enum");f=wc(f);switch(r.valueType){case "object":d=r.constructor;r=Object.create(r.constructor.prototype,
{value:{value:l},constructor:{value:pc(`${r.name}_${f}`,function(){})}});d.values[l]=r;d[f]=r;break;case "number":r.rb[f]=l;break;case "string":r.rc[f]=l,r.kc[l]=f,r.rb[f]=f}},_embind_register_float:(d,f,l)=>{f=wc(f);Nc(d,{name:f,u:r=>r,F:(r,z)=>z,P:yd(f,l),M:null})},_embind_register_function:(d,f,l,r,z,C)=>{var D=sd(f,l);d=wc(d);d=td(d);z=nd(r,z);Wc(d,function(){pd(`Cannot call ${d} due to unbound types`,D)},f-1);Oc([],D,F=>{hd(d,rd(d,[F[0],null].concat(F.slice(1)),null,z,C),f-1);return[]})},_embind_register_integer:(d,
f,l,r,z)=>{f=wc(f);let C=F=>F;if(0===r){var D=32-8*l;C=F=>F<<D>>>D;z=C(z)}Nc(d,{name:f,u:C,F:(F,K)=>K,P:zd(f,l,0!==r),M:null})},_embind_register_memory_view:(d,f,l)=>{function r(C){return new z(Gb.buffer,Lb[C+4>>2],Lb[C>>2])}var z=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array][f];l=wc(l);Nc(d,{name:l,u:r,P:r},{ld:!0})},_embind_register_std_string:(d,f)=>{f=wc(f);Nc(d,{name:f,u(l){var r=(r=l+4)?oc(Hb,r,Lb[l>>2],!0):"";Bc(l);return r},F(l,r){r instanceof
ArrayBuffer&&(r=new Uint8Array(r));var z="string"==typeof r;if(!(z||ArrayBuffer.isView(r)&&1==r.BYTES_PER_ELEMENT))throw new sc("Cannot pass non-string to std::string");var C=z?Bd(r):r.length;var D=ue(4+C+1),F=D+4;Lb[D>>2]=C;z?Ad(r,F,C+1):Hb.set(r,F);null!==l&&l.push(Bc,D);return D},P:Jc,M(l){Bc(l)}})},_embind_register_std_wstring:(d,f,l)=>{l=wc(l);if(2===f){var r=Dd;var z=Ed;var C=Fd}else r=Gd,z=Hd,C=Id;Nc(d,{name:l,u:D=>{var F=r(D+4,Lb[D>>2]*f,!0);Bc(D);return F},F:(D,F)=>{if("string"!=typeof F)throw new sc(`Cannot pass non-string to C++ string type ${l}`);
var K=C(F),P=ue(4+K+f);Lb[P>>2]=K/f;z(F,P+4,K+f);null!==D&&D.push(Bc,P);return P},P:Jc,M(D){Bc(D)}})},_embind_register_value_object:(d,f,l,r,z,C)=>{Hc[d]={name:wc(f),xb:nd(l,r),X:nd(z,C),Vb:[]}},_embind_register_value_object_field:(d,f,l,r,z,C,D,F,K,P)=>{Hc[d].Vb.push({Zc:wc(f),fd:l,dd:nd(r,z),ed:C,ik:D,hk:nd(F,K),jk:P})},_embind_register_void:(d,f)=>{f=wc(f);Nc(d,{nd:!0,name:f,u:()=>{},F:()=>{}})},_emscripten_throw_longjmp:()=>{throw Infinity;},_emval_create_invoker:(d,f,l)=>{var [r,...z]=Ld(d,f),
C=r.F.bind(r),D=z.map(K=>K.P.bind(K));d--;var F=Array(d);f=`methodCaller<(${z.map(K=>K.name)}) => ${r.name}>`;return Kd(pc(f,(K,P,X,W)=>{for(var Y=0,ba=0;ba<d;++ba)F[ba]=D[ba](W+Y),Y+=8;switch(l){case 0:var fa=tc(K).apply(null,F);break;case 2:fa=Reflect.construct(tc(K),F);break;case 3:fa=F[0];break;case 1:fa=tc(K)[Nd(P)](...F)}K=[];fa=C(K,fa);K.length&&(Lb[X>>2]=uc(K));return fa}))},_emval_decref:vd,_emval_get_module_property:d=>{d=Nd(d);return uc(G[d])},_emval_get_property:(d,f)=>{d=tc(d);f=tc(f);
return uc(d[f])},_emval_incref:d=>{9<d&&(rc[d+1]+=1)},_emval_invoke:(d,f,l,r,z)=>Jd[d](f,l,r,z),_emval_new_array:()=>uc([]),_emval_new_cstring:d=>uc(Nd(d)),_emval_new_object:()=>uc({}),_emval_run_destructors:d=>{var f=tc(d);Ic(f);vd(d)},_emval_set_property:(d,f,l)=>{d=tc(d);f=tc(f);l=tc(l);d[f]=l},_gmtime_js:function(d,f,l){d=new Date(1E3*(f+2097152>>>0<4194305-!!d?(d>>>0)+4294967296*f:NaN));Kb[l>>2]=d.getUTCSeconds();Kb[l+4>>2]=d.getUTCMinutes();Kb[l+8>>2]=d.getUTCHours();Kb[l+12>>2]=d.getUTCDate();
Kb[l+16>>2]=d.getUTCMonth();Kb[l+20>>2]=d.getUTCFullYear()-1900;Kb[l+24>>2]=d.getUTCDay();Kb[l+28>>2]=(d.getTime()-Date.UTC(d.getUTCFullYear(),0,1,0,0,0,0))/864E5|0},_localtime_js:function(d,f,l){d=new Date(1E3*(f+2097152>>>0<4194305-!!d?(d>>>0)+4294967296*f:NaN));Kb[l>>2]=d.getSeconds();Kb[l+4>>2]=d.getMinutes();Kb[l+8>>2]=d.getHours();Kb[l+12>>2]=d.getDate();Kb[l+16>>2]=d.getMonth();Kb[l+20>>2]=d.getFullYear()-1900;Kb[l+24>>2]=d.getDay();f=d.getFullYear();Kb[l+28>>2]=(0!==f%4||0===f%100&&0!==f%
400?Pd:Od)[d.getMonth()]+d.getDate()-1|0;Kb[l+36>>2]=-(60*d.getTimezoneOffset());f=(new Date(d.getFullYear(),6,1)).getTimezoneOffset();var r=(new Date(d.getFullYear(),0,1)).getTimezoneOffset();Kb[l+32>>2]=(f!=r&&d.getTimezoneOffset()==Math.min(r,f))|0},_timegm_js:function(d){var f=new Date(Date.UTC(Kb[d+20>>2]+1900,Kb[d+16>>2],Kb[d+12>>2],Kb[d+8>>2],Kb[d+4>>2],Kb[d>>2],0));Kb[d+24>>2]=f.getUTCDay();Kb[d+28>>2]=(f.getTime()-Date.UTC(f.getUTCFullYear(),0,1,0,0,0,0))/864E5|0;d=f.getTime()/1E3;Qe((Zb=
d,1<=+Math.abs(Zb)?0<Zb?+Math.floor(Zb/4294967296)>>>0:~~+Math.ceil((Zb-+(~~Zb>>>0))/4294967296)>>>0:0));return d>>>0},_tzset_js:(d,f,l,r)=>{var z=(new Date).getFullYear(),C=(new Date(z,0,1)).getTimezoneOffset();z=(new Date(z,6,1)).getTimezoneOffset();Lb[d>>2]=60*Math.max(C,z);Kb[f>>2]=Number(C!=z);f=D=>{var F=Math.abs(D);return`UTC${0<=D?"-":"+"}${String(Math.floor(F/60)).padStart(2,"0")}${String(F%60).padStart(2,"0")}`};d=f(C);f=f(z);z<C?(Ad(d,l,17),Ad(f,r,17)):(Ad(d,r,17),Ad(f,l,17))},beginPixelLocalStorageWEBGL:function(d,
f,l){(d=de[d].I.Wa)&&d.beginPixelLocalStorageWEBGL(new Uint32Array(Tb.buffer,4*l,f))},clock_time_get:function(d,f,l,r){if(!(0<=d&&3>=d))return 28;d=Math.round(1E6*(0===d?Date.now():performance.now()));$b=[d>>>0,(Zb=d,1<=+Math.abs(Zb)?0<Zb?+Math.floor(Zb/4294967296)>>>0:~~+Math.ceil((Zb-+(~~Zb>>>0))/4294967296)>>>0:0)];Kb[r>>2]=$b[0];Kb[r+4>>2]=$b[1];return 0},decode_image:function(d,f,l){var r=G.images;r||(r=new Map,G.images=r);var z=new Image;r.set(d,z);f=G.HEAP8.subarray(f,f+l);l=new Uint8Array(l);
l.set(f);z.src=URL.createObjectURL(new Blob([l],{type:"image/png"}));z.onload=function(){G._setWebImage(d,z.width,z.height)}},delete_image:function(d){var f=G.images;f&&f.get(d)&&f.delete(d)},emscripten_asm_const_int:(d,f,l)=>{Qd.length=0;for(var r;r=Hb[f++];){var z=105!=r;z&=112!=r;l+=z&&l%8?4:0;Qd.push(112==r?Lb[l>>2]:105==r?Kb[l>>2]:Nb[l>>3]);l+=z?8:4}return De[d](...Qd)},emscripten_date_now:()=>Date.now(),emscripten_get_now:()=>performance.now(),emscripten_is_main_browser_thread:()=>!na,emscripten_resize_heap:d=>
{var f=Hb.length;d>>>=0;if(2147483648<d)return!1;for(var l=1;4>=l;l*=2){var r=f*(1+.2/l);r=Math.min(r,d+100663296);a:{r=(Math.min(2147483648,65536*Math.ceil(Math.max(d,r)/65536))-Tb.buffer.byteLength+65535)/65536|0;try{Tb.grow(r);Pb();var z=1;break a}catch(C){}z=void 0}if(z)return!0}return!1},emscripten_webgl_enable_extension:(d,f)=>{d=de[d];f=f?oc(Hb,f):"";f.startsWith("GL_")&&(f=f.slice(3));"WEBGL_draw_instanced_base_vertex_base_instance"==f&&Rd(O);"WEBGL_multi_draw_instanced_base_vertex_base_instance"==
f&&Sd(O);"WEBGL_multi_draw"==f&&(O.sd=O.getExtension("WEBGL_multi_draw"));"EXT_polygon_offset_clamp"==f&&(O.Xc=O.getExtension("EXT_polygon_offset_clamp"));"EXT_clip_control"==f&&(O.Wc=O.getExtension("EXT_clip_control"));"WEBGL_polygon_mode"==f&&(O.pk=O.getExtension("WEBGL_polygon_mode"));return!!d.I.getExtension(f)},emscripten_webgl_get_current_context:()=>me?me.handle:0,emscripten_webgl_make_context_current:d=>db(d)?0:-5,enable_WEBGL_provoking_vertex:function(d){d=de[d].I;d.fc=d.getExtension("WEBGL_provoking_vertex");
return!!d.fc},enable_WEBGL_shader_pixel_local_storage_coherent:function(d){d=de[d].I;const f=d.getExtension("WEBGL_shader_pixel_local_storage");if(f&&f.isCoherent()){if(5==f.framebufferTexturePixelLocalStorageWEBGL.length)return d.Wa=f,!0;console.warn("WEBGL_shader_pixel_local_storage is advertised, but a deprecated version has been detected. Disabling.")}return!1},endPixelLocalStorageWEBGL:function(d,f,l){(d=de[d].I.Wa)&&d.endPixelLocalStorageWEBGL(new Uint32Array(Tb.buffer,4*l,f))},ensure_images_map:function(){G.images||
(G.images=new Map)},environ_get:(d,f)=>{var l=0,r=0,z;for(z of pe()){var C=f+l;Lb[d+r>>2]=C;l+=Ad(z,C,Infinity)+1;r+=4}return 0},environ_sizes_get:(d,f)=>{var l=pe();Lb[d>>2]=l.length;d=0;for(var r of l)d+=Bd(r)+1;Lb[f>>2]=d;return 0},fd_close:()=>52,fd_read:()=>52,fd_seek:function(){return 70},fd_write:(d,f,l,r)=>{for(var z=0,C=0;C<l;C++){var D=Lb[f>>2],F=Lb[f+4>>2];f+=8;for(var K=0;K<F;K++){var P=d,X=Hb[D+K],W=qe[P];0===X||10===X?((1===P?Ab:Bb)(oc(W)),W.length=0):W.push(X)}z+=F}Lb[r>>2]=z;return 0},
framebufferPixelLocalClearValuefvWEBGL:function(d,f,l,r,z,C){(d=de[d].I.Wa)&&d.framebufferPixelLocalClearValuefvWEBGL(f,[l,r,z,C])},framebufferTexturePixelLocalStorageWEBGL:function(d,f,l,r,z,C){(d=de[d].I.Wa)&&d.framebufferTexturePixelLocalStorageWEBGL(f,Zd[l],r,z,C)},glActiveTexture:d=>O.activeTexture(d),glAttachShader:(d,f)=>{O.attachShader(Wd[d],$d[f])},glBindBuffer:(d,f)=>{35051==d?O.lb=f:35052==d&&(O.Ma=f);O.bindBuffer(d,Vd[f])},glBindBufferRange:(d,f,l,r,z)=>{O.bindBufferRange(d,f,Vd[l],r,
z)},glBindFramebuffer:(d,f)=>{O.bindFramebuffer(d,Xd[f])},glBindRenderbuffer:(d,f)=>{O.bindRenderbuffer(d,Yd[f])},glBindSampler:(d,f)=>{O.bindSampler(d,ee[f])},glBindTexture:(d,f)=>{O.bindTexture(d,Zd[f])},glBindVertexArray:d=>{O.bindVertexArray(ce[d])},glBlendEquation:d=>O.blendEquation(d),glBlendFunc:(d,f)=>O.blendFunc(d,f),glBlitFramebuffer:(d,f,l,r,z,C,D,F,K,P)=>O.blitFramebuffer(d,f,l,r,z,C,D,F,K,P),glBufferData:(d,f,l,r)=>{l&&f?O.bufferData(d,Hb,r,l,f):O.bufferData(d,f,r)},glBufferSubData:(d,
f,l,r)=>{l&&O.bufferSubData(d,f,Hb,r,l)},glClear:d=>O.clear(d),glClearBufferfv:(d,f,l)=>{O.clearBufferfv(d,f,Mb,l>>2)},glClearBufferuiv:(d,f,l)=>{O.clearBufferuiv(d,f,Lb,l>>2)},glClearColor:(d,f,l,r)=>O.clearColor(d,f,l,r),glClearDepthf:d=>O.clearDepth(d),glClearStencil:d=>O.clearStencil(d),glClientWaitSync:(d,f,l,r)=>O.clientWaitSync(fe[d],f,(l>>>0)+4294967296*r),glColorMask:(d,f,l,r)=>{O.colorMask(!!d,!!f,!!l,!!r)},glCompileShader:d=>{O.compileShader($d[d])},glCompressedTexSubImage2D:(d,f,l,r,z,
C,D,F,K)=>{O.Ma||!F?O.compressedTexSubImage2D(d,f,l,r,z,C,D,F,K):O.compressedTexSubImage2D(d,f,l,r,z,C,D,Hb,K,F)},glCreateProgram:()=>{var d=je(Wd),f=O.createProgram();f.name=d;f.Ua=f.Sa=f.Ta=0;f.Eb=1;Wd[d]=f;return d},glCreateShader:d=>{var f=je($d);$d[f]=O.createShader(d);return f},glCullFace:d=>O.cullFace(d),glDeleteBuffers:(d,f)=>{for(var l=0;l<d;l++){var r=Kb[f+4*l>>2],z=Vd[r];z&&(O.deleteBuffer(z),z.name=0,Vd[r]=null,r==O.lb&&(O.lb=0),r==O.Ma&&(O.Ma=0))}},glDeleteFramebuffers:(d,f)=>{for(var l=
0;l<d;++l){var r=Kb[f+4*l>>2],z=Xd[r];z&&(O.deleteFramebuffer(z),z.name=0,Xd[r]=null)}},glDeleteProgram:d=>{if(d){var f=Wd[d];f?(O.deleteProgram(f),f.name=0,Wd[d]=null):ke||=1281}},glDeleteRenderbuffers:(d,f)=>{for(var l=0;l<d;l++){var r=Kb[f+4*l>>2],z=Yd[r];z&&(O.deleteRenderbuffer(z),z.name=0,Yd[r]=null)}},glDeleteShader:d=>{if(d){var f=$d[d];f?(O.deleteShader(f),$d[d]=null):ke||=1281}},glDeleteSync:d=>{if(d){var f=fe[d];f?(O.deleteSync(f),f.name=0,fe[d]=null):ke||=1281}},glDeleteTextures:(d,f)=>
{for(var l=0;l<d;l++){var r=Kb[f+4*l>>2],z=Zd[r];z&&(O.deleteTexture(z),z.name=0,Zd[r]=null)}},glDeleteVertexArrays:(d,f)=>{for(var l=0;l<d;l++){var r=Kb[f+4*l>>2];O.deleteVertexArray(ce[r]);ce[r]=null}},glDepthFunc:d=>O.depthFunc(d),glDepthMask:d=>{O.depthMask(!!d)},glDepthRangef:(d,f)=>O.depthRange(d,f),glDisable:d=>O.disable(d),glDrawArrays:(d,f,l)=>{O.drawArrays(d,f,l)},glDrawArraysInstanced:(d,f,l,r)=>{O.drawArraysInstanced(d,f,l,r)},glDrawBuffers:(d,f)=>{for(var l=re[d],r=0;r<d;r++)l[r]=Kb[f+
4*r>>2];O.drawBuffers(l)},glDrawElements:(d,f,l,r)=>{O.drawElements(d,f,l,r)},glDrawElementsInstanced:(d,f,l,r,z)=>{O.drawElementsInstanced(d,f,l,r,z)},glEnable:d=>O.enable(d),glEnableVertexAttribArray:d=>{O.enableVertexAttribArray(d)},glFenceSync:(d,f)=>(d=O.fenceSync(d,f))?(f=je(fe),d.name=f,fe[f]=d,f):0,glFlush:()=>O.flush(),glFramebufferRenderbuffer:(d,f,l,r)=>{O.framebufferRenderbuffer(d,f,l,Yd[r])},glFramebufferTexture2D:(d,f,l,r,z)=>{O.framebufferTexture2D(d,f,l,Zd[r],z)},glFrontFace:d=>O.frontFace(d),
glGenBuffers:(d,f)=>{le(d,f,"createBuffer",Vd)},glGenFramebuffers:(d,f)=>{le(d,f,"createFramebuffer",Xd)},glGenRenderbuffers:(d,f)=>{le(d,f,"createRenderbuffer",Yd)},glGenTextures:(d,f)=>{le(d,f,"createTexture",Zd)},glGenVertexArrays:(d,f)=>{le(d,f,"createVertexArray",ce)},glGenerateMipmap:d=>O.generateMipmap(d),glGetFramebufferAttachmentParameteriv:(d,f,l,r)=>{d=O.getFramebufferAttachmentParameter(d,f,l);if(d instanceof WebGLRenderbuffer||d instanceof WebGLTexture)d=d.name|0;Kb[r>>2]=d},glGetIntegerv:(d,
f)=>te(d,f),glGetProgramiv:(d,f,l)=>{if(l)if(d>=Ud)ke||=1281;else if(d=Wd[d],35716==f)d=O.getProgramInfoLog(d),null===d&&(d="(unknown error)"),Kb[l>>2]=d.length+1;else if(35719==f){if(!d.Ua){var r=O.getProgramParameter(d,35718);for(f=0;f<r;++f)d.Ua=Math.max(d.Ua,O.getActiveUniform(d,f).name.length+1)}Kb[l>>2]=d.Ua}else if(35722==f){if(!d.Sa)for(r=O.getProgramParameter(d,35721),f=0;f<r;++f)d.Sa=Math.max(d.Sa,O.getActiveAttrib(d,f).name.length+1);Kb[l>>2]=d.Sa}else if(35381==f){if(!d.Ta)for(r=O.getProgramParameter(d,
35382),f=0;f<r;++f)d.Ta=Math.max(d.Ta,O.getActiveUniformBlockName(d,f).length+1);Kb[l>>2]=d.Ta}else Kb[l>>2]=O.getProgramParameter(d,f);else ke||=1281},glGetString:d=>{var f=ge[d];if(!f){switch(d){case 7939:f=ve(se().join(" "));break;case 7936:case 7937:case 37445:case 37446:(f=O.getParameter(d))||(ke||=1280);f=f?ve(f):0;break;case 7938:f=ve(`OpenGL ES 3.0 (${O.getParameter(7938)})`);break;case 35724:f=O.getParameter(35724);var l=f.match(/^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/);null!==l&&(3==
l[1].length&&(l[1]+="0"),f=`OpenGL ES GLSL ES ${l[1]} (${f})`);f=ve(f);break;default:ke||=1280}ge[d]=f}return f},glGetUniformBlockIndex:(d,f)=>O.getUniformBlockIndex(Wd[d],f?oc(Hb,f):""),glGetUniformLocation:(d,f)=>{f=f?oc(Hb,f):"";if(d=Wd[d]){var l=d,r=l.Aa,z=l.qc,C;if(!r){l.Aa=r={};l.pc={};var D=O.getProgramParameter(l,35718);for(C=0;C<D;++C){var F=O.getActiveUniform(l,C);var K=F.name;F=F.size;var P=we(K);P=0<P?K.slice(0,P):K;var X=l.Eb;l.Eb+=F;z[P]=[F,X];for(K=0;K<F;++K)r[X]=K,l.pc[X++]=P}}l=d.Aa;
r=0;z=f;C=we(f);0<C&&(r=parseInt(f.slice(C+1))>>>0,z=f.slice(0,C));if((z=d.qc[z])&&r<z[0]&&(r+=z[1],l[r]=l[r]||O.getUniformLocation(d,f)))return r}else ke||=1281;return-1},glInvalidateFramebuffer:(d,f,l)=>{for(var r=re[f],z=0;z<f;z++)r[z]=Kb[l+4*z>>2];O.invalidateFramebuffer(d,r)},glLinkProgram:d=>{d=Wd[d];O.linkProgram(d);d.Aa=0;d.qc={}},glPixelStorei:(d,f)=>{3317==d?he=f:3314==d&&(ie=f);O.pixelStorei(d,f)},glReadPixels:(d,f,l,r,z,C,D)=>{if(O.lb)O.readPixels(d,f,l,r,z,C,D);else{var F=xe(C);D>>>=
31-Math.clz32(F.BYTES_PER_ELEMENT);O.readPixels(d,f,l,r,z,C,F,D)}},glRenderbufferStorage:(d,f,l,r)=>O.renderbufferStorage(d,f,l,r),glRenderbufferStorageMultisample:(d,f,l,r,z)=>O.renderbufferStorageMultisample(d,f,l,r,z),glScissor:(d,f,l,r)=>O.scissor(d,f,l,r),glShaderSource:(d,f,l,r)=>{for(var z="",C=0;C<f;++C){var D=(D=Lb[l+4*C>>2])?oc(Hb,D,r?Lb[r+4*C>>2]:void 0):"";z+=D}O.shaderSource($d[d],z)},glStencilFunc:(d,f,l)=>O.stencilFunc(d,f,l),glStencilFuncSeparate:(d,f,l,r)=>O.stencilFuncSeparate(d,
f,l,r),glStencilMask:d=>O.stencilMask(d),glStencilOp:(d,f,l)=>O.stencilOp(d,f,l),glStencilOpSeparate:(d,f,l,r)=>O.stencilOpSeparate(d,f,l,r),glTexParameteri:(d,f,l)=>O.texParameteri(d,f,l),glTexStorage2D:(d,f,l,r,z)=>O.texStorage2D(d,f,l,r,z),glTexStorage3D:(d,f,l,r,z,C)=>O.texStorage3D(d,f,l,r,z,C),glTexSubImage2D:(d,f,l,r,z,C,D,F,K)=>{if(O.Ma)O.texSubImage2D(d,f,l,r,z,C,D,F,K);else if(K){var P=xe(F);O.texSubImage2D(d,f,l,r,z,C,D,F,P,K>>>31-Math.clz32(P.BYTES_PER_ELEMENT))}else{if(K){P=xe(F);var X=
C*((ie||z)*({5:3,6:4,8:2,29502:3,29504:4,26917:2,26918:2,29846:3,29847:4}[D-6402]||1)*P.BYTES_PER_ELEMENT+he-1&-he);K=P.subarray(K>>>31-Math.clz32(P.BYTES_PER_ELEMENT),K+X>>>31-Math.clz32(P.BYTES_PER_ELEMENT))}else K=null;O.texSubImage2D(d,f,l,r,z,C,D,F,K)}},glUniform1i:(d,f)=>{var l=O,r=l.uniform1i;var z=O.Rc;if(z){var C=z.Aa[d];"number"==typeof C&&(z.Aa[d]=C=O.getUniformLocation(z,z.pc[d]+(0<C?`[${C}]`:"")));d=C}else ke||=1282,d=void 0;r.call(l,d,f)},glUniformBlockBinding:(d,f,l)=>{d=Wd[d];O.uniformBlockBinding(d,
f,l)},glUseProgram:d=>{d=Wd[d];O.useProgram(d);O.Rc=d},glVertexAttribDivisor:(d,f)=>{O.vertexAttribDivisor(d,f)},glVertexAttribIPointer:(d,f,l,r,z)=>{O.vertexAttribIPointer(d,f,l,r,z)},glVertexAttribPointer:(d,f,l,r,z,C)=>{O.vertexAttribPointer(d,f,l,!!r,z,C)},glViewport:(d,f,l,r)=>O.viewport(d,f,l,r),invoke_vii:Re,isWindowsBrowser:function(){return-1<navigator.platform.indexOf("Win")},provokingVertexWEBGL:function(d,f){(d=de[d].I.fc)&&d.provokingVertexWEBGL(f)},riveWebAttach:function(){const d=G.riveScripting;
if(!d)return 0;const f=(l,r)=>{l=ve(l);r(l);Bc(l)};d.Gc({exports:G,jd:l=>{l=Lb[(Le()>>2)+l];return 0===l?void 0:kd.get(l)},ca:()=>Hb,Xb:()=>Nb,za:hc,Xa:ze,ya:fc,tb:ue,ma:Bc,Ca:l=>l?oc(Hb,l):"",tc:(l,r,z)=>Ad(l,r,z),memory:()=>Tb,yd:(l,r,z)=>f(z,C=>G._rive_web_processor_event(l,r,C)),sb:(l,r)=>f(r,z=>Je(l,z)),od:(l,r)=>f(r,z=>Ie(l,z)),pd:l=>{l=Ke(l);return 0===l?null:l?oc(Hb,l):""}});return 1},riveWebAudioRefusal:function(){const d=G.riveScripting.audioRefusal();return null===d?0:ve(d)},riveWebCall:function(d,
f,l,r,z,C,D){return G.riveScripting.call(d,f,l,r,z,C,D)},riveWebHasExport:function(d,f){return G.riveScripting.gd(d,f)},riveWebJobRun:function(d,f,l,r,z,C,D,F,K){d=G.riveScripting.runJob(d,f,()=>Hb.slice(l,l+r),z,Hb.slice(C,C+D),()=>Atomics.load(Kb,F>>2));if(!d.ok)return ve(d.error);K=He(K,d.output.length);Hb.set(d.output,K);return 0},riveWebMemoryPages:function(d){return G.riveScripting.vd(d)},riveWebPreparing:function(d){return G.riveScripting.fa(d)},riveWebRaise:function(d,f){G.riveScripting.zd(d,
f)},riveWebReadMemory:function(d,f,l,r){return G.riveScripting.read(d,f>>>0,l,r>>>0)},riveWebRegister:function(d,f,l){G.riveScripting.register(d,Hb.subarray(f,f+l))},riveWebRelease:function(d){G.riveScripting?.release(d)},riveWebStart:function(d){d=G.riveScripting.start(d);return null===d?0:ve(d)},riveWebStringLength:function(d,f){return G.riveScripting.mk(d,f>>>0)},riveWebWorkerCollect:function(d){d=G.riveScripting.workerCollect(d);return null===d?0:ve(d)},riveWebWorkerEnd:function(d){G.riveScripting.workerEnd(d)},
riveWebWorkerStart:function(d,f,l,r,z,C,D,F,K,P){let X=!1;f=G.riveScripting.workerStart(f,l,()=>Hb.slice(r,r+z),C,Hb.slice(D,D+F),{wait:(W,Y,ba)=>Me(d,W,Y,ba),finished:(W,Y)=>{if(!X){X=!0;if(W){const ba=He(K,Y.length);Hb.set(Y,ba)}Ne(d,W)}},lk:()=>Oe(d)});if(!f.ok)return ve(f.error);Lb[P>>2]=f.id;return 0},riveWebWorkerWake:function(d,f,l){d=G.riveScripting.workerWake(d,f,l);return null===d?0:ve(d)},riveWebWriteMemory:function(d,f,l,r){return G.riveScripting.write(d,f>>>0,l,r>>>0)},upload_image:function(d,
f){var l=G.images;l&&(f=l.get(f))&&(d=de[d].I,d.pixelStorei(d.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),d.texImage2D(d.TEXTURE_2D,0,d.RGBA,d.RGBA,d.UNSIGNED_BYTE,f),d.pixelStorei(d.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1))},wasm_start_image_decode:function(d,f,l){f=new Uint8Array(Tb.buffer,f,l);var r=new Uint8Array(l);r.set(f);Promise.resolve().then(function(){return createImageBitmap(new Blob([r]))}).then(function(z){var C=(new OffscreenCanvas(z.width,z.height)).getContext("2d");C.drawImage(z,0,0);C=C.getImageData(0,
0,z.width,z.height);var D=C.data.length,F=Ee(D);F?((new Uint8Array(Tb.buffer,F,D)).set(C.data),Fe(d,z.width,z.height,F,D)):Ge(d)}).catch(function(){Ge(d)})}};function Re(d,f,l){var r=gc();try{kd.get(d)(f,l)}catch(z){ec(r);if(z!==z+0)throw z;Pe(1,0)}}var Te;
Te=await (async function(){function d(l){l=Te=l.exports;Bc=l.free;ue=l.malloc;G._setWebImage=l.setWebImage;Ac=l.__getTypeName;Ee=G._wasm_image_decode_alloc=l.wasm_image_decode_alloc;Fe=G._wasm_image_decode_complete=l.wasm_image_decode_complete;Ge=G._wasm_image_decode_error=l.wasm_image_decode_error;G._rive_web_vm_module_export=l.rive_web_vm_module_export;G._rive_web_vm_frame_boundary=l.rive_web_vm_frame_boundary;He=G._rive_web_job_output=l.rive_web_job_output;Ie=G._rive_web_lane_fail=l.rive_web_lane_fail;
Je=G._rive_web_lane_log=l.rive_web_lane_log;Ke=G._rive_web_lane_fuel=l.rive_web_lane_fuel;G._rive_web_vm_booting=l.rive_web_vm_booting;G._rive_web_vm_start_fuel=l.rive_web_vm_start_fuel;G._rive_web_vm_start_refusal=l.rive_web_vm_start_refusal;Le=G._rive_web_calls=l.rive_web_calls;Me=G._rive_web_worker_wait=l.rive_web_worker_wait;Ne=G._rive_web_worker_finished=l.rive_web_worker_finished;Oe=G._rive_web_worker_stopping=l.rive_web_worker_stopping;Ae=G._ma_device__on_notification_unlocked=l.ma_device__on_notification_unlocked;
G._ma_malloc_emscripten=l.ma_malloc_emscripten;G._ma_free_emscripten=l.ma_free_emscripten;Be=G._ma_device_process_pcm_frames_capture__webaudio=l.ma_device_process_pcm_frames_capture__webaudio;Ce=G._ma_device_process_pcm_frames_playback__webaudio=l.ma_device_process_pcm_frames_playback__webaudio;Pe=l.setThrew;Qe=l._emscripten_tempret_set;ec=l._emscripten_stack_restore;ye=l._emscripten_stack_alloc;gc=l.emscripten_stack_get_current;jd.vij=l.dynCall_vij;jd.iij=l.dynCall_iij;jd.ji=l.dynCall_ji;jd.iiiji=
l.dynCall_iiiji;jd.iiji=l.dynCall_iiji;jd.jii=l.dynCall_jii;jd.vijj=l.dynCall_vijj;jd.jiji=l.dynCall_jiji;Tb=l.memory;kd=l.__indirect_function_table;Pb();return Te}var f={env:Se,wasi_snapshot_preview1:Se};if(G.instantiateWasm)return new Promise(l=>{G.instantiateWasm(f,(r,z)=>{l(d(r,z))})});Vb??=G.locateFile?G.locateFile("canvas_advanced.wasm",rb):rb+"canvas_advanced.wasm";return d((await Yb(f)).instance)}());
(function(){function d(){G.calledRun=!0;if(!Db){Ob=!0;Te.__wasm_call_ctors();Eb?.(G);G.onRuntimeInitialized?.();if(G.postRun)for("function"==typeof G.postRun&&(G.postRun=[G.postRun]);G.postRun.length;){var f=G.postRun.shift();bc.push(f)}ac(bc)}}if(G.preRun)for("function"==typeof G.preRun&&(G.preRun=[G.preRun]);G.preRun.length;)dc();ac(cc);G.setStatus?(G.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>G.setStatus(""),1);d()},1)):d()})();Ob?moduleRtn=G:moduleRtn=new Promise((d,f)=>{Eb=d;Fb=f});
;return moduleRtn}})();
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Rive);


/***/ }),
/* 5 */
/***/ (() => {

/* (ignored) */

/***/ }),
/* 6 */
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"name":"@rive-app/canvas","version":"2.47.0","description":"Rive\'s canvas based web api.","main":"rive.js","homepage":"https://rive.app","repository":{"type":"git","url":"https://github.com/rive-app/rive-wasm/tree/master/js"},"keywords":["rive","animation"],"author":"Rive","contributors":["Luigi Rosso <luigi@rive.app> (https://rive.app)","Maxwell Talbot <max@rive.app> (https://rive.app)","Arthur Vivian <arthur@rive.app> (https://rive.app)","Umberto Sonnino <umberto@rive.app> (https://rive.app)","Matthew Sullivan <matt.j.sullivan@gmail.com> (mailto:matt.j.sullivan@gmail.com)"],"license":"MIT","files":["rive.js","rive.js.map","rive.wasm","rive_fallback.wasm","rive.d.ts","rive_advanced.mjs.d.ts","runtimeLoader.d.ts","utils","semantics"],"typings":"rive.d.ts","dependencies":{},"browser":{"fs":false,"path":false}}');

/***/ }),
/* 7 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AccessibilityOverlay: () => (/* reexport safe */ _accessibilityOverlay__WEBPACK_IMPORTED_MODULE_1__.AccessibilityOverlay),
/* harmony export */   CHECK_STATE_MASK: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.CHECK_STATE_MASK),
/* harmony export */   CHECK_STATE_OFFSET: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.CHECK_STATE_OFFSET),
/* harmony export */   SemanticActionType: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.SemanticActionType),
/* harmony export */   SemanticCheckState: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.SemanticCheckState),
/* harmony export */   SemanticMode: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.SemanticMode),
/* harmony export */   SemanticRole: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole),
/* harmony export */   SemanticState: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState),
/* harmony export */   SemanticTrait: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait),
/* harmony export */   SemanticTreeModel: () => (/* reexport safe */ _semanticTreeModel__WEBPACK_IMPORTED_MODULE_0__.SemanticTreeModel),
/* harmony export */   checkStateOf: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.checkStateOf),
/* harmony export */   hasState: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.hasState),
/* harmony export */   hasTrait: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.hasTrait),
/* harmony export */   roleName: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.roleName),
/* harmony export */   stateNames: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.stateNames),
/* harmony export */   traitNames: () => (/* reexport safe */ _types__WEBPACK_IMPORTED_MODULE_2__.traitNames)
/* harmony export */ });
/* harmony import */ var _semanticTreeModel__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(8);
/* harmony import */ var _accessibilityOverlay__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(10);
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(9);





/***/ }),
/* 8 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SemanticTreeModel: () => (/* binding */ SemanticTreeModel)
/* harmony export */ });
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(9);
var __spreadArray = (undefined && undefined.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};

/**
 * Maintains an in-memory semantic tree built from incremental
 * {@link SemanticsDiff} updates received each frame from the WASM runtime.
 *
 * Processing order within {@link applyDiff} follows the contract defined in
 * `semantic_snapshot.hpp`: removed → added → moved → childrenUpdated →
 * updatedSemantic → updatedGeometry.
 */
var SemanticTreeModel = /** @class */ (function () {
    function SemanticTreeModel() {
        this._nodesById = new Map();
        this._roots = [];
        this._semanticVersion = 0;
        this._geometryVersion = 0;
        this._geometryChangedIds = new Set();
        this._semanticChangedIds = new Set();
        this._debug = false;
    }
    Object.defineProperty(SemanticTreeModel.prototype, "nodeCount", {
        get: function () {
            return this._nodesById.size;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SemanticTreeModel.prototype, "semanticVersion", {
        /** Bumped when semantic content or tree structure changes. */
        get: function () {
            return this._semanticVersion;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SemanticTreeModel.prototype, "geometryVersion", {
        /** Bumped when node bounds change without a semantic/structural change. */
        get: function () {
            return this._geometryVersion;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SemanticTreeModel.prototype, "geometryChangedIds", {
        /** Node IDs whose bounds changed in the most recent {@link applyDiff}. */
        get: function () {
            return this._geometryChangedIds;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SemanticTreeModel.prototype, "semanticChangedIds", {
        /**
         * Node IDs whose semantic fields (role/label/value/hint/flags/headingLevel)
         * changed in the most recent {@link applyDiff}. Structural changes (moves,
         * child reorders, removals) bump {@link semanticVersion} but don't mark
         * nodes here — element attributes don't depend on tree position.
         */
        get: function () {
            return this._semanticChangedIds;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SemanticTreeModel.prototype, "roots", {
        /** Root node IDs in sibling order. */
        get: function () {
            return this._roots;
        },
        enumerable: false,
        configurable: true
    });
    /** Look up a node by its ID, or undefined if not in the tree. */
    SemanticTreeModel.prototype.nodeById = function (id) {
        return this._nodesById.get(id);
    };
    /** The node with SemanticState.Focused, or undefined. */
    SemanticTreeModel.prototype.focusedNode = function () {
        // Manual iteration: runs every frame and must stop at the first hit (the
        // TS target forbids for-of over Map iterators).
        var it = this._nodesById.values();
        for (var r = it.next(); !r.done; r = it.next()) {
            if ((0,_types__WEBPACK_IMPORTED_MODULE_0__.hasState)(r.value.stateFlags, _types__WEBPACK_IMPORTED_MODULE_0__.SemanticState.Focused))
                return r.value;
        }
        return;
    };
    /** Current index of a node among its siblings (or roots), or -1 if absent. */
    SemanticTreeModel.prototype.siblingIndexOf = function (id) {
        var node = this._nodesById.get(id);
        if (!node)
            return -1;
        if (node.parentId < 0)
            return this._roots.indexOf(id);
        var parent = this._nodesById.get(node.parentId);
        return parent ? parent.children.indexOf(id) : -1;
    };
    /** Detach a node from its current parent (or from roots). */
    SemanticTreeModel.prototype.detach = function (id) {
        var node = this._nodesById.get(id);
        if (!node)
            return;
        if (node.parentId < 0) {
            var idx = this._roots.indexOf(id);
            if (idx !== -1)
                this._roots.splice(idx, 1);
        }
        else {
            var parent_1 = this._nodesById.get(node.parentId);
            if (parent_1) {
                var idx = parent_1.children.indexOf(id);
                if (idx !== -1)
                    parent_1.children.splice(idx, 1);
            }
        }
    };
    /** Attach a node under a parent at a given sibling index (or as root). */
    SemanticTreeModel.prototype.attach = function (id, parentId, siblingIndex) {
        var node = this._nodesById.get(id);
        if (!node)
            return;
        if (parentId < 0) {
            node.parentId = -1;
            var idx = clamp(siblingIndex, 0, this._roots.length);
            this._roots.splice(idx, 0, id);
        }
        else {
            var parent_2 = this._nodesById.get(parentId);
            if (!parent_2) {
                node.parentId = -1;
                this._roots.push(id);
            }
            else {
                node.parentId = parentId;
                var idx = clamp(siblingIndex, 0, parent_2.children.length);
                parent_2.children.splice(idx, 0, id);
            }
        }
    };
    /** Recursively remove a node and all descendants. */
    SemanticTreeModel.prototype.removeSubtree = function (id) {
        var node = this._nodesById.get(id);
        if (!node)
            return;
        // Copy children array — we're mutating during traversal
        var kids = __spreadArray([], node.children, true);
        for (var _i = 0, kids_1 = kids; _i < kids_1.length; _i++) {
            var child = kids_1[_i];
            this.removeSubtree(child);
        }
        this.detach(id);
        this._nodesById.delete(id);
    };
    /**
     * Apply an incremental diff to the tree. Bumps version counters and notifies
     * listeners only when the tree actually changed.
     *
     * No-op diffs (field values identical to current model) do not bump
     * versions — the native side guards against emitting these, but applyDiff
     * defends its subscribers regardless.
     */
    SemanticTreeModel.prototype.applyDiff = function (diff) {
        var _a, _b;
        var _this = this;
        this._geometryChangedIds.clear();
        this._semanticChangedIds.clear();
        var semanticChanged = false;
        var geometryChanged = false;
        var markSemantic = function () {
            semanticChanged = true;
        };
        var markSemanticNode = function (id) {
            semanticChanged = true;
            _this._semanticChangedIds.add(id);
        };
        var markGeometry = function (id) {
            geometryChanged = true;
            _this._geometryChangedIds.add(id);
        };
        // 1. removed
        for (var _i = 0, _c = diff.removed; _i < _c.length; _i++) {
            var id = _c[_i];
            if (this._nodesById.has(id)) {
                this.removeSubtree(id);
                markSemantic();
            }
        }
        // 2. added
        for (var _d = 0, _e = diff.added; _d < _e.length; _d++) {
            var n = _e[_d];
            var existing = this._nodesById.get(n.id);
            if (existing) {
                if (semanticFieldsDiffer(existing, n)) {
                    applySemantic(existing, n);
                    markSemanticNode(n.id);
                }
                if (geometryFieldsDiffer(existing, n)) {
                    applyGeometry(existing, n);
                    markGeometry(n.id);
                }
            }
            else {
                this._nodesById.set(n.id, nodeFromDiff(n));
                markSemanticNode(n.id);
                markGeometry(n.id);
            }
            this.detach(n.id);
            this.attach(n.id, n.parentId, n.siblingIndex);
        }
        // 3. moved
        // The runtime emits a node as "moved" when its parentId OR siblingIndex
        // changes, so a reorder-only move (same parent, new index) is still a
        // structural/semantic change. Compare the actual position before and after
        // re-attaching so that geometry-only or no-op moves don't bump the semantic
        // version (which would defeat the semantic/geometry version split).
        for (var _f = 0, _g = diff.moved; _f < _g.length; _f++) {
            var n = _g[_f];
            var existing = this._nodesById.get(n.id);
            if (!existing)
                continue;
            var parentChanged = existing.parentId !== n.parentId;
            var oldIndex = this.siblingIndexOf(n.id);
            var geomChanged = geometryFieldsDiffer(existing, n);
            if (geomChanged) {
                applyGeometry(existing, n);
                markGeometry(n.id);
            }
            this.detach(n.id);
            this.attach(n.id, n.parentId, n.siblingIndex);
            if (parentChanged || this.siblingIndexOf(n.id) !== oldIndex) {
                markSemantic();
            }
        }
        // 4. childrenUpdated
        for (var _h = 0, _j = diff.childrenUpdated; _h < _j.length; _h++) {
            var update = _j[_h];
            if (update.parentId < 0) {
                var next = update.childIds.filter(function (id) { return _this._nodesById.has(id); });
                if (!arraysEqual(this._roots, next)) {
                    this._roots.length = 0;
                    (_a = this._roots).push.apply(_a, next);
                    for (var _k = 0, _l = this._roots; _k < _l.length; _k++) {
                        var id = _l[_k];
                        var node = this._nodesById.get(id);
                        if (node)
                            node.parentId = -1;
                    }
                    markSemantic();
                }
            }
            else {
                var parent_3 = this._nodesById.get(update.parentId);
                if (!parent_3)
                    continue;
                var next = update.childIds.filter(function (id) { return _this._nodesById.has(id); });
                if (!arraysEqual(parent_3.children, next)) {
                    parent_3.children.length = 0;
                    (_b = parent_3.children).push.apply(_b, next);
                    for (var _m = 0, _o = parent_3.children; _m < _o.length; _m++) {
                        var id = _o[_m];
                        var node = this._nodesById.get(id);
                        if (node)
                            node.parentId = update.parentId;
                    }
                    markSemantic();
                }
            }
        }
        // 5. updatedSemantic — semantic fields updated
        for (var _p = 0, _q = diff.updatedSemantic; _p < _q.length; _p++) {
            var n = _q[_p];
            var existing = this._nodesById.get(n.id);
            if (!existing)
                continue;
            if (!semanticFieldsDiffer(existing, n))
                continue;
            applySemantic(existing, n);
            markSemanticNode(n.id);
        }
        // 6. updatedGeometry — bounds of a semantic node updated
        for (var _r = 0, _s = diff.updatedGeometry; _r < _s.length; _r++) {
            var n = _s[_r];
            var existing = this._nodesById.get(n.id);
            if (!existing)
                continue;
            if (!geometryFieldsDiffer(existing, n))
                continue;
            applyGeometry(existing, n);
            markGeometry(n.id);
        }
        if (!semanticChanged && !geometryChanged)
            return;
        if (semanticChanged)
            this._semanticVersion++;
        if (geometryChanged)
            this._geometryVersion++;
        if (this._debug) {
            this.logDiff(diff, semanticChanged, geometryChanged);
        }
    };
    Object.defineProperty(SemanticTreeModel.prototype, "debug", {
        /** Enable/disable debug logging of diffs to the console. */
        set: function (enabled) {
            this._debug = enabled;
        },
        enumerable: false,
        configurable: true
    });
    SemanticTreeModel.prototype.logDiff = function (diff, semanticChanged, geometryChanged) {
        var lines = [
            "[rive:semantics] semantic v".concat(this._semanticVersion) +
                (geometryChanged ? " geometry v".concat(this._geometryVersion) : "") +
                (semanticChanged ? "" : " (geometry-only)"),
        ];
        for (var _i = 0, _a = diff.removed; _i < _a.length; _i++) {
            var id = _a[_i];
            lines.push("  - removed #".concat(id));
        }
        for (var _b = 0, _c = diff.added; _b < _c.length; _b++) {
            var n = _c[_b];
            lines.push("  + added #".concat(n.id, " ").concat((0,_types__WEBPACK_IMPORTED_MODULE_0__.roleName)(n.role)) +
                (n.label ? " \"".concat(n.label, "\"") : "") +
                " bounds:(".concat(n.minX.toFixed(1), ",").concat(n.minY.toFixed(1), ")-(").concat(n.maxX.toFixed(1), ",").concat(n.maxY.toFixed(1), ")") +
                " states=[".concat((0,_types__WEBPACK_IMPORTED_MODULE_0__.stateNames)(n.stateFlags), "]") +
                " traits=[".concat((0,_types__WEBPACK_IMPORTED_MODULE_0__.traitNames)(n.traitFlags), "]"));
        }
        for (var _d = 0, _e = diff.moved; _d < _e.length; _d++) {
            var n = _e[_d];
            lines.push("  ~ moved #".concat(n.id, " \u2192 parent=").concat(n.parentId, " idx=").concat(n.siblingIndex) +
                " bounds:(".concat(n.minX.toFixed(1), ",").concat(n.minY.toFixed(1), ")-(").concat(n.maxX.toFixed(1), ",").concat(n.maxY.toFixed(1), ")"));
        }
        for (var _f = 0, _g = diff.childrenUpdated; _f < _g.length; _f++) {
            var u = _g[_f];
            lines.push("  \u2195 children of ".concat(u.parentId < 0 ? "root" : "#" + u.parentId, ": [").concat(u.childIds.join(", "), "]"));
        }
        for (var _h = 0, _j = diff.updatedSemantic; _h < _j.length; _h++) {
            var n = _j[_h];
            lines.push("  \u270E semantic #".concat(n.id, " ").concat((0,_types__WEBPACK_IMPORTED_MODULE_0__.roleName)(n.role)) +
                (n.label ? " \"".concat(n.label, "\"") : "") +
                " states=[".concat((0,_types__WEBPACK_IMPORTED_MODULE_0__.stateNames)(n.stateFlags), "]") +
                " traits=[".concat((0,_types__WEBPACK_IMPORTED_MODULE_0__.traitNames)(n.traitFlags), "]"));
        }
        for (var _k = 0, _l = diff.updatedGeometry; _k < _l.length; _k++) {
            var n = _l[_k];
            lines.push("  \u229E geometry #".concat(n.id, " (").concat(n.minX.toFixed(1), ",").concat(n.minY.toFixed(1), ")-(").concat(n.maxX.toFixed(1), ",").concat(n.maxY.toFixed(1), ")"));
        }
        console.log(lines.join("\n"));
    };
    /**
     * Returns every node in depth-first order, paired with its depth level.
     * Useful for debug logging / rendering a flat list.
     */
    SemanticTreeModel.prototype.flattened = function () {
        var _this = this;
        var out = [];
        var walk = function (id, depth) {
            var node = _this._nodesById.get(id);
            if (!node)
                return;
            out.push({ depth: depth, node: node });
            for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                var child = _a[_i];
                walk(child, depth + 1);
            }
        };
        for (var _i = 0, _a = this._roots; _i < _a.length; _i++) {
            var root = _a[_i];
            walk(root, 0);
        }
        return out;
    };
    return SemanticTreeModel;
}());

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}
function arraysEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}
function nodeFromDiff(n) {
    return {
        id: n.id,
        parentId: -1,
        role: n.role,
        label: n.label,
        value: n.value,
        hint: n.hint,
        stateFlags: n.stateFlags,
        traitFlags: n.traitFlags,
        headingLevel: n.headingLevel,
        minX: n.minX,
        minY: n.minY,
        maxX: n.maxX,
        maxY: n.maxY,
        children: [],
    };
}
/** Compare role/label/value/hint/stateFlags/traitFlags/headingLevel. */
function semanticFieldsDiffer(a, b) {
    return (a.role !== b.role ||
        a.label !== b.label ||
        a.value !== b.value ||
        a.hint !== b.hint ||
        a.stateFlags !== b.stateFlags ||
        a.traitFlags !== b.traitFlags ||
        a.headingLevel !== b.headingLevel);
}
/** Compare only bounds (minX/minY/maxX/maxY). */
function geometryFieldsDiffer(a, b) {
    return (a.minX !== b.minX ||
        a.minY !== b.minY ||
        a.maxX !== b.maxX ||
        a.maxY !== b.maxY);
}
function applySemantic(target, src) {
    target.role = src.role;
    target.label = src.label;
    target.value = src.value;
    target.hint = src.hint;
    target.stateFlags = src.stateFlags;
    target.traitFlags = src.traitFlags;
    target.headingLevel = src.headingLevel;
}
function applyGeometry(target, src) {
    target.minX = src.minX;
    target.minY = src.minY;
    target.maxX = src.maxX;
    target.maxY = src.maxY;
}


/***/ }),
/* 9 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CHECK_STATE_MASK: () => (/* binding */ CHECK_STATE_MASK),
/* harmony export */   CHECK_STATE_OFFSET: () => (/* binding */ CHECK_STATE_OFFSET),
/* harmony export */   SemanticActionType: () => (/* binding */ SemanticActionType),
/* harmony export */   SemanticCheckState: () => (/* binding */ SemanticCheckState),
/* harmony export */   SemanticMode: () => (/* binding */ SemanticMode),
/* harmony export */   SemanticRole: () => (/* binding */ SemanticRole),
/* harmony export */   SemanticState: () => (/* binding */ SemanticState),
/* harmony export */   SemanticTrait: () => (/* binding */ SemanticTrait),
/* harmony export */   checkStateOf: () => (/* binding */ checkStateOf),
/* harmony export */   hasState: () => (/* binding */ hasState),
/* harmony export */   hasTrait: () => (/* binding */ hasTrait),
/* harmony export */   roleName: () => (/* binding */ roleName),
/* harmony export */   stateNames: () => (/* binding */ stateNames),
/* harmony export */   traitNames: () => (/* binding */ traitNames)
/* harmony export */ });
// ---------------------------------------------------------------------------
// SemanticRole — mirrors rive::SemanticRole
// ---------------------------------------------------------------------------
var SemanticRole = {
    none: 0,
    button: 1,
    link: 2,
    checkbox: 3,
    switchControl: 4,
    slider: 5,
    textField: 6,
    text: 7,
    image: 8,
    group: 9,
    list: 10,
    listItem: 11,
    tab: 12,
    tabList: 13,
    dialog: 14,
    alertDialog: 15,
    radioGroup: 16,
    radioButton: 17,
};
// ---------------------------------------------------------------------------
// SemanticState — mirrors rive::SemanticState bitmask
//
// Bits 0-7 are trait-gated (only meaningful when the corresponding
// SemanticTrait is set). Bits 8-13 are non-trait states.
//
// Check state is the exception: it is a two-bit *field* at bits 2-3 rather
// than a flag, because a checkbox is tri-state. It is not a member of this
// table — read it with checkStateOf().
// ---------------------------------------------------------------------------
var SemanticState = {
    None: 0,
    // Trait-gated
    Expanded: 1 << 0, // requires Expandable
    Selected: 1 << 1, // requires Selectable
    // Bits 2-3 are the check state field, not independent flags -- see SemanticCheckState.
    Toggled: 1 << 4, // requires Toggleable
    Required: 1 << 5, // requires Requirable
    Disabled: 1 << 6, // requires Enablable
    Focused: 1 << 7, // requires Focusable
    // Non-trait
    Hidden: 1 << 8,
    LiveRegion: 1 << 9,
    ReadOnly: 1 << 10,
    Modal: 1 << 11,
    Obscured: 1 << 12,
    Multiline: 1 << 13,
};
function hasState(flags, state) {
    return (flags & state) !== 0;
}
// SemanticCheckState — mirrors rive::SemanticCheckState
//
// The tri-state of a checkable node. Occupies two bits of stateFlags at
// CHECK_STATE_OFFSET, so it is read as a value rather than tested as a flag.
// Only meaningful when the Checkable trait is set.
var SemanticCheckState = {
    Unchecked: 0,
    Checked: 1,
    Mixed: 2,
};
/** Bit offset of the check field within stateFlags. */
var CHECK_STATE_OFFSET = 2;
/** Mask of the check field within stateFlags. */
var CHECK_STATE_MASK = 3 << CHECK_STATE_OFFSET;
/**
 * Decodes the check field out of `flags`. The field is two bits. Returns 0, 1, or 2
 * per the mapping in SemanticCheckState.
 */
function checkStateOf(flags) {
    var value = (flags & CHECK_STATE_MASK) >> CHECK_STATE_OFFSET;
    return value >= SemanticCheckState.Mixed
        ? SemanticCheckState.Mixed
        : value;
}
/**
 * Controls when the instance builds semantic trees and accessibility overlays.
 *
 * - `disabled`: no semantics work.
 * - `enabled`: semantics and overlay are active immediately after load.
 */
var SemanticMode = {
    Disabled: "disabled",
    Enabled: "enabled",
};
// ---------------------------------------------------------------------------
// SemanticTrait — mirrors rive::SemanticTrait bitmask
//
// Traits declare what *capabilities* a node has. A state flag is only
// meaningful when its corresponding trait is set.
// ---------------------------------------------------------------------------
var SemanticTrait = {
    None: 0,
    Expandable: 1 << 0,
    Selectable: 1 << 1,
    Checkable: 1 << 2,
    Toggleable: 1 << 3,
    Requirable: 1 << 4,
    Enablable: 1 << 5,
    Focusable: 1 << 6,
};
function hasTrait(flags, trait) {
    return (flags & trait) !== 0;
}
// ---------------------------------------------------------------------------
// SemanticActionType — mirrors rive::SemanticActionType
// ---------------------------------------------------------------------------
var SemanticActionType = {
    tap: 0,
    increase: 1,
    decrease: 2,
};
// ---------------------------------------------------------------------------
// Helpers — readable names for bitmask flags
// ---------------------------------------------------------------------------
var _roleNames = {};
for (var _i = 0, _a = Object.entries(SemanticRole); _i < _a.length; _i++) {
    var _b = _a[_i], name_1 = _b[0], val = _b[1];
    _roleNames[val] = name_1;
}
var _stateEntries = Object.entries(SemanticState).filter(function (_a) {
    var v = _a[1];
    return v !== 0;
});
var _traitEntries = Object.entries(SemanticTrait).filter(function (_a) {
    var v = _a[1];
    return v !== 0;
});
function roleName(role) {
    var _a;
    return (_a = _roleNames[role]) !== null && _a !== void 0 ? _a : "unknown(".concat(role, ")");
}
function stateNames(flags) {
    if (flags === 0)
        return "none";
    var active = [];
    for (var _i = 0, _stateEntries_1 = _stateEntries; _i < _stateEntries_1.length; _i++) {
        var _a = _stateEntries_1[_i], name_2 = _a[0], bit = _a[1];
        if (flags & bit)
            active.push(name_2);
    }
    switch (checkStateOf(flags)) {
        case SemanticCheckState.Checked:
            active.push("Checked");
            break;
        case SemanticCheckState.Mixed:
            active.push("Mixed");
            break;
    }
    return active.join(", ") || "none";
}
function traitNames(flags) {
    if (flags === 0)
        return "none";
    var active = [];
    for (var _i = 0, _traitEntries_1 = _traitEntries; _i < _traitEntries_1.length; _i++) {
        var _a = _traitEntries_1[_i], name_3 = _a[0], bit = _a[1];
        if (flags & bit)
            active.push(name_3);
    }
    return active.join(", ") || "none";
}


/***/ }),
/* 10 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AccessibilityOverlay: () => (/* binding */ AccessibilityOverlay)
/* harmony export */ });
/* harmony import */ var _claimedKeyEvents__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(11);
/* harmony import */ var _utils_canvasOffset__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(12);
/* harmony import */ var _types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(9);



var warnedUnpositionedWrapper = false;
/**
 * Warns once per page when no positioned element sits at or inside the canvas's
 * nearest scroll container: the overlay then can't scroll with the canvas. Reads only.
 */
function warnIfWrapperUnpositioned(canvas) {
    if (warnedUnpositionedWrapper)
        return;
    // Null when detached (or display:none / fixed); nothing to judge yet.
    var offsetParent = canvas.offsetParent;
    if (!offsetParent)
        return;
    var scrolls = function (v) { return v === "auto" || v === "scroll" || v === "overlay"; };
    var scroller = null;
    var el = canvas.parentElement;
    // Bounds pathological nesting.
    var MAX_ANCESTOR_WALK = 32;
    for (var i = 0; el && el !== document.documentElement && i < MAX_ANCESTOR_WALK; i++, el = el.parentElement) {
        var style = getComputedStyle(el);
        if (scrolls(style.overflowX) || scrolls(style.overflowY)) {
            scroller = el;
            break;
        }
    }
    // Only the viewport scrolls: any offsetParent scrolls with the page.
    if (!scroller || scroller.contains(offsetParent))
        return;
    warnedUnpositionedWrapper = true;
    console.warn('[Rive] Semantics: give the element wrapping the <canvas> "position: relative" (or another positioned value) so the semantic overlay scrolls with the canvas. Without it, screen readers may scroll to stale positions when the canvas is inside a scrolling container.');
}
/**
 * Creates and manages an invisible DOM tree overlaying a Rive canvas. This is for
 * screen readers to discover and interact with the Rive content.
 *
 * Each semantic node in the {@link SemanticTreeModel} gets a corresponding
 * DOM element with appropriate ARIA role, states, and action handlers so
 * assistive technologies (i.e. screen readers) can discover
 * and interact with the Rive content.
 *
 * Each node receives a prefixed ID (`id=rive-{instanceId}-sem-{nodeId}`) to avoid host-page ID collisions.
 * The nodeID is Rive's semantic node ID from core runtime.
 * Each node is styled with `pointer-events: none`. Interactive nodes can receive
 * programmatic focus and keydown events without entering the browser Tab order.
 */
var AccessibilityOverlay = /** @class */ (function () {
    function AccessibilityOverlay(options) {
        var _this = this;
        var _a, _b;
        this.elements = new Map();
        /** Visually-hidden description spans keyed by node ID, referenced by aria-describedby. */
        this.descElements = new Map();
        this.lastSemanticVersion = -1;
        this.lastGeometryVersion = -1;
        /** Text elements whose fit-scale needs recomputing, batched per update (see flushTextGeometry). */
        this.pendingTextGeometry = [];
        /** Last measured box-size|text key per text element, to skip redundant re-measures. */
        this.textGeometryKeys = new WeakMap();
        /** Node data last passed to applyAttributes per element; see {@link setEditingHostNode}. */
        this.appliedNodes = new WeakMap();
        this.lastCanvasPositioning = {
            width: -1, height: -1, offsetTop: -1, offsetLeft: -1,
        };
        /**
         * Set when a ResizeObserver/window-resize signals the canvas geometry may have
         * changed, cleared once the transform is re-synced. Lets {@link needsUpdate}
         * report geometry changes without a per-frame `getBoundingClientRect()` reflow.
         * Starts true so the first update computes the transform.
         */
        this._geometryDirty = true;
        /** True while reconciling the DOM (reserved for future focus-sync guards). */
        this.isUpdating = false;
        /** Node whose element the editing host stands in for, or null. */
        this.editingHostNodeId = null;
        /** Semantic version last folded into the editing host's decoration. */
        this.editingHostSemanticVersion = -1;
        /**
         * Single child div of the overlay container that carries the artboard→CSS
         * transform. All semantic node elements are children of this div and express
         * their positions in raw artboard-space coordinates. The CSS transform on
         * this container maps artboard units to CSS pixels in one GPU pass — no
         * per-node matrix multiplication required.
         */
        this.transformContainer = null;
        this._artboardBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        this.repositionTimer = null;
        this.canvasResizeObserver = null;
        this.parentResizeObserver = null;
        /**
         * Detects canvas *position* drift. See {@link observePosition}.
         */
        this.positionObserver = null;
        this._onWindowResize = function () { return _this.scheduleReposition(); };
        this.instanceId = options.instanceId;
        this.fireAction = options.fireAction;
        this.requestFocus = options.requestFocus;
        this.clearFocus = options.clearFocus;
        this.canvas = options.canvas;
        this.semanticsOptions = options.semanticsOptions;
        this.allowFocusInterrupt = (_a = options.allowFocusInterrupt) !== null && _a !== void 0 ? _a : false;
        this.isEditingHostFocused = (_b = options.isEditingHostFocused) !== null && _b !== void 0 ? _b : (function () { return false; });
        this.container = this.createContainer(options.canvas);
        this.attachPositionObservers();
        warnIfWrapperUnpositioned(options.canvas);
    }
    /**
     * Hide the stood-in node's element (no duplicate textbox for AT); re-derive the previous
     * one's aria-hidden.
     */
    AccessibilityOverlay.prototype.setEditingHostNode = function (nodeId) {
        if (this.editingHostNodeId === nodeId)
            return;
        var previous = this.editingHostNodeId;
        this.editingHostNodeId = nodeId;
        if (previous !== null) {
            var previousEl = this.elements.get(previous);
            // Re-derive rather than un-hide: the node may have become Hidden mid-session.
            if (previousEl) {
                var previousNode = this.appliedNodes.get(previousEl);
                if (previousNode && this.isAriaHidden(previousNode)) {
                    setAttr(previousEl, "aria-hidden", "true");
                }
                else {
                    removeAttr(previousEl, "aria-hidden");
                }
            }
        }
        if (nodeId !== null) {
            var el = this.elements.get(nodeId);
            if (el)
                setAttr(el, "aria-hidden", "true");
        }
    };
    /**
     * Describe the focused text field on the host and hide its element; no-op unless
     * semantics changed.
     * @param force - apply even if semantics are unchanged (session start).
     */
    AccessibilityOverlay.prototype.syncEditingHost = function (tree, host, force) {
        var _a;
        if (!force && tree.semanticVersion === this.editingHostSemanticVersion)
            return;
        this.editingHostSemanticVersion = tree.semanticVersion;
        var node = tree.focusedNode();
        if (node === undefined || node.role !== _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.textField) {
            // Nothing to describe; drop the stale description rather than misname the host.
            if (this.editingHostNodeId !== null) {
                host.resetDecoration();
                this.setEditingHostNode(null);
            }
            return;
        }
        // Every key is passed on every call, nulls included, so nothing survives from
        // the previously described field.
        host.setSecure((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(node.stateFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Obscured));
        host.decorate({
            "aria-label": node.label || null,
            "aria-readonly": (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(node.stateFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.ReadOnly) ? "true" : null,
            "aria-multiline": (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(node.stateFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Multiline) ? "true" : null,
            // Trait-gated to match applyAttributes.
            "aria-required": (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(node.traitFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Requirable) &&
                (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(node.stateFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Required)
                ? "true"
                : null,
            // The hint span applyAttributes maintains (update() runs earlier in the frame).
            "aria-describedby": (node.hint && ((_a = this.descElements.get(node.id)) === null || _a === void 0 ? void 0 : _a.id)) || null,
        });
        this.setEditingHostNode(node.id);
    };
    /** True while the editing host stands in for a node's element. */
    AccessibilityOverlay.prototype.hasEditingHost = function () {
        return this.editingHostNodeId !== null;
    };
    /**
     * Undo the stand-in; if the host still has DOM focus, move it to the focused node's
     * element so AT announces it.
     */
    AccessibilityOverlay.prototype.releaseEditingHost = function (tree, host) {
        var _a;
        host === null || host === void 0 ? void 0 : host.resetDecoration();
        this.setEditingHostNode(null);
        this.editingHostSemanticVersion = -1;
        if (!(host === null || host === void 0 ? void 0 : host.hasDomFocus()))
            return;
        var focusedNodeId = (_a = tree === null || tree === void 0 ? void 0 : tree.focusedNode()) === null || _a === void 0 ? void 0 : _a.id;
        if (focusedNodeId !== undefined)
            this.focusNodeElement(focusedNodeId);
    };
    /** Move DOM focus onto a node's element. No-op for a node with no element. */
    AccessibilityOverlay.prototype.focusNodeElement = function (nodeId) {
        var el = this.elements.get(nodeId);
        if (!el)
            return;
        this.focusElementInPlace(el);
    };
    // The overlay is positioned outside the canvas's scroll chain, so a plain focus()
    // would scroll the root instead; scroll the canvas into view through its real ancestors.
    AccessibilityOverlay.prototype.focusElementInPlace = function (el) {
        var _a, _b;
        this.syncContainerBeforeFocus();
        el.focus({ preventScroll: true });
        (_b = (_a = this.canvas).scrollIntoView) === null || _b === void 0 ? void 0 : _b.call(_a, {
            block: "nearest",
            inline: "nearest",
            behavior: "instant",
        });
        // The scroll moved the canvas; re-align now rather than after the observer throttle.
        this.syncContainerGeometry();
        this.observePosition();
    };
    AccessibilityOverlay.prototype.getSemanticOverlayContainer = function () {
        return this.container;
    };
    // ---- Container lifecycle ----
    // Keep the a11y tree overlay matched to the canvas's position and size:
    // 1. The canvas resized           — ResizeObserver
    // 2. The canvas's parent resized   — ResizeObserver
    // 3. The window resized            — resize event
    // 4. The canvas moved/drifted      — IntersectionObserver (see observePosition)
    AccessibilityOverlay.prototype.attachPositionObservers = function () {
        var _this = this;
        this.canvasResizeObserver = new ResizeObserver(function () { return _this.scheduleReposition(); });
        this.canvasResizeObserver.observe(this.canvas);
        var parent = this.canvas.parentElement;
        if (parent) {
            this.parentResizeObserver = new ResizeObserver(function () { return _this.scheduleReposition(); });
            this.parentResizeObserver.observe(parent);
        }
        window.addEventListener("resize", this._onWindowResize);
        this.observePosition();
    };
    /**
     * Arms an IntersectionObserver whose root box is bounded to the canvas, so it
     * fires when the canvas moves relative to the viewport — position drift that
     * no ResizeObserver reports. Lets us re-sync the overlay container on a move
     * instead of recalculating the canvas bounding box every frame.
     */
    AccessibilityOverlay.prototype.observePosition = function () {
        var _this = this;
        var _a;
        if (typeof IntersectionObserver === "undefined")
            return;
        (_a = this.positionObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this.positionObserver = null;
        var rect = this.canvas.getBoundingClientRect();
        // Can't frame a zero-area element; it will re-arm on the next reposition.
        if (!rect.width || !rect.height)
            return;
        // Shrink the viewport root box down to exactly the canvas: a negative inset
        // from each viewport edge to the matching canvas edge, in CSS shorthand
        // order (top, right, bottom, left). Rounded so sub-pixel jitter doesn't trip
        // the 1.0 threshold.
        var insetToPx = function (v) { return "".concat(-Math.round(v), "px"); };
        var rootMargin = [
            rect.top, // top:    viewport top → canvas top
            window.innerWidth - rect.right, // right:  viewport right → canvas right
            window.innerHeight - rect.bottom, // bottom: viewport bottom → canvas bottom
            rect.left, // left:   viewport left → canvas left
        ]
            .map(insetToPx)
            .join(" ");
        // The observer emits an initial notification for the current (contained)
        // state; ignore that and only react to a subsequent move.
        var armed = false;
        this.positionObserver = new IntersectionObserver(function () {
            if (!armed) {
                armed = true;
                return;
            }
            _this.scheduleReposition();
        }, { threshold: 1.0, rootMargin: rootMargin });
        this.positionObserver.observe(this.canvas);
    };
    AccessibilityOverlay.prototype.scheduleReposition = function () {
        var _this = this;
        // A resize/move may have changed canvas size/scale/position; force a
        // transform recompute on the next frame's update.
        this._geometryDirty = true;
        if (this.repositionTimer !== null)
            return;
        this.repositionTimer = setTimeout(function () {
            _this.repositionTimer = null;
            _this.syncContainerGeometry();
            // Re-arm the position observer at the canvas's new location.
            _this.observePosition();
        }, 500); // Throttle to avoid rapid style recalculations
    };
    /** Returns true when the container's size changed (node transforms need recomputing). */
    AccessibilityOverlay.prototype.syncContainerGeometry = function () {
        var rect = this.canvas.getBoundingClientRect();
        var _a = (0,_utils_canvasOffset__WEBPACK_IMPORTED_MODULE_1__.canvasOffset)(this.canvas), top = _a.top, left = _a.left;
        var sizeChanged = rect.width !== this.lastCanvasPositioning.width ||
            rect.height !== this.lastCanvasPositioning.height;
        if (!sizeChanged &&
            top === this.lastCanvasPositioning.offsetTop &&
            left === this.lastCanvasPositioning.offsetLeft)
            return false;
        this.container.style.top = top + "px";
        this.container.style.left = left + "px";
        this.container.style.width = rect.width + "px";
        this.container.style.height = rect.height + "px";
        this.container.tabIndex = -1;
        this.lastCanvasPositioning.width = rect.width;
        this.lastCanvasPositioning.height = rect.height;
        this.lastCanvasPositioning.offsetTop = top;
        this.lastCanvasPositioning.offsetLeft = left;
        return sizeChanged;
    };
    /**
     * Re-align the container right before focusing one of its elements. The position
     * observer re-syncs after scrolling on a throttle; focusing an element while the
     * container is stale would make the browser scroll the page to where it sits.
     */
    AccessibilityOverlay.prototype.syncContainerBeforeFocus = function () {
        if (this.syncContainerGeometry())
            this._geometryDirty = true;
    };
    AccessibilityOverlay.prototype.createContainer = function (canvas) {
        var _a, _b;
        var container = document.createElement("div");
        container.id = "rive-a11y-".concat(this.instanceId);
        container.setAttribute("role", "region");
        container.setAttribute("aria-label", (_b = (_a = this.semanticsOptions) === null || _a === void 0 ? void 0 : _a.riveCanvasLabel) !== null && _b !== void 0 ? _b : "Rive animation");
        // Size to the canvas's CSS layout box, not the parent container.
        var rect = canvas.getBoundingClientRect();
        var _c = (0,_utils_canvasOffset__WEBPACK_IMPORTED_MODULE_1__.canvasOffset)(this.canvas), top = _c.top, left = _c.left;
        container.style.cssText = [
            "position:absolute",
            "top:".concat(top, "px"),
            "left:".concat(left, "px"),
            "line-height:normal",
            "font-size:16px",
            "width:".concat(rect.width, "px"),
            "height:".concat(rect.height, "px"),
            "overflow:hidden",
            "pointer-events:none",
            // Visually hidden but still in the accessibility tree.
            // `display:none` and `visibility:hidden` would hide from AT.
            "opacity:0",
        ].join(";");
        canvas.insertAdjacentElement("afterend", container);
        return container;
    };
    /**
     * Returns what changed since the last update, or null if nothing changed.
     *
     * Callers use this to avoid recomputing the (relatively expensive)
     * artboard→canvas transform on frames where only node bounds changed in the
     * tree: the transform only needs recomputing when `layoutChanged` is true.
     */
    AccessibilityOverlay.prototype.needsUpdate = function (tree) {
        var semanticChanged = tree.semanticVersion !== this.lastSemanticVersion;
        var nodeGeometryChanged = tree.geometryVersion !== this.lastGeometryVersion;
        var layoutChanged = this._geometryDirty || !this.transformContainer;
        if (!semanticChanged && !nodeGeometryChanged && !layoutChanged)
            return null;
        return { semanticChanged: semanticChanged, nodeGeometryChanged: nodeGeometryChanged, layoutChanged: layoutChanged };
    };
    /**
     * Update the overlay DOM to reflect the current state of the semantic tree.
     * Call once per frame after `applyDiff` when {@link needsUpdate} reports a
     * change, when layout/transform inputs are dirty, or when a fresh
     * `forwardMat` is supplied (even if the tree versions are unchanged).
     *
     * @param tree           The in-memory semantic tree model
     * @param forwardMat     Artboard→canvas-pixel transform from `computeAlignment`,
     *                       or null to reuse the existing CSS transform on the
     *                       transform container
     * @param dpr            Device pixel ratio used for the canvas backing store
     * @param artboardBounds The artboard's own bounding rectangle
     */
    AccessibilityOverlay.prototype.update = function (tree, forwardMat, dpr, artboardBounds, change) {
        var overlayChange = change !== null && change !== void 0 ? change : this.needsUpdate(tree);
        if (!overlayChange && forwardMat) {
            overlayChange = {
                semanticChanged: false,
                nodeGeometryChanged: false,
                layoutChanged: true,
            };
        }
        if (!overlayChange)
            return;
        this.performUpdate(tree, forwardMat, dpr, artboardBounds, overlayChange);
    };
    AccessibilityOverlay.prototype.performUpdate = function (tree, forwardMat, dpr, artboardBounds, change) {
        var _a;
        var semanticChanged = change.semanticChanged, nodeGeometryChanged = change.nodeGeometryChanged;
        // Per-node change sets only describe the most recent applyDiff. If more
        // than one semantic version elapsed since our last update (first build,
        // or a diff we never consumed), fall back to re-applying attributes on
        // every node rather than trusting an incomplete set.
        var reapplyAllAttributes = tree.semanticVersion - this.lastSemanticVersion > 1;
        this.lastSemanticVersion = tree.semanticVersion;
        this.lastGeometryVersion = tree.geometryVersion;
        this.isUpdating = true;
        this._artboardBounds = artboardBounds;
        // Container box + artboard transform only run when a fresh forwardMat was
        // supplied (layout/transform dirty). Node-only bounds updates reuse the
        // existing CSS transform and go through updateGeometryForChangedNodes.
        // Skipping syncContainerGeometry here on semantic-only frames avoids a
        // getBoundingClientRect() reflow on every animation frame. The throttled
        // scheduleReposition() path still keeps the container aligned when the page
        // layout shifts.
        if (forwardMat) {
            this.syncContainerGeometry();
            this.syncTransformContainer(forwardMat, dpr, artboardBounds);
            // Transform is now in sync with the latest layout.
            this._geometryDirty = false;
        }
        if (semanticChanged) {
            var rootEl = (_a = this.transformContainer) !== null && _a !== void 0 ? _a : this.container;
            var activeIds_1 = new Set();
            this.rebuildChildren(rootEl, tree.roots, tree, 0, // parentLeft in artboard space (transform container origin)
            0, // parentTop  in artboard space
            activeIds_1, reapplyAllAttributes);
            var staleIds_2 = [];
            this.elements.forEach(function (_el, id) {
                if (!activeIds_1.has(id))
                    staleIds_2.push(id);
            });
            for (var _i = 0, staleIds_1 = staleIds_2; _i < staleIds_1.length; _i++) {
                var id = staleIds_1[_i];
                var el = this.elements.get(id);
                if (el && el.parentNode)
                    el.parentNode.removeChild(el);
                this.elements.delete(id);
                var desc = this.descElements.get(id);
                if (desc && desc.parentNode)
                    desc.parentNode.removeChild(desc);
                this.descElements.delete(id);
            }
        }
        else if (nodeGeometryChanged) {
            this.updateGeometryForChangedNodes(tree);
        }
        // Text scaling needs layout reads; batch them into one pass after all
        // position/attribute writes so each frame forces at most one reflow.
        this.flushTextGeometry();
        this.isUpdating = false;
    };
    /** Remove the overlay from the DOM entirely. */
    AccessibilityOverlay.prototype.destroy = function () {
        var _a, _b, _c;
        if (this.repositionTimer !== null) {
            clearTimeout(this.repositionTimer);
            this.repositionTimer = null;
        }
        window.removeEventListener("resize", this._onWindowResize);
        (_a = this.canvasResizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        (_b = this.parentResizeObserver) === null || _b === void 0 ? void 0 : _b.disconnect();
        (_c = this.positionObserver) === null || _c === void 0 ? void 0 : _c.disconnect();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.elements.clear();
        this.descElements.clear();
        this.pendingTextGeometry.length = 0;
    };
    // ---- Tree → DOM reconciliation ----
    /**
     * Reconcile a parent DOM element's children with an ordered list of
     * semantic node IDs. Creates, updates, and reorders elements as needed.
     *
     * Node positions are expressed in artboard-space coordinates. The CSS
     * transform on the transform container maps artboard units to CSS pixels,
     * so no per-node matrix multiplication is required here.
     *
     * @param parentArtboardLeft  Absolute artboard minX of the parent node (0 for roots)
     * @param parentArtboardTop   Absolute artboard minY of the parent node (0 for roots)
     */
    AccessibilityOverlay.prototype.rebuildChildren = function (parentEl, childIds, tree, parentArtboardLeft, parentArtboardTop, activeIds, applyAllAttributes) {
        for (var i = 0; i < childIds.length; i++) {
            var nodeId = childIds[i];
            var nodeData = tree.nodeById(nodeId);
            if (!nodeData)
                continue;
            activeIds.add(nodeId);
            var el = this.elements.get(nodeId);
            var isNew = !el;
            if (!el) {
                el = this.createElement(nodeData);
                this.elements.set(nodeId, el);
            }
            // Attributes are only applied to new elements and nodes whose semantic
            // fields changed in the latest diff. Skipping redundant setAttribute
            // calls eliminates WebKit AX notifications that knock VoiceOver off its
            // current element.
            if (isNew || applyAllAttributes || tree.semanticChangedIds.has(nodeId)) {
                this.applyAttributes(el, nodeData);
            }
            this.applyPosition(el, nodeData, parentArtboardLeft, parentArtboardTop);
            // Only touch the DOM tree if the element isn't already in the correct
            // position. Moving a focused element can blur it and knock AT off the
            // current node.
            var currentChild = parentEl.children[i];
            if (currentChild !== el) {
                if (currentChild) {
                    parentEl.insertBefore(el, currentChild);
                }
                else {
                    parentEl.appendChild(el);
                }
            }
            // Reflect the runtime Focused state into DOM focus. Runs after insertion
            // so the element is attached, and skips elements that already hold focus.
            // The cheap trait/state flag checks gate the (per-node) DOM queries below,
            // so the activeElement/closest/contains walks only run for a node that is
            // actually focusable + focused — not for every node on every frame.
            if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(nodeData.traitFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Focusable) &&
                (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(nodeData.stateFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Focused)) {
                var active = document.activeElement;
                // While focus is inside one of our modal dialogs, don't pull it back
                // out to a background node.
                var focusedModal = active === null || active === void 0 ? void 0 : active.closest('[aria-modal="true"]');
                var trappedByModal = !!focusedModal &&
                    this.container.contains(focusedModal) &&
                    !focusedModal.contains(el);
                // Not while the proxy has focus (would steal the caret, drop the keyboard) nor onto
                // its aria-hidden stand-in.
                if (nodeId !== this.editingHostNodeId &&
                    active !== el &&
                    !trappedByModal &&
                    !this.isEditingHostFocused() &&
                    this.canMoveFocus()) {
                    // No scrollIntoView: this runs on semantic diffs and must not drag the page.
                    this.syncContainerBeforeFocus();
                    el.focus({ preventScroll: true });
                }
            }
            // Recurse into children with this node's absolute artboard position.
            if (nodeData.children.length > 0) {
                this.rebuildChildren(el, nodeData.children, tree, nodeData.minX, nodeData.minY, activeIds, applyAllAttributes);
            }
            // Focus a modal/alert dialog when it first appears (after children are
            // built so the focus target can be resolved from the subtree).
            if (isNew)
                this.autoFocusDialogOnAppear(el, nodeData, tree);
        }
    };
    /**
     * Reposition only the subtrees whose bounds changed in the latest diff.
     * Descendants are included because node CSS positions are parent-relative.
     */
    AccessibilityOverlay.prototype.updateGeometryForChangedNodes = function (tree) {
        var _a, _b;
        for (var _i = 0, _c = Array.from(tree.geometryChangedIds); _i < _c.length; _i++) {
            var nodeId = _c[_i];
            var nodeData = tree.nodeById(nodeId);
            if (!nodeData)
                continue;
            var parentLeft = 0;
            var parentTop = 0;
            var parentEl = (_a = this.transformContainer) !== null && _a !== void 0 ? _a : this.container;
            if (nodeData.parentId >= 0) {
                var parent_1 = tree.nodeById(nodeData.parentId);
                if (parent_1) {
                    parentLeft = parent_1.minX;
                    parentTop = parent_1.minY;
                    parentEl = (_b = this.elements.get(nodeData.parentId)) !== null && _b !== void 0 ? _b : parentEl;
                }
            }
            this.updateNodeGeometrySubtree(tree, nodeId, parentLeft, parentTop, parentEl);
        }
    };
    AccessibilityOverlay.prototype.updateNodeGeometrySubtree = function (tree, nodeId, parentArtboardLeft, parentArtboardTop, _parentEl) {
        var nodeData = tree.nodeById(nodeId);
        if (!nodeData)
            return;
        var el = this.elements.get(nodeId);
        if (!el)
            return;
        this.applyPosition(el, nodeData, parentArtboardLeft, parentArtboardTop);
        for (var _i = 0, _a = nodeData.children; _i < _a.length; _i++) {
            var childId = _a[_i];
            this.updateNodeGeometrySubtree(tree, childId, nodeData.minX, nodeData.minY, el);
        }
    };
    /**
     * Whether the overlay may move focus now. Following focus already inside this
     * instance is always allowed; pulling it in from the host page is gated behind
     * allowFocusInterrupt (from the Rive class).
     */
    AccessibilityOverlay.prototype.canMoveFocus = function () {
        var active = document.activeElement;
        var focusAlreadyInScope = active === this.canvas || this.container.contains(active);
        return focusAlreadyInScope || this.allowFocusInterrupt;
    };
    /**
     * Move focus into a newly appeared modal/alert dialog so screen readers
     * announce and read its content (web ATs don't auto-enter a freshly mounted
     * dialog). Skips when focus can't move (see canMoveFocus) or a descendant
     * already holds it. The dialog's aria-modal keeps focus trapped inside.
     */
    AccessibilityOverlay.prototype.autoFocusDialogOnAppear = function (el, node, tree) {
        var _a;
        if (!isModalDialogRole(node.role, node.stateFlags))
            return;
        if (!this.canMoveFocus())
            return;
        // A descendant already holds focus — don't override it.
        var active = document.activeElement;
        if (active && active !== el && el.contains(active))
            return;
        var target = (_a = this.routeDefaultFocusTarget(node, tree)) !== null && _a !== void 0 ? _a : el;
        if (!target.hasAttribute("tabindex"))
            target.setAttribute("tabindex", "-1");
        if (document.activeElement !== target)
            target.focus({ preventScroll: true });
    };
    /**
     * Resolve the element assistive technologies (AT) should focus on appearance. Walks the subtree
     * depth-first and returns the first focusable node's host element, else the
     * inner <span> of the first labeled leaf. Container and unlabeled nodes are
     * descended into but never focused. Returns null if nothing qualifies.
     */
    AccessibilityOverlay.prototype.routeDefaultFocusTarget = function (node, tree) {
        var _a;
        for (var _i = 0, _b = node.children; _i < _b.length; _i++) {
            var childId = _b[_i];
            var child = tree.nodeById(childId);
            if (!child)
                continue;
            var childEl = this.elements.get(childId);
            // Focusable node → its host element (even if it has children).
            if (childEl && isFocusableNode(child))
                return childEl;
            // Container or unlabeled node → descend without focusing it.
            if (child.children.length > 0 || !child.label) {
                var nested = this.routeDefaultFocusTarget(child, tree);
                if (nested)
                    return nested;
                continue;
            }
            // Labeled leaf → its inner label span.
            if (childEl) {
                return (_a = childEl.querySelector(":scope > span")) !== null && _a !== void 0 ? _a : childEl;
            }
        }
        return null;
    };
    Object.defineProperty(AccessibilityOverlay.prototype, "nodeIdPrefix", {
        // ---- Element creation ----
        /** Shared `id` prefix for all semantic node elements of this instance. */
        get: function () {
            return "rive-".concat(this.instanceId, "-sem-");
        },
        enumerable: false,
        configurable: true
    });
    /** Recover the semantic node ID from an overlay element, or null. */
    AccessibilityOverlay.prototype.nodeIdFromElement = function (el) {
        if (!el.id.startsWith(this.nodeIdPrefix))
            return null;
        var raw = el.id.slice(this.nodeIdPrefix.length);
        // Guard the empty string explicitly: Number("") is 0, not NaN.
        if (!raw)
            return null;
        var id = Number(raw);
        return Number.isNaN(id) ? null : id;
    };
    AccessibilityOverlay.prototype.createElement = function (node) {
        var tag = tagForRole(node.role);
        var el = document.createElement(tag);
        el.id = "".concat(this.nodeIdPrefix).concat(node.id);
        el.style.cssText = BASE_NODE_STYLE;
        if (node.role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.text) {
            // The positioned outer div is the AX element
            // VoiceOver uses for its highlight box; an inner <span> carries the text
            // without position:absolute (which would strip the span from VoiceOver's
            // bounds calculation).
            var textSpan = document.createElement("span");
            textSpan.style.cssText = SPAN_EXP;
            el.appendChild(textSpan);
        }
        this.attachActionHandlers(el, node);
        return el;
    };
    // ---- Action handlers ----
    /**
     * Wire arrow-key roving focus for a group member (tab, radio). Arrow keys
     * move focus to the next/previous member (wrapping), optionally Home/End jump
     * to first/last, and the newly focused member receives a tap action.
     */
    AccessibilityOverlay.prototype.attachRovingNav = function (el, opts) {
        var _this = this;
        el.addEventListener("keydown", function (e) {
            var target = null;
            if (e.key === "ArrowRight" || e.key === "ArrowDown")
                target = "next";
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                target = "prev";
            else if (opts.includeHomeEnd && e.key === "Home")
                target = "first";
            else if (opts.includeHomeEnd && e.key === "End")
                target = "last";
            if (!target)
                return;
            (0,_claimedKeyEvents__WEBPACK_IMPORTED_MODULE_0__.claimKeyEvent)(e);
            var members = opts.members();
            var idx = members.indexOf(el);
            if (idx < 0)
                return;
            var n = members.length;
            var next = target === "next" ? members[(idx + 1) % n]
                : target === "prev" ? members[(idx - 1 + n) % n]
                    : target === "first" ? members[0]
                        : members[n - 1];
            if (next && next !== el) {
                _this.focusElementInPlace(next);
                var nextId = _this.nodeIdFromElement(next);
                if (nextId !== null)
                    _this.fireAction(nextId, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticActionType.tap);
            }
        });
    };
    AccessibilityOverlay.prototype.attachActionHandlers = function (el, node) {
        var _this = this;
        var role = node.role;
        var nodeId = node.id;
        if (isClickableRole(role)) {
            el.addEventListener("click", function () {
                _this.fireAction(nodeId, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticActionType.tap);
            });
            // Links activate on Enter only (Space scrolls the page per browser
            // convention). All other clickable roles accept both Enter and Space.
            var activationKeys_1 = role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.link ? ["Enter"] : ["Enter", " "];
            el.addEventListener("keydown", function (e) {
                if (activationKeys_1.includes(e.key)) {
                    (0,_claimedKeyEvents__WEBPACK_IMPORTED_MODULE_0__.claimKeyEvent)(e);
                    _this.fireAction(nodeId, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticActionType.tap);
                }
            });
        }
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.slider) {
            el.addEventListener("keydown", function (e) {
                if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                    (0,_claimedKeyEvents__WEBPACK_IMPORTED_MODULE_0__.claimKeyEvent)(e);
                    _this.fireAction(nodeId, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticActionType.increase);
                }
                else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                    (0,_claimedKeyEvents__WEBPACK_IMPORTED_MODULE_0__.claimKeyEvent)(e);
                    _this.fireAction(nodeId, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticActionType.decrease);
                }
            });
        }
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tab) {
            this.attachRovingNav(el, {
                includeHomeEnd: true,
                members: function () {
                    var parent = el.parentElement;
                    if (!parent)
                        return [];
                    return Array.from(parent.children).filter(function (c) {
                        return c instanceof HTMLElement && c.getAttribute("role") === "tab";
                    });
                },
            });
        }
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.radioButton) {
            this.attachRovingNav(el, {
                includeHomeEnd: false,
                members: function () {
                    var _a;
                    var group = (_a = el.closest('[role="radiogroup"]')) !== null && _a !== void 0 ? _a : el.parentElement;
                    if (!group)
                        return [];
                    return Array.from(group.querySelectorAll('[role="radio"]'));
                },
            });
        }
        // Focus handler for nodes with the Focusable trait. When AT focuses an
        // element, notify the C++ runtime so it can update internal focus state
        // (visual focus rings, etc.). Gated on Focusable trait
        if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(node.traitFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Focusable)) {
            el.addEventListener("focus", function () {
                _this.requestFocus(nodeId);
            });
        }
    };
    // ---- Attribute application ----
    AccessibilityOverlay.prototype.isAriaHidden = function (node) {
        var role = node.role;
        var flags = node.stateFlags;
        // Hide from AT when explicitly hidden, or when an image has no accessible
        // name — a nameless role="img" is a WCAG 1.1.1 violation; treat it as
        // decorative instead.
        var isDecorativeImage = role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.image && !node.label;
        // The <input> proxy is the accessible element for the node it stands in for.
        var isEditingHostStandIn = node.id === this.editingHostNodeId;
        return ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Hidden) ||
            // Obscured text fields stay reachable (value withheld, like a native password input).
            ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Obscured) && role !== _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.textField) ||
            isDecorativeImage ||
            isEditingHostStandIn);
    };
    AccessibilityOverlay.prototype.applyAttributes = function (el, node) {
        var _a, _b, _c;
        this.appliedNodes.set(el, node);
        var role = node.role;
        var flags = node.stateFlags;
        var traits = node.traitFlags;
        // Role
        var ariaRole = ariaRoleForSemantic(role);
        if (ariaRole) {
            setAttr(el, "role", ariaRole);
        }
        else {
            removeAttr(el, "role");
        }
        // Links: a bare <a> with no href has no link semantics, so set the role
        // explicitly (ariaRoleForSemantic returns null for link → native <a>).
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.link) {
            setAttr(el, "role", "link");
        }
        // Tabindex — keep the screen-reader overlay out of the browser's sequential
        // Tab order. Interactive/focusable nodes remain programmatically focusable
        // so AT/runtime focus sync can still target them when needed. List items are
        // included because Mobile Safari won't iterate them otherwise.
        if (isInteractiveRole(role) ||
            (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(traits, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Focusable) ||
            role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.listItem) {
            setAttr(el, "tabindex", "-1");
        }
        else {
            removeAttr(el, "tabindex");
        }
        // Label / value / hint
        if (node.label) {
            setAttr(el, "aria-label", node.label);
        }
        else {
            removeAttr(el, "aria-label");
        }
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.slider) {
            if (node.value) {
                // aria-valuenow must be numeric; keep the display string (e.g. "75%")
                // in aria-valuetext only.
                var numericValue = parseFloat(node.value);
                if (Number.isFinite(numericValue)) {
                    setAttr(el, "aria-valuenow", String(numericValue));
                }
                else {
                    removeAttr(el, "aria-valuenow");
                }
                setAttr(el, "aria-valuetext", node.value);
            }
            else {
                removeAttr(el, "aria-valuenow");
                removeAttr(el, "aria-valuetext");
            }
            // TODO: aria-valuemin / aria-valuemax are required by ARIA.
            // Defaulting to horizontal; vertical sliders need orientation data from C++.
            setAttr(el, "aria-orientation", "horizontal");
            setBoolAttr(el, "aria-readonly", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.ReadOnly));
        }
        else {
            removeAttr(el, "aria-valuenow");
            removeAttr(el, "aria-valuetext");
            removeAttr(el, "aria-orientation");
            removeAttr(el, "aria-readonly");
        }
        if (node.hint) {
            var descId = "rive-".concat(this.instanceId, "-desc-").concat(node.id);
            var descEl = this.descElements.get(node.id);
            if (!descEl) {
                descEl = document.createElement("span");
                descEl.id = descId;
                descEl.style.cssText = DESC_SPAN_STYLE;
                this.container.appendChild(descEl);
                this.descElements.set(node.id, descEl);
            }
            if (descEl.textContent !== node.hint)
                descEl.textContent = node.hint;
            setAttr(el, "aria-describedby", descId);
        }
        else {
            removeAttr(el, "aria-describedby");
            var staleDesc = this.descElements.get(node.id);
            if (staleDesc) {
                if (staleDesc.parentNode)
                    staleDesc.parentNode.removeChild(staleDesc);
                this.descElements.delete(node.id);
            }
        }
        // Text nodes: use textContent rather than aria-label so screen readers
        // announce the text in virtual/browse mode (aria-label on a bare <span>
        // with no widget role is ignored by some AT in document browse mode).
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.text) {
            var textSpan = (_a = el.querySelector(":scope > span")) !== null && _a !== void 0 ? _a : el;
            var text = (_b = node.label) !== null && _b !== void 0 ? _b : "";
            if (textSpan.textContent !== text)
                textSpan.textContent = text;
            removeAttr(el, "aria-label");
            if (node.headingLevel > 0) {
                setAttr(el, "role", "heading");
                setAttr(el, "aria-level", String(node.headingLevel));
            }
            else {
                // The generic role branch above already cleared role="heading";
                // aria-level must go with it when a heading reverts to plain text.
                removeAttr(el, "aria-level");
            }
        }
        // ---- Trait-gated states ----
        // Only set the ARIA property when the trait is present. When the trait
        // is absent, remove the attribute so AT sees "not applicable" rather
        // than "false".
        if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(traits, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Expandable) && ARIA_EXPANDED_ROLES.has(role)) {
            setBoolAttr(el, "aria-expanded", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Expanded));
        }
        else {
            removeAttr(el, "aria-expanded");
        }
        // aria-selected is required on ALL tabs per ARIA spec regardless of trait;
        // for other roles it is trait-gated and guarded to ARIA_SELECTED_ROLES.
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tab) {
            setBoolAttr(el, "aria-selected", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Selected));
        }
        else if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(traits, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Selectable) && ARIA_SELECTED_ROLES.has(role)) {
            setBoolAttr(el, "aria-selected", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Selected));
        }
        else {
            removeAttr(el, "aria-selected");
        }
        if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(traits, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Checkable) && ARIA_CHECKED_ROLES.has(role)) {
            // Check state is a tri-state field, but not every checkable role
            // accepts all three values — see ARIA_MIXED_ROLES.
            var checkState = (0,_types__WEBPACK_IMPORTED_MODULE_2__.checkStateOf)(flags);
            if (checkState === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticCheckState.Mixed &&
                ARIA_MIXED_ROLES.has(role)) {
                setAttr(el, "aria-checked", "mixed");
            }
            else {
                setBoolAttr(el, "aria-checked", checkState === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticCheckState.Checked);
            }
        }
        else {
            removeAttr(el, "aria-checked");
        }
        if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(traits, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Toggleable)) {
            if (ARIA_PRESSED_ROLES.has(role)) {
                setBoolAttr(el, "aria-pressed", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Toggled));
            }
            else {
                removeAttr(el, "aria-pressed");
            }
            // switch uses aria-checked (not aria-pressed) for its on/off state.
            if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.switchControl) {
                setBoolAttr(el, "aria-checked", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Toggled));
            }
        }
        else {
            removeAttr(el, "aria-pressed");
        }
        if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(traits, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Requirable) && ARIA_REQUIRED_ROLES.has(role)) {
            setBoolAttr(el, "aria-required", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Required));
        }
        else {
            removeAttr(el, "aria-required");
        }
        if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(traits, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Enablable)) {
            setBoolAttr(el, "aria-disabled", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Disabled));
        }
        else {
            removeAttr(el, "aria-disabled");
        }
        // ---- Non-trait states ----
        if (this.isAriaHidden(node)) {
            setAttr(el, "aria-hidden", "true");
        }
        else {
            removeAttr(el, "aria-hidden");
        }
        if ((0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.LiveRegion)) {
            setAttr(el, "aria-live", "polite");
        }
        else {
            removeAttr(el, "aria-live");
        }
        // textField-specific
        // TODO: Details here may change once we implement text inputs
        if (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.textField) {
            setBoolAttr(el, "aria-readonly", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.ReadOnly));
            setBoolAttr(el, "aria-multiline", (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Multiline));
            // Surface the current field value as DOM text so screen readers can
            // announce it. Only safe when the node has no semantic children —
            // setting textContent would remove any child elements from the DOM.
            if (node.children.length === 0) {
                var value = (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Obscured) ? "" : ((_c = node.value) !== null && _c !== void 0 ? _c : "");
                if (el.textContent !== value)
                    el.textContent = value;
            }
            else {
                // A value rendered earlier (before the node had children) must not linger,
                // least of all once the field turns Obscured.
                for (var _i = 0, _d = Array.from(el.childNodes); _i < _d.length; _i++) {
                    var child = _d[_i];
                    if (child.nodeType === Node.TEXT_NODE)
                        child.remove();
                }
            }
        }
        else {
            removeAttr(el, "aria-multiline");
        }
        // alertDialog is always modal per WAI-ARIA; a plain dialog only when the Modal state flag is set.
        if (isModalDialogRole(role, flags)) {
            setAttr(el, "aria-modal", "true");
        }
        else {
            removeAttr(el, "aria-modal");
        }
    };
    // ---- Positioning ----
    /**
     * Positions an element in artboard-space coordinates relative to its parent.
     *
     * Node bounds stay in raw artboard units — the CSS `transform: matrix(...)`
     * on the transform container maps artboard units to CSS pixels in one GPU
     * pass. No per-node forwardMat multiplication or DPR division needed here.
     *
     * Round to whole artboard units before comparing to avoid triggering AX
     * layout notifications from sub-unit floating-point animation jitter.
     */
    AccessibilityOverlay.prototype.applyPosition = function (el, node, parentArtboardLeft, parentArtboardTop) {
        // Clamp each node's rect to the artboard viewport before computing CSS.
        // Without this, nodes whose artboard bounds exceed the artboard (e.g. a
        // scroll list container whose height is the full content, not the viewport)
        // produce CSS heights that overflow the transform container. WebKit then
        // unions all descendant AX rects and extends the container's AX origin
        // above the canvas regardless of overflow:hidden on ancestors.
        var ab = this._artboardBounds;
        var clampedMinX = Math.max(node.minX, ab.minX);
        var clampedMinY = Math.max(node.minY, ab.minY);
        var clampedMaxX = Math.min(node.maxX, ab.maxX);
        var clampedMaxY = Math.min(node.maxY, ab.maxY);
        var elLeft = clampedMinX - parentArtboardLeft;
        var elTop = clampedMinY - parentArtboardTop;
        var elWidth = Math.max(0, clampedMaxX - clampedMinX);
        var elHeight = Math.max(0, clampedMaxY - clampedMinY);
        var tx = Math.round(elLeft);
        var ty = Math.round(elTop);
        var pxWidth = Math.round(elWidth) + "px";
        var pxHeight = Math.round(elHeight) + "px";
        // Use left/top layout properties for positioning. VoiceOver reliably
        // handles layout position + a single ancestor CSS transform (the transform
        // container). Chaining CSS transforms across multiple stacking contexts
        // (transform container → node identity → item translate) caused VoiceOver
        // to compute the correct SIZE but wrong POSITION. Artboard clamping above
        // guarantees tx/ty are always ≥ 0, so the negative-top overflow problem
        // that originally prompted the switch to CSS transforms no longer applies.
        var pxLeft = tx + "px";
        var pxTop = ty + "px";
        if (el.style.left !== pxLeft)
            el.style.left = pxLeft;
        if (el.style.top !== pxTop)
            el.style.top = pxTop;
        if (el.style.width !== pxWidth)
            el.style.width = pxWidth;
        if (el.style.height !== pxHeight)
            el.style.height = pxHeight;
        // Clear any CSS transform from a previous render pass.
        if (el.style.transform)
            el.style.transform = "";
        if (node.role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.text) {
            this.pendingTextGeometry.push(el);
        }
    };
    /**
     * Scale each queued text span to fit its layout box, batched so a frame
     * pays at most one synchronous layout: all measurement-reset writes first,
     * then all rect reads, then all transform writes. Interleaving
     * write→read→write per node would force a reflow per text node instead.
     *
     * Nodes whose box size and text are unchanged since the last pass are
     * skipped entirely (their existing transform is still correct — the scale
     * is a ratio of two rects, so ancestor transform changes cancel out).
     */
    AccessibilityOverlay.prototype.flushTextGeometry = function () {
        var _a;
        if (this.pendingTextGeometry.length === 0)
            return;
        // Phase 1 — writes: reset spans to their natural size for measurement.
        // The previous pass's scale must be cleared, or the rect reads below
        // would measure the scaled span and compound the correction.
        var toMeasure = [];
        for (var _i = 0, _b = this.pendingTextGeometry; _i < _b.length; _i++) {
            var host = _b[_i];
            var span = (_a = host.querySelector(":scope > span")) !== null && _a !== void 0 ? _a : host;
            var key = "".concat(host.style.width, "|").concat(host.style.height, "|").concat(span.textContent);
            if (this.textGeometryKeys.get(host) === key)
                continue;
            span.style.width = "auto";
            span.style.height = "auto";
            span.style.transformOrigin = "0 0";
            span.style.transform = "";
            toMeasure.push({ host: host, span: span, key: key });
        }
        this.pendingTextGeometry.length = 0;
        // Phase 2 — reads: one layout pass covers every rect measurement.
        var transforms = toMeasure.map(function (_a) {
            var host = _a.host, span = _a.span;
            var parentRect = host.getBoundingClientRect();
            var natural = span.getBoundingClientRect();
            if (natural.width > 0 && natural.height > 0) {
                var scaleX = parentRect.width / natural.width;
                var scaleY = parentRect.height / natural.height;
                return "scale(".concat(scaleX, ", ").concat(scaleY, ")");
            }
            return "none";
        });
        // Phase 3 — writes: apply all transforms.
        for (var i = 0; i < toMeasure.length; i++) {
            var _c = toMeasure[i], host = _c.host, span = _c.span, key = _c.key;
            span.style.transform = transforms[i];
            this.textGeometryKeys.set(host, key);
        }
    };
    // ---- Transform container ----
    /**
     * Creates (on first call) and updates the artboard-space transform container.
     *
     * The container is sized to the artboard dimensions and carries a CSS
     * `transform: matrix(...)` that maps artboard coordinates to the canvas's CSS box
     * (forwardMat in backing-store pixels, scaled by CSS size / backing-store size). All semantic
     * node elements are children of this container and use raw artboard
     * coordinates as their CSS `left/top/width/height`, so the CSS compositor
     * applies the artboard→screen mapping in one pass.
     */
    AccessibilityOverlay.prototype.syncTransformContainer = function (forwardMat, dpr, artboardBounds) {
        if (!this.transformContainer) {
            var tc = document.createElement("div");
            tc.style.cssText = [
                "position:absolute",
                "top:0",
                "left:0",
                // overflow:visible — artboard viewport clamping is done per-node in
                // applyPosition
                "overflow:visible",
                "pointer-events:none",
                "transform-origin:0 0",
            ].join(";");
            this.container.appendChild(tc);
            this.transformContainer = tc;
        }
        var w = artboardBounds.maxX - artboardBounds.minX;
        var h = artboardBounds.maxY - artboardBounds.minY;
        this.transformContainer.style.width = Math.round(w) + "px";
        this.transformContainer.style.height = Math.round(h) + "px";
        // Backing-store pixels → CSS pixels. Measured rather than 1/dpr: a canvas can be
        // stretched by CSS, or have a stale backing store after a resize, and the drawn
        // content follows the CSS box either way. Equal to 1/dpr when they match.
        var cssWidth = this.lastCanvasPositioning.width;
        var cssHeight = this.lastCanvasPositioning.height;
        var fallback = 1 / (dpr || 1);
        var sx = this.canvas.width > 0 && cssWidth > 0 ? cssWidth / this.canvas.width : fallback;
        var sy = this.canvas.height > 0 && cssHeight > 0 ? cssHeight / this.canvas.height : fallback;
        var a = forwardMat.xx * sx;
        var b = forwardMat.xy * sy;
        var c = forwardMat.yx * sx;
        var d = forwardMat.yy * sy;
        var tx = forwardMat.tx * sx;
        var ty = forwardMat.ty * sy;
        this.transformContainer.style.transform =
            "matrix(".concat(a, ",").concat(b, ",").concat(c, ",").concat(d, ",").concat(tx, ",").concat(ty, ")");
    };
    return AccessibilityOverlay;
}());

// ---------------------------------------------------------------------------
// Static helpers (module-private)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ARIA attribute eligibility — role sets
//
// Each set lists the Rive roles for which a given ARIA attribute is valid per
// WAI-ARIA 1.2 ("Used in roles" + "Inherits into roles"). The trait-gated
// blocks in applyAttributes check these before setting an attribute so that
// C++ nodes with unexpected trait combinations never produce invalid markup.
//
// To add a new role: append it to the relevant set(s) here — no other changes
// needed in applyAttributes.
// ---------------------------------------------------------------------------
/** aria-expanded: button, link, checkbox, switch (inherits button), tab. */
var ARIA_EXPANDED_ROLES = new Set([
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.button,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.link,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.checkbox,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.switchControl,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tab,
]);
/**
 * aria-selected: tab is the only role in our current set that natively
 * supports it. Tab is also handled by an explicit unconditional branch in
 * applyAttributes (ARIA requires it there regardless of Selectable trait), but
 * the set still lists it so the constraint is visible in one place.
 */
var ARIA_SELECTED_ROLES = new Set([
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tab,
]);
/** aria-checked: checkbox, radio, switch. */
var ARIA_CHECKED_ROLES = new Set([
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.checkbox,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.radioButton,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.switchControl,
]);
/**
 * aria-checked="mixed": checkbox only. ARIA defines checkbox as three-valued
 * (true/false/mixed) but radio and switch as two-valued (true/false), so an
 * indeterminate check state degrades to false for those roles rather than
 * emitting a value they do not support.
 */
var ARIA_MIXED_ROLES = new Set([
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.checkbox,
]);
/**
 * aria-pressed: button only. switch is a button subclass in ARIA but uses
 * aria-checked (not aria-pressed) for its on/off state — it is intentionally
 * excluded here and handled separately in the Toggleable block.
 */
var ARIA_PRESSED_ROLES = new Set([
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.button,
]);
/** aria-required: checkbox, textbox, radiogroup. */
var ARIA_REQUIRED_ROLES = new Set([
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.checkbox,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.textField,
    _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.radioGroup,
]);
// ---------------------------------------------------------------------------
/** Style for visually-hidden description spans used with aria-describedby. */
var DESC_SPAN_STYLE = [
    "position:absolute",
    "width:1px",
    "height:1px",
    "overflow:hidden",
    "pointer-events:none",
    "left:-9999px",
].join(";");
var BASE_NODE_STYLE = [
    "position:absolute",
    "pointer-events:none",
    "box-sizing:border-box",
    "overflow:visible",
    "margin:0",
    "padding:0",
    "transform-origin: 0px 0px 0px",
    "border:none",
    "background:transparent",
    "color:transparent",
    // "list-style:none",
].join(";");
var SPAN_EXP = [
    "display:inline-block",
    "white-space:nowrap",
    "pointer-events:none",
].join(";");
/**
 * Attribute writers that skip same-value mutations. Even a no-op setAttribute
 * fires a mutation record, and whether AX layers dedupe those is
 * browser-specific — skipping the write is the only browser-proof guard.
 */
function setAttr(el, attr, value) {
    if (el.getAttribute(attr) !== value)
        el.setAttribute(attr, value);
}
function removeAttr(el, attr) {
    if (el.hasAttribute(attr))
        el.removeAttribute(attr);
}
function setBoolAttr(el, attr, value) {
    setAttr(el, attr, value ? "true" : "false");
}
/** Roles that receive click/Enter/Space action handlers. */
function isClickableRole(role) {
    switch (role) {
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.button:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.link:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.checkbox:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.switchControl:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tab:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.radioButton:
            return true;
        default:
            return false;
    }
}
/** Roles that receive tabindex="-1" for programmatic/AT focus (not Tab order). */
function isInteractiveRole(role) {
    switch (role) {
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.button:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.link:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.checkbox:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.switchControl:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.slider:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tab:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.radioButton:
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.textField:
            return true;
        default:
            return false;
    }
}
/**
 * A modal/alert dialog: alertDialog is always modal per WAI-ARIA, a plain
 * dialog only when the Modal state flag is set.
 */
function isModalDialogRole(role, flags) {
    return (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.alertDialog ||
        (role === _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.dialog && (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasState)(flags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticState.Modal)));
}
/** Whether a node can receive focus: an interactive role or the Focusable trait. */
function isFocusableNode(node) {
    return (isInteractiveRole(node.role) ||
        (0,_types__WEBPACK_IMPORTED_MODULE_2__.hasTrait)(node.traitFlags, _types__WEBPACK_IMPORTED_MODULE_2__.SemanticTrait.Focusable));
}
/**
 * Choose an HTML tag for a given role. Prefer native semantic elements
 * where they exist — screen readers treat them more reliably than
 * generic elements with ARIA role overrides.
 */
function tagForRole(role) {
    switch (role) {
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.link:
            return "a";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.text:
            // The outer div is the positioned AX element VoiceOver measures for its
            // highlight box. The text itself lives in a child <span> (see createElement).
            return "div";
        default:
            return "div";
    }
}
/**
 * Maps a Rive SemanticRole to an ARIA `role` attribute value.
 * Returns null for roles that don't need an explicit role attribute here
 * (e.g. text nodes use an outer div + inner span with textContent; heading
 * role is applied separately when headingLevel > 0).
 */
function ariaRoleForSemantic(role) {
    switch (role) {
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.none:
            // TODO: Role "none" removes the node from the accessibility tree. For now, setting to Group, but maybe we want to switch to "none"
            // or "presentation".
            return "group";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.button:
            return "button";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.link:
            return null; // native <a>
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.checkbox:
            return "checkbox";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.switchControl:
            return "switch";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.slider:
            return "slider";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.textField:
            return "textbox";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.image:
            return "img";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.group:
            return "group";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.list:
            return "list";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.listItem:
            return "listitem";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tab:
            return "tab";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.tabList:
            return "tablist";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.dialog:
            return "dialog";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.alertDialog:
            return "alertdialog";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.radioGroup:
            return "radiogroup";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.radioButton:
            return "radio";
        case _types__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.text:
            // Text nodes use <span>; heading role is applied separately
            // when headingLevel > 0.
            return null;
        default:
            return null;
    }
}


/***/ }),
/* 11 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   claimKeyEvent: () => (/* binding */ claimKeyEvent),
/* harmony export */   isKeyEventClaimed: () => (/* binding */ isKeyEventClaimed)
/* harmony export */ });
var claimed = new WeakSet();
/**
 * Marks a key event as handled by a semantic overlay widget (and prevents its
 * default), so the Rive keyboard handler leaves it alone. A plain
 * `defaultPrevented` check can't tell these apart from host-page handlers.
 */
function claimKeyEvent(event) {
    event.preventDefault();
    claimed.add(event);
}
function isKeyEventClaimed(event) {
    return claimed.has(event);
}


/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   canvasOffset: () => (/* binding */ canvasOffset)
/* harmony export */ });
/**
 * Canvas offset within its offsetParent, minus the scroll of ancestors in between (they
 * move the canvas, not absolutely positioned siblings).
 */
function canvasOffset(canvas) {
    var top = canvas.offsetTop;
    var left = canvas.offsetLeft;
    var offsetParent = canvas.offsetParent;
    if (!offsetParent)
        return { top: top, left: left };
    for (var el = canvas.parentElement; el && el !== offsetParent; el = el.parentElement) {
        top -= el.scrollTop;
        left -= el.scrollLeft;
    }
    return { top: top, left: left };
}


/***/ }),
/* 13 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AudioAssetWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.AudioAssetWrapper),
/* harmony export */   AudioWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.AudioWrapper),
/* harmony export */   BLANK_URL: () => (/* reexport safe */ _sanitizeUrl__WEBPACK_IMPORTED_MODULE_2__.BLANK_URL),
/* harmony export */   CustomFileAssetLoaderWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.CustomFileAssetLoaderWrapper),
/* harmony export */   FileAssetWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.FileAssetWrapper),
/* harmony export */   FileFinalizer: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.FileFinalizer),
/* harmony export */   FocusSessionState: () => (/* reexport safe */ _registerKeyboardInteractions__WEBPACK_IMPORTED_MODULE_1__.FocusSessionState),
/* harmony export */   FontAssetWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.FontAssetWrapper),
/* harmony export */   FontWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.FontWrapper),
/* harmony export */   ImageAssetWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.ImageAssetWrapper),
/* harmony export */   ImageWrapper: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.ImageWrapper),
/* harmony export */   KeyboardInteractions: () => (/* reexport safe */ _registerKeyboardInteractions__WEBPACK_IMPORTED_MODULE_1__.KeyboardInteractions),
/* harmony export */   RiveFont: () => (/* reexport safe */ _riveFont__WEBPACK_IMPORTED_MODULE_4__.RiveFont),
/* harmony export */   createFinalization: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.createFinalization),
/* harmony export */   finalizationRegistry: () => (/* reexport safe */ _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__.finalizationRegistry),
/* harmony export */   registerTouchInteractions: () => (/* reexport safe */ _registerTouchInteractions__WEBPACK_IMPORTED_MODULE_0__.registerTouchInteractions),
/* harmony export */   sanitizeUrl: () => (/* reexport safe */ _sanitizeUrl__WEBPACK_IMPORTED_MODULE_2__.sanitizeUrl)
/* harmony export */ });
/* harmony import */ var _registerTouchInteractions__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(14);
/* harmony import */ var _registerKeyboardInteractions__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(15);
/* harmony import */ var _sanitizeUrl__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(18);
/* harmony import */ var _finalizationRegistry__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(19);
/* harmony import */ var _riveFont__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(20);







/***/ }),
/* 14 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   registerTouchInteractions: () => (/* binding */ registerTouchInteractions)
/* harmony export */ });
var _this = undefined;
// A detented wheel reports lines; the runtime wants pixels.
var PIXELS_PER_LINE = 16;
// ScrollPhase.update. The DOM reports no gesture phase, so every wheel event
// is an update and the runtime closes the gesture once it goes quiet.
var SCROLL_PHASE_UPDATE = 1;
/**
 * Touch state per canvas. It outlives a single registration, because Rive
 * re-registers the listeners (on play and pause) while a finger can still be
 * down.
 */
var touchStateByCanvas = new WeakMap();
/**
 * Extracts ClientCoordinates from a TouchList, respecting multi-touch vs.
 * single-touch mode. In single-touch mode, only the touch matching
 * primaryTouchId is returned (or the first touch when primaryTouchId is null).
 */
var getTouchCoordinates = function (changedTouches, enableMultiTouch, primaryTouchId) {
    var _a;
    var coordinates = [];
    if (enableMultiTouch) {
        for (var i = 0; i < changedTouches.length; i++) {
            var touch = changedTouches[i];
            coordinates.push({
                clientX: touch.clientX,
                clientY: touch.clientY,
                identifier: touch.identifier,
            });
        }
    }
    else {
        // In "single-touch mode", only track the primary finger identified at touchstart.
        // Search changedTouches for the touch matching the recorded primary touch identifier, or (on initial touchstart)
        // take the first available touch identifier.
        var primaryTouch = primaryTouchId !== null
            ? (_a = Array.from(changedTouches).find(function (t) { return t.identifier === primaryTouchId; })) !== null && _a !== void 0 ? _a : null
            : changedTouches[0];
        if (primaryTouch) {
            coordinates.push({
                clientX: primaryTouch.clientX,
                clientY: primaryTouch.clientY,
                identifier: primaryTouch.identifier,
            });
        }
    }
    return coordinates;
};
/**
 * Returns the clientX and clientY properties from touch or mouse events. Also
 * calls preventDefault() on the event if it is a touchstart or touchmove to prevent
 * scrolling the page on mobile devices
 * @param event - Either a TouchEvent or a MouseEvent
 * @param isTouchScrollEnabled - Whether touch scrolling is enabled
 * @param enableMultiTouch - Whether to process multiple simultaneous touches
 * @param primaryTouchId - When working with single touches, only process the touch
 *   with this identifier. Pass null to accept any touch (used during touchstart to
 *   capture the first finger down).
 * @returns - Coordinates of the clientX and clientY properties from the touch/mouse event
 */
var getClientCoordinates = function (event, isTouchScrollEnabled, enableMultiTouch, primaryTouchId) {
    var _a;
    var touchEvent = event;
    if ((_a = touchEvent.changedTouches) === null || _a === void 0 ? void 0 : _a.length) {
        // This flag, if false, prevents touch events on the canvas default behavior
        // which may prevent scrolling if a drag motion on the canvas is performed
        if (!isTouchScrollEnabled && ["touchstart", "touchmove"].includes(event.type)) {
            event.preventDefault();
        }
        return getTouchCoordinates(touchEvent.changedTouches, enableMultiTouch, primaryTouchId);
    }
    return [
        {
            clientX: event.clientX,
            clientY: event.clientY,
            identifier: 0,
        },
    ];
};
/**
 * Registers mouse move/up/down and wheel callback handlers on the canvas to send meaningful
 * coordinates to the state machine pointer move/up/down/scroll functions based on cursor
 * interaction
 */
var registerTouchInteractions = function (_a) {
    var _b;
    var canvas = _a.canvas, artboard = _a.artboard, _c = _a.stateMachines, stateMachines = _c === void 0 ? [] : _c, renderer = _a.renderer, rive = _a.rive, fit = _a.fit, alignment = _a.alignment, _d = _a.isTouchScrollEnabled, isTouchScrollEnabled = _d === void 0 ? false : _d, _e = _a.dispatchPointerExit, dispatchPointerExit = _e === void 0 ? true : _e, _f = _a.enableMultiTouch, enableMultiTouch = _f === void 0 ? false : _f, _g = _a.layoutScaleFactor, layoutScaleFactor = _g === void 0 ? 1.0 : _g, advanceAndDrain = _a.advanceAndDrain, summonKeyboard = _a.summonKeyboard, isTextProxyFocused = _a.isTextProxyFocused;
    if (!canvas ||
        !stateMachines.length ||
        !renderer ||
        !rive ||
        !artboard ||
        typeof window === "undefined") {
        return null;
    }
    // A gesture latched before the previous listeners came down (a pause, say)
    // never reached its idle timeout, and would take the next wheel wherever
    // it lands. These instances are live here; at teardown they may not be.
    for (var _i = 0, stateMachines_1 = stateMachines; _i < stateMachines_1.length; _i++) {
        var stateMachine = stateMachines_1[_i];
        stateMachine.cancelScroll();
    }
    /**
     * After a touchend event, some browsers may fire synthetic mouse events
     * (mouseover, mousedown, mousemove, mouseup) if the touch interaction did not cause
     * any default action (such as scrolling).
     *
     * This is done to simulate the behavior of a mouse for applications that do not support
     * touch events.
     *
     * We're keeping track of the previous event to not send the synthetic mouse events if the
     * touch event was a click (touchstart -> touchend).
     *
     * Emulated events only occur when `isTouchScrollEnabled` is true; when false,
     * touchstart is default-prevented, which suppresses them.
     * Emulated mousedown is prevented while the proxy is focused, or it would blur it and
     * drop the keyboard.
     **/
    var _prevEventType = null;
    var _syntheticEventsActive = false;
    /**
     * primaryTouchId: when enableMultiTouch is false ("single-touch mode"),
     * we track the identifier of the first finger that touched down. All
     * subsequent touch events are filtered to this identifier so that a second
     * finger moving cannot displace the tracked pointer position. Reset to null
     * when the primary finger lifts (or touchcancel is called).
     *
     * touches: a cancel may report no position, or none at all for some
     * touches, so it ends them where they were last seen.
     */
    var _touchState = (_b = touchStateByCanvas.get(canvas)) !== null && _b !== void 0 ? _b : {
        touches: new Map(),
        primaryTouchId: null,
    };
    touchStateByCanvas.set(canvas, _touchState);
    var _activeTouches = _touchState.touches;
    /**
     * A finger can lift while no listeners are registered (after stop(), say),
     * so its touchend never arrives. A touchstart or touchmove lists every
     * finger still down in `touches`; forget the rest.
     */
    var forgetLiftedTouches = function (_a) {
        var _b;
        var touches = _a.touches, changedTouches = _a.changedTouches;
        if (!touches) {
            return;
        }
        var down = new Set();
        for (var i = 0; i < touches.length; i++) {
            down.add(touches[i].identifier);
        }
        for (var i = 0; i < ((_b = changedTouches === null || changedTouches === void 0 ? void 0 : changedTouches.length) !== null && _b !== void 0 ? _b : 0); i++) {
            down.add(changedTouches[i].identifier);
        }
        _activeTouches.forEach(function (_, identifier) {
            if (!down.has(identifier)) {
                _activeTouches.delete(identifier);
            }
        });
        if (_touchState.primaryTouchId !== null &&
            !down.has(_touchState.primaryTouchId)) {
            _touchState.primaryTouchId = null;
        }
    };
    /**
     * Maps client-space points into Artboard space through the fit and alignment
     * of the canvas.
     */
    var mapToArtboard = function (boundingRect, points) {
        var forwardMatrix = rive.computeAlignment(fit, alignment, {
            minX: 0,
            minY: 0,
            maxX: boundingRect.width,
            maxY: boundingRect.height,
        }, artboard.bounds, layoutScaleFactor);
        var invertedMatrix = new rive.Mat2D();
        forwardMatrix.invert(invertedMatrix);
        var mapped = points.map(function (_a) {
            var clientX = _a.clientX, clientY = _a.clientY;
            var canvasX = clientX - boundingRect.left;
            var canvasY = clientY - boundingRect.top;
            var canvasCoordinatesVector = new rive.Vec2D(canvasX, canvasY);
            var transformedVector = rive.mapXY(invertedMatrix, canvasCoordinatesVector);
            var point = { x: transformedVector.x(), y: transformedVector.y() };
            transformedVector.delete();
            canvasCoordinatesVector.delete();
            return point;
        });
        invertedMatrix.delete();
        forwardMatrix.delete();
        return mapped;
    };
    var processEventCallback = function (event) {
        var _a, _b;
        // Exit early out of all synthetic mouse events
        // https://stackoverflow.com/questions/9656990/how-to-prevent-simulated-mouse-events-in-mobile-browsers
        // https://stackoverflow.com/questions/25572070/javascript-touchend-versus-click-dilemma
        if (_syntheticEventsActive && event instanceof MouseEvent) {
            if (event.type === "mousedown" && (isTextProxyFocused === null || isTextProxyFocused === void 0 ? void 0 : isTextProxyFocused())) {
                event.preventDefault();
            }
            // Synthetic event finished
            if (event.type == "mouseup") {
                _syntheticEventsActive = false;
            }
            return;
        }
        // Test if it's a "touch click". This could cause the browser to send
        // synthetic mouse events.
        _syntheticEventsActive =
            isTouchScrollEnabled &&
                event.type === "touchend" &&
                _prevEventType === "touchstart";
        _prevEventType = event.type;
        var boundingRect = event.currentTarget.getBoundingClientRect();
        if (event.type === "touchstart" || event.type === "touchmove") {
            forgetLiftedTouches(event);
        }
        // On touchstart in single-touch mode, record the first new finger as the primary
        // touch if we aren't already tracking one.
        if (!enableMultiTouch && event.type === "touchstart" && _touchState.primaryTouchId === null) {
            var firstTouch = (_a = event.changedTouches) === null || _a === void 0 ? void 0 : _a[0];
            if (firstTouch) {
                _touchState.primaryTouchId = firstTouch.identifier;
            }
        }
        var coordinateSets = getClientCoordinates(event, isTouchScrollEnabled, enableMultiTouch, enableMultiTouch ? null : _touchState.primaryTouchId);
        var positionedSets = coordinateSets.filter(function (coordinateSet) { return coordinateSet.clientX || coordinateSet.clientY; });
        mapToArtboard(boundingRect, positionedSets).forEach(function (point, i) {
            positionedSets[i].transformedX = point.x;
            positionedSets[i].transformedY = point.y;
        });
        // Only a touchstart the scene saw starts tracking a touch, so a finger
        // that single-touch mode ignored can never be ended by a cancel. Any
        // finger that lifts stops being tracked, whether or not the scene saw it.
        if (event.type === "touchend") {
            var lifted = (_b = event.changedTouches) !== null && _b !== void 0 ? _b : [];
            for (var i = 0; i < lifted.length; i++) {
                _activeTouches.delete(lifted[i].identifier);
            }
        }
        else if (event.type === "touchstart" || event.type === "touchmove") {
            coordinateSets.forEach(function (_a) {
                var clientX = _a.clientX, clientY = _a.clientY, identifier = _a.identifier;
                var tracked = _activeTouches.has(identifier);
                if (event.type === "touchstart" && !tracked) {
                    _activeTouches.set(identifier, { clientX: clientX, clientY: clientY });
                }
                else if (tracked && (clientX || clientY)) {
                    _activeTouches.set(identifier, { clientX: clientX, clientY: clientY });
                }
            });
        }
        switch (event.type) {
            /**
             * There's a 2px buffer for a hitRadius when translating the pointer coordinates
             * down to the state machine. In cases where the hitbox is about that much away
             * from the Artboard border, we don't have exact precision on determining pointer
             * exit. We're therefore adding to the translated coordinates on mouseout of a canvas
             * to ensure that we report the mouse has truly exited the hitarea.
             * https://github.com/rive-app/rive-cpp/blob/master/src/animation/state_machine_instance.cpp#L336
             *
             */
            case "mouseout":
                var _loop_1 = function (stateMachine) {
                    if (dispatchPointerExit) {
                        coordinateSets.forEach(function (coordinateSet) {
                            stateMachine.pointerExit(coordinateSet.transformedX, coordinateSet.transformedY, coordinateSet.identifier);
                        });
                    }
                    else {
                        coordinateSets.forEach(function (coordinateSet) {
                            stateMachine.pointerMove(coordinateSet.transformedX, coordinateSet.transformedY, coordinateSet.identifier);
                        });
                    }
                };
                for (var _i = 0, stateMachines_2 = stateMachines; _i < stateMachines_2.length; _i++) {
                    var stateMachine = stateMachines_2[_i];
                    _loop_1(stateMachine);
                }
                break;
            // Pointer moving/hovering on the canvas
            case "touchmove":
            case "mouseover":
            case "mousemove": {
                var _loop_2 = function (stateMachine) {
                    coordinateSets.forEach(function (coordinateSet) {
                        stateMachine.pointerMove(coordinateSet.transformedX, coordinateSet.transformedY, coordinateSet.identifier);
                    });
                };
                for (var _c = 0, stateMachines_3 = stateMachines; _c < stateMachines_3.length; _c++) {
                    var stateMachine = stateMachines_3[_c];
                    _loop_2(stateMachine);
                }
                break;
            }
            // Pointer click initiated but not released yet on the canvas
            case "touchstart":
            case "mousedown": {
                var _loop_3 = function (stateMachine) {
                    coordinateSets.forEach(function (coordinateSet) {
                        stateMachine.pointerDown(coordinateSet.transformedX, coordinateSet.transformedY, coordinateSet.identifier);
                    });
                };
                for (var _d = 0, stateMachines_4 = stateMachines; _d < stateMachines_4.length; _d++) {
                    var stateMachine = stateMachines_4[_d];
                    _loop_3(stateMachine);
                }
                // Advance the state machine immediately so pointer down(s) takes effect synchronously
                advanceAndDrain(0, { pointerDown: true });
                break;
            }
            // Pointer click released on the canvas
            case "touchend": {
                var _loop_4 = function (stateMachine) {
                    coordinateSets.forEach(function (coordinateSet) {
                        stateMachine.pointerUp(coordinateSet.transformedX, coordinateSet.transformedY, coordinateSet.identifier);
                        stateMachine.pointerExit(coordinateSet.transformedX, coordinateSet.transformedY, coordinateSet.identifier);
                    });
                };
                for (var _e = 0, stateMachines_5 = stateMachines; _e < stateMachines_5.length; _e++) {
                    var stateMachine = stateMachines_5[_e];
                    _loop_4(stateMachine);
                }
                // Advance the state machine immediately so pointer up(s) takes effect synchronously
                advanceAndDrain(0);
                // Still inside the touch gesture — summon the keyboard if the tap focused a
                // text input
                summonKeyboard === null || summonKeyboard === void 0 ? void 0 : summonKeyboard();
                // Release the primary touch lock once that finger lifts so the next
                // touchstart can claim a new primary finger.
                if (!enableMultiTouch &&
                    coordinateSets.some(function (c) { return c.identifier === _touchState.primaryTouchId; })) {
                    _touchState.primaryTouchId = null;
                }
                break;
            }
            case "mouseup": {
                var _loop_5 = function (stateMachine) {
                    coordinateSets.forEach(function (coordinateSet) {
                        stateMachine.pointerUp(coordinateSet.transformedX, coordinateSet.transformedY, coordinateSet.identifier);
                    });
                };
                for (var _f = 0, stateMachines_6 = stateMachines; _f < stateMachines_6.length; _f++) {
                    var stateMachine = stateMachines_6[_f];
                    _loop_5(stateMachine);
                }
                // Advance the state machine immediately so pointer up(s) takes effect synchronously
                advanceAndDrain(0);
                summonKeyboard === null || summonKeyboard === void 0 ? void 0 : summonKeyboard();
                break;
            }
            default:
        }
    };
    /**
     * The browser cancels a touch when the system takes the gesture: a home
     * indicator or edge swipe, an app switch, an alert. Each cancelled touch
     * gets pointerUp then pointerExit, like a lifted finger, so anything
     * waiting for the release doesn't stay pressed. It skips the tap-only side
     * effects (keyboard, emulated mouse events). A page scroll does not cancel
     * the touch in iOS Safari or Android Chrome (it ends with a touchend), so
     * this holds with touch scrolling enabled too.
     */
    var touchCancelCallback = function (event) {
        var _a, _b;
        var cancelled = new Set();
        var changedTouches = (_a = event.changedTouches) !== null && _a !== void 0 ? _a : [];
        for (var i = 0; i < changedTouches.length; i++) {
            var _c = changedTouches[i], identifier = _c.identifier, clientX = _c.clientX, clientY = _c.clientY;
            // Touches the scene never saw (a secondary finger in single-touch
            // mode, or one that already ended) are not tracked.
            if (!_activeTouches.has(identifier)) {
                continue;
            }
            cancelled.add(identifier);
            if (clientX || clientY) {
                _activeTouches.set(identifier, { clientX: clientX, clientY: clientY });
            }
        }
        // A cancel can name only some of the touches, or none. `touches` lists
        // every finger still down, so end any tracked touch missing from it.
        var down = new Set();
        var touches = (_b = event.touches) !== null && _b !== void 0 ? _b : [];
        for (var i = 0; i < touches.length; i++) {
            down.add(touches[i].identifier);
        }
        _activeTouches.forEach(function (_, identifier) {
            if (!down.has(identifier)) {
                cancelled.add(identifier);
            }
        });
        if (_touchState.primaryTouchId === null ||
            cancelled.has(_touchState.primaryTouchId)) {
            _touchState.primaryTouchId = null;
        }
        if (!cancelled.size) {
            return;
        }
        var identifiers = Array.from(cancelled);
        var points = mapToArtboard(event.currentTarget.getBoundingClientRect(), identifiers.map(function (identifier) { return _activeTouches.get(identifier); }));
        identifiers.forEach(function (identifier) { return _activeTouches.delete(identifier); });
        var _loop_6 = function (stateMachine) {
            identifiers.forEach(function (identifier, i) {
                var _a = points[i], x = _a.x, y = _a.y;
                stateMachine.pointerUp(x, y, identifier);
                stateMachine.pointerExit(x, y, identifier);
            });
        };
        for (var _i = 0, stateMachines_7 = stateMachines; _i < stateMachines_7.length; _i++) {
            var stateMachine = stateMachines_7[_i];
            _loop_6(stateMachine);
        }
        // Advance immediately so the release takes effect synchronously
        advanceAndDrain(0);
    };
    /**
     * Forwards wheel and trackpad scrolling to the state machines. The page keeps
     * the wheel unless a scroll view actually moves, so it still scrolls when
     * Rive has nothing to scroll or a view sits at its edge.
     */
    var wheelCallback = function (event) {
        // Pinch zoom arrives as a ctrl+wheel and belongs to the page. A wheel that
        // can't be cancelled is part of a sequence the page is already scrolling;
        // taking it too would move both.
        if (event.ctrlKey || !event.cancelable) {
            return;
        }
        // Read before the deltas: Firefox reports pixels once a delta has been
        // read first.
        var deltaMode = event.deltaMode;
        var deltaX = event.deltaX;
        var deltaY = event.deltaY;
        // Shift+wheel scrolls sideways. Most browsers already report it on the x
        // axis; a vertical-only view would decline it on y.
        if (event.shiftKey && !deltaX) {
            deltaX = deltaY;
            deltaY = 0;
        }
        var boundingRect = event.currentTarget.getBoundingClientRect();
        // A page is the canvas's visible size, the nearest the host can get to the
        // scroll view's own.
        var toPixelsX = deltaMode === WheelEvent.DOM_DELTA_LINE
            ? PIXELS_PER_LINE
            : deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? boundingRect.width
                : 1;
        var toPixelsY = deltaMode === WheelEvent.DOM_DELTA_LINE
            ? PIXELS_PER_LINE
            : deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? boundingRect.height
                : 1;
        // The DOM reports how far to scroll; the runtime wants how far content
        // travels.
        var scrollX = -deltaX * toPixelsX;
        var scrollY = -deltaY * toPixelsY;
        if (!scrollX && !scrollY) {
            return;
        }
        // Mapping both ends of the delta keeps only the scale of the fit.
        var _a = mapToArtboard(boundingRect, [
            { clientX: event.clientX, clientY: event.clientY },
            { clientX: event.clientX + scrollX, clientY: event.clientY + scrollY },
        ]), position = _a[0], moved = _a[1];
        // The DOM never says whether a pixel delta came from a trackpad, so it
        // counts as precise either way, as it does in the browser's own scrolling.
        var precise = deltaMode === WheelEvent.DOM_DELTA_PIXEL;
        var timeStamp = event.timeStamp / 1000;
        // A latched state machine owns the rest of its gesture, even past its edge.
        var latched = stateMachines.filter(function (sm) { return sm.hasScrollLatch(); });
        var ordered = latched.concat(stateMachines.filter(function (sm) { return latched.indexOf(sm) === -1; }));
        var consumed = ordered.some(function (stateMachine) {
            return stateMachine.pointerScroll(position.x, position.y, moved.x - position.x, moved.y - position.y, SCROLL_PHASE_UPDATE, precise, timeStamp, 0) !== 0;
        });
        if (!consumed) {
            return;
        }
        event.preventDefault();
        // Advance now so the scroll lands on the next frame drawn.
        advanceAndDrain(0);
    };
    var callback = processEventCallback.bind(_this);
    canvas.addEventListener("mouseover", callback);
    canvas.addEventListener("mouseout", callback);
    canvas.addEventListener("mousemove", callback);
    canvas.addEventListener("mousedown", callback);
    canvas.addEventListener("mouseup", callback);
    canvas.addEventListener("touchmove", callback, {
        passive: isTouchScrollEnabled,
    });
    canvas.addEventListener("touchstart", callback, {
        passive: isTouchScrollEnabled,
    });
    canvas.addEventListener("touchend", callback);
    canvas.addEventListener("touchcancel", touchCancelCallback);
    // Not passive, or preventDefault could not keep the page from scrolling.
    canvas.addEventListener("wheel", wheelCallback, { passive: false });
    return function () {
        canvas.removeEventListener("mouseover", callback);
        canvas.removeEventListener("mouseout", callback);
        canvas.removeEventListener("mousemove", callback);
        canvas.removeEventListener("mousedown", callback);
        canvas.removeEventListener("mouseup", callback);
        canvas.removeEventListener("touchmove", callback);
        canvas.removeEventListener("touchstart", callback);
        canvas.removeEventListener("touchend", callback);
        canvas.removeEventListener("touchcancel", touchCancelCallback);
        canvas.removeEventListener("wheel", wheelCallback);
    };
};


/***/ }),
/* 15 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FocusSessionState: () => (/* binding */ FocusSessionState),
/* harmony export */   KeyboardInteractions: () => (/* binding */ KeyboardInteractions)
/* harmony export */ });
/* harmony import */ var _keyMap__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(16);
/* harmony import */ var _semantics_claimedKeyEvents__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(11);
/* harmony import */ var _textInputProxy__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(17);



/**
 * Defaults suppressed while typing (scroll/navigate/submit). Tab is traversal's; proxy
 * Space returns earlier as a printable.
 */
var EDITING_NAV_CODES = new Set([
    "Space",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Backspace",
    "Delete",
    "Home",
    "End",
    "Enter",
    "NumpadEnter",
]);
/** A keystroke that types a character (not a Ctrl/Cmd shortcut). */
function isPrintable(event) {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey;
}
function isArrowKey(key) {
    return (key === _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.left || key === _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.right || key === _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.up || key === _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.down);
}
/**
 * Alt/Ctrl/Meta arrows are browser/OS shortcuts (Alt+Left = back, Cmd+Arrow, etc.).
 * Shift is allowed: it is the spatial-navigation chord in Vivaldi/Opera.
 */
function hasShortcutModifier(event) {
    return event.altKey || event.ctrlKey || event.metaKey;
}
/**
 * Tracks the relationship between DOM focus inside this Rive focus domain (canvas or semantic overlay)
 * and Rive's internal focus for the current focus session.
 *
 * NotFocused   — DOM focus left the domain, Rive released focus internally, or Tab walked
 *                off the end of the tree. Keyboard input isn't ours, so Tab is ignored and
 *                reaches the next page element.
 * EntryPending — DOM focus is inside the domain but Rive holds no node yet, so the next Tab
 *                enters the focus tree. Set by pointer focus on the canvas, by assistive technology (AT) focus landing
 *                in the overlay, and by keyboard focus whose entry attempt found no eligible node.
 * RiveFocused  — a Rive node holds focus. Tab/Shift+Tab route to the Rive focus manager and stay
 *                inside the domain until either Rive reports focus ended (pollFocusState) or
 *                Tab walks off the edge of the tree (focusNext()/focusPrevious() returns false and
 *                Rive no longer holds focus).
 *
 * Keyboard focus on the canvas enters the tree immediately: onCanvasFocus infers direction from
 * where focus came from and goes straight to RiveFocused when a node accepts.
 */
var FocusSessionState;
(function (FocusSessionState) {
    FocusSessionState["NotFocused"] = "notFocused";
    FocusSessionState["EntryPending"] = "entryPending";
    FocusSessionState["RiveFocused"] = "riveFocused";
})(FocusSessionState || (FocusSessionState = {}));
/**
 * Manages keyboard and DOM focus interactions for Rive's focus domain (<canvas>, semantic
 * overlay, text input proxy). Owns the proxy and the text input session state.
 * Because keyboard events can apply on either part of the domain, we need to track what events we should
 * handle/intercept, and when to release focus back to the page outside of the domain.
 *
 * Tracks the canvas focus session state (focusSessionState) and routes
 * Tab/Shift+Tab to the Rive state machine's focus manager. Exposes shared
 * state as properties so the Rive render loop can read them directly.
 */
var KeyboardInteractions = /** @class */ (function () {
    function KeyboardInteractions(_a) {
        var canvas = _a.canvas, stateMachine = _a.stateMachine, hasFocusNodes = _a.hasFocusNodes, getOverlayElement = _a.getOverlayElement;
        var _this = this;
        var _b, _c;
        this.focusSessionState = FocusSessionState.NotFocused;
        /** Whether the canvas currently has browser DOM focus. */
        this.canvasHasFocus = false;
        /** After Tab exits the last Rive node, ignore keydowns until focus re-enters the focus domain. */
        this.focusDomainReleased = false;
        /** Overlay element currently wired with focusin/keydown listeners, if any. */
        this.currentOverlayElement = null;
        /** Codes whose keydown an overlay widget took, so their keyup is skipped too. */
        this.claimedKeyCodes = new Set();
        this.textInputSessionActive = false;
        /**
         * The proxy is always empty: copy Rive's selection; always preventDefault.
         */
        this.onCopy = function (event) {
            var _a;
            event.preventDefault();
            var selected = _this.mainSm.selectedText();
            if (selected)
                (_a = event.clipboardData) === null || _a === void 0 ? void 0 : _a.setData("text/plain", selected);
        };
        /**
         * Handles the canvas gaining browser focus. The behavior differs based on how focus was gained -
         *
         * Pointer-driven focus: the canvas now has focus but Rive holds nothing yet, so we move to EntryPending — this lets the
         * next Tab enter the focus tree even when the focus is pointer-driven
         *
         * Keyboard-driven focus: we enter the Rive focus tree immediately once canvas gains focus.
         * The direction is inferred from where focus came from: an element before the canvas in DOM order
         * means a forward Tab (focusNext), one after means a Shift+Tab (focusPrevious). :focus-visible
         * gates this so a click doesn't yank Rive focus to the first node on the focus event itself.
         */
        this.onCanvasFocus = function (event) {
            _this.syncOverlayListener();
            _this.canvasHasFocus = true;
            _this.focusDomainReleased = false;
            if (_this.isInFocusDomain(event.relatedTarget) ||
                !_this.hasFocusNodes ||
                _this.mainSm.focusState().hasFocus) {
                return;
            }
            _this.focusSessionState = FocusSessionState.EntryPending;
            // Pointer focus waits for the user's next Tab (handled in onKeyDown). Keyboard focus enters now.
            if (!_this.isKeyboardDrivenFocus())
                return;
            var forward = _this.cameFromBeforeCanvas(event.relatedTarget);
            if (forward ? _this.mainSm.focusNext() : _this.mainSm.focusPrevious()) {
                _this.focusSessionState = FocusSessionState.RiveFocused;
            }
        };
        /**
         * Marks internal state that the canvas has lost DOM focus. Do not actually clear
         * Rive focus though if:
         * 1. DOM focus is still within Rive domain (i.e., semantic overlay)
         * 2. Document just lost focus (i.e. tab switching)
         *
         * When we're not in either of those buckets, it's safe to call `clearFocus()` on the SMI.
         */
        this.onCanvasBlur = function (event) {
            // Must stay before the state reset because beginTextInputSession sets the session state and
            // then focuses the proxy, which synchronously blurs the canvas.
            if (_this.inputProxy.owns(event.relatedTarget))
                return;
            _this.focusSessionState = FocusSessionState.NotFocused;
            _this.canvasHasFocus = false;
            if (_this.blurStaysWithRive(event.relatedTarget))
                return;
            _this.mainSm.clearFocus();
        };
        /**
         * Assistive technology (AT) focus landing inside the overlay is DOM focus inside the Rive focus domain, so open a
         * session even when no Rive node holds focus yet. shouldRiveHandleKeyEvent treats NotFocused
         * as authoritative, so without this the overlay's Tab keydowns reach onKeyDown and get dropped
         * at that gate — the browser would move focus out of Rive instead of to the next focus node.
         */
        this.onOverlayFocusIn = function (event) {
            if (!_this.isInOverlay(event.target))
                return;
            _this.focusDomainReleased = false;
            if (!_this.hasFocusNodes)
                return;
            if (_this.focusSessionState !== FocusSessionState.NotFocused)
                return;
            _this.focusSessionState = _this.mainSm.focusState().hasFocus
                ? FocusSessionState.RiveFocused
                : FocusSessionState.EntryPending;
        };
        /** Overlay listeners attach lazily, so the first focusin only ever lands here. */
        this.onFocusDomainHostFocusIn = function (event) {
            _this.syncOverlayListener();
            _this.onOverlayFocusIn(event);
            // Focus entering the proxy re-enters the focus domain, so clear any earlier Tab-out
            // release, or onKeyDown would drop the session's keystrokes.
            if (_this.inputProxy.owns(event.target)) {
                _this.focusDomainReleased = false;
            }
        };
        /**
         * Handles keydown events in the Rive focus domain. We route certain keys to different functions, with the following
         * fallback behavior:
         * 1. Tab/Shift+Tab - check if keyInput() takes this key, if not, call focusNext/Previous traversal if there are focus nodes
         * 2. Check - if a semantic overlay element's key handler claimed the event, don't intercept the key event further
         * 3. Send key to `keyInput()` on Rive state machine if applicable.
         * 4. If the keyInput returned false, and the key is directional arrow keys, call directional focus methods on state machine
         * 5. Printables: in a session the proxy's input event supplies text; otherwise textInput().
         *    A printable fires both keyInput and textInput even if a listener claims it.
         * @param event KeyboardEvent
         * @returns void
         */
        this.onKeyDown = function (event) {
            _this.syncOverlayListener();
            // Keys that are part of an IME composition belong to the IME (candidate
            // navigation, commit). Safari reports the first one as keyCode 229 with
            // isComposing still false.
            if (event.isComposing || event.keyCode === 229)
                return;
            // After Tab exits the last Rive node, ignore keys until focus re-enters the focus domain.
            if (_this.focusDomainReleased)
                return;
            if (!_this.shouldRiveHandleKeyEvent(event))
                return;
            if (event.key === "Tab" && _this.hasFocusNodes) {
                // Tab listeners are matched per phase (down/repeat/up), as in the editor, so
                // each event is offered on its own; one that isn't claimed traverses.
                if (_this.mainSm.focusState().hasFocus &&
                    _this.mainSm.keyInput(_keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.tab, (0,_keyMap__WEBPACK_IMPORTED_MODULE_0__.modifiersFromEvent)(event), true, event.repeat)) {
                    event.preventDefault();
                    return;
                }
                var forward = !event.shiftKey;
                var focusMoved = forward ? _this.mainSm.focusNext() : _this.mainSm.focusPrevious();
                var focusState = _this.mainSm.focusState();
                // focusMoved is false both at a Stop edge (focus stays put) and after walking off
                // the tree (focus cleared), so hasFocus discerns Stop edge from Rive releasing focus
                if (focusMoved || focusState.hasFocus) {
                    // A Rive node holds focus — keep trapping Tab inside Rive.
                    _this.focusSessionState = FocusSessionState.RiveFocused;
                    event.preventDefault();
                }
                else {
                    // No more traversable nodes — release Tab to the page.
                    if (document.activeElement !== _this.canvas &&
                        _this.isInFocusDomain(document.activeElement)) {
                        // The browser's default Tab starts from the focused element; from an overlay element,
                        // the nearest stop backward is the canvas itself. Start it from the
                        // canvas instead, so a Shift+Tab goes to the proper element before Rive.
                        _this.canvas.focus({ preventScroll: true });
                    }
                    _this.focusSessionState = FocusSessionState.NotFocused;
                    _this.focusDomainReleased = true;
                    _this.canvasHasFocus = false;
                }
                _this.syncOverlayListener();
                return;
            }
            // A semantic overlay widget (roving radio/tab group, slider, Enter/Space activation)
            // already acted on this key at its target, so don't act on it twice.
            if ((0,_semantics_claimedKeyEvents__WEBPACK_IMPORTED_MODULE_1__.isKeyEventClaimed)(event)) {
                _this.claimedKeyCodes.add(event.code);
                return;
            }
            // A new unclaimed press: drop any claim whose keyup never arrived.
            _this.claimedKeyCodes.delete(event.code);
            var fromProxy = _this.textInputSessionActive && _this.inputProxy.owns(event.target);
            var expectsKeyboardInput = _this.mainSm.focusState().expectsKeyboardInput;
            // The focused node gets first refusal (a TextInput's caret, or a keyboard listener
            // on that key). Keys with no Rive equivalent map to null and aren't dispatched.
            var key = (0,_keyMap__WEBPACK_IMPORTED_MODULE_0__.keyboardEventToRiveKey)(event);
            var consumed = key !== null &&
                _this.mainSm.keyInput(key, (0,_keyMap__WEBPACK_IMPORTED_MODULE_0__.modifiersFromEvent)(event), true, event.repeat);
            // An arrow key with no consumed key input moves focus spatially. While a Rive node holds focus,
            // arrows never scroll the page
            if (!consumed && key !== null && isArrowKey(key) && !hasShortcutModifier(event)) {
                consumed =
                    _this.focusInDirection(key) || _this.mainSm.focusState().hasFocus;
            }
            if (isPrintable(event)) {
                // During a session the printable must reach the proxy: its input event is the
                // (IME- and dead-key-correct) text source, and C++ inserts nothing from keyInput.
                if (fromProxy)
                    return;
                // Session live but focus elsewhere in Rive: refocus the proxy so the default inserts there.
                if (_this.textInputSessionActive && _this.isInFocusDomain(event.target)) {
                    _this.inputProxy.focus();
                    return;
                }
                if (!_this.textInputSessionActive && expectsKeyboardInput) {
                    _this.mainSm.textInput(event.key);
                }
            }
            // Rive consumed it, or an unmodified editing key while typing (would scroll/submit).
            var typing = fromProxy || expectsKeyboardInput;
            if (consumed ||
                (typing && !hasShortcutModifier(event) && EDITING_NAV_CODES.has(event.code))) {
                event.preventDefault();
            }
        };
        this.onKeyUp = function (event) {
            if (event.isComposing || event.keyCode === 229)
                return;
            if (_this.claimedKeyCodes.delete(event.code))
                return;
            if (_this.focusSessionState === FocusSessionState.NotFocused)
                return;
            var key = (0,_keyMap__WEBPACK_IMPORTED_MODULE_0__.keyboardEventToRiveKey)(event);
            if (key === null)
                return;
            _this.mainSm.keyInput(key, (0,_keyMap__WEBPACK_IMPORTED_MODULE_0__.modifiersFromEvent)(event), false, false);
        };
        this.canvas = canvas;
        this.mainSm = stateMachine;
        this.hasFocusNodes = hasFocusNodes;
        this.getOverlayElement = getOverlayElement;
        this.focusDomainHost = (_b = canvas.parentElement) !== null && _b !== void 0 ? _b : document;
        canvas.addEventListener("focus", this.onCanvasFocus);
        canvas.addEventListener("blur", this.onCanvasBlur);
        canvas.addEventListener("keydown", this.onKeyDown);
        canvas.addEventListener("keyup", this.onKeyUp);
        this.focusDomainHost.addEventListener("focusin", this.onFocusDomainHostFocusIn);
        this.syncOverlayListener();
        this.inputProxy = new _textInputProxy__WEBPACK_IMPORTED_MODULE_2__.TextInputProxy({
            container: (_c = canvas.parentElement) !== null && _c !== void 0 ? _c : document.body,
            canvas: canvas,
            textInput: function (text) { return _this.mainSm.textInput(text); },
            // Proxy keystrokes go through the same handlers as the canvas.
            onKeyDown: this.onKeyDown,
            onKeyUp: this.onKeyUp,
            onCopy: this.onCopy,
            onBlur: function (relatedTarget) { return _this.handleProxyBlur(relatedTarget); },
        });
    }
    KeyboardInteractions.prototype.isTextInputSessionActive = function () {
        return this.textInputSessionActive;
    };
    /** Session active and the proxy holds DOM focus. */
    KeyboardInteractions.prototype.isEditingHostFocused = function () {
        return this.textInputSessionActive && this.inputProxy.hasDomFocus();
    };
    /** @param focusProxy move DOM focus to the proxy; false leaves it where it is. */
    KeyboardInteractions.prototype.beginTextInputSession = function (focusProxy) {
        this.textInputSessionActive = true;
        this.focusSessionState = FocusSessionState.RiveFocused;
        if (focusProxy)
            this.inputProxy.focus();
    };
    /** @param fromBlur focus is already leaving; don't park it on the canvas. */
    KeyboardInteractions.prototype.endTextInputSession = function (fromBlur) {
        if (fromBlur === void 0) { fromBlur = false; }
        if (!this.textInputSessionActive)
            return;
        this.textInputSessionActive = false;
        this.inputProxy.endSession();
        if (fromBlur || !this.inputProxy.hasDomFocus())
            return;
        // Nothing took DOM focus from the proxy (e.g. semantics is off). Park it on the
        // canvas so keys keep reaching Rive; onCanvasFocus ignores focus from the input proxy.
        this.canvas.focus({ preventScroll: true });
    };
    /** Must run synchronously in the pointer gesture or mobile keyboards won't open. */
    KeyboardInteractions.prototype.summonForPointer = function () {
        if (this.textInputSessionActive)
            this.inputProxy.focus();
        else
            this.beginTextInputSession(true);
    };
    Object.defineProperty(KeyboardInteractions.prototype, "editingHost", {
        /** The text-input proxy, for the semantics layer to decorate while editing. */
        get: function () {
            return this.inputProxy;
        },
        enumerable: false,
        configurable: true
    });
    KeyboardInteractions.prototype.handleProxyBlur = function (relatedTarget) {
        // Teardown already in progress (endTextInputSession blurred the proxy).
        if (!this.textInputSessionActive)
            return;
        // Still in Rive or the document blurred: keep the session (pollFocusState tears down).
        if (this.blurStaysWithRive(relatedTarget))
            return;
        // Blurred out of Rive entirely: release C++ focus and end the session.
        this.mainSm.clearFocus();
        this.endTextInputSession(true);
        this.focusSessionState = FocusSessionState.NotFocused;
    };
    /**
     * Set the FocusSessionState. Useful for invoking a Rive "blur" without actually blurring from the <canvas>. This
     * helps put the DOM focus state on the canvas rather than the <body>, so the user doesn't lose the spot in page navigation
     *
     * @param state FocusSessionState enum
     */
    KeyboardInteractions.prototype.setFocusSessionState = function (state) {
        this.focusSessionState = state;
    };
    /**
     * Called by pollFocusState on the Rive instance when it observes hasFocus=true. Rive acquired
     * focus internally (e.g. via a listener action or state transition) without a DOM focus event,
     * so mark the session RiveFocused. This cannot resurrect a session that a DOM blur ended,
     * because onCanvasBlur clears Rive's focus alongside it.
     */
    KeyboardInteractions.prototype.notifyRiveFocused = function () {
        this.focusSessionState = FocusSessionState.RiveFocused;
    };
    /** Blur into the focus domain, or the whole document losing focus (tab/window switch). */
    KeyboardInteractions.prototype.blurStaysWithRive = function (relatedTarget) {
        return (this.isInFocusDomain(relatedTarget) ||
            (relatedTarget === null && !document.hasFocus()));
    };
    /** Arrow keys map to directional focus; anything else is not a focus move. */
    KeyboardInteractions.prototype.focusInDirection = function (key) {
        switch (key) {
            case _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.left:
                return this.mainSm.focusLeft();
            case _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.right:
                return this.mainSm.focusRight();
            case _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.up:
                return this.mainSm.focusUp();
            case _keyMap__WEBPACK_IMPORTED_MODULE_0__.Key.down:
                return this.mainSm.focusDown();
            default:
                return false;
        }
    };
    /**
     * Determine if Rive should handle keyboard input. If session state is `NotFocused` - no.
     * DOM focus stays parked on the canvas after Rive releases focus internally, and that Tab
     * has to reach the page rather than re-enter the tree.
     *
     * Otherwise, the event still has to belong to Rive:
     * 1. If the current DOM focus is in Rive domain (canvas or semantic overlay)
     * 2. If the target for the key input is for the semantic overlay, or the canvas
     */
    KeyboardInteractions.prototype.shouldRiveHandleKeyEvent = function (event) {
        if (this.focusSessionState === FocusSessionState.NotFocused)
            return false;
        var inFocusDomain = this.isInFocusDomain(document.activeElement) ||
            this.isInOverlay(event.target);
        var eventOnCanvas = event.target === this.canvas;
        return inFocusDomain || this.canvasHasFocus || eventOnCanvas;
    };
    /** DOM that counts as inside Rive for focus: canvas, overlay subtree, text-input proxy. */
    KeyboardInteractions.prototype.isInFocusDomain = function (target) {
        if (target === this.canvas)
            return true;
        if (this.inputProxy.owns(target))
            return true;
        return this.isInOverlay(target);
    };
    /** Overlay only (excludes the canvas) — the accessibility overlay subtree. */
    KeyboardInteractions.prototype.isInOverlay = function (target) {
        var _a, _b, _c;
        if (!(target instanceof Node))
            return false;
        return (_c = (_b = (_a = this.getOverlayElement) === null || _a === void 0 ? void 0 : _a.call(this)) === null || _b === void 0 ? void 0 : _b.contains(target)) !== null && _c !== void 0 ? _c : false;
    };
    KeyboardInteractions.prototype.syncOverlayListener = function () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var nextOverlayElement = (_b = (_a = this.getOverlayElement) === null || _a === void 0 ? void 0 : _a.call(this)) !== null && _b !== void 0 ? _b : null;
        if (nextOverlayElement === this.currentOverlayElement)
            return;
        (_c = this.currentOverlayElement) === null || _c === void 0 ? void 0 : _c.removeEventListener("focusin", this.onOverlayFocusIn);
        (_d = this.currentOverlayElement) === null || _d === void 0 ? void 0 : _d.removeEventListener("keydown", this.onKeyDown);
        (_e = this.currentOverlayElement) === null || _e === void 0 ? void 0 : _e.removeEventListener("keyup", this.onKeyUp);
        this.currentOverlayElement = nextOverlayElement;
        (_f = this.currentOverlayElement) === null || _f === void 0 ? void 0 : _f.addEventListener("focusin", this.onOverlayFocusIn);
        // Bubble phase, so a semantic widget's own key handler runs first and can claim
        // the key via claimKeyEvent (see onKeyDown).
        (_g = this.currentOverlayElement) === null || _g === void 0 ? void 0 : _g.addEventListener("keydown", this.onKeyDown);
        (_h = this.currentOverlayElement) === null || _h === void 0 ? void 0 : _h.addEventListener("keyup", this.onKeyUp);
    };
    /**
     * Whether the canvas currently matches :focus-visible — the browser's heuristic for keyboard-
     * (vs pointer-) driven focus. For older browser versions that don't support this selector, return false
     * so that we don't incorrectly assume pointer vs keyboard focus. Next tab would enter the focus tree in those edge cases.
     */
    KeyboardInteractions.prototype.isKeyboardDrivenFocus = function () {
        try {
            return this.canvas.matches(":focus-visible");
        }
        catch (_a) {
            return false;
        }
    };
    KeyboardInteractions.prototype.cameFromBeforeCanvas = function (from) {
        if (!from)
            return true;
        var position = this.canvas.compareDocumentPosition(from);
        if (position & Node.DOCUMENT_POSITION_PRECEDING)
            return true;
        if (position & Node.DOCUMENT_POSITION_FOLLOWING)
            return false;
        return true;
    };
    KeyboardInteractions.prototype.cleanup = function () {
        var _a, _b, _c;
        this.canvas.removeEventListener("focus", this.onCanvasFocus);
        this.canvas.removeEventListener("blur", this.onCanvasBlur);
        this.canvas.removeEventListener("keydown", this.onKeyDown);
        this.canvas.removeEventListener("keyup", this.onKeyUp);
        this.claimedKeyCodes.clear();
        this.focusDomainHost.removeEventListener("focusin", this.onFocusDomainHostFocusIn);
        (_a = this.currentOverlayElement) === null || _a === void 0 ? void 0 : _a.removeEventListener("focusin", this.onOverlayFocusIn);
        (_b = this.currentOverlayElement) === null || _b === void 0 ? void 0 : _b.removeEventListener("keydown", this.onKeyDown);
        (_c = this.currentOverlayElement) === null || _c === void 0 ? void 0 : _c.removeEventListener("keyup", this.onKeyUp);
        // Removing a focused element drops focus to <body> with no blur; park on the canvas.
        if (this.inputProxy.hasDomFocus()) {
            this.canvas.focus({ preventScroll: true });
        }
        this.inputProxy.cleanup();
        this.textInputSessionActive = false;
    };
    return KeyboardInteractions;
}());



/***/ }),
/* 16 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Key: () => (/* binding */ Key),
/* harmony export */   KeyModifiers: () => (/* binding */ KeyModifiers),
/* harmony export */   keyboardEventToRiveKey: () => (/* binding */ keyboardEventToRiveKey),
/* harmony export */   modifiersFromEvent: () => (/* binding */ modifiersFromEvent)
/* harmony export */ });
/*
 * Maps DOM keyboard events to the GLFW-style key codes and modifier bitmask
 * that StateMachineInstance.keyInput() expects. Values mirror `enum class Key`
 * and `enum class KeyModifiers` in rive-runtime focusable.hpp;
 * they are stable GLFW codes, so they live here as constants instead of an
 * embind enum.
 */
var __spreadArray = (undefined && undefined.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var Key = {
    space: 32,
    apostrophe: 39, // '
    comma: 44, // ,
    minus: 45, // -
    period: 46, // .
    slash: 47, // /
    key0: 48,
    key1: 49,
    key2: 50,
    key3: 51,
    key4: 52,
    key5: 53,
    key6: 54,
    key7: 55,
    key8: 56,
    key9: 57,
    semicolon: 59, // ;
    equal: 61, // =
    a: 65,
    b: 66,
    c: 67,
    d: 68,
    e: 69,
    f: 70,
    g: 71,
    h: 72,
    i: 73,
    j: 74,
    k: 75,
    l: 76,
    m: 77,
    n: 78,
    o: 79,
    p: 80,
    q: 81,
    r: 82,
    s: 83,
    t: 84,
    u: 85,
    v: 86,
    w: 87,
    x: 88,
    y: 89,
    z: 90,
    leftBracket: 91, // [
    backslash: 92, // \
    rightBracket: 93, // ]
    graveAccent: 96, // `
    world1: 161, // non-US #1
    world2: 162, // non-US #2
    escape: 256,
    enter: 257,
    tab: 258,
    backspace: 259,
    insert: 260,
    deleteKey: 261,
    right: 262,
    left: 263,
    down: 264,
    up: 265,
    pageUp: 266,
    pageDown: 267,
    home: 268,
    end: 269,
    capsLock: 280,
    scrollLock: 281,
    numLock: 282,
    printScreen: 283,
    pause: 284,
    f1: 290,
    f2: 291,
    f3: 292,
    f4: 293,
    f5: 294,
    f6: 295,
    f7: 296,
    f8: 297,
    f9: 298,
    f10: 299,
    f11: 300,
    f12: 301,
    f13: 302,
    f14: 303,
    f15: 304,
    f16: 305,
    f17: 306,
    f18: 307,
    f19: 308,
    f20: 309,
    f21: 310,
    f22: 311,
    f23: 312,
    f24: 313,
    f25: 314,
    kp0: 320,
    kp1: 321,
    kp2: 322,
    kp3: 323,
    kp4: 324,
    kp5: 325,
    kp6: 326,
    kp7: 327,
    kp8: 328,
    kp9: 329,
    kpDecimal: 330,
    kpDivide: 331,
    kpMultiply: 332,
    kpSubtract: 333,
    kpAdd: 334,
    kpEnter: 335,
    kpEqual: 336,
    leftShift: 340,
    leftControl: 341,
    leftAlt: 342,
    leftSuper: 343,
    rightShift: 344,
    rightControl: 345,
    rightAlt: 346,
    rightSuper: 347,
    menu: 348,
};
var KeyModifiers = {
    none: 0,
    shift: 1 << 0,
    ctrl: 1 << 1,
    alt: 1 << 2,
    meta: 1 << 3,
};
// Physical key (KeyboardEvent.code) to Rive key, by US-QWERTY position.
var CODE_TO_KEY = {
    // Modifiers are keys too (the editor sends them), and are also in the bitmask.
    ShiftLeft: Key.leftShift,
    ShiftRight: Key.rightShift,
    ControlLeft: Key.leftControl,
    ControlRight: Key.rightControl,
    AltLeft: Key.leftAlt,
    AltRight: Key.rightAlt,
    MetaLeft: Key.leftSuper,
    MetaRight: Key.rightSuper,
    KeyA: Key.a,
    KeyB: Key.b,
    KeyC: Key.c,
    KeyD: Key.d,
    KeyE: Key.e,
    KeyF: Key.f,
    KeyG: Key.g,
    KeyH: Key.h,
    KeyI: Key.i,
    KeyJ: Key.j,
    KeyK: Key.k,
    KeyL: Key.l,
    KeyM: Key.m,
    KeyN: Key.n,
    KeyO: Key.o,
    KeyP: Key.p,
    KeyQ: Key.q,
    KeyR: Key.r,
    KeyS: Key.s,
    KeyT: Key.t,
    KeyU: Key.u,
    KeyV: Key.v,
    KeyW: Key.w,
    KeyX: Key.x,
    KeyY: Key.y,
    KeyZ: Key.z,
    Digit0: Key.key0,
    Digit1: Key.key1,
    Digit2: Key.key2,
    Digit3: Key.key3,
    Digit4: Key.key4,
    Digit5: Key.key5,
    Digit6: Key.key6,
    Digit7: Key.key7,
    Digit8: Key.key8,
    Digit9: Key.key9,
    Numpad0: Key.kp0,
    Numpad1: Key.kp1,
    Numpad2: Key.kp2,
    Numpad3: Key.kp3,
    Numpad4: Key.kp4,
    Numpad5: Key.kp5,
    Numpad6: Key.kp6,
    Numpad7: Key.kp7,
    Numpad8: Key.kp8,
    Numpad9: Key.kp9,
    NumpadDecimal: Key.kpDecimal,
    NumpadDivide: Key.kpDivide,
    NumpadMultiply: Key.kpMultiply,
    NumpadSubtract: Key.kpSubtract,
    NumpadAdd: Key.kpAdd,
    NumpadEnter: Key.kpEnter,
    NumpadEqual: Key.kpEqual,
    Minus: Key.minus,
    Equal: Key.equal,
    BracketLeft: Key.leftBracket,
    BracketRight: Key.rightBracket,
    Backslash: Key.backslash,
    Semicolon: Key.semicolon,
    Quote: Key.apostrophe,
    Backquote: Key.graveAccent,
    Comma: Key.comma,
    Period: Key.period,
    Slash: Key.slash,
    IntlBackslash: Key.world1,
    IntlRo: Key.world2,
    Space: Key.space,
    Enter: Key.enter,
    Tab: Key.tab,
    Backspace: Key.backspace,
    Insert: Key.insert,
    Delete: Key.deleteKey,
    Escape: Key.escape,
    ArrowRight: Key.right,
    ArrowLeft: Key.left,
    ArrowDown: Key.down,
    ArrowUp: Key.up,
    PageUp: Key.pageUp,
    PageDown: Key.pageDown,
    Home: Key.home,
    End: Key.end,
    CapsLock: Key.capsLock,
    ScrollLock: Key.scrollLock,
    NumLock: Key.numLock,
    PrintScreen: Key.printScreen,
    Pause: Key.pause,
    ContextMenu: Key.menu,
    F1: Key.f1,
    F2: Key.f2,
    F3: Key.f3,
    F4: Key.f4,
    F5: Key.f5,
    F6: Key.f6,
    F7: Key.f7,
    F8: Key.f8,
    F9: Key.f9,
    F10: Key.f10,
    F11: Key.f11,
    F12: Key.f12,
    F13: Key.f13,
    F14: Key.f14,
    F15: Key.f15,
    F16: Key.f16,
    F17: Key.f17,
    F18: Key.f18,
    F19: Key.f19,
    F20: Key.f20,
    F21: Key.f21,
    F22: Key.f22,
    F23: Key.f23,
    F24: Key.f24,
    F25: Key.f25,
};
// Unshifted characters (event.key, lowercased) that name a Rive key.
var CHAR_TO_KEY = (function () {
    var map = {
        " ": Key.space,
        "'": Key.apostrophe,
        ",": Key.comma,
        "-": Key.minus,
        ".": Key.period,
        "/": Key.slash,
        ";": Key.semicolon,
        "=": Key.equal,
        "[": Key.leftBracket,
        "\\": Key.backslash,
        "]": Key.rightBracket,
        "`": Key.graveAccent,
    };
    for (var c = 0; c < 26; c++)
        map[String.fromCharCode(97 + c)] = Key.a + c;
    for (var d = 0; d <= 9; d++)
        map[String(d)] = Key.key0 + d;
    return map;
})();
// Non-printable event.key values; each shares its name with its code.
var NAMED_KEYS = new Set(__spreadArray([
    "Enter",
    "Tab",
    "Backspace",
    "Insert",
    "Delete",
    "Escape",
    "ArrowRight",
    "ArrowLeft",
    "ArrowDown",
    "ArrowUp",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    "CapsLock",
    "ScrollLock",
    "NumLock",
    "PrintScreen",
    "Pause",
    "ContextMenu"
], Array.from({ length: 25 }, function (_, i) { return "F".concat(i + 1); }), true));
/**
 * Maps a KeyboardEvent to a Rive key, or null if Rive has no equivalent.
 *
 * Resolves the logical key: what the user's layout labels the key, ignoring
 * Shift, so a listener on "A" fires on AZERTY's A too. `event.key` is preferred;
 * `event.code` is the fallback when `key` isn't a plain unshifted character
 * (shifted symbols, Option/AltGr output, non-Latin letters, dead keys).
 * Digit-row and numpad keys skip the character lookup so AZERTY's digit row
 * still reports digits and numpad digits stay distinct from the digit row.
 */
function keyboardEventToRiveKey(event) {
    var _a, _b;
    var code = event.code, key = event.key;
    if (NAMED_KEYS.has(key)) {
        // NumpadEnter reports key "Enter"; keep it distinct.
        return code === "NumpadEnter" ? Key.kpEnter : (_a = CODE_TO_KEY[key]) !== null && _a !== void 0 ? _a : null;
    }
    if (!code.startsWith("Digit") && !code.startsWith("Numpad") && key) {
        var fromChar = CHAR_TO_KEY[key.toLowerCase()];
        if (fromChar !== undefined)
            return fromChar;
    }
    return (_b = CODE_TO_KEY[code]) !== null && _b !== void 0 ? _b : null;
}
function modifiersFromEvent(event) {
    var modifiers = KeyModifiers.none;
    if (event.shiftKey)
        modifiers |= KeyModifiers.shift;
    if (event.ctrlKey)
        modifiers |= KeyModifiers.ctrl;
    if (event.altKey)
        modifiers |= KeyModifiers.alt;
    if (event.metaKey)
        modifiers |= KeyModifiers.meta;
    return modifiers;
}


/***/ }),
/* 17 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TextInputProxy: () => (/* binding */ TextInputProxy)
/* harmony export */ });
/* harmony import */ var _canvasOffset__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(12);

// 16px: the smallest font size at which iOS Safari doesn't zoom on focus
var FONT_SIZE_PX = 16;
/** Capture-critical attributes decorate() must not touch. */
var PROTECTED_ATTRS = new Set([
    "type",
    "value",
    "style",
    "tabindex",
    "autocapitalize",
    "autocomplete",
    "autocorrect",
    "spellcheck",
]);
/**
 * Invisible per-instance <input> capturing IME/dead-key/paste text; focusable inside a
 * gesture to raise mobile keyboards. Always empty: C++ owns value and caret. Decorated
 * for AT only while it holds DOM focus.
 */
var TextInputProxy = /** @class */ (function () {
    function TextInputProxy(params) {
        var _this = this;
        // True between compositionstart/compositionend; we never commit mid-composition.
        this.composing = false;
        // Names set by decorate(), removed by resetDecoration().
        this.decoratedKeys = new Set();
        // Last written left/top, to skip no-op style writes.
        this.lastLeft = NaN;
        this.lastTop = NaN;
        /** Re-sync before input: the canvas may have scrolled since the session began. */
        this.reposition = function () { return _this.positionOverCanvas(); };
        this.onCompositionStart = function () {
            _this.composing = true;
        };
        this.onCompositionEnd = function () {
            _this.composing = false;
            // The composed text is now committed in element.value; forward it here. A
            // trailing `input` event (order varies by browser) then sees an empty field.
            _this.commit();
        };
        this.onInput = function () {
            if (_this.composing)
                return;
            _this.commit();
        };
        // An <input type=text> strips line breaks from its value, so forward the clipboard
        // text directly. Core's single-line fields strip them themselves.
        this.onPaste = function (event) {
            var _a;
            var text = (_a = event.clipboardData) === null || _a === void 0 ? void 0 : _a.getData("text/plain");
            if (!text)
                return;
            event.preventDefault();
            _this.params.textInput(text.replace(/\r\n?/g, "\n"));
        };
        this.onBlur = function (event) {
            _this.params.onBlur(event.relatedTarget);
        };
        this.params = params;
        this.element = this.createElement();
        this.positionOverCanvas();
        // Order vs. the overlay is unspecified; fine, Tab release starts from the canvas.
        this.params.container.appendChild(this.element);
    }
    // Registered first so it runs before the key handler inserts or moves the caret.
    TextInputProxy.prototype.listeners = function () {
        return [
            ["keydown", this.reposition],
            ["beforeinput", this.reposition],
            ["keydown", this.params.onKeyDown],
            ["keyup", this.params.onKeyUp],
            ["input", this.onInput],
            ["compositionstart", this.onCompositionStart],
            ["compositionend", this.onCompositionEnd],
            ["paste", this.onPaste],
            ["copy", this.params.onCopy],
            ["blur", this.onBlur],
        ];
    };
    TextInputProxy.prototype.createElement = function () {
        var el = document.createElement("input");
        el.type = "text";
        // Focusable but never in native tab order (Rive drives traversal synthetically),
        // and invisible without display:none (which would forbid focus).
        el.tabIndex = -1;
        el.setAttribute("aria-hidden", "true");
        // Always empty, so autocapitalize/autocorrect would misfire.
        el.setAttribute("autocapitalize", "off");
        el.setAttribute("autocomplete", "off");
        el.setAttribute("autocorrect", "off");
        el.spellcheck = false;
        // Over the canvas (not display:none) so iOS doesn't scroll-jump on keyboard open.
        // font-size must stay 16px or iOS Safari zooms on focus.
        el.style.cssText =
            "position:absolute;width:1px;height:1px;padding:0;margin:0;border:0;" +
                "outline:none;opacity:0;background:transparent;color:transparent;" +
                "caret-color:transparent;overflow:hidden;resize:none;z-index:0;" +
                // Focused programmatically only; must not swallow clicks
                "pointer-events:none;" +
                "font-size:".concat(FONT_SIZE_PX, "px;line-height:1;");
        for (var _i = 0, _a = this.listeners(); _i < _a.length; _i++) {
            var _b = _a[_i], type = _b[0], listener = _b[1];
            el.addEventListener(type, listener);
        }
        return el;
    };
    TextInputProxy.prototype.positionOverCanvas = function () {
        // Track the canvas (browsers scroll to the caret); clamp on-screen, one caret line box
        // (FONT_SIZE_PX) from the far edges, or the root scrolls to reveal it.
        var _a = (0,_canvasOffset__WEBPACK_IMPORTED_MODULE_0__.canvasOffset)(this.params.canvas), top = _a.top, left = _a.left;
        if (window.innerHeight > 0) {
            var r = this.params.canvas.getBoundingClientRect();
            top += clamp(r.top, 0, window.innerHeight - FONT_SIZE_PX) - r.top;
            left += clamp(r.left, 0, window.innerWidth - FONT_SIZE_PX) - r.left;
        }
        if (left !== this.lastLeft) {
            this.element.style.left = "".concat(left, "px");
            this.lastLeft = left;
        }
        if (top !== this.lastTop) {
            this.element.style.top = "".concat(top, "px");
            this.lastTop = top;
        }
    };
    /**
     * Forward the field's text to Rive and clear it.
     *
     * TODO: iOS won't autorepeat Backspace in an empty field (needs a text mirror).
     * */
    TextInputProxy.prototype.commit = function () {
        var text = this.element.value;
        if (!text)
            return;
        this.element.value = "";
        this.params.textInput(text);
    };
    /** Clear any transient value and decoration. Does not blur the element. */
    TextInputProxy.prototype.endSession = function () {
        this.element.value = "";
        // Browsers fire compositionend on blur, but a stuck flag would drop every
        // keystroke of the next session.
        this.composing = false;
        // Also covers blur-out, which bypasses the overlay.
        this.resetDecoration();
    };
    /** Must be called synchronously inside a gesture on iOS to raise the keyboard. */
    TextInputProxy.prototype.focus = function () {
        // Reposition first: iOS scrolls the focused input into view when the keyboard opens.
        this.positionOverCanvas();
        this.element.focus({ preventScroll: true });
    };
    TextInputProxy.prototype.hasDomFocus = function () {
        return document.activeElement === this.element;
    };
    TextInputProxy.prototype.owns = function (target) {
        return target === this.element;
    };
    /** See EditingHost.decorate. */
    TextInputProxy.prototype.decorate = function (attrs) {
        // aria-hidden outranks every attribute set below, so it must come off before this
        // element can stand in as the accessible element for the focused node.
        this.element.removeAttribute("aria-hidden");
        for (var _i = 0, _a = Object.entries(attrs); _i < _a.length; _i++) {
            var _b = _a[_i], name_1 = _b[0], value = _b[1];
            // Never override capture attrs.
            if (PROTECTED_ATTRS.has(name_1.toLowerCase()))
                continue;
            if (value === null) {
                this.element.removeAttribute(name_1);
                this.decoratedKeys.delete(name_1);
            }
            else {
                // Skip no-op writes: setting an attribute to the value it already has still
                // emits a mutation, and assistive tech is focused on this element mid-edit.
                if (this.element.getAttribute(name_1) !== value) {
                    this.element.setAttribute(name_1, value);
                }
                this.decoratedKeys.add(name_1);
            }
        }
    };
    /**
     * type=password for obscured fields so AT doesn't echo keys.
     * TODO: source "type" from Core, not semantics.
     */
    TextInputProxy.prototype.setSecure = function (secure) {
        var type = secure ? "password" : "text";
        if (this.element.type !== type)
            this.element.type = type;
    };
    /** Drop all decoration and return to the AT-invisible baseline. */
    TextInputProxy.prototype.resetDecoration = function () {
        var _this = this;
        this.setSecure(false);
        this.decoratedKeys.forEach(function (name) { return _this.element.removeAttribute(name); });
        this.decoratedKeys.clear();
        this.element.setAttribute("aria-hidden", "true");
    };
    TextInputProxy.prototype.cleanup = function () {
        for (var _i = 0, _a = this.listeners(); _i < _a.length; _i++) {
            var _b = _a[_i], type = _b[0], listener = _b[1];
            this.element.removeEventListener(type, listener);
        }
        this.element.remove();
    };
    return TextInputProxy;
}());

function clamp(v, min, max) {
    return Math.min(Math.max(v, min), Math.max(min, max));
}


/***/ }),
/* 18 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BLANK_URL: () => (/* binding */ BLANK_URL),
/* harmony export */   sanitizeUrl: () => (/* binding */ sanitizeUrl)
/* harmony export */ });
// Reference: https://github.com/braintree/sanitize-url/tree/main
var invalidProtocolRegex = /^([^\w]*)(javascript|data|vbscript)/im;
var htmlEntitiesRegex = /&#(\w+)(^\w|;)?/g;
var htmlCtrlEntityRegex = /&(newline|tab);/gi;
var ctrlCharactersRegex = /[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim;
var urlSchemeRegex = /^.+(:|&colon;)/gim;
var relativeFirstCharacters = [".", "/"];
var BLANK_URL = "about:blank";
function isRelativeUrlWithoutProtocol(url) {
    return relativeFirstCharacters.indexOf(url[0]) > -1;
}
// adapted from https://stackoverflow.com/a/29824550/2601552
function decodeHtmlCharacters(str) {
    var removedNullByte = str.replace(ctrlCharactersRegex, "");
    return removedNullByte.replace(htmlEntitiesRegex, function (match, dec) {
        return String.fromCharCode(dec);
    });
}
function sanitizeUrl(url) {
    if (!url) {
        return BLANK_URL;
    }
    var sanitizedUrl = decodeHtmlCharacters(url)
        .replace(htmlCtrlEntityRegex, "")
        .replace(ctrlCharactersRegex, "")
        .trim();
    if (!sanitizedUrl) {
        return BLANK_URL;
    }
    if (isRelativeUrlWithoutProtocol(sanitizedUrl)) {
        return sanitizedUrl;
    }
    var urlSchemeParseResults = sanitizedUrl.match(urlSchemeRegex);
    if (!urlSchemeParseResults) {
        return sanitizedUrl;
    }
    var urlScheme = urlSchemeParseResults[0];
    if (invalidProtocolRegex.test(urlScheme)) {
        return BLANK_URL;
    }
    return sanitizedUrl;
}


/***/ }),
/* 19 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AudioAssetWrapper: () => (/* binding */ AudioAssetWrapper),
/* harmony export */   AudioWrapper: () => (/* binding */ AudioWrapper),
/* harmony export */   CustomFileAssetLoaderWrapper: () => (/* binding */ CustomFileAssetLoaderWrapper),
/* harmony export */   FileAssetWrapper: () => (/* binding */ FileAssetWrapper),
/* harmony export */   FileFinalizer: () => (/* binding */ FileFinalizer),
/* harmony export */   FontAssetWrapper: () => (/* binding */ FontAssetWrapper),
/* harmony export */   FontWrapper: () => (/* binding */ FontWrapper),
/* harmony export */   ImageAssetWrapper: () => (/* binding */ ImageAssetWrapper),
/* harmony export */   ImageWrapper: () => (/* binding */ ImageWrapper),
/* harmony export */   createFinalization: () => (/* binding */ createFinalization),
/* harmony export */   finalizationRegistry: () => (/* binding */ finalizationRegistry)
/* harmony export */ });
var __extends = (undefined && undefined.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var FileFinalizer = /** @class */ (function () {
    function FileFinalizer(file, session) {
        if (session === void 0) { session = null; }
        this.selfUnref = false;
        this._file = file;
        this._session = session;
    }
    FileFinalizer.prototype.unref = function () {
        if (this._file) {
            this._file.unref();
        }
        // After the file, never before: the file's resources belong to the session.
        if (this._session) {
            this._session.delete();
            this._session = null;
        }
    };
    // Disarms the GC path for a file cleanup() already released.
    FileFinalizer.prototype.release = function () {
        this._file = null;
        this._session = null;
    };
    return FileFinalizer;
}());
var ObjectFinalizer = /** @class */ (function () {
    function ObjectFinalizer(finalizableObject) {
        this._finalizableObject = finalizableObject;
    }
    ObjectFinalizer.prototype.unref = function () {
        this._finalizableObject.unref();
    };
    return ObjectFinalizer;
}());
var AssetWrapper = /** @class */ (function () {
    function AssetWrapper() {
        this.selfUnref = false;
    }
    AssetWrapper.prototype.unref = function () { };
    return AssetWrapper;
}());
var ImageWrapper = /** @class */ (function (_super) {
    __extends(ImageWrapper, _super);
    function ImageWrapper(image) {
        var _this = _super.call(this) || this;
        _this._nativeImage = image;
        return _this;
    }
    Object.defineProperty(ImageWrapper.prototype, "nativeImage", {
        get: function () {
            return this._nativeImage;
        },
        enumerable: false,
        configurable: true
    });
    ImageWrapper.prototype.unref = function () {
        if (this.selfUnref) {
            this._nativeImage.unref();
        }
    };
    return ImageWrapper;
}(AssetWrapper));
var AudioWrapper = /** @class */ (function (_super) {
    __extends(AudioWrapper, _super);
    function AudioWrapper(audio) {
        var _this = _super.call(this) || this;
        _this._nativeAudio = audio;
        return _this;
    }
    Object.defineProperty(AudioWrapper.prototype, "nativeAudio", {
        get: function () {
            return this._nativeAudio;
        },
        enumerable: false,
        configurable: true
    });
    AudioWrapper.prototype.unref = function () {
        if (this.selfUnref) {
            this._nativeAudio.unref();
        }
    };
    return AudioWrapper;
}(AssetWrapper));
var FontWrapper = /** @class */ (function (_super) {
    __extends(FontWrapper, _super);
    function FontWrapper(font) {
        var _this = _super.call(this) || this;
        _this._nativeFont = font;
        return _this;
    }
    Object.defineProperty(FontWrapper.prototype, "nativeFont", {
        get: function () {
            return this._nativeFont;
        },
        enumerable: false,
        configurable: true
    });
    FontWrapper.prototype.unref = function () {
        if (this.selfUnref) {
            this._nativeFont.unref();
        }
    };
    return FontWrapper;
}(AssetWrapper));
var CustomFileAssetLoaderWrapper = /** @class */ (function () {
    function CustomFileAssetLoaderWrapper(runtime, loaderCallback, session) {
        if (session === void 0) { session = null; }
        this._assetLoaderCallback = loaderCallback;
        this._session = session;
        this.assetLoader = new runtime.CustomFileAssetLoader({
            loadContents: this.loadContents.bind(this),
        });
    }
    CustomFileAssetLoaderWrapper.prototype.loadContents = function (asset, bytes) {
        var assetWrapper;
        if (asset.isImage) {
            assetWrapper = new ImageAssetWrapper(asset, this._session);
        }
        else if (asset.isAudio) {
            assetWrapper = new AudioAssetWrapper(asset, this._session);
        }
        else if (asset.isFont) {
            assetWrapper = new FontAssetWrapper(asset, this._session);
        }
        else {
            return false;
        }
        return this._assetLoaderCallback(assetWrapper, bytes);
    };
    return CustomFileAssetLoaderWrapper;
}());
/**
 * Rive class representing a FileAsset with relevant metadata fields to describe
 * an asset associated wtih the Rive File
 */
var FileAssetWrapper = /** @class */ (function () {
    function FileAssetWrapper(nativeAsset, session) {
        if (session === void 0) { session = null; }
        this._nativeFileAsset = nativeAsset;
        this._session = session;
    }
    FileAssetWrapper.prototype.decode = function (bytes) {
        // The session travels with the asset so a deferred file's assets are
        // session-typed without the caller needing to know the file's rendering mode.
        this._nativeFileAsset.decode(bytes, this._session);
    };
    Object.defineProperty(FileAssetWrapper.prototype, "name", {
        get: function () {
            return this._nativeFileAsset.name;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileAssetWrapper.prototype, "fileExtension", {
        get: function () {
            return this._nativeFileAsset.fileExtension;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileAssetWrapper.prototype, "uniqueFilename", {
        get: function () {
            return this._nativeFileAsset.uniqueFilename;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileAssetWrapper.prototype, "isAudio", {
        get: function () {
            return this._nativeFileAsset.isAudio;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileAssetWrapper.prototype, "isImage", {
        get: function () {
            return this._nativeFileAsset.isImage;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileAssetWrapper.prototype, "isFont", {
        get: function () {
            return this._nativeFileAsset.isFont;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileAssetWrapper.prototype, "cdnUuid", {
        get: function () {
            return this._nativeFileAsset.cdnUuid;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileAssetWrapper.prototype, "nativeFileAsset", {
        get: function () {
            return this._nativeFileAsset;
        },
        enumerable: false,
        configurable: true
    });
    return FileAssetWrapper;
}());
/**
 * Rive class extending the FileAsset that exposes a `setRenderImage()` API with a
 * decoded Image (via the `decodeImage()` API) to set a new Image on the Rive FileAsset
 */
var ImageAssetWrapper = /** @class */ (function (_super) {
    __extends(ImageAssetWrapper, _super);
    function ImageAssetWrapper() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ImageAssetWrapper.prototype.setRenderImage = function (image) {
        this._nativeFileAsset.setRenderImage(image.nativeImage);
    };
    return ImageAssetWrapper;
}(FileAssetWrapper));
/**
 * Rive class extending the FileAsset that exposes a `setAudioSource()` API with a
 * decoded Audio (via the `decodeAudio()` API) to set a new Audio on the Rive FileAsset
 */
var AudioAssetWrapper = /** @class */ (function (_super) {
    __extends(AudioAssetWrapper, _super);
    function AudioAssetWrapper() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    AudioAssetWrapper.prototype.setAudioSource = function (audio) {
        this._nativeFileAsset.setAudioSource(audio.nativeAudio);
    };
    return AudioAssetWrapper;
}(FileAssetWrapper));
/**
 * Rive class extending the FileAsset that exposes a `setFont()` API with a
 * decoded Font (via the `decodeFont()` API) to set a new Font on the Rive FileAsset
 */
var FontAssetWrapper = /** @class */ (function (_super) {
    __extends(FontAssetWrapper, _super);
    function FontAssetWrapper() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    FontAssetWrapper.prototype.setFont = function (font) {
        this._nativeFileAsset.setFont(font.nativeFont);
    };
    return FontAssetWrapper;
}(FileAssetWrapper));
var FakeFinalizationRegistry = /** @class */ (function () {
    function FakeFinalizationRegistry(_) {
    }
    FakeFinalizationRegistry.prototype.register = function (object) {
        object.selfUnref = true;
    };
    FakeFinalizationRegistry.prototype.unregister = function (_) { };
    return FakeFinalizationRegistry;
}());
var MyFinalizationRegistry = typeof FinalizationRegistry !== "undefined"
    ? FinalizationRegistry
    : FakeFinalizationRegistry;
var finalizationRegistry = new MyFinalizationRegistry(function (ob) {
    ob === null || ob === void 0 ? void 0 : ob.unref();
});
var createFinalization = function (target, finalizable) {
    var finalizer = new ObjectFinalizer(finalizable);
    finalizationRegistry.register(target, finalizer);
};



/***/ }),
/* 20 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   RiveFont: () => (/* binding */ RiveFont)
/* harmony export */ });
/* harmony import */ var _runtimeLoader__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(3);

// Class to manage fallback fonts for Rive.
var RiveFont = /** @class */ (function () {
    // Class is never instantiated
    function RiveFont() {
    }
    /**
     * Set a callback to dynamically set a list of fallback fonts based on the missing glyph and/or style of the default font.
     * Set null to clear the callback.
     * @param fontCallback Callback to set a list of fallback fonts.
     */
    RiveFont.setFallbackFontCallback = function (fontCallback) {
        RiveFont._fallbackFontCallback = fontCallback !== null && fontCallback !== void 0 ? fontCallback : null;
        RiveFont._wireFallbackProc();
    };
    // Get the pointer value to the Embind Font object from FontWrapper
    RiveFont._fontToPtr = function (fontWrapper) {
        var _a;
        if (fontWrapper == null)
            return null;
        var embindFont = fontWrapper.nativeFont;
        var ptr = (_a = embindFont === null || embindFont === void 0 ? void 0 : embindFont.ptr) === null || _a === void 0 ? void 0 : _a.call(embindFont);
        return ptr !== null && ptr !== void 0 ? ptr : null;
    };
    RiveFont._getFallbackPtr = function (fonts, index) {
        if (index < 0 || index >= fonts.length)
            return null;
        return RiveFont._fontToPtr(fonts[index]);
    };
    // Create the callback Rive expects to use for fallback fonts (regardless if set via a user-supplied static list, or callback)
    // 1. Ensure WASM is ready
    // 2. Bias for checking user callback over static list of fonts and pass it down to Rive to store as reference
    //    - When calling the user callback, check if we have any fonts left to check, and if not, return null to indicate there are no more fallbacks to try.
    //    - If the user callback returns an array of fonts, pass the pointer value to Rive of the font to try
    // 3. If no callback is provided, or the callback returns null, try the static list of fonts if they set any
    // 4. If no fallback method is set, return null.
    RiveFont._wireFallbackProc = function () {
        _runtimeLoader__WEBPACK_IMPORTED_MODULE_0__.RuntimeLoader.getInstance(function (rive) {
            var cb = RiveFont._fallbackFontCallback;
            if (cb) {
                rive.setFallbackFontCallback((function (missingGlyph, fallbackFontIndex, weight) {
                    var fontsReturned = cb(missingGlyph, weight);
                    if (fontsReturned) {
                        if (Array.isArray(fontsReturned)) {
                            return RiveFont._getFallbackPtr(fontsReturned, fallbackFontIndex);
                        }
                        // If the user callback only returns a single font, provide it to Rive the first time, otherwise if Rive
                        // calls back a second time, return null to indicate there are no more fallbacks to try.
                        return fallbackFontIndex === 0 ? RiveFont._fontToPtr(fontsReturned) : null;
                    }
                    return null;
                }));
            }
            else {
                rive.setFallbackFontCallback(null);
            }
        });
    };
    RiveFont._fallbackFontCallback = null;
    return RiveFont;
}());



/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be in strict mode.
(() => {
"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Alignment: () => (/* binding */ Alignment),
/* harmony export */   DataEnum: () => (/* binding */ DataEnum),
/* harmony export */   DataType: () => (/* binding */ DataType),
/* harmony export */   DeprecationKeys: () => (/* binding */ DeprecationKeys),
/* harmony export */   DrawOptimizationOptions: () => (/* binding */ DrawOptimizationOptions),
/* harmony export */   EventType: () => (/* binding */ EventType),
/* harmony export */   Fit: () => (/* binding */ Fit),
/* harmony export */   Layout: () => (/* binding */ Layout),
/* harmony export */   LoopType: () => (/* binding */ LoopType),
/* harmony export */   Rive: () => (/* binding */ Rive),
/* harmony export */   RiveEventType: () => (/* binding */ RiveEventType),
/* harmony export */   RiveFile: () => (/* binding */ RiveFile),
/* harmony export */   RiveFont: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_3__.RiveFont),
/* harmony export */   RuntimeLoader: () => (/* reexport safe */ _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader),
/* harmony export */   SemanticMode: () => (/* reexport safe */ _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticMode),
/* harmony export */   StateMachineInput: () => (/* binding */ StateMachineInput),
/* harmony export */   StateMachineInputType: () => (/* binding */ StateMachineInputType),
/* harmony export */   Testing: () => (/* binding */ Testing),
/* harmony export */   ViewModel: () => (/* binding */ ViewModel),
/* harmony export */   ViewModelInstance: () => (/* binding */ ViewModelInstance),
/* harmony export */   ViewModelInstanceArtboard: () => (/* binding */ ViewModelInstanceArtboard),
/* harmony export */   ViewModelInstanceAssetFont: () => (/* binding */ ViewModelInstanceAssetFont),
/* harmony export */   ViewModelInstanceAssetImage: () => (/* binding */ ViewModelInstanceAssetImage),
/* harmony export */   ViewModelInstanceBoolean: () => (/* binding */ ViewModelInstanceBoolean),
/* harmony export */   ViewModelInstanceColor: () => (/* binding */ ViewModelInstanceColor),
/* harmony export */   ViewModelInstanceEnum: () => (/* binding */ ViewModelInstanceEnum),
/* harmony export */   ViewModelInstanceList: () => (/* binding */ ViewModelInstanceList),
/* harmony export */   ViewModelInstanceNumber: () => (/* binding */ ViewModelInstanceNumber),
/* harmony export */   ViewModelInstanceString: () => (/* binding */ ViewModelInstanceString),
/* harmony export */   ViewModelInstanceTrigger: () => (/* binding */ ViewModelInstanceTrigger),
/* harmony export */   ViewModelInstanceValue: () => (/* binding */ ViewModelInstanceValue),
/* harmony export */   decodeAudio: () => (/* binding */ decodeAudio),
/* harmony export */   decodeFont: () => (/* binding */ decodeFont),
/* harmony export */   decodeImage: () => (/* binding */ decodeImage)
/* harmony export */ });
/* harmony import */ var _animation__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
/* harmony import */ var _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(3);
/* harmony import */ var _semantics__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(7);
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(13);
var __extends = (undefined && undefined.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (undefined && undefined.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (undefined && undefined.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (undefined && undefined.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};




var RiveError = /** @class */ (function (_super) {
    __extends(RiveError, _super);
    function RiveError() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.isHandledError = true;
        return _this;
    }
    return RiveError;
}(Error));


// #regions helpers
var resolveErrorMessage = function (error) {
    return error && error.isHandledError
        ? error.message
        : "Problem loading file; may be corrupt!";
};
// #region layout
// Fit options for the canvas
var Fit;
(function (Fit) {
    Fit["Cover"] = "cover";
    Fit["Contain"] = "contain";
    Fit["Fill"] = "fill";
    Fit["FitWidth"] = "fitWidth";
    Fit["FitHeight"] = "fitHeight";
    Fit["None"] = "none";
    Fit["ScaleDown"] = "scaleDown";
    Fit["Layout"] = "layout";
})(Fit || (Fit = {}));
// Alignment options for the canvas
var Alignment;
(function (Alignment) {
    Alignment["Center"] = "center";
    Alignment["TopLeft"] = "topLeft";
    Alignment["TopCenter"] = "topCenter";
    Alignment["TopRight"] = "topRight";
    Alignment["CenterLeft"] = "centerLeft";
    Alignment["CenterRight"] = "centerRight";
    Alignment["BottomLeft"] = "bottomLeft";
    Alignment["BottomCenter"] = "bottomCenter";
    Alignment["BottomRight"] = "bottomRight";
})(Alignment || (Alignment = {}));
// Drawing optimization options
var DrawOptimizationOptions;
(function (DrawOptimizationOptions) {
    DrawOptimizationOptions["AlwaysDraw"] = "alwaysDraw";
    DrawOptimizationOptions["DrawOnChanged"] = "drawOnChanged";
})(DrawOptimizationOptions || (DrawOptimizationOptions = {}));
// Alignment options for Rive animations in a HTML canvas
var Layout = /** @class */ (function () {
    function Layout(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.fit = (_a = params === null || params === void 0 ? void 0 : params.fit) !== null && _a !== void 0 ? _a : Fit.Contain;
        this.alignment = (_b = params === null || params === void 0 ? void 0 : params.alignment) !== null && _b !== void 0 ? _b : Alignment.Center;
        this.layoutScaleFactor = (_c = params === null || params === void 0 ? void 0 : params.layoutScaleFactor) !== null && _c !== void 0 ? _c : 1;
        this.minX = (_d = params === null || params === void 0 ? void 0 : params.minX) !== null && _d !== void 0 ? _d : 0;
        this.minY = (_e = params === null || params === void 0 ? void 0 : params.minY) !== null && _e !== void 0 ? _e : 0;
        this.maxX = (_f = params === null || params === void 0 ? void 0 : params.maxX) !== null && _f !== void 0 ? _f : 0;
        this.maxY = (_g = params === null || params === void 0 ? void 0 : params.maxY) !== null && _g !== void 0 ? _g : 0;
    }
    // Alternative constructor to build a Layout from an interface/object
    Layout.new = function (_a) {
        var fit = _a.fit, alignment = _a.alignment, minX = _a.minX, minY = _a.minY, maxX = _a.maxX, maxY = _a.maxY;
        warnOnce(DeprecationKeys.legacyConstructors, "This function is deprecated: please use `new Layout({})` instead");
        return new Layout({ fit: fit, alignment: alignment, minX: minX, minY: minY, maxX: maxX, maxY: maxY });
    };
    /**
     * Makes a copy of the layout, replacing any specified parameters
     */
    Layout.prototype.copyWith = function (_a) {
        var fit = _a.fit, alignment = _a.alignment, layoutScaleFactor = _a.layoutScaleFactor, minX = _a.minX, minY = _a.minY, maxX = _a.maxX, maxY = _a.maxY;
        return new Layout({
            fit: fit !== null && fit !== void 0 ? fit : this.fit,
            alignment: alignment !== null && alignment !== void 0 ? alignment : this.alignment,
            layoutScaleFactor: layoutScaleFactor !== null && layoutScaleFactor !== void 0 ? layoutScaleFactor : this.layoutScaleFactor,
            minX: minX !== null && minX !== void 0 ? minX : this.minX,
            minY: minY !== null && minY !== void 0 ? minY : this.minY,
            maxX: maxX !== null && maxX !== void 0 ? maxX : this.maxX,
            maxY: maxY !== null && maxY !== void 0 ? maxY : this.maxY,
        });
    };
    // Returns fit for the Wasm runtime format
    Layout.prototype.runtimeFit = function (rive) {
        if (this.cachedRuntimeFit)
            return this.cachedRuntimeFit;
        var fit;
        if (this.fit === Fit.Cover)
            fit = rive.Fit.cover;
        else if (this.fit === Fit.Contain)
            fit = rive.Fit.contain;
        else if (this.fit === Fit.Fill)
            fit = rive.Fit.fill;
        else if (this.fit === Fit.FitWidth)
            fit = rive.Fit.fitWidth;
        else if (this.fit === Fit.FitHeight)
            fit = rive.Fit.fitHeight;
        else if (this.fit === Fit.ScaleDown)
            fit = rive.Fit.scaleDown;
        else if (this.fit === Fit.Layout)
            fit = rive.Fit.layout;
        else
            fit = rive.Fit.none;
        this.cachedRuntimeFit = fit;
        return fit;
    };
    // Returns alignment for the Wasm runtime format
    Layout.prototype.runtimeAlignment = function (rive) {
        if (this.cachedRuntimeAlignment)
            return this.cachedRuntimeAlignment;
        var alignment;
        if (this.alignment === Alignment.TopLeft)
            alignment = rive.Alignment.topLeft;
        else if (this.alignment === Alignment.TopCenter)
            alignment = rive.Alignment.topCenter;
        else if (this.alignment === Alignment.TopRight)
            alignment = rive.Alignment.topRight;
        else if (this.alignment === Alignment.CenterLeft)
            alignment = rive.Alignment.centerLeft;
        else if (this.alignment === Alignment.CenterRight)
            alignment = rive.Alignment.centerRight;
        else if (this.alignment === Alignment.BottomLeft)
            alignment = rive.Alignment.bottomLeft;
        else if (this.alignment === Alignment.BottomCenter)
            alignment = rive.Alignment.bottomCenter;
        else if (this.alignment === Alignment.BottomRight)
            alignment = rive.Alignment.bottomRight;
        else
            alignment = rive.Alignment.center;
        this.cachedRuntimeAlignment = alignment;
        return alignment;
    };
    return Layout;
}());

// #endregion
// #region runtime

// #endregion
// #region state machines
/**
 * @deprecated State machine inputs are deprecated and will be removed in a
 * future major version: please use data binding properties instead. See
 * {@link https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs}
 * for how to migrate.
 */
var StateMachineInputType;
(function (StateMachineInputType) {
    StateMachineInputType[StateMachineInputType["Number"] = 56] = "Number";
    StateMachineInputType[StateMachineInputType["Trigger"] = 58] = "Trigger";
    StateMachineInputType[StateMachineInputType["Boolean"] = 59] = "Boolean";
})(StateMachineInputType || (StateMachineInputType = {}));
/**
 * An input for a state machine
 * @deprecated State machine inputs are deprecated and will be removed in a
 * future major version: please use data binding properties instead. See
 * {@link https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs}
 * for how to migrate.
 */
var StateMachineInput = /** @class */ (function () {
    function StateMachineInput(type, runtimeInput) {
        this.type = type;
        this.runtimeInput = runtimeInput;
    }
    Object.defineProperty(StateMachineInput.prototype, "name", {
        /**
         * Returns the name of the input
         */
        get: function () {
            return this.runtimeInput.name;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(StateMachineInput.prototype, "value", {
        /**
         * Returns the current value of the input
         */
        get: function () {
            return this.runtimeInput.value;
        },
        /**
         * Sets the value of the input
         */
        set: function (value) {
            this.runtimeInput.value = value;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Fires a trigger; does nothing on Number or Boolean input types
     */
    StateMachineInput.prototype.fire = function () {
        if (this.type === StateMachineInputType.Trigger) {
            this.runtimeInput.fire();
        }
    };
    /**
     * Deletes the input
     */
    StateMachineInput.prototype.delete = function () {
        this.runtimeInput = null;
    };
    return StateMachineInput;
}());

/**
 * @deprecated Subscribing to Rive Events at runtime is deprecated and will be removed in a future major
 * version: please use data binding instead. See
 * {@link https://rive.app/docs/runtimes/web/rive-events} for how to migrate.
 */
var RiveEventType;
(function (RiveEventType) {
    RiveEventType[RiveEventType["General"] = 128] = "General";
    RiveEventType[RiveEventType["OpenUrl"] = 131] = "OpenUrl";
})(RiveEventType || (RiveEventType = {}));
var BaseArtboard = /** @class */ (function () {
    function BaseArtboard(_isBindableArtboard) {
        this.isBindableArtboard = false;
        this.isBindableArtboard = _isBindableArtboard;
    }
    return BaseArtboard;
}());
var Artboard = /** @class */ (function (_super) {
    __extends(Artboard, _super);
    function Artboard(artboard, _file) {
        var _this = _super.call(this, false) || this;
        _this.nativeArtboard = artboard;
        _this.file = _file;
        return _this;
    }
    return Artboard;
}(BaseArtboard));
var BindableArtboard = /** @class */ (function (_super) {
    __extends(BindableArtboard, _super);
    function BindableArtboard(artboard) {
        var _this = _super.call(this, true) || this;
        _this.selfUnref = false;
        _this.nativeArtboard = artboard;
        return _this;
    }
    Object.defineProperty(BindableArtboard.prototype, "viewModel", {
        set: function (value) {
            this.nativeViewModel = value.nativeInstance;
        },
        enumerable: false,
        configurable: true
    });
    BindableArtboard.prototype.destroy = function () {
        var _a;
        if (this.selfUnref) {
            this.nativeArtboard.unref();
            (_a = this.nativeViewModel) === null || _a === void 0 ? void 0 : _a.unref();
        }
    };
    return BindableArtboard;
}(BaseArtboard));
var StateMachine = /** @class */ (function () {
    /**
     * @constructor
     * @param stateMachine runtime state machine object
     * @param instance runtime state machine instance object
     */
    function StateMachine(stateMachine, runtime, playing, artboard) {
        this.stateMachine = stateMachine;
        this.playing = playing;
        this.artboard = artboard;
        /**
         * Caches the inputs from the runtime
         */
        this.inputs = [];
        this.instance = new runtime.StateMachineInstance(stateMachine, artboard);
        this.initInputs(runtime);
    }
    Object.defineProperty(StateMachine.prototype, "hasFocusNodes", {
        /**
         * Whether this state machine has focus nodes
         */
        get: function () {
            return this.instance.hasFocusNodes();
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(StateMachine.prototype, "name", {
        get: function () {
            return this.stateMachine.name;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(StateMachine.prototype, "statesChanged", {
        /**
         * Returns a list of state names that have changed on this frame
         */
        get: function () {
            var names = [];
            for (var i = 0; i < this.instance.stateChangedCount(); i++) {
                names.push(this.instance.stateChangedNameByIndex(i));
            }
            return names;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Advances the state machine instance by a given time.
     * @param time - the time to advance the animation by in seconds
     */
    StateMachine.prototype.advance = function (time) {
        this.instance.advance(time);
    };
    /**
     * Advances the state machine instance by a given time and apply changes to artboard.
     * @param time - the time to advance the animation by in seconds
     */
    StateMachine.prototype.advanceAndApply = function (time) {
        this.instance.advanceAndApply(time);
    };
    /**
     * Enables semantic tree tracking for this state machine instance.
     */
    StateMachine.prototype.enableSemantics = function () {
        this.instance.enableSemantics();
    };
    /**
     * Returns the incremental semantic diff since the last call, or null
     * if semantics is not enabled or nothing changed.
     */
    StateMachine.prototype.drainSemanticsDiff = function () {
        return this.instance.drainSemanticsDiff();
    };
    /**
     * Fire a semantic action (tap, increase, decrease) on a node.
     * @param nodeId - The semantic node ID to target
     * @param actionType - 0 = tap, 1 = increase, 2 = decrease
     */
    StateMachine.prototype.fireSemanticAction = function (nodeId, actionType) {
        this.instance.fireSemanticAction(nodeId, actionType);
    };
    /**
     * When tools that enable accessible experiences traverse elements with focus,
     * we should call this method to focus the semantic node. It will also trigger
     * focus on any Focus listeners for this node
     * @param nodeId ID of the Semantic Node to focus
     * @returns boolean - True if focus was set, false otherwise
     */
    StateMachine.prototype.focusSemanticNode = function (nodeId) {
        return this.instance.focusSemanticNode(nodeId);
    };
    /**
     * Returns the number of events reported from the last advance call
     * @returns Number of events reported
     */
    StateMachine.prototype.reportedEventCount = function () {
        return this.instance.reportedEventCount();
    };
    /**
     * Returns a RiveEvent object emitted from the last advance call at the given index
     * of a list of potentially multiple events. If an event at the index is not found,
     * undefined is returned.
     * @param i index of the event reported in a list of potentially multiple events
     * @returns RiveEvent or extended RiveEvent object returned, or undefined
     */
    StateMachine.prototype.reportedEventAt = function (i) {
        return this.instance.reportedEventAt(i);
    };
    /**
     * Fetches references to the state machine's inputs and caches them
     * @param runtime an instance of the runtime; needed for the SMIInput types
     */
    StateMachine.prototype.initInputs = function (runtime) {
        // Fetch the inputs from the runtime if we don't have them
        for (var i = 0; i < this.instance.inputCount(); i++) {
            var input = this.instance.input(i);
            this.inputs.push(this.mapRuntimeInput(input, runtime));
        }
    };
    /**
     * Maps a runtime input to it's appropriate type
     * @param input
     */
    StateMachine.prototype.mapRuntimeInput = function (input, runtime) {
        if (input.type === runtime.SMIInput.bool) {
            return new StateMachineInput(StateMachineInputType.Boolean, input.asBool());
        }
        else if (input.type === runtime.SMIInput.number) {
            return new StateMachineInput(StateMachineInputType.Number, input.asNumber());
        }
        else if (input.type === runtime.SMIInput.trigger) {
            return new StateMachineInput(StateMachineInputType.Trigger, input.asTrigger());
        }
    };
    /**
     * Deletes the backing Wasm state machine instance; once this is called, this
     * state machine is no more.
     */
    StateMachine.prototype.cleanup = function () {
        this.inputs.forEach(function (input) {
            input.delete();
        });
        this.inputs.length = 0;
        this.instance.delete();
    };
    StateMachine.prototype.bindViewModelInstance = function (viewModelInstance) {
        if (viewModelInstance.runtimeInstance != null) {
            this.instance.bindViewModelInstance(viewModelInstance.runtimeInstance);
        }
    };
    /**
     * Get metadata about the state of focus if applicable for this state machine.
     * @returns FocusState - { hasFocus: boolean, expectsKeyboardInput: boolean }
     */
    StateMachine.prototype.focusState = function () {
        return this.instance.focusState();
    };
    /**
     * Clear focus from the Rive focus node tree.
     */
    StateMachine.prototype.clearFocus = function () {
        this.instance.clearFocus();
    };
    return StateMachine;
}());
// #endregion
// #region animator
/**
 * Manages animation
 */
var Animator = /** @class */ (function () {
    /**
     * Constructs a new animator
     * @constructor
     * @param runtime Rive runtime; needed to instance animations & state machines
     * @param artboard the artboard that holds all animations and state machines
     * @param animations optional list of animations
     * @param stateMachines optional list of state machines
     */
    function Animator(runtime, artboard, eventManager, animations, stateMachines) {
        if (animations === void 0) { animations = []; }
        if (stateMachines === void 0) { stateMachines = []; }
        this.runtime = runtime;
        this.artboard = artboard;
        this.eventManager = eventManager;
        this.animations = animations;
        this.stateMachines = stateMachines;
    }
    /**
     * Adds animations and state machines by their names. If names are shared
     * between animations & state machines, then the first one found will be
     * created. Best not to use the same names for these in your Rive file.
     * @param animatable the name(s) of animations and state machines to add
     * @returns a list of names of the playing animations and state machines
     */
    Animator.prototype.add = function (animatables, playing, fireEvent, semanticsActive) {
        if (fireEvent === void 0) { fireEvent = true; }
        if (semanticsActive === void 0) { semanticsActive = false; }
        animatables = mapToStringArray(animatables);
        // If animatables is empty, play or pause everything
        if (animatables.length === 0) {
            this.animations.forEach(function (a) { return (a.playing = playing); });
            this.stateMachines.forEach(function (m) { return (m.playing = playing); });
        }
        else {
            // Play/pause already instanced items, or create new instances
            var instancedAnimationNames = this.animations.map(function (a) { return a.name; });
            var instancedMachineNames = this.stateMachines.map(function (m) { return m.name; });
            for (var i = 0; i < animatables.length; i++) {
                var aIndex = instancedAnimationNames.indexOf(animatables[i]);
                var mIndex = instancedMachineNames.indexOf(animatables[i]);
                if (aIndex >= 0 || mIndex >= 0) {
                    if (aIndex >= 0) {
                        // Animation is instanced, play/pause it
                        this.animations[aIndex].playing = playing;
                    }
                    else {
                        // State machine is instanced, play/pause it
                        this.stateMachines[mIndex].playing = playing;
                    }
                }
                else {
                    // Try to create a new animation instance
                    var anim = this.artboard.animationByName(animatables[i]);
                    if (anim) {
                        var newAnimation = new _animation__WEBPACK_IMPORTED_MODULE_0__.Animation(anim, this.artboard, this.runtime, playing);
                        // Display the first frame of the specified animation
                        newAnimation.advance(0);
                        newAnimation.apply(1.0);
                        this.animations.push(newAnimation);
                    }
                    else {
                        // Try to create a new state machine instance
                        var sm = this.artboard.stateMachineByName(animatables[i]);
                        if (sm) {
                            var newStateMachine = new StateMachine(sm, this.runtime, playing, this.artboard);
                            if (semanticsActive) {
                                newStateMachine.enableSemantics();
                            }
                            this.stateMachines.push(newStateMachine);
                        }
                    }
                }
            }
        }
        // Fire play/paused events for animations
        if (fireEvent) {
            if (playing) {
                this.eventManager.fire({
                    type: EventType.Play,
                    data: this.playing,
                });
            }
            else {
                this.eventManager.fire({
                    type: EventType.Pause,
                    data: this.paused,
                });
            }
        }
        return playing ? this.playing : this.paused;
    };
    /**
     * Adds linear animations by their names.
     * @param animatables the name(s) of animations to add
     * @param playing whether animations should play on instantiation
     */
    Animator.prototype.initLinearAnimations = function (animatables, playing, isFallingBackFromStateMachines) {
        if (isFallingBackFromStateMachines === void 0) { isFallingBackFromStateMachines = false; }
        // Play/pause already instanced items, or create new instances
        // This validation is kept to maintain compatibility with current behavior.
        // But given that it this is called during artboard initialization
        // it should probably be safe to remove.
        var instancedAnimationNames = this.animations.map(function (a) { return a.name; });
        for (var i = 0; i < animatables.length; i++) {
            var aIndex = instancedAnimationNames.indexOf(animatables[i]);
            if (aIndex >= 0) {
                this.animations[aIndex].playing = playing;
            }
            else {
                // Try to create a new animation instance
                var anim = this.artboard.animationByName(animatables[i]);
                if (anim) {
                    var newAnimation = new _animation__WEBPACK_IMPORTED_MODULE_0__.Animation(anim, this.artboard, this.runtime, playing);
                    // Display the first frame of the specified animation
                    newAnimation.advance(0);
                    newAnimation.apply(1.0);
                    this.animations.push(newAnimation);
                }
                else if (isFallingBackFromStateMachines) { // Throw LoadError if we cannot load the state machine name at all
                    var smInitializationMessage = "State Machine with name ".concat(animatables[i], " not found");
                    throw new RiveError(smInitializationMessage);
                }
                else {
                    console.error("Animation with name ".concat(animatables[i], " not found."));
                }
            }
        }
    };
    /**
     * Adds state machines by their names.
     * @param animatables the name(s) of state machines to add
     * @param playing whether state machines should play on instantiation
     */
    Animator.prototype.initStateMachines = function (animatables, playing, semanticsActive) {
        // Play/pause already instanced items, or create new instances
        // This validation is kept to maintain compatibility with current behavior.
        // But given that it this is called during artboard initialization
        // it should probably be safe to remove.
        var instancedStateMachineNames = this.stateMachines.map(function (a) { return a.name; });
        for (var i = 0; i < animatables.length; i++) {
            var aIndex = instancedStateMachineNames.indexOf(animatables[i]);
            if (aIndex >= 0) {
                this.stateMachines[aIndex].playing = playing;
            }
            else {
                // Try to create a new state machine instance
                var sm = this.artboard.stateMachineByName(animatables[i]);
                if (sm) {
                    var newStateMachine = new StateMachine(sm, this.runtime, playing, this.artboard);
                    if (semanticsActive) {
                        newStateMachine.enableSemantics();
                    }
                    this.stateMachines.push(newStateMachine);
                }
                else {
                    console.warn("State Machine with name ".concat(animatables[i], " not found. Falling back to find an animation with the same name."));
                    // TODO: Remove this fallback in next major release as it complicates initialization.
                    // In order to maintain compatibility with current behavior, if a state machine is not found
                    // we look for an animation with the same name
                    this.initLinearAnimations([animatables[i]], playing, true);
                }
            }
        }
    };
    /**
     * Play the named animations/state machines
     * @param animatables the names of the animations/machines to play; plays all if empty
     * @returns a list of the playing items
     */
    Animator.prototype.play = function (animatables) {
        return this.add(animatables, true);
    };
    /**
     * Advance state machines if they are paused after initialization
     */
    Animator.prototype.advanceIfPaused = function () {
        this.stateMachines.forEach(function (sm) {
            if (!sm.playing) {
                sm.advanceAndApply(0);
            }
        });
    };
    /**
     * Pauses named animations and state machines, or everything if nothing is
     * specified
     * @param animatables names of the animations and state machines to pause
     * @returns a list of names of the animations and state machines paused
     */
    Animator.prototype.pause = function (animatables) {
        return this.add(animatables, false);
    };
    /**
     * Set time of named animations
     * @param animations names of the animations to scrub
     * @param value time scrub value, a floating point number to which the playhead is jumped
     * @returns a list of names of the animations that were scrubbed
     */
    Animator.prototype.scrub = function (animatables, value) {
        var forScrubbing = this.animations.filter(function (a) {
            return animatables.includes(a.name);
        });
        forScrubbing.forEach(function (a) { return (a.scrubTo = value); });
        return forScrubbing.map(function (a) { return a.name; });
    };
    Object.defineProperty(Animator.prototype, "playing", {
        /**
         * Returns a list of names of all animations and state machines currently
         * playing
         */
        get: function () {
            return this.animations
                .filter(function (a) { return a.playing; })
                .map(function (a) { return a.name; })
                .concat(this.stateMachines.filter(function (m) { return m.playing; }).map(function (m) { return m.name; }));
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Animator.prototype, "paused", {
        /**
         * Returns a list of names of all animations and state machines currently
         * paused
         */
        get: function () {
            return this.animations
                .filter(function (a) { return !a.playing; })
                .map(function (a) { return a.name; })
                .concat(this.stateMachines.filter(function (m) { return !m.playing; }).map(function (m) { return m.name; }));
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Stops and removes all named animations and state machines
     * @param animatables animations and state machines to remove
     * @returns a list of names of removed items
     */
    Animator.prototype.stop = function (animatables) {
        var _this = this;
        animatables = mapToStringArray(animatables);
        // If nothing's specified, wipe them out, all of them
        var removedNames = [];
        // Stop everything
        if (animatables.length === 0) {
            removedNames = this.animations
                .map(function (a) { return a.name; })
                .concat(this.stateMachines.map(function (m) { return m.name; }));
            // Clean up before emptying the arrays
            this.animations.forEach(function (a) { return a.cleanup(); });
            this.stateMachines.forEach(function (m) { return m.cleanup(); });
            // Empty out the arrays
            this.animations.splice(0, this.animations.length);
            this.stateMachines.splice(0, this.stateMachines.length);
        }
        else {
            // Remove only the named animations/state machines
            var animationsToRemove = this.animations.filter(function (a) {
                return animatables.includes(a.name);
            });
            animationsToRemove.forEach(function (a) {
                a.cleanup();
                _this.animations.splice(_this.animations.indexOf(a), 1);
            });
            var machinesToRemove = this.stateMachines.filter(function (m) {
                return animatables.includes(m.name);
            });
            machinesToRemove.forEach(function (m) {
                m.cleanup();
                _this.stateMachines.splice(_this.stateMachines.indexOf(m), 1);
            });
            removedNames = animationsToRemove
                .map(function (a) { return a.name; })
                .concat(machinesToRemove.map(function (m) { return m.name; }));
        }
        this.eventManager.fire({
            type: EventType.Stop,
            data: removedNames,
        });
        // Return the list of animations removed
        return removedNames;
    };
    Object.defineProperty(Animator.prototype, "isPlaying", {
        /**
         * Returns true if at least one animation is active
         */
        get: function () {
            return (this.animations.reduce(function (acc, curr) { return acc || curr.playing; }, false) ||
                this.stateMachines.reduce(function (acc, curr) { return acc || curr.playing; }, false));
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Animator.prototype, "isPaused", {
        /**
         * Returns true if all animations are paused and there's at least one animation
         */
        get: function () {
            return (!this.isPlaying &&
                (this.animations.length > 0 || this.stateMachines.length > 0));
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Animator.prototype, "isStopped", {
        /**
         * Returns true if there are no playing or paused animations/state machines
         */
        get: function () {
            return this.animations.length === 0 && this.stateMachines.length === 0;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * If there are no animations or state machines, add the first one found
     * @returns the name of the animation or state machine instanced
     */
    Animator.prototype.atLeastOne = function (playing, fireEvent, semanticsActive) {
        if (fireEvent === void 0) { fireEvent = true; }
        if (semanticsActive === void 0) { semanticsActive = false; }
        var instancedName;
        if (this.animations.length === 0 && this.stateMachines.length === 0) {
            if (this.artboard.animationCount() > 0) {
                // Warn only when the v3 default would actually change what plays
                if (this.artboard.stateMachineCount() > 0) {
                    warnOnce(DeprecationKeys.defaultStateMachine, "No `stateMachine` was specified, so the artboard's first linear animation is playing by default. " +
                        "In the next major version, the artboard's state machine will be played by default instead when one exists. " +
                        "Pass the `stateMachine` parameter to adopt that behavior now.");
                }
                // Add the first animation
                this.add([(instancedName = this.artboard.animationByIndex(0).name)], playing, fireEvent);
            }
            else if (this.artboard.stateMachineCount() > 0) {
                // Add the first state machine
                this.add([(instancedName = this.artboard.stateMachineByIndex(0).name)], playing, fireEvent, semanticsActive);
            }
        }
        return instancedName;
    };
    /**
     * Checks if any animations have looped and if so, fire the appropriate event
     */
    Animator.prototype.handleLooping = function () {
        for (var _i = 0, _a = this.animations.filter(function (a) { return a.playing; }); _i < _a.length; _i++) {
            var animation = _a[_i];
            // Emit if the animation looped
            if (animation.loopValue === 0 && animation.loopCount) {
                animation.loopCount = 0;
                // This is a one-shot; if it has ended, delete the instance
                this.stop(animation.name);
            }
            else if (animation.loopValue === 1 && animation.loopCount) {
                this.eventManager.fire({
                    type: EventType.Loop,
                    data: { animation: animation.name, type: LoopType.Loop },
                });
                animation.loopCount = 0;
            }
            // Wasm indicates a loop at each time the animation
            // changes direction, so a full loop/lap occurs every
            // two loop counts
            else if (animation.loopValue === 2 && animation.loopCount > 1) {
                this.eventManager.fire({
                    type: EventType.Loop,
                    data: { animation: animation.name, type: LoopType.PingPong },
                });
                animation.loopCount = 0;
            }
        }
    };
    /**
     * Checks if states have changed in state machines and fires a statechange
     * event
     */
    Animator.prototype.handleStateChanges = function () {
        var statesChanged = [];
        for (var _i = 0, _a = this.stateMachines.filter(function (sm) { return sm.playing; }); _i < _a.length; _i++) {
            var stateMachine = _a[_i];
            statesChanged.push.apply(statesChanged, stateMachine.statesChanged);
        }
        if (statesChanged.length > 0) {
            this.eventManager.fire({
                type: EventType.StateChange,
                data: statesChanged,
            });
        }
    };
    Animator.prototype.handleAdvancing = function (time) {
        this.eventManager.fire({
            type: EventType.Advance,
            data: time,
        });
    };
    return Animator;
}());
// #endregion
// #region events
/**
 * Supported event types triggered in Rive
 */
var EventType;
(function (EventType) {
    EventType["Load"] = "load";
    EventType["LoadError"] = "loaderror";
    EventType["Play"] = "play";
    EventType["Pause"] = "pause";
    EventType["Stop"] = "stop";
    /**
     * @deprecated Loop events are deprecated and will be removed in a future
     * major version: they are only reported for linear animation playback, which
     * is deprecated. Use a state machine to control playback and data binding to
     * react to changes instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide} for how
     * to migrate.
     */
    EventType["Loop"] = "loop";
    EventType["Draw"] = "draw";
    EventType["Advance"] = "advance";
    /**
     * @deprecated Subscribing to state change events at runtime is deprecated
     * and will be removed in a future major version: use data binding (view model
     * property observers) or state machine actions to react to changes from your
     * graphic instead. See
     * {@link https://rive.app/docs/editor/state-machine/states#actions} for more details.
     */
    EventType["StateChange"] = "statechange";
    /**
     * @deprecated Subscribing to Rive Events at runtime is deprecated and will be removed in a future
     * major version: please use data binding instead. See
     * {@link https://rive.app/docs/runtimes/web/rive-events} for how to migrate.
     */
    EventType["RiveEvent"] = "riveevent";
    EventType["AudioStatusChange"] = "audiostatuschange";
})(EventType || (EventType = {}));
var riveEventsDeprecationWarning = "Subscribing to Rive Events at runtime is deprecated and will be removed in a future major version: " +
    "please use data binding instead. See " +
    "https://rive.app/docs/runtimes/web/rive-events for how to migrate.";
var stateMachineInputsDeprecationWarning = "State machine inputs are deprecated and will be removed in a future major version: " +
    "please use data binding properties instead. See " +
    "https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs for how to migrate.";
var textRunsDeprecationWarning = "Text run APIs are deprecated and will be removed in a future major version: " +
    "please use data binding instead. See " +
    "https://rive.app/docs/editor/data-binding/migration-guide#updating-text-runs-at-runtime for how to migrate.";
var loopEventsDeprecationWarning = "Loop events are deprecated and will be removed in a future major version: " +
    "they are only reported for linear animation playback, which is deprecated. " +
    "Use a state machine to control playback and data binding to react to changes instead. See " +
    "https://rive.app/docs/editor/data-binding/migration-guide for how to migrate.";
var stateChangeEventsDeprecationWarning = "Subscribing to state change events at runtime is deprecated and will be removed in a future major version: " +
    "use data binding (view model property observers) or state machine actions to react to " +
    "changes from your graphic instead. See " +
    "https://rive.app/docs/editor/state-machine/states#actions for how to migrate.";
/**
 * The deprecations this runtime warns about. Each warning prints its own id, so
 * the value can be copied straight out of the console into
 * {@link Rive.suppressDeprecationWarnings}.
 */
var DeprecationKeys = {
    animationNames: "animation-names",
    animationsParam: "animations-param",
    defaultStateMachine: "default-state-machine",
    legacyConstructors: "legacy-constructors",
    legacyUnsubscribe: "legacy-unsubscribe",
    loopEvents: "loop-events",
    namesArray: "names-array",
    riveEvents: "rive-events",
    scrub: "scrub",
    stateChangeEvents: "state-change-events",
    stateMachineInputs: "state-machine-inputs",
    stateMachinesParam: "state-machines-param",
    textRuns: "text-runs",
};
// Derived from `DeprecationKeys`
var deprecationIds = new Set(Object.keys(DeprecationKeys).map(function (name) { return DeprecationKeys[name]; }));
// Deprecations that a consumer has opted out of. Kept at module scope so
// `warnOnce` can read it without referencing the `Rive` class
var suppressedDeprecations = new Set();
/** @internal Backing store for `Rive.suppressDeprecationWarnings`. */
var setSuppressedDeprecations = function (ids) {
    suppressedDeprecations.clear();
    if (!Array.isArray(ids)) {
        console.warn("[Rive] `suppressDeprecationWarnings` expects an array of deprecation ids, " +
            "received ".concat(typeof ids, ". Nothing was suppressed."));
        return;
    }
    for (var _i = 0, ids_1 = ids; _i < ids_1.length; _i++) {
        var id = ids_1[_i];
        if (deprecationIds.has(id)) {
            suppressedDeprecations.add(id);
        }
    }
};
// Deprecation warnings already emitted; each is logged at most once per page
// session to avoid flooding the console when many instances are created.
var emittedWarnings = new Set();
/**
 * Logs a deprecation warning at most once per page session, unless its id has
 * been passed to `Rive.suppressDeprecationWarnings`.
 */
var warnOnce = function (id, message) {
    if (suppressedDeprecations.has(id)) {
        return;
    }
    var key = "".concat(id, ":").concat(message);
    if (emittedWarnings.has(key)) {
        return;
    }
    emittedWarnings.add(key);
    console.warn("[Rive: ".concat(id, "] ").concat(message, "\n") +
        "To suppress this warning, set Rive.suppressDeprecationWarnings = [\"".concat(id, "\"]"));
};
/**
 * Warns that a playback-control method received an array of names; the next
 * major version restricts these parameters to a single string, since playing
 * multiple animations or state machines at once will not be supported.
 */
var warnIfNamesArray = function (names, methodName) {
    if (Array.isArray(names)) {
        warnOnce(DeprecationKeys.namesArray, "Passing an array of names to `".concat(methodName, "()` is deprecated: in the next major version this parameter will be a single string, and playing multiple animations or state machines at once will not be supported."));
    }
};
/**
 * Warns that a playback-control method received linear animation names;
 * name-based control remains supported for state machines only, so
 * user-specified linear animation names are going away in a future major
 * version.
 */
var warnDeprecatedAnimationNames = function (methodName) {
    warnOnce(DeprecationKeys.animationNames, "Passing linear animation names to `".concat(methodName, "()` is deprecated and will be removed in a future major version: ") +
        "Pass a single state machine name to control playback instead.");
};
/**
 * Looping types: one-shot, loop, and ping-pong
 * @deprecated Loop events are deprecated and will be removed in a future major
 * version: they are only reported for linear animation playback, which is
 * deprecated. Use a state machine to control playback and data binding to
 * react to changes instead.
 */
var LoopType;
(function (LoopType) {
    LoopType["OneShot"] = "oneshot";
    LoopType["Loop"] = "loop";
    LoopType["PingPong"] = "pingpong";
})(LoopType || (LoopType = {}));
// Manages Rive events and listeners
var EventManager = /** @class */ (function () {
    function EventManager(listeners) {
        if (listeners === void 0) { listeners = []; }
        this.listeners = listeners;
    }
    // Gets listeners of specified type
    EventManager.prototype.getListeners = function (type) {
        return this.listeners.filter(function (e) { return e.type === type; });
    };
    // Adds a listener
    EventManager.prototype.add = function (listener) {
        if (!this.listeners.includes(listener)) {
            this.listeners.push(listener);
        }
    };
    /**
     * Removes a listener
     * @param listener the listener with the callback to be removed
     */
    EventManager.prototype.remove = function (listener) {
        // We can't simply look for the listener as it'll be a different instance to
        // one originally subscribed. Find all the listeners of the right type and
        // then check their callbacks which should match.
        for (var i = 0; i < this.listeners.length; i++) {
            var currentListener = this.listeners[i];
            if (currentListener.type === listener.type) {
                if (currentListener.callback === listener.callback) {
                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    };
    /**
     * Clears all listeners of specified type, or every listener if no type is
     * specified
     * @param type the type of listeners to clear, or all listeners if not
     * specified
     */
    EventManager.prototype.removeAll = function (type) {
        var _this = this;
        if (!type) {
            this.listeners.splice(0, this.listeners.length);
        }
        else {
            this.listeners
                .filter(function (l) { return l.type === type; })
                .forEach(function (l) { return _this.remove(l); });
        }
    };
    // Fires an event
    EventManager.prototype.fire = function (event) {
        var eventListeners = this.getListeners(event.type);
        eventListeners.forEach(function (listener) { return listener.callback(event); });
    };
    return EventManager;
}());
// Manages a queue of tasks
var TaskQueueManager = /** @class */ (function () {
    function TaskQueueManager(eventManager) {
        this.eventManager = eventManager;
        this.queue = [];
    }
    // Adds a task top the queue
    TaskQueueManager.prototype.add = function (task) {
        this.queue.push(task);
    };
    // Processes all tasks in the queue
    TaskQueueManager.prototype.process = function () {
        while (this.queue.length > 0) {
            var task = this.queue.shift();
            if (task === null || task === void 0 ? void 0 : task.action) {
                task.action();
            }
            if (task === null || task === void 0 ? void 0 : task.event) {
                this.eventManager.fire(task.event);
            }
        }
    };
    return TaskQueueManager;
}());
// #endregion
// #region Audio
var SystemAudioStatus;
(function (SystemAudioStatus) {
    SystemAudioStatus[SystemAudioStatus["AVAILABLE"] = 0] = "AVAILABLE";
    SystemAudioStatus[SystemAudioStatus["UNAVAILABLE"] = 1] = "UNAVAILABLE";
})(SystemAudioStatus || (SystemAudioStatus = {}));
// Class to handle audio context availability and status changes
var AudioManager = /** @class */ (function (_super) {
    __extends(AudioManager, _super);
    function AudioManager() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._started = false;
        _this._enabled = false;
        _this._status = SystemAudioStatus.UNAVAILABLE;
        return _this;
    }
    AudioManager.prototype.delay = function (time) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, time); })];
            });
        });
    };
    AudioManager.prototype.timeout = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (_, reject) { return setTimeout(reject, 50); })];
            });
        });
    };
    // Alerts animations on status changes and removes the listeners to avoid alerting twice.
    AudioManager.prototype.reportToListeners = function () {
        this.fire({ type: EventType.AudioStatusChange });
        this.removeAll();
    };
    /**
     * The audio context has been resolved.
     * Alert any listeners that we can now play audio.
     * Rive will now play audio at the configured volume.
     */
    AudioManager.prototype.enableAudio = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._enabled) {
                    this._enabled = true;
                    this._status = SystemAudioStatus.AVAILABLE;
                    this.reportToListeners();
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Check if we are able to play audio.
     *
     * We currently check the audio context, when resume() returns before a timeout we know that the
     * audio context is running and we can enable audio.
     */
    AudioManager.prototype.testAudio = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!(this._status === SystemAudioStatus.UNAVAILABLE &&
                            this._audioContext !== null)) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, Promise.race([this._audioContext.resume(), this.timeout()])];
                    case 2:
                        _b.sent();
                        this.enableAudio();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Establish audio for use with rive.
     * We both test if we can use audio intermittently and listen for user interaction.
     * The aim is to enable audio playback as soon as the browser allows this.
     */
    AudioManager.prototype._establishAudio = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this._started) return [3 /*break*/, 5];
                        this._started = true;
                        if (!(typeof window == "undefined")) return [3 /*break*/, 1];
                        this.enableAudio();
                        return [3 /*break*/, 5];
                    case 1:
                        this._audioContext = new AudioContext();
                        this.listenForUserAction();
                        _a.label = 2;
                    case 2:
                        if (!(this._status === SystemAudioStatus.UNAVAILABLE)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.testAudio()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.delay(1000)];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AudioManager.prototype.listenForUserAction = function () {
        var _this = this;
        // NOTE: AudioContexts are ready immediately if requested in a ui callback
        // we *could* re request one in this listener.
        var _clickListener = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // note this has "better" results than calling `await this.testAudio()`
                // as we force audio to be enabled in the current thread, rather than chancing
                // the thread to be passed over for some other async context
                this.enableAudio();
                return [2 /*return*/];
            });
        }); };
        // NOTE: we should test this on mobile/pads
        document.addEventListener("pointerdown", _clickListener, {
            once: true,
        });
    };
    /**
     * Establish the audio context for rive, this lets rive know that we can play audio.
     */
    AudioManager.prototype.establishAudio = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this._establishAudio();
                return [2 /*return*/];
            });
        });
    };
    Object.defineProperty(AudioManager.prototype, "systemVolume", {
        get: function () {
            if (this._status === SystemAudioStatus.UNAVAILABLE) {
                // We do an immediate test to avoid depending on the delay of the running test
                this.testAudio();
                return 0;
            }
            return 1;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(AudioManager.prototype, "status", {
        get: function () {
            return this._status;
        },
        enumerable: false,
        configurable: true
    });
    return AudioManager;
}(EventManager));
var audioManager = new AudioManager();
var FakeResizeObserver = /** @class */ (function () {
    function FakeResizeObserver() {
    }
    FakeResizeObserver.prototype.observe = function () { };
    FakeResizeObserver.prototype.unobserve = function () { };
    FakeResizeObserver.prototype.disconnect = function () { };
    return FakeResizeObserver;
}());
var MyResizeObserver = globalThis.ResizeObserver || FakeResizeObserver;
/**
 * This class takes care of any observers that will be attached to an animation.
 * It should be treated as a singleton because observers are much more performant
 * when used for observing multiple elements by a single instance.
 */
var ObjectObservers = /** @class */ (function () {
    function ObjectObservers() {
        var _this = this;
        this._elementsMap = new Map();
        /**
         * Resize observers trigger both when the element changes its size and also when the
         * element is added or removed from the document.
         */
        this._onObservedEntry = function (entry) {
            var observed = _this._elementsMap.get(entry.target);
            if (observed !== null) {
                observed.onResize(entry.target.clientWidth == 0 || entry.target.clientHeight == 0);
            }
            else {
                _this._resizeObserver.unobserve(entry.target);
            }
        };
        this._onObserved = function (entries) {
            entries.forEach(_this._onObservedEntry);
        };
        this._resizeObserver = new MyResizeObserver(this._onObserved);
    }
    // Adds an observable element
    ObjectObservers.prototype.add = function (element, onResize) {
        var observed = {
            onResize: onResize,
            element: element,
        };
        this._elementsMap.set(element, observed);
        this._resizeObserver.observe(element);
        return observed;
    };
    // Removes an observable element
    ObjectObservers.prototype.remove = function (observed) {
        this._resizeObserver.unobserve(observed.element);
        this._elementsMap.delete(observed.element);
    };
    return ObjectObservers;
}());
var observers = new ObjectObservers();
// #endregion
// #region Rive
var nextRiveInstanceId = 0;
/**
 * Resolves which animation/state machine names playback should start with.
 * The `stateMachine` parameter takes priority; the deprecated plural
 * `animations`/`stateMachines` parameters apply only when it
 * is not provided.
 */
var resolveStartingPlayback = function (_a) {
    var stateMachine = _a.stateMachine, animations = _a.animations, stateMachines = _a.stateMachines;
    if (animations !== undefined) {
        warnOnce(DeprecationKeys.animationsParam, "The `animations` parameter is deprecated and will be removed in a future major version: please use the `stateMachine` parameter to play a state machine instead.");
    }
    if (stateMachines !== undefined) {
        warnOnce(DeprecationKeys.stateMachinesParam, "The `stateMachines` parameter is deprecated: please use `stateMachine` with a single state machine name instead.");
    }
    if (stateMachine) {
        return {
            startingAnimationNames: [],
            startingStateMachineNames: [stateMachine],
        };
    }
    return {
        startingAnimationNames: mapToStringArray(animations),
        startingStateMachineNames: mapToStringArray(stateMachines),
    };
};
var RiveFile = /** @class */ (function () {
    function RiveFile(params) {
        // Allow the runtime to automatically load assets hosted in Rive's runtime.
        this.enableRiveAssetCDN = true;
        // When true, emits performance.mark/measure entries during RiveFile load.
        this.enablePerfMarks = false;
        this.referenceCount = 0;
        this.destroyed = false;
        this.selfUnref = false;
        this.bindableArtboards = [];
        // Deferred rendering was requested; the session may still be null if this
        // build has no deferred support.
        this.deferred = false;
        // The session this file imported through, null when immediate. Owned here:
        // it has to outlive the file, so it is deleted after the file is released.
        this.session = null;
        // Attaching is once per session: a detached session can never replay again,
        // so a claimed file re-imports for the next instance implicitly. Mirrors the native
        // latch (WebGL2DeferredSession::everBound, C2DDeferredSession::claim).
        this._sessionClaimed = false;
        // Releasing this file has to be deterministic once a session owns its
        // resources, so the finalizer is disarmed rather than left to GC.
        this.fileFinalizer = null;
        this.boundElsewhereWarned = false;
        this.src = params.src;
        this.buffer = params.buffer;
        this.deferred = !!params.enableGPUCanvas;
        if (params.assetLoader)
            this.assetLoader = params.assetLoader;
        this.enableRiveAssetCDN =
            typeof params.enableRiveAssetCDN == "boolean"
                ? params.enableRiveAssetCDN
                : true;
        this.enablePerfMarks = !!params.enablePerfMarks;
        if (this.enablePerfMarks)
            _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader.enablePerfMarks = true;
        // New event management system
        this.eventManager = new EventManager();
        if (params.onLoad)
            this.on(EventType.Load, params.onLoad);
        if (params.onLoadError)
            this.on(EventType.LoadError, params.onLoadError);
    }
    RiveFile.prototype.releaseFile = function () {
        var _a, _b;
        // Release here rather than leaving it to the finalization registry. The
        // native file frees GL-backed resources when its last reference goes, and
        // callers reach this with the renderer's context current; a finalizer runs
        // with none, so those deletes would silently do nothing.
        (_a = this.fileFinalizer) === null || _a === void 0 ? void 0 : _a.release();
        (_b = this.file) === null || _b === void 0 ? void 0 : _b.unref();
        this.fileFinalizer = null;
        this.file = null;
    };
    RiveFile.prototype.releaseSession = function () {
        var _a;
        // Known limitation: cleanup() on a file an instance is still drawing
        // deletes the session under it. A RiveFile's creator holds no reference of
        // its own, so their cleanup() can take the count to zero.
        (_a = this.session) === null || _a === void 0 ? void 0 : _a.delete();
        this.session = null;
    };
    RiveFile.prototype.releaseBindableArtboards = function () {
        this.bindableArtboards.forEach(function (bindableArtboard) {
            return bindableArtboard.destroy();
        });
    };
    RiveFile.prototype.initData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_1, loader, loaderWrapper, _b, error_2, fileFinalizer;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!(this.src && !this.buffer)) return [3 /*break*/, 4];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        _a = this;
                        return [4 /*yield*/, loadRiveFile(this.src)];
                    case 2:
                        _a.buffer = _c.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _c.sent();
                        if (error_1 instanceof Error) {
                            throw error_1;
                        }
                        throw new RiveError(RiveFile.fileLoadErrorMessage);
                    case 4:
                        if (this.destroyed) {
                            return [2 /*return*/];
                        }
                        if (this.deferred && this.session === null) {
                            this.session = RiveFile.makeDeferredSession(this.runtime);
                        }
                        if (this.assetLoader) {
                            loaderWrapper = new _utils__WEBPACK_IMPORTED_MODULE_3__.CustomFileAssetLoaderWrapper(this.runtime, this.assetLoader, this.session);
                            loader = loaderWrapper.assetLoader;
                        }
                        // Load the Rive file
                        if (this.enablePerfMarks)
                            performance.mark('rive:file-load:start');
                        _c.label = 5;
                    case 5:
                        _c.trys.push([5, 7, , 8]);
                        _b = this;
                        return [4 /*yield*/, this.runtime.load(new Uint8Array(this.buffer), loader, this.enableRiveAssetCDN, this.session)];
                    case 6:
                        _b.file = _c.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        error_2 = _c.sent();
                        // The finalizer that would reclaim the session is only registered once
                        // the import succeeds, so a failed load has to release it here.
                        this.releaseSession();
                        throw error_2;
                    case 8:
                        if (this.enablePerfMarks) {
                            performance.mark('rive:file-load:end');
                            performance.measure('rive:file-load', 'rive:file-load:start', 'rive:file-load:end');
                        }
                        if (this.destroyed) {
                            this.releaseFile();
                            this.releaseSession();
                            return [2 /*return*/];
                        }
                        if (this.file === null) {
                            // A malformed file resolves to null rather than rejecting. Release the
                            // session now: a finalizer for a file that does not exist would keep it
                            // alive until GC, or for as long as the caller holds the failed RiveFile.
                            this.releaseSession();
                            this.fireLoadError(RiveFile.fileLoadErrorMessage);
                            return [2 /*return*/];
                        }
                        fileFinalizer = new _utils__WEBPACK_IMPORTED_MODULE_3__.FileFinalizer(this.file, this.session);
                        this.fileFinalizer = fileFinalizer;
                        _utils__WEBPACK_IMPORTED_MODULE_3__.finalizationRegistry.register(this, fileFinalizer);
                        this.eventManager.fire({
                            type: EventType.Load,
                            data: this,
                        });
                        return [2 /*return*/];
                }
            });
        });
    };
    RiveFile.prototype.loadRiveFileBytes = function () {
        return __awaiter(this, void 0, void 0, function () {
            var bufferPromise;
            return __generator(this, function (_a) {
                if (this.enablePerfMarks)
                    performance.mark('rive:fetch-riv:start');
                bufferPromise = this.src
                    ? loadRiveFile(this.src)
                    : Promise.resolve(this.buffer);
                if (this.enablePerfMarks && this.src) {
                    bufferPromise.then(function () {
                        performance.mark('rive:fetch-riv:end');
                        performance.measure('rive:fetch-riv', 'rive:fetch-riv:start', 'rive:fetch-riv:end');
                    });
                }
                return [2 /*return*/, bufferPromise];
            });
        });
    };
    RiveFile.prototype.loadRuntime = function () {
        return __awaiter(this, void 0, void 0, function () {
            var runtimePromise;
            return __generator(this, function (_a) {
                if (this.enablePerfMarks)
                    performance.mark('rive:await-wasm:start');
                runtimePromise = _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader.awaitInstance();
                if (this.enablePerfMarks) {
                    runtimePromise.then(function () {
                        performance.mark('rive:await-wasm:end');
                        performance.measure('rive:await-wasm', 'rive:await-wasm:start', 'rive:await-wasm:end');
                    });
                }
                return [2 /*return*/, runtimePromise];
            });
        });
    };
    RiveFile.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, bufferResolved, runtimeResolved, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        // If no source file url specified, it's a bust
                        if (!this.src && !this.buffer) {
                            this.fireLoadError(RiveFile.missingErrorMessage);
                            return [2 /*return*/];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, Promise.all([this.loadRiveFileBytes(), this.loadRuntime()])];
                    case 2:
                        _a = _b.sent(), bufferResolved = _a[0], runtimeResolved = _a[1];
                        if (this.destroyed) {
                            return [2 /*return*/];
                        }
                        // .riv file buffer and WASM runtime instance
                        this.buffer = bufferResolved;
                        this.runtime = runtimeResolved;
                        if (this.enablePerfMarks)
                            performance.mark('rive:init-data:start');
                        return [4 /*yield*/, this.initData()];
                    case 3:
                        _b.sent();
                        if (this.enablePerfMarks) {
                            performance.mark('rive:init-data:end');
                            performance.measure('rive:init-data', 'rive:init-data:start', 'rive:init-data:end');
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_3 = _b.sent();
                        this.fireLoadError(error_3 instanceof Error ? error_3.message : RiveFile.fileLoadErrorMessage);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    RiveFile.prototype.fireLoadError = function (message) {
        this.eventManager.fire({
            type: EventType.LoadError,
            data: message,
        });
        throw new RiveError(message);
    };
    /**
     * Subscribe to Rive-generated events
     * @param type the type of event to subscribe to
     * @param callback callback to fire when the event occurs
     */
    RiveFile.prototype.on = function (type, callback) {
        this.eventManager.add({
            type: type,
            callback: callback,
        });
    };
    /**
     * Unsubscribes from a Rive-generated event
     * @param type the type of event to unsubscribe from
     * @param callback the callback to unsubscribe
     */
    RiveFile.prototype.off = function (type, callback) {
        this.eventManager.remove({
            type: type,
            callback: callback,
        });
    };
    RiveFile.prototype.cleanup = function () {
        this.referenceCount -= 1;
        if (this.referenceCount <= 0) {
            this.removeAllRiveEventListeners();
            this.releaseFile();
            this.releaseBindableArtboards();
            // Everything imported through the session is gone; the session can go.
            this.releaseSession();
            this.destroyed = true;
        }
    };
    // Deferred is only compiled into some runtime builds, so feature detect it
    // and degrade to an immediate import rather than failing the load.
    RiveFile.makeDeferredSession = function (runtime) {
        var _a, _b;
        var session = (_b = (_a = runtime.makeDeferredSession) === null || _a === void 0 ? void 0 : _a.call(runtime)) !== null && _b !== void 0 ? _b : null;
        if (session === null && !RiveFile.deferredUnsupportedWarned) {
            RiveFile.deferredUnsupportedWarned = true;
            console.warn("Rive: `enableGPUCanvas: true` was ignored because this runtime build has no GPU Canvas support; importing in immediate mode. Use a @rive-app/webgl2 or @rive-app/canvas build with deferred rendering compiled in.");
        }
        return session;
    };
    Object.defineProperty(RiveFile.prototype, "deferredSession", {
        /**
         * @internal The deferred session this file imported through, or null if it
         * was imported in immediate mode.
         */
        get: function () {
            return this.session;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RiveFile.prototype, "deferredRequested", {
        /**
         * @internal Whether deferred was asked for, even when this build could not
         * honor it and imported immediate.
         */
        get: function () {
            return this.deferred;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RiveFile.prototype, "sessionClaimed", {
        /**
         * @internal Whether this file's session has ever been attached to a renderer.
         * Attaching is once per session, so a claimed file re-imports for the next
         * instance even after the renderer it was bound to is gone.
         */
        get: function () {
            return this._sessionClaimed;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * @internal Marks this file's session as spent. There is no matching release:
     * a session that has been attached can never replay for another renderer.
     */
    RiveFile.prototype.claimSession = function () {
        this._sessionClaimed = true;
    };
    /**
     * @internal One warning per file however many instances collide on it.
     */
    RiveFile.prototype.warnBoundElsewhereOnce = function () {
        if (this.boundElsewhereWarned) {
            return;
        }
        this.boundElsewhereWarned = true;
        console.warn("Rive: this deferred RiveFile is already bound to another Rive instance's canvas, and a deferred session cannot span canvases. Re-importing the file for this instance (an extra parse of the retained buffer, no extra network request).");
    };
    /**
     * @internal Re-imports this file from its retained buffer into a mode of its
     * own. The copy is owned by whoever asked for it and never joins this file's
     * reference count.
     */
    RiveFile.prototype.reimport = function (deferred) {
        return __awaiter(this, void 0, void 0, function () {
            var copy;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        copy = new RiveFile({
                            buffer: this.buffer,
                            assetLoader: this.assetLoader,
                            enableRiveAssetCDN: this.enableRiveAssetCDN,
                            enablePerfMarks: this.enablePerfMarks,
                            enableGPUCanvas: deferred,
                        });
                        return [4 /*yield*/, copy.init()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, copy];
                }
            });
        });
    };
    /**
     * Unsubscribes all Rive listeners from an event type, or everything if no type is
     * given
     * @param type the type of event to unsubscribe from, or all types if
     * undefined
     */
    RiveFile.prototype.removeAllRiveEventListeners = function (type) {
        this.eventManager.removeAll(type);
    };
    RiveFile.prototype.getInstance = function () {
        if (this.file !== null) {
            this.referenceCount += 1;
            return this.file;
        }
    };
    RiveFile.prototype.destroyIfUnused = function () {
        if (this.referenceCount <= 0) {
            this.cleanup();
        }
    };
    RiveFile.prototype.createBindableArtboard = function (nativeBindableArtboard) {
        if (nativeBindableArtboard != null) {
            var bindableArtboard = new BindableArtboard(nativeBindableArtboard);
            (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(bindableArtboard, bindableArtboard.nativeArtboard);
            this.bindableArtboards.push(bindableArtboard);
            return bindableArtboard;
        }
        return null;
    };
    /**
     * @deprecated This function is deprecated. For better stability and memory management
     * use `getBindableArtboard()` instead.
     * @param {string} name - The name of the artboard.
     * @returns {Artboard} The artboard to bind to.
     */
    RiveFile.prototype.getArtboard = function (name) {
        var nativeArtboard = this.file.artboardByName(name);
        if (nativeArtboard != null) {
            return new Artboard(nativeArtboard, this);
        }
    };
    RiveFile.prototype.getBindableArtboard = function (name) {
        var nativeArtboard = this.file.bindableArtboardByName(name);
        return this.createBindableArtboard(nativeArtboard);
    };
    RiveFile.prototype.getDefaultBindableArtboard = function () {
        var nativeArtboard = this.file.bindableArtboardDefault();
        return this.createBindableArtboard(nativeArtboard);
    };
    RiveFile.prototype.internalBindableArtboardFromArtboard = function (artboard) {
        var nativeBindableArtboard = this.file.internalBindableArtboardFromArtboard(artboard);
        return this.createBindableArtboard(nativeBindableArtboard);
    };
    RiveFile.prototype.viewModelByName = function (name) {
        var viewModel = this.file.viewModelByName(name);
        if (viewModel !== null) {
            return new ViewModel(viewModel);
        }
        return null;
    };
    /**
     * @returns the names of the file's global view models, in file order.
     */
    RiveFile.prototype.globalViewModelNames = function () {
        return this.file.globalViewModelNames();
    };
    // Error message for missing source or buffer
    RiveFile.missingErrorMessage = "Rive source file or data buffer required";
    // Error message for file load error
    RiveFile.fileLoadErrorMessage = "The file failed to load";
    // Deferred support is per build, so the warning is per page, not per file.
    RiveFile.deferredUnsupportedWarned = false;
    return RiveFile;
}());

var Rive = /** @class */ (function () {
    function Rive(params) {
        var _this = this;
        var _a, _b, _c, _d;
        // Tracks if a Rive file is loaded
        this.loaded = false;
        // Tracks if a Rive file is destroyed
        this.destroyed = false;
        // Reference of an object that handles any observers for the animation
        this._observed = null;
        /**
         * Tracks if a Rive file is loaded; we need this in addition to loaded as some
         * commands (e.g. contents) can be called as soon as the file is loaded.
         * However, playback commands need to be queued and run in order once initial
         * animations and autoplay has been sorted out. This applies to play, pause,
         * and start.
         */
        this.readyForPlaying = false;
        // Deferred rendering was requested for this instance. The file it renders
        // has the final say, since a file's mode is fixed at import.
        this.deferredRenderer = false;
        // Decides the context attributes on every init(); cleared if the renderer can't inkbleed.
        this._inkbleedCapable = false;
        this._inkbleed = false;
        // Whether this instance imported the file in `riveFile` (true) or the caller
        // supplied it (false). Only a file we imported may be released without a
        // matching getInstance(): a caller's file is theirs however this init ends.
        this.ownsRiveFile = false;
        // Runtime artboard
        this.artboard = null;
        // place to clear up pointer/touch event listeners
        this.eventCleanup = null;
        // Manages keyboard and DOM-focus interactions for the canvas.
        this._keyboardInteractions = null;
        this.shouldDisableRiveListeners = false;
        this.automaticallyHandleEvents = false;
        this.dispatchPointerExit = true;
        // Allow all pointers to be passed to the runtime
        this.enableMultiTouch = false;
        // Allow the runtime to automatically load assets hosted in Rive's runtime.
        this.enableRiveAssetCDN = true;
        this.semanticsMode = _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticMode.Disabled;
        this.semanticsOptions = {
            riveCanvasLabel: "Rive animation",
        };
        /** True when this instance may drain semantics and render the overlay. */
        this._semanticsActive = false;
        // Keep a local value of the set volume to update it asynchronously
        this._volume = 1;
        // Keep a local value of the set width to update it asynchronously
        this._artboardWidth = undefined;
        // Keep a local value of the set height to update it asynchronously
        this._artboardHeight = undefined;
        // Keep a local value of the device pixel ratio used in rendering and canvas/artboard resizing
        this._devicePixelRatioUsed = 1;
        // Whether the canvas element's size is 0
        this._hasZeroSize = false;
        // Whether a draw operation needs to be forced
        this._needsRedraw = false;
        // Canvas width and height. Values are lazily updated so they might
        // not be in sync with current canvas size.
        this._currentCanvasWidth = 0;
        this._currentCanvasHeight = 0;
        // Audio event listener
        this._audioEventListener = null;
        // draw method bound to the class
        this._boundDraw = null;
        // Page visibility handler — prevents state machine advancing / rAF from being invoked with large time delta
        // when the browser tab is switched back to after being hidden.
        this._pageVisibilityHandler = null;
        // True only when the page visibility handler itself cancelled an active frame.
        // Set by stopRendering(), cleared by startRendering(). Prevents the
        // visibilitychange handler from restarting a rendering loop the caller intentionally stopped.
        this._explicitlyStoppedRendering = false;
        this._viewModelInstance = null;
        // User-provided global view model instances, keyed by their global view
        // model's name. Globals not present here are still driven by the default
        // instances the runtime seeds; the getter only surfaces instances the user
        // has explicitly set.
        this._globalViewModelInstances = new Map();
        this._dataEnums = null;
        this._tabIndex = null;
        this._prevHasFocus = false;
        this._prevWantsTextInputSession = false;
        // Pointer-down defers the proxy focus: mousedown's default would refocus the canvas and
        // touchstart isn't user activation; pointer-up focuses it.
        this._inPointerDownDrain = false;
        this._focusOptions = {
            allowFocusInterrupt: false,
        };
        // Tracks the semantic tree for the given graphic
        this._semanticTree = null;
        this._accessibilityOverlay = null;
        /**
         * True when an input to the accessibility overlay's artboard→canvas transform
         * (layout fit/alignment/bounds, devicePixelRatio, or layout scale) has changed
         * and the matrix must be recomputed on the next overlay update. Avoids calling
         * computeAlignment every frame when only the semantic tree changed.
         */
        this._overlayTransformDirty = true;
        // Module-level counter for unique instance IDs for semantic overlay containers
        this._instanceId = "".concat(nextRiveInstanceId++);
        this.drawOptimization = DrawOptimizationOptions.DrawOnChanged;
        // When true, emits performance.mark/measure entries for load and render.
        this.enablePerfMarks = false;
        // Durations to generate a frame for the last second. Used for performance profiling.
        this.durations = [];
        this.frameTimes = [];
        this.frameCount = 0;
        this.isTouchScrollEnabled = false;
        this.onCanvasResize = function (hasZeroSize) {
            var toggledDisplay = _this._hasZeroSize !== hasZeroSize;
            _this._hasZeroSize = hasZeroSize;
            if (!hasZeroSize) {
                if (toggledDisplay) {
                    _this.resizeDrawingSurfaceToCanvas();
                }
            }
            else if (!_this._layout.maxX || !_this._layout.maxY) {
                _this.resizeToCanvas();
            }
        };
        this.isEditingHostFocused = function () { var _a, _b; return (_b = (_a = _this._keyboardInteractions) === null || _a === void 0 ? void 0 : _a.isEditingHostFocused()) !== null && _b !== void 0 ? _b : false; };
        // Tracks the current animation frame request
        this.frameRequestId = null;
        /**
         * Used be draw to track when a second of active rendering time has passed.
         * Used for debugging purposes
         */
        this.renderSecondTimer = 0;
        this._boundDraw = this.draw.bind(this);
        if (typeof document !== 'undefined') {
            this._pageVisibilityHandler = this._onPageVisibilityChange.bind(this);
            document.addEventListener('visibilitychange', this._pageVisibilityHandler);
        }
        this.canvas = params.canvas;
        if (params.canvas.constructor === HTMLCanvasElement) {
            this._observed = observers.add(this.canvas, this.onCanvasResize);
        }
        this._currentCanvasWidth = this.canvas.width;
        this._currentCanvasHeight = this.canvas.height;
        this.src = params.src;
        this.buffer = params.buffer;
        this.riveFile = params.riveFile;
        this.layout = (_a = params.layout) !== null && _a !== void 0 ? _a : new Layout();
        this.shouldDisableRiveListeners = !!params.shouldDisableRiveListeners;
        this.isTouchScrollEnabled = !!params.isTouchScrollEnabled;
        if (params.automaticallyHandleEvents) {
            warnOnce(DeprecationKeys.riveEvents, "The `automaticallyHandleEvents` parameter is deprecated. " +
                riveEventsDeprecationWarning);
        }
        this.automaticallyHandleEvents = !!params.automaticallyHandleEvents;
        this.dispatchPointerExit =
            params.dispatchPointerExit === false
                ? params.dispatchPointerExit
                : this.dispatchPointerExit;
        this.enableMultiTouch = !!params.enableMultiTouch;
        this.drawOptimization = (_b = params.drawingOptions) !== null && _b !== void 0 ? _b : this.drawOptimization;
        this.enableRiveAssetCDN =
            params.enableRiveAssetCDN === undefined
                ? true
                : params.enableRiveAssetCDN;
        this.enablePerfMarks = !!params.enablePerfMarks;
        if (this.enablePerfMarks)
            _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader.enablePerfMarks = true;
        this._focusOptions = (_c = params.focusOptions) !== null && _c !== void 0 ? _c : this._focusOptions;
        this._tabIndex = (_d = params.tabIndex) !== null && _d !== void 0 ? _d : null;
        this.deferredRenderer = !!params.enableGPUCanvas;
        this._inkbleedCapable = !!params.enableInkbleed;
        this._inkbleed = this._inkbleedCapable;
        // New event management system
        this.eventManager = new EventManager();
        if (params.onLoad)
            this.on(EventType.Load, params.onLoad);
        if (params.onLoadError)
            this.on(EventType.LoadError, params.onLoadError);
        if (params.onPlay)
            this.on(EventType.Play, params.onPlay);
        if (params.onPause)
            this.on(EventType.Pause, params.onPause);
        if (params.onStop)
            this.on(EventType.Stop, params.onStop);
        if (params.onLoop)
            this.on(EventType.Loop, params.onLoop);
        if (params.onStateChange)
            this.on(EventType.StateChange, params.onStateChange);
        if (params.onAdvance)
            this.on(EventType.Advance, params.onAdvance);
        /**
         * @deprecated Use camelCase'd versions instead.
         */
        if (params.onload && !params.onLoad)
            this.on(EventType.Load, params.onload);
        if (params.onloaderror && !params.onLoadError)
            this.on(EventType.LoadError, params.onloaderror);
        if (params.onplay && !params.onPlay)
            this.on(EventType.Play, params.onplay);
        if (params.onpause && !params.onPause)
            this.on(EventType.Pause, params.onpause);
        if (params.onstop && !params.onStop)
            this.on(EventType.Stop, params.onstop);
        if (params.onloop && !params.onLoop)
            this.on(EventType.Loop, params.onloop);
        if (params.onstatechange && !params.onStateChange)
            this.on(EventType.StateChange, params.onstatechange);
        /**
         * Asset loading
         */
        if (params.assetLoader)
            this.assetLoader = params.assetLoader;
        // Hook up the task queue
        this.taskQueue = new TaskQueueManager(this.eventManager);
        this.init({
            src: this.src,
            buffer: this.buffer,
            riveFile: this.riveFile,
            autoplay: params.autoplay,
            autoBind: params.autoBind,
            stateMachine: params.stateMachine,
            animations: params.animations,
            stateMachines: params.stateMachines,
            artboard: params.artboard,
            useOffscreenRenderer: params.useOffscreenRenderer,
            tabIndex: params.tabIndex,
            semanticsMode: params.semanticsMode,
            semanticsOptions: params.semanticsOptions,
            enableGPUCanvas: this.deferredRenderer,
        });
    }
    Object.defineProperty(Rive, "suppressDeprecationWarnings", {
        /**
         * Deprecation warnings to silence, by {@link DeprecationId}. Each warning
         * prints the id needed to silence it, so you can copy it out of the console.
         *
         * ```ts
         * Rive.suppressDeprecationWarnings = ["rive-events", "text-runs"];
         * ```
         *
         * Assigning replaces the whole list.
         * There is no option to silence everything
         */
        get: function () {
            return Object.freeze(Array.from(suppressedDeprecations));
        },
        set: function (ids) {
            setSuppressedDeprecations(ids);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "viewModelCount", {
        get: function () {
            return this.file.viewModelCount();
        },
        enumerable: false,
        configurable: true
    });
    // Alternative constructor to build a Rive instance from an interface/object
    Rive.new = function (params) {
        warnOnce(DeprecationKeys.legacyConstructors, "This function is deprecated: please use `new Rive({})` instead");
        return new Rive(params);
    };
    /**
     * @experimental Turns on semantics and the accessibility overlay for this
     * instance. Idempotent; safe to call before or after load. Use this to drive
     * a consumer-controlled accessibility toggle when constructed with the
     * default {@link SemanticMode.Disabled}.
     */
    Rive.prototype.enableSemantics = function () {
        this.semanticsMode = _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticMode.Enabled;
        this.activateSemantics();
    };
    Rive.prototype.activateSemantics = function () {
        if (this._semanticsActive || this.semanticsMode === _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticMode.Disabled) {
            return;
        }
        this._semanticsActive = true;
        this.syncSemanticsOnStateMachines();
    };
    Rive.prototype.syncSemanticsOnStateMachines = function () {
        if (!this._semanticsActive || !this.animator) {
            return;
        }
        for (var _i = 0, _a = this.animator.stateMachines; _i < _a.length; _i++) {
            var stateMachine = _a[_i];
            stateMachine.enableSemantics();
        }
    };
    /**
     * Tears down the semantic tree and accessibility overlay. The overlay captures the
     * active state machine in its action closures, so it must not outlive the
     * instances it points at (reset/load delete them)
     */
    Rive.prototype.cleanupSemantics = function () {
        this._semanticTree = null;
        if (this._accessibilityOverlay) {
            this._accessibilityOverlay.destroy();
            this._accessibilityOverlay = null;
        }
    };
    // Event handler for when audio context becomes available
    Rive.prototype.onSystemAudioChanged = function () {
        this.volume = this._volume;
    };
    // Initializes the Rive object either from constructor or load()
    Rive.prototype.init = function (_a) {
        var _this = this;
        var _b, _c, _d, _e, _f;
        var src = _a.src, buffer = _a.buffer, riveFile = _a.riveFile, stateMachine = _a.stateMachine, animations = _a.animations, stateMachines = _a.stateMachines, artboard = _a.artboard, _g = _a.autoplay, autoplay = _g === void 0 ? false : _g, _h = _a.useOffscreenRenderer, useOffscreenRenderer = _h === void 0 ? false : _h, _j = _a.autoBind, autoBind = _j === void 0 ? false : _j, tabIndex = _a.tabIndex, semanticsMode = _a.semanticsMode, semanticsOptions = _a.semanticsOptions, enableGPUCanvas = _a.enableGPUCanvas;
        if (this.destroyed) {
            return;
        }
        // Validated before any state changes, so a call with no source leaves a
        // running instance untouched.
        if (!src && !buffer && !riveFile) {
            throw new RiveError(Rive.missingErrorMessage);
        }
        // Reload releases the outgoing file in the same order cleanup() uses:
        // artboard, then the renderer's session, then the file. The artboard goes
        // first because it holds an rcp<File> and its resources came from the
        // session about to be released. stop() has already deleted the animation
        // and state machine instances; reload deliberately skips cleanupInstances(),
        // which would also drop the event listeners load() keeps in place.
        if (this.artboard) {
            // Free GPU-backed resources with their own context current. No-op on
            // the canvas2d build.
            (_c = (_b = this.renderer) === null || _b === void 0 ? void 0 : _b.bindContext) === null || _c === void 0 ? void 0 : _c.call(_b);
            (_d = this.animator) === null || _d === void 0 ? void 0 : _d.stop();
            this.artboard.delete();
            this.artboard = null;
        }
        // Detach before the session is deleted: the handle dies with it.
        if (this.renderer) {
            (_f = (_e = this.renderer).detachSession) === null || _f === void 0 ? void 0 : _f.call(_e);
        }
        this.releaseCurrentRiveFile(/* isTeardown */ false);
        this.src = src;
        this.buffer = buffer;
        this.riveFile = riveFile;
        // initData flips this if it ends up importing the file itself.
        this.ownsRiveFile = false;
        // Sticky across reloads so a constructor-set flag survives; an explicit
        // `false` still turns it off.
        this.deferredRenderer = enableGPUCanvas !== null && enableGPUCanvas !== void 0 ? enableGPUCanvas : this.deferredRenderer;
        this._tabIndex = tabIndex !== null && tabIndex !== void 0 ? tabIndex : null;
        this.semanticsMode = semanticsMode !== null && semanticsMode !== void 0 ? semanticsMode : _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticMode.Disabled;
        this.semanticsOptions = semanticsOptions !== null && semanticsOptions !== void 0 ? semanticsOptions : this.semanticsOptions;
        // Names of the animations and state machines that should be initialized
        var _k = resolveStartingPlayback({
            stateMachine: stateMachine,
            animations: animations,
            stateMachines: stateMachines,
        }), startingAnimationNames = _k.startingAnimationNames, startingStateMachineNames = _k.startingStateMachineNames;
        // Ensure loaded is marked as false if loading new file
        this.loaded = false;
        this.readyForPlaying = false;
        // Ensure the runtime is loaded
        _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader.awaitInstance()
            .then(function (runtime) {
            if (_this.destroyed) {
                return;
            }
            _this.runtime = runtime;
            _this.removeRiveListeners();
            // load() reinitializes without cleanupInstances(); drop any stale overlay
            // bound to the previous file's state machines (no-op on first construct).
            _this.cleanupSemantics();
            _this.deleteRiveRenderer();
            // Get the canvas where you want to render the animation and create a renderer
            if (_this.enablePerfMarks)
                performance.mark('rive:make-renderer:start');
            try {
                // Always immediate at creation; a deferred file attaches its session
                // to this renderer once the file has loaded.
                _this.renderer = _this.runtime.makeRenderer(_this.canvas, useOffscreenRenderer, { inkbleed: _this._inkbleedCapable });
                if (!_this.renderer) {
                    throw new Error("Renderer is null, cannot render Rive on the canvas.");
                }
            }
            catch (e) {
                console.error(e);
                throw new RiveError("Unable to create the renderer, your environment may not support WebGL. Try the @rive-app/canvas runtime as an alternative.");
            }
            if (_this._inkbleedCapable) {
                _this.applyInkbleed();
            }
            if (_this.enablePerfMarks) {
                performance.mark('rive:make-renderer:end');
                performance.measure('rive:make-renderer', 'rive:make-renderer:start', 'rive:make-renderer:end');
            }
            // Initial size adjustment based on devicePixelRatio if no width/height are
            // specified explicitly
            if (!(_this.canvas.width || _this.canvas.height)) {
                _this.resizeDrawingSurfaceToCanvas();
            }
            // Load Rive data from a source uri or a data buffer
            _this.initData(artboard, startingAnimationNames, startingStateMachineNames, autoplay, autoBind)
                .then(function (hasInitialized) {
                if (hasInitialized) {
                    return _this.setupRiveListeners();
                }
            })
                .catch(function (e) {
                // initData already catches RiveErrors for load issues like artboard/state machine initialization
                // failures, so just console error and catch here so we don't double-fire the LoadError event
                console.error(e);
            });
        })
            .catch(function (e) {
            _this.eventManager.fire({ type: EventType.LoadError, data: e.message });
        });
    };
    /**
     * Setup Rive Listeners on the canvas
     * @param riveListenerOptions - Enables TouchEvent events on the canvas. Set to true to allow
     * touch scrolling on the canvas element on touch-enabled devices
     * i.e. { isTouchScrollEnabled: true }
     */
    Rive.prototype.setupRiveListeners = function (riveListenerOptions) {
        var _this = this;
        if (this.eventCleanup) {
            this.eventCleanup();
        }
        this.cleanupKeyboardInteractions();
        if (!this.shouldDisableRiveListeners) {
            var playingStateMachines = this.animator.stateMachines.filter(function (sm) { return sm.playing; });
            var activeStateMachines = playingStateMachines
                .filter(function (sm) { return _this.runtime.hasListeners(sm.instance); })
                .map(function (sm) { return sm.instance; });
            var touchScrollEnabledOption = this.isTouchScrollEnabled;
            var dispatchPointerExit = this.dispatchPointerExit;
            var enableMultiTouch = this.enableMultiTouch;
            if (riveListenerOptions &&
                "isTouchScrollEnabled" in riveListenerOptions) {
                touchScrollEnabledOption = riveListenerOptions.isTouchScrollEnabled;
            }
            this.eventCleanup = (0,_utils__WEBPACK_IMPORTED_MODULE_3__.registerTouchInteractions)({
                canvas: this.canvas,
                artboard: this.artboard,
                stateMachines: activeStateMachines,
                renderer: this.renderer,
                rive: this.runtime,
                fit: this._layout.runtimeFit(this.runtime),
                alignment: this._layout.runtimeAlignment(this.runtime),
                isTouchScrollEnabled: touchScrollEnabledOption,
                dispatchPointerExit: dispatchPointerExit,
                enableMultiTouch: enableMultiTouch,
                layoutScaleFactor: this._layout.layoutScaleFactor,
                advanceAndDrain: this.advanceAndDrainForPointer.bind(this),
                summonKeyboard: this.summonKeyboardForGesture.bind(this),
                isTextProxyFocused: this.isEditingHostFocused,
            });
            this.ensureKeyboardInteractions();
        }
    };
    Object.defineProperty(Rive.prototype, "focusStateMachine", {
        // Assumes a single state machine drives focus.
        get: function () {
            return this.animator.stateMachines.find(function (sm) { return sm.playing && sm.hasFocusNodes; });
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Wire keyboard interactions when a playing state machine has focus nodes.
     * Called at listener setup and lazily each frame so late-bound bindable artboards work.
     */
    Rive.prototype.ensureKeyboardInteractions = function () {
        var _this = this;
        if (this._keyboardInteractions ||
            this.shouldDisableRiveListeners ||
            typeof window === "undefined" ||
            !(this.canvas instanceof HTMLCanvasElement)) {
            return;
        }
        var smWithFocusNodes = this.focusStateMachine;
        if (!smWithFocusNodes) {
            return;
        }
        var currentCanvasTabIndex = this.canvas.tabIndex;
        if (currentCanvasTabIndex === -1 || isNaN(currentCanvasTabIndex)) {
            this.canvas.tabIndex = (this._tabIndex !== null ? this._tabIndex : 0);
        }
        this._keyboardInteractions = new _utils__WEBPACK_IMPORTED_MODULE_3__.KeyboardInteractions({
            canvas: this.canvas,
            stateMachine: smWithFocusNodes.instance,
            hasFocusNodes: true,
            getOverlayElement: function () { var _a, _b; return (_b = (_a = _this._accessibilityOverlay) === null || _a === void 0 ? void 0 : _a.getSemanticOverlayContainer()) !== null && _b !== void 0 ? _b : null; },
        });
    };
    /** Runs inside touchend/mouseup so focusing the proxy raises the mobile keyboard. */
    Rive.prototype.summonKeyboardForGesture = function () {
        if (!this._keyboardInteractions)
            return;
        var activeSm = this.focusStateMachine;
        if (!activeSm)
            return;
        if (this.wantsTextInputSession(activeSm.focusState().expectsKeyboardInput)) {
            this._keyboardInteractions.summonForPointer();
        }
    };
    /** expectsKeyboardInput, and (with semantics on) the focused node is a textField. */
    Rive.prototype.wantsTextInputSession = function (expectsKeyboardInput) {
        var _a;
        if (!expectsKeyboardInput)
            return false;
        var node = (_a = this._semanticTree) === null || _a === void 0 ? void 0 : _a.focusedNode();
        return node === undefined || node.role === _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticRole.textField;
    };
    Rive.prototype.advanceAndDrainForPointer = function (elapsedTime, options) {
        if (!(options === null || options === void 0 ? void 0 : options.pointerDown)) {
            this.advanceAndReportChanges(elapsedTime);
            return;
        }
        this._inPointerDownDrain = true;
        try {
            this.advanceAndReportChanges(elapsedTime);
        }
        finally {
            this._inPointerDownDrain = false;
        }
    };
    Rive.prototype.cleanupKeyboardInteractions = function () {
        var _a;
        if (this._keyboardInteractions) {
            this._keyboardInteractions.cleanup();
            this._keyboardInteractions = null;
        }
        this._prevWantsTextInputSession = false;
        (_a = this._accessibilityOverlay) === null || _a === void 0 ? void 0 : _a.releaseEditingHost(null, null);
    };
    /**
     * Remove Rive Listeners setup on the canvas
     */
    Rive.prototype.removeRiveListeners = function () {
        if (this.eventCleanup) {
            this.eventCleanup();
            this.eventCleanup = null;
        }
        this.cleanupKeyboardInteractions();
    };
    /**
     * If the instance has audio and the system audio is not ready
     * we hook the instance to the audio manager
     */
    Rive.prototype.initializeAudio = function () {
        var _this = this;
        var _a;
        // Initialize audio if needed
        if (audioManager.status == SystemAudioStatus.UNAVAILABLE) {
            if (this.file.hasAudio ||
                (((_a = this.artboard) === null || _a === void 0 ? void 0 : _a.hasAudio) && this._audioEventListener === null)) {
                this._audioEventListener = {
                    type: EventType.AudioStatusChange,
                    callback: function () { return _this.onSystemAudioChanged(); },
                };
                audioManager.add(this._audioEventListener);
                audioManager.establishAudio();
            }
        }
    };
    Rive.prototype.initArtboardSize = function () {
        if (!this.artboard)
            return;
        // Use preset values if they are not undefined
        this._artboardWidth = this.artboard.width =
            this._artboardWidth || this.artboard.width;
        this._artboardHeight = this.artboard.height =
            this._artboardHeight || this.artboard.height;
    };
    // Initializes runtime with Rive data and preps for playing.
    // Returns true for successful initialization.
    Rive.prototype.initData = function (artboardName, animationNames, stateMachineNames, autoplay, autoBind) {
        return __awaiter(this, void 0, void 0, function () {
            var riveFile, error_4, msg;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 5, , 6]);
                        // A caller-supplied riveFile is theirs to release; one we import here is
                        // ours, which matters if a deferred fallback replaces it below.
                        this.ownsRiveFile = this.riveFile == null;
                        if (!this.ownsRiveFile) return [3 /*break*/, 2];
                        riveFile = new RiveFile({
                            src: this.src,
                            buffer: this.buffer,
                            enableRiveAssetCDN: this.enableRiveAssetCDN,
                            assetLoader: this.assetLoader,
                            enablePerfMarks: this.enablePerfMarks,
                            // The instance owns this file, so its flag is the file's flag.
                            enableGPUCanvas: this.deferredRenderer,
                        });
                        this.riveFile = riveFile;
                        return [4 /*yield*/, riveFile.init()];
                    case 1:
                        _c.sent();
                        if (this.destroyed) {
                            // In the very unlikely scenario where the rive file created by this Rive is shared by
                            // another rive file, we only want to destroy it if this file is the only owner.
                            riveFile.destroyIfUnused();
                            return [2 /*return*/, false];
                        }
                        _c.label = 2;
                    case 2:
                        if (!(this.riveFile.deferredSession !== null || this.deferredRenderer)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.resolveDeferredRendering()];
                    case 3:
                        _c.sent();
                        if (this.destroyed) {
                            // cleanup() ran during a re-import. Taking a reference now would
                            // resurrect a file this instance is never going to draw. Only ours
                            // to release — a caller-supplied file stays theirs.
                            if (this.ownsRiveFile) {
                                (_a = this.riveFile) === null || _a === void 0 ? void 0 : _a.destroyIfUnused();
                            }
                            return [2 /*return*/, false];
                        }
                        _c.label = 4;
                    case 4:
                        this.file = this.riveFile.getInstance();
                        this.reportDisplayScale();
                        // Initialize and draw frame
                        this.initArtboard(artboardName, animationNames, stateMachineNames, autoplay, autoBind);
                        // Initialize the artboard size
                        this.initArtboardSize();
                        // Check for audio
                        this.initializeAudio();
                        if (this.semanticsMode === _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticMode.Enabled) {
                            this.activateSemantics();
                        }
                        else if (this._semanticsActive) {
                            this.syncSemanticsOnStateMachines();
                        }
                        // Everything's set up, emit a load event
                        try {
                            this.loaded = true;
                            this.eventManager.fire({
                                type: EventType.Load,
                                data: (_b = this.src) !== null && _b !== void 0 ? _b : "buffer",
                            });
                        }
                        catch (e) {
                            // If any synchronous errors surface from the user-supplied onLoad callback,
                            // this will console.error the error but will not invoke LoadError (onLoadError).
                            // Notably, this will not interfere with Rive rendering
                            console.error(e);
                        }
                        // Only initialize paused state machines after the load event has been fired
                        // to allow users to initialize inputs and view models before the first advance
                        this.animator.advanceIfPaused();
                        // Flag ready for playback commands and clear the task queue; this order
                        // is important or it may infinitely recurse
                        this.readyForPlaying = true;
                        this.taskQueue.process();
                        this.drawFrame();
                        return [2 /*return*/, true];
                    case 5:
                        error_4 = _c.sent();
                        msg = resolveErrorMessage(error_4);
                        this.eventManager.fire({ type: EventType.LoadError, data: msg });
                        return [2 /*return*/, Promise.reject(msg)];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Settles which rendering mode this Rive instance runs in. The file dictates: its rendering mode
     * is fixed at import, and an immediate renderer silently drops a deferred
     * file's resources. Every mismatch warns and degrades to something that
     * renders, so users shouldn't have a blank canvas. A fallback self-reimport replaces `this.riveFile`;
     * only a file this instance imported is released when that happens.
     */
    Rive.prototype.resolveDeferredRendering = function () {
        return __awaiter(this, void 0, void 0, function () {
            var file, ownsFile, renderer, session, attachSession, immediate, copy, copySession, fallback;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        file = this.riveFile;
                        ownsFile = this.ownsRiveFile;
                        renderer = this.renderer;
                        session = file.deferredSession;
                        if (session === null) {
                            // No second warning when the file asked for deferred and the build
                            // could not honor it; the unsupported-build warning already fired, and
                            // telling the user to set a flag they set would mislead.
                            if (this.deferredRenderer && !file.deferredRequested) {
                                console.warn("Rive: `enableGPUCanvas: true` was ignored because this RiveFile was imported without it. The mode is fixed at import: construct the RiveFile with `enableGPUCanvas: true` to opt in.");
                            }
                            return [2 /*return*/];
                        }
                        if (!this.deferredRenderer) {
                            console.warn("Rive: this RiveFile was imported with `enableGPUCanvas: true`, so this instance renders deferred even though `enableGPUCanvas` is false on the instance. An immediate renderer would drop the file's deferred resources and draw nothing.");
                        }
                        attachSession = renderer === null || renderer === void 0 ? void 0 : renderer.attachSession;
                        if (!(typeof attachSession !== "function")) return [3 /*break*/, 2];
                        // Offscreen renderers share one context across canvases, which a session
                        // cannot record for. An immediate copy of the file still renders.
                        console.warn("Rive: this renderer cannot replay a deferred session (`useOffscreenRenderer` is not supported with deferred rendering). Re-importing the file in immediate mode for this instance.");
                        return [4 /*yield*/, file.reimport(false)];
                    case 1:
                        immediate = _b.sent();
                        if (this.destroyed) {
                            // cleanup() ran while we were importing; nothing will use this copy.
                            immediate.destroyIfUnused();
                            return [2 /*return*/];
                        }
                        this.riveFile = immediate;
                        this.ownsRiveFile = true;
                        if (ownsFile) {
                            // Nothing else can reach the deferred import we just walked away from.
                            file.destroyIfUnused();
                        }
                        return [2 /*return*/];
                    case 2:
                        // Never re-offered once claimed, even if that renderer is gone: the
                        // resources the session's stream refers to died with it.
                        if (!file.sessionClaimed && attachSession.call(renderer, session)) {
                            file.claimSession();
                            return [2 /*return*/];
                        }
                        // Bound to another instance. Re-import from the retained buffer into a
                        // session of our own.
                        file.warnBoundElsewhereOnce();
                        return [4 /*yield*/, file.reimport(true)];
                    case 3:
                        copy = _b.sent();
                        if (this.destroyed) {
                            // The renderer was deleted while we imported; attaching to it would hand
                            // embind a deleted object.
                            copy.destroyIfUnused();
                            return [2 /*return*/];
                        }
                        this.riveFile = copy;
                        this.ownsRiveFile = true;
                        copySession = copy.deferredSession;
                        if (copySession !== null && attachSession.call(renderer, copySession)) {
                            copy.claimSession();
                            return [2 /*return*/];
                        }
                        // The copy's session could not take this canvas either (this renderer
                        // already holds one). An immediate re-import still renders; a deferred file
                        // on an immediate renderer would drop its resources and draw nothing.
                        console.warn("Rive: could not attach the re-imported file's deferred session to this canvas; falling back to immediate rendering for this instance.");
                        // If a leftover session is why the attach failed, it would keep routing
                        // the immediate file's draws into its recorder, which drops them.
                        (_a = renderer.detachSession) === null || _a === void 0 ? void 0 : _a.call(renderer);
                        return [4 /*yield*/, file.reimport(false)];
                    case 4:
                        fallback = _b.sent();
                        // The deferred copy was only ever ours, so it always goes.
                        copy.destroyIfUnused();
                        if (this.destroyed) {
                            fallback.destroyIfUnused();
                            return [2 /*return*/];
                        }
                        this.riveFile = fallback;
                        this.ownsRiveFile = true;
                        if (ownsFile) {
                            file.destroyIfUnused();
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // Initialize for playback
    Rive.prototype.initArtboard = function (artboardName, animationNames, stateMachineNames, autoplay, autoBind) {
        if (!this.file) {
            return;
        }
        // Fetch the artboard
        var rootArtboard = artboardName
            ? this.file.artboardByName(artboardName)
            : this.file.defaultArtboard();
        // Check we have a working artboard
        if (!rootArtboard) {
            throw new RiveError("Invalid artboard name or no default artboard");
        }
        this.artboard = rootArtboard;
        rootArtboard.volume = this._volume * audioManager.systemVolume;
        // Initialize the animator
        this.animator = new Animator(this.runtime, this.artboard, this.eventManager);
        // Initialize the animations; as loaded hasn't happened yet, we need to
        // suppress firing the play/pause events until the load event has fired. To
        // do this we tell the animator to suppress firing events, and add event
        // firing to the task queue.
        var instanceNames;
        if (animationNames.length > 0 || stateMachineNames.length > 0) {
            instanceNames = animationNames.concat(stateMachineNames);
            this.animator.initLinearAnimations(animationNames, autoplay);
            this.animator.initStateMachines(stateMachineNames, autoplay, this._semanticsActive);
        }
        else {
            instanceNames = [this.animator.atLeastOne(autoplay, false, this._semanticsActive)];
        }
        // Queue up firing the playback events
        this.taskQueue.add({
            event: {
                type: autoplay ? EventType.Play : EventType.Pause,
                data: instanceNames,
            },
        });
        if (autoBind) {
            // Set the main view model instance (if the artboard has one)...
            var viewModel = this.file.defaultArtboardViewModel(rootArtboard);
            if (viewModel !== null) {
                var runtimeInstance = viewModel.defaultInstance();
                if (runtimeInstance !== null) {
                    var viewModelInstance = new ViewModelInstance(runtimeInstance, null);
                    (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, viewModelInstance.runtimeInstance);
                    this.setViewModelInstance(viewModelInstance);
                }
            }
            // ...and a default instance for each global view model (no longer
            // auto-created by the runtime), then apply everything in one rebind.
            for (var _i = 0, _a = this.file.globalViewModelNames(); _i < _a.length; _i++) {
                var name_1 = _a[_i];
                var globalViewModel = this.file.viewModelByName(name_1);
                if (globalViewModel !== null) {
                    var instance = new ViewModel(globalViewModel).defaultInstance();
                    if (instance !== null) {
                        this.setGlobalViewModelInstance(name_1, instance);
                    }
                }
            }
            this.bind();
        }
    };
    // Draws the current artboard frame
    Rive.prototype.drawFrame = function () {
        var _a, _b;
        if ((_a = document === null || document === void 0 ? void 0 : document.timeline) === null || _a === void 0 ? void 0 : _a.currentTime) {
            if (this.loaded && this.artboard && !this.frameRequestId) {
                this._boundDraw(document.timeline.currentTime);
                (_b = this.runtime) === null || _b === void 0 ? void 0 : _b.resolveAnimationFrame();
            }
        }
        else {
            this.scheduleRendering();
        }
    };
    Rive.prototype._canvasSizeChanged = function () {
        var changed = false;
        if (this.canvas) {
            if (this.canvas.width !== this._currentCanvasWidth) {
                this._currentCanvasWidth = this.canvas.width;
                changed = true;
            }
            if (this.canvas.height !== this._currentCanvasHeight) {
                this._currentCanvasHeight = this.canvas.height;
                changed = true;
            }
        }
        return changed;
    };
    // Content the artboard's change flag cannot see: ore and GPU canvas commands
    // scripts record straight into the session. Must be read before the renderer
    // clears — clearing marks the stream, so a later read is true every frame.
    Rive.prototype._deferredWorkPending = function () {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.riveFile) === null || _a === void 0 ? void 0 : _a.deferredSession) === null || _b === void 0 ? void 0 : _b.recordedThisFrame()) !== null && _c !== void 0 ? _c : false;
    };
    /** Rive can move focus on its own, so reconcile the text session and DOM focus each frame. */
    Rive.prototype.pollFocusState = function () {
        this.ensureKeyboardInteractions();
        var ki = this._keyboardInteractions;
        var activeSm = ki ? this.focusStateMachine : undefined;
        if (!ki || !activeSm || !(this.canvas instanceof HTMLCanvasElement)) {
            this._prevHasFocus = false;
            this._prevWantsTextInputSession = false;
            return;
        }
        var _a = activeSm.focusState(), hasFocus = _a.hasFocus, expectsKeyboardInput = _a.expectsKeyboardInput;
        this.syncTextInputSession(ki, this.wantsTextInputSession(expectsKeyboardInput));
        this.syncRiveFocus(ki, this.canvas, hasFocus);
    };
    /** Begin/end the text session on wantsSession edges; decorate the proxy while it has DOM focus. */
    Rive.prototype.syncTextInputSession = function (ki, wantsSession) {
        var host = ki.editingHost;
        var overlay = this._accessibilityOverlay;
        if (wantsSession) {
            var began = !this._prevWantsTextInputSession;
            if (began) {
                // In-domain or opted-in only; during pointer-down, pointer-up focuses instead.
                var focusProxy = !this._inPointerDownDrain &&
                    (ki.isInFocusDomain(document.activeElement) ||
                        !!this._focusOptions.allowFocusInterrupt);
                ki.beginTextInputSession(focusProxy);
            }
            // The <input> proxy stands in for the semantic DOM field only while it holds DOM focus.
            if (overlay && this._semanticTree) {
                if (host.hasDomFocus()) {
                    overlay.syncEditingHost(this._semanticTree, host, began || !overlay.hasEditingHost());
                }
                else if (overlay.hasEditingHost()) {
                    overlay.releaseEditingHost(this._semanticTree, host);
                }
            }
        }
        else if (this._prevWantsTextInputSession) {
            // Overlay hand-off first, ahead of endTextInputSession's park-on-canvas fallback.
            overlay === null || overlay === void 0 ? void 0 : overlay.releaseEditingHost(this._semanticTree, host);
            ki.endTextInputSession();
        }
        this._prevWantsTextInputSession = wantsSession;
    };
    /** Mirror Rive's hasFocus into the keyboard session state and, on opt-in, canvas focus. */
    Rive.prototype.syncRiveFocus = function (ki, canvas, hasFocus) {
        if (hasFocus) {
            ki.notifyRiveFocused();
            // Pull focus from outside Rive only with allowFocusInterrupt.
            if (!this._prevHasFocus) {
                if (!ki.isInFocusDomain(document.activeElement) &&
                    this._focusOptions.allowFocusInterrupt) {
                    canvas.focus();
                }
                this._prevHasFocus = true;
            }
        }
        else {
            this._prevHasFocus = false;
            // Rive released focus internally (e.g. a state change): drop the Tab trap so the next
            // Tab leaves the canvas.
            if (ki.focusSessionState === _utils__WEBPACK_IMPORTED_MODULE_3__.FocusSessionState.RiveFocused) {
                ki.setFocusSessionState(_utils__WEBPACK_IMPORTED_MODULE_3__.FocusSessionState.NotFocused);
            }
        }
    };
    /**
     * Handles important sequence of reporting Rive events, advancing the state machine or animation, and invoking various callbacks
     * due to state changes, view model property changes, etc.
     *
     * @param elapsedTime time to advance the state machine by
     */
    Rive.prototype.advanceAndReportChanges = function (elapsedTime) {
        var _a, _b;
        // - Advance non-paused animations by the elapsed number of seconds
        // - Advance any animations that require scrubbing
        // - Advance to the first frame even when autoplay is false
        var activeAnimations = this.animator.animations
            .filter(function (a) { return a.playing || a.needsScrub; })
            // The scrubbed animations must be applied first to prevent weird artifacts
            // if the playing animations conflict with the scrubbed animating attribuates.
            .sort(function (first) { return (first.needsScrub ? -1 : 1); });
        for (var _i = 0, activeAnimations_1 = activeAnimations; _i < activeAnimations_1.length; _i++) {
            var animation = activeAnimations_1[_i];
            animation.advance(elapsedTime);
            if (animation.instance.didLoop) {
                animation.loopCount += 1;
            }
            animation.apply(1.0);
        }
        // - Advance non-paused state machines by the elapsed number of seconds
        // - Advance to the first frame even when autoplay is false
        var activeStateMachines = this.animator.stateMachines.filter(function (a) { return a.playing; });
        // Instrument the first 3 frames so the Performance timeline shows precise
        // per-call latency for advance, draw, and flush without polluting the trace.
        var _perfFrame = this.enablePerfMarks && this.frameCount < 3 ? this.frameCount : -1;
        for (var _c = 0, activeStateMachines_1 = activeStateMachines; _c < activeStateMachines_1.length; _c++) {
            var stateMachine = activeStateMachines_1[_c];
            // Check for events before the current frame's state machine advance
            var numEventsReported = stateMachine.reportedEventCount();
            if (numEventsReported) {
                for (var i = 0; i < numEventsReported; i++) {
                    var event_1 = stateMachine.reportedEventAt(i);
                    if (event_1) {
                        if (event_1.type === RiveEventType.OpenUrl) {
                            this.eventManager.fire({
                                type: EventType.RiveEvent,
                                data: event_1,
                            });
                            // Handle the event side effect if explicitly enabled
                            if (this.automaticallyHandleEvents) {
                                var newAnchorTag = document.createElement("a");
                                var _d = event_1, url = _d.url, target = _d.target;
                                var sanitizedUrl = (0,_utils__WEBPACK_IMPORTED_MODULE_3__.sanitizeUrl)(url);
                                url && newAnchorTag.setAttribute("href", sanitizedUrl);
                                target && newAnchorTag.setAttribute("target", target);
                                if (sanitizedUrl && sanitizedUrl !== _utils__WEBPACK_IMPORTED_MODULE_3__.BLANK_URL) {
                                    newAnchorTag.click();
                                }
                            }
                        }
                        else {
                            this.eventManager.fire({
                                type: EventType.RiveEvent,
                                data: event_1,
                            });
                        }
                    }
                }
            }
            if (_perfFrame >= 0)
                performance.mark("rive:sm-advance:start:f".concat(_perfFrame));
            stateMachine.advanceAndApply(elapsedTime);
            if (_perfFrame >= 0) {
                performance.mark("rive:sm-advance:end:f".concat(_perfFrame));
                performance.measure("rive:sm-advance:f".concat(_perfFrame), "rive:sm-advance:start:f".concat(_perfFrame), "rive:sm-advance:end:f".concat(_perfFrame));
            }
            if (this._semanticsActive) {
                var diff = stateMachine.drainSemanticsDiff();
                if (diff) {
                    if (!this._semanticTree) {
                        this._semanticTree = new _semantics__WEBPACK_IMPORTED_MODULE_2__.SemanticTreeModel();
                    }
                    this._semanticTree.applyDiff(diff);
                }
            }
        }
        // Update the accessibility overlay after all state machines have
        // been advanced and their diffs applied to the tree model.
        if (this._semanticsActive &&
            this._semanticTree &&
            activeStateMachines.length > 0 &&
            this.canvas instanceof HTMLCanvasElement) {
            if (!this._accessibilityOverlay) {
                var mainSm_1 = activeStateMachines[0];
                this._accessibilityOverlay = new _semantics__WEBPACK_IMPORTED_MODULE_2__.AccessibilityOverlay({
                    canvas: this.canvas,
                    instanceId: this._instanceId,
                    semanticsOptions: this.semanticsOptions,
                    allowFocusInterrupt: this._focusOptions.allowFocusInterrupt,
                    isEditingHostFocused: this.isEditingHostFocused,
                    fireAction: function (nodeId, actionType) {
                        mainSm_1.fireSemanticAction(nodeId, actionType);
                    },
                    requestFocus: function (nodeId) {
                        return mainSm_1.focusSemanticNode(nodeId);
                    },
                    clearFocus: function () {
                        return mainSm_1.instance.clearFocus();
                    },
                });
            }
            var overlayChange = (_a = this._accessibilityOverlay) === null || _a === void 0 ? void 0 : _a.needsUpdate(this._semanticTree);
            if (overlayChange || this._overlayTransformDirty) {
                // Only recompute the artboard→canvas transform when something that
                // affects it changed (canvas geometry or a layout/dpr input). When only
                // the semantic tree changed we pass null and reuse the existing CSS
                // transform on the overlay container.
                var forwardMat = null;
                if ((overlayChange === null || overlayChange === void 0 ? void 0 : overlayChange.layoutChanged) || this._overlayTransformDirty) {
                    var fit_1 = this._layout.runtimeFit(this.runtime);
                    var alignment = this._layout.runtimeAlignment(this.runtime);
                    forwardMat = this.runtime.computeAlignment(fit_1, alignment, {
                        minX: this._layout.minX,
                        minY: this._layout.minY,
                        maxX: this._layout.maxX,
                        maxY: this._layout.maxY,
                    }, this.artboard.bounds, this._devicePixelRatioUsed * this._layout.layoutScaleFactor);
                    this._overlayTransformDirty = false;
                }
                this._accessibilityOverlay.update(this._semanticTree, forwardMat, this._devicePixelRatioUsed, this.artboard.bounds, overlayChange);
                forwardMat === null || forwardMat === void 0 ? void 0 : forwardMat.delete();
            }
        }
        // For linear animations that have been applied to the artboard, advance it
        // by the elapsed time.
        if (this.animator.stateMachines.length == 0) {
            this.artboard.advance(elapsedTime);
        }
        // Check for any animations that looped
        this.animator.handleLooping();
        // Check for any state machines that had a state change
        this.animator.handleStateChanges();
        // Report advanced time
        this.animator.handleAdvancing(elapsedTime);
        // Poll focus state to see whether or not to blur or pull up a virtual keyboard for any change to a text input node.
        this.pollFocusState();
        // Handle callbacks for main view model property changes
        (_b = this._viewModelInstance) === null || _b === void 0 ? void 0 : _b.handleCallbacks();
        // Handle callbacks for global view model property changes
        this._globalViewModelInstances.forEach(function (instance) {
            if (instance) {
                instance.handleCallbacks();
            }
        });
    };
    /**
     * Draw rendering loop; renders animation frames at the correct time interval.
     * @param time the time at which to render a frame
     */
    Rive.prototype.draw = function (time, onSecond) {
        // Clear the frameRequestId, as we're now rendering a fresh frame
        this.frameRequestId = null;
        // load() tears the artboard down and re-inits asynchronously; a frame
        // queued before that lands here with nothing to draw.
        if (!this.artboard) {
            return;
        }
        var before = performance.now();
        // Instrument the first 3 frames so the Performance timeline shows precise
        // per-call latency for advance, draw, and flush without polluting the trace.
        var _perfFrame = this.enablePerfMarks && this.frameCount < 3 ? this.frameCount : -1;
        // On the first pass, make sure lastTime has a valid value
        if (!this.lastRenderTime) {
            this.lastRenderTime = time;
        }
        // Handle the onSecond callback
        this.renderSecondTimer += time - this.lastRenderTime;
        if (this.renderSecondTimer > 5000) {
            this.renderSecondTimer = 0;
            onSecond === null || onSecond === void 0 ? void 0 : onSecond();
        }
        // Calculate the elapsed time between frames in seconds
        var elapsedTime = (time - this.lastRenderTime) / 1000;
        this.lastRenderTime = time;
        this.advanceAndReportChanges(elapsedTime);
        var renderer = this.renderer;
        // Do not draw on 0 canvas size
        if (!this._hasZeroSize) {
            // If there was no dirt on this frame, do not clear and draw. The deferred
            // term has to be read here, before `clear()` below: clearing opens the
            // session's recording window and marks its stream, so a read taken after
            // it reports every frame as dirty and nothing is ever skipped.
            if (this.drawOptimization == DrawOptimizationOptions.AlwaysDraw ||
                this.artboard.didChange() ||
                this._deferredWorkPending() ||
                this._needsRedraw ||
                this._canvasSizeChanged()) {
                // Canvas must be wiped to prevent artifacts
                renderer.clear();
                renderer.save();
                // Update the renderer alignment if necessary
                if (_perfFrame >= 0)
                    performance.mark("rive:align-renderer:start:f".concat(_perfFrame));
                this.alignRenderer();
                if (_perfFrame >= 0) {
                    performance.mark("rive:align-renderer:end:f".concat(_perfFrame));
                    performance.measure("rive:align-renderer:f".concat(_perfFrame), "rive:align-renderer:start:f".concat(_perfFrame), "rive:align-renderer:end:f".concat(_perfFrame));
                }
                if (_perfFrame >= 0)
                    performance.mark("rive:artboard-draw:start:f".concat(_perfFrame));
                this.artboard.draw(renderer);
                if (_perfFrame >= 0) {
                    performance.mark("rive:artboard-draw:end:f".concat(_perfFrame));
                    performance.measure("rive:artboard-draw:f".concat(_perfFrame), "rive:artboard-draw:start:f".concat(_perfFrame), "rive:artboard-draw:end:f".concat(_perfFrame));
                }
                renderer.restore();
                if (_perfFrame >= 0)
                    performance.mark("rive:renderer-flush:start:f".concat(_perfFrame));
                renderer.flush();
                if (_perfFrame >= 0) {
                    performance.mark("rive:renderer-flush:end:f".concat(_perfFrame));
                    performance.measure("rive:renderer-flush:f".concat(_perfFrame), "rive:renderer-flush:start:f".concat(_perfFrame), "rive:renderer-flush:end:f".concat(_perfFrame));
                }
                this._needsRedraw = false;
            }
        }
        // Add duration to create frame to durations array
        this.frameCount++;
        var after = performance.now();
        this.frameTimes.push(after);
        this.durations.push(after - before);
        while (this.frameTimes[0] <= after - 1000) {
            this.frameTimes.shift();
            this.durations.shift();
        }
        // Calling requestAnimationFrame will rerun draw() at the correct rate:
        // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_animations
        if (this.animator.isPlaying) {
            // Request a new rendering frame
            this.scheduleRendering();
        }
        else if (this.animator.isPaused) {
            // Reset the end time so on playback it starts at the correct frame
            this.lastRenderTime = 0;
        }
        else if (this.animator.isStopped) {
            // Reset animation instances, artboard and time
            // TODO: implement this properly when we have instancing
            // this.initArtboard();
            // this.drawFrame();
            this.lastRenderTime = 0;
        }
    };
    /**
     * Align the renderer
     */
    Rive.prototype.alignRenderer = function () {
        var _a = this, renderer = _a.renderer, runtime = _a.runtime, _layout = _a._layout, artboard = _a.artboard;
        // Align things up safe in the knowledge we can restore if changed
        renderer.align(_layout.runtimeFit(runtime), _layout.runtimeAlignment(runtime), {
            minX: _layout.minX,
            minY: _layout.minY,
            maxX: _layout.maxX,
            maxY: _layout.maxY,
        }, artboard.bounds, this._devicePixelRatioUsed * _layout.layoutScaleFactor);
    };
    Object.defineProperty(Rive.prototype, "fps", {
        get: function () {
            return this.durations.length;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "frameTime", {
        get: function () {
            if (this.durations.length === 0) {
                return 0;
            }
            return (this.durations.reduce(function (a, b) { return a + b; }, 0) / this.durations.length).toFixed(4);
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Cleans up all Wasm-generated objects that need to be manually destroyed:
     * artboard instances, animation instances, state machine instances,
     * renderer instance, file and runtime.
     *
     * Once this is called, you will need to initialise a new instance of the
     * Rive class
     */
    Rive.prototype.cleanup = function () {
        var _a, _b, _c, _d, _e;
        this.destroyed = true;
        // Stop the renderer if it hasn't already been stopped.
        this.stopRendering();
        // Make the GL context backing this renderer current before any WASM teardown
        // that frees GPU resources. Binding here covers the artboard/file deletes;
        // deleteRiveRenderer() re-binds for the renderer's own delete. No-op on the
        // canvas2d build
        (_b = (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.bindContext) === null || _b === void 0 ? void 0 : _b.call(_a);
        // Clean up any artboard, animation or state machine instances.
        this.cleanupInstances();
        // Remove from observer
        if (this._observed !== null) {
            observers.remove(this._observed);
        }
        this.removeRiveListeners();
        // The file and its session go before the renderer: the session's replay
        // state lives in the renderer's context. But the renderer must let go of
        // the session first — its detach handle dies with session.delete(), and a
        // later detach would pass embind a deleted object.
        if (this.renderer) {
            (_d = (_c = this.renderer).detachSession) === null || _d === void 0 ? void 0 : _d.call(_c);
        }
        this.releaseCurrentRiveFile(/* isTeardown */ true);
        this.riveFile = null;
        this.deleteRiveRenderer();
        if (this._audioEventListener !== null) {
            audioManager.remove(this._audioEventListener);
            this._audioEventListener = null;
        }
        if (this._pageVisibilityHandler) {
            document.removeEventListener('visibilitychange', this._pageVisibilityHandler);
            this._pageVisibilityHandler = null;
        }
        (_e = this._viewModelInstance) === null || _e === void 0 ? void 0 : _e.cleanup();
        this._viewModelInstance = null;
        this._globalViewModelInstances.forEach(function (instance) { return instance.cleanup(); });
        this._globalViewModelInstances.clear();
        this._dataEnums = null;
    };
    /**
     * Drops this instance's hold on `this.riveFile`. A reference taken through
     * getInstance() is given back; a file we imported but never referenced is
     * released outright so its session goes with it. A caller-supplied file we
     * never referenced is left alone.
     *
     * `isTeardown` distinguishes cleanup() from a reload. Teardown always hands
     * the reference back, as it always has. A reload must not do that for a
     * caller-supplied file: a RiveFile carries no reference for its creator, so
     * releasing here would take the last one and destroy a file the caller still
     * holds.
     */
    Rive.prototype.releaseCurrentRiveFile = function (isTeardown) {
        var _a, _b;
        if (this.file) {
            if (isTeardown || this.ownsRiveFile) {
                (_a = this.riveFile) === null || _a === void 0 ? void 0 : _a.cleanup();
            }
            this.file = null;
        }
        else if (this.ownsRiveFile) {
            (_b = this.riveFile) === null || _b === void 0 ? void 0 : _b.destroyIfUnused();
        }
    };
    /**
     * Cleans up the Renderer object. Only call this API if you no longer
     * need to render Rive content in your session.
     */
    Rive.prototype.deleteRiveRenderer = function () {
        var _a, _b;
        if (this.renderer) {
            // A session outliving this renderer has to stop pointing at it, and its
            // replay state has to drop while this context is still alive. No-op when
            // nothing was ever attached.
            (_b = (_a = this.renderer).detachSession) === null || _b === void 0 ? void 0 : _b.call(_a);
            this.renderer.delete();
        }
        this.renderer = null;
    };
    Object.defineProperty(Rive.prototype, "deferredRendererActive", {
        /**
         * @experimental This API is early and may encounter breaking behavior change without a major version bump
         *
         * Whether this instance is rendering through a deferred session. False whenever
         * a fallback ran, whatever was requested.
         */
        get: function () {
            var _a, _b, _c;
            return (_c = (_b = (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.deferredActive) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : false;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Cleans up any Wasm-generated objects that need to be manually destroyed:
     * artboard instances, animation instances, state machine instances.
     *
     * Once this is called, things will need to be reinitialized or bad things
     * might happen.
     */
    Rive.prototype.cleanupInstances = function () {
        var _a;
        if (this.eventCleanup !== null) {
            this.eventCleanup();
        }
        this.cleanupKeyboardInteractions();
        // Tear down semantics before deleting state machines — the overlay's action
        // closures point at instances that stop() is about to free.
        this.cleanupSemantics();
        // Delete all animation and state machine instances synchronously via the
        // animator
        (_a = this.animator) === null || _a === void 0 ? void 0 : _a.stop();
        if (this.artboard) {
            this.artboard.delete();
            this.artboard = null;
        }
    };
    /**
     * Tries to query the setup Artboard for a text run node with the given name.
     *
     * @param textRunName - Name of the text run node associated with a text object
     * @returns - TextValueRun node or undefined if the text run cannot be queried
     */
    Rive.prototype.retrieveTextRun = function (textRunName) {
        var _a;
        if (!textRunName) {
            console.warn("No text run name provided");
            return;
        }
        if (!this.artboard) {
            console.warn("Tried to access text run, but the Artboard is null");
            return;
        }
        var textRun = this.artboard.textRun(textRunName);
        if (!textRun) {
            console.warn("Could not access a text run with name '".concat(textRunName, "' in the '").concat((_a = this.artboard) === null || _a === void 0 ? void 0 : _a.name, "' Artboard. Note that you must rename a text run node in the Rive editor to make it queryable at runtime."));
            return;
        }
        return textRun;
    };
    /**
     * Returns a string from a given text run node name, or undefined if the text run
     * cannot be queried.
     *
     * @deprecated Text run APIs are deprecated: use data binding instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#updating-text-runs-at-runtime}
     * for how to migrate.
     * @param textRunName - Name of the text run node associated with a text object
     * @returns - String value of the text run node or undefined
     */
    Rive.prototype.getTextRunValue = function (textRunName) {
        warnOnce(DeprecationKeys.textRuns, textRunsDeprecationWarning);
        var textRun = this.retrieveTextRun(textRunName);
        return textRun ? textRun.text : undefined;
    };
    /**
     * Sets a text value for a given text run node name if possible
     *
     * @deprecated Text run APIs are deprecated: use data binding instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#updating-text-runs-at-runtime}
     * for how to migrate.
     * @param textRunName - Name of the text run node associated with a text object
     * @param textRunValue - String value to set on the text run node
     */
    Rive.prototype.setTextRunValue = function (textRunName, textRunValue) {
        warnOnce(DeprecationKeys.textRuns, textRunsDeprecationWarning);
        var textRun = this.retrieveTextRun(textRunName);
        if (textRun) {
            textRun.text = textRunValue;
        }
    };
    /**
     * Warns when playback-control names match linear animations in the
     * Animator's instanced context; state machine playback remain supported.
     *
     * Remove for v3 release
     */
    Rive.prototype.warnIfLinearAnimationNames = function (names, methodName) {
        if (this.animator &&
            this.animator.animations.some(function (a) { return names.includes(a.name); })) {
            warnDeprecatedAnimationNames(methodName);
        }
    };
    /**
     * Plays specified animations or state machines; if none specified, it
     * unpauses everything.
     * @param animationNames Animation or state machine name(s) to play.
     *
     * Deprecated usage: passing linear animation names (control playback with a
     * state machine instead) and passing an array of names (this parameter
     * becomes a single string in the next major version).
     */
    Rive.prototype.play = function (animationNames, autoplay) {
        var _this = this;
        warnIfNamesArray(animationNames, "play");
        var names = mapToStringArray(animationNames);
        // If the file's not loaded, queue up the play
        if (!this.readyForPlaying) {
            this.taskQueue.add({
                action: function () { return _this.play(animationNames, autoplay); },
            });
            return;
        }
        this.animator.play(names);
        this.warnIfLinearAnimationNames(names, "play");
        this.syncSemanticsOnStateMachines();
        if (this.eventCleanup) {
            this.eventCleanup();
        }
        this.cleanupKeyboardInteractions();
        this.setupRiveListeners();
        this.startRendering();
    };
    /**
     * Pauses specified animations or state machines; if none specified, pauses
     * all.
     * @param animationNames Animation or state machine name(s) to pause.
     *
     * Deprecated usage: passing linear animation names (control playback with a
     * state machine instead) and passing an array of names (this parameter
     * becomes a single string in the next major version).
     */
    Rive.prototype.pause = function (animationNames) {
        var _this = this;
        warnIfNamesArray(animationNames, "pause");
        var names = mapToStringArray(animationNames);
        // If the file's not loaded, early out, nothing to pause
        if (!this.readyForPlaying) {
            this.taskQueue.add({
                action: function () { return _this.pause(animationNames); },
            });
            return;
        }
        if (this.eventCleanup) {
            this.eventCleanup();
        }
        this.cleanupKeyboardInteractions();
        this.animator.pause(names);
        this.warnIfLinearAnimationNames(names, "pause");
    };
    /**
     * Scrubs specified animations to the given time; if none specified, scrubs
     * all of them.
     * @deprecated `scrub()` will be removed in a future major version: use a
     * state machine to control playback instead
     */
    Rive.prototype.scrub = function (animationNames, value) {
        var _this = this;
        warnOnce(DeprecationKeys.scrub, "`scrub()` is deprecated and will be removed in a future major version: " +
            "use a state machine to control playback instead.");
        var names = mapToStringArray(animationNames);
        // If the file's not loaded, early out, nothing to pause
        if (!this.readyForPlaying) {
            this.taskQueue.add({
                action: function () { return _this.scrub(animationNames, value); },
            });
            return;
        }
        // Scrub the animation time; we draw a single frame here so that if
        // nothing's currently playing, the scrubbed animation is still rendered/
        this.animator.scrub(names, value || 0);
        this.drawFrame();
    };
    /**
     * Stops specified animations or state machines; if none specified, stops
     * them all.
     * @param animationNames Animation or state machine name(s) to stop.
     *
     * Deprecated usage: passing linear animation names (control playback with a
     * state machine instead) and passing an array of names (this parameter
     * becomes a single string in the next major version).
     */
    Rive.prototype.stop = function (animationNames) {
        var _this = this;
        warnIfNamesArray(animationNames, "stop");
        var names = mapToStringArray(animationNames);
        // If the file's not loaded, early out, nothing to pause
        if (!this.readyForPlaying) {
            this.taskQueue.add({
                action: function () { return _this.stop(animationNames); },
            });
            return;
        }
        this.warnIfLinearAnimationNames(names, "stop");
        // If there is no artboard, this.animator will be undefined
        if (this.animator) {
            this.animator.stop(names);
        }
        if (this.eventCleanup) {
            this.eventCleanup();
        }
        this.cleanupKeyboardInteractions();
        this.cleanupSemantics();
    };
    /**
     * Resets the animation
     * @param artboard the name of the artboard, or default if none given
     * @param stateMachine the name of the state machine for playback
     * @param autoplay whether to autoplay when reset, defaults to false
     *
     */
    Rive.prototype.reset = function (params) {
        var _a, _b;
        // Get the current artboard, animations, state machines, and playback states
        var artBoardName = params === null || params === void 0 ? void 0 : params.artboard;
        var _c = resolveStartingPlayback({
            stateMachine: params === null || params === void 0 ? void 0 : params.stateMachine,
            animations: params === null || params === void 0 ? void 0 : params.animations,
            stateMachines: params === null || params === void 0 ? void 0 : params.stateMachines,
        }), animationNames = _c.startingAnimationNames, stateMachineNames = _c.startingStateMachineNames;
        var autoplay = (_a = params === null || params === void 0 ? void 0 : params.autoplay) !== null && _a !== void 0 ? _a : false;
        var autoBind = (_b = params === null || params === void 0 ? void 0 : params.autoBind) !== null && _b !== void 0 ? _b : false;
        // Stop everything and clean up
        this.cleanupInstances();
        // Reinitialize an artboard instance with the state
        this.initArtboard(artBoardName, animationNames, stateMachineNames, autoplay, autoBind);
        // Only drain the task queue once playback commands can execute; tasks
        // queued before then re-add themselves in a loop.
        if (this.readyForPlaying) {
            this.taskQueue.process();
        }
    };
    // Loads a new Rive file, keeping listeners in place
    Rive.prototype.load = function (params) {
        // Before stop(), so a call with no source leaves playback running.
        if (!params.src && !params.buffer && !params.riveFile) {
            throw new RiveError(Rive.missingErrorMessage);
        }
        // Stop all animations
        this.stop();
        // Reinitialize
        this.init(params);
    };
    Object.defineProperty(Rive.prototype, "layout", {
        /**
         * Returns the current layout. Note that layout should be treated as
         * immutable. If you want to change the layout, create a new one use the
         * layout setter
         */
        get: function () {
            return this._layout;
        },
        // Sets a new layout
        set: function (layout) {
            this._layout = layout;
            this.reportDisplayScale();
            // Fit/alignment/bounds feed the overlay transform.
            this._overlayTransformDirty = true;
            // If the maxX or maxY are 0, then set them to the canvas width and height
            if (!layout.maxX || !layout.maxY) {
                this.resizeToCanvas();
            }
            if (this.loaded && !this.animator.isPlaying) {
                this.drawFrame();
            }
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Sets the layout bounds to the current canvas size; this is typically called
     * when the canvas is resized
     */
    Rive.prototype.resizeToCanvas = function () {
        this._layout = this.layout.copyWith({
            minX: 0,
            minY: 0,
            maxX: this.canvas.width,
            maxY: this.canvas.height,
        });
        // Layout bounds feed the overlay transform.
        this._overlayTransformDirty = true;
    };
    /**
     * Accounts for devicePixelRatio as a multiplier to render the size of the canvas drawing surface.
     * Uses the size of the backing canvas to set new width/height attributes. Need to re-render
     * and resize the layout to match the new drawing surface afterwards.
     * Useful function for consumers to include in a window resize listener.
     *
     * This method will set the {@link devicePixelRatioUsed} property.
     *
     * Optionally, you can provide a {@link customDevicePixelRatio} to provide a
     * custom value.
     */
    Rive.prototype.resizeDrawingSurfaceToCanvas = function (customDevicePixelRatio) {
        if (this.canvas instanceof HTMLCanvasElement && !!window) {
            var _a = this.canvas.getBoundingClientRect(), width = _a.width, height = _a.height;
            var dpr = customDevicePixelRatio || window.devicePixelRatio || 1;
            this.devicePixelRatioUsed = dpr;
            this.canvas.width = dpr * width;
            this.canvas.height = dpr * height;
            this._needsRedraw = true;
            this.resizeToCanvas();
            if (this.layout.fit === Fit.Layout && this.artboard) {
                var scaleFactor = this._layout.layoutScaleFactor;
                this.artboard.width = width / scaleFactor;
                this.artboard.height = height / scaleFactor;
            }
            this.drawFrame();
        }
    };
    Object.defineProperty(Rive.prototype, "source", {
        // Returns the animation source, which may be undefined
        get: function () {
            return this.src;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "activeArtboard", {
        /**
         * Returns the name of the active artboard
         */
        get: function () {
            return this.artboard ? this.artboard.name : "";
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "semanticTree", {
        /**
         * Returns the semantic tree model when semantics are enabled, or null.
         * The overlay and external consumers use this to inspect the
         * current state of the semantic tree.
         */
        get: function () {
            return this._semanticTree;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "accessibilityOverlay", {
        /**
         * Returns the accessibility overlay when semantics are enabled, or null.
         * External consumers can use this to inspect the
         * current state of the accessibility overlay for this instance.
         */
        get: function () {
            return this._accessibilityOverlay;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "animationNames", {
        // Returns a list of animation names on the chosen artboard
        get: function () {
            // If the file's not loaded, we got nothing to return
            if (!this.loaded || !this.artboard) {
                return [];
            }
            var animationNames = [];
            for (var i = 0; i < this.artboard.animationCount(); i++) {
                animationNames.push(this.artboard.animationByIndex(i).name);
            }
            return animationNames;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "stateMachineNames", {
        /**
         * Returns a list of state machine names from the current artboard
         */
        get: function () {
            // If the file's not loaded, we got nothing to return
            if (!this.loaded || !this.artboard) {
                return [];
            }
            var stateMachineNames = [];
            for (var i = 0; i < this.artboard.stateMachineCount(); i++) {
                stateMachineNames.push(this.artboard.stateMachineByIndex(i).name);
            }
            return stateMachineNames;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Returns the inputs for the specified instanced state machine, or an empty
     * list if the name is invalid or the state machine is not instanced. Returns
     * undefined if the file is not loaded yet.
     *
     * @deprecated State machine inputs are deprecated: use data binding
     * properties instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs}
     * for how to migrate.
     * @param name the state machine name
     * @returns the inputs for the named state machine or undefined
     */
    Rive.prototype.stateMachineInputs = function (name) {
        warnOnce(DeprecationKeys.stateMachineInputs, stateMachineInputsDeprecationWarning);
        // If the file's not loaded, early out, nothing to pause
        if (!this.loaded) {
            return;
        }
        var stateMachine = this.animator.stateMachines.find(function (m) { return m.name === name; });
        return stateMachine === null || stateMachine === void 0 ? void 0 : stateMachine.inputs;
    };
    // Returns the input with the provided name at the given path
    Rive.prototype.retrieveInputAtPath = function (name, path) {
        if (!name) {
            console.warn("No input name provided for path '".concat(path, "'"));
            return;
        }
        if (!this.artboard) {
            console.warn("Tried to access input: '".concat(name, "', at path: '").concat(path, "', but the Artboard is null"));
            return;
        }
        var input = this.artboard.inputByPath(name, path);
        if (!input) {
            console.warn("Could not access an input with name: '".concat(name, "', at path:'").concat(path, "'"));
            return;
        }
        return input;
    };
    /**
     * Set the boolean input with the provided name at the given path with value
     * @deprecated State machine inputs are deprecated: use data binding
     * properties instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs}
     * for how to migrate.
     * @param input the state machine input name
     * @param value the value to set the input to
     * @param path the path the input is located at an artboard level
     */
    Rive.prototype.setBooleanStateAtPath = function (inputName, value, path) {
        warnOnce(DeprecationKeys.stateMachineInputs, stateMachineInputsDeprecationWarning);
        var input = this.retrieveInputAtPath(inputName, path);
        if (!input)
            return;
        if (input.type === StateMachineInputType.Boolean) {
            input.asBool().value = value;
        }
        else {
            console.warn("Input with name: '".concat(inputName, "', at path:'").concat(path, "' is not a boolean"));
        }
    };
    /**
     * Set the number input with the provided name at the given path with value
     * @deprecated State machine inputs are deprecated: use data binding
     * properties instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs}
     * for how to migrate.
     * @param input the state machine input name
     * @param value the value to set the input to
     * @param path the path the input is located at an artboard level
     */
    Rive.prototype.setNumberStateAtPath = function (inputName, value, path) {
        warnOnce(DeprecationKeys.stateMachineInputs, stateMachineInputsDeprecationWarning);
        var input = this.retrieveInputAtPath(inputName, path);
        if (!input)
            return;
        if (input.type === StateMachineInputType.Number) {
            input.asNumber().value = value;
        }
        else {
            console.warn("Input with name: '".concat(inputName, "', at path:'").concat(path, "' is not a number"));
        }
    };
    /**
     * Fire the trigger with the provided name at the given path
     * @deprecated State machine inputs are deprecated: use data binding
     * properties instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#state-machine-inputs}
     * for how to migrate.
     * @param input the state machine input name
     * @param path the path the input is located at an artboard level
     */
    Rive.prototype.fireStateAtPath = function (inputName, path) {
        warnOnce(DeprecationKeys.stateMachineInputs, stateMachineInputsDeprecationWarning);
        var input = this.retrieveInputAtPath(inputName, path);
        if (!input)
            return;
        if (input.type === StateMachineInputType.Trigger) {
            input.asTrigger().fire();
        }
        else {
            console.warn("Input with name: '".concat(inputName, "', at path:'").concat(path, "' is not a trigger"));
        }
    };
    // Returns the TextValueRun object for the provided name at the given path
    Rive.prototype.retrieveTextAtPath = function (name, path) {
        if (!name) {
            console.warn("No text name provided for path '".concat(path, "'"));
            return;
        }
        if (!path) {
            console.warn("No path provided for text '".concat(name, "'"));
            return;
        }
        if (!this.artboard) {
            console.warn("Tried to access text: '".concat(name, "', at path: '").concat(path, "', but the Artboard is null"));
            return;
        }
        var text = this.artboard.textByPath(name, path);
        if (!text) {
            console.warn("Could not access text with name: '".concat(name, "', at path:'").concat(path, "'"));
            return;
        }
        return text;
    };
    /**
     * Retrieves the text value for a specified text run at a given path
     * @param textName The name of the text run
     * @param path The path to the text run within the artboard
     * @returns The text value of the text run, or undefined if not found
     *
     * @example
     * // Get the text value for a text run named "title" at one nested artboard deep
     * const titleText = riveInstance.getTextRunValueAtPath("title", "artboard1");
     *
     * @example
     * // Get the text value for a text run named "subtitle" within a nested group two artboards deep
     * const subtitleText = riveInstance.getTextRunValueAtPath("subtitle", "group/nestedGroup");
     *
     * @remarks
     * If the text run cannot be found at the specified path, a warning will be logged to the console.
     *
     * @deprecated Text run APIs are deprecated: use data binding instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#updating-text-runs-at-runtime}
     * for how to migrate.
     */
    Rive.prototype.getTextRunValueAtPath = function (textName, path) {
        warnOnce(DeprecationKeys.textRuns, textRunsDeprecationWarning);
        var run = this.retrieveTextAtPath(textName, path);
        if (!run) {
            console.warn("Could not get text with name: '".concat(textName, "', at path:'").concat(path, "'"));
            return;
        }
        return run.text;
    };
    /**
     * Sets the text value for a specified text run at a given path
     * @param textName The name of the text run
     * @param value The new text value to set
     * @param path The path to the text run within the artboard
     * @returns void
     *
     * @example
     * // Set the text value for a text run named "title" at one nested artboard deep
     * riveInstance.setTextRunValueAtPath("title", "New Title", "artboard1");
     *
     * @example
     * // Set the text value for a text run named "subtitle" within a nested group two artboards deep
     * riveInstance.setTextRunValueAtPath("subtitle", "New Subtitle", "group/nestedGroup");
     *
     * @remarks
     * If the text run cannot be found at the specified path, a warning will be logged to the console.
     *
     * @deprecated Text run APIs are deprecated: use data binding instead. See
     * {@link https://rive.app/docs/editor/data-binding/migration-guide#updating-text-runs-at-runtime}
     * for how to migrate.
     */
    Rive.prototype.setTextRunValueAtPath = function (textName, value, path) {
        warnOnce(DeprecationKeys.textRuns, textRunsDeprecationWarning);
        var run = this.retrieveTextAtPath(textName, path);
        if (!run) {
            console.warn("Could not set text with name: '".concat(textName, "', at path:'").concat(path, "'"));
            return;
        }
        run.text = value;
    };
    Object.defineProperty(Rive.prototype, "playingStateMachineNames", {
        // Returns a list of playing machine names
        get: function () {
            // If the file's not loaded, we got nothing to return
            if (!this.loaded) {
                return [];
            }
            return this.animator.stateMachines
                .filter(function (m) { return m.playing; })
                .map(function (m) { return m.name; });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "playingAnimationNames", {
        // Returns a list of playing animation names
        get: function () {
            // If the file's not loaded, we got nothing to return
            if (!this.loaded) {
                return [];
            }
            return this.animator.animations.filter(function (a) { return a.playing; }).map(function (a) { return a.name; });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "pausedAnimationNames", {
        // Returns a list of paused animation names
        get: function () {
            // If the file's not loaded, we got nothing to return
            if (!this.loaded) {
                return [];
            }
            return this.animator.animations
                .filter(function (a) { return !a.playing; })
                .map(function (a) { return a.name; });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "pausedStateMachineNames", {
        /**
         *  Returns a list of paused machine names
         * @returns a list of state machine names that are paused
         */
        get: function () {
            // If the file's not loaded, we got nothing to return
            if (!this.loaded) {
                return [];
            }
            return this.animator.stateMachines
                .filter(function (m) { return !m.playing; })
                .map(function (m) { return m.name; });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "isPlaying", {
        /**
         * @returns true if any animation is playing
         */
        get: function () {
            return this.animator.isPlaying;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "isPaused", {
        /**
         * @returns true if all instanced animations are paused
         */
        get: function () {
            return this.animator.isPaused;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "isStopped", {
        /**
         * @returns true if no animations are playing or paused
         */
        get: function () {
            var _a, _b;
            return (_b = (_a = this.animator) === null || _a === void 0 ? void 0 : _a.isStopped) !== null && _b !== void 0 ? _b : true;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "bounds", {
        /**
         * @returns the bounds of the current artboard, or undefined if the artboard
         * isn't loaded yet.
         */
        get: function () {
            return this.artboard ? this.artboard.bounds : undefined;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Subscribe to Rive-generated events
     *
     * Note: subscribing to {@link EventType.RiveEvent},
     * {@link EventType.StateChange}, or {@link EventType.Loop} is deprecated;
     * use data binding instead. See
     * {@link https://rive.app/docs/runtimes/web/rive-events} (Rive Events) and
     * {@link https://rive.app/docs/editor/data-binding/migration-guide} for how
     * to migrate Rive graphics to a data binding workflow instead.
     * @param type the type of event to subscribe to
     * @param callback callback to fire when the event occurs
     */
    Rive.prototype.on = function (type, callback) {
        if (type === EventType.RiveEvent) {
            warnOnce(DeprecationKeys.riveEvents, riveEventsDeprecationWarning);
        }
        else if (type === EventType.StateChange) {
            warnOnce(DeprecationKeys.stateChangeEvents, stateChangeEventsDeprecationWarning);
        }
        else if (type === EventType.Loop) {
            warnOnce(DeprecationKeys.loopEvents, loopEventsDeprecationWarning);
        }
        this.eventManager.add({
            type: type,
            callback: callback,
        });
    };
    /**
     * Unsubscribes from a Rive-generated event
     * @param type the type of event to unsubscribe from
     * @param callback the callback to unsubscribe
     */
    Rive.prototype.off = function (type, callback) {
        this.eventManager.remove({
            type: type,
            callback: callback,
        });
    };
    /**
     * Unsubscribes from a Rive-generated event
     * @deprecated
     * @param callback the callback to unsubscribe from
     */
    Rive.prototype.unsubscribe = function (type, callback) {
        warnOnce(DeprecationKeys.legacyUnsubscribe, "This function is deprecated: please use `off()` instead.");
        this.off(type, callback);
    };
    /**
     * Unsubscribes all Rive listeners from an event type, or everything if no type is
     * given
     * @param type the type of event to unsubscribe from, or all types if
     * undefined
     */
    Rive.prototype.removeAllRiveEventListeners = function (type) {
        this.eventManager.removeAll(type);
    };
    /**
     * Unsubscribes all listeners from an event type, or everything if no type is
     * given
     * @deprecated
     * @param type the type of event to unsubscribe from, or all types if
     * undefined
     */
    Rive.prototype.unsubscribeAll = function (type) {
        warnOnce(DeprecationKeys.legacyUnsubscribe, "This function is deprecated: please use `removeAllRiveEventListeners()` instead.");
        this.removeAllRiveEventListeners(type);
    };
    /**
     * Stops the rendering loop; this is different from pausing in that it doesn't
     * change the state of any animation. It stops rendering from occurring. This
     * is designed for situations such as when Rive isn't visible.
     *
     * The only way to start rendering again is to call `startRendering`.
     * Animations that are marked as playing will start from the position that
     * they would have been at if rendering had not been stopped.
     */
    Rive.prototype.stopRendering = function () {
        this._explicitlyStoppedRendering = true;
        if (this.loaded && this.frameRequestId) {
            if (this.runtime.cancelAnimationFrame) {
                this.runtime.cancelAnimationFrame(this.frameRequestId);
            }
            else {
                cancelAnimationFrame(this.frameRequestId);
            }
            this.frameRequestId = null;
        }
    };
    /**
     * Starts the rendering loop if it has been previously stopped. If the
     * renderer is already active, then this will have zero effect.
     */
    Rive.prototype.startRendering = function () {
        this._explicitlyStoppedRendering = false;
        this.drawFrame();
    };
    Rive.prototype.scheduleRendering = function () {
        if (this.loaded && this.artboard && !this.frameRequestId) {
            if (this.runtime.requestAnimationFrame) {
                this.frameRequestId = this.runtime.requestAnimationFrame(this._boundDraw);
            }
            else {
                this.frameRequestId = requestAnimationFrame(this._boundDraw);
            }
        }
    };
    /**
     * Called when document.visibilitychange fires (tab change, window minimize, etc.).
     * Cancels the rAF loop on hide and resets the time reference so that no accumulated time is
     * applied to state machines when the tab becomes visible again. This prevents state machine
     * advances with large time deltas when rAF starts up again.
     */
    Rive.prototype._onPageVisibilityChange = function () {
        var _a, _b;
        if (document.hidden) {
            if (this.frameRequestId !== null) {
                if ((_a = this.runtime) === null || _a === void 0 ? void 0 : _a.cancelAnimationFrame) {
                    this.runtime.cancelAnimationFrame(this.frameRequestId);
                }
                else {
                    cancelAnimationFrame(this.frameRequestId);
                }
                this.frameRequestId = null;
            }
            // Reset so the first resumed frame starts with elapsedTime === 0.
            this.lastRenderTime = 0;
        }
        else if (((_b = this.animator) === null || _b === void 0 ? void 0 : _b.isPlaying) && !this._explicitlyStoppedRendering) {
            this.scheduleRendering();
        }
    };
    /**
     * Enables frames-per-second (FPS) reporting for the runtime
     * If no callback is provided, Rive will append a fixed-position div at the top-right corner of
     * the page with the FPS reading
     * @param fpsCallback - Callback from the runtime during the RAF loop that supplies the FPS value
     */
    Rive.prototype.enableFPSCounter = function (fpsCallback) {
        this.runtime.enableFPSCounter(fpsCallback);
    };
    /**
     * Disables frames-per-second (FPS) reporting for the runtime
     */
    Rive.prototype.disableFPSCounter = function () {
        this.runtime.disableFPSCounter();
    };
    Object.defineProperty(Rive.prototype, "contents", {
        /**
         * Returns the contents of a Rive file: the artboards, animations, and state machines
         */
        get: function () {
            if (!this.loaded) {
                return undefined;
            }
            var riveContents = {
                artboards: [],
            };
            for (var i = 0; i < this.file.artboardCount(); i++) {
                var artboard = this.file.artboardByIndex(i);
                var artboardContents = {
                    name: artboard.name,
                    animations: [],
                    stateMachines: [],
                };
                for (var j = 0; j < artboard.animationCount(); j++) {
                    var animation = artboard.animationByIndex(j);
                    artboardContents.animations.push(animation.name);
                }
                for (var k = 0; k < artboard.stateMachineCount(); k++) {
                    var stateMachine = artboard.stateMachineByIndex(k);
                    var name_2 = stateMachine.name;
                    var instance = new this.runtime.StateMachineInstance(stateMachine, artboard);
                    var inputContents = [];
                    for (var l = 0; l < instance.inputCount(); l++) {
                        var input = instance.input(l);
                        inputContents.push({ name: input.name, type: input.type });
                    }
                    artboardContents.stateMachines.push({
                        name: name_2,
                        inputs: inputContents,
                    });
                }
                riveContents.artboards.push(artboardContents);
            }
            return riveContents;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "volume", {
        /**
         * Getter / Setter for the volume of the artboard
         */
        get: function () {
            if (this.artboard && this.artboard.volume !== this._volume) {
                this._volume = this.artboard.volume;
            }
            return this._volume;
        },
        set: function (value) {
            this._volume = value;
            if (this.artboard) {
                this.artboard.volume = value * audioManager.systemVolume;
            }
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "artboardWidth", {
        /**
         * The width of the artboard.
         *
         * This will return 0 if the artboard is not loaded yet and a custom
         * width has not been set.
         *
         * Do not set this value manually when using {@link resizeDrawingSurfaceToCanvas}
         * with a {@link Layout.fit} of {@link Fit.Layout}, as the artboard width is
         * automatically set.
         */
        get: function () {
            var _a;
            if (this.artboard) {
                return this.artboard.width;
            }
            return (_a = this._artboardWidth) !== null && _a !== void 0 ? _a : 0;
        },
        set: function (value) {
            this._artboardWidth = value;
            if (this.artboard) {
                this.artboard.width = value;
            }
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "artboardHeight", {
        /**
         * The height of the artboard.
         *
         * This will return 0 if the artboard is not loaded yet and a custom
         * height has not been set.
         *
         * Do not set this value manually when using {@link resizeDrawingSurfaceToCanvas}
         * with a {@link Layout.fit} of {@link Fit.Layout}, as the artboard height is
         * automatically set.
         */
        get: function () {
            var _a;
            if (this.artboard) {
                return this.artboard.height;
            }
            return (_a = this._artboardHeight) !== null && _a !== void 0 ? _a : 0;
        },
        set: function (value) {
            this._artboardHeight = value;
            if (this.artboard) {
                this.artboard.height = value;
            }
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Reset the artboard size to its original values.
     */
    Rive.prototype.resetArtboardSize = function () {
        if (this.artboard) {
            this.artboard.resetArtboardSize();
            this._artboardWidth = this.artboard.width;
            this._artboardHeight = this.artboard.height;
        }
        else {
            // If the artboard isn't loaded, we need to reset the custom width and height
            this._artboardWidth = undefined;
            this._artboardHeight = undefined;
        }
    };
    Object.defineProperty(Rive.prototype, "devicePixelRatioUsed", {
        /**
         * The device pixel ratio used in rendering and canvas/artboard resizing.
         *
         * This value will be overidden by the device pixel ratio used in
         * {@link resizeDrawingSurfaceToCanvas}. If you use that method, do not set this value.
         */
        get: function () {
            return this._devicePixelRatioUsed;
        },
        set: function (value) {
            if (value !== this._devicePixelRatioUsed) {
                this._overlayTransformDirty = true;
            }
            this._devicePixelRatioUsed = value;
            this.reportDisplayScale();
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Rive.prototype, "inkbleed", {
        /**
         * @experimental (WebGL2 only) Whether inkbleed antialiasing is in effect. Can only be
         * turned on if `enableInkbleed: true` was passed at construction.
         */
        get: function () {
            return this._inkbleedCapable && this._inkbleed;
        },
        set: function (value) {
            if (!this._inkbleedCapable) {
                if (value && !Rive.inkbleedNotCapableWarned) {
                    Rive.inkbleedNotCapableWarned = true;
                    console.warn("Rive: `inkbleed` can't be enabled on this instance. It needs `enableInkbleed: true` at construction, on @rive-app/webgl2 without `useOffscreenRenderer`.");
                }
                return;
            }
            this._inkbleed = value;
            if (this.renderer) {
                this.applyInkbleed();
            }
            this._needsRedraw = true;
            this.drawFrame();
        },
        enumerable: false,
        configurable: true
    });
    Rive.prototype.applyInkbleed = function () {
        var enabled = this._inkbleed;
        var setInkbleed = this.renderer.setInkbleed;
        var supported = typeof setInkbleed === "function"
            ? setInkbleed.call(this.renderer, enabled)
            : !enabled;
        if (!supported) {
            this._inkbleedCapable = false;
            if (!Rive.inkbleedUnsupportedWarned) {
                Rive.inkbleedUnsupportedWarned = true;
                console.warn("Rive: `inkbleed` is not supported by this renderer (it needs @rive-app/webgl2 without `useOffscreenRenderer`, and a canvas context with depth and stencil). Rendering without it.");
            }
        }
    };
    // Not per frame: the scale is per file, and instances sharing one would trade
    // it every frame.
    Rive.prototype.reportDisplayScale = function () {
        var _a;
        (_a = this.file) === null || _a === void 0 ? void 0 : _a.displayScale(this._devicePixelRatioUsed * this._layout.layoutScaleFactor);
    };
    /**
     * Sets the main view model instance and applies it (rebinds). Equivalent to
     * `setViewModelInstance(vmi)` followed by `bind()`.
     */
    Rive.prototype.bindViewModelInstance = function (viewModelInstance) {
        if (!viewModelInstance) {
            return;
        }
        this.setViewModelInstance(viewModelInstance);
        this.bind();
    };
    /**
     * Sets the main view model instance in the data context WITHOUT rebinding.
     * Call {@link bind} to apply. Use this with {@link setGlobalViewModelInstance}
     * to batch multiple changes into a single rebind.
     */
    Rive.prototype.setViewModelInstance = function (viewModelInstance) {
        var _a;
        var runtimeInstance = viewModelInstance === null || viewModelInstance === void 0 ? void 0 : viewModelInstance.runtimeInstance;
        if (!this.artboard ||
            this.destroyed ||
            !viewModelInstance ||
            !runtimeInstance) {
            return;
        }
        viewModelInstance.internalIncrementReferenceCount();
        (_a = this._viewModelInstance) === null || _a === void 0 ? void 0 : _a.cleanup();
        this._viewModelInstance = viewModelInstance;
        if (this.animator.stateMachines.length > 0) {
            this.animator.stateMachines.forEach(function (stateMachine) {
                return stateMachine.instance.setViewModelInstance(runtimeInstance);
            });
        }
        else {
            this.artboard.setViewModelInstance(runtimeInstance);
        }
    };
    /**
     * Applies any pending `set*` view model instance changes by rebinding the
     * data binds once.
     * Implicitly creates and binds any view models that have not been set.
     */
    Rive.prototype.bind = function () {
        if (!this.artboard || this.destroyed) {
            return;
        }
        if (this.animator.stateMachines.length > 0) {
            this.animator.stateMachines.forEach(function (stateMachine) {
                return stateMachine.instance.bind();
            });
        }
        else {
            this.artboard.bind();
        }
    };
    Object.defineProperty(Rive.prototype, "viewModelInstance", {
        get: function () {
            return this._viewModelInstance;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Sets (or replaces) the global view model instance for the given global view
     * model name in the data context WITHOUT rebinding. The main instance and any
     * other globals keep their order. Call {@link bind} to apply — batch several
     * `set*` calls then a single `bind()` to avoid rebinding per set.
     * @param name - the name of the global view model
     * @param viewModelInstance - the instance to set for that global
     * @returns whether the instance was set (false if `name` does not match a
     * global view model in the file)
     */
    Rive.prototype.setGlobalViewModelInstance = function (name, viewModelInstance) {
        var _a;
        var runtimeInstance = viewModelInstance === null || viewModelInstance === void 0 ? void 0 : viewModelInstance.runtimeInstance;
        if (!this.artboard || this.destroyed || !runtimeInstance) {
            return false;
        }
        var bound = false;
        if (this.animator.stateMachines.length > 0) {
            this.animator.stateMachines.forEach(function (stateMachine) {
                if (stateMachine.instance.setGlobalViewModelInstance(name, runtimeInstance)) {
                    bound = true;
                }
            });
        }
        else {
            bound = this.artboard.setGlobalViewModelInstance(name, runtimeInstance);
        }
        if (bound) {
            viewModelInstance.internalIncrementReferenceCount();
            (_a = this._globalViewModelInstances.get(name)) === null || _a === void 0 ? void 0 : _a.cleanup();
            this._globalViewModelInstances.set(name, viewModelInstance);
        }
        return bound;
    };
    /**
     * @param name - the name of the global view model
     * @returns the global view model instance bound under the given name — the
     * instance set via {@link setGlobalViewModelInstance} or one created by
     * auto-bind — or null if none has been set/created for that name (globals are
     * not auto-created; the getter never creates one).
     */
    Rive.prototype.globalViewModelInstance = function (name) {
        var cached = this._globalViewModelInstances.get(name);
        if (cached) {
            return cached;
        }
        if (!this.artboard || this.destroyed) {
            return null;
        }
        // State machines share the artboard's data context; query the first one
        // when present (mirroring how the setter routes), otherwise the artboard.
        // This is a pure read — it returns null unless an instance was set/bound.
        var runtimeInstance = this.animator.stateMachines.length > 0
            ? this.animator.stateMachines[0].instance.globalViewModelInstance(name)
            : this.artboard.globalViewModelInstance(name);
        if (runtimeInstance === null) {
            return null;
        }
        var viewModelInstance = new ViewModelInstance(runtimeInstance, null);
        (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, runtimeInstance);
        viewModelInstance.internalIncrementReferenceCount();
        this._globalViewModelInstances.set(name, viewModelInstance);
        return viewModelInstance;
    };
    /**
     * @returns the names of the file's global view models, in file order. Use
     * these with {@link setGlobalViewModelInstance} / {@link globalViewModelInstance}.
     */
    Rive.prototype.globalViewModelNames = function () {
        var _a, _b;
        return (_b = (_a = this.file) === null || _a === void 0 ? void 0 : _a.globalViewModelNames()) !== null && _b !== void 0 ? _b : [];
    };
    Rive.prototype.viewModelByIndex = function (index) {
        var viewModel = this.file.viewModelByIndex(index);
        if (viewModel !== null) {
            return new ViewModel(viewModel);
        }
        return null;
    };
    Rive.prototype.viewModelByName = function (name) {
        var _a;
        return (_a = this.riveFile) === null || _a === void 0 ? void 0 : _a.viewModelByName(name);
    };
    Rive.prototype.enums = function () {
        if (this._dataEnums === null) {
            var dataEnums = this.file.enums();
            this._dataEnums = dataEnums.map(function (dataEnum) {
                return new DataEnum(dataEnum);
            });
        }
        return this._dataEnums;
    };
    Rive.prototype.defaultViewModel = function () {
        if (this.artboard) {
            var viewModel = this.file.defaultArtboardViewModel(this.artboard);
            if (viewModel) {
                return new ViewModel(viewModel);
            }
        }
        return null;
    };
    /**
     * @deprecated This function is deprecated. For better stability and memory management
     * use `getBindableArtboard()` instead.
     * @param {string} name - The name of the artboard.
     * @returns {Artboard} The artboard to bind to.
     */
    Rive.prototype.getArtboard = function (name) {
        var _a, _b;
        return (_b = (_a = this.riveFile) === null || _a === void 0 ? void 0 : _a.getArtboard(name)) !== null && _b !== void 0 ? _b : null;
    };
    Rive.prototype.getBindableArtboard = function (name) {
        var _a, _b;
        return (_b = (_a = this.riveFile) === null || _a === void 0 ? void 0 : _a.getBindableArtboard(name)) !== null && _b !== void 0 ? _b : null;
    };
    Rive.prototype.getDefaultBindableArtboard = function () {
        var _a, _b;
        return (_b = (_a = this.riveFile) === null || _a === void 0 ? void 0 : _a.getDefaultBindableArtboard()) !== null && _b !== void 0 ? _b : null;
    };
    /**
     * Clear focus applicable to active state machines with focus nodes. Useful if users want to
     * reset focus state and behavior within the Rive graphic at any point (i.e. blurring off the canvas)
     */
    Rive.prototype.clearFocus = function () {
        var playingStateMachines = this.animator.stateMachines.filter(function (sm) { return sm.playing && sm.hasFocusNodes; });
        playingStateMachines.forEach(function (sm) { return sm.clearFocus(); });
    };
    Rive.inkbleedUnsupportedWarned = false;
    Rive.inkbleedNotCapableWarned = false;
    // Error message for missing source or buffer
    Rive.missingErrorMessage = "Rive source file or data buffer required";
    // Error message for removed rive file
    Rive.cleanupErrorMessage = "Attempt to use file after calling cleanup.";
    return Rive;
}());

var DataType;
(function (DataType) {
    DataType["none"] = "none";
    DataType["string"] = "string";
    DataType["number"] = "number";
    DataType["boolean"] = "boolean";
    DataType["color"] = "color";
    DataType["list"] = "list";
    DataType["enumType"] = "enumType";
    DataType["trigger"] = "trigger";
    DataType["viewModel"] = "viewModel";
    DataType["integer"] = "integer";
    DataType["listIndex"] = "listIndex";
    DataType["image"] = "image";
    DataType["artboard"] = "artboard";
})(DataType || (DataType = {}));
var ViewModel = /** @class */ (function () {
    function ViewModel(viewModel) {
        this._viewModel = viewModel;
    }
    Object.defineProperty(ViewModel.prototype, "instanceCount", {
        get: function () {
            return this._viewModel.instanceCount;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ViewModel.prototype, "name", {
        get: function () {
            return this._viewModel.name;
        },
        enumerable: false,
        configurable: true
    });
    ViewModel.prototype.instanceByIndex = function (index) {
        var instance = this._viewModel.instanceByIndex(index);
        if (instance !== null) {
            var viewModelInstance = new ViewModelInstance(instance, null);
            (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, instance);
            return viewModelInstance;
        }
        return null;
    };
    ViewModel.prototype.instanceByName = function (name) {
        var instance = this._viewModel.instanceByName(name);
        if (instance !== null) {
            var viewModelInstance = new ViewModelInstance(instance, null);
            (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, instance);
            return viewModelInstance;
        }
        return null;
    };
    ViewModel.prototype.defaultInstance = function () {
        var runtimeInstance = this._viewModel.defaultInstance();
        if (runtimeInstance !== null) {
            var viewModelInstance = new ViewModelInstance(runtimeInstance, null);
            (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, runtimeInstance);
            return viewModelInstance;
        }
        return null;
    };
    ViewModel.prototype.instance = function () {
        var runtimeInstance = this._viewModel.instance();
        if (runtimeInstance !== null) {
            var viewModelInstance = new ViewModelInstance(runtimeInstance, null);
            (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, runtimeInstance);
            return viewModelInstance;
        }
        return null;
    };
    Object.defineProperty(ViewModel.prototype, "properties", {
        get: function () {
            return this._viewModel.getProperties();
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ViewModel.prototype, "instanceNames", {
        get: function () {
            return this._viewModel.getInstanceNames();
        },
        enumerable: false,
        configurable: true
    });
    return ViewModel;
}());

var DataEnum = /** @class */ (function () {
    function DataEnum(dataEnum) {
        this._dataEnum = dataEnum;
    }
    Object.defineProperty(DataEnum.prototype, "name", {
        get: function () {
            return this._dataEnum.name;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(DataEnum.prototype, "values", {
        get: function () {
            return this._dataEnum.values;
        },
        enumerable: false,
        configurable: true
    });
    return DataEnum;
}());

var PropertyType;
(function (PropertyType) {
    PropertyType["Number"] = "number";
    PropertyType["String"] = "string";
    PropertyType["Boolean"] = "boolean";
    PropertyType["Color"] = "color";
    PropertyType["Trigger"] = "trigger";
    PropertyType["Enum"] = "enum";
    PropertyType["List"] = "list";
    PropertyType["Image"] = "image";
    PropertyType["Font"] = "font";
    PropertyType["Artboard"] = "artboard";
})(PropertyType || (PropertyType = {}));
var ViewModelInstance = /** @class */ (function () {
    function ViewModelInstance(runtimeInstance, parent) {
        this._parents = [];
        this._children = [];
        this._viewModelInstances = new Map();
        this._propertiesWithCallbacks = [];
        this._referenceCount = 0;
        this.selfUnref = false;
        this._runtimeInstance = runtimeInstance;
        if (parent !== null) {
            this._parents.push(parent);
        }
    }
    Object.defineProperty(ViewModelInstance.prototype, "runtimeInstance", {
        get: function () {
            return this._runtimeInstance;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ViewModelInstance.prototype, "nativeInstance", {
        get: function () {
            return this._runtimeInstance;
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstance.prototype.handleCallbacks = function () {
        if (this._propertiesWithCallbacks.length !== 0) {
            this._propertiesWithCallbacks.forEach(function (property) {
                property.handleCallbacks();
            });
            this._propertiesWithCallbacks.forEach(function (property) {
                property.clearChanges();
            });
        }
        this._children.forEach(function (child) { return child.handleCallbacks(); });
    };
    ViewModelInstance.prototype.addParent = function (parent) {
        if (!this._parents.includes(parent)) {
            this._parents.push(parent);
            if (this._propertiesWithCallbacks.length > 0 ||
                this._children.length > 0) {
                parent.addToViewModelCallbacks(this);
            }
        }
    };
    ViewModelInstance.prototype.removeParent = function (parent) {
        var index = this._parents.indexOf(parent);
        if (index !== -1) {
            var parent_1 = this._parents[index];
            parent_1.removeFromViewModelCallbacks(this);
            this._parents.splice(index, 1);
        }
    };
    /*
     * method for internal use, it shouldn't be called externally
     */
    ViewModelInstance.prototype.addToPropertyCallbacks = function (property) {
        var _this = this;
        if (!this._propertiesWithCallbacks.includes(property)) {
            this._propertiesWithCallbacks.push(property);
            if (this._propertiesWithCallbacks.length > 0) {
                this._parents.forEach(function (parent) {
                    parent.addToViewModelCallbacks(_this);
                });
            }
        }
    };
    /*
     * method for internal use, it shouldn't be called externally
     */
    ViewModelInstance.prototype.removeFromPropertyCallbacks = function (property) {
        var _this = this;
        if (this._propertiesWithCallbacks.includes(property)) {
            this._propertiesWithCallbacks = this._propertiesWithCallbacks.filter(function (prop) { return prop !== property; });
            if (this._children.length === 0 &&
                this._propertiesWithCallbacks.length === 0) {
                this._parents.forEach(function (parent) {
                    parent.removeFromViewModelCallbacks(_this);
                });
            }
        }
    };
    /*
     * method for internal use, it shouldn't be called externally
     */
    ViewModelInstance.prototype.addToViewModelCallbacks = function (instance) {
        var _this = this;
        if (!this._children.includes(instance)) {
            this._children.push(instance);
            this._parents.forEach(function (parent) {
                parent.addToViewModelCallbacks(_this);
            });
        }
    };
    /*
     * method for internal use, it shouldn't be called externally
     */
    ViewModelInstance.prototype.removeFromViewModelCallbacks = function (instance) {
        var _this = this;
        if (this._children.includes(instance)) {
            this._children = this._children.filter(function (child) { return child !== instance; });
            if (this._children.length === 0 &&
                this._propertiesWithCallbacks.length === 0) {
                this._parents.forEach(function (parent) {
                    parent.removeFromViewModelCallbacks(_this);
                });
            }
        }
    };
    ViewModelInstance.prototype.clearCallbacks = function () {
        this._propertiesWithCallbacks.forEach(function (property) {
            property.clearCallbacks();
        });
    };
    ViewModelInstance.prototype.propertyFromPath = function (path, type) {
        var pathSegments = path.split("/");
        return this.propertyFromPathSegments(pathSegments, 0, type);
    };
    ViewModelInstance.prototype.viewModelFromPathSegments = function (pathSegments, index) {
        var viewModelInstance = this.internalViewModelInstance(pathSegments[index]);
        if (viewModelInstance !== null) {
            if (index == pathSegments.length - 1) {
                return viewModelInstance;
            }
            else {
                return viewModelInstance.viewModelFromPathSegments(pathSegments, index++);
            }
        }
        return null;
    };
    ViewModelInstance.prototype.propertyFromPathSegments = function (pathSegments, index, type) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        if (index < pathSegments.length - 1) {
            var viewModelInstance = this.internalViewModelInstance(pathSegments[index]);
            if (viewModelInstance !== null) {
                return viewModelInstance.propertyFromPathSegments(pathSegments, index + 1, type);
            }
            else {
                return null;
            }
        }
        var instance = null;
        switch (type) {
            case PropertyType.Number:
                instance = (_b = (_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.number(pathSegments[index])) !== null && _b !== void 0 ? _b : null;
                if (instance !== null) {
                    return new ViewModelInstanceNumber(instance, this);
                }
                break;
            case PropertyType.String:
                instance = (_d = (_c = this._runtimeInstance) === null || _c === void 0 ? void 0 : _c.string(pathSegments[index])) !== null && _d !== void 0 ? _d : null;
                if (instance !== null) {
                    return new ViewModelInstanceString(instance, this);
                }
                break;
            case PropertyType.Boolean:
                instance = (_f = (_e = this._runtimeInstance) === null || _e === void 0 ? void 0 : _e.boolean(pathSegments[index])) !== null && _f !== void 0 ? _f : null;
                if (instance !== null) {
                    return new ViewModelInstanceBoolean(instance, this);
                }
                break;
            case PropertyType.Color:
                instance = (_h = (_g = this._runtimeInstance) === null || _g === void 0 ? void 0 : _g.color(pathSegments[index])) !== null && _h !== void 0 ? _h : null;
                if (instance !== null) {
                    return new ViewModelInstanceColor(instance, this);
                }
                break;
            case PropertyType.Trigger:
                instance = (_k = (_j = this._runtimeInstance) === null || _j === void 0 ? void 0 : _j.trigger(pathSegments[index])) !== null && _k !== void 0 ? _k : null;
                if (instance !== null) {
                    return new ViewModelInstanceTrigger(instance, this);
                }
                break;
            case PropertyType.Enum:
                instance = (_m = (_l = this._runtimeInstance) === null || _l === void 0 ? void 0 : _l.enum(pathSegments[index])) !== null && _m !== void 0 ? _m : null;
                if (instance !== null) {
                    return new ViewModelInstanceEnum(instance, this);
                }
                break;
            case PropertyType.List:
                instance = (_p = (_o = this._runtimeInstance) === null || _o === void 0 ? void 0 : _o.list(pathSegments[index])) !== null && _p !== void 0 ? _p : null;
                if (instance !== null) {
                    return new ViewModelInstanceList(instance, this);
                }
                break;
            case PropertyType.Image:
                instance = (_r = (_q = this._runtimeInstance) === null || _q === void 0 ? void 0 : _q.image(pathSegments[index])) !== null && _r !== void 0 ? _r : null;
                if (instance !== null) {
                    return new ViewModelInstanceAssetImage(instance, this);
                }
                break;
            case PropertyType.Font:
                instance = (_t = (_s = this._runtimeInstance) === null || _s === void 0 ? void 0 : _s.font(pathSegments[index])) !== null && _t !== void 0 ? _t : null;
                if (instance !== null) {
                    return new ViewModelInstanceAssetFont(instance, this);
                }
                break;
            case PropertyType.Artboard:
                instance = (_v = (_u = this._runtimeInstance) === null || _u === void 0 ? void 0 : _u.artboard(pathSegments[index])) !== null && _v !== void 0 ? _v : null;
                if (instance !== null) {
                    return new ViewModelInstanceArtboard(instance, this);
                }
                break;
        }
        return null;
    };
    ViewModelInstance.prototype.internalViewModelInstance = function (name) {
        var _a;
        if (this._viewModelInstances.has(name)) {
            return this._viewModelInstances.get(name);
        }
        var viewModelRuntimeInstance = (_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.viewModel(name);
        if (viewModelRuntimeInstance !== null) {
            var viewModelInstance = new ViewModelInstance(viewModelRuntimeInstance, this);
            (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, viewModelRuntimeInstance);
            viewModelInstance.internalIncrementReferenceCount();
            this._viewModelInstances.set(name, viewModelInstance);
            return viewModelInstance;
        }
        return null;
    };
    /**
     * method to access a property instance of type number belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the number property
     */
    ViewModelInstance.prototype.number = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Number);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a property instance of type string belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the string property
     */
    ViewModelInstance.prototype.string = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.String);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a property instance of type boolean belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the boolean property
     */
    ViewModelInstance.prototype.boolean = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Boolean);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a property instance of type color belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the ttrigger property
     */
    ViewModelInstance.prototype.color = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Color);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a property instance of type trigger belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the trigger property
     */
    ViewModelInstance.prototype.trigger = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Trigger);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a property instance of type enum belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the enum property
     */
    ViewModelInstance.prototype.enum = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Enum);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a property instance of type list belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the list property
     */
    ViewModelInstance.prototype.list = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.List);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a view model property instance belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the image property
     */
    ViewModelInstance.prototype.image = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Image);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a view model property instance belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the font property
     */
    ViewModelInstance.prototype.font = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Font);
        return viewmodelInstanceValue;
    };
    /**
     * method to access an artboard property instance belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the image property
     */
    ViewModelInstance.prototype.artboard = function (path) {
        var viewmodelInstanceValue = this.propertyFromPath(path, PropertyType.Artboard);
        return viewmodelInstanceValue;
    };
    /**
     * method to access a view model property instance belonging
     * to the view model instance or to a nested view model instance
     * @param path - path to the view model property
     */
    ViewModelInstance.prototype.viewModel = function (path) {
        var pathSegments = path.split("/");
        var parentViewModelInstance = pathSegments.length > 1
            ? this.viewModelFromPathSegments(pathSegments.slice(0, pathSegments.length - 1), 0)
            : this;
        if (parentViewModelInstance != null) {
            return parentViewModelInstance.internalViewModelInstance(pathSegments[pathSegments.length - 1]);
        }
        return null;
    };
    ViewModelInstance.prototype.internalReplaceViewModel = function (name, value) {
        var _a;
        if (value.runtimeInstance !== null) {
            var result = ((_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.replaceViewModel(name, value.runtimeInstance)) ||
                false;
            if (result) {
                value.internalIncrementReferenceCount();
                var oldInstance_1 = this.internalViewModelInstance(name);
                if (oldInstance_1 !== null) {
                    oldInstance_1.removeParent(this);
                    if (this._children.includes(oldInstance_1)) {
                        this._children = this._children.filter(function (child) { return child !== oldInstance_1; });
                    }
                    oldInstance_1.cleanup();
                }
                this._viewModelInstances.set(name, value);
                value.addParent(this);
            }
            return result;
        }
        return false;
    };
    /**
     * method to replace a view model property with another view model value
     * @param path - path to the view model property
     * @param value - view model that will replace the original
     */
    ViewModelInstance.prototype.replaceViewModel = function (path, value) {
        var _a;
        var pathSegments = path.split("/");
        var viewModelInstance = pathSegments.length > 1
            ? this.viewModelFromPathSegments(pathSegments.slice(0, pathSegments.length - 1), 0)
            : this;
        return ((_a = viewModelInstance === null || viewModelInstance === void 0 ? void 0 : viewModelInstance.internalReplaceViewModel(pathSegments[pathSegments.length - 1], value)) !== null && _a !== void 0 ? _a : false);
    };
    /*
     * method to add one to the reference counter of the instance.
     * Use if the file owning the reference is destroyed but the instance needs to stay around
     */
    ViewModelInstance.prototype.incrementReferenceCount = function () {
        var _a;
        this._referenceCount++;
        (_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.incrementReferenceCount();
    };
    /*
     * method to subtract one to the reference counter of the instance.
     * Use if incrementReferenceCount has been called
     */
    ViewModelInstance.prototype.decrementReferenceCount = function () {
        var _a;
        this._referenceCount--;
        (_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.decrementReferenceCount();
    };
    Object.defineProperty(ViewModelInstance.prototype, "properties", {
        get: function () {
            var _a;
            return (((_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.getProperties().map(function (prop) { return (__assign({}, prop)); })) || []);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ViewModelInstance.prototype, "viewModelName", {
        /**
         * Get the name of the ViewModel definition this instance was created from.
         */
        get: function () {
            var _a, _b;
            return (_b = (_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.getViewModelName()) !== null && _b !== void 0 ? _b : "";
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstance.prototype.internalIncrementReferenceCount = function () {
        this._referenceCount++;
    };
    ViewModelInstance.prototype.cleanup = function () {
        var _this = this;
        var _a;
        this._referenceCount--;
        if (this._referenceCount <= 0) {
            if (this.selfUnref) {
                (_a = this._runtimeInstance) === null || _a === void 0 ? void 0 : _a.unref();
            }
            this._runtimeInstance = null;
            this.clearCallbacks();
            this._propertiesWithCallbacks = [];
            this._viewModelInstances.forEach(function (value) {
                value.cleanup();
            });
            this._viewModelInstances.clear();
            var children = __spreadArray([], this._children, true);
            this._children.length = 0;
            var parents = __spreadArray([], this._parents, true);
            this._parents.length = 0;
            children.forEach(function (child) {
                child.removeParent(_this);
            });
            parents.forEach(function (parent) {
                parent.removeFromViewModelCallbacks(_this);
            });
        }
    };
    return ViewModelInstance;
}());

var ViewModelInstanceValue = /** @class */ (function () {
    function ViewModelInstanceValue(instance, parent) {
        this.callbacks = [];
        this._viewModelInstanceValue = instance;
        this._parentViewModel = parent;
    }
    ViewModelInstanceValue.prototype.on = function (callback) {
        // Since we don't clean the changed flag for properties that don't have listeners,
        // we clean it the first time we add a listener to it
        if (this.callbacks.length === 0) {
            this._viewModelInstanceValue.clearChanges();
        }
        if (!this.callbacks.includes(callback)) {
            this.callbacks.push(callback);
            this._parentViewModel.addToPropertyCallbacks(this);
        }
    };
    ViewModelInstanceValue.prototype.off = function (callback) {
        if (!callback) {
            this.callbacks.length = 0;
        }
        else {
            this.callbacks = this.callbacks.filter(function (cb) { return cb !== callback; });
        }
        if (this.callbacks.length === 0) {
            this._parentViewModel.removeFromPropertyCallbacks(this);
        }
    };
    ViewModelInstanceValue.prototype.internalHandleCallback = function (callback) { };
    ViewModelInstanceValue.prototype.handleCallbacks = function () {
        var _this = this;
        if (this._viewModelInstanceValue.hasChanged) {
            this.callbacks.forEach(function (callback) {
                _this.internalHandleCallback(callback);
            });
        }
    };
    ViewModelInstanceValue.prototype.clearChanges = function () {
        this._viewModelInstanceValue.clearChanges();
    };
    ViewModelInstanceValue.prototype.clearCallbacks = function () {
        this.callbacks.length = 0;
    };
    Object.defineProperty(ViewModelInstanceValue.prototype, "name", {
        get: function () {
            return this._viewModelInstanceValue.name;
        },
        enumerable: false,
        configurable: true
    });
    return ViewModelInstanceValue;
}());

var ViewModelInstanceString = /** @class */ (function (_super) {
    __extends(ViewModelInstanceString, _super);
    function ViewModelInstanceString(instance, parent) {
        return _super.call(this, instance, parent) || this;
    }
    Object.defineProperty(ViewModelInstanceString.prototype, "value", {
        get: function () {
            return this._viewModelInstanceValue.value;
        },
        set: function (val) {
            this._viewModelInstanceValue.value = val;
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceString.prototype.internalHandleCallback = function (callback) {
        callback(this.value);
    };
    return ViewModelInstanceString;
}(ViewModelInstanceValue));

var ViewModelInstanceNumber = /** @class */ (function (_super) {
    __extends(ViewModelInstanceNumber, _super);
    function ViewModelInstanceNumber(instance, parent) {
        return _super.call(this, instance, parent) || this;
    }
    Object.defineProperty(ViewModelInstanceNumber.prototype, "value", {
        get: function () {
            return this._viewModelInstanceValue.value;
        },
        set: function (val) {
            this._viewModelInstanceValue.value = val;
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceNumber.prototype.internalHandleCallback = function (callback) {
        callback(this.value);
    };
    return ViewModelInstanceNumber;
}(ViewModelInstanceValue));

var ViewModelInstanceBoolean = /** @class */ (function (_super) {
    __extends(ViewModelInstanceBoolean, _super);
    function ViewModelInstanceBoolean(instance, parent) {
        return _super.call(this, instance, parent) || this;
    }
    Object.defineProperty(ViewModelInstanceBoolean.prototype, "value", {
        get: function () {
            return this._viewModelInstanceValue.value;
        },
        set: function (val) {
            this._viewModelInstanceValue.value = val;
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceBoolean.prototype.internalHandleCallback = function (callback) {
        callback(this.value);
    };
    return ViewModelInstanceBoolean;
}(ViewModelInstanceValue));

var ViewModelInstanceTrigger = /** @class */ (function (_super) {
    __extends(ViewModelInstanceTrigger, _super);
    function ViewModelInstanceTrigger(instance, parent) {
        return _super.call(this, instance, parent) || this;
    }
    ViewModelInstanceTrigger.prototype.trigger = function () {
        return this._viewModelInstanceValue.trigger();
    };
    ViewModelInstanceTrigger.prototype.internalHandleCallback = function (callback) {
        callback();
    };
    return ViewModelInstanceTrigger;
}(ViewModelInstanceValue));

var ViewModelInstanceEnum = /** @class */ (function (_super) {
    __extends(ViewModelInstanceEnum, _super);
    function ViewModelInstanceEnum(instance, parent) {
        return _super.call(this, instance, parent) || this;
    }
    Object.defineProperty(ViewModelInstanceEnum.prototype, "value", {
        get: function () {
            return this._viewModelInstanceValue.value;
        },
        set: function (val) {
            this._viewModelInstanceValue.value = val;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ViewModelInstanceEnum.prototype, "valueIndex", {
        get: function () {
            return this._viewModelInstanceValue
                .valueIndex;
        },
        set: function (val) {
            this._viewModelInstanceValue.valueIndex = val;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ViewModelInstanceEnum.prototype, "values", {
        get: function () {
            return this._viewModelInstanceValue.values;
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceEnum.prototype.internalHandleCallback = function (callback) {
        callback(this.value);
    };
    return ViewModelInstanceEnum;
}(ViewModelInstanceValue));

var ViewModelInstanceList = /** @class */ (function (_super) {
    __extends(ViewModelInstanceList, _super);
    function ViewModelInstanceList(instance, parent) {
        return _super.call(this, instance, parent) || this;
    }
    Object.defineProperty(ViewModelInstanceList.prototype, "length", {
        get: function () {
            return this._viewModelInstanceValue.size;
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceList.prototype.addInstance = function (instance) {
        if (instance.runtimeInstance != null) {
            this._viewModelInstanceValue.addInstance(instance.runtimeInstance);
            instance.addParent(this._parentViewModel);
        }
    };
    ViewModelInstanceList.prototype.addInstanceAt = function (instance, index) {
        if (instance.runtimeInstance != null) {
            if (this._viewModelInstanceValue.addInstanceAt(instance.runtimeInstance, index)) {
                instance.addParent(this._parentViewModel);
                return true;
            }
        }
        return false;
    };
    ViewModelInstanceList.prototype.removeInstance = function (instance) {
        if (instance.runtimeInstance != null) {
            this._viewModelInstanceValue.removeInstance(instance.runtimeInstance);
            instance.removeParent(this._parentViewModel);
        }
    };
    ViewModelInstanceList.prototype.removeInstanceAt = function (index) {
        this._viewModelInstanceValue.removeInstanceAt(index);
    };
    ViewModelInstanceList.prototype.instanceAt = function (index) {
        var runtimeInstance = this._viewModelInstanceValue.instanceAt(index);
        if (runtimeInstance != null) {
            var viewModelInstance = new ViewModelInstance(runtimeInstance, this._parentViewModel);
            (0,_utils__WEBPACK_IMPORTED_MODULE_3__.createFinalization)(viewModelInstance, runtimeInstance);
            return viewModelInstance;
        }
        return null;
    };
    ViewModelInstanceList.prototype.swap = function (a, b) {
        this._viewModelInstanceValue.swap(a, b);
    };
    ViewModelInstanceList.prototype.internalHandleCallback = function (callback) {
        callback();
    };
    return ViewModelInstanceList;
}(ViewModelInstanceValue));

var ViewModelInstanceColor = /** @class */ (function (_super) {
    __extends(ViewModelInstanceColor, _super);
    function ViewModelInstanceColor(instance, parent) {
        return _super.call(this, instance, parent) || this;
    }
    Object.defineProperty(ViewModelInstanceColor.prototype, "value", {
        get: function () {
            return this._viewModelInstanceValue.value;
        },
        set: function (val) {
            this._viewModelInstanceValue.value = val;
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceColor.prototype.rgb = function (r, g, b) {
        this._viewModelInstanceValue.rgb(r, g, b);
    };
    ViewModelInstanceColor.prototype.rgba = function (r, g, b, a) {
        this._viewModelInstanceValue.argb(a, r, g, b);
    };
    ViewModelInstanceColor.prototype.argb = function (a, r, g, b) {
        this._viewModelInstanceValue.argb(a, r, g, b);
    };
    // Value 0 to 255
    ViewModelInstanceColor.prototype.alpha = function (a) {
        this._viewModelInstanceValue.alpha(a);
    };
    // Value 0 to 1
    ViewModelInstanceColor.prototype.opacity = function (o) {
        this._viewModelInstanceValue.alpha(Math.round(Math.max(0, Math.min(1, o)) * 255));
    };
    ViewModelInstanceColor.prototype.internalHandleCallback = function (callback) {
        callback(this.value);
    };
    return ViewModelInstanceColor;
}(ViewModelInstanceValue));

var ViewModelInstanceAssetImage = /** @class */ (function (_super) {
    __extends(ViewModelInstanceAssetImage, _super);
    function ViewModelInstanceAssetImage(instance, root) {
        return _super.call(this, instance, root) || this;
    }
    Object.defineProperty(ViewModelInstanceAssetImage.prototype, "value", {
        set: function (image) {
            var _a;
            this._viewModelInstanceValue.value((_a = image === null || image === void 0 ? void 0 : image.nativeImage) !== null && _a !== void 0 ? _a : null);
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceAssetImage.prototype.internalHandleCallback = function (callback) {
        callback();
    };
    return ViewModelInstanceAssetImage;
}(ViewModelInstanceValue));

var ViewModelInstanceAssetFont = /** @class */ (function (_super) {
    __extends(ViewModelInstanceAssetFont, _super);
    function ViewModelInstanceAssetFont(instance, root) {
        return _super.call(this, instance, root) || this;
    }
    Object.defineProperty(ViewModelInstanceAssetFont.prototype, "value", {
        set: function (font) {
            var _a;
            this._viewModelInstanceValue.value((_a = font === null || font === void 0 ? void 0 : font.nativeFont) !== null && _a !== void 0 ? _a : null);
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceAssetFont.prototype.internalHandleCallback = function (callback) {
        callback();
    };
    return ViewModelInstanceAssetFont;
}(ViewModelInstanceValue));

var ViewModelInstanceArtboard = /** @class */ (function (_super) {
    __extends(ViewModelInstanceArtboard, _super);
    function ViewModelInstanceArtboard(instance, root) {
        return _super.call(this, instance, root) || this;
    }
    Object.defineProperty(ViewModelInstanceArtboard.prototype, "value", {
        set: function (artboard) {
            var _a, _b;
            var bindableArtboard;
            if (artboard.isBindableArtboard) {
                bindableArtboard = artboard;
            }
            else {
                bindableArtboard = artboard.file.internalBindableArtboardFromArtboard(artboard.nativeArtboard);
            }
            this._viewModelInstanceValue.value((_a = bindableArtboard === null || bindableArtboard === void 0 ? void 0 : bindableArtboard.nativeArtboard) !== null && _a !== void 0 ? _a : null);
            if (bindableArtboard === null || bindableArtboard === void 0 ? void 0 : bindableArtboard.nativeViewModel) {
                this._viewModelInstanceValue.viewModelInstance((_b = bindableArtboard === null || bindableArtboard === void 0 ? void 0 : bindableArtboard.nativeViewModel) !== null && _b !== void 0 ? _b : null);
            }
        },
        enumerable: false,
        configurable: true
    });
    ViewModelInstanceArtboard.prototype.internalHandleCallback = function (callback) {
        callback();
    };
    return ViewModelInstanceArtboard;
}(ViewModelInstanceValue));

// Loads Rive data from a URI via fetch.
var loadRiveFile = function (src) { return __awaiter(void 0, void 0, void 0, function () {
    var req, res, buffer;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                req = new Request(src);
                return [4 /*yield*/, fetch(req)];
            case 1:
                res = _a.sent();
                if (!res.ok) {
                    throw new Error("Failed to fetch the Rive file: HTTP ".concat(res.status));
                }
                return [4 /*yield*/, res.arrayBuffer()];
            case 2:
                buffer = _a.sent();
                return [2 /*return*/, buffer];
        }
    });
}); };
// #endregion
// #region utility functions
/*
 * Utility function to ensure an object is a string array
 */
var mapToStringArray = function (obj) {
    if (typeof obj === "string") {
        return [obj];
    }
    else if (obj instanceof Array) {
        return obj;
    }
    // If obj is undefined, return empty array
    return [];
};
// #endregion
// #region testing utilities
// Exports to only be used for tests
var Testing = {
    EventManager: EventManager,
    TaskQueueManager: TaskQueueManager,
};
// #endregion
// #region asset loaders
/**
 * Decodes bytes into an audio asset.
 *
 * Be sure to call `.unref()` on the audio once it is no longer needed. This
 * allows the engine to clean it up when it is not used by any more animations.
 */
var decodeAudio = function (bytes) { return __awaiter(void 0, void 0, void 0, function () {
    var decodedPromise, audio, audioWrapper;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                decodedPromise = new Promise(function (resolve) {
                    return _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader.getInstance(function (rive) {
                        rive.decodeAudio(bytes, resolve, null);
                    });
                });
                return [4 /*yield*/, decodedPromise];
            case 1:
                audio = _a.sent();
                audioWrapper = new _utils__WEBPACK_IMPORTED_MODULE_3__.AudioWrapper(audio);
                _utils__WEBPACK_IMPORTED_MODULE_3__.finalizationRegistry.register(audioWrapper, audio);
                return [2 /*return*/, audioWrapper];
        }
    });
}); };
/**
 * Decodes bytes into an image.
 *
 * Be sure to call `.unref()` on the image once it is no longer needed. This
 * allows the engine to clean it up when it is not used by any more animations.
 */
var decodeImage = function (bytes) { return __awaiter(void 0, void 0, void 0, function () {
    var decodedPromise, image, imageWrapper;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                decodedPromise = new Promise(function (resolve) {
                    return _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader.getInstance(function (rive) {
                        rive.decodeImage(bytes, resolve, null);
                    });
                });
                return [4 /*yield*/, decodedPromise];
            case 1:
                image = _a.sent();
                imageWrapper = new _utils__WEBPACK_IMPORTED_MODULE_3__.ImageWrapper(image);
                _utils__WEBPACK_IMPORTED_MODULE_3__.finalizationRegistry.register(imageWrapper, image);
                return [2 /*return*/, imageWrapper];
        }
    });
}); };
/**
 * Decodes bytes into a font.
 *
 * Be sure to call `.unref()` on the font once it is no longer needed. This
 * allows the engine to clean it up when it is not used by any more animations.
 */
var decodeFont = function (bytes) { return __awaiter(void 0, void 0, void 0, function () {
    var decodedPromise, font, fontWrapper;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                decodedPromise = new Promise(function (resolve) {
                    return _runtimeLoader__WEBPACK_IMPORTED_MODULE_1__.RuntimeLoader.getInstance(function (rive) {
                        rive.decodeFont(bytes, resolve, null);
                    });
                });
                return [4 /*yield*/, decodedPromise];
            case 1:
                font = _a.sent();
                fontWrapper = new _utils__WEBPACK_IMPORTED_MODULE_3__.FontWrapper(font);
                _utils__WEBPACK_IMPORTED_MODULE_3__.finalizationRegistry.register(fontWrapper, font);
                return [2 /*return*/, fontWrapper];
        }
    });
}); };
// #endregion

})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=rive.js.map