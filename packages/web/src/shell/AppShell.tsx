import { useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { TopBar } from './TopBar';
import { LeftNav } from './LeftNav';
import { useNavShortcuts } from './useNavShortcuts';

export function AppShell() {
  const { pid } = useParams<{ pid: string }>();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useNavShortcuts(pid, () => setPaletteOpen((o) => !o));

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <TopBar
        projectName={pid}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex flex-1 min-h-0">
        {pid && <LeftNav pid={pid} />}
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet context={{ paletteOpen, setPaletteOpen }} />
        </main>
      </div>
    </div>
  );
}
