"use client";
import { useEffect, type RefObject } from "react";
import type { Effect } from "@/lib/effects";

type Params = {
    video: RefObject<HTMLVideoElement | null>;
    canvas: RefObject<HTMLCanvasElement | null>;
    effect: RefObject<Effect>;
    mirror: RefObject<boolean>;
    enabled: boolean;
};

export function useRenderLoop({ video, canvas, effect, mirror, enabled }: Params) {
    useEffect(() => {
        const v = video.current;
        const c = canvas.current;
        if (!enabled || !v || !c) return;

        const ctx = c.getContext("2d", { alpha: false });
        if (!ctx) return;

        const hasRvfc = "requestVideoFrameCallback" in v;
        let handle = 0;

        const tick = (now: number) => {
            const w = v.videoWidth;
            const h = v.videoHeight;
            if (w && h) {
                if (c.width !== w || c.height !== h) {
                    c.width = w;
                    c.height = h;
                }
                ctx.save();
                if (mirror.current) {
                    ctx.translate(w, 0);
                    ctx.scale(-1, 1);
                }
                effect.current.draw(ctx, v, w, h, now);
                ctx.restore();
            }
            schedule();
        };

        const schedule = () => {
            handle = hasRvfc
                ? v.requestVideoFrameCallback(tick)
                : requestAnimationFrame(tick);
        };

        schedule();

        return () => {
            if (hasRvfc) v.cancelVideoFrameCallback(handle);
            else cancelAnimationFrame(handle);
        };
    }, [enabled, video, canvas, effect, mirror]);
}