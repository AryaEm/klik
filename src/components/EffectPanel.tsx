"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EffectCard from "@/components/EffectCard";
import type { Effect } from "@/lib/effects";

const GAP = 8;
const HEADER_H = 32;
const DESKTOP_COLS = 2;
const DESKTOP_CARD_H = 96;
const MOBILE_CARD_H = 84;
const MOBILE_MIN_CARD_W = 104;
const QUERY = "(min-width: 1024px)";

const subscribe = (cb: () => void) => {
    const m = window.matchMedia(QUERY);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
};
const useIsDesktop = () =>
    useSyncExternalStore(
        subscribe,
        () => window.matchMedia(QUERY).matches,
        () => false
    );

type Props = {
    effects: Effect[];
    activeId: string;
    onPick: (e: Effect) => void;
};

export default function EffectPanel({ effects, activeId, onPick }: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [page, setPage] = useState(0);
    const isDesktop = useIsDesktop();

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) =>
            setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
        );
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const cardH = isDesktop ? DESKTOP_CARD_H : MOBILE_CARD_H;
    const cols = isDesktop
        ? DESKTOP_COLS
        : Math.max(1, Math.floor((size.w + GAP) / (MOBILE_MIN_CARD_W + GAP)));
    const rows = isDesktop
        ? Math.max(1, Math.floor((size.h - HEADER_H) / (cardH + GAP)))
        : 1;

    const perPage = cols * rows;
    const pageCount = Math.max(1, Math.ceil(effects.length / perPage));
    const paging = pageCount > 1;
    const cur = Math.min(page, pageCount - 1);
    const visible = effects.slice(cur * perPage, (cur + 1) * perPage);

    const go = (dir: number) => setPage((cur + dir + pageCount) % pageCount);

    return (
        <div ref={rootRef} className="flex h-full min-h-0 flex-col">
            <div
                className={`mb-2 shrink-0 items-center justify-between ${isDesktop || paging ? "flex" : "hidden"
                    }`}
                style={{ height: HEADER_H }}
            >
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted">
                    Efek
                </span>

                {paging && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => go(-1)}
                            aria-label="Efek sebelumnya"
                            className="nav-btn"
                        >
                            <ChevronLeft className="size-4" />
                        </button>
                        <span className="min-w-8 text-center font-mono text-xs font-bold tabular-nums text-muted">
                            {cur + 1}/{pageCount}
                        </span>
                        <button
                            type="button"
                            onClick={() => go(1)}
                            aria-label="Efek berikutnya"
                            className="nav-btn"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                )}
            </div>

            <div
                className="grid"
                style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridAutoRows: cardH,
                    gap: GAP,
                }}
            >
                {visible.map((e, i) => (
                    <div
                        key={e.id}
                        className="anim-pop min-w-0"
                        style={{ animationDelay: `${i * 35}ms` }}
                    >
                        <EffectCard
                            effect={e}
                            active={activeId === e.id}
                            onPick={() => onPick(e)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}