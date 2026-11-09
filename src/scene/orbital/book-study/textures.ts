import * as THREE from 'three';

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function paperTexture(page: number) {
  return canvasTexture(768, 1080, ctx => {
    ctx.fillStyle = '#f5f0e1'; ctx.fillRect(0, 0, 768, 1080);
    const left = page % 2 === 1;
    const inner = left ? 768 : 0;
    const gradient = ctx.createLinearGradient(inner, 0, left ? 700 : 68, 0);
    gradient.addColorStop(0, '#d7cfbc'); gradient.addColorStop(1, '#f5f0e1');
    ctx.fillStyle = gradient; ctx.fillRect(left ? 700 : 0, 0, 68, 1080);
    const margin = left ? 70 : 100;
    ctx.fillStyle = '#77786a'; ctx.font = '24px "Microsoft YaHei", sans-serif';
    ctx.fillText('天气', margin, 105);
    ctx.font = '28px Georgia, serif'; ctx.fillText('☀  ☁  ☂', margin + 80, 105);
    ctx.font = '21px Georgia, serif'; ctx.textAlign = 'right';
    ctx.fillText('2026 / 11 / 09', 690, 105); ctx.textAlign = 'left';
    ctx.strokeStyle = '#acb4a25c'; ctx.lineWidth = 1.5;
    for (let y = 225; y < 965; y += 60) {
      ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(left ? 670 : 698, y); ctx.stroke();
    }
    ctx.strokeStyle = '#bf938b66';
    ctx.beginPath(); ctx.moveTo(left ? 705 : 73, 180); ctx.lineTo(left ? 705 : 73, 950); ctx.stroke();
    if (page < 6) {
      const entries = [
        ['把今天，留在纸上。', '窗边的光慢慢移过来，', '新的一页，也慢慢展开。'],
        ['纸张翻过的时候，', '能听见很轻的一声。'],
        ['左页记下已经发生的事，', '右页留给还没到来的明天。'],
        ['不用急着把一页写满。'],
        ['天气很好，适合散步。'],
        ['在平常的一天里，', '找一点值得记住的小事。'],
      ];
      ctx.fillStyle = '#353f32'; ctx.font = '32px "Microsoft YaHei", sans-serif';
      entries[page].forEach((line, i) => ctx.fillText(line, margin + 3, 214 + i * 60));
    }
    ctx.fillStyle = '#858374'; ctx.font = '24px Georgia, serif';
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(String(page + 1).padStart(2, '0'), left ? 75 : 690, 1018);
  });
}

export function clothTexture(title = false, color = '#45534a', label?: string) {
  return canvasTexture(768, 1080, ctx => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 1080);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff09';
    for (let x = 0; x < 768; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1080); ctx.stroke(); }
    ctx.strokeStyle = '#0000000b';
    for (let y = 0; y < 1080; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(768, y); ctx.stroke(); }
    if (title) {
      ctx.strokeStyle = '#d0c19a99'; ctx.lineWidth = 2;
      ctx.strokeRect(88, 95, 592, 890);
      ctx.fillStyle = '#dfd0a7'; ctx.textAlign = 'center';
      ctx.font = '62px SimSun, serif'; ctx.fillText(label ?? '日  记', 384, 430, 520);
      ctx.font = '23px Georgia, serif'; ctx.fillText(label ? 'POCKETWORLD' : 'M O M E N T S', 384, 493);
      ctx.font = '25px Georgia, serif'; ctx.fillText(label ? 'LIBRARY' : '2026', 384, 866);
      ctx.beginPath(); ctx.moveTo(332, 548); ctx.lineTo(436, 548); ctx.stroke();
    }
  });
}
