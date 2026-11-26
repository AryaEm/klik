import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type Effect = {
    id: string;
    name: string;
    preload?: () => void;
    draw: (
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        w: number,
        h: number,
        t: number,
        overlayOnly?: boolean // true = jangan gambar video, cuma dekorasi (dipakai saat digabung)
    ) => void;
};

const filterEffect = (id: string, name: string, filter: string): Effect => ({
    id,
    name,
    draw(ctx, video, w, h) {
        ctx.filter = filter;
        ctx.drawImage(video, 0, 0, w, h);
        ctx.filter = "none";
    },
});

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

const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";
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


const HEART_PINKS = ["#ff2e7e", "#ff4d8d", "#ff6fa5"];

type HeartStyle = {
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    alpha?: number;
    rotation?: number;
};

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
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
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
    sway: [Spring, Spring];
    tip: [Spring, Spring];
};

const bunnyStates: BunnyState[] = [];

const stepSpring = (s: Spring, target: number, k: number, c: number, dt: number) => {
    const a = (target - s.x) * k - s.v * c;
    s.v += a * dt;
    s.x += s.v * dt;
};

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
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
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

            const tx = top.x * w;
            const ty = top.y * h;

            let st = bunnyStates[f];
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

            const a = 1 - Math.exp(-dt * 14);
            const px = st.x;
            st.x += (tx - st.x) * a;
            st.y += (ty - st.y) * a;
            st.fw += (faceW - st.fw) * a;
            st.ang += (angle - st.ang) * a;

            const vx = (st.x - px) / dt / st.fw;
            const push = Math.max(-0.7, Math.min(0.7, -vx * 0.35));

            for (let i = 0; i < 2; i++) {
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
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
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
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
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
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
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

// ---------- efek ASCII Art (fullscreen) ----------

const ASCII_RAMP = " .:-=+*#%@"; // gelap -> terang

// warna hijau Matrix per level karakter, dihitung sekali
const ASCII_GREENS = Array.from({ length: ASCII_RAMP.length }, (_, i) => {
    const k = i / (ASCII_RAMP.length - 1);
    return `rgb(${Math.round(k * k * 120)}, ${Math.round(70 + k * 185)}, ${Math.round(k * 90)})`;
});

const asciiEffect = (id: string, name: string, mode: "green" | "color"): Effect => {
    let small: HTMLCanvasElement | undefined;
    let sctx: CanvasRenderingContext2D | null = null;

    return {
        id,
        name,
        draw(ctx, video, w, h) {
            if (!small) {
                small = document.createElement("canvas");
                sctx = small.getContext("2d", { willReadFrequently: true });
            }
            if (!sctx) return;

            // ukuran sel: tinggi ~ h/60, lebar 0.6x tinggi (proporsi huruf monospace)
            const cell = Math.max(6, Math.round(h / 120));
            const cw = cell * 0.6;
            const cols = Math.max(1, Math.floor(w / cw));
            const rows = Math.max(1, Math.floor(h / cell));

            if (small.width !== cols || small.height !== rows) {
                small.width = cols;
                small.height = rows;
            }
            sctx.drawImage(video, 0, 0, cols, rows);
            const d = sctx.getImageData(0, 0, cols, rows).data;

            ctx.save();
            // kalau canvas sedang di-mirror, reset transform supaya huruf tidak terbalik,
            // lalu baca kolom dari kanan ke kiri supaya gambarnya tetap ter-mirror
            const mirrored = ctx.getTransform().a < 0;
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            ctx.fillStyle = mode === "green" ? "#020b05" : "#0b0b10";
            ctx.fillRect(0, 0, w, h);

            ctx.font = `bold ${cell}px ui-monospace, "Courier New", monospace`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";

            const maxIdx = ASCII_RAMP.length - 1;
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const sx = mirrored ? cols - 1 - x : x;
                    const i = (y * cols + sx) * 4;
                    const l = luma(d, i);
                    const idx = Math.min(maxIdx, Math.floor((l / 256) * ASCII_RAMP.length));
                    if (idx === 0) continue;

                    ctx.fillStyle =
                        mode === "green"
                            ? ASCII_GREENS[idx]
                            : `rgb(${Math.min(255, d[i] * 1.25)}, ${Math.min(255, d[i + 1] * 1.25)}, ${Math.min(255, d[i + 2] * 1.25)})`;
                    ctx.fillText(ASCII_RAMP[idx], x * cw, y * cell);
                }
            }

            ctx.restore();
        },
    };
};

// ---------- efek Face Gems (bintang pipi + permata) ----------

const GEM_COLORS = [
    { top: "#ffe3f1", mid: "#ff7fb5", bot: "#d63a82" },
    { top: "#e6fbff", mid: "#5fdcf5", bot: "#1e9bc0" },
    { top: "#fff7cf", mid: "#ffd34d", bot: "#d99a12" },
    { top: "#efe3ff", mid: "#b794ff", bot: "#7a4fd1" },
    { top: "#e4fff0", mid: "#4ade80", bot: "#15803d" },
] as const;

// permata bersisi (facet): titik (0,0) = tengah permata
function drawGem(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    c: { top: string; mid: string; bot: string },
    rotation = 0,
    alpha = 1
) {
    if (size < 0.5) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const r = size / 2;
    const body = new Path2D();
    body.moveTo(-0.55 * r, -0.7 * r);
    body.lineTo(0.55 * r, -0.7 * r);
    body.lineTo(r, -0.1 * r);
    body.lineTo(0, r);
    body.lineTo(-r, -0.1 * r);
    body.closePath();

    ctx.shadowColor = c.mid;
    ctx.shadowBlur = size * 0.55;

    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, c.top);
    g.addColorStop(0.45, c.mid);
    g.addColorStop(1, c.bot);
    ctx.fillStyle = g;
    ctx.fill(body);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.lineWidth = Math.max(0.8, size * 0.045);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-r, -0.1 * r);
    ctx.lineTo(r, -0.1 * r);
    ctx.moveTo(-0.55 * r, -0.7 * r);
    ctx.lineTo(-0.25 * r, -0.1 * r);
    ctx.lineTo(0, r);
    ctx.moveTo(0.55 * r, -0.7 * r);
    ctx.lineTo(0.25 * r, -0.1 * r);
    ctx.lineTo(0, r);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 220, 240, 0.65)";
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.stroke(body);

    ctx.restore();
}

const FOREHEAD_GEMS = [
    { u: 0, up: 0.045, size: 0.105, ci: 0, phase: 0 },
    { u: -0.14, up: 0.005, size: 0.056, ci: 1, phase: 1.3 },
    { u: 0.14, up: 0.005, size: 0.056, ci: 2, phase: 2.2 },
    { u: -0.26, up: -0.065, size: 0.04, ci: 3, phase: 3.4 },
    { u: 0.26, up: -0.065, size: 0.04, ci: 4, phase: 4.1 },
] as const;

const EYE_GEMS = [
    { out: 0.08, up: -0.045, size: 0.046, ci: 1, phase: 0.6 },
    { out: 0.135, up: -0.125, size: 0.036, ci: 0, phase: 2.0 },
    { out: 0.16, up: -0.215, size: 0.052, ci: 3, phase: 3.3 },
] as const;

const CHEEK_STARS = [
    { out: 0.0, up: 0.0, size: 0.145, phase: 0, ci: 1 },
    { out: 0.095, up: 0.085, size: 0.072, phase: 1.9, ci: 0 },
    { out: -0.075, up: -0.085, size: 0.055, phase: 3.6, ci: 3 },
] as const;

const faceGems: Effect = {
    id: "face-gems",
    name: "Face Gems",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            if (!fr) return;

            const gem = (
                ox: number,
                oy: number,
                u: number,
                up: number,
                size: number,
                ci: number,
                phase: number
            ) => {
                // gerak micro-bounce & goyang halus per permata
                const wobbleU = Math.sin(sec * 3.8 + phase + f) * 0.012;
                const wobbleUp = Math.cos(sec * 4.5 + phase * 1.4) * 0.012;
                const [x, y] = place(fr, ox, oy, u + wobbleU, up + wobbleUp);

                const k = twinkle(sec, phase + f, 3.2);
                const beat = 1 + Math.sin(sec * 6 + phase) * 0.12 + k * 0.14;
                const s = size * fr.faceW * beat;
                const gemRot = fr.angle + Math.sin(sec * 3.2 + phase) * 0.22;

                drawGem(ctx, x, y, s, GEM_COLORS[ci], gemRot, 0.96);

                if (k > 0.35) {
                    drawSparkle(
                        ctx,
                        x - s * 0.18,
                        y - s * 0.25,
                        s * 1.45 * (k - 0.25),
                        "#ffffff",
                        gemRot + sec * 1.8
                    );
                }
            };

            const glabella = lm[9];
            const fx = glabella ? (fr.tx + glabella.x * w) / 2 : fr.tx;
            const fy = glabella ? (fr.ty + glabella.y * h) / 2 : fr.ty;
            FOREHEAD_GEMS.forEach((g) => gem(fx, fy, g.u, g.up, g.size, g.ci, g.phase));

            for (const [idx, dir] of [
                [33, -1],
                [263, 1],
            ] as const) {
                const eye = lm[idx];
                if (!eye) continue;
                EYE_GEMS.forEach((g) =>
                    gem(eye.x * w, eye.y * h, g.out * dir, g.up, g.size, g.ci, g.phase + dir)
                );
            }

            for (const [idx, dir] of [
                [205, -1],
                [425, 1],
            ] as const) {
                const c = lm[idx];
                if (!c) continue;
                CHEEK_STARS.forEach((s, i) => {
                    const [x, y] = place(fr, c.x * w, c.y * h, s.out * dir, s.up);
                    const k = twinkle(sec, s.phase + dir + f, 3.4);
                    drawSparkle(
                        ctx,
                        x,
                        y,
                        s.size * fr.faceW * (0.5 + 0.65 * k),
                        SPARKLE_COLORS[(s.ci + i + Math.floor(sec * 2)) % SPARKLE_COLORS.length],
                        fr.angle + sec * 1.6 + s.phase
                    );
                });
            }

            for (let p = 0; p < 8; p++) {
                const cycle = (sec * 0.55 + p * 0.125 + f * 0.3) % 1;
                const side = p % 2 === 0 ? -1 : 1;
                const spreadU = side * (0.35 + cycle * 0.45);
                const liftUp = -0.35 + cycle * 0.95;
                const [px, py] = place(fr, fr.tx, fr.ty, spreadU, liftUp);
                const alpha = cycle < 0.2 ? cycle / 0.2 : 1 - (cycle - 0.2) / 0.8;
                const pSize = fr.faceW * (0.035 + 0.03 * Math.sin(cycle * Math.PI));

                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.9));
                drawSparkle(
                    ctx,
                    px,
                    py,
                    pSize,
                    SPARKLE_COLORS[(p + Math.floor(sec * 3)) % SPARKLE_COLORS.length],
                    sec * 2.5 + p
                );
                ctx.restore();
            }
        });
    },
};

type Connection = { start: number; end: number };

const KEY_NODES = [1, 4, 10, 33, 61, 133, 152, 199, 263, 291, 362, 468, 473] as const;

function traceConnections(
    ctx: CanvasRenderingContext2D,
    lm: FacePoint[],
    conns: Connection[],
    w: number,
    h: number
) {
    ctx.beginPath();
    for (const c of conns) {
        const a = lm[c.start];
        const b = lm[c.end];
        if (!a || !b) continue;
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
    }
}

const faceMeshNeon: Effect = {
    id: "face-mesh",
    name: "Face Mesh Neon",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
        ctx.fillStyle = "rgba(8, 0, 26, 0.65)";
        ctx.fillRect(0, 0, w, h);

        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;
        const hue = (sec * 65) % 360;
        const tess = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
        const contours = FaceLandmarker.FACE_LANDMARKS_CONTOURS;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        cachedFaces.forEach((lm, f) => {
            const l = lm[234];
            const r = lm[454];
            const top = lm[10];
            const chin = lm[152];
            if (!l || !r) return;

            const faceW = Math.hypot((r.x - l.x) * w, (r.y - l.y) * h);
            if (!faceW) return;

            const pulse = 0.8 + 0.25 * Math.sin(sec * 5 + f * 1.5);
            const thin = Math.max(0.9, faceW * 0.0045);
            const meshHue = (hue + 175) % 360;

            // jaring segitiga (tesselation)
            traceConnections(ctx, lm, tess, w, h);
            ctx.strokeStyle = `hsla(${meshHue}, 100%, 58%, ${0.16 * pulse})`;
            ctx.lineWidth = thin * 5.5;
            ctx.stroke();
            ctx.strokeStyle = `hsla(${meshHue}, 100%, 72%, ${0.65 * pulse})`;
            ctx.lineWidth = thin * 1.1;
            ctx.stroke();

            // garis kontur utama (mata, alis, bibir, rahang)
            traceConnections(ctx, lm, contours, w, h);
            ctx.strokeStyle = `hsla(${hue}, 100%, 58%, ${0.32 * pulse})`;
            ctx.lineWidth = thin * 8;
            ctx.stroke();
            ctx.strokeStyle = `hsla(${hue}, 100%, 68%, 0.65)`;
            ctx.lineWidth = thin * 3.8;
            ctx.stroke();
            ctx.strokeStyle = `hsla(${hue}, 100%, 92%, 0.98)`;
            ctx.lineWidth = thin * 1.6;
            ctx.stroke();

            // garis scanline cahaya menyapu dari atas ke bawah wajah
            if (top && chin) {
                const scanProgress = (sec * 0.85 + f * 0.35) % 1;
                const scanY = (top.y + (chin.y - top.y) * scanProgress) * h;
                const bandH = Math.max(14, faceW * 0.12);
                const grad = ctx.createLinearGradient(0, scanY - bandH, 0, scanY + bandH);
                grad.addColorStop(0, "hsla(185, 100%, 65%, 0)");
                grad.addColorStop(0.5, `hsla(${(hue + 90) % 360}, 100%, 75%, 0.45)`);
                grad.addColorStop(1, "hsla(185, 100%, 65%, 0)");

                ctx.fillStyle = grad;
                ctx.fillRect(
                    Math.min(l.x, r.x) * w - faceW * 0.15,
                    scanY - bandH,
                    faceW * 1.3,
                    bandH * 2
                );
            }

            // titik-titik node bercahaya di landmark penting
            for (let i = 0; i < KEY_NODES.length; i++) {
                const pt = lm[KEY_NODES[i]];
                if (!pt) continue;
                const px = pt.x * w;
                const py = pt.y * h;
                const nodePulse = 0.7 + 0.5 * Math.sin(sec * 7 + i * 0.9);
                const nr = Math.max(2.2, faceW * 0.012) * nodePulse;

                ctx.beginPath();
                ctx.arc(px, py, nr * 2.2, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${(hue + i * 25) % 360}, 100%, 65%, 0.28)`;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(px, py, nr, 0, Math.PI * 2);
                ctx.fillStyle = "#ffffff";
                ctx.fill();
            }
        });

        ctx.restore();
    },
};

// ---------- helper ekspresi (dari landmark, tanpa blendshape) ----------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// kalau terasa kurang/terlalu sensitif, geser dua angka ini
const SMILE_MIN = 0.36; // lebar mulut / lebar wajah saat netral
const SMILE_MAX = 0.46; // saat senyum lebar

// 0..1: seberapa lebar senyum
function smileAmount(lm: FacePoint[], faceW: number, w: number, h: number) {
    const a = lm[61];
    const b = lm[291];
    if (!a || !b) return 0;
    const mw = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) / faceW;
    return clamp01((mw - SMILE_MIN) / (SMILE_MAX - SMILE_MIN));
}

// 0..1: seberapa lebar mulut terbuka
function mouthOpenAmount(lm: FacePoint[], faceW: number, w: number, h: number) {
    const a = lm[13];
    const b = lm[14];
    if (!a || !b) return 0;
    const d = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) / faceW;
    return clamp01((d - 0.02) / 0.12);
}

// ---------- efek Kitty (telinga kucing + kumis + MEOW) ----------

type CatState = {
    t: number;
    x: number;
    y: number;
    fw: number;
    ang: number;
    ear: [Spring, Spring];
    meowAt: number;
    open: boolean;
};

const catStates: CatState[] = [];
const catSmile: number[] = [];

// telinga lancip: sisi luar agak membulat, ujung bisa dibengkokkan lewat tipX
function catEarPath(ctx: CanvasRenderingContext2D, W: number, L: number, tipX: number) {
    ctx.beginPath();
    ctx.moveTo(-W / 2, 0);
    ctx.quadraticCurveTo(-W * 0.62, -L * 0.55, tipX - W * 0.02, -L);
    ctx.quadraticCurveTo(W * 0.5 + tipX * 0.5, -L * 0.45, W / 2, 0);
    ctx.closePath();
}

function drawCatEar(
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

    ctx.fillStyle = "#ffd9b8";
    ctx.strokeStyle = "#f0a878";
    ctx.lineWidth = Math.max(1.5, wid * 0.06);
    ctx.lineJoin = "round";
    catEarPath(ctx, wid, len, bend * len);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ff9fbd";
    ctx.translate(0, -len * 0.05);
    catEarPath(ctx, wid * 0.52, len * 0.72, bend * len * 0.8);
    ctx.fill();

    // dua helai bulu di dalam telinga
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = Math.max(1, wid * 0.04);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-wid * 0.06, -len * 0.08);
    ctx.lineTo(-wid * 0.03 + bend * len * 0.2, -len * 0.38);
    ctx.moveTo(wid * 0.06, -len * 0.08);
    ctx.lineTo(wid * 0.05 + bend * len * 0.2, -len * 0.34);
    ctx.stroke();

    ctx.restore();
}

function drawCatNose(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = "#ff7fa8";
    ctx.strokeStyle = "#d9568a";
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.5);
    ctx.quadraticCurveTo(0, -s * 0.8, s, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.9, s * 0.25, 0, s * 0.7);
    ctx.quadraticCurveTo(-s * 0.9, s * 0.25, -s, -s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.28, s * 0.25, s * 0.12, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// balon "MEOW!"; kalau canvas sedang di-mirror, teksnya dibalik lagi supaya terbaca
function drawMeow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rot: number,
    scale: number,
    alpha: number,
    mirrored: boolean
) {
    if (scale <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (mirrored) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp01(alpha);

    const bw = size * 2.7;
    const bh = size * 1.2;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ff4d8d";
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.stroke();

    // ekor balon
    ctx.beginPath();
    ctx.moveTo(-bw * 0.28, bh * 0.42);
    ctx.lineTo(-bw * 0.4, bh * 0.95);
    ctx.lineTo(-bw * 0.1, bh * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-bw * 0.29, bh * 0.38);
    ctx.lineTo(-bw * 0.1, bh * 0.41);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.fillStyle = "#ff4d8d";
    ctx.font = `800 ${size * 0.62}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MEOW!", 0, size * 0.04);
    ctx.restore();
}

const kittyCat: Effect = {
    id: "cat-ears",
    name: "Kitty",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;
        const mirrored = ctx.getTransform().a < 0;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            if (!fr) return;

            const smile = (catSmile[f] =
                (catSmile[f] ?? 0) + (smileAmount(lm, fr.faceW, w, h) - (catSmile[f] ?? 0)) * 0.2);
            const open = mouthOpenAmount(lm, fr.faceW, w, h);

            let st = catStates[f];
            if (!st || t - st.t > 300) {
                st = catStates[f] = {
                    t,
                    x: fr.tx,
                    y: fr.ty,
                    fw: fr.faceW,
                    ang: fr.angle,
                    ear: [
                        { x: 0, v: 0 },
                        { x: 0, v: 0 },
                    ],
                    meowAt: -1e9,
                    open: false,
                };
            }

            const dt = Math.min(0.05, Math.max(0.001, (t - st.t) / 1000));
            st.t = t;

            const a = 1 - Math.exp(-dt * 14);
            const px = st.x;
            st.x += (fr.tx - st.x) * a;
            st.y += (fr.ty - st.y) * a;
            st.fw += (fr.faceW - st.fw) * a;
            st.ang += (fr.angle - st.ang) * a;

            const vx = (st.x - px) / dt / st.fw;
            const push = Math.max(-0.7, Math.min(0.7, -vx * 0.35));
            for (let i = 0; i < 2; i++) {
                stepSpring(st.ear[i], push, 130 - i * 20, 7 + i, dt);
            }

            // buka mulut lebar -> MEOW (ada histeresis supaya tidak spam)
            if (!st.open && open > 0.5) {
                st.open = true;
                st.meowAt = t;
            } else if (st.open && open < 0.25) {
                st.open = false;
            }
            const mk = (t - st.meowAt) / 1200;
            const meowing = mk >= 0 && mk < 1;
            // 0..1: telinga merebah ke belakang sebentar waktu meow
            const back = meowing ? Math.min(1, mk * 8) * (1 - mk) : 0;

            const fw = st.fw;

            // ---- kumis + bantalan kumis ----
            for (const [idx, dir] of [
                [205, -1],
                [425, 1],
            ] as const) {
                const c = lm[idx];
                if (!c) continue;
                const cx = c.x * w;
                const cy = c.y * h;
                const out = fr.angle + (dir < 0 ? Math.PI : 0);
                const spread = 0.2 + smile * 0.1 + back * 0.18;

                ctx.save();
                ctx.lineCap = "round";
                [-1, 0, 1].forEach((k, i) => {
                    const ang = out + k * spread + Math.sin(sec * 4 + i * 1.7 + dir) * 0.04 * (1 + back * 3);
                    const sx = cx + Math.cos(out) * fw * 0.03;
                    const sy = cy + Math.sin(out) * fw * 0.03;
                    const L = fw * (0.34 + (i === 1 ? 0.05 : 0));
                    const ex = sx + Math.cos(ang) * L;
                    const ey = sy + Math.sin(ang) * L;
                    const curl = (0.1 + Math.sin(sec * 2.5 + i) * 0.05) * fw;
                    const mx = (sx + ex) / 2 - Math.sin(ang) * curl;
                    const my = (sy + ey) / 2 + Math.cos(ang) * curl;

                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.quadraticCurveTo(mx, my, ex, ey);
                    ctx.strokeStyle = "rgba(70, 20, 50, 0.35)";
                    ctx.lineWidth = Math.max(2.5, fw * 0.016);
                    ctx.stroke();
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = Math.max(1.4, fw * 0.009);
                    ctx.stroke();
                });

                // bintik bantalan kumis
                ctx.fillStyle = "rgba(120, 50, 80, 0.45)";
                [-1, 0, 1].forEach((k) => {
                    const [dx, dy] = place(fr, cx, cy, dir * 0.015, k * 0.03);
                    ctx.beginPath();
                    ctx.arc(dx, dy, Math.max(1, fw * 0.007), 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.restore();
            }

            // ---- hidung ----
            const nose = lm[1];
            if (nose) {
                const sniff = 1 + Math.sin(sec * 6) * 0.05;
                drawCatNose(ctx, nose.x * w, nose.y * h, fw * 0.045 * sniff, fr.angle);
            }

            // ---- telinga ----
            const baseX = st.x + Math.sin(st.ang) * fw * 0.02;
            const baseY = st.y - Math.cos(st.ang) * fw * 0.02;
            const sux = Math.cos(st.ang);
            const suy = Math.sin(st.ang);

            ([-1, 1] as const).forEach((side, i) => {
                // sesekali satu telinga berkedut
                const flick =
                    Math.pow(Math.max(0, Math.sin(sec * 1.3 + i * 2.7 + f * 1.1)), 24) * 0.4 * side;
                const ex = baseX + sux * side * fw * 0.33;
                const ey = baseY + suy * side * fw * 0.33;
                const bend = side * 0.06 + st.ear[i].x * 0.5;

                drawCatEar(
                    ctx,
                    ex,
                    ey,
                    st.ang + side * (0.3 + back * 0.35 + smile * 0.08) + flick + st.ear[i].x,
                    fw * 0.46 * (1 + smile * 0.06),
                    fw * 0.3,
                    bend
                );
            });

            // ---- balon MEOW ----
            if (meowing) {
                const pop = easeOutBack(Math.min(1, mk / 0.2));
                const fade = mk > 0.75 ? 1 - (mk - 0.75) / 0.25 : 1;
                const [bx, by] = place(fr, st.x, st.y, 0.62, 0.36 + mk * 0.1);
                drawMeow(ctx, bx, by, fw * 0.14, fr.angle + 0.12, pop, fade, mirrored);
            }
        });
    },
};

// ---------- efek Blush & Freckles (makin senyum makin merah) ----------

const blushSmile: number[] = [];

// u = ke samping dari ujung hidung, up = ke atas (satuan lebar wajah)
const FRECKLES = [
    { u: 0.0, up: 0.15, r: 0.008 },
    { u: 0.04, up: 0.1, r: 0.011 },
    { u: 0.08, up: 0.14, r: 0.009 },
    { u: 0.12, up: 0.07, r: 0.012 },
    { u: 0.17, up: 0.12, r: 0.009 },
    { u: 0.2, up: 0.05, r: 0.011 },
    { u: 0.1, up: 0.19, r: 0.007 },
    { u: 0.25, up: 0.1, r: 0.008 },
    { u: 0.22, up: 0.17, r: 0.007 },
    { u: 0.29, up: 0.03, r: 0.01 },
    { u: 0.16, up: 0.02, r: 0.007 },
    { u: 0.31, up: 0.12, r: 0.006 },
] as const;

function drawBlushPatch(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    angle: number,
    alpha: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1.3, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255, 64, 120, ${alpha})`);
    g.addColorStop(0.6, `rgba(255, 80, 130, ${alpha * 0.55})`);
    g.addColorStop(1, "rgba(255, 80, 130, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
}

// tiga garis miring ala blush anime
function drawBlushHatch(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    len: number,
    angle: number,
    alpha: number,
    lw: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = `rgba(255, 60, 110, ${clamp01(alpha)})`;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * len * 0.5 - len * 0.2, len * 0.3);
        ctx.lineTo(i * len * 0.5 + len * 0.2, -len * 0.3);
    }
    ctx.stroke();
    ctx.restore();
}

const blushFreckles: Effect = {
    id: "freckles-blush",
    name: "Blush & Freckles",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            const nose = lm[1];
            if (!fr || !nose) return;

            const fw = fr.faceW;
            const sm = (blushSmile[f] =
                (blushSmile[f] ?? 0) + (smileAmount(lm, fw, w, h) - (blushSmile[f] ?? 0)) * 0.2);
            const nx = nose.x * w;
            const ny = nose.y * h;
            const pulse = 1 + Math.sin(sec * 2.5 + f) * 0.06;

            // ---- pipi: makin senyum makin merah, plus garis anime & hati ----
            for (const [idx, dir] of [
                [205, -1],
                [425, 1],
            ] as const) {
                const c = lm[idx];
                if (!c) continue;
                const cx = c.x * w;
                const cy = c.y * h;

                drawBlushPatch(ctx, cx, cy, fw * (0.17 + sm * 0.06) * pulse, fr.angle, 0.3 + sm * 0.45);

                if (sm > 0.15) {
                    drawBlushHatch(ctx, cx, cy, fw * 0.07, fr.angle, sm * 0.8, Math.max(1.5, fw * 0.012));
                }

                if (sm > 0.45) {
                    for (let i = 0; i < 3; i++) {
                        const p = (sec * 0.45 + i / 3 + (dir > 0 ? 0.17 : 0)) % 1;
                        const [hx, hy] = place(
                            fr,
                            cx,
                            cy,
                            dir * (0.03 + i * 0.03) + Math.sin(sec * 3 + i) * 0.01,
                            0.04 + p * 0.34
                        );
                        drawHeart(ctx, hx, hy, fw * 0.04 * (0.6 + 0.4 * sm), {
                            fill: HEART_PINKS[i % HEART_PINKS.length],
                            alpha: Math.min(1, p * 6) * (1 - p) * sm * 1.2,
                            rotation: fr.angle + dir * 0.2,
                        });
                    }
                }
            }

            // hidung ikut kemerahan
            drawBlushPatch(ctx, nx, ny, fw * 0.07, fr.angle, 0.3 + sm * 0.3);

            // ---- bintik: "pop" bergelombang dari tengah ke samping ----
            for (const dir of [-1, 1]) {
                FRECKLES.forEach((s) => {
                    if (s.u === 0 && dir < 0) return;
                    const [x, y] = place(fr, nx, ny, s.u * dir, s.up);
                    const pop = Math.pow(
                        Math.max(0, Math.sin(sec * 3.2 - s.u * 10 + (dir > 0 ? 0 : 1.5) + f)),
                        8
                    );
                    const r = fw * s.r * (1 + pop * 0.6);
                    ctx.fillStyle = `rgba(168, 82, 56, ${0.55 + pop * 0.3})`;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                    if (pop > 0.5) {
                        drawSparkle(ctx, x + r * 1.4, y - r * 1.4, r * 3.2 * (pop - 0.4), "#ffffff", fr.angle);
                    }
                });
            }
        });
    },
};

// ---------- efek Face Paint (pelangi, kupu-kupu, bintang, glitter) ----------

const RAINBOW = ["#ff4d6d", "#ffa94d", "#ffe14d", "#5fdc8a", "#4db8ff", "#b58cff"];
const TRAIL_COLORS = ["#ff4d8d", "#22d3ee", "#ffe14d"];

function drawStar5(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke: string,
    rotation = 0
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawRainbow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.lineCap = "butt";

    const lw = size * 0.13;
    RAINBOW.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = lw + 0.6;
        ctx.beginPath();
        ctx.arc(0, size * 0.35, size * 0.9 - i * lw * 0.95, Math.PI, Math.PI * 2);
        ctx.stroke();
    });

    // awan di kedua ujung
    ctx.fillStyle = "#ffffff";
    for (const s of [-1, 1]) {
        for (const [cx, cy, r] of [
            [0.9, 0.38, 0.2],
            [0.76, 0.46, 0.15],
            [1.04, 0.46, 0.15],
        ] as const) {
            ctx.beginPath();
            ctx.arc(s * cx * size, cy * size, r * size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawButterfly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rot: number,
    flap: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    const k = 0.4 + 0.6 * Math.abs(Math.cos(flap));
    ctx.lineJoin = "round";
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side * k, 1);
        ctx.lineWidth = Math.max(1, size * 0.05);

        ctx.fillStyle = "#b58cff";
        ctx.strokeStyle = "#7a4fd1";
        ctx.beginPath();
        ctx.ellipse(size * 0.55, -size * 0.35, size * 0.55, size * 0.42, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ff8fc4";
        ctx.strokeStyle = "#d63a82";
        ctx.beginPath();
        ctx.ellipse(size * 0.4, size * 0.4, size * 0.36, size * 0.3, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(size * 0.6, -size * 0.4, size * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffe14d";
        ctx.beginPath();
        ctx.arc(size * 0.4, size * 0.42, size * 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.fillStyle = "#4a2d6b";
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.07, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#4a2d6b";
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.45);
    ctx.quadraticCurveTo(-size * 0.12, -size * 0.8, -size * 0.3, -size * 0.8);
    ctx.moveTo(0, -size * 0.45);
    ctx.quadraticCurveTo(size * 0.12, -size * 0.8, size * 0.3, -size * 0.8);
    ctx.stroke();

    ctx.restore();
}

// jejak titik dari sudut luar mata
const PAINT_TRAIL = [
    { out: 0.07, up: -0.07, r: 0.016 },
    { out: 0.12, up: -0.12, r: 0.012 },
    { out: 0.16, up: -0.17, r: 0.009 },
] as const;

const facePaint: Effect = {
    id: "face-paint",
    name: "Face Paint",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            if (!fr) return;
            const fw = fr.faceW;

            ctx.save();
            ctx.globalAlpha = 0.93;

            // ---- pipi: pelangi (sisi u negatif) & kupu-kupu (sisi u positif) ----
            const lc = lm[205];
            const rc = lm[425];
            if (lc) {
                const [x, y] = place(fr, lc.x * w, lc.y * h, -0.02, 0.01 + Math.sin(sec * 1.4 + f) * 0.006);
                drawRainbow(ctx, x, y, fw * 0.17, fr.angle - 0.25);
            }
            if (rc) {
                const [x, y] = place(fr, rc.x * w, rc.y * h, 0.02, 0.02 + Math.sin(sec * 1.6 + f) * 0.01);
                drawButterfly(ctx, x, y, fw * 0.15, fr.angle + 0.25, sec * 6 + f);
            }

            // ---- mata: bintang di bawah mata + jejak titik ----
            for (const [idx, dir] of [
                [33, -1],
                [263, 1],
            ] as const) {
                const eye = lm[idx];
                if (!eye) continue;
                const ex = eye.x * w;
                const ey = eye.y * h;

                const [sx, sy] = place(fr, ex, ey, dir * 0.02, -0.1);
                const sp = 0.92 + 0.1 * Math.sin(sec * 3 + dir + f);
                drawStar5(
                    ctx,
                    sx,
                    sy,
                    fw * 0.045 * sp,
                    "#ffe14d",
                    "#ff9a2e",
                    fr.angle + Math.sin(sec * 1.5 + dir) * 0.2
                );

                PAINT_TRAIL.forEach((s, i) => {
                    const [x, y] = place(fr, ex, ey, s.out * dir, s.up);
                    ctx.fillStyle = TRAIL_COLORS[(i + (dir > 0 ? 1 : 0)) % TRAIL_COLORS.length];
                    ctx.beginPath();
                    ctx.arc(x, y, fw * s.r, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            // ---- dahi: deretan titik + hati ----
            const glabella = lm[9];
            const fx = glabella ? (fr.tx + glabella.x * w) / 2 : fr.tx;
            const fy = glabella ? (fr.ty + glabella.y * h) / 2 : fr.ty;
            [-0.17, -0.1, 0.1, 0.17].forEach((u, i) => {
                const [x, y] = place(fr, fx, fy, u, 0);
                ctx.fillStyle = ["#22d3ee", "#ff4d8d", "#ffe14d", "#b58cff"][i];
                ctx.beginPath();
                ctx.arc(x, y, fw * (i === 1 || i === 2 ? 0.014 : 0.01), 0, Math.PI * 2);
                ctx.fill();
            });
            {
                const [hx, hy] = place(fr, fx, fy, 0, 0);
                drawHeart(ctx, hx, hy, fw * 0.065 * (1 + Math.sin(sec * 4 + f) * 0.06), {
                    fill: "#ff4d8d",
                    stroke: "#d63a82",
                    lineWidth: Math.max(1, fw * 0.006),
                    rotation: fr.angle,
                });
            }

            const nose = lm[1];
            if (nose) {
                const boop = 1 + Math.sin(sec * 4) * 0.08;
                const nr = fw * 0.03 * boop;
                ctx.fillStyle = "#ff5c8a";
                ctx.beginPath();
                ctx.arc(nose.x * w, nose.y * h, nr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "rgba(255,255,255,0.85)";
                ctx.beginPath();
                ctx.arc(nose.x * w - nr * 0.3, nose.y * h - nr * 0.3, nr * 0.28, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();

            if (nose) {
                for (let i = 0; i < 12; i++) {
                    const u = (rand(i + 1) - 0.5) * 0.8;
                    const up = rand(i + 2) * 0.5 - 0.12;
                    const [gx, gy] = place(fr, nose.x * w, nose.y * h, u, up);
                    const k = twinkle(sec, rand(i + 3) * 6.28 + f, 2.6);
                    drawSparkle(
                        ctx,
                        gx,
                        gy,
                        fw * (0.02 + rand(i + 4) * 0.02) * (0.2 + 0.8 * k),
                        SPARKLE_COLORS[i % SPARKLE_COLORS.length],
                        fr.angle
                    );
                }
            }
        });
    },
};

const TAU = Math.PI * 2;
const HUD_FONT = 'ui-monospace, "Courier New", monospace';
const HUD_CYAN = "#22d3ee";

const BROW_MIN = 0.075;
const BROW_MAX = 0.115;

function browRaiseAmount(lm: FacePoint[], faceW: number, w: number, h: number) {
    let sum = 0;
    let n = 0;
    for (const [b, e] of [
        [105, 159],
        [334, 386],
    ] as const) {
        const p = lm[b];
        const q = lm[e];
        if (!p || !q) continue;
        sum += Math.hypot((p.x - q.x) * w, (p.y - q.y) * h) / faceW;
        n++;
    }
    return n ? clamp01((sum / n - BROW_MIN) / (BROW_MAX - BROW_MIN)) : 0;
}

function eyeOpenAmount(
    lm: FacePoint[],
    upper: number,
    lower: number,
    faceW: number,
    w: number,
    h: number
) {
    const a = lm[upper];
    const b = lm[lower];
    if (!a || !b) return 1;
    const d = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) / faceW;
    return clamp01((d - 0.012) / 0.03);
}

function neonStroke(ctx: CanvasRenderingContext2D, lw: number) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.22;
    ctx.lineWidth = lw * 5;
    ctx.stroke();
    ctx.globalAlpha = a * 0.95;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.globalAlpha = a;
}

function drawHudText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    fill: string,
    align: CanvasTextAlign,
    mirrored: boolean,
    glow: string | null = null
) {
    ctx.save();
    ctx.translate(x, y);
    if (mirrored) ctx.scale(-1, 1);
    ctx.font = `bold ${size}px ${HUD_FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    if (glow) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = size * 0.5;
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function drawHudChip(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    mirrored: boolean,
    ext: -1 | 0 | 1,
    alpha = 1
) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    if (mirrored) ctx.scale(-1, 1);
    ctx.globalAlpha = clamp01(alpha);
    ctx.font = `bold ${size}px ${HUD_FONT}`;

    const bw = ctx.measureText(text).width + size * 1.4;
    const bh = size * 1.55;
    const x0 = ext === 0 ? -bw / 2 : ext > 0 ? 0 : -bw;

    ctx.fillStyle = "rgba(4, 16, 28, 0.74)";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.1);
    ctx.beginPath();
    ctx.roundRect(x0, -bh / 2, bw, bh, bh * 0.3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x0 + bw / 2, size * 0.04);
    ctx.restore();
}


// ---------- efek Battle Damage (buka mulut = kena pukul) ----------

type DamageState = {
    t: number;
    born: number;
    open: boolean;
    hits: number; // 0..3
    hitAt: number;
    lastHit: number;
};

const damageStates: DamageState[] = [];

function drawBurst(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rot: number,
    scale: number,
    alpha: number,
    mirrored: boolean,
    text: string
) {
    if (scale <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (mirrored) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp01(alpha);

    const n = 12;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * TAU;
        const r = i % 2 ? size * 0.66 : size * (0.95 + rand(i + 5) * 0.1);
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffe14d";
    ctx.strokeStyle = "#ff4d8d";
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1a1a1f";
    ctx.font = `900 ${size * 0.42}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, size * 0.03);
    ctx.restore();
}

function drawPlaster(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    len: number,
    wid: number,
    rot: number,
    scale: number
) {
    if (scale <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);

    const lw = Math.max(1, wid * 0.08);
    ctx.fillStyle = "#f6d2a8";
    ctx.strokeStyle = "#d9a577";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, wid * 0.45);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fbe7cd";
    ctx.fillRect(-len * 0.17, -wid / 2 + lw, len * 0.34, wid - lw * 2);

    ctx.fillStyle = "rgba(190, 130, 90, 0.55)";
    for (const sx of [-1, 1]) {
        for (const k of [0, 1]) {
            for (const sy of [-1, 1]) {
                ctx.beginPath();
                ctx.arc(sx * (len * 0.3 + k * len * 0.1), sy * wid * 0.18, wid * 0.045, 0, TAU);
                ctx.fill();
            }
        }
    }
    ctx.restore();
}

const battleDamage: Effect = {
    id: "scar-damage",
    name: "Battle Damage",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);
        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;
        const mirrored = ctx.getTransform().a < 0;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            if (!fr) return;
            const fw = fr.faceW;
            const ang = fr.angle;

            let st = damageStates[f];
            if (!st || t - st.t > 300) {
                st = damageStates[f] = {
                    t,
                    born: t,
                    open: false,
                    hits: 0,
                    hitAt: -1e9,
                    lastHit: t,
                };
            }
            st.t = t;

            const open = mouthOpenAmount(lm, fw, w, h);
            if (!st.open && open > 0.5) {
                st.open = true;
                st.hits = Math.min(3, st.hits + 1);
                st.hitAt = t;
                st.lastHit = t;
            } else if (st.open && open < 0.25) {
                st.open = false;
            }
            if (st.hits > 0 && t - st.lastHit > 6000) {
                st.hits--;
                st.lastHit = t;
            }

            const age = (t - st.born) / 1000;
            const hk = (t - st.hitAt) / 1800;
            const hitting = hk >= 0 && hk < 1;
            const jolt = hitting ? Math.sin(hk * 28) * (1 - hk) : 0;
            const dmg = 0.4 + st.hits * 0.2;
            const pop = (start: number, dur: number) =>
                Math.max(0, easeOutBack(clamp01((age - start) / dur)));

            const e1 = lm[263];
            const e2 = lm[362];
            if (e1 && e2) {
                const [bx, by] = place(fr, ((e1.x + e2.x) / 2) * w, ((e1.y + e2.y) / 2) * h, 0, -0.03);
                const grow = pop(0.4, 0.5);
                const throb = 1 + Math.sin(sec * 3 + f) * 0.05 + (hitting ? (1 - hk) * 0.25 : 0);
                const r = fw * (0.085 + st.hits * 0.012) * grow * throb;
                if (r > 1) {
                    ctx.save();
                    ctx.globalCompositeOperation = "multiply";
                    ctx.translate(bx, by);
                    ctx.rotate(ang);
                    ctx.scale(1.25, 1);
                    const a = Math.min(1, dmg);
                    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
                    g.addColorStop(0, `rgba(95, 40, 150, ${a})`);
                    g.addColorStop(0.55, `rgba(130, 70, 170, ${a * 0.8})`);
                    g.addColorStop(0.85, `rgba(205, 195, 70, ${a * 0.45})`);
                    g.addColorStop(1, "rgba(205, 195, 70, 0)");
                    ctx.fillStyle = g;
                    ctx.fillRect(-r, -r, r * 2, r * 2);
                    ctx.restore();
                }
            }

            const cheek = lm[205];
            if (cheek && st.hits >= 1) {
                const reveal = clamp01((t - st.hitAt) / 250);
                ctx.save();
                ctx.lineCap = "round";
                for (let k = -1; k <= 1; k++) {
                    const [sx, sy] = place(fr, cheek.x * w, cheek.y * h, -0.05 + k * 0.035, 0.07);
                    const [ex, ey] = place(fr, cheek.x * w, cheek.y * h, 0.05 + k * 0.035, -0.07);
                    const L = Math.hypot(ex - sx, ey - sy);
                    ctx.setLineDash([L * reveal, L * 2]);
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(ex, ey);
                    ctx.strokeStyle = "rgba(170, 40, 70, 0.85)";
                    ctx.lineWidth = Math.max(2, fw * 0.012);
                    ctx.stroke();
                    ctx.strokeStyle = "rgba(255, 150, 165, 0.9)";
                    ctx.lineWidth = Math.max(1, fw * 0.005);
                    ctx.stroke();
                }
                ctx.restore();
            }

            const brow = lm[105];
            if (brow) {
                const reveal = clamp01((age - 0.1) / 0.6);
                const bx = brow.x * w;
                const by = brow.y * h;
                const [sx, sy] = place(fr, bx, by, -0.035, -0.05);
                const [ex, ey] = place(fr, bx, by, 0.035, 0.055);
                const L = Math.hypot(ex - sx, ey - sy);

                ctx.save();
                ctx.lineCap = "round";
                ctx.setLineDash([L * reveal, L * 2]);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.strokeStyle = "#9a2f45";
                ctx.lineWidth = Math.max(2.5, fw * 0.015);
                ctx.stroke();
                ctx.strokeStyle = "#f0788a";
                ctx.lineWidth = Math.max(1, fw * 0.006);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.strokeStyle = "#3a1020";
                ctx.lineWidth = Math.max(1, fw * 0.006);
                const dx = (ex - sx) / L;
                const dy = (ey - sy) / L;
                for (let i = 1; i <= 4; i++) {
                    const s = i / 5;
                    if (s > reveal) break;
                    const px = sx + (ex - sx) * s;
                    const py = sy + (ey - sy) * s;
                    ctx.beginPath();
                    ctx.moveTo(px - dy * fw * 0.022, py + dx * fw * 0.022);
                    ctx.lineTo(px + dy * fw * 0.022, py - dx * fw * 0.022);
                    ctx.stroke();
                }
                ctx.restore();
            }

            const nb = lm[6];
            const nt = lm[1];
            if (nb && nt) {
                const px = (nb.x * 0.65 + nt.x * 0.35) * w;
                const py = (nb.y * 0.65 + nt.y * 0.35) * h;
                const s = pop(0.7, 0.35) * (1 + Math.abs(jolt) * 0.3);
                for (const sg of [1, -1]) {
                    drawPlaster(ctx, px, py, fw * 0.2, fw * 0.055, ang + sg * 0.6 + jolt * 0.2, s);
                }
            }

            const gl = lm[9];
            if (gl && st.hits >= 2) {
                const [px, py] = place(fr, gl.x * w, gl.y * h, 0.12, 0.13);
                drawPlaster(
                    ctx,
                    px,
                    py,
                    fw * 0.2,
                    fw * 0.055,
                    ang - 0.35,
                    Math.max(0, easeOutBack(clamp01((t - st.hitAt) / 300)))
                );
            }

            if (hitting) {
                const fade = hk > 0.7 ? 1 - (hk - 0.7) / 0.3 : 1;
                ctx.save();
                ctx.globalAlpha = fade;
                for (let i = 0; i < 3; i++) {
                    const a = sec * 7 + (i * TAU) / 3;
                    const [x, y] = place(fr, fr.tx, fr.ty, Math.cos(a) * 0.34, 0.14 + Math.sin(a) * 0.06);
                    drawStar5(ctx, x, y, fw * 0.045, "#ffe14d", "#ff9a2e", a * 0.5);
                }
                ctx.restore();

                const [bx, by] = place(fr, fr.tx, fr.ty, -0.66, 0.3);
                drawBurst(
                    ctx,
                    bx,
                    by,
                    fw * 0.2,
                    ang - 0.2 + Math.sin(sec * 18) * 0.05 * (1 - hk),
                    easeOutBack(clamp01(hk / 0.12)),
                    fade,
                    mirrored,
                    st.hits >= 3 ? "K.O.!" : "OUCH!"
                );
            }

            for (let i = 0; i < 3; i++) {
                const lost = i >= 3 - st.hits;
                const justLost = hitting && i === 3 - st.hits;
                const [x, y] = place(fr, fr.tx, fr.ty, (i - 1) * 0.12, 0.36);
                const size = fw * 0.08;
                const rot = ang + (justLost ? Math.sin(sec * 40) * 0.35 * (1 - hk) : 0);
                if (lost) {
                    drawHeart(ctx, x, y, size, {
                        stroke: "#ff4d8d",
                        lineWidth: Math.max(1.5, fw * 0.008),
                        alpha: 0.6,
                        rotation: rot,
                    });
                } else {
                    drawHeart(ctx, x, y, size * (1 + Math.sin(sec * 4 + i) * 0.04), {
                        fill: "#ff4d8d",
                        stroke: "#ffffff",
                        lineWidth: Math.max(1.5, fw * 0.006),
                        rotation: rot,
                    });
                }
            }
        });
    },
};


// ---------- efek Iron HUD ----------

type HudState = { t: number; born: number };
const hudStates: HudState[] = [];
const hudSmile: number[] = [];

const HUD_QUIPS = [
    "VIBES: IMMACULATE",
    "COOL LVL: MAX",
    "SNACK LVL: LOW",
    "BATTERY: 69%",
    "WIFI: 5 BARS",
    "CHARM: OVERFLOW",
    "COFFEE.EXE LOADING",
    "DRIP: DETECTED",
];

function drawHudEcg(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    ext: -1 | 1,
    sec: number,
    bpm: number,
    mirrored: boolean
) {
    ctx.save();
    ctx.translate(x, y);
    if (mirrored) ctx.scale(-1, 1);

    const bw = size * 9;
    const bh = size * 3.6;
    const x0 = ext > 0 ? 0 : -bw;

    ctx.fillStyle = "rgba(4, 16, 28, 0.74)";
    ctx.strokeStyle = HUD_CYAN;
    ctx.lineWidth = Math.max(1, size * 0.1);
    ctx.beginPath();
    ctx.roundRect(x0, -bh / 2, bw, bh, size * 0.45);
    ctx.fill();
    ctx.stroke();

    ctx.font = `bold ${size * 0.85}px ${HUD_FONT}`;
    ctx.fillStyle = "#ff6fa5";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`♥ ${bpm} BPM`, x0 + size * 0.6, -bh / 2 + size * 0.85);

    const N = 44;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
        const gx = x0 + size * 0.6 + (i / N) * (bw - size * 1.2);
        const q = ((i / N) * 1.6 + sec * (bpm / 90)) % 1;
        let v = 0;
        if (q > 0.4 && q < 0.46) v = -((q - 0.4) / 0.06);
        else if (q >= 0.46 && q < 0.52) v = -1 + ((q - 0.46) / 0.06) * 2.2;
        else if (q >= 0.52 && q < 0.58) v = 1.2 - ((q - 0.52) / 0.06) * 1.2;
        const gy = bh * 0.2 - v * bh * 0.2;
        if (i) ctx.lineTo(gx, gy);
        else ctx.moveTo(gx, gy);
    }
    ctx.strokeStyle = "#7df3ff";
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
}

const ironHud: Effect = {
    id: "iron-hud",
    name: "Iron HUD",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t) {
        ctx.drawImage(video, 0, 0, w, h);
        ctx.fillStyle = "rgba(0, 18, 36, 0.3)";
        ctx.fillRect(0, 0, w, h);

        updateFaceCache(video);
        if (!cachedFaces.length) return;

        const sec = t / 1000;
        const mirrored = ctx.getTransform().a < 0;
        const ext = mirrored ? -1 : 1;

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            const chin = lm[152];
            if (!fr || !chin) return;
            const fw = fr.faceW;

            let st = hudStates[f];
            if (!st || t - st.t > 300) st = hudStates[f] = { t, born: t };
            st.t = t;

            const age = (t - st.born) / 1000;
            const locked = age >= 0.7;
            const k = 1 + (1 - easeOutBack(clamp01(age / 0.7))) * 0.8;

            const smile = (hudSmile[f] =
                (hudSmile[f] ?? 0) + (smileAmount(lm, fw, w, h) - (hudSmile[f] ?? 0)) * 0.2);
            const open = mouthOpenAmount(lm, fw, w, h);
            const brow = browRaiseAmount(lm, fw, w, h);

            const cx = (fr.tx + chin.x * w) / 2;
            const cy = (fr.ty + chin.y * h) / 2;
            const at = (u: number, up: number) => place(fr, cx, cy, u, up);
            const thin = Math.max(1, fw * 0.004);

            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.strokeStyle = locked ? HUD_CYAN : "#ff6b6b";
            ctx.beginPath();
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    const u = sx * 0.62 * k;
                    const up = sy * 0.8 * k;
                    const [ax, ay] = at(u - sx * 0.18, up);
                    const [px, py] = at(u, up);
                    const [bx, by] = at(u, up - sy * 0.18);
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(px, py);
                    ctx.lineTo(bx, by);
                }
            }
            neonStroke(ctx, thin);

            ctx.strokeStyle = HUD_CYAN;
            ctx.setLineDash([fw * 0.05, fw * 0.035]);
            ctx.lineDashOffset = -sec * fw * 0.25;
            ctx.beginPath();
            ctx.arc(cx, cy, fw * 0.74 * (1 + (k - 1) * 0.4), 0, TAU);
            neonStroke(ctx, thin);

            ctx.setLineDash([fw * 0.012, fw * 0.03]);
            ctx.lineDashOffset = sec * fw * 0.15;
            ctx.beginPath();
            ctx.arc(cx, cy, fw * 0.67, 0, TAU);
            neonStroke(ctx, thin);
            ctx.setLineDash([]);

            ctx.strokeStyle = "#ff4d8d";
            const a0 = sec * 1.4;
            const R = fw * 0.8;
            ctx.beginPath();
            ctx.arc(cx, cy, R, a0, a0 + 1);
            ctx.moveTo(cx + Math.cos(a0 + Math.PI) * R, cy + Math.sin(a0 + Math.PI) * R);
            ctx.arc(cx, cy, R, a0 + Math.PI, a0 + Math.PI + 1);
            neonStroke(ctx, thin * 1.3);

            const p = (sec * 0.45 + f * 0.3) % 1;
            const su = 0.8 - p * 1.6;
            const [s1x, s1y] = at(-0.62, su);
            const [s2x, s2y] = at(0.62, su);
            ctx.strokeStyle = "#7df3ff";
            ctx.beginPath();
            ctx.moveTo(s1x, s1y);
            ctx.lineTo(s2x, s2y);
            neonStroke(ctx, thin);

            for (const [a, b] of [
                [33, 133],
                [263, 362],
            ] as const) {
                const pa = lm[a];
                const pb = lm[b];
                if (!pa || !pb) continue;
                const ex = ((pa.x + pb.x) / 2) * w;
                const ey = ((pa.y + pb.y) / 2) * h;
                const r = fw * 0.085 * (1 + brow * 0.35);

                const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 1.8);
                g.addColorStop(0, "rgba(120, 240, 255, 0.35)");
                g.addColorStop(1, "rgba(120, 240, 255, 0)");
                ctx.fillStyle = g;
                ctx.fillRect(ex - r * 1.8, ey - r * 1.8, r * 3.6, r * 3.6);

                ctx.strokeStyle = HUD_CYAN;
                ctx.setLineDash([r * 0.5, r * 0.3]);
                ctx.lineDashOffset = -sec * r * 1.5 * (a === 33 ? 1 : -1);
                ctx.beginPath();
                ctx.arc(ex, ey, r, 0, TAU);
                neonStroke(ctx, thin);
                ctx.setLineDash([]);

                ctx.beginPath();
                for (let i = 0; i < 4; i++) {
                    const an = fr.angle + (i * Math.PI) / 2 + sec * 0.8;
                    ctx.moveTo(ex + Math.cos(an) * r * 1.15, ey + Math.sin(an) * r * 1.15);
                    ctx.lineTo(ex + Math.cos(an) * r * 1.5, ey + Math.sin(an) * r * 1.5);
                }
                neonStroke(ctx, thin);
            }
            ctx.restore();

            const size = Math.max(9, fw * 0.055);

            for (let i = 0; i < 3; i++) {
                const up = 0.42 - i * 0.3;
                const [lx, ly] = at(0.64, up);
                const [ax, ay] = at(0.86, up);

                let text: string;
                let alpha = 1;
                if (i === 0) {
                    text = `SMILE.EXE ${Math.round(smile * 100)}%`;
                } else {
                    const c = sec / 2.4 + i * 3 + f * 2;
                    text = HUD_QUIPS[Math.floor(c) % HUD_QUIPS.length];
                    alpha = Math.min(1, (c % 1) * 8);
                }

                ctx.strokeStyle = "rgba(34, 211, 238, 0.7)";
                ctx.lineWidth = thin;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(ax, ay);
                ctx.stroke();
                drawHudChip(ctx, text, ax, ay, size, i === 0 ? "#7df3ff" : HUD_CYAN, mirrored, ext, alpha);
            }

            const bpm = Math.round(72 + smile * 50 + open * 30);
            {
                const [lx, ly] = at(-0.64, 0.12);
                const [ax, ay] = at(-0.86, 0.12);
                ctx.strokeStyle = "rgba(34, 211, 238, 0.7)";
                ctx.lineWidth = thin;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(ax, ay);
                ctx.stroke();
                drawHudEcg(ctx, ax, ay, size, ext === 1 ? -1 : 1, sec, bpm, mirrored);
            }

            // status di bawah wajah
            let status = "TARGET LOCKED";
            let color = HUD_CYAN;
            if (!locked) {
                status = "ACQUIRING...";
                color = "#ff6b6b";
            } else if (open > 0.5) {
                status = "AAAAA DETECTED!!";
                color = "#ff4d8d";
            } else if (smile > 0.6) {
                status = "THREAT: ADORABLE";
                color = "#ffe14d";
            }
            const [sx, sy] = at(0, -1.02);
            drawHudChip(ctx, status, sx, sy, size, color, mirrored, 0, 0.75 + 0.25 * Math.sin(sec * 6));
        });
    },
};

// ---------- efek Terminator Eye ----------

type TermState = { t: number; born: number };
const termStates: TermState[] = [];
const termSmile: number[] = [];

const TERMINATOR_LINES = [
    "SCAN: HUMAN",
    "AGE: CLASSIFIED",
    "MOOD: SUSPICIOUS",
    "COFFEE: 0%",
    "SNACKS: NEEDED",
    "HAIR: TOO GOOD",
    "THREAT: LOW",
    "VERDICT: NICE",
];

// teks diketik huruf demi huruf, baris yang selesai tetap tampil
function typedLines(lines: string[], pos: number, maxLines: number) {
    const out: string[] = [];
    let acc = 0;
    for (const s of lines) {
        if (pos < acc) break;
        const n = pos - acc;
        out.push(s.slice(0, Math.min(s.length, n)) + (n < s.length ? "_" : ""));
        acc += s.length + 8;
    }
    return out.slice(-maxLines);
}

const TERMINATOR_TOTAL = TERMINATOR_LINES.reduce((s, l) => s + l.length + 8, 0);

const terminatorEye: Effect = {
    id: "terminator-eye",
    name: "Terminator Eye",
    preload: initFaceLandmarker,
    draw(ctx, video, w, h, t, overlayOnly) {
        if (!overlayOnly) ctx.drawImage(video, 0, 0, w, h);

        const sec = t / 1000;
        const mirrored = ctx.getTransform().a < 0;

        // ---- penglihatan merah: tint, vignette, scanline ----
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "rgb(255, 70, 60)";
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(90, 0, 0, 0.35)";
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";

        const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
        vg.addColorStop(0, "rgba(0, 0, 0, 0)");
        vg.addColorStop(1, "rgba(40, 0, 0, 0.6)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);

        ctx.beginPath();
        for (let y = 0; y < h; y += 4) ctx.rect(0, y, w, 1.5);
        ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
        ctx.fill();
        ctx.restore();

        // ---- teks pojok layar ----
        const hs = Math.max(10, h * 0.032);
        const leftX = mirrored ? w - hs : hs;
        const rightX = mirrored ? hs : w - hs;
        drawHudText(ctx, "SYS: ONLINE", leftX, hs * 1.3, hs, "#ff8a80", "left", mirrored, "#ff0000");
        if (Math.floor(sec * 2) % 2 === 0) {
            drawHudText(ctx, "● REC", rightX, hs * 1.3, hs, "#ff4d4d", "right", mirrored, "#ff0000");
        }

        updateFaceCache(video);
        if (!cachedFaces.length) {
            drawHudText(
                ctx,
                Math.floor(sec * 2) % 2 ? "SEARCHING FOR HUMAN..." : "SEARCHING FOR HUMAN",
                w / 2,
                h / 2,
                hs * 1.2,
                "#ff8a80",
                "center",
                mirrored,
                "#ff0000"
            );
            return;
        }

        cachedFaces.forEach((lm, f) => {
            const fr = faceFrame(lm, w, h);
            const eo = lm[33];
            const ei = lm[133];
            const chin = lm[152];
            if (!fr || !eo || !ei || !chin) return;
            const fw = fr.faceW;

            let st = termStates[f];
            if (!st || t - st.t > 300) st = termStates[f] = { t, born: t };
            st.t = t;

            const age = (t - st.born) / 1000;
            const lock = easeOutBack(clamp01(age / 0.8));

            const smile = (termSmile[f] =
                (termSmile[f] ?? 0) + (smileAmount(lm, fw, w, h) - (termSmile[f] ?? 0)) * 0.2);
            const open = mouthOpenAmount(lm, fw, w, h);
            const brow = browRaiseAmount(lm, fw, w, h);
            const eyeOpen = eyeOpenAmount(lm, 159, 145, fw, w, h);

            // mata yang menyala: ganti ke 263 & 362 (upper 386, lower 374) untuk mata satunya
            const ex = ((eo.x + ei.x) / 2) * w;
            const ey = ((eo.y + ei.y) / 2) * h;
            const thin = Math.max(1, fw * 0.004);

            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";

            // glow mata (meredup saat kedip, membesar saat alis naik)
            const pulse = 0.85 + 0.15 * Math.sin(sec * 9 + f);
            const gr = fw * (0.2 + brow * 0.12) * pulse * (0.35 + 0.65 * eyeOpen);
            const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, gr);
            g.addColorStop(0, "rgba(255, 255, 255, 0.95)");
            g.addColorStop(0.12, "rgba(255, 90, 60, 0.95)");
            g.addColorStop(0.45, "rgba(255, 20, 20, 0.45)");
            g.addColorStop(1, "rgba(255, 0, 0, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(ex - gr, ey - gr, gr * 2, gr * 2);

            // kilau lensa memanjang ala sinema
            ctx.save();
            ctx.translate(ex, ey);
            ctx.rotate(fr.angle);
            ctx.globalAlpha = 0.4 + 0.6 * eyeOpen;
            const fl = ctx.createLinearGradient(-fw * 0.6, 0, fw * 0.6, 0);
            fl.addColorStop(0, "rgba(255, 0, 0, 0)");
            fl.addColorStop(0.5, "rgba(255, 90, 70, 0.8)");
            fl.addColorStop(1, "rgba(255, 0, 0, 0)");
            ctx.fillStyle = fl;
            ctx.fillRect(-fw * 0.6, -Math.max(1, fw * 0.005), fw * 1.2, Math.max(2, fw * 0.01));
            ctx.restore();

            // reticle: mengecil dan mengunci ke mata
            const rr = fw * 0.15 * (1 + (1 - lock) * 1.3) * (1 - brow * 0.18);
            ctx.strokeStyle = "#ff5a4a";
            ctx.setLineDash([rr * 0.4, rr * 0.22]);
            ctx.lineDashOffset = -sec * rr * 2;
            ctx.beginPath();
            ctx.arc(ex, ey, rr, 0, TAU);
            neonStroke(ctx, thin);
            ctx.setLineDash([]);

            for (let i = 0; i < 4; i++) {
                const a = -sec * 1.3 + (i * Math.PI) / 2;
                ctx.beginPath();
                ctx.arc(ex, ey, rr * 1.4, a, a + 0.9);
                neonStroke(ctx, thin);
            }

            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const an = fr.angle + (i * Math.PI) / 2;
                const far = rr * (i % 2 ? 2.6 : 3.4);
                ctx.moveTo(ex + Math.cos(an) * rr * 0.6, ey + Math.sin(an) * rr * 0.6);
                ctx.lineTo(ex + Math.cos(an) * far, ey + Math.sin(an) * far);
                // tanda ukur kecil di ujung
                const tx = ex + Math.cos(an) * far;
                const ty = ey + Math.sin(an) * far;
                ctx.moveTo(tx + Math.cos(an + Math.PI / 2) * rr * 0.12, ty + Math.sin(an + Math.PI / 2) * rr * 0.12);
                ctx.lineTo(tx - Math.cos(an + Math.PI / 2) * rr * 0.12, ty - Math.sin(an + Math.PI / 2) * rr * 0.12);
            }
            neonStroke(ctx, thin);

            // garis penunjuk ke blok teks
            const [l1x, l1y] = place(fr, ex, ey, -0.22, 0);
            const [l2x, l2y] = place(fr, ex, ey, -0.42, 0.15);
            const [b1x, b1y] = place(fr, ex, ey, -0.46, 0.22);
            const [b2x, b2y] = place(fr, ex, ey, -0.46, -0.28);
            ctx.beginPath();
            ctx.moveTo(l1x, l1y);
            ctx.lineTo(l2x, l2y);
            ctx.moveTo(b1x, b1y);
            ctx.lineTo(b2x, b2y);
            neonStroke(ctx, thin);
            ctx.restore();

            // ---- blok teks yang diketik (di sisi luar mata) ----
            const fs = Math.max(9, fw * 0.05);
            const align: CanvasTextAlign = mirrored ? "left" : "right";
            const pos = Math.floor(sec * 16) % TERMINATOR_TOTAL;
            typedLines(TERMINATOR_LINES, pos, 5).forEach((s, i) => {
                const [tx, ty] = place(fr, ex, ey, -0.5, 0.17 - i * 0.075);
                drawHudText(ctx, s, tx, ty, fs, "#ffb3a8", align, mirrored, "#ff2a2a");
            });

            // alis naik = ZOOM
            if (brow > 0.35) {
                const [zx, zy] = place(fr, ex, ey, 0, -0.3);
                drawHudText(
                    ctx,
                    `ZOOM x${(1 + brow * 3).toFixed(1)}`,
                    zx,
                    zy,
                    fs * 1.1,
                    "#ffffff",
                    "center",
                    mirrored,
                    "#ff2a2a"
                );
            }

            // reaksi mulut: buka = I'LL BE BACK, senyum = HUMOR DETECTED
            const [mx, my] = place(fr, chin.x * w, chin.y * h, 0, -0.2);
            if (open > 0.5) {
                drawHudChip(ctx, "I'LL BE BACK", mx, my, fs * 1.4, "#ff6b6b", mirrored, 0);
            } else if (smile > 0.6) {
                drawHudChip(ctx, "HUMOR DETECTED", mx, my, fs * 1.1, "#ff8a80", mirrored, 0);
            }
        });
    },
};

export const faceEffects: Effect[] = [
    filterEffect("normal", "Normal", "none"),
    headHearts,
    bunnyEars,
    kittyCat,
    battleDamage,
    ironHud,
    terminatorEye,
    flowerCrown,
    coquetteBow,
    faceGems,
    faceMeshNeon,
    sparkleEyes,
    blushFreckles,
    facePaint,
];

export const screenEffects: Effect[] = [
    filterEffect("normal", "Normal", "none"),
    spinBlur,
    aquarium,
    pixelEffect("vhs", "VHS", vhs, { maxW: 480, overlay: vhsOverlay }),
    asciiEffect("ascii", "ASCII", "green"),
    asciiEffect("ascii-color", "ASCII Color", "color"),
    pixelEffect("y2k", "Y2K Digicam", y2kGrade, { maxW: 560, overlay: y2kOverlay }),
    softGlow,
    filterEffect("bw", "Black & White", "grayscale(1)"),
    filterEffect("vintage", "Vintage", "sepia(0.8) contrast(1.1) saturate(1.3)"),
    pixelEffect("comic", "Comic Book", comicBook, { maxW: 1260, smooth: false }),
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

export const effects: Effect[] = [...screenEffects, ...faceEffects];

export function combineEffects(screen: Effect, face: Effect | null): Effect {
    if (!face) return screen;
    const f = face;

    return {
        id: `${screen.id}+${f.id}`,
        name: `${f.name} + ${screen.name}`,
        draw(ctx, video, w, h, t) {
            screen.draw(ctx, video, w, h, t);
            f.draw(ctx, video, w, h, t, true);
        },
    };
}