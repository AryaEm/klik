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

const ART: Record<string, ReactNode> = {
    normal: (
        <>
            <Bg fill="#1a1a1f" />
            <circle cx="48" cy="28" r="13" fill="none" stroke="#ededf0" strokeWidth="2" />
            <circle cx="48" cy="28" r="4" fill="#ededf0" />
        </>
    ),
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
    "rain-glass": (
        <>
            <defs>
                <linearGradient id="fx-rain-bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#2b4a6b" />
                    <stop offset="1" stopColor="#12202f" />
                </linearGradient>
            </defs>
            <rect width="96" height="56" fill="url(#fx-rain-bg)" />
            <circle cx="24" cy="18" r="14" fill="#ff9a2e" opacity=".25" />
            <circle cx="70" cy="14" r="12" fill="#22d3ee" opacity=".25" />
            <circle cx="56" cy="40" r="16" fill="#ff4d8d" opacity=".2" />
            <line
                x1="44"
                y1="6"
                x2="44"
                y2="28"
                stroke="#fff"
                strokeOpacity=".12"
                strokeWidth="4"
                strokeLinecap="round"
            />
            <line
                x1="78"
                y1="20"
                x2="78"
                y2="38"
                stroke="#fff"
                strokeOpacity=".12"
                strokeWidth="3"
                strokeLinecap="round"
            />
            {(
                [
                    [20, 22, 5],
                    [44, 32, 7],
                    [70, 18, 4],
                    [78, 40, 6],
                    [30, 46, 3],
                    [58, 11, 3],
                    [10, 40, 3.5],
                ] as const
            ).map(([x, y, r]) => (
                <g key={`${x}-${y}`}>
                    <ellipse
                        cx={x}
                        cy={y}
                        rx={r}
                        ry={r * 1.25}
                        fill="#fff"
                        fillOpacity=".12"
                        stroke="#fff"
                        strokeOpacity=".5"
                        strokeWidth=".7"
                    />
                    <ellipse
                        cx={x - r * 0.35}
                        cy={y - r * 0.5}
                        rx={r * 0.25}
                        ry={r * 0.17}
                        fill="#fff"
                        opacity=".85"
                    />
                </g>
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