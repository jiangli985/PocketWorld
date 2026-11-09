import { useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { StudyBook } from './StudyBook';
import { BOOK } from './model';
import './study.css';

const views: Record<string, [number, number, number]> = { angle: [2.6, 3.9, 4.1], top: [0.25, 6, 0.025], side: [0.6, 0.65, 5] };

function Camera({ view }: { view: string }) {
  const { size } = useThree();
  const control = useRef<OrbitControlsImpl>(null), previous = useRef('');
  const destination = useRef(new THREE.Vector3(...views.angle));
  const moving = useRef(true);
  useFrame(({ camera }, delta) => {
    camera.zoom = Math.min(1, size.width / size.height / 1.1); camera.updateProjectionMatrix();
    if (previous.current !== view) { previous.current = view; destination.current.set(...views[view]); moving.current = true; }
    if (!moving.current) return;
    camera.position.lerp(destination.current, 1 - Math.exp(-delta * 7));
    control.current?.target.set(0.25, 0.08, 0);
    control.current?.update();
    if (camera.position.distanceTo(destination.current) < 0.005) moving.current = false;
  });
  return <OrbitControls ref={control} makeDefault enablePan={false} minDistance={2.5} maxDistance={8} maxPolarAngle={Math.PI / 2 - 0.02} onStart={() => { moving.current = false; }} />;
}

export default function App() {
  const [opened, setOpened] = useState(false), [spread, setSpread] = useState(0);
  const [busy, setBusy] = useState(false), [view, setView] = useState('angle');
  function changeSpread(value: number) { setBusy(true); setSpread(value); }
  function toggleCover() { setBusy(true); setOpened(!opened); if (opened) setSpread(0); }
  return <main>
    <header><a href="/">PocketWorld</a><span>书本小样 · 01</span></header>
    <div className="study-caption"><p>把时间，留在纸上。</p><span>封面开合 / 逐张翻页 / 装订连接</span></div>
    <div className="study-canvas">
      <Canvas shadows camera={{ position: views.angle, fov: 37 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}>
        <color attach="background" args={['#dedbcf']} />
        <hemisphereLight args={['#fffaf0', '#b5b8a8', 1.2]} />
        <directionalLight position={[-3, 7, 3]} intensity={2.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-normalBias={0.004} shadow-bias={-0.00005} />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.003, 0]} receiveShadow><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#d6d0bd" roughness={1} /></mesh>
        <StudyBook opened={opened} spread={spread} onSettled={() => setBusy(false)} />
        <Camera view={view} />
      </Canvas>
    </div>
    <div className="study-views" aria-label="观察角度">{([['angle', '斜视'], ['top', '俯视'], ['side', '侧视']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
    <footer>
      <div className="study-controls">
        <button className="study-cover" onClick={toggleCover} disabled={busy}>{opened ? '合上日记' : '翻开日记'}</button>
        <div className="study-pagination">
          <button aria-label="上一页" disabled={!opened || busy || spread === 0} onClick={() => changeSpread(spread - 1)}>←</button>
          <output aria-live="polite">{!opened ? '封面' : `${spread === 0 ? '衬页' : String(spread * 2).padStart(2, '0')} / ${spread === BOOK.leaves ? '衬页' : String(spread * 2 + 1).padStart(2, '0')}`}</output>
          <button aria-label="下一页" disabled={!opened || busy || spread === BOOK.leaves} onClick={() => changeSpread(spread + 1)}>→</button>
        </div>
      </div>
      <p>拖动查看角度，滚轮缩放。此页用于检查书本结构，文字暂为示例。</p>
    </footer>
  </main>;
}
