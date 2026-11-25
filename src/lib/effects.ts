import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type Effect = {
    id: string;
    name: string;
    preload?: () => void; // dipanggil saat card efek di-hover/fokus
    draw: (
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        w: number,
        h: number,
        t: number
    ) => void;
};

// ---------- efek CSS filter ----------

const filterEffect = (id: string, name: string, filter: string): Effect => ({
    id,
    name,
    draw(ctx, video, w, h) {
        ctx.filter = filter;
        ctx.drawImage(video, 0, 0, w, h);
        ctx.filter = "none";
    },
});

// ---------- efek pixel (ImageData) ----------

type PixelFn = (data: Uint8ClampedArray, w: number, h: number, t: number) => void;
type Overlay = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

const pixelEffect = (
    id: string,
    name: string,
    fn?: PixelFn,
    {
        maxW = 640,
        smooth = true,
        overlay,
    }: { maxW?: number; smooth?: boolean; overlay?: Overlay } = {}
): Effect => {
    let scratch: HTMLCanvasElement | undefined;
    let sctx: CanvasRenderingContext2D | null = null;

    return {
        id,
        name,
        draw(ctx, video, w, h, t) {
            if (!scratch) {
                scratch = document.createElement("canvas");
                sctx = scratch.getContext("2d", { willReadFrequently: true });
            }
            if (!sctx) return;

            const sw = Math.min(w, maxW);
            const sh = Math.max(1, Math.round((h * sw) / w));
            if (scratch.width !== sw || scratch.height !== sh) {
                scratch.width = sw;
                scratch.height = sh;
            }

            sctx.drawImage(video, 0, 0, sw, sh);
            if (fn) {
                const img = sctx.getImageData(0, 0, sw, sh);
                fn(img.data, sw, sh, t);
                sctx.putImageData(img, 0, 0);
            }

            ctx.imageSmoothingEnabled = smooth;
            ctx.drawImage(scratch, 0, 0, w, h);
            overlay?.(ctx, w, h, t);
        },
    };
};

const luma = (d: Uint8ClampedArray, i: number) =>
    (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;

const THERMAL_STOPS: [number, number, number, number][] = [
    [0, 0, 0, 40],
    [0.25, 90, 0, 160],
    [0.5, 220, 30, 40],
    [0.75, 255, 200, 0],
    [1, 255, 255, 230],
];

const THERMAL_LUT = (() => {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
        const p = i / 255;
        let k = 0;
        while (k < THERMAL_STOPS.length - 2 && p > THERMAL_STOPS[k + 1][0]) k++;
        const [p0, r0, g0, b0] = THERMAL_STOPS[k];
        const [p1, r1, g1, b1] = THERMAL_STOPS[k + 1];
        const f = (p - p0) / (p1 - p0);
        lut[i * 3] = r0 + (r1 - r0) * f;
        lut[i * 3 + 1] = g0 + (g1 - g0) * f;
        lut[i * 3 + 2] = b0 + (b1 - b0) * f;
    }
    return lut;
})();

const thermal: PixelFn = (d) => {
    for (let i = 0; i < d.length; i += 4) {
        const l = luma(d, i) * 3;
        d[i] = THERMAL_LUT[l];
        d[i + 1] = THERMAL_LUT[l + 1];
        d[i + 2] = THERMAL_LUT[l + 2];
    }
};

const nightVision: PixelFn = (d, w, h) => {
    for (let y = 0; y < h; y++) {
        const dim = y % 2 ? 0.8 : 1;
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = Math.min(255, luma(d, i) * 1.8 + (Math.random() - 0.5) * 40) * dim;
            d[i] = v * 0.15;
            d[i + 1] = v;
            d[i + 2] = v * 0.25;
        }
    }
};

const rand = (n: number) => {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
};

const glitch: PixelFn = (() => {
    let copy = new Uint8ClampedArray(0);

    return (d, w, h, t) => {
        if (copy.length !== d.length) copy = new Uint8ClampedArray(d.length);
        copy.set(d);

        const seed = Math.floor(t / 120);
        const bands = [0, 1, 2].map((k) => ({
            start: Math.floor(rand(seed + k) * h),
            len: 4 + Math.floor(rand(seed + k + 10) * h * 0.08),
            shift: Math.floor((rand(seed + k + 20) - 0.5) * w * 0.25),
        }));

        const baseSplit = Math.max(2, Math.round(w / 120));
        const clamp = (x: number) => (x < 0 ? 0 : x >= w ? w - 1 : x);

        for (let y = 0; y < h; y++) {
            let shift = 0;
            for (const b of bands) {
                if (y >= b.start && y < b.start + b.len) shift = b.shift;
            }
            const split = shift ? baseSplit * 3 : baseSplit;
            const row = y * w;

            for (let x = 0; x < w; x++) {
                const i = (row + x) * 4;
                d[i] = copy[(row + clamp(x + shift + split)) * 4];
                d[i + 1] = copy[(row + clamp(x + shift)) * 4 + 1];
                d[i + 2] = copy[(row + clamp(x + shift - split)) * 4 + 2];
            }
        }
    };
})();

// ---------- efek MediaPipe Face Landmarker (dipakai Heart Eyes & Bunny) ----------

type FacePoint = { x: number; y: number; z?: number };

const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm"; // disalin dari node_modules (lihat langkah 3)
const FACE_MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const RETRY_AFTER_MS = 5000;

let landmarker: FaceLandmarker | null = null;
let loadingLandmarker = false;
let lastInitFailure = -Infinity;
let lastVideoTime = -1;
let lastDetectTimestamp = -1;
let cachedFaces: FacePoint[][] = [];
const DETECT_INTERVAL_MS = 50;

let consolePatched = false;

// MediaPipe nulis log INFO lewat console.error, bikin overlay dev Next.js muncul
function silenceMediaPipeInfo() {
    if (consolePatched || typeof window === "undefined") return;
    consolePatched = true;

    const original = console.error;
    console.error = (...args: unknown[]) => {
        if (typeof args[0] === "string" && args[0].startsWith("INFO: Created TensorFlow Lite")) return;
        original.apply(console, args);
    };
}

async function initFaceLandmarker() {
    if (typeof window === "undefined" || landmarker || loadingLandmarker) return;
    if (performance.now() - lastInitFailure < RETRY_AFTER_MS) return;

    silenceMediaPipeInfo();
    loadingLandmarker = true;
    try {
        // import dinamis: library baru diunduh saat efek wajah dipakai
        const mp = await import("@mediapipe/tasks-vision");
        const vision = await mp.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
        landmarker = await mp.FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numFaces: 3,
        });
    } catch (err) {
        lastInitFailure = performance.now();
        console.error("Gagal memuat MediaPipe FaceLandmarker:", err);
    } finally {
        loadingLandmarker = false;
    }
}

function updateFaceCache(video: HTMLVideoElement) {
    if (!landmarker) {
        void initFaceLandmarker();
        return;
    }

    if (
        video.paused ||
        video.ended ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        video.currentTime === lastVideoTime
    ) {
        return;
    }

    const rawNow = performance.now();
    if (rawNow - lastDetectTimestamp < DETECT_INTERVAL_MS) return;

    const ts = Math.max(lastDetectTimestamp + 1, Math.floor(rawNow));
    lastVideoTime = video.currentTime;
    lastDetectTimestamp = ts;

    try {
        const res = landmarker.detectForVideo(video, ts);
        if (res?.faceLandmarks) {
            cachedFaces = res.faceLandmarks;
        }
    } catch {
        lastDetectTimestamp = ts + 250;
    }
}

// ---------- efek Hearts (kumpulan hati di atas kepala, ala Photo Booth) ----------

const HEART_PINKS = ["#ff2e7e", "#ff4d8d", "#ff6fa5"];

type HeartStyle = {
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    alpha?: number;
    rotation?: number;
};

// hati flat tanpa glow, titik tengahnya di tengah bentuk hati
function drawHeart(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    { fill, stroke, lineWidth = 2, alpha = 1, rotation = 0 }: HeartStyle
) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const s = size / 16;
    ctx.translate(0, -7 * s);
    ctx.beginPath();
    ctx.moveTo(0, 5 * s);
    ctx.bezierCurveTo(0, 2 * s, -4 * s, -2 * s, -8 * s, -2 * s);
    ctx.bezierCurveTo(-13 * s, -2 * s, -13 * s, 4.5 * s, -13 * s, 4.5 * s);
    ctx.bezierCurveTo(-13 * s, 8.5 * s, -7 * s, 12.5 * s, 0, 16 * s);
    ctx.bezierCurveTo(7 * s, 12.5 * s, 13 * s, 8.5 * s, 13 * s, 4.5 * s);
    ctx.bezierCurveTo(13 * s, 4.5 * s, 13 * s, -2 * s, 8 * s, -2 * s);
    ctx.bezierCurveTo(4 * s, -2 * s, 0, 2 * s, 0, 5 * s);
    ctx.closePath();

    if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
    }
    ctx.restore();
}

// posisi tiap hati, semuanya relatif terhadap lebar wajah:
// u = geser sepanjang lebar wajah, up = tinggi di atas dahi,
// size = ukuran hati, period = lama satu siklus (detik), phase = awal siklus (0-1)
const HEART_CLUSTER = [
    { u: -0.62, up: 0.02, size: 0.1, tilt: -0.3, period: 3.2, phase: 0.0 },
    { u: -0.45, up: 0.14, size: 0.05, tilt: 0.2, period: 2.8, phase: 0.35 },
    { u: -0.38, up: 0.0, size: 0.04, tilt: 0.1, period: 3.4, phase: 0.7 },
    { u: -0.28, up: 0.2, size: 0.07, tilt: -0.15, period: 3.0, phase: 0.2 },
    { u: -0.12, up: 0.12, size: 0.06, tilt: 0.25, period: 3.6, phase: 0.55 },
    { u: 0.02, up: 0.26, size: 0.11, tilt: 0.1, period: 3.1, phase: 0.85 },
    { u: 0.22, up: 0.17, size: 0.085, tilt: -0.2, period: 2.9, phase: 0.45 },
    { u: 0.36, up: 0.34, size: 0.04, tilt: 0.3, period: 3.3, phase: 0.1 },
    { u: 0.5, up: 0.12, size: 0.05, tilt: 0.15, period: 3.5, phase: 0.65 },
    { u: -0.7, up: 0.2, size: 0.035, tilt: 0.1, period: 2.7, phase: 0.9 },
    { u: 0.62, up: 0.03, size: 0.035, tilt: -0.2, period: 3.0, phase: 0.3 },
] as const;

const easeOutBack = (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

const headHearts: Effect = {
    id: "head-hearts",
    name: "Hearts",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t) {
        ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const top = lm[10];
            const left = lm[234];
            const right = lm[454];
            if (!top || !left || !right) return;

            const dx = (right.x - left.x) * w;
            const dy = (right.y - left.y) * h;
            const faceW = Math.hypot(dx, dy);
            if (!faceW) return;

            const angle = Math.atan2(dy, dx);
            const ux = dx / faceW;
            const uy = dy / faceW;
            const nx = uy;
            const ny = -ux;

            HEART_CLUSTER.forEach((s, i) => {
                // satu siklus: membal muncul -> melayang naik pelan -> memudar -> muncul lagi
                const p = (sec / s.period + s.phase + f * 0.13) % 1;
                const grow = p < 0.15 ? easeOutBack(p / 0.15) : 1;
                const alpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;

                const along = s.u * faceW;
                const up = (s.up + p * 0.08 + Math.sin(sec * 2 + i) * 0.01) * faceW;
                const hx = top.x * w + ux * along + nx * up;
                const hy = top.y * h + uy * along + ny * up;

                const pulse = 1 + Math.sin(sec * 5 + i * 1.3) * 0.06;
                const size = s.size * faceW * Math.max(0, grow) * pulse;

                drawHeart(ctx, hx, hy, size, {
                    fill: HEART_PINKS[(i + f) % HEART_PINKS.length],
                    alpha,
                    rotation: angle + s.tilt + Math.sin(sec * 3 + i) * 0.08,
                });
            });
        });
    },
};

// ---------- efek Bunny (telinga lemas yang ikut goyang) ----------

type Spring = { x: number; v: number };
type BunnyState = {
    t: number;
    x: number;
    y: number;
    fw: number;
    ang: number;
    sway: [Spring, Spring]; // ayunan pangkal telinga
    tip: [Spring, Spring]; // ujung telinga, lebih lambat jadi terasa melengkung
};

// satu state per wajah, supaya pegasnya terus berjalan antar frame
const bunnyStates: BunnyState[] = [];

const stepSpring = (s: Spring, target: number, k: number, c: number, dt: number) => {
    const a = (target - s.x) * k - s.v * c;
    s.v += a * dt;
    s.x += s.v * dt;
};

// bentuk telinga: pangkal lebar, ujung membulat, ujungnya bisa dibengkokkan lewat tipX
function earPath(ctx: CanvasRenderingContext2D, W: number, L: number, tipX: number) {
    ctx.beginPath();
    ctx.moveTo(-W / 2, 0);
    ctx.bezierCurveTo(-W * 0.58, -L * 0.55, tipX - W * 0.42, -L * 0.82, tipX - W * 0.2, -L * 0.97);
    ctx.quadraticCurveTo(tipX, -L * 1.03, tipX + W * 0.2, -L * 0.97);
    ctx.bezierCurveTo(tipX + W * 0.42, -L * 0.82, W * 0.58, -L * 0.55, W / 2, 0);
    ctx.closePath();
}

function drawEar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    len: number,
    wid: number,
    bend: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = "#fff7fb";
    ctx.strokeStyle = "#f4bcd2";
    ctx.lineWidth = Math.max(1.5, wid * 0.05);
    ctx.lineJoin = "round";
    earPath(ctx, wid, len, bend * len);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffb6d0";
    ctx.translate(0, -len * 0.07);
    earPath(ctx, wid * 0.5, len * 0.74, bend * len * 0.85);
    ctx.fill();

    ctx.restore();
}

function drawBlush(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    angle: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1.35, 1);
    ctx.fillStyle = "rgba(255, 92, 140, 0.38)";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

const bunnyEars: Effect = {
    id: "bunny",
    name: "Bunny",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t) {
        ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const top = lm[10];
            const left = lm[234];
            const right = lm[454];
            if (!top || !left || !right) return;

            const dx = (right.x - left.x) * w;
            const dy = (right.y - left.y) * h;
            const faceW = Math.hypot(dx, dy);
            if (!faceW) return;

            const angle = Math.atan2(dy, dx);

            // ---- wajah: pipi, hidung hati, kumis ----
            for (const [idx, dir] of [
                [205, -1],
                [425, 1],
            ] as const) {
                const c = lm[idx];
                if (!c) continue;
                const cx = c.x * w;
                const cy = c.y * h;
                drawBlush(ctx, cx, cy, faceW * 0.1, angle);

                const out = angle + (dir < 0 ? Math.PI : 0);
                ctx.save();
                ctx.strokeStyle = "#ff7fa8";
                ctx.lineWidth = Math.max(1.5, faceW * 0.012);
                ctx.lineCap = "round";
                for (const spread of [-0.22, 0, 0.22]) {
                    const a = out + spread + Math.sin(sec * 3 + spread * 5) * 0.03;
                    const sx = cx + Math.cos(out) * faceW * 0.04;
                    const sy = cy + Math.sin(out) * faceW * 0.04;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(sx + Math.cos(a) * faceW * 0.26, sy + Math.sin(a) * faceW * 0.26);
                    ctx.stroke();
                }
                ctx.restore();
            }

            const nose = lm[1];
            if (nose) {
                const sniff = 1 + Math.sin(sec * 7) * 0.05;
                drawHeart(ctx, nose.x * w, nose.y * h, faceW * 0.05 * sniff, {
                    fill: "#ff7fa8",
                    rotation: angle,
                });
            }

            // ---- telinga: ikut goyang pakai pegas ----
            const tx = top.x * w;
            const ty = top.y * h;

            let st = bunnyStates[f];
            // kalau wajah baru muncul lagi setelah hilang, mulai dari awal
            if (!st || t - st.t > 300) {
                st = bunnyStates[f] = {
                    t,
                    x: tx,
                    y: ty,
                    fw: faceW,
                    ang: angle,
                    sway: [
                        { x: 0, v: 0 },
                        { x: 0, v: 0 },
                    ],
                    tip: [
                        { x: 0, v: 0 },
                        { x: 0, v: 0 },
                    ],
                };
            }

            const dt = Math.min(0.05, Math.max(0.001, (t - st.t) / 1000));
            st.t = t;

            // haluskan posisi kepala (deteksi cuma ~20x/detik), sekalian bikin telinga agak tertinggal
            const a = 1 - Math.exp(-dt * 14);
            const px = st.x;
            st.x += (tx - st.x) * a;
            st.y += (ty - st.y) * a;
            st.fw += (faceW - st.fw) * a;
            st.ang += (angle - st.ang) * a;

            // kepala gerak ke kanan -> telinga terseret ke kiri (dan sebaliknya)
            const vx = (st.x - px) / dt / st.fw;
            const push = Math.max(-0.7, Math.min(0.7, -vx * 0.35));

            for (let i = 0; i < 2; i++) {
                // kekakuan tiap telinga sedikit beda biar gerakannya tidak kembar
                stepSpring(st.sway[i], push, 110 - i * 20, 8 + i * 1.5, dt);
                stepSpring(st.tip[i], push, 55 + i * 8, 4.5, dt);
            }

            const fw = st.fw;
            const sux = Math.cos(st.ang);
            const suy = Math.sin(st.ang);
            const baseX = st.x + suy * fw * 0.08;
            const baseY = st.y - sux * fw * 0.08;
            const len = fw * 0.72;
            const wid = fw * 0.25;

            ([-1, 1] as const).forEach((side, i) => {
                const idle = Math.sin(sec * 1.6 + i * 1.7 + f) * 0.05;
                // sesekali satu telinga berkedut
                const twitch =
                    Math.pow(Math.max(0, Math.sin(sec * 0.8 + i * 2.4 + f)), 14) * 0.3 * side;

                const ex = baseX + sux * side * fw * 0.27;
                const ey = baseY + suy * side * fw * 0.27;
                const bend = side * 0.12 + st.tip[i].x * 0.9 + idle * 1.5;

                drawEar(
                    ctx,
                    ex,
                    ey,
                    st.ang + side * 0.16 + idle + twitch + st.sway[i].x,
                    len,
                    wid,
                    bend
                );
            });
        });
    },
};

// ---------- efek Comic Book (CMYK Halftone) ----------

const comicBook: PixelFn = (d, w, h) => {
    const angles = [
        (15 * Math.PI) / 180,
        (75 * Math.PI) / 180,
        0,
        (45 * Math.PI) / 180,
    ];
    const cell = 4;

    const src = new Uint8ClampedArray(d);

    for (let i = 0; i < d.length; i += 4) {
        d[i] = 248;
        d[i + 1] = 248;
        d[i + 2] = 246;
    }

    const getSample = (x: number, y: number) => {
        const cx = Math.max(0, Math.min(w - 1, Math.round(x)));
        const cy = Math.max(0, Math.min(h - 1, Math.round(y)));
        const idx = (cy * w + cx) * 4;
        return [src[idx] / 255, src[idx + 1] / 255, src[idx + 2] / 255];
    };

    const rgbToCmyk = (r: number, g: number, b: number) => {
        const k = 1 - Math.max(r, g, b);
        if (k >= 0.999) return [0, 0, 0, 1];
        const c = (1 - r - k) / (1 - k);
        const m = (1 - g - k) / (1 - k);
        const y = (1 - b - k) / (1 - k);
        return [c, m, y, k];
    };

    const channels: {
        chIndex: number;
        angle: number;
        color: [number, number, number];
        radiusScale: number;
    }[] = [
            { chIndex: 0, angle: angles[0], color: [0, 174, 239], radiusScale: 0.62 },
            { chIndex: 1, angle: angles[1], color: [236, 0, 140], radiusScale: 0.62 },
            { chIndex: 2, angle: angles[2], color: [255, 242, 0], radiusScale: 0.58 },
            { chIndex: 3, angle: angles[3], color: [22, 22, 28], radiusScale: 0.68 },
        ];

    const diag = Math.hypot(w, h);
    const minGrid = Math.floor(-diag / cell);
    const maxGrid = Math.ceil(diag / cell);

    for (const ch of channels) {
        const cos = Math.cos(ch.angle);
        const sin = Math.sin(ch.angle);
        const [cr, cg, cb] = ch.color;

        for (let gy = minGrid; gy <= maxGrid; gy++) {
            for (let gx = minGrid; gx <= maxGrid; gx++) {
                const rx = gx * cell;
                const ry = gy * cell;

                const px = rx * cos - ry * sin + w * 0.5 - ((w * 0.5) * cos - (h * 0.5) * sin);
                const py = rx * sin + ry * cos + h * 0.5 - ((w * 0.5) * sin + (h * 0.5) * cos);

                if (px < -cell || px > w + cell || py < -cell || py > h + cell) continue;

                const [r, g, b] = getSample(px, py);
                const cmyk = rgbToCmyk(r, g, b);
                const amount = Math.min(1, cmyk[ch.chIndex] * 0.95);
                if (amount < 0.06) continue;

                const dotRadius = Math.sqrt(amount) * cell * ch.radiusScale;
                const rSq = dotRadius * dotRadius;
                const minX = Math.max(0, Math.floor(px - dotRadius));
                const maxX = Math.min(w - 1, Math.ceil(px + dotRadius));
                const minY = Math.max(0, Math.floor(py - dotRadius));
                const maxY = Math.min(h - 1, Math.ceil(py + dotRadius));

                for (let y = minY; y <= maxY; y++) {
                    const dy = y - py;
                    const dySq = dy * dy;
                    for (let x = minX; x <= maxX; x++) {
                        const dx = x - px;
                        if (dx * dx + dySq <= rSq) {
                            const idx = (y * w + x) * 4;
                            d[idx] = Math.min(d[idx], cr);
                            d[idx + 1] = Math.min(d[idx + 1], cg);
                            d[idx + 2] = Math.min(d[idx + 2], cb);
                        }
                    }
                }
            }
        }
    }
};

// ---------- efek Y2K Digicam ----------

const y2kGrade: PixelFn = (d) => {
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const l = (r * 77 + g * 150 + b * 29) >> 8;

        let nr = (r + (l - r) * 0.25 - 128) * 1.08 + 128;
        let ng = (g + (l - g) * 0.25 - 128) * 1.08 + 128;
        let nb = (b + (l - b) * 0.25 - 128) * 1.08 + 128;

        nr = nr * 1.06 + 12;
        ng = ng + 6;
        nb = nb * 0.9 + 4;

        const n = (Math.random() - 0.5) * 28;
        d[i] = nr + n;
        d[i + 1] = ng + n;
        d[i + 2] = nb + n;
    }
};

const softGlow: Effect = (() => {
    let small: HTMLCanvasElement | undefined;
    let sctx: CanvasRenderingContext2D | null = null;

    return {
        id: "soft-glow",
        name: "Soft Glow",
        draw(ctx, video, w, h) {
            if (!small) {
                small = document.createElement("canvas");
                sctx = small.getContext("2d");
            }
            if (!sctx) return;

            const sw = Math.max(1, Math.round(w / 8));
            const sh = Math.max(1, Math.round(h / 8));
            if (small.width !== sw || small.height !== sh) {
                small.width = sw;
                small.height = sh;
            }
            sctx.drawImage(video, 0, 0, sw, sh);

            ctx.drawImage(video, 0, 0, w, h);

            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            ctx.globalAlpha = 0.35;
            ctx.drawImage(small, 0, 0, w, h);

            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = 0.4;
            ctx.drawImage(small, 0, 0, w, h);

            ctx.globalCompositeOperation = "soft-light";
            ctx.globalAlpha = 1;
            ctx.fillStyle = "rgba(255, 170, 200, 0.28)";
            ctx.fillRect(0, 0, w, h);

            ctx.restore();
        },
    };
})();

const y2kOverlay: Overlay = (ctx, w, h) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    vg.addColorStop(0, "rgba(0, 0, 0, 0)");
    vg.addColorStop(1, "rgba(0, 0, 0, 0.4)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `'${String(now.getFullYear()).slice(2)} ${pad(now.getMonth() + 1)} ${pad(now.getDate())}`;
    const size = Math.round(h * 0.05);

    ctx.font = `bold ${size}px ui-monospace, "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#ff9a2e";
    ctx.shadowColor = "rgba(255, 120, 0, 0.8)";
    ctx.shadowBlur = size * 0.35;
    ctx.fillText(stamp, w - size, h - size);

    ctx.restore();
};

// ---------- helper bersama efek wajah baru (Flower Crown, Coquette Bow, Sparkle Eyes) ----------

type FaceFrame = {
    faceW: number;
    angle: number;
    ux: number;
    uy: number;
    nx: number;
    ny: number;
    tx: number; // puncak dahi (landmark 10)
    ty: number;
};

function faceFrame(lm: FacePoint[], w: number, h: number): FaceFrame | null {
    const top = lm[10];
    const left = lm[234];
    const right = lm[454];
    if (!top || !left || !right) return null;

    const dx = (right.x - left.x) * w;
    const dy = (right.y - left.y) * h;
    const faceW = Math.hypot(dx, dy);
    if (!faceW) return null;

    const ux = dx / faceW;
    const uy = dy / faceW;
    return {
        faceW,
        angle: Math.atan2(dy, dx),
        ux,
        uy,
        nx: uy,
        ny: -ux,
        tx: top.x * w,
        ty: top.y * h,
    };
}

// geser titik (ox, oy): u = ke samping, up = ke atas kepala (satuan: lebar wajah)
const place = (f: FaceFrame, ox: number, oy: number, u: number, up: number): [number, number] => [
    ox + (f.ux * u + f.nx * up) * f.faceW,
    oy + (f.uy * u + f.ny * up) * f.faceW,
];

const SPARKLE_COLORS = ["#ffffff", "#fff3a6", "#ffc9de", "#c9ecff"];

// bintang 4 sudut dengan sisi melengkung ke dalam
function drawSparkle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    fill: string,
    rotation = 0
) {
    if (size < 0.5) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    const r = size / 2;
    const p = r * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(p, -p, r, 0);
    ctx.quadraticCurveTo(p, p, 0, r);
    ctx.quadraticCurveTo(-p, p, -r, 0);
    ctx.quadraticCurveTo(-p, -p, 0, -r);
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(255, 140, 190, 0.85)";
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// 0..1, dikuadratkan supaya lebih lama kecil lalu mekar sebentar
const twinkle = (sec: number, phase: number, speed = 2.4) => {
    const k = 0.5 + 0.5 * Math.sin(sec * speed + phase);
    return k * k;
};

// ---------- efek Flower Crown ----------

const FLOWER_PALETTE = [
    { petal: "#ffd1e3", center: "#ffd966" },
    { petal: "#ffffff", center: "#ffb3cf" },
    { petal: "#d9c9ff", center: "#fff1a8" },
    { petal: "#ffb8cc", center: "#fff4c2" },
] as const;

// u = geser ke samping, up = tinggi dari puncak dahi, size = diameter bunga (relatif lebar wajah)
const CROWN = [
    { u: -0.66, up: -0.12, size: 0.13, pal: 0 },
    { u: -0.52, up: -0.02, size: 0.17, pal: 1 },
    { u: -0.34, up: 0.05, size: 0.14, pal: 2 },
    { u: -0.17, up: 0.09, size: 0.19, pal: 3 },
    { u: 0.0, up: 0.1, size: 0.15, pal: 0 },
    { u: 0.17, up: 0.09, size: 0.19, pal: 2 },
    { u: 0.34, up: 0.05, size: 0.14, pal: 1 },
    { u: 0.52, up: -0.02, size: 0.17, pal: 3 },
    { u: 0.66, up: -0.12, size: 0.13, pal: 0 },
] as const;

function drawFlower(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    palette: { petal: string; center: string },
    rotation: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    const petals = 6;
    const dist = size * 0.3;
    const pr = size * 0.22;

    ctx.fillStyle = palette.petal;
    ctx.strokeStyle = "rgba(214, 120, 160, 0.45)";
    ctx.lineWidth = Math.max(1, size * 0.035);
    for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.fillStyle = palette.center;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.17, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#a8dcae";
    ctx.strokeStyle = "#78bd86";
    ctx.lineWidth = Math.max(1, len * 0.06);
    ctx.beginPath();
    ctx.ellipse(0, 0, len / 2, len * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

const flowerCrown: Effect = {
    id: "flower-crown",
    name: "Flower Crown",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t) {
        ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            if (!fr) return;

            const pts = CROWN.map((c, i) => {
                const bob = Math.sin(sec * 1.8 + i * 0.7 + f) * 0.008;
                const [x, y] = place(fr, fr.tx, fr.ty, c.u, c.up + bob);
                return { x, y, c };
            });

            // daun di sela bunga (digambar duluan supaya ada di belakang bunga)
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i];
                const b = pts[i + 1];
                const seg = Math.atan2(b.y - a.y, b.x - a.x);
                const flip = i % 2 ? 1 : -1;
                const [lx, ly] = place(fr, (a.x + b.x) / 2, (a.y + b.y) / 2, 0, 0.035 * flip);
                drawLeaf(ctx, lx, ly, fr.faceW * 0.11, seg + flip * 0.6);
            }

            pts.forEach((p, i) => {
                const pulse = 1 + Math.sin(sec * 2.4 + i) * 0.04;
                drawFlower(
                    ctx,
                    p.x,
                    p.y,
                    fr.faceW * p.c.size * pulse,
                    FLOWER_PALETTE[p.c.pal],
                    sec * 0.35 + i
                );
            });
        });
    },
};

// ---------- efek Coquette Bow ----------

// S = setengah lebar pita; titik (0,0) = simpul tengah
function drawBow(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, rotation: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const outline = "#f08cb0";
    const lw = Math.max(1.5, S * 0.045);

    // pita menjuntai (paling belakang)
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side, 1);
        ctx.fillStyle = "#ff9fc2";
        ctx.strokeStyle = outline;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(-0.04 * S, 0.1 * S);
        ctx.lineTo(-0.52 * S, 1.0 * S);
        ctx.lineTo(-0.4 * S, 0.88 * S);
        ctx.lineTo(-0.24 * S, 1.06 * S);
        ctx.lineTo(0, 0.16 * S);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // dua loop
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side, 1);
        ctx.fillStyle = "#ffb6cf";
        ctx.strokeStyle = outline;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-0.25 * S, -0.5 * S, -0.8 * S, -0.6 * S, -1.0 * S, -0.38 * S);
        ctx.bezierCurveTo(-1.14 * S, -0.12 * S, -1.12 * S, 0.22 * S, -0.98 * S, 0.42 * S);
        ctx.bezierCurveTo(-0.8 * S, 0.62 * S, -0.25 * S, 0.48 * S, 0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // lipatan satin
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = Math.max(1, S * 0.05);
        ctx.beginPath();
        ctx.moveTo(-0.2 * S, -0.1 * S);
        ctx.quadraticCurveTo(-0.55 * S, -0.3 * S, -0.85 * S, -0.22 * S);
        ctx.stroke();
        ctx.restore();
    }

    // simpul
    ctx.fillStyle = "#ff8fb4";
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(0, 0.02 * S, 0.17 * S, 0.22 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

// posisi sparkle di sekitar pita (relatif titik pita, satuan lebar wajah)
const BOW_SPARKLES = [
    { u: -0.4, up: 0.2, size: 0.07, phase: 0 },
    { u: 0.36, up: 0.26, size: 0.05, phase: 2.1 },
    { u: 0.08, up: 0.34, size: 0.04, phase: 4.2 },
] as const;

const coquetteBow: Effect = {
    id: "coquette-bow",
    name: "Coquette Bow",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t) {
        ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            if (!fr) return;

            const [bx, by] = place(fr, fr.tx, fr.ty, -0.46, 0.03);
            const sway = Math.sin(sec * 1.6 + f) * 0.04;
            const pulse = 1 + Math.sin(sec * 2.2 + f) * 0.015;

            drawBow(ctx, bx, by, fr.faceW * 0.3 * pulse, fr.angle - 0.28 + sway);

            BOW_SPARKLES.forEach((s, i) => {
                const [x, y] = place(fr, bx, by, s.u, s.up);
                const k = twinkle(sec, s.phase + f);
                drawSparkle(
                    ctx,
                    x,
                    y,
                    s.size * fr.faceW * (0.2 + 0.8 * k),
                    SPARKLE_COLORS[(i + 1) % SPARKLE_COLORS.length],
                    fr.angle + Math.sin(sec + s.phase) * 0.15
                );
            });
        });
    },
};

// ---------- efek Sparkle Eyes ----------

// out = geser ke arah luar mata, up = geser ke atas (satuan lebar wajah)
const EYE_SPARKLES = [
    { out: 0.2, up: 0.16, size: 0.1, phase: 0 },
    { out: 0.32, up: 0.02, size: 0.05, phase: 1.7 },
    { out: 0.05, up: -0.14, size: 0.06, phase: 3.1 },
    { out: 0.45, up: -0.12, size: 0.035, phase: 4.6 },
] as const;

const sparkleEyes: Effect = {
    id: "sparkle-eyes",
    name: "Sparkle Eyes",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t) {
        ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            if (!fr) return;

            // dir: arah "keluar" sepanjang lebar wajah (-1 = sisi u negatif, 1 = sisi u positif)
            const eyes = [
                { outer: lm[33], inner: lm[133], iris: lm[468], dir: -1 },
                { outer: lm[263], inner: lm[362], iris: lm[473], dir: 1 },
            ];

            eyes.forEach((e, ei) => {
                if (!e.outer || !e.inner) return;
                const cx = ((e.outer.x + e.inner.x) / 2) * w;
                const cy = ((e.outer.y + e.inner.y) / 2) * h;

                EYE_SPARKLES.forEach((s, i) => {
                    const [x, y] = place(fr, cx, cy, s.out * e.dir, s.up);
                    const k = twinkle(sec, s.phase + ei * 1.3 + f);
                    drawSparkle(
                        ctx,
                        x,
                        y,
                        s.size * fr.faceW * (0.2 + 0.8 * k),
                        SPARKLE_COLORS[(i + ei) % SPARKLE_COLORS.length],
                        fr.angle + Math.sin(sec * 1.5 + s.phase) * 0.15
                    );
                });

                // kilau kecil di dalam mata (titik iris cuma ada kalau modelnya 478 landmark)
                if (e.iris) {
                    const [gx, gy] = place(fr, e.iris.x * w, e.iris.y * h, -0.012, 0.015);
                    const k = twinkle(sec, 1.1 + ei, 3);
                    drawSparkle(ctx, gx, gy, fr.faceW * 0.045 * (0.6 + 0.4 * k), "#ffffff", fr.angle);
                }
            });
        });
    },
};

// ---------- efek Spinning Blur (rotational blur fullscreen) ----------

const SPIN_LAYERS = 12;

const spinBlur: Effect = {
    id: "spin-blur",
    name: "Spinning Blur",
    draw(ctx, video, w, h, t) {
        const sec = t / 1000;
        // seberapa lebar "sapuan" putarannya, naik turun pelan
        const spread = 0.1 + 0.3 * (0.5 + 0.5 * Math.sin(sec * 1.1));
        // arah putaran ayun kiri-kanan
        const base = Math.sin(sec * 0.7) * 0.15;
        const zoom = 1.15 + spread * 0.6; // zoom sedikit supaya sudut tidak bolong

        // alas tanpa rotasi, jaga-jaga kalau ada sudut yang kosong
        ctx.drawImage(video, 0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        for (let i = 0; i < SPIN_LAYERS; i++) {
            const a = base + (i / (SPIN_LAYERS - 1) - 0.5) * spread * 2;
            ctx.save();
            ctx.rotate(a);
            ctx.scale(zoom, zoom);
            // alpha 1/(i+1) = rata-rata semua layer (blur merata)
            ctx.globalAlpha = 1 / (i + 1);
            ctx.drawImage(video, -w / 2, -h / 2, w, h);
            ctx.restore();
        }
        ctx.restore();
    },
};

// ---------- efek Aquarium (fullscreen) ----------

type Fish = {
    y: number; // posisi vertikal (0-1)
    size: number; // relatif tinggi canvas
    speed: number;
    phase: number;
    dir: 1 | -1;
    body: string;
    fin: string;
};

const FISHES: Fish[] = [
    { y: 0.22, size: 0.05, speed: 0.045, phase: 0.0, dir: 1, body: "#ff9a2e", fin: "#ffd08a" },
    { y: 0.38, size: 0.035, speed: 0.07, phase: 0.45, dir: -1, body: "#22d3ee", fin: "#a5f3fc" },
    { y: 0.55, size: 0.06, speed: 0.035, phase: 0.7, dir: 1, body: "#ff4d8d", fin: "#ffb3cf" },
    { y: 0.7, size: 0.04, speed: 0.055, phase: 0.2, dir: -1, body: "#facc15", fin: "#fef08a" },
    { y: 0.12, size: 0.028, speed: 0.08, phase: 0.85, dir: 1, body: "#a78bfa", fin: "#ddd6fe" },
];

function drawFish(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    s: number,
    dir: 1 | -1,
    body: string,
    fin: string,
    wag: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.lineJoin = "round";

    const w = wag * s * 0.35;

    // ekor
    ctx.fillStyle = fin;
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, 0);
    ctx.lineTo(-s * 1.5, -s * 0.5 + w);
    ctx.lineTo(-s * 1.35, w);
    ctx.lineTo(-s * 1.5, s * 0.5 + w);
    ctx.closePath();
    ctx.fill();

    // sirip atas
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.38);
    ctx.quadraticCurveTo(0, -s * 0.9, s * 0.3, -s * 0.4);
    ctx.closePath();
    ctx.fill();

    // badan
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();

    // garis badan
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath();
    ctx.arc(-s * 0.15, 0, s * 0.42, -0.9, 0.9);
    ctx.stroke();

    // mata
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s * 0.55, -s * 0.12, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(s * 0.59, -s * 0.12, s * 0.07, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

const aquarium: Effect = {
    id: "aquarium",
    name: "Aquarium",
    draw(ctx, video, w, h, t) {
        const sec = t / 1000;
        const vw = video.videoWidth || w;
        const vh = video.videoHeight || h;

        // 1) video bergelombang (dipotong strip horizontal, tiap strip digeser)
        const strips = 32;
        const sh = vh / strips;
        const dh = h / strips;
        for (let i = 0; i < strips; i++) {
            const off = Math.sin(sec * 1.6 + i * 0.35) * w * 0.008;
            ctx.drawImage(video, 0, i * sh, vw, sh, off - w * 0.02, i * dh, w * 1.04, dh + 1);
        }

        // 2) warna air: terang di atas, gelap di bawah
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        const water = ctx.createLinearGradient(0, 0, 0, h);
        water.addColorStop(0, "#9eeeff");
        water.addColorStop(0.55, "#2aa7c9");
        water.addColorStop(1, "#0a4a7a");
        ctx.fillStyle = water;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // 3) sinar matahari yang goyang
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let k = 0; k < 5; k++) {
            const x0 = w * (0.08 + k * 0.22) + Math.sin(sec * 0.4 + k * 1.7) * w * 0.05;
            const rw = w * (0.06 + 0.03 * Math.sin(sec * 0.8 + k));
            const slant = w * 0.18;
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, "rgba(200, 245, 255, 0.28)");
            g.addColorStop(1, "rgba(200, 245, 255, 0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x0, 0);
            ctx.lineTo(x0 + rw, 0);
            ctx.lineTo(x0 + rw + slant, h);
            ctx.lineTo(x0 + slant - rw * 0.5, h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // 4) ikan berenang
        for (const f of FISHES) {
            const p = (sec * f.speed + f.phase) % 1;
            const x = f.dir > 0 ? -0.2 * w + p * 1.4 * w : 1.2 * w - p * 1.4 * w;
            const y = f.y * h + Math.sin(sec * 1.3 + f.phase * 10) * h * 0.015;
            const wag = Math.sin(sec * 8 + f.phase * 20);
            drawFish(ctx, x, y, f.size * h, f.dir, f.body, f.fin, wag);
        }

        // 5) rumput laut di dasar
        ctx.save();
        ctx.lineCap = "round";
        const blades = 9;
        for (let i = 0; i < blades; i++) {
            const bx = (w * (i + 0.5)) / blades + (rand(i + 3) - 0.5) * w * 0.04;
            const len = h * (0.14 + rand(i + 30) * 0.12);
            const sway = Math.sin(sec * 1.4 + i * 0.9) * len * 0.25;
            ctx.strokeStyle = i % 2 ? "rgba(34,160,98,0.85)" : "rgba(60,190,120,0.85)";
            ctx.lineWidth = Math.max(3, w * 0.012);
            ctx.beginPath();
            ctx.moveTo(bx, h + 4);
            ctx.bezierCurveTo(
                bx + sway,
                h - len * 0.35,
                bx - sway,
                h - len * 0.7,
                bx + sway * 0.6,
                h - len
            );
            ctx.stroke();
        }
        ctx.restore();

        // 6) gelembung naik
        ctx.save();
        for (let i = 0; i < 22; i++) {
            const r = (0.006 + rand(i + 1) * 0.014) * h;
            const p = (sec * (0.06 + rand(i + 50) * 0.1) + rand(i + 90)) % 1;
            const y = h + r - p * (h + r * 2);
            const x = rand(i + 7) * w + Math.sin(sec * 2 + i) * w * 0.01;

            ctx.fillStyle = "rgba(255,255,255,0.12)";
            ctx.strokeStyle = "rgba(255,255,255,0.65)";
            ctx.lineWidth = Math.max(1, r * 0.15);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.arc(x, y, r * 0.65, Math.PI * 1.1, Math.PI * 1.45);
            ctx.stroke();
        }
        ctx.restore();

        // 7) vignette biar dalam
        const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, Math.hypot(w, h) / 2);
        vg.addColorStop(0, "rgba(0, 20, 40, 0)");
        vg.addColorStop(1, "rgba(0, 20, 40, 0.45)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
    },
};

// tetes air: menampilkan versi video yang terbalik & mengecil, seperti lensa
function drawRainDrop(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    x: number,
    y: number,
    r: number,
    w: number,
    h: number
) {
    const ry = r * 1.25;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(-0.7, -0.7);
    ctx.drawImage(video, -x, -y, w, h);
    ctx.restore();

    ctx.save();
    // bayangan di tepi tetes
    const g = ctx.createRadialGradient(x - r * 0.2, y - ry * 0.25, r * 0.1, x, y, ry);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0.05)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();

    // kilau
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - ry * 0.45, r * 0.25, r * 0.17, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

const rainOnGlass: Effect = (() => {
    let small: HTMLCanvasElement | undefined;
    let sctx: CanvasRenderingContext2D | null = null;

    return {
        id: "rain-glass",
        name: "Rain on Glass",
        draw(ctx, video, w, h, t) {
            if (!small) {
                small = document.createElement("canvas");
                sctx = small.getContext("2d");
            }
            if (!sctx) return;

            const sec = t / 1000;

            // 1) latar buram (kaca berembun): downscale lalu di-upscale
            const sw = Math.max(1, Math.round(w / 10));
            const sh = Math.max(1, Math.round(h / 10));
            if (small.width !== sw || small.height !== sh) {
                small.width = sw;
                small.height = sh;
            }
            sctx.drawImage(video, 0, 0, sw, sh);

            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(small, 0, 0, w, h);
            ctx.restore();

            // warna dingin + embun tipis
            ctx.fillStyle = "rgba(20, 45, 80, 0.2)";
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "rgba(210, 225, 245, 0.06)";
            ctx.fillRect(0, 0, w, h);

            // 2) tetes diam: muncul, bertahan, hilang, lalu pindah posisi
            for (let i = 0; i < 40; i++) {
                const c = sec * 0.04 + rand(i + 400);
                const cycle = Math.floor(c);
                const q = c - cycle;
                const seed = i * 13 + cycle * 101;
                const alpha = Math.min(1, q / 0.1, (1 - q) / 0.15);

                const r = (0.006 + rand(seed + 2) * 0.012) * h;
                const x = rand(seed + 1) * w;
                const y = rand(seed + 3) * h;

                ctx.save();
                ctx.globalAlpha = Math.max(0, alpha);
                drawRainDrop(ctx, video, x, y, r, w, h);
                ctx.restore();
            }

            // 3) tetes besar yang meluncur turun sambil ninggalin jejak
            for (let i = 0; i < 8; i++) {
                const speed = 0.05 + rand(i + 300) * 0.08;
                const p = (sec * speed + rand(i + 310)) % 1;
                const stutter = Math.sin(sec * 3 + i * 2) * 0.01;
                const y = (p * 1.3 - 0.15 + stutter) * h;
                const x = rand(i + 320) * w + Math.sin(y * 0.02 + i) * w * 0.006;
                const r = (0.014 + rand(i + 330) * 0.012) * h;
                const trail = h * (0.1 + rand(i + 340) * 0.08);

                ctx.save();
                ctx.strokeStyle = "rgba(255,255,255,0.1)";
                ctx.lineWidth = r * 0.7;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(x, y - trail);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.restore();

                drawRainDrop(ctx, video, x, y, r, w, h);
            }
        },
    };
})();

// ---------- efek VHS (fullscreen) ----------

const vhs: PixelFn = (() => {
    let copy = new Uint8ClampedArray(0);

    return (d, w, h, t) => {
        if (copy.length !== d.length) copy = new Uint8ClampedArray(d.length);
        copy.set(d);

        const sec = t / 1000;
        const frame = Math.floor(t / 50);
        // pita tracking yang turun pelan dari atas ke bawah
        const barY = ((sec * 0.18) % 1.25 - 0.1) * h;
        const barH = h * 0.07;
        const base = Math.max(1, Math.round(w / 200));
        const clamp = (x: number) => (x < 0 ? 0 : x >= w ? w - 1 : x);

        for (let y = 0; y < h; y++) {
            const inBar = Math.abs(y - barY) < barH;

            // goyang horizontal halus, plus glitch acak di beberapa baris
            let shift = Math.round(Math.sin(y * 0.04 + sec * 2.5) * w * 0.002);
            if (inBar) {
                shift += Math.round((rand(y + frame) - 0.5) * w * 0.08);
            } else if (rand(Math.floor(y / 3) + frame * 7) > 0.995) {
                shift += Math.round((rand(y + frame * 3) - 0.5) * w * 0.05);
            }

            const split = inBar ? base * 3 : base; // chroma bleed
            const dim = y % 2 ? 0.86 : 1; // scanline
            const row = y * w;

            for (let x = 0; x < w; x++) {
                const i = (row + x) * 4;
                const r = copy[(row + clamp(x + shift + split)) * 4];
                const g = copy[(row + clamp(x + shift)) * 4 + 1];
                const b = copy[(row + clamp(x + shift - split)) * 4 + 2];
                const l = (r * 77 + g * 150 + b * 29) >> 8;
                const n = (Math.random() - 0.5) * (inBar ? 110 : 26);

                d[i] = ((r + (l - r) * 0.2 - 128) * 1.1 + 128 + 8) * dim + n;
                d[i + 1] = ((g + (l - g) * 0.2 - 128) * 1.1 + 128) * dim + n;
                d[i + 2] = ((b + (l - b) * 0.2 - 128) * 1.1 + 128 + 6) * dim + n;
            }
        }
    };
})();

const vhsOverlay: Overlay = (ctx, w, h, t) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const size = Math.round(h * 0.06);
    const pad = (n: number) => String(n).padStart(2, "0");
    const secs = Math.floor(t / 1000);
    const counter = `SP 0:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
    const now = new Date();
    const date = `${now.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}. ${pad(
        now.getDate()
    )} ${now.getFullYear()}`;

    ctx.font = `bold ${size}px ui-monospace, "Courier New", monospace`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0, 120, 255, 0.9)";
    ctx.shadowBlur = size * 0.3;

    ctx.textAlign = "left";
    ctx.fillText("PLAY ▶", size, size * 0.8);
    ctx.textBaseline = "bottom";
    ctx.fillText(counter, size, h - size * 0.8);

    ctx.textAlign = "right";
    ctx.fillText(date, w - size, h - size * 0.8);

    ctx.restore();
};

export const effects: Effect[] = [
    filterEffect("normal", "Normal", "none"),
    headHearts,
    bunnyEars,
    flowerCrown,
    coquetteBow,
    sparkleEyes,
    spinBlur,
    aquarium,
    rainOnGlass,
    pixelEffect("vhs", "VHS", vhs, { maxW: 480, overlay: vhsOverlay }), // <-- baru
    pixelEffect("y2k", "Y2K Digicam", y2kGrade, { maxW: 560, overlay: y2kOverlay }),
    softGlow,
    filterEffect("bw", "Black & White", "grayscale(1)"),
    filterEffect("vintage", "Vintage", "sepia(0.8) contrast(1.1) saturate(1.3)"),
    pixelEffect("comic", "Comic Book", comicBook, { maxW: 560, smooth: false }),
    filterEffect("pop", "Pop Art", "saturate(3) contrast(1.4)"),
    filterEffect("xray", "X-Ray", "invert(1) grayscale(1)"),
    filterEffect("disco", "Disco", "hue-rotate(90deg) saturate(2)"),
    {
        id: "mirror-left",
        name: "Left Mirror",
        draw(ctx, video, w, h) {
            ctx.drawImage(video, 0, 0, w, h);
            ctx.save();
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, w / 2, h, 0, 0, w / 2, h);
            ctx.restore();
        },
    },
    pixelEffect("pixelate", "Pixelate", undefined, { maxW: 64, smooth: false }),
    pixelEffect("thermal", "Thermal", thermal),
    pixelEffect("night-vision", "Night Vision", nightVision),
    pixelEffect("glitch", "Glitch", glitch),
];