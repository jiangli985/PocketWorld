import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

// The cartridge sandbox intentionally skips importing the room and Three.js.
const devGame = new URLSearchParams(window.location.search).get('dev');
const Entry = React.lazy<React.ComponentType>(() => devGame === 'shooter'
  ? import('./games/shooter/dev')
  : import('./App').then(module => ({ default: module.App })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<div role="status">正在打开 PocketWorld…</div>}><Entry /></React.Suspense>
  </React.StrictMode>
);
