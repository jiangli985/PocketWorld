import type { WeaponId } from './weapons';
export const PROFESSIONS: Record<WeaponId, { name: string; shortName: string; title: string; passive: string; color: string }> = {
  pistol: { name: '魔弹游侠', shortName: '游侠', title: '一枪，刻下一道咒印。', passive: '职业天赋：手枪对生命高于 80% 的目标伤害 +12%。', color: '#daa76b' },
  machine: { name: '符文机巧师', shortName: '机巧师', title: '齿轮转动，符文轰鸣。', passive: '职业天赋：机关枪每第 10 次攻击伤害翻倍。', color: '#75c7bc' },
  rocket: { name: '爆破炼金师', shortName: '炼金师', title: '用爆炸，回答黑夜。', passive: '职业天赋：火箭爆炸范围 +10%。', color: '#dc8a73' },
  wand: { name: '星辉术士', shortName: '术士', title: '星辰记得所有咒语。', passive: '职业天赋：法球额外穿透一个目标。', color: '#b89cdd' },
  broom: { name: '疾风魔女', shortName: '魔女', title: '扫过荒野，留下风暴。', passive: '职业天赋：移速 +10%，冲刺冷却减少 0.4 秒。', color: '#a9bf77' },
};
export type SpecId = 'deadeye' | 'silver' | 'sixth' | 'execute' | 'spinup' | 'capacitor' | 'stabilizer' | 'salvo' | 'warhead' | 'embers' | 'cluster' | 'fuse' | 'twin' | 'sigil' | 'gravity' | 'familiar' | 'gale' | 'reap' | 'whirl' | 'witchstep';
export type Specialization = { id: SpecId; weapon: WeaponId; name: string; icon: string; description: string; color: string };
export const SPECIALS: Specialization[] = [
  { id:'deadeye',weapon:'pistol',name:'鹰眼咒印',icon:'⊙',description:'手枪暴击率每级 +10%，不依赖射速堆触发。',color:'#e3b873' },
  { id:'silver',weapon:'pistol',name:'贯穿银弹',icon:'↠',description:'手枪每级额外穿透一个目标，后续伤害递减。',color:'#d3d6df' },
  { id:'sixth',weapon:'pistol',name:'第六枚魔弹',icon:'Ⅵ',description:'手枪每第六次攻击，伤害额外增加每级 80%。',color:'#e49c83' },
  { id:'execute',weapon:'pistol',name:'暮色处决',icon:'✧',description:'手枪对生命低于 35% 的目标每级增伤 35%。',color:'#bb98d8' },
  { id:'spinup',weapon:'machine',name:'符文涡轮',icon:'⚙',description:'连续开火逐渐预热，满热时每级缩短 8% 攻击间隔。切枪会冷却。',color:'#87bfb8' },
  { id:'capacitor',weapon:'machine',name:'蓄能线圈',icon:'ϟ',description:'每十二次机关枪攻击，释放每级 18 点范围电击。',color:'#e0c477' },
  { id:'stabilizer',weapon:'machine',name:'锚定支架',icon:'⌖',description:'站定射击时散布减小，机关枪每级增伤 15%。',color:'#adc5cd' },
  { id:'salvo',weapon:'machine',name:'回声弹链',icon:'»',description:'每六次机关枪攻击额外喷出每级一枚低伤符文弹。',color:'#df9f90' },
  { id:'warhead',weapon:'rocket',name:'爆心炼成',icon:'✹',description:'爆心 45 单位内的目标，每级额外承受 25% 伤害。',color:'#e3a277' },
  { id:'embers',weapon:'rocket',name:'余烬熔炉',icon:'♨',description:'主火箭留下三秒余烬，每秒造成每级 9 点伤害。',color:'#d98966' },
  { id:'cluster',weapon:'rocket',name:'群星集束',icon:'⋈',description:'爆炸后散出三枚小火箭，每枚每级继承 14% 伤害。',color:'#cab080' },
  { id:'fuse',weapon:'rocket',name:'殉爆引信',icon:'※',description:'主火箭击杀目标后，产生一次额外冲击，每级继承 20% 伤害。',color:'#df8f97' },
  { id:'twin',weapon:'wand',name:'双星回路',icon:'✦',description:'每次多发一颗法球，每颗伤害降低；总伤害逐级增加。',color:'#c4a7e7' },
  { id:'sigil',weapon:'wand',name:'星纹刻蚀',icon:'◇',description:'法球每次穿透后，伤害额外增加每级 12%。',color:'#93c8db' },
  { id:'gravity',weapon:'wand',name:'月蚀引力',icon:'◎',description:'法球命中时将附近怪物向命中点拉拢，便于穿透和连锁。',color:'#ac9fd3' },
  { id:'familiar',weapon:'wand',name:'星灵契约',icon:'✶',description:'每三次施法，向另一个目标放出每级一颗半伤星灵弹。',color:'#d9c18d' },
  { id:'gale',weapon:'broom',name:'斩风飞叶',icon:'彡',description:'每次攻击追加每级一枚半伤风刃，三种魔女兵装均可生效。',color:'#b8c98b' },
  { id:'reap',weapon:'broom',name:'收割契约',icon:'♥',description:'同次扫击、突刺或主飞帚命中至少两个目标，每级回血 1 点，每秒最多一次。',color:'#d89cba' },
  { id:'whirl',weapon:'broom',name:'环身风暴',icon:'↻',description:'每第三次近战变为环击，范围每级 +12；飞帚改为向周围环射低伤风刃。',color:'#9fcac0' },
  { id:'witchstep',weapon:'broom',name:'踏风咒',icon:'↗',description:'冲刺后首次攻击每级增伤 30%；冲刺中近战攻击还可延长距离。',color:'#c5bd82' },
];
export const isSpec = (id: string): id is SpecId => SPECIALS.some(s => s.id === id);
export const emptySpecials = (): Record<SpecId, number> => Object.fromEntries(SPECIALS.map(s => [s.id, 0])) as Record<SpecId, number>;
export const CLASS_TRAITS: Record<WeaponId, readonly string[]> = { pistol:['crit','ricochet'],machine:['burn','frost'],rocket:['burn','ricochet'],wand:['frost','chain'],broom:['vampire','split'] };
