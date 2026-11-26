import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

// Both sandboxes keep the room, Three.js and GSAP out of their import graph.
const devGame = new URLSearchParams(window.location.search).get('dev');
const Entry = React.lazy<React.ComponentType>(() => {
  if (devGame === 'shooter') return import('./games/shooter/dev');
  if (devGame === 'mario') return import('./games/mario/mario-sandbox');
  return import('./App').then(module => ({ default: module.App }));
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<div role="status">正在打开 PocketWorld…</div>}><Entry /></React.Suspense>
  </React.StrictMode>
);
