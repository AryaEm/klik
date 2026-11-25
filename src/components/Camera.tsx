"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import confetti from "canvas-confetti";
import {
    Camera as CameraIcon,
    Columns2,
    Download,
    FlipHorizontal2,
    Heart,
    Images,
    Rows4,
    Sparkles,
    Square,
    Trash2,
    X,
    Zap,
    ZapOff,
} from "lucide-react";
import EffectPanel from "@/components/EffectPanel";
import { useCamera } from "@/hooks/useCamera";
import { useRenderLoop } from "@/hooks/useRenderLoop";
import { captureSingle, composeStrip, type StripLayout } from "@/lib/capture";
import { effects, type Effect } from "@/lib/effects";

const COUNTDOWN_SECONDS = 3;
const NEXT_SHOT_SECONDS = 3;
const STRIP_SHOTS = 4;
const FLASH_MS = 150;

const CORNERS = ["tl", "tr", "bl", "br"] as const;
const LAYOUTS = [
    { id: "vertical", label: "1x4", title: "4 Foto ke Bawah", Icon: Rows4 },
    { id: "grid", label: "2×2", title: "2 Atas, 2 Bawah", Icon: Columns2 },
] as const;

const COUNT_STYLE: Record<number, { bg: string; label: string }> = {
    3: { bg: "bg-brand", label: "Siap-siap" },
    2: { bg: "bg-accent", label: "Senyum!" },
    1: { bg: "bg-sun", label: "Cheese!" },
};

type Mode = "single" | "strip";
type Photo = { url: string; w: number; h: number; kind: Mode; at: number };

const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(id);
            reject(signal.reason);
        };
        const id = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal.addEventListener("abort", onAbort, { once: true });
    });

function Notice({
    tone,
    title,
    children,
}: {
    tone: "danger" | "warn";
    title: string;
    children: ReactNode;
}) {
    return (
        <div className={`notice notice-${tone}`}>
            <p className="font-bold">{title}</p>
            <p className="mt-1 text-xs opacity-80 sm:text-sm">{children}</p>
        </div>
    );
}

// bentuk flat yang melayang di layar awal
function PlayShapes() {
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0">
            <span className="float-a absolute left-[12%] top-[16%] size-10 rounded-full bg-accent" />
            <span className="float-b absolute right-[13%] top-[22%] size-9 rotate-12 rounded-lg bg-brand" />
            <span className="float-c absolute bottom-[24%] left-[18%] size-7 rotate-45 bg-sun" />
            <span className="float-a absolute bottom-[16%] right-[20%] size-12 rounded-full border-4 border-brand" />
            <span className="float-b absolute bottom-[38%] right-[8%] h-3 w-12 -rotate-12 rounded-full bg-accent/80" />
        </div>
    );
}

export default function Camera() {
    const { videoRef, status, start } = useCamera();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const abortRef = useRef<AbortController | undefined>(undefined);

    // dibaca loop/proses jepret, jadi disimpan di ref
    const effectRef = useRef<Effect>(effects[0]);
    const mirrorRef = useRef(true);
    const flashRef = useRef(true);

    // dibaca UI
    const [effectId, setEffectId] = useState(effects[0].id);
    const [mirror, setMirror] = useState(true);
    const [flashOn, setFlashOn] = useState(true);
    const [mode, setMode] = useState<Mode>("single");
    const [stripLayout, setStripLayout] = useState<StripLayout>("vertical");
    const [busy, setBusy] = useState(false);
    const [count, setCount] = useState<number | null>(null);
    const [shotNo, setShotNo] = useState(0);
    const [flashing, setFlashing] = useState(false);
    const [photo, setPhoto] = useState<Photo | null>(null);

    useRenderLoop({
        video: videoRef,
        canvas: canvasRef,
        effect: effectRef,
        mirror: mirrorRef,
        enabled: status === "ready",
    });

    // bersihin proses yang jalan & object URL
    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        if (!photo) return;
        return () => URL.revokeObjectURL(photo.url);
    }, [photo]);

    const pickEffect = (e: Effect) => {
        effectRef.current = e;
        setEffectId(e.id);
    };

    const toggleMirror = () => {
        mirrorRef.current = !mirror;
        setMirror(!mirror);
    };

    const toggleFlash = () => {
        flashRef.current = !flashOn;
        setFlashOn(!flashOn);
    };

    const fireFlash = () => {
        if (!flashRef.current) return;
        setFlashing(true);
        setTimeout(() => setFlashing(false), FLASH_MS);
    };

    const triggerCelebration = () => {
        const base = {
            particleCount: 50,
            spread: 65,
            startVelocity: 55,
            ticks: 180,
            colors: ["#ff4d8d", "#22d3ee", "#ffd23f", "#ededf0"],
            shapes: ["square", "circle"] as ("square" | "circle")[],
        };
        confetti({ ...base, angle: 60, origin: { x: 0, y: 0.75 } });
        confetti({ ...base, angle: 120, origin: { x: 1, y: 0.75 } });
    };

    const countdown = async (seconds: number, signal: AbortSignal) => {
        for (let n = seconds; n > 0; n--) {
            setCount(n);
            await wait(1000, signal);
        }
        setCount(null);
    };

    const run = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const kind = mode;
        const total = kind === "strip" ? STRIP_SHOTS : 1;
        const frames: ImageBitmap[] = [];

        setBusy(true);
        try {
            for (let i = 0; i < total; i++) {
                setShotNo(kind === "strip" ? i + 1 : 0);
                await countdown(i === 0 ? COUNTDOWN_SECONDS : NEXT_SHOT_SECONDS, ctrl.signal);
                fireFlash();
                if (kind === "strip") frames.push(await createImageBitmap(canvas));
            }

            const result =
                kind === "strip"
                    ? await composeStrip(frames, stripLayout)
                    : await captureSingle(canvas);
            if (result) {
                setPhoto({
                    url: URL.createObjectURL(result.blob),
                    w: result.width,
                    h: result.height,
                    kind,
                    at: Date.now(),
                });
                triggerCelebration();
            }
        } catch (e) {
            if (!ctrl.signal.aborted) throw e;
        } finally {
            frames.forEach((f) => f.close());
            setCount(null);
            setShotNo(0);
            setBusy(false);
            abortRef.current = undefined;
        }
    };

    const cancel = () => abortRef.current?.abort();

    const current = effects.find((e) => e.id === effectId);
    const countStyle = count !== null ? (COUNT_STYLE[count] ?? COUNT_STYLE[3]) : null;

    return (
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-3 overflow-hidden px-3 pb-3 sm:px-5 sm:pb-4 lg:flex-row lg:gap-5">
            <video
                ref={videoRef}
                muted
                playsInline
                className="pointer-events-none absolute size-px opacity-0"
            />

            {/* ===== kiri: card efek (paging otomatis kalau tidak muat) ===== */}
            <aside className="order-2 shrink-0 lg:order-1 lg:h-full lg:min-h-0 lg:w-60 xl:w-64">
                <EffectPanel effects={effects} activeId={effectId} onPick={pickEffect} />
            </aside>

            {/* ===== tengah: kamera + kontrol ===== */}
            <section className="order-1 flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4 lg:order-2">
                <div
                    data-counting={count !== null}
                    className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-2xl border-2 border-line-strong bg-surface-1"
                >
                    <canvas ref={canvasRef} className="h-full w-full object-contain" />

                    {status === "ready" &&
                        CORNERS.map((c) => <div key={c} className={`corner corner-${c}`} />)}

                    {/* stiker status di tengah atas: LIVE atau nomor pose */}
                    {status === "ready" &&
                        (shotNo > 0 ? (
                            <span
                                key={shotNo}
                                className="sticker sticker-pink anim-pop absolute left-1/2 top-3 -translate-x-1/2 rotate-2 sm:top-4"
                            >
                                <Sparkles className="size-3.5" />
                                Pose {shotNo}/{STRIP_SHOTS}
                            </span>
                        ) : (
                            <span className="sticker sticker-dark absolute left-1/2 top-3 -translate-x-1/2 -rotate-2 sm:top-4">
                                <span className="size-2 animate-pulse rounded-full bg-red-500" />
                                LIVE
                            </span>
                        ))}

                    {/* stiker nama efek di tengah bawah */}
                    {status === "ready" && current && (
                        <span
                            key={effectId}
                            className="sticker sticker-cyan anim-pop absolute bottom-3 left-1/2 -translate-x-1/2 rotate-1 sm:bottom-4"
                        >
                            {current.name}
                        </span>
                    )}

                    {status !== "ready" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-hidden bg-surface-1 p-4 text-center">
                            {status !== "denied" && status !== "error" && <PlayShapes />}

                            {status === "denied" ? (
                                <Notice tone="danger" title="Akses kamera ditolak">
                                    Izinkan akses kamera di pengaturan browser kamu lalu muat ulang halaman.
                                </Notice>
                            ) : status === "error" ? (
                                <Notice tone="warn" title="Kamera nggak kebuka">
                                    Pastikan kamera tidak sedang dipakai aplikasi lain.
                                </Notice>
                            ) : (
                                <div className="relative flex flex-col items-center gap-5">
                                    <div>
                                        <p className="text-2xl font-black tracking-tight sm:text-4xl">
                                            Siap foto-foto?
                                        </p>
                                        <p className="mt-1.5 text-sm text-muted sm:text-base">
                                            Nyalakan kameranya dulu ya.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={start}
                                        disabled={status === "loading"}
                                        className="btn-start group"
                                    >
                                        <CameraIcon
                                            className={`size-6 ${status === "loading" ? "animate-pulse" : "wiggle"
                                                }`}
                                        />
                                        <span>
                                            {status === "loading" ? "Menyiapkan..." : "Nyalakan kamera"}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* countdown: lingkaran warna membal + cincin yang mengecil */}
                    {/* countdown: di pojok kanan atas supaya wajah tetap kelihatan */}
                    {count !== null && countStyle && (
                        <div
                            aria-live="assertive"
                            className="pointer-events-none absolute right-4 top-4 sm:right-6 sm:top-6"
                        >
                            <div key={count} className="count-pop flex flex-col items-center gap-3">
                                <div
                                    className={`relative grid size-20 place-items-center rounded-full text-brand-ink sm:size-28 ${countStyle.bg}`}
                                    style={{ boxShadow: "0 5px 0 0 rgb(0 0 0 / 0.5)" }}
                                >
                                    <svg
                                        viewBox="0 0 100 100"
                                        aria-hidden
                                        className="absolute -left-2 -top-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] -rotate-90 text-white"
                                    >
                                        <circle
                                            cx="50"
                                            cy="50"
                                            r="48"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            pathLength={1}
                                            className="count-ring"
                                        />
                                    </svg>
                                    <span className="font-mono text-5xl font-black sm:text-7xl">{count}</span>
                                </div>
                                <span className="sticker sticker-dark rotate-2 text-xs sm:text-sm">
                                    {countStyle.label}
                                </span>
                            </div>
                        </div>
                    )}
                    <div
                        aria-hidden
                        className={`pointer-events-none absolute inset-0 bg-white ${flashing ? "opacity-100" : "opacity-0 transition-opacity duration-500"
                            }`}
                    />
                </div>

                {/* kolom tengah (jepret) selalu di tengah; kiri & kanan berbagi sisa ruang sama rata */}
                <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pb-1.5">
                    <div className="flex items-center gap-1.5 justify-self-start sm:gap-2">
                        <div className="segmented">
                            {(["single", "strip"] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    disabled={busy}
                                    aria-pressed={mode === m}
                                    title={m === "single" ? "1 Foto" : `${STRIP_SHOTS} Foto`}
                                    className="seg-btn"
                                >
                                    {m === "single" ? (
                                        <>
                                            <Square className="size-4" />
                                            <span className="hidden sm:inline">1 Foto</span>
                                        </>
                                    ) : (
                                        <>
                                            <Images className="size-4" />
                                            <span className="hidden sm:inline">{STRIP_SHOTS}x</span>
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>

                        {mode === "strip" && (
                            <div className="segmented">
                                {LAYOUTS.map(({ id, label, title, Icon }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setStripLayout(id)}
                                        disabled={busy}
                                        aria-pressed={stripLayout === id}
                                        title={title}
                                        className="seg-btn"
                                    >
                                        <Icon className="size-4" />
                                        <span className="hidden xl:inline">{label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* satu tombol, ukuran tetap: jepret <-> batal */}
                    <button
                        type="button"
                        onClick={busy ? cancel : run}
                        disabled={!busy && status !== "ready"}
                        aria-label={
                            busy ? "Batal" : mode === "strip" ? `Ambil ${STRIP_SHOTS} foto` : "Ambil foto"
                        }
                        className={`shutter group ${busy ? "shutter-stop" : ""}`}
                    >
                        <span
                            className={`grid size-10 place-items-center rounded-full transition-transform duration-300 group-hover:rotate-[20deg] max-sm:bg-transparent ${busy ? "bg-red-500 text-white max-sm:text-red-300" : "bg-brand-ink text-brand max-sm:text-brand-ink"
                                }`}
                        >
                            {busy ? <X className="size-5" /> : <CameraIcon className="size-5" />}
                        </span>
                        <span className="hidden sm:inline">
                            {busy ? "Batal" : mode === "strip" ? `Jepret ${STRIP_SHOTS}x!` : "Jepret!"}
                        </span>
                    </button>

                    <div className="flex items-center gap-1.5 justify-self-end sm:gap-2">
                        <button
                            type="button"
                            onClick={toggleMirror}
                            aria-pressed={mirror}
                            title="Flip horizontal (mirror)"
                            className="toggle-btn toggle-cyan"
                        >
                            <FlipHorizontal2 className="size-4" />
                            <span className="hidden xl:inline">Mirror</span>
                        </button>

                        <button
                            type="button"
                            onClick={toggleFlash}
                            aria-pressed={flashOn}
                            title="Flash layar"
                            className="toggle-btn toggle-sun"
                        >
                            {flashOn ? <Zap className="size-4" /> : <ZapOff className="size-4" />}
                            <span className="hidden xl:inline">Flash</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* ===== kanan: sengaja dikosongkan untuk fitur berikutnya ===== */}
            <div aria-hidden className="order-3 hidden lg:block lg:w-60 lg:shrink-0 xl:w-64" />

            {/* ===== hasil: polaroid yang jatuh ===== */}
            {photo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4">
                    <div className="relative flex max-h-[94dvh] w-full max-w-md flex-col items-center gap-6 rounded-3xl border-2 border-line-strong bg-surface-1 p-4 pt-9 sm:p-6 sm:pt-10">
                        <span className="sticker sticker-pink absolute -top-3.5 left-1/2 -translate-x-1/2 -rotate-3 text-sm">
                            <Sparkles className="size-4" />
                            Hasilnya!
                        </span>

                        <button
                            type="button"
                            onClick={() => setPhoto(null)}
                            aria-label="Tutup"
                            className="nav-btn absolute right-3 top-3"
                        >
                            <X className="size-4" />
                        </button>

                        <div className="photo-drop relative min-h-0 flex-1">
                            <span
                                aria-hidden
                                className="absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 rotate-3 bg-sun/90"
                            />
                            <div className="rounded-sm bg-white p-3 pb-4 shadow-[6px_8px_0_0_#000]">
                                <Image
                                    src={photo.url}
                                    alt={photo.kind === "strip" ? "Hasil photo strip" : "Hasil foto"}
                                    width={photo.w}
                                    height={photo.h}
                                    unoptimized
                                    className="max-h-[45dvh] w-auto object-contain"
                                />
                                <div className="mt-3 flex items-center justify-between font-mono text-[11px] font-bold text-zinc-700">
                                    <span>
                                        {new Date(photo.at).toLocaleDateString("id-ID", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                        })}
                                    </span>
                                    <Heart className="size-4 fill-brand text-brand" />
                                </div>
                            </div>
                        </div>

                        <div className="flex w-full shrink-0 gap-3">
                            <button
                                type="button"
                                onClick={() => setPhoto(null)}
                                className="btn-action btn-ghost flex-1"
                            >
                                <Trash2 className="size-4" />
                                <span>Buang</span>
                            </button>
                            <a
                                href={photo.url}
                                download={`webcam-toy-${photo.kind}-${photo.at}.png`}
                                className="btn-action btn-primary group flex-[2]"
                            >
                                <Download className="size-5 group-hover:animate-bounce" />
                                <span>Simpan foto</span>
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}