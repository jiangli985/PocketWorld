// Rebuild the native vector scenery and orthographic views from one small mesh.
// No engine or image-generation service is required at runtime.
import { mkdir, writeFile } from 'node:fs/promises';
const base = new URL('./', import.meta.url);
const save = async (file, text) => writeFile(new URL(file, base), text.trimEnd() + '\n', 'utf8');
await mkdir(new URL('winter/', base), { recursive: true });
const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${body}</svg>`;
const cloud = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fffdf1"><ellipse rx="100" ry="22"/><ellipse cx="-28" cy="-18" rx="46" ry="32"/><ellipse cx="32" cy="-10" rx="57" ry="29"/></g>`;
const sky = `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#d5edf6"/><stop offset="1" stop-color="#edf8fa"/></linearGradient></defs><path fill="url(#sky)" d="M0 0H1600V900H0Z"/><circle cx="1250" cy="208" r="57" fill="#fff2c7"/><circle cx="1250" cy="208" r="80" fill="#fff2c7" opacity=".18"/>${cloud(170, 180, .9)}${cloud(630, 110, .7)}${cloud(1480, 280, .8)}`;
const mountains = `<path fill="#c7e0e9" d="M0 590Q60 590 142 432L276 255Q297 229 320 261L472 447 638 340Q660 318 683 347L855 515 1017 285Q1045 249 1075 290L1250 464 1405 393Q1429 376 1450 408Q1548 590 1600 590V900H0Z"/>
<path fill="#e9f3f3" d="m222 327 54-72q21-26 44 6l60 73-49-24-25 20-26-28-25 33Zm734 45 61-87q28-36 58 5l69 92-61-36-28 16-22-27-30 31Z"/>
<path fill="#a2c5d5" d="M0 690Q80 690 160 573L358 351Q384 323 410 357L577 543 750 447Q771 426 795 452L955 595 1149 421Q1174 397 1199 428L1380 610Q1510 690 1600 690V900H0Z"/>
<path fill="#b8d6e1" d="m160 573 198-222q26-28 52 6l-26 165-96 43-32 62Zm795 22 194-174q25-24 50 7l-23 137-93 1-28 70Z"/>
<path fill="#f5f8ee" d="m294 425 64-74q26-28 52 6l63 71-48-12-33 21-22-28-34 27Zm803 46 52-50q25-24 50 7l49 50-43-10-27 18-25-28-32 25Z"/>`;
const tree = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-5-32H5V0H-5Z" fill="#8ba4a6"/><path d="m0-190-36 62h14l-40 67h20L-83-6Q0 15 83-6L42-61h20l-40-67h14Z" fill="#789fae"/><path d="m0-190-28 49 28-8 23 11Zm0 60-43 61 43-12 35 13Zm0 67-62 48 62-8 57 10Z" fill="#edf5ef"/><path d="M0-180v157l57 10L0-35l35-33L0-88l23-50Z" fill="#c9dfe2" opacity=".55"/></g>`;
const littleCabin = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-30-38H30V0H-30Z" fill="#b99b80"/><path d="m-39-37 39-32 39 32Z" fill="#fff9eb"/><path d="m0-57 32 25H-32Z" fill="#b0c8cc"/><path d="M-7-25H7V0H-7Z" fill="#ecbf75"/><path d="M-22-27h10v12h-10Z" fill="#fff2cc"/></g>`;
const woodland = `<path fill="#d7e9ec" d="M0 637C170 637 235 552 420 570S680 665 900 640 1140 538 1330 587 1500 637 1600 637V900H0Z"/>${Array.from({ length: 13 }, (_, i) => tree(65 + i * 118, 590 + Math.sin(i * 1.7) * 25, .38 + i % 3 * .1)).join('')}${littleCabin(527, 602)}${littleCabin(1320, 618)}`;
const shrub = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="7" rx="53" ry="8" fill="#c7dfe6"/><path d="M-46 0q-5-23 18-25 0-22 23-19 18-16 32 5 30-6 26 24Z" fill="#aecbd3"/><path d="M-46-4q-5-21 18-21 0-22 23-19 18-16 32 5 22-6 26 9L28-19 5-23-17-8Z" fill="#fff9ec"/></g>`;
const decor = `<path fill="#e6f1ef" d="M0 862C190 862 263 800 475 827S720 900 960 855 1320 819 1480 851Q1550 862 1600 862V900H0Z"/>${shrub(210, 808, .65)}${shrub(1120, 825, .8)}<g transform="translate(680 820)"><ellipse cy="10" rx="39" ry="7" fill="#c7dfe6"/><path d="m-31 2 6-24 26-13 31 13 6 24Z" fill="#b0c7d0"/><path d="m-25-22 26-13 31 13-23 7-17-6Z" fill="#fff9ec"/><path d="M1-35 9-15 1 2h-32l6-24Z" fill="#c5d9de"/></g>`;
for (const [name, content] of Object.entries({ sky, mountains, woodland, decor })) await save(`winter/${name}.svg`, wrap(content));
await save('winter/panorama.svg', wrap(sky + mountains + woodland + decor));

// Low-poly character, X forward / Y up / Z left. Parts remain separate for posing.
const mesh = [];
function ball(part, center, radii, color, rings = 6, segments = 10) {
  const point = (i, j) => {
    const a = Math.PI * i / rings, b = Math.PI * 2 * j / segments;
    return [center[0] + Math.sin(a) * Math.cos(b) * radii[0], center[1] + Math.cos(a) * radii[1], center[2] + Math.sin(a) * Math.sin(b) * radii[2]];
  };
  for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) {
    const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
    for (const vertices of i === 0 ? [[a, b, c]] : i === rings - 1 ? [[a, b, d]] : [[a, b, c], [a, c, d]]) {
      const middle = vertices[0].map((_, k) => vertices.reduce((s, p) => s + p[k], 0) / 3);
      const normal = middle.map((n, k) => (n - center[k]) / radii[k] ** 2);
      const length = Math.hypot(...normal);
      mesh.push({ part, vertices, color, normal: normal.map(n => n / length) });
    }
  }
}
ball('body', [-3, 96, 0], [43, 59, 32], '#edba48');
ball('neck', [17, 143, 0], [25, 33, 24], '#edba48');
ball('head', [24, 170, 0], [31, 23, 27], '#f3cb59');
ball('muzzle', [49, 160, 0], [16, 9, 20], '#f3cb59');
ball('belly', [28, 94, 0], [17, 41, 28], '#f9e8bf');
ball('tail', [-46, 64, 0], [13, 8, 12], '#d9a53d');
for (const z of [-27, 27]) {
  ball('arm', [4, 103, z], [12, 25, 10], '#e4ae42');
  ball('mitten', [21, 85, z], [13, 10, 11], '#8d6846');
}
for (const z of [-18, 18]) {
  ball('leg', [-8, 28, z], [11, 25, 11], '#dfa841');
  ball('boot', [3, 7, z], [20, 9, 12], '#805e43');
  ball('eye', [38, 179, z], [9, 10, 9], '#8eb58c');
  ball('pupil', [44, 180, z * 1.2], [3.8, 5.5, 4], '#304846', 4, 8);
  ball('goggle-rim', [17, 194, z * .84], [15, 8, 11], '#3e6472');
  ball('goggle-lens', [23, 195, z], [10, 5.5, 8], '#8fceda', 4, 8);
}
ball('scarf', [12, 145, 0], [30, 8, 28], '#d36b4d', 4);
ball('scarf-tail', [-39, 139, 7], [39, 6, 7], '#d36b4d', 4);
ball('scarf-tail', [-37, 130, 9], [29, 5, 7], '#b85743', 4);
const rounded = n => +n.toFixed(2);
function shade(hex, normal) {
  const light = [-.25, .8, -.54];
  const dot = Math.max(0, normal.reduce((sum, n, i) => sum + n * light[i], 0));
  const factor = .84 + Math.round(dot * 4) / 4 * .19;
  return '#' + hex.slice(1).match(/../g).map(c => Math.min(255, Math.round(parseInt(c, 16) * factor)).toString(16).padStart(2, '0')).join('');
}
function project(yaw, filter = () => true) {
  const camera = [Math.sin(yaw), .04, -Math.cos(yaw)];
  const x = p => 150 + p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw);
  const depth = p => p[0] * camera[0] + p[2] * camera[2];
  return mesh.filter(face => filter(face.part) && face.normal.reduce((s, n, i) => s + n * camera[i], 0) > -.08)
    .map(face => ({ ...face, depth: face.vertices.reduce((s, p) => s + depth(p), 0) / 3 }))
    .sort((a, b) => a.depth - b.depth)
    .map(face => `<path d="M${face.vertices.map(p => `${rounded(x(p))} ${rounded(220 - p[1] + depth(p) * .04)}`).join('L')}Z" fill="${shade(face.color, face.normal)}" stroke="${shade(face.color, face.normal)}" stroke-width=".45" stroke-linejoin="round"/>`).join('');
}
const skis = '<path d="M43 211H237Q250 211 258 201L255 213Q251 219 235 220H43Z" fill="#4e7684"/><path d="M43 214H235Q250 214 256 207" fill="none" stroke="#e7ac57" stroke-width="3"/><path d="M137 207h22v8h-22Zm30 0h22v8h-22Z" fill="#63828b"/>';
const legs = name => name === 'leg' || name === 'boot';
const rig = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="260" viewBox="0 0 280 260"><g data-layer="skis">${skis}</g><g data-layer="legs">${project(0, legs)}</g><g data-layer="body">${project(0, p => !legs(p))}</g></svg>`;
await save('naiwa/ski-volume-rig.svg', rig);
const views = [Math.PI / 2, 0, -Math.PI / 2].map((yaw, i) => `<g transform="translate(${-120 + i * 510} 100) scale(2.5)"><ellipse cx="150" cy="225" rx="53" ry="6" fill="#edf0ed"/>${project(yaw)}</g>`).join('');
await save('naiwa/winter-three-views.svg', wrap('<path fill="#ffffff" d="M0 0H1600V900H0Z"/>' + views));
// The part names make the small source mesh usable for subsequent rigging.
let obj = '# Naiwa winter low-poly mesh; units are arbitrary; Y up\nmtllib winter-character.mtl\n';
let vertex = 1, part;
for (const face of mesh) {
  if (face.part !== part) { part = face.part; obj += `g ${part}\n`; }
  obj += `usemtl color_${face.color.slice(1)}\n`;
  obj += face.vertices.map(p => `v ${p.map(rounded).join(' ')}\n`).join('');
  obj += `f ${vertex} ${vertex + 1} ${vertex + 2}\n`; vertex += 3;
}
await save('naiwa/winter-character.obj', obj);
await save('naiwa/winter-character.mtl', [...new Set(mesh.map(f => f.color))].map(color => `newmtl color_${color.slice(1)}\nKd ${color.slice(1).match(/../g).map(c => (parseInt(c, 16) / 255).toFixed(4)).join(' ')}\nKa 0.1 0.1 0.1\nKs 0 0 0\nNs 0\nillum 1\n`).join('\n'));
