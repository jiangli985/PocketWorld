export type WeaponId = 'pistol' | 'machine' | 'rocket' | 'wand' | 'broom';
export type Weapon = { id: WeaponId; name: string; short: string; tagline: string; description: string; color: string; light: string; damage: number; interval: number; speed: number; range: number; stats: string };
export const WEAPONS: Weapon[] = [
  { id: 'pistol', name: '暮色手枪', short: '小手枪', tagline: '小小一把，啵啵拿下', description: '精准发射魔力子弹，轻快可靠，适合边走边打。', color: '#ef8f59', light: '#fff0c8', damage: 30, interval: .5, speed: 510, range: 0, stats: '精准单发 · 均衡火力' },
  { id: 'machine', name: '符文机关枪', short: '机关枪', tagline: '今天的糖豆不限量', description: '高速喷射符文弹链，弹道略有散布，持续压制怪群。', color: '#35b9c7', light: '#d1ffff', damage: 7, interval: .12, speed: 620, range: 0, stats: '超快连射 · 密集弹幕' },
  { id: 'rocket', name: '炼金火箭炮', short: '火箭炮', tagline: '开瓶有惊喜，怪群请让让', description: '发射炼金火箭，命中或到达终点时爆开，造成范围伤害。', color: '#f46e87', light: '#ffe0eb', damage: 40, interval: 1.5, speed: 290, range: 82, stats: '大范围爆炸 · 慢速重击' },
  { id: 'wand', name: '星辉法杖', short: '法杖', tagline: '喵？这可不是普通星星', description: '追踪魔法球可穿过四个敌人，转弯追赶尚未命中的目标。', color: '#9771ee', light: '#eee0ff', damage: 22, interval: .9, speed: 265, range: 0, stats: '追踪穿透 · 神秘魔法' },
  { id: 'broom', name: '魔女扫帚', short: '扫把', tagline: '怪物太多？统统扫走！', description: '挥出宽阔扇形，一次扫飞面前整群敌人。多弹强化改为扩大扫击范围。', color: '#e8a92e', light: '#fff0a7', damage: 30, interval: .85, speed: 0, range: 112, stats: '扇形群攻 · 强力击退' },
];
export const weaponOf = (id: WeaponId): Weapon => WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
