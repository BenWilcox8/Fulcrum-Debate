/**
 * The application shell. Later features (flowing, evidence, speeches) mount
 * inside this frame - for now it is a minimal, self-contained placeholder that
 * renders entirely offline with no network dependency.
 */
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium uppercase tracking-widest text-slate-400">
          Desktop preview
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">Fulcrum Debate</h1>
        <p className="max-w-md text-balance text-slate-400">
          A local-first workspace for flowing rounds, cutting evidence, and
          building speeches. The shell is ready - features land next.
        </p>
      </div>
    </main>
  );
}
