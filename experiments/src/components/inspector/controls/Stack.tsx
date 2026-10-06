import type { ReactNode } from 'react';

export function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[10px] leading-relaxed text-slate-400">
      {children}
    </p>
  );
}
