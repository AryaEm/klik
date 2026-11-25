"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "loading" | "ready" | "denied" | "error";

export function useCamera() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [status, setStatus] = useState<CameraStatus>("idle");

    const start = useCallback(async () => {
        setStatus("loading");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setStatus("ready");
        } catch (e) {
            setStatus((e as DOMException).name === "NotAllowedError" ? "denied" : "error");
        }
    }, []);

    useEffect(() => {
        return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    }, []);

    return { videoRef, status, start };
}