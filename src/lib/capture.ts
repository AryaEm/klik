export type Shot = { blob: Blob; width: number; height: number };
export type StripLayout = "vertical" | "grid";

const CELL_W = 600;
const PAD = 24;
const FOOTER = 56;

const toBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

export async function captureSingle(canvas: HTMLCanvasElement): Promise<Shot | null> {
    const { width, height } = canvas;
    const blob = await toBlob(canvas);
    return blob && { blob, width, height };
}

export async function composeStrip(
    frames: ImageBitmap[],
    layout: StripLayout = "vertical"
): Promise<Shot | null> {
    if (frames.length === 0) return null;

    const cellH = Math.round((CELL_W * frames[0].height) / frames[0].width);
    const cols = layout === "grid" ? 2 : 1;
    const rows = Math.ceil(frames.length / cols);

    const canvas = document.createElement("canvas");
    canvas.width = PAD + cols * (CELL_W + PAD);
    canvas.height = PAD + rows * (cellH + PAD) + FOOTER;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    frames.forEach((f, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = PAD + col * (CELL_W + PAD);
        const y = PAD + row * (cellH + PAD);
        ctx.drawImage(f, x, y, CELL_W, cellH);
    });

    const blob = await toBlob(canvas);
    return blob && { blob, width: canvas.width, height: canvas.height };
}