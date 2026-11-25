import Camera from "@/components/Camera";

const SITE_NAME = "Klik!";

export default function Home() {
  return (
    <main className="flex h-full w-full flex-col overflow-hidden bg-surface">
      <header className="flex shrink-0 items-center justify-center px-4 py-3 sm:px-6">
        <h1 className="group flex items-center gap-2.5 font-mono text-base font-black uppercase tracking-[0.2em] text-ink">
          <span className="size-3.5 rounded-full bg-brand transition-all duration-300 group-hover:-translate-y-0.5 group-hover:rotate-90 group-hover:rounded-sm" />
          {SITE_NAME}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Camera />
      </div>
    </main>
  );
}