import type { ReactNode } from "react";
import type { Effect } from "@/lib/effects";

const HEART =
    "M0 5C0 2-4-2-8-2C-13-2-13 4.5-13 4.5C-13 8.5-7 12.5 0 16C7 12.5 13 8.5 13 4.5C13 4.5 13-2 8-2C4-2 0 2 0 5Z";

const Bg = ({ fill }: { fill: string }) => <rect width="96" height="56" fill={fill} />;

const PIXEL_TONES = ["#2a2a31", "#3b3b44", "#52525c", "#ff4d8d", "#22d3ee"];
const THERMAL = ["#000028", "#5a00a0", "#dc1e28", "#ffc800", "#ffffe6"];

const Flower = ({
    x,
    y,
    r,
    petal,
    center,
}: {
    x: number;
    y: number;
    r: number;
    petal: string;
    center: string;
}) => (
    <g transform={`translate(${x} ${y})`}>
        {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
                <circle
                    key={i}
                    cx={Math.cos(a) * r * 0.6}
                    cy={Math.sin(a) * r * 0.6}
                    r={r * 0.45}
                    fill={petal}
                />
            );
        })}
        <circle r={r * 0.32} fill={center} />
    </g>
);

const Star = ({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) => (
    <path
        transform={`translate(${x} ${y})`}
        d={`M0 ${-r}Q${r * 0.2} ${-r * 0.2} ${r} 0Q${r * 0.2} ${r * 0.2} 0 ${r}Q${-r * 0.2} ${r * 0.2} ${-r} 0Q${-r * 0.2} ${-r * 0.2} 0 ${-r}Z`}
        fill={fill}
    />
);

const BOW_LOOP =
    "M0 0C-.25 -.5 -.8 -.6 -1 -.38C-1.14 -.12 -1.12 .22 -.98 .42C-.8 .62 -.25 .48 0 0Z";
const BOW_TAIL = "M-.04 .1L-.52 1L-.4 .88L-.24 1.06L0 .16Z";

const ASCII_CHARS = " .:-=+*#%@";
const ASCII_ROWS = Array.from({ length: 14 }, (_, r) =>
    Array.from({ length: 32 }, (_, c) => {
        const x = (c + 0.5) * 3 - 48;
        const y = (r + 0.5) * 4 - 28;
        const v = Math.max(0, 1 - Math.hypot(x, y) / 22) ** 0.6;
        const ch = ASCII_CHARS[Math.floor(v * (ASCII_CHARS.length - 1))];
        return ch === " " ? "\u00a0" : ch;
    }).join("")
);

const AsciiArt = ({ bg, fill }: { bg: string; fill: string }) => (
    <>
        <Bg fill={bg} />
        {ASCII_ROWS.map((row, i) => (
            <text
                key={i}
                x="0"
                y={i * 4 + 3.4}
                textLength="96"
                lengthAdjust="spacingAndGlyphs"
                fontFamily="monospace"
                fontSize="4.4"
                fontWeight="700"
                fill={fill}
            >
                {row}
            </text>
        ))}
    </>
);

const Gem = ({
    x,
    y,
    r,
    top,
    mid,
    bot,
}: {
    x: number;
    y: number;
    r: number;
    top: string;
    mid: string;
    bot: string;
}) => (
    <g transform={`translate(${x} ${y})`} strokeLinejoin="round">
        <path
            d={`M${-0.55 * r} ${-0.7 * r}L${0.55 * r} ${-0.7 * r}L${r} ${-0.1 * r}L0 ${r}L${-r} ${-0.1 * r}Z`}
            fill={mid}
        />
        <path
            d={`M${-0.55 * r} ${-0.7 * r}L${0.55 * r} ${-0.7 * r}L${r} ${-0.1 * r}L${-r} ${-0.1 * r}Z`}
            fill={top}
            opacity=".6"
        />
        <path d={`M${-r} ${-0.1 * r}L${r} ${-0.1 * r}L0 ${r}Z`} fill={bot} opacity=".8" />
        <path
            d={`M${-0.55 * r} ${-0.7 * r}L${-0.25 * r} ${-0.1 * r}L0 ${r}`}
            stroke="#fff"
            strokeOpacity=".6"
            strokeWidth=".4"
            fill="none"
        />
    </g>
);

// jaring wajah sederhana untuk card Face Mesh: 3 cincin elips + jari-jari
const MESH_N = 10;
const MESH_RINGS = [0.38, 0.7, 1].map((k) =>
    Array.from({ length: MESH_N }, (_, i) => {
        const a = (i / MESH_N) * Math.PI * 2;
        return [48 + Math.cos(a) * k * 17, 28 + Math.sin(a) * k * 22] as const;
    })
);
const pt = (p: readonly [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const MESH_INNER =
    MESH_RINGS.slice(0, 2)
        .map((ring) => `M${ring.map(pt).join("L")}Z`)
        .join("") +
    MESH_RINGS[0].map((p) => `M48 28L${pt(p)}`).join("") +
    [0, 1]
        .map((k) =>
            MESH_RINGS[k]
                .map(
                    (p, i) =>
                        `M${pt(p)}L${pt(MESH_RINGS[k + 1][i])}M${pt(p)}L${pt(
                            MESH_RINGS[k + 1][(i + 1) % MESH_N]
                        )}`
                )
                .join("")
        )
        .join("");
const MESH_OUTER = `M${MESH_RINGS[2].map(pt).join("L")}Z`;

const Star5 = ({
    x,
    y,
    r,
    fill,
    stroke,
}: {
    x: number;
    y: number;
    r: number;
    fill: string;
    stroke: string;
}) => (
    <polygon
        points={Array.from({ length: 10 }, (_, i) => {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const rr = i % 2 ? r * 0.45 : r;
            return `${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`;
        }).join(" ")}
        fill={fill}
        stroke={stroke}
        strokeWidth=".5"
        strokeLinejoin="round"
    />
);

const MiniHeart = ({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
        <path d={HEART} fill={fill} />
    </g>
);

const RAINBOW_COLORS = ["#ff4d6d", "#ffa94d", "#ffe14d", "#5fdc8a", "#4db8ff", "#b58cff"];

const BURST = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 7 : 11;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
}).join(" ");

const ART: Record<string, ReactNode> = {
    normal: (
        <>
            <Bg fill="#1a1a1f" />
            <circle cx="48" cy="28" r="13" fill="none" stroke="#ededf0" strokeWidth="2" />
            <circle cx="48" cy="28" r="4" fill="#ededf0" />
        </>
    ),
    ascii: <AsciiArt bg="#020b05" fill="#4ade80" />,
    "ascii-color": <AsciiArt bg="#0b0b10" fill="#ff4d8d" />,
    "head-hearts": (
        <>
            <Bg fill="#1d0b14" />
            <g transform="translate(46 15) scale(.85)">
                <path d={HEART} fill="#ff2e7e" />
            </g>
            <g transform="translate(29 23) scale(.55)">
                <path d={HEART} fill="#ff4d8d" />
            </g>
            <g transform="translate(63 22) scale(.65)">
                <path d={HEART} fill="#ff6fa5" />
            </g>
            <g transform="translate(38 37) scale(.35)">
                <path d={HEART} fill="#ff6fa5" />
            </g>
            <g transform="translate(57 36) scale(.4)">
                <path d={HEART} fill="#ff2e7e" />
            </g>
            <g transform="translate(76 13) scale(.3)">
                <path d={HEART} fill="#ff4d8d" />
            </g>
        </>
    ),
    bunny: (
        <>
            <Bg fill="#1a1a1f" />
            <g transform="rotate(-10 38 36)">
                <ellipse cx="38" cy="20" rx="6" ry="16" fill="#fff7fb" />
                <ellipse cx="38" cy="21" rx="2.5" ry="10" fill="#ff9ec4" />
            </g>
            <g transform="rotate(10 58 36)">
                <ellipse cx="58" cy="20" rx="6" ry="16" fill="#fff7fb" />
                <ellipse cx="58" cy="21" rx="2.5" ry="10" fill="#ff9ec4" />
            </g>
            <circle cx="34" cy="49" r="4" fill="#ff4d8d" opacity=".55" />
            <circle cx="62" cy="49" r="4" fill="#ff4d8d" opacity=".55" />
        </>
    ),
    "soft-glow": (
        <>
            <Bg fill="#1a1a1f" />
            <circle cx="48" cy="28" r="24" fill="#ff4d8d" opacity=".12" />
            <circle cx="48" cy="28" r="16" fill="#ff4d8d" opacity=".28" />
            <circle cx="48" cy="28" r="8" fill="#ff4d8d" opacity=".8" />
        </>
    ),
    "cat-ears": (
        <>
            <Bg fill="#1a1a1f" />
            {/* telinga kiri, kanan = cermin */}
            <path d="M10 30Q8 16 14 5Q26 12 32 30Z" fill="#ffd9b8" stroke="#f0a878" strokeWidth="1" strokeLinejoin="round" />
            <path d="M15 28Q14 18 15 12Q23 16 27 28Z" fill="#ff9fbd" />
            <g transform="translate(96 0) scale(-1 1)">
                <path d="M10 30Q8 16 14 5Q26 12 32 30Z" fill="#ffd9b8" stroke="#f0a878" strokeWidth="1" strokeLinejoin="round" />
                <path d="M15 28Q14 18 15 12Q23 16 27 28Z" fill="#ff9fbd" />
            </g>
            <ellipse cx="48" cy="38" rx="19" ry="16" fill="#2a2a31" />
            <circle cx="30" cy="42" r="5" fill="#ff4d8d" opacity=".3" />
            <circle cx="66" cy="42" r="5" fill="#ff4d8d" opacity=".3" />
            {/* kumis */}
            {[
                [10, 35],
                [8, 41],
                [11, 47],
            ].map(([x, y]) => (
                <g key={y} stroke="#fff" strokeWidth="1" strokeLinecap="round" fill="none" opacity=".9">
                    <path d={`M31 41Q${(31 + x) / 2} ${(41 + y) / 2 + 2} ${x} ${y}`} />
                    <path d={`M65 41Q${(65 + 96 - x) / 2} ${(41 + y) / 2 + 2} ${96 - x} ${y}`} />
                </g>
            ))}
            <path
                d="M44.5 36Q48 34.5 51.5 36Q51 38.5 48 40.5Q45 38.5 44.5 36Z"
                fill="#ff7fa8"
                stroke="#d9568a"
                strokeWidth=".5"
                strokeLinejoin="round"
            />
            {/* balon meow */}
            <rect x="33" y="3" width="30" height="12" rx="6" fill="#fff" stroke="#ff4d8d" strokeWidth="1" />
            <path d="M38 14L36 19L43 14Z" fill="#fff" stroke="#ff4d8d" strokeWidth="1" strokeLinejoin="round" />
            <path d="M38.5 13.6L42.5 13.6" stroke="#fff" strokeWidth="1.4" />
            <text x="48" y="12" textAnchor="middle" fontSize="7" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#ff4d8d">
                MEOW!
            </text>
        </>
    ),
    "freckles-blush": (
        <>
            <defs>
                <radialGradient id="fx-blush-g">
                    <stop offset="0" stopColor="#ff4d8d" stopOpacity=".8" />
                    <stop offset="1" stopColor="#ff4d8d" stopOpacity="0" />
                </radialGradient>
            </defs>
            <Bg fill="#1d0b14" />
            <ellipse cx="48" cy="29" rx="23" ry="25" fill="#2a1a22" />
            <ellipse cx="28" cy="35" rx="15" ry="11" fill="url(#fx-blush-g)" />
            <ellipse cx="68" cy="35" rx="15" ry="11" fill="url(#fx-blush-g)" />
            <ellipse cx="48" cy="33" rx="5" ry="4" fill="url(#fx-blush-g)" opacity=".7" />
            {/* garis blush anime */}
            {[28, 68].map((cx) => (
                <g key={cx} stroke="#ff3d7f" strokeWidth="1.1" strokeLinecap="round">
                    <line x1={cx - 5} y1="38" x2={cx - 3} y2="34" />
                    <line x1={cx - 1} y1="38" x2={cx + 1} y2="34" />
                    <line x1={cx + 3} y1="38" x2={cx + 5} y2="34" />
                </g>
            ))}
            {/* bintik */}
            {[
                [43, 30, 0.9],
                [38, 33, 1.1],
                [33, 29, 0.8],
                [29, 33, 1],
                [40, 37, 0.7],
                [53, 30, 0.9],
                [58, 33, 1.1],
                [63, 29, 0.8],
                [67, 33, 1],
                [56, 37, 0.7],
                [48, 28, 0.8],
            ].map(([x, y, r]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#c26a4a" opacity=".85" />
            ))}
            <MiniHeart x={20} y={14} s={0.4} fill="#ff6fa5" />
            <MiniHeart x={14} y={26} s={0.28} fill="#ff2e7e" />
            <MiniHeart x={76} y={14} s={0.4} fill="#ff4d8d" />
            <MiniHeart x={83} y={27} s={0.28} fill="#ff6fa5" />
            <Star x={48} y={14} r={3} fill="#fff3a6" />
        </>
    ),
    "face-paint": (
        <>
            <Bg fill="#15151a" />
            <ellipse cx="48" cy="30" rx="20" ry="24" fill="#2a2a31" />
            <circle cx="41" cy="26" r="1.4" fill="#ededf0" />
            <circle cx="55" cy="26" r="1.4" fill="#ededf0" />
            {/* pelangi + awan */}
            {RAINBOW_COLORS.map((c, i) => {
                const r = 11 - i * 1.7;
                return (
                    <path
                        key={c}
                        d={`M${27 - r} 42A${r} ${r} 0 0 1 ${27 + r} 42`}
                        stroke={c}
                        strokeWidth="1.8"
                        fill="none"
                    />
                );
            })}
            <circle cx="16" cy="43" r="2.6" fill="#fff" />
            <circle cx="14.5" cy="45" r="2" fill="#fff" />
            <circle cx="38" cy="43" r="2.6" fill="#fff" />
            <circle cx="39.5" cy="45" r="2" fill="#fff" />
            {/* kupu-kupu */}
            <g transform="translate(70 38)">
                <ellipse cx="5" cy="-4" rx="6" ry="4.5" transform="rotate(-30 5 -4)" fill="#b58cff" stroke="#7a4fd1" strokeWidth=".5" />
                <ellipse cx="-5" cy="-4" rx="6" ry="4.5" transform="rotate(30 -5 -4)" fill="#b58cff" stroke="#7a4fd1" strokeWidth=".5" />
                <ellipse cx="4" cy="4" rx="4" ry="3" transform="rotate(30 4 4)" fill="#ff8fc4" stroke="#d63a82" strokeWidth=".5" />
                <ellipse cx="-4" cy="4" rx="4" ry="3" transform="rotate(-30 -4 4)" fill="#ff8fc4" stroke="#d63a82" strokeWidth=".5" />
                <circle cx="6" cy="-5" r="1.2" fill="#fff" />
                <circle cx="-6" cy="-5" r="1.2" fill="#fff" />
                <ellipse rx=".9" ry="6" fill="#4a2d6b" />
            </g>
            {/* bintang bawah mata + jejak titik */}
            <Star5 x={39} y={33} r={3.4} fill="#ffe14d" stroke="#ff9a2e" />
            <Star5 x={57} y={33} r={3.4} fill="#ffe14d" stroke="#ff9a2e" />
            <circle cx="34" cy="30" r="1.1" fill="#ff4d8d" />
            <circle cx="31.5" cy="33" r=".9" fill="#22d3ee" />
            <circle cx="62" cy="30" r="1.1" fill="#22d3ee" />
            <circle cx="64.5" cy="33" r=".9" fill="#ffe14d" />
            {/* dahi + hidung */}
            <circle cx="38" cy="12" r=".9" fill="#22d3ee" />
            <circle cx="42" cy="12" r="1.2" fill="#ff4d8d" />
            <circle cx="54" cy="12" r="1.2" fill="#ffe14d" />
            <circle cx="58" cy="12" r=".9" fill="#b58cff" />
            <MiniHeart x={48} y={8.5} s={0.3} fill="#ff4d8d" />
            <circle cx="48" cy="34" r="2" fill="#ff5c8a" />
            <circle cx="47.3" cy="33.3" r=".6" fill="#fff" />
            {/* glitter */}
            <Star x={14} y={14} r={3} fill="#ffffff" />
            <Star x={82} y={16} r={3.5} fill="#fff3a6" />
            <Star x={84} y={46} r={2.5} fill="#c9ecff" />
            <Star x={10} y={30} r={2} fill="#ffc9de" />
        </>
    ),
    y2k: (
        <>
            <Bg fill="#15110d" />
            <text
                x="48"
                y="32"
                textAnchor="middle"
                fontFamily="monospace"
                fontSize="12"
                fontWeight="700"
                fill="#ff9a2e"
            >
                {"'26 11 25"}
            </text>
        </>
    ),
    bw: (
        <>
            <rect width="48" height="56" fill="#f4f4f5" />
            <rect x="48" width="48" height="56" fill="#0a0a0a" />
            <path d="M48 14a14 14 0 0 0 0 28z" fill="#0a0a0a" />
            <path d="M48 14a14 14 0 0 1 0 28z" fill="#f4f4f5" />
        </>
    ),
    vintage: (
        <>
            <Bg fill="#2b1f16" />
            <rect x="6" y="6" width="84" height="44" fill="#c9a27a" />
            <circle cx="48" cy="28" r="10" fill="#7a5233" />
        </>
    ),
    comic: (
        <>
            <defs>
                <pattern id="fx-dots-m" width="8" height="8" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1.8" fill="#ec008c" />
                </pattern>
                <pattern
                    id="fx-dots-c"
                    width="8"
                    height="8"
                    patternUnits="userSpaceOnUse"
                    patternTransform="translate(4 4)"
                >
                    <circle cx="2" cy="2" r="1.8" fill="#00aeef" />
                </pattern>
            </defs>
            <Bg fill="#f8f8f6" />
            <rect width="96" height="56" fill="url(#fx-dots-m)" />
            <rect width="96" height="56" fill="url(#fx-dots-c)" />
        </>
    ),
    pop: (
        <>
            <rect width="48" height="28" fill="#ff4d8d" />
            <rect x="48" width="48" height="28" fill="#22d3ee" />
            <rect y="28" width="48" height="28" fill="#facc15" />
            <rect x="48" y="28" width="48" height="28" fill="#a855f7" />
        </>
    ),
    xray: (
        <>
            <Bg fill="#000" />
            <ellipse cx="48" cy="26" rx="14" ry="17" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="41" cy="24" r="3.5" fill="#fff" />
            <circle cx="55" cy="24" r="3.5" fill="#fff" />
        </>
    ),
    "flower-crown": (
        <>
            <Bg fill="#1a1a1f" />
            <ellipse cx="22" cy="24" rx="5" ry="2" fill="#a8dcae" transform="rotate(-30 22 24)" />
            <ellipse cx="35" cy="17" rx="5" ry="2" fill="#a8dcae" transform="rotate(-15 35 17)" />
            <ellipse cx="61" cy="17" rx="5" ry="2" fill="#a8dcae" transform="rotate(15 61 17)" />
            <ellipse cx="74" cy="24" rx="5" ry="2" fill="#a8dcae" transform="rotate(30 74 24)" />
            <Flower x={14} y={31} r={8} petal="#ffd1e3" center="#ffd966" />
            <Flower x={28} y={21} r={10} petal="#ffffff" center="#ffb3cf" />
            <Flower x={48} y={16} r={12} petal="#d9c9ff" center="#fff1a8" />
            <Flower x={68} y={21} r={10} petal="#ffb8cc" center="#fff4c2" />
            <Flower x={82} y={31} r={8} petal="#ffd1e3" center="#ffd966" />
            <circle cx="48" cy="46" r="7" fill="none" stroke="#3b3b44" strokeWidth="2" />
        </>
    ),
    "coquette-bow": (
        <>
            <Bg fill="#1d0b14" />
            <g transform="translate(48 22) scale(17)" strokeLinejoin="round">
                <path d={BOW_TAIL} fill="#ff9fc2" stroke="#f08cb0" strokeWidth=".05" />
                <path
                    d={BOW_TAIL}
                    transform="scale(-1 1)"
                    fill="#ff9fc2"
                    stroke="#f08cb0"
                    strokeWidth=".05"
                />
                <path d={BOW_LOOP} fill="#ffb6cf" stroke="#f08cb0" strokeWidth=".05" />
                <path
                    d={BOW_LOOP}
                    transform="scale(-1 1)"
                    fill="#ffb6cf"
                    stroke="#f08cb0"
                    strokeWidth=".05"
                />
                <ellipse cy=".02" rx=".17" ry=".22" fill="#ff8fb4" stroke="#f08cb0" strokeWidth=".05" />
            </g>
            <Star x={20} y={14} r={4} fill="#ffffff" />
            <Star x={78} y={12} r={3} fill="#fff3a6" />
            <Star x={74} y={44} r={2.5} fill="#c9ecff" />
        </>
    ),
    "sparkle-eyes": (
        <>
            <Bg fill="#15151a" />
            <circle cx="30" cy="30" r="9" fill="#2a2a31" />
            <circle cx="66" cy="30" r="9" fill="#2a2a31" />
            <Star x={30} y={30} r={7} fill="#ffffff" />
            <Star x={66} y={30} r={7} fill="#ffffff" />
            <Star x={42} y={16} r={4} fill="#fff3a6" />
            <Star x={78} y={15} r={3.5} fill="#ffc9de" />
            <Star x={18} y={16} r={3} fill="#c9ecff" />
            <Star x={55} y={44} r={2.5} fill="#ffffff" />
        </>
    ),
    "spin-blur": (
        <>
            <Bg fill="#15151a" />
            {[-24, -18, -12, -6, 0, 6, 12, 18, 24].map((deg, i) => (
                <rect
                    key={deg}
                    x="20"
                    y="14"
                    width="56"
                    height="28"
                    rx="4"
                    fill={i % 2 ? "#22d3ee" : "#ff4d8d"}
                    opacity=".16"
                    transform={`rotate(${deg} 48 28)`}
                />
            ))}
            <rect x="34" y="20" width="28" height="16" rx="3" fill="#ededf0" opacity=".9" />
            <path
                d="M16 40A34 34 0 0 0 40 52M80 16A34 34 0 0 0 56 4"
                stroke="#ededf0"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                opacity=".7"
            />
        </>
    ),
    "face-gems": (
        <>
            <Bg fill="#1d0b14" />
            <ellipse cx="48" cy="29" rx="17" ry="22" fill="none" stroke="#3b3b44" strokeWidth="1.5" />
            {/* permata dahi */}
            <Gem x={48} y={12} r={6} top="#ffe3f1" mid="#ff7fb5" bot="#d63a82" />
            <Gem x={40} y={14} r={3} top="#e6fbff" mid="#5fdcf5" bot="#1e9bc0" />
            <Gem x={56} y={14} r={3} top="#e6fbff" mid="#5fdcf5" bot="#1e9bc0" />
            {/* jejak permata di mata */}
            <Gem x={33} y={28} r={2.2} top="#efe3ff" mid="#b794ff" bot="#7a4fd1" />
            <Gem x={31} y={33} r={1.8} top="#fff7cf" mid="#ffd34d" bot="#d99a12" />
            <Gem x={63} y={28} r={2.2} top="#efe3ff" mid="#b794ff" bot="#7a4fd1" />
            <Gem x={65} y={33} r={1.8} top="#fff7cf" mid="#ffd34d" bot="#d99a12" />
            {/* bintang pipi */}
            <Star x={29} y={39} r={6} fill="#ffc9de" />
            <Star x={67} y={39} r={6} fill="#ffc9de" />
            <Star x={22} y={33} r={2.6} fill="#fff3a6" />
            <Star x={74} y={46} r={2.4} fill="#c9ecff" />
            <Star x={84} y={14} r={3} fill="#ffffff" />
            <Star x={12} y={12} r={2.4} fill="#fff3a6" />
        </>
    ),
    "face-mesh": (
        <>
            <Bg fill="#06001a" />
            <path d={MESH_INNER} stroke="#22d3ee" strokeOpacity=".18" strokeWidth="2.2" fill="none" />
            <path d={MESH_INNER} stroke="#22d3ee" strokeOpacity=".9" strokeWidth=".45" fill="none" />
            <path d={MESH_OUTER} stroke="#ff4d8d" strokeOpacity=".3" strokeWidth="3" fill="none" />
            <path d={MESH_OUTER} stroke="#ff9ec4" strokeWidth=".9" fill="none" />
            {[41, 55].map((x) => (
                <g key={x}>
                    <ellipse cx={x} cy="24" rx="4.2" ry="2.2" stroke="#ff4d8d" strokeOpacity=".35" strokeWidth="2.4" fill="none" />
                    <ellipse cx={x} cy="24" rx="4.2" ry="2.2" stroke="#ffd1e3" strokeWidth=".8" fill="none" />
                </g>
            ))}
            <ellipse cx="48" cy="40" rx="5.5" ry="2" stroke="#ff4d8d" strokeOpacity=".35" strokeWidth="2.4" fill="none" />
            <ellipse cx="48" cy="40" rx="5.5" ry="2" stroke="#ffd1e3" strokeWidth=".8" fill="none" />
        </>
    ),
    "scar-damage": (
        <>
            <Bg fill="#1a1a1f" />
            <ellipse cx="48" cy="32" rx="19" ry="23" fill="#3a2a30" />
            {/* mata lebam */}
            <ellipse cx="57" cy="30" rx="8.5" ry="6" fill="#c8c040" opacity=".25" />
            <ellipse cx="57" cy="30" rx="6.5" ry="4.5" fill="#7a3fb0" opacity=".8" />
            <circle cx="41" cy="28" r="1.5" fill="#ededf0" />
            <circle cx="55" cy="28" r="1.5" fill="#ededf0" />
            {/* alis + luka berjahit */}
            <path d="M36 24Q41 22 46 24" stroke="#6b4a55" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            <line x1="39" y1="27" x2="44" y2="19" stroke="#9a2f45" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="39" y1="27" x2="44" y2="19" stroke="#f0788a" strokeWidth=".7" strokeLinecap="round" />
            {[0.25, 0.5, 0.75].map((s) => (
                <line
                    key={s}
                    x1={39 + 5 * s - 1.2}
                    y1={27 - 8 * s - 0.8}
                    x2={39 + 5 * s + 1.2}
                    y2={27 - 8 * s + 0.8}
                    stroke="#3a1020"
                    strokeWidth=".6"
                />
            ))}
            {/* plester X di hidung */}
            <g transform="translate(48 36)">
                {[35, -35].map((deg) => (
                    <rect
                        key={deg}
                        x="-6"
                        y="-1.6"
                        width="12"
                        height="3.2"
                        rx="1.4"
                        transform={`rotate(${deg})`}
                        fill="#f6d2a8"
                        stroke="#d9a577"
                        strokeWidth=".4"
                    />
                ))}
            </g>
            {/* balon OUCH */}
            <g transform="translate(20 17) rotate(-12)">
                <polygon points={BURST} fill="#ffe14d" stroke="#ff4d8d" strokeWidth="1" strokeLinejoin="round" />
                <text x="0" y="1.6" textAnchor="middle" fontSize="4.6" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#1a1a1f">
                    OUCH!
                </text>
            </g>
            {/* bintang pusing + hati HP */}
            <Star5 x={36} y={8} r={2.6} fill="#ffe14d" stroke="#ff9a2e" />
            <Star5 x={48} y={5} r={2.6} fill="#ffe14d" stroke="#ff9a2e" />
            <Star5 x={60} y={8} r={2.6} fill="#ffe14d" stroke="#ff9a2e" />
            <MiniHeart x={74} y={9} s={0.35} fill="#ff4d8d" />
            <MiniHeart x={82} y={9} s={0.35} fill="#ff4d8d" />
            <g transform="translate(90 9) scale(.35)">
                <path d={HEART} fill="none" stroke="#ff4d8d" strokeWidth="2.5" />
            </g>
        </>
    ),
    "iron-hud": (
        <>
            <Bg fill="#04121f" />
            <ellipse cx="48" cy="29" rx="15" ry="19" fill="#0e2a3d" />
            {/* kotak target */}
            {([-1, 1] as const).flatMap((sx) =>
                ([-1, 1] as const).map((sy) => {
                    const x = 48 + sx * 22;
                    const y = 29 + sy * 24;
                    return (
                        <path
                            key={`${sx}${sy}`}
                            d={`M${x - sx * 6} ${y}L${x} ${y}L${x} ${y - sy * 6}`}
                            stroke="#22d3ee"
                            strokeWidth="1"
                            strokeLinecap="round"
                            fill="none"
                        />
                    );
                })
            )}
            <circle cx="48" cy="29" r="21" stroke="#22d3ee" strokeWidth=".6" strokeDasharray="3 2" opacity=".6" fill="none" />
            <path d="M48 7.5A21.5 21.5 0 0 1 66 18" stroke="#ff4d8d" strokeWidth="1" strokeLinecap="round" fill="none" />
            {[41, 55].map((x) => (
                <g key={x}>
                    <circle cx={x} cy="25" r="3.2" stroke="#22d3ee" strokeWidth=".7" strokeDasharray="1.6 1" fill="none" />
                    <circle cx={x} cy="25" r=".8" fill="#7df3ff" />
                </g>
            ))}
            <line x1="30" y1="33" x2="66" y2="33" stroke="#7df3ff" strokeWidth=".8" opacity=".85" />
            {/* chip kanan */}
            {[
                [11, "SMILE 87%"],
                [21, "VIBES: MAX"],
                [31, "BATT: 69%"],
            ].map(([y, text]) => (
                <g key={text}>
                    <rect x="72" y={y} width="22" height="6" rx="2" fill="#04121f" stroke="#22d3ee" strokeWidth=".6" />
                    <text x="83" y={Number(y) + 4.1} textAnchor="middle" fontSize="3.2" fontWeight="700" fontFamily="monospace" fill="#7df3ff">
                        {text}
                    </text>
                </g>
            ))}
            {/* EKG kiri */}
            <rect x="2" y="18" width="22" height="11" rx="2" fill="#04121f" stroke="#22d3ee" strokeWidth=".6" />
            <text x="4" y="22.4" fontSize="3" fontWeight="700" fontFamily="monospace" fill="#ff6fa5">
                ♥ 98 BPM
            </text>
            <polyline
                points="4,26 8,26 10,26 11.5,21.5 13,28.5 14.5,26 19,26 20.5,24 22,26"
                stroke="#7df3ff"
                strokeWidth=".7"
                strokeLinejoin="round"
                fill="none"
            />
            {/* status */}
            <rect x="32" y="48.5" width="32" height="5" rx="1.8" fill="#04121f" stroke="#22d3ee" strokeWidth=".6" />
            <text x="48" y="52.2" textAnchor="middle" fontSize="3.2" fontWeight="700" fontFamily="monospace" fill="#22d3ee">
                TARGET LOCKED
            </text>
        </>
    ),
    "terminator-eye": (
        <>
            <defs>
                <radialGradient id="fx-term-g">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset=".15" stopColor="#ff5a3c" />
                    <stop offset=".5" stopColor="#ff1414" stopOpacity=".45" />
                    <stop offset="1" stopColor="#ff0000" stopOpacity="0" />
                </radialGradient>
            </defs>
            <Bg fill="#2a0707" />
            <ellipse cx="60" cy="30" rx="19" ry="25" fill="#4a0f0f" />
            <circle cx="68" cy="25" r="1.3" fill="#7a1a1a" />
            {/* mata menyala + reticle */}
            <circle cx="54" cy="25" r="15" fill="url(#fx-term-g)" />
            <circle cx="54" cy="25" r="1.6" fill="#ffffff" />
            <circle cx="54" cy="25" r="7" stroke="#ff6b6b" strokeWidth=".7" strokeDasharray="2.4 1.4" fill="none" />
            <circle cx="54" cy="25" r="10" stroke="#ff6b6b" strokeWidth=".5" strokeDasharray="6 12" fill="none" />
            <g stroke="#ff6b6b" strokeWidth=".6" strokeLinecap="round">
                <line x1="38" y1="25" x2="48" y2="25" />
                <line x1="60" y1="25" x2="76" y2="25" />
                <line x1="54" y1="8" x2="54" y2="16" />
                <line x1="54" y1="34" x2="54" y2="42" />
            </g>
            {/* teks scan */}
            {["SCAN: HUMAN", "MOOD: SUS", "COFFEE: 0%", "HAIR: TOO GOOD", "VERDICT: NICE"].map((s, i) => (
                <text key={s} x="3" y={17 + i * 5} fontSize="3.2" fontWeight="700" fontFamily="monospace" fill="#ffb3a8">
                    {s}
                </text>
            ))}
            <line x1="33" y1="27" x2="47" y2="25" stroke="#ff6b6b" strokeWidth=".5" opacity=".8" />
            {/* chip bawah */}
            <rect x="30" y="46" width="36" height="6" rx="2" fill="#2a0707" stroke="#ff6b6b" strokeWidth=".6" />
            <text x="48" y="50.3" textAnchor="middle" fontSize="3.4" fontWeight="700" fontFamily="monospace" fill="#ff8a80">
                {"I'LL BE BACK"}
            </text>
            {/* scanline */}
            {Array.from({ length: 14 }).map((_, i) => (
                <rect key={i} x="0" y={i * 4} width="96" height=".8" fill="#000" opacity=".25" />
            ))}
        </>
    ),
    vhs: (
        <>
            <Bg fill="#14141a" />
            {["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"].map(
                (c, i) => (
                    <rect key={c} x={i * (96 / 7)} y="0" width={96 / 7 + 0.5} height="34" fill={c} />
                )
            )}
            {Array.from({ length: 14 }).map((_, i) => (
                <rect key={i} x="0" y={i * 4 + 2} width="96" height="1.2" fill="#000" opacity=".3" />
            ))}
            <rect x="0" y="39" width="96" height="3" fill="#ededf0" opacity=".85" />
            <rect x="5" y="39" width="96" height="3" fill="#22d3ee" opacity=".35" />
            <rect x="-4" y="39" width="96" height="3" fill="#ff4d8d" opacity=".35" />
            <text
                x="6"
                y="14"
                fontFamily="monospace"
                fontSize="7"
                fontWeight="700"
                fill="#22d3ee"
                opacity=".8"
            >
                PLAY ▶
            </text>
            <text x="5" y="14" fontFamily="monospace" fontSize="7" fontWeight="700" fill="#fff">
                PLAY ▶
            </text>
            <text x="5" y="52" fontFamily="monospace" fontSize="5" fontWeight="700" fill="#fff">
                SP 0:00:12
            </text>
        </>
    ),
    aquarium: (
        <>
            <defs>
                <linearGradient id="fx-aqua-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#22b8d8" />
                    <stop offset="1" stopColor="#083a63" />
                </linearGradient>
            </defs>
            <rect width="96" height="56" fill="url(#fx-aqua-bg)" />
            <polygon points="14,0 22,0 36,56 24,56" fill="#c8f5ff" opacity=".14" />
            <polygon points="52,0 60,0 78,56 64,56" fill="#c8f5ff" opacity=".12" />
            <g transform="translate(34 22)">
                <path d="M-8 0L-15 -5L-14 0L-15 5Z" fill="#ffd08a" />
                <ellipse rx="9" ry="5" fill="#ff9a2e" />
                <circle cx="5" cy="-1" r="1.6" fill="#fff" />
                <circle cx="5.4" cy="-1" r=".8" fill="#111" />
            </g>
            <g transform="translate(68 34) scale(-1 1)">
                <path d="M-6 0L-11 -4L-10 0L-11 4Z" fill="#a5f3fc" />
                <ellipse rx="6.5" ry="3.6" fill="#22d3ee" />
                <circle cx="3.5" cy="-.8" r="1.2" fill="#fff" />
                <circle cx="3.8" cy="-.8" r=".6" fill="#111" />
            </g>
            <circle cx="14" cy="38" r="2.5" fill="none" stroke="#fff" strokeWidth=".8" opacity=".8" />
            <circle cx="20" cy="26" r="1.6" fill="none" stroke="#fff" strokeWidth=".8" opacity=".8" />
            <circle cx="84" cy="22" r="2" fill="none" stroke="#fff" strokeWidth=".8" opacity=".8" />
            <circle cx="52" cy="46" r="1.3" fill="none" stroke="#fff" strokeWidth=".8" opacity=".8" />
            {[8, 22, 40, 62, 78, 90].map((x, i) => (
                <path
                    key={x}
                    d={`M${x} 58C${x - 4} 50 ${x + 4} 46 ${x} ${40 + (i % 2) * 4}`}
                    stroke={i % 2 ? "#22a062" : "#3cbe78"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    fill="none"
                />
            ))}
        </>
    ),
    disco: (
        <>
            <Bg fill="#15151a" />
            <circle cx="30" cy="28" r="14" fill="#ff4d8d" />
            <circle cx="48" cy="28" r="14" fill="#22d3ee" />
            <circle cx="66" cy="28" r="14" fill="#facc15" />
        </>
    ),
    "mirror-left": (
        <>
            <Bg fill="#1a1a1f" />
            <path d="M48 8L20 48H48Z" fill="#ededf0" />
            <path d="M48 8L76 48H48Z" fill="#ededf0" />
            <line x1="48" y1="4" x2="48" y2="52" stroke="#22d3ee" strokeWidth="1.5" />
        </>
    ),
    pixelate: (
        <>
            <Bg fill="#1a1a1f" />
            {Array.from({ length: 4 }).flatMap((_, row) =>
                Array.from({ length: 8 }).map((__, col) => (
                    <rect
                        key={`${row}-${col}`}
                        x={col * 12}
                        y={row * 14}
                        width="12"
                        height="14"
                        fill={PIXEL_TONES[(col * 7 + row * 3) % PIXEL_TONES.length]}
                    />
                ))
            )}
        </>
    ),
    thermal: (
        <>
            {THERMAL.map((c, i) => (
                <rect key={c} x={i * 19.2} width="19.2" height="56" fill={c} />
            ))}
        </>
    ),
    "night-vision": (
        <>
            <Bg fill="#03140a" />
            {Array.from({ length: 7 }).map((_, i) => (
                <line
                    key={i}
                    x1="0"
                    x2="96"
                    y1={4 + i * 8}
                    y2={4 + i * 8}
                    stroke="#4ade80"
                    strokeWidth="1"
                    opacity=".35"
                />
            ))}
            <circle cx="48" cy="28" r="12" fill="#4ade80" opacity=".8" />
        </>
    ),
    glitch: (
        <>
            <Bg fill="#111114" />
            <rect x="4" y="10" width="70" height="8" fill="#ff4d8d" />
            <rect x="22" y="10" width="70" height="8" fill="#22d3ee" opacity=".85" />
            <rect x="10" y="30" width="60" height="6" fill="#ededf0" />
            <rect x="30" y="44" width="56" height="5" fill="#ff4d8d" />
        </>
    ),
};

type Props = {
    effect: Effect;
    active: boolean;
    onPick: () => void;
};

export default function EffectCard({ effect, active, onPick }: Props) {
    return (
        <button
            type="button"
            onClick={onPick}
            onPointerEnter={() => effect.preload?.()}
            onFocus={() => effect.preload?.()}
            aria-pressed={active}
            className="fx-card"
        >
            <svg
                viewBox="0 0 96 56"
                preserveAspectRatio="xMidYMid slice"
                className="block min-h-0 w-full flex-1"
                aria-hidden
            >
                {ART[effect.id] ?? ART.normal}
            </svg>
            <span className="block truncate border-t border-line px-2.5 py-1.5 text-xs font-medium">
                {effect.name}
            </span>
        </button>
    );
}