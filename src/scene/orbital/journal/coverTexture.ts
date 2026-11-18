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

export function clothTexture(title = false, color = '#45534a', coverTitle = '日  记', coverSubtitle = 'M O M E N T S', style: 'journal' | 'daily' = 'journal') {
  return canvasTexture(768, 1080, ctx => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 1080);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff09';
    for (let x = 0; x < 768; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1080); ctx.stroke(); }
    ctx.strokeStyle = '#0000000b';
    for (let y = 0; y < 1080; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(768, y); ctx.stroke(); }
    if (title && style === 'daily') {
      const gold = '#d4c298';
      const edge = ctx.createLinearGradient(0, 0, 768, 0);
      edge.addColorStop(0, '#3b251e55'); edge.addColorStop(0.11, '#3b251e00'); edge.addColorStop(1, '#ffffff06');
      ctx.fillStyle = edge; ctx.fillRect(0, 0, 768, 1080);
      ctx.strokeStyle = '#c9b99166'; ctx.lineWidth = 2; ctx.strokeRect(51, 48, 666, 984);
      ctx.strokeStyle = '#c9b99133'; ctx.lineWidth = 1; ctx.strokeRect(64, 61, 640, 958);
      ctx.fillStyle = gold; ctx.textAlign = 'center';
      ctx.font = '23px Georgia, serif'; ctx.fillText('A  L I T T L E  S P A C E', 390, 202);
      ctx.font = '50px Georgia, serif'; ctx.fillText('D A I L Y', 390, 378);
      ctx.font = 'italic 99px "Segoe Script", cursive'; ctx.fillText('Planner', 390, 485, 570);
      ctx.lineWidth = 1.5; ctx.strokeStyle = gold; ctx.beginPath(); ctx.moveTo(269, 529); ctx.lineTo(511, 529); ctx.stroke();
      ctx.font = '23px "KaiTi", serif'; ctx.fillText('把日子，慢慢写好。', 390, 584);
      ctx.strokeStyle = '#cbb98cc7'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(329, 846); ctx.bezierCurveTo(361, 800, 421, 760, 446, 690); ctx.stroke();
      [[353, 813, -1], [379, 785, 1], [404, 753, -1], [426, 724, 1]].forEach(([x, y, side]) => {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + side * 52, y - 4, x + side * 52, y - 42, x, y - 13); ctx.bezierCurveTo(x + side * 20, y - 18, x + side * 19, y - 1, x, y); ctx.stroke();
      });
      ctx.font = '18px Georgia, serif'; ctx.fillStyle = '#c7b98f'; ctx.fillText('P O C K E T W O R L D', 390, 948);
    } else if (title) {
      ctx.strokeStyle = '#d0c19a99'; ctx.lineWidth = 2;
      ctx.strokeRect(88, 95, 592, 890);
      ctx.fillStyle = '#dfd0a7'; ctx.textAlign = 'center';
      ctx.font = '62px SimSun, serif'; ctx.fillText(coverTitle, 384, 430, 520);
      ctx.font = '23px Georgia, serif'; ctx.fillText(coverSubtitle, 384, 493);
      ctx.beginPath(); ctx.moveTo(332, 548); ctx.lineTo(436, 548); ctx.stroke();
    }
  });
}
