import * as THREE from 'three';

/**
 * 生成写实橡木拼接地板纹理（高分辨率非像素风，含自然木纹纤维与地板缝隙倒角）
 */
export function createWoodFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c89b6e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const plankRows = 12;
  const plankHeight = canvas.height / plankRows;
  const plankPalette = [
    '#cfa173',
    '#c39364',
    '#d6aa7c',
    '#bc8c5d',
    '#cca070',
    '#c69768',
  ];

  for (let row = 0; row < plankRows; row++) {
    const y = row * plankHeight;
    const joints = row % 2 === 0 ? [0, 340, 720, 1024] : [0, 210, 580, 910, 1024];

    for (let i = 0; i < joints.length - 1; i++) {
      const x = joints[i];
      const w = joints[i + 1] - x;
      const baseColor = plankPalette[(row * 3 + i) % plankPalette.length];

      // 渐变木板底色
      const grad = ctx.createLinearGradient(x, y, x + w, y + plankHeight);
      grad.addColorStop(0, baseColor);
      grad.addColorStop(0.5, '#d2a679');
      grad.addColorStop(1, baseColor);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, plankHeight);

      // 细腻写实木纹纤维线
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y + 2, w - 4, plankHeight - 4);
      ctx.clip();

      for (let g = 0; g < 26; g++) {
        const gy = y + (g / 26) * plankHeight + Math.sin(g * 1.7 + row) * 2.5;
        ctx.strokeStyle = g % 3 === 0 ? 'rgba(120, 76, 38, 0.11)' : 'rgba(255, 232, 200, 0.08)';
        ctx.lineWidth = 1.1 + (g % 2) * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(
          x + w * 0.33,
          gy + Math.sin(row + g) * 4,
          x + w * 0.66,
          gy - Math.cos(row + g) * 4,
          x + w,
          gy + Math.sin(g) * 2
        );
        ctx.stroke();
      }
      ctx.restore();

      // 木板接缝阴影与高光倒角
      ctx.strokeStyle = 'rgba(72, 43, 21, 0.42)';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(x + 1, y + 1, w - 2, plankHeight - 2);

      ctx.strokeStyle = 'rgba(255, 236, 209, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 3);
      ctx.lineTo(x + w - 2, y + 3);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * 生成写实编织几何地毯纹理（还原参考图紫灰几何纹样，具备织物经纬肌理）
 */
export function createWovenRugTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  // 地毯主底色（柔和紫灰绒面）
  ctx.fillStyle = '#6e6279';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 外圈编织边框
  ctx.strokeStyle = '#8b7d96';
  ctx.lineWidth = 24;
  ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

  ctx.strokeStyle = '#574c61';
  ctx.lineWidth = 8;
  ctx.strokeRect(52, 52, canvas.width - 104, canvas.height - 104);

  // 几何菱形与对称折线图案
  const drawDiamondMotif = (cx: number, cy: number, rx: number, ry: number) => {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = '#867892';
    ctx.beginPath();
    ctx.moveTo(0, -ry);
    ctx.lineTo(rx, 0);
    ctx.lineTo(0, ry);
    ctx.lineTo(-rx, 0);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 10;
    ctx.strokeStyle = '#53485d';
    ctx.stroke();

    ctx.fillStyle = '#655970';
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.52);
    ctx.lineTo(rx * 0.52, 0);
    ctx.lineTo(0, ry * 0.52);
    ctx.lineTo(-rx * 0.52, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#a394b0';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  drawDiamondMotif(256, 210, 125, 105);
  drawDiamondMotif(256, 384, 140, 115);
  drawDiamondMotif(256, 558, 125, 105);

  // 四角几何装饰块
  const corners = [
    [96, 108],
    [416, 108],
    [96, 660],
    [416, 660],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillStyle = '#8c7e99';
    ctx.fillRect(cx - 22, cy - 22, 44, 44);
    ctx.fillStyle = '#54495e';
    ctx.fillRect(cx - 10, cy - 10, 20, 20);
  }

  // 叠加细腻织物经纬线质感
  for (let y = 0; y < canvas.height; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(25, 18, 32, 0.045)';
    ctx.fillRect(0, y, canvas.width, 1.5);
  }
  for (let x = 0; x < canvas.width; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? 'rgba(255, 255, 255, 0.025)' : 'rgba(25, 18, 32, 0.03)';
    ctx.fillRect(x, 0, 1.5, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * 生成墙面微水泥/哑光乳胶漆细腻肌理
 */
export function createWallStuccoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#c4acb7');
  grad.addColorStop(0.55, '#b69da8');
  grad.addColorStop(1, '#a68c98');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 柔和墙面微颗粒质感
  for (let i = 0; i < 3200; i++) {
    const x = (i * 73) % canvas.width;
    const y = (i * 137) % canvas.height;
    const r = 1 + (i % 3);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 245, 238, 0.025)' : 'rgba(42, 28, 38, 0.02)';
    ctx.fillRect(x, y, r, r);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 生成窗户斜射体积光束柔和边缘渐变贴图（避免硬几何切边）
 */
export function createSunbeamGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 512);
  const imgData = ctx.createImageData(256, 512);
  const data = imgData.data;

  for (let y = 0; y < 512; y++) {
    const v = y / 511; // 0 = window top, 1 = floor end
    const vertFade = Math.sin(Math.pow(v, 0.65) * Math.PI) * (1 - v * 0.45);
    for (let x = 0; x < 256; x++) {
      const u = (x - 128) / 128; // -1 to 1
      const horizFade = Math.max(0, Math.cos(u * Math.PI * 0.5));
      const alpha = Math.round(Math.max(0, Math.min(1, vertFade * horizFade * horizFade)) * 255);
      const idx = (y * 256 + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 生成墙面三幅装饰画纹理
 */
export function createArtPrintTexture(variant: 0 | 1 | 2): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // 象牙白卡纸衬边
  ctx.fillStyle = '#f6efe4';
  ctx.fillRect(0, 0, 256, 256);

  ctx.save();
  ctx.beginPath();
  ctx.rect(24, 24, 208, 208);
  ctx.clip();

  if (variant === 0) {
    // 暖暮远山油画
    const sky = ctx.createLinearGradient(0, 24, 0, 170);
    sky.addColorStop(0, '#f59e0b');
    sky.addColorStop(0.55, '#fbbf24');
    sky.addColorStop(1, '#fde68a');
    ctx.fillStyle = sky;
    ctx.fillRect(24, 24, 208, 208);

    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(155, 86, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7c5869';
    ctx.beginPath();
    ctx.moveTo(24, 232);
    ctx.lineTo(24, 150);
    ctx.lineTo(95, 108);
    ctx.lineTo(175, 155);
    ctx.lineTo(232, 120);
    ctx.lineTo(232, 232);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4c3847';
    ctx.beginPath();
    ctx.moveTo(24, 232);
    ctx.lineTo(70, 158);
    ctx.lineTo(148, 134);
    ctx.lineTo(232, 176);
    ctx.lineTo(232, 232);
    ctx.closePath();
    ctx.fill();
  } else if (variant === 1) {
    // 晴空海岸与白帆
    const sky = ctx.createLinearGradient(0, 24, 0, 150);
    sky.addColorStop(0, '#38bdf8');
    sky.addColorStop(1, '#bae6fd');
    ctx.fillStyle = sky;
    ctx.fillRect(24, 24, 208, 130);

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(24, 148, 208, 84);

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(82, 74, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(145, 86);
    ctx.lineTo(175, 142);
    ctx.lineTo(138, 142);
    ctx.closePath();
    ctx.fill();
  } else {
    // 暖秋森林与小径
    const bg = ctx.createLinearGradient(0, 24, 0, 232);
    bg.addColorStop(0, '#fef3c7');
    bg.addColorStop(1, '#d97706');
    ctx.fillStyle = bg;
    ctx.fillRect(24, 24, 208, 208);

    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(92, 118, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(158, 112, 46, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#78350f';
    ctx.fillRect(86, 145, 12, 62);
    ctx.fillRect(152, 145, 12, 62);
  }

  ctx.restore();
  ctx.strokeStyle = '#d6cab8';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 208, 208);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 生成 3D 电脑显示器待机/桌面预览纹理
 */
export function createMonitorScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 512, 320);
  bg.addColorStop(0, '#1e293b');
  bg.addColorStop(0.5, '#0f172a');
  bg.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 320);

  // 装饰网格与辉光圆
  ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.beginPath();
  ctx.arc(370, 125, 88, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(244, 114, 182, 0.14)';
  ctx.beginPath();
  ctx.arc(170, 165, 72, 0, Math.PI * 2);
  ctx.fill();

  // 桌面应用图标卡片预览
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(42, 42, 54, 54);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('MARIO', 45, 114);

  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(42, 134, 54, 54);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('RAIDEN', 43, 206);

  // 预览代码/终端小窗口
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(145, 44, 320, 195);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(145, 44, 320, 195);

  ctx.fillStyle = '#334155';
  ctx.fillRect(145, 44, 320, 26);

  ctx.fillStyle = '#fb7185';
  ctx.beginPath();
  ctx.arc(162, 57, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(178, 57, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(194, 57, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('PocketOS v2.4 Ready', 168, 106);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px monospace';
  ctx.fillText('> Click monitor to launch', 168, 136);
  ctx.fillText('> Super Mario & Space Shooter', 168, 162);
  ctx.fillStyle = '#34d399';
  ctx.fillText('> Status: ONLINE [60 FPS]', 168, 194);

  // 底部任务栏
  ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
  ctx.fillRect(0, 286, 512, 34);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(12, 293, 68, 20);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
