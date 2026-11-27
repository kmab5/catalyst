import { Navigate, useParams, type RouteObject } from 'react-router';
import { AppShell } from './shell/AppShell';
import { Launcher } from './pages/Launcher';
import { Settings } from './pages/Settings';
import { Indexing } from './pages/Indexing';
import { Overview } from './pages/Overview';
import { Features } from './pages/Features';
import { FeatureDetail } from './pages/FeatureDetail';
import { Explorer } from './pages/Explorer';
import { Graph } from './pages/Graph';
import { Health } from './pages/Health';
import { Ask } from './pages/Ask';
import { Impact } from './pages/Impact';

function ProjectRedirect() {
  const { pid } = useParams<{ pid: string }>();
  return <Navigate to={`/p/${pid}/overview`} replace />;
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Launcher /> },
      { path: 'settings', element: <Settings /> },
      {
        path: 'p/:pid',
        children: [
          { index: true, element: <ProjectRedirect /> },
          { path: 'indexing', element: <Indexing /> },
          { path: 'overview', element: <Overview /> },
          { path: 'features', element: <Features /> },
          { path: 'features/:fid', element: <FeatureDetail /> },
          { path: 'explorer', element: <Explorer /> },
          { path: 'graph', element: <Graph /> },
          { path: 'health', element: <Health /> },
          { path: 'ask', element: <Ask /> },
          { path: 'impact', element: <Impact /> },
        ],
      },
    ],
  },
];
