import type { WeaponId } from './weapons';
export type VariantId = 'hex' | 'scatter' | 'rail' | 'stream' | 'burst' | 'prism' | 'launcher' | 'mortar' | 'mine' | 'star' | 'frostfan' | 'moon' | 'sweep' | 'lance' | 'flying';
export type Armament = { id: VariantId; family: WeaponId; name: string; school: string; description: string; brief: string; damage: number; interval: number; speed: number; life: number; count: number; spread: number; pierce: number; mode: 'projectile' | 'melee' | 'lob' | 'mine'; homing: 'none' | 'seek' | 'return'; radius: number; reach: number; cone: number; color: string };
const base = { count:1, spread:.15, pierce:1, mode:'projectile' as const, homing:'none' as const, radius:0, reach:0, cone:-.12, life:1.5 };
export const ARSENAL: Armament[] = [
  {...base,id:'hex',brief:'精准单发，暴击处决',family:'pistol',name:'暮色手枪',school:'咒印精准流',description:'精准单发，适合暴击、第六发与处决构筑。',damage:30,interval:.5,speed:510,color:'#e6bb81'},
  {...base,id:'scatter',brief:'五枚散弹，近身爆发',family:'pistol',name:'荆棘霰枪',school:'近身散弹流',description:'同时射出五枚短程弹，贴身覆盖怪群。',damage:11,interval:.82,speed:470,count:5,spread:.18,life:.65,color:'#d2919b'},
  {...base,id:'rail',brief:'长距射击，贯穿三目标',family:'pistol',name:'贯星长铳',school:'远程贯穿流',description:'高伤慢射，基础穿透三个目标，后续伤害衰减。',damage:55,interval:1.15,speed:1050,pierce:3,life:1.1,color:'#a9d7df'},
  {...base,id:'stream',brief:'高速连射，持续压制',family:'machine',name:'符文机关枪',school:'持续压制流',description:'高速连续射击，用预热和弹链持续压制。',damage:7,interval:.12,speed:620,color:'#86c7b9'},
  {...base,id:'burst',brief:'三连点射，节奏爆发',family:'machine',name:'脉冲三连铳',school:'节奏点射流',description:'每轮三连发，弹丸以 0.08 秒间隔依次出膛。',damage:11,interval:.58,speed:660,count:3,spread:.035,color:'#e1bc76'},
  {...base,id:'prism',brief:'电束贯穿，最多四目标',family:'machine',name:'棱镜电磁炮',school:'线性电束流',description:'发射高速电束，可连续贯穿四个目标，逐次衰减。',damage:36,interval:.9,speed:1800,pierce:4,life:.3,color:'#c4a4ef'},
  {...base,id:'launcher',brief:'接触爆炸，范围清怪',family:'rocket',name:'炼金火箭炮',school:'直击爆破流',description:'火箭接触即爆，配合爆心、集束与殉爆秘术。',damage:40,interval:1.5,speed:290,life:2.3,mode:'projectile',radius:82,color:'#df9a7e'},
  {...base,id:'mortar',brief:'延迟落点，大范围轰炸',family:'rocket',name:'陨星迫击炮',school:'预判轰炸流',description:'抛射到瞄准位置，0.85 秒后大范围爆炸；不会提前撞到敌人。',damage:75,interval:2.25,speed:0,mode:'lob',life:.85,radius:118,color:'#debd83'},
  {...base,id:'mine',brief:'脚下布雷，靠近引爆',family:'rocket',name:'符印地雷匣',school:'走位布阵流',description:'脚下布雷，0.35 秒后武装，怪物靠近时引爆；最多存在八秒。',damage:57,interval:1.2,speed:0,mode:'mine',life:8,radius:95,color:'#b6c97d'},
  {...base,id:'star',brief:'追踪法球，连续穿透',family:'wand',name:'星辉法杖',school:'追踪星术流',description:'追踪法球，基础穿透四个目标，适合刻蚀与引力。',damage:22,interval:.9,speed:265,pierce:4,homing:'seek',life:2.6,color:'#c2a5e6'},
  {...base,id:'frostfan',brief:'五枚冰片，减速控场',family:'wand',name:'霜扇短杖',school:'冰霜扇射流',description:'五枚短程冰片，自带一级减速；以覆盖与控制换取射程。',damage:11,interval:1.05,speed:340,count:5,spread:.23,life:.85,color:'#8dd9e5'},
  {...base,id:'moon',brief:'双月回旋，沿途穿透',family:'wand',name:'月轮魔典',school:'回旋月刃流',description:'两枚穿透月轮飞出后回旋至身边，沿途寻找不同目标。',damage:17,interval:.95,speed:230,count:2,spread:.24,pierce:6,homing:'return',life:2,color:'#e0d9a4'},
  {...base,id:'sweep',brief:'宽幅扫击，击退怪群',family:'broom',name:'魔女扫帚',school:'近战群扫流',description:'宽扇形扫击并击退，擅长环扫、收割与踏风。',damage:30,interval:.85,speed:0,mode:'melee',reach:112,color:'#bdca8b'},
  {...base,id:'lance',brief:'长距突刺，命中三目标',family:'broom',name:'风骑长枪',school:'长距突刺流',description:'185 单位窄角突刺，最多命中三个目标，适合冲刺后出击。',damage:40,interval:.92,speed:0,mode:'melee',reach:185,cone:.9,pierce:3,color:'#94c8c4'},
  {...base,id:'flying',brief:'投掷飞帚，穿透回旋',family:'broom',name:'旋刃飞帚',school:'远程回旋流',description:'投掷穿透飞帚后回收；连中多个目标可触发收割，第三击可环射。',damage:23,interval:.7,speed:350,pierce:3,homing:'return',life:1.7,color:'#d5accb'},
];
export const STARTERS: Record<WeaponId,VariantId> = {pistol:'hex',machine:'stream',rocket:'launcher',wand:'star',broom:'sweep'};
export const variantsFor = (family:WeaponId):Armament[] => ARSENAL.filter(a=>a.family===family);
export const armamentOf = (id:VariantId):Armament => ARSENAL.find(a=>a.id===id) ?? ARSENAL[0];
