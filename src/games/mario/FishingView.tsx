import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefCallback } from 'react';
import { BAY_HEIGHT, BAY_WIDTH, drawFishingBay, setDockImage, setFishingAtlas } from './renderer';
import type { FishingScene } from './renderer';
import type { CookingStation, FishId, RecipeId } from './catalog';
import { BAITS, BAIT_LIMIT, BAIT_PACK, FISH_MASS, FIGHT_GOAL, FIGHT_KEYS, GUEST_ORDERS, type BaitId, type PaidBaitId } from './catalog';
import type { AnglingProgress, CatchCard } from './model';
import bayAtlas from '../../../assets/games/ski/bay-dusk.webp';
import dockStreet from '../../../assets/games/ski/dock-street.webp';
import tackleRoom from '../../../assets/games/ski/tackle-interior.webp';
import marketRoom from '../../../assets/games/ski/market-interior.webp';
import careerRoom from '../../../assets/games/ski/career-gallery.webp';
import tavernMark from '../../../assets/games/ski/tavern-mark.webp';
import seafoodMenu from '../../../assets/games/ski/seafood-menu.webp';
import { ROD_CATALOG, type RodLevel } from './catalog';
import { drawRodDisplay } from './rodArt';
import { FISHING_ICON_SIZE, drawFishingIcon, type BoatControlId, type FishingIconId } from './boatControlArt';
import { drawFish, FISH_SPRITE_WIDTH, FISH_SPRITE_HEIGHT } from './fishArt';
import './view.css';

export type FishingScreen = 'home' | 'boat' | 'crossing' | 'dock' | 'tackle' | 'market' | 'journal' | 'pause' | 'result' | 'career' | 'bait' | 'guide';

type SimpleAction = 'start' | 'exit' | 'tap' | 'dock' | 'tackle' | 'market' | 'journal' | 'boat' | 'pause' | 'resume' | 'finish' | 'home' | 'career' | 'bait' | 'guide' | 'close-overlay' | 'dismiss-catch';
export type FishingAction = Readonly<{ type: SimpleAction } | { type: 'prepare'; fishId: FishId; recipeId: RecipeId; quantity?: number } |
  { type: 'fight'; key: string } | { type: 'upgrade' | 'equip'; level: RodLevel } |
  { type: 'select-bait'; bait: BaitId } | { type: 'buy-bait'; bait: PaidBaitId }>;

export interface FishDisplay {
  readonly id: FishId;
  readonly name: string;
  readonly rarity: string;
  readonly count: number;
  readonly discovered: boolean;
  readonly reelMs: number;
}

export interface RecipeDisplay {
  readonly id: RecipeId;
  readonly name: string;
  readonly station: CookingStation;
  readonly requirement: string;
  readonly fishPerPortion: number;
  readonly coins: number;
  readonly saleMs: number;
  /** Absent for a recipe that accepts every fish. */
  readonly eligibleFishIds?: readonly FishId[];
}

export interface OrderDisplay {
  readonly id: string | number;
  readonly label: string;
  readonly station: CookingStation;
  /** Caller-supplied fill fraction in [0, 1]; the view never advances it. */
  readonly progress: number;
}

interface GuestDisplay {
  readonly guest: string;
  readonly recipes: readonly RecipeId[];
  readonly portions: number;
  readonly bonus: number;
  readonly served: number;
}

export interface FishingSnapshot {
  readonly screen: FishingScreen;
  readonly coins: number;
  readonly basket: Readonly<{ count: number; capacity: number }>;
  readonly score: number;
  readonly goal: number;
  readonly highScore: number;
  readonly victory: boolean;
  readonly guestsServed: number;
  readonly guest?: GuestDisplay;
  readonly canTap: boolean;
  readonly seconds?: number;
  readonly fight?: Readonly<{ key: string; progress: number }>;
  readonly reeling: boolean;
  readonly angling: AnglingProgress;
  readonly baitStore: boolean;
  readonly catchCard?: CatchCard;
  readonly fish: readonly FishDisplay[];
  readonly recipes: readonly RecipeDisplay[];
  readonly orders: readonly OrderDisplay[];
  readonly queueCapacity: number;
  readonly rod: Readonly<{ owned: RodLevel; equipped: RodLevel }>;
  /** Game events announced to assistive technology. */
  readonly notice?: string;
}

export interface FishingViewProps {
  readonly snapshot: FishingSnapshot;
  /** Paints the initial/static frame. For continuous rendering, draw via canvasRef without React updates. */
  readonly scene: FishingScene;
  readonly isActive?: boolean;
  readonly onAction: (action: FishingAction, trustedGesture?: boolean) => void;
  readonly canvasRef?: RefCallback<HTMLCanvasElement>;
  readonly onDockImageSettled?: () => void;
}

const icons = {
  back: 'M19 12H5m6-6-6 6 6 6',
  next: 'M5 12h14m-6-6 6 6-6 6',
} as const;

function Icon({ name }: { name: keyof typeof icons }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>;
}

function formatMass(grams: number) {
  return grams >= 1_000 ? `${grams / 1000} 千克` : `${grams} 克`;
}

function FishFigure({ fish }: { fish: FishDisplay }) {
  if (!fish.discovered) return <span className="tf-unknown" aria-hidden="true">?</span>;
  return <FishSprite id={fish.id} />;
}

function FishSprite({ id }: { id: FishId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, FISH_SPRITE_WIDTH, FISH_SPRITE_HEIGHT);
    drawFish(context, id);
  }, [id]);
  return <canvas className="tf-fish-art" ref={canvas} width={FISH_SPRITE_WIDTH} height={FISH_SPRITE_HEIGHT}
    aria-hidden="true" />;
}

type Send = FishingViewProps['onAction'];

function Button({ children, action, send, disabled, primary, focus }: {
  children: ReactNode;
  action: FishingAction;
  send: Send;
  disabled?: boolean;
  primary?: boolean;
  focus?: string;
}) {
  return (
    <button type="button" className={primary ? 'tf-button tf-primary' : 'tf-button'} disabled={disabled} data-focus={focus} onClick={event => send(action, event.isTrusted)}>
      {children}
    </button>
  );
}

const boatControls = [
  { id: 'tap', label: '轻敲鱼竿' },
  { id: 'dock', label: '码头' },
  { id: 'journal', label: '图鉴' },
  { id: 'pause', label: '暂停' },
] as const;

function FishingIcon({ id, className = 'tf-boat-icon' }: { id: FishingIconId; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (canvas.current) drawFishingIcon(canvas.current, id);
  }, [id]);
  return <canvas className={className} ref={canvas} width={FISHING_ICON_SIZE} height={FISHING_ICON_SIZE} aria-hidden="true" />;
}

function BoatCommand({ id, label, disabled, send, detail, icon = id }: {
  id: BoatControlId; label: string; disabled: boolean; send: Send; detail?: string; icon?: FishingIconId;
}) {
  return (
    <button type="button" className="tf-boat-command" data-focus={id}
      disabled={disabled} aria-label={label} aria-description={detail} data-selected={!!detail || undefined}
      onClick={event => send({ type: id }, event.isTrusted)}>
      <FishingIcon id={icon} />
      <span className="tf-boat-tip" aria-hidden="true">{detail ? label + ' · ' + detail : label}</span>
    </button>
  );
}

function BoatControls({ snapshot, send, inactive }: StoreProps) {
  const rodBusy = !!snapshot.fight || snapshot.reeling;
  const disabled = { tap: !snapshot.canTap, dock: rodBusy, journal: rodBusy, pause: false };
  return (
    <nav className="tf-boat-actions" aria-label="船上操作">
      {boatControls.map(({ id, label }) => (
        <BoatCommand key={id} id={id} label={label} disabled={inactive || disabled[id]} send={send} />
      ))}
    </nav>
  );
}

function canCook(recipe: RecipeDisplay, fish: readonly FishDisplay[]) {
  return fish.some(entry => entry.count >= recipe.fishPerPortion &&
    (!recipe.eligibleFishIds || recipe.eligibleFishIds.includes(entry.id)));
}

function QuestGuide({ snapshot, send, inactive }: StoreProps) {
  const { guest, recipes, fish } = snapshot;
  const wanted = recipes.filter(recipe => guest?.recipes.includes(recipe.id));
  const ready = wanted.some(recipe => canCook(recipe, fish));
  return (
    <Panel title="任务指南" send={send} inactive={inactive} back="close-overlay">
      <div className="tf-guide">
        {guest ? <>
          <section className="tf-guide-order" aria-label="当前熟客">
            <h3>{guest.guest}</h3>
            <dl>
              <div><dt>上菜进度</dt><dd>{guest.served} / {guest.portions} 份</dd></div>
              <div><dt>交齐小费</dt><dd>+{guest.bonus} 金币</dd></div>
            </dl>
            <ul>
              {wanted.map(recipe => <li key={recipe.id}>
                <strong>{recipe.name}</strong>
                <span>{recipe.requirement} · 每份 {recipe.fishPerPortion} 条</span>
              </li>)}
            </ul>
          </section>
          <div className="tf-guide-next">
            <FishingIcon id={ready ? 'dock' : 'tap'} />
            <div><strong>下一步</strong><p>{ready ? '鱼篓已有食材，靠岸去大排档上菜。' : '在海湾钓齐食材，再靠岸去大排档。'}</p></div>
          </div>
        </> : <p>本趟熟客订单已全部上齐。</p>}
      </div>
    </Panel>
  );
}

function FightControls({ snapshot, send, inactive, impulse }: StoreProps & { impulse: FishingScene['impulse'] }) {
  const fight = snapshot.fight;
  if (!fight) return null;
  const outcome = impulse?.kind === 'reel' ? 'pull' : impulse?.kind === 'slip' ? 'slip' : undefined;
  return (
    <section className="tf-fight" aria-label="搏鱼" data-urgent={(snapshot.seconds ?? 0) <= 3 || undefined}>
      <b aria-live="polite">稀有鱼上钩 · 按或点 <kbd>{fight.key}</kbd></b>
      <div className="tf-fight-keys" role="group" aria-label="收线键">
        {Array.from(FIGHT_KEYS, key => <Button key={key} action={{ type: 'fight', key }} send={send}
          disabled={inactive} primary={key === fight.key}>{key}</Button>)}
      </div>
      <progress aria-label="搏鱼进度" max={FIGHT_GOAL} value={fight.progress} data-outcome={outcome} />
      <small>{fight.progress}/{FIGHT_GOAL} · {snapshot.seconds} 秒</small>
      <span className="tf-sr-only" role="status">{outcome && (
        <span key={impulse?.id}>{outcome === 'pull' ? '收紧 +1' : '鱼线松了'}</span>
      )}</span>
    </section>
  );
}

function HudCounter({ icon, label, value, limit }: {
  icon: 'basket' | 'coins' | 'revenue'; label: string; value: number; limit?: number;
}) {
  return (
    <div title={label} data-stat={icon}>
      <dt><FishingIcon id={icon} className="tf-hud-icon" /><span className="tf-sr-only">{label}</span></dt>
      <dd>{value}{limit !== undefined && <span> / {limit}</span>}</dd>
    </div>
  );
}

function BoatStatus({ snapshot, scene }: { snapshot: FishingSnapshot; scene: FishingScene }) {
  const cue = scene.impulse?.kind;
  const status: { icon: FishingIconId; label: string } =
    cue === 'strike' ? { icon: 'fight', label: '稀有鱼咬钩' }
    : cue === 'bite' ? { icon: 'hooked', label: '鱼咬钩了' }
    : cue === 'locked' ? { icon: 'reeling', label: '稳住了，正在收线' }
    : snapshot.fight ? { icon: 'fight', label: '搏鱼中' }
    : snapshot.reeling ? { icon: 'reeling', label: '收线中' }
    : scene.phase === 'full' ? { icon: 'basket', label: '鱼篓已满，靠岸去备货' }
    : cue === 'nibble' ? { icon: 'nibble', label: '浮漂轻动' }
    : scene.phase === 'waiting' ? { icon: 'bobber', label: '等鱼咬钩' }
    : { icon: 'bobber', label: '湾面平静' };
  const seconds = snapshot.seconds;
  const label = status.label + (seconds === undefined ? '' : ' · ' + seconds + ' 秒');
  return (
    <div className="tf-boat-status" role="group" aria-label={label} title={label} tabIndex={-1}
      data-focus="entry" data-status={status.icon} data-hooked={cue === 'bite' || cue === 'strike' || cue === 'locked' || undefined}>
      <FishingIcon id={status.icon} className="tf-hud-icon" />
      {seconds !== undefined && <span aria-hidden="true">{seconds}<small> 秒</small></span>}
    </div>
  );
}

function Header({ snapshot }: { snapshot: FishingSnapshot }) {
  return (
    <header className="tf-header">
      <div className="tf-brand">
        <img className="tf-emblem" src={tavernMark} alt="" width="24" height="24" />
        <span>潮汐小馆</span>
      </div>
      {snapshot.screen !== 'home' && (
        <dl className="tf-hud" aria-label="本趟概况">
          <HudCounter icon="basket" label="鱼篓" value={snapshot.basket.count} limit={snapshot.basket.capacity} />
          <HudCounter icon="coins" label="金币" value={snapshot.coins} />
          <HudCounter icon="revenue" label="营业额" value={snapshot.score} limit={snapshot.goal} />
        </dl>
      )}
    </header>
  );
}

function Panel({ title, children, send, inactive, back, backLabel = '返回船上' }: {
  title: string; children: ReactNode; send: Send; inactive: boolean; back?: 'boat' | 'close-overlay'; backLabel?: string;
}) {
  return (
    <section className="tf-panel" aria-label={title}>
      <div className="tf-panel-head">
        <h2 tabIndex={-1} data-focus="entry">{title}</h2>
        {back && <Button action={{ type: back }} send={send} disabled={inactive}>{backLabel}</Button>}
      </div>
      <div className="tf-panel-body" tabIndex={inactive ? -1 : 0} data-game-scroll>{children}</div>
    </section>
  );
}

const shops = { tackle: '渔具店', market: '深海渔场大排档' } as const;

function Dock({ send, inactive }: { send: Send; inactive: boolean }) {
  return (
    <nav className="tf-dockfront" aria-label="东湾码头">
      {(Object.keys(shops) as Array<keyof typeof shops>).map(type => (
        <button key={type} type="button" className="tf-shop" data-focus={type} aria-label={shops[type]} disabled={inactive} onClick={event => send({ type }, event.isTrusted)} />
      ))}
      <Button action={{ type: 'boat' }} send={send} disabled={inactive}>返回船上</Button>
    </nav>
  );
}

type StoreProps = { snapshot: FishingSnapshot; send: Send; inactive: boolean };

function keepDialogFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]')];
  const current = controls.findIndex(control => control === document.activeElement);
  if (!controls.length) return;
  if (current < 0 || (event.shiftKey ? current === 0 : current === controls.length - 1)) {
    event.preventDefault();
    controls[event.shiftKey ? controls.length - 1 : 0].focus();
  }
}

function RodFigure({ level }: { level: RodLevel }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) drawRodDisplay(canvas.current, level);
  }, [level]);
  return <canvas className="tf-rod-art" width={32} height={60} ref={canvas} aria-hidden="true" />;
}

function ShopTitle({ shop }: { shop: keyof typeof shops }) {
  return <h2 className="tf-room-title" tabIndex={-1} data-focus="entry">{shops[shop]}</h2>;
}

function RodDetail({ level, snapshot, send, close, inactive }: StoreProps & { level: RodLevel; close: () => void }) {
  const rod = ROD_CATALOG[level];
  const title = useId();
  const dismiss = useRef<HTMLButtonElement>(null);
  const owned = level <= snapshot.rod.owned;
  const equipped = level === snapshot.rod.equipped;
  const locked = level > snapshot.rod.owned + 1;
  const affordable = snapshot.coins >= rod.upgradeCost;
  useEffect(() => { dismiss.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="tf-detail-shade">
      <section className="tf-rod-detail" role="dialog" aria-modal="true" aria-labelledby={title} data-shop-popup onKeyDown={keepDialogFocus}>
        <div className="tf-detail-title">
          <h3 id={title}>{rod.name} <small>Lv.{level}</small></h3>
          <button type="button" className="tf-button" onClick={close} disabled={inactive} ref={dismiss} data-popup-close data-ui-sound>关闭</button>
        </div>
        <div className="tf-detail-content">
          <RodFigure level={level} />
          <dl>
            <div><dt>价格</dt><dd>{rod.upgradeCost ? `${rod.upgradeCost} 金币` : '初始装备'}</dd></div>
            <div><dt>基础等口</dt><dd>{rod.minWaitMs / 1000}–{rod.maxWaitMs / 1000} 秒</dd></div>
            <div><dt>轻敲间隔</dt><dd>{rod.tapCooldownMs / 1000} 秒</dd></div>
            {rod.rareBonusMs > 0 && <div><dt>深水竿效果</dt><dd>稀有鱼额外提早 {rod.rareBonusMs / 1000} 秒咬钩</dd></div>}
          </dl>
        </div>
        <Button action={{ type: owned ? 'equip' : 'upgrade', level }} send={(action, gesture) => {
          send(action, gesture);
          dismiss.current?.focus({ preventScroll: true });
        }} primary
          disabled={inactive || equipped || (!owned && (locked || !affordable))}>
          {equipped ? '已装备' : owned ? '装备鱼竿' : locked ? '先解锁青鳍海竿' : affordable ? '购买并装备' : '金币不足'}
        </Button>
      </section>
    </div>
  );
}

const rodLevels: readonly RodLevel[] = [1, 2, 3];

function Tackle({ snapshot, send, inactive }: StoreProps) {
  const [selected, select] = useState<RodLevel>();
  const initiator = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected === undefined && !inactive) initiator.current?.focus({ preventScroll: true });
  }, [selected, inactive]);
  return (
    <section className="tf-shop-room" aria-label={shops.tackle}>
      <img className="tf-interior" src={tackleRoom} alt="" />
      <ShopTitle shop="tackle" />
      <div className="tf-rod-rack" role="group" aria-label="墙上鱼竿">
        {rodLevels.map(level => (
          <button type="button" className="tf-rack-rod" key={level} aria-haspopup="dialog" data-ui-sound
            disabled={inactive || selected !== undefined} onClick={event => {
              initiator.current = event.currentTarget;
              select(level);
            }}>
            <RodFigure level={level} />
            <span>{ROD_CATALOG[level].name}</span>
            {snapshot.rod.equipped === level && <small>已装备</small>}
          </button>
        ))}
      </div>
      <div className="tf-room-actions">
        <BoatCommand id="dock" icon="fishingBoat" label="返回码头" send={send} disabled={inactive || selected !== undefined} />
        <Button action={{ type: 'bait' }} send={send} disabled={inactive || selected !== undefined} focus="bait">鱼饵柜</Button>
      </div>
      {selected !== undefined && <RodDetail level={selected} snapshot={snapshot} send={send} inactive={inactive} close={() => select(undefined)} />}
    </section>
  );
}

const stations = {
  grill: { name: '烤架', label: '烧烤' },
  steamer: { name: '蒸笼', label: '清蒸' },
  board: { name: '砧板', label: '寿司' },
} satisfies Record<CookingStation, { name: string; label: string }>;
const stationIds = Object.keys(stations) as CookingStation[];

const dishCells = {
  grilled: 0, misoMackerel: 1, charredHerring: 2, squidSkewers: 3,
  grilledFlyingFish: 4, grilledFlatfish: 5, steamed: 6, gingerSeaBass: 7,
  steamedSnapper: 8, steamedAnchovy: 9, steamedCroaker: 10, basic: 11,
  special: 12, sardineRoll: 13, bluefinSashimi: 14, lanternSushi: 15,
} satisfies Record<RecipeId, number>;

function DishArt({ id }: { id: RecipeId }) {
  const cell = dishCells[id];
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  return <i className="tf-dish-art" aria-hidden="true" style={{
    backgroundImage: 'url("' + seafoodMenu + '")',
    backgroundPosition: column / 3 * 100 + '% ' + row / 3 * 100 + '%',
  }} />;
}

function RecipeForm({ recipe, snapshot, inactive, send }: StoreProps & { recipe: RecipeDisplay }) {
  const available = snapshot.fish.filter(fish => fish.count > 0 && (!recipe.eligibleFishIds || recipe.eligibleFishIds.includes(fish.id)));
  const [choice, setChoice] = useState<FishId>();
  const [requested, setRequested] = useState(1);
  const fish = available.find(entry => entry.id === choice)
    ?? available.find(entry => entry.count >= recipe.fishPerPortion)
    ?? available[0];
  const slots = snapshot.queueCapacity - snapshot.orders.length;
  const stockPortions = Math.floor((fish?.count ?? 0) / recipe.fishPerPortion);
  const limit = Math.min(stockPortions, slots);
  const quantity = Math.max(1, Math.min(requested, limit));
  const requiredFish = recipe.fishPerPortion * quantity;
  const blocked = !stockPortions ? '食材不足' : !slots ? '制作队列已满' : undefined;

  return (
    <div className="tf-recipe-form">
      <p className="tf-recipe-rule">{recipe.requirement} · 每份 {recipe.fishPerPortion} 条</p>
      <label className="tf-select-label">鱼种
        <select value={fish?.id ?? ''} disabled={inactive || !fish} onChange={event => {
          setChoice(event.currentTarget.value as FishId);
          setRequested(1);
        }}>
          {!fish && <option value="">鱼篓中没有可用鱼种</option>}
          {available.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · 库存 {entry.count} 条</option>)}
        </select>
      </label>
      <div className="tf-quantity" role="group" aria-label="制作份数">
        <span>制作份数</span>
        <button type="button" className="tf-button" aria-label="减少一份" disabled={inactive || quantity <= 1} data-ui-sound onClick={() => setRequested(quantity - 1)}>−</button>
        <output aria-label="当前份数">{quantity}</output>
        <button type="button" className="tf-button" aria-label="增加一份" disabled={inactive || quantity >= limit} data-ui-sound onClick={() => setRequested(quantity + 1)}>+</button>
      </div>
      <dl className="tf-recipe-totals">
        <div><dt>所需材料</dt><dd>{fish ? `${fish.name} ` : ''}{requiredFish} 条</dd></div>
        <div><dt>制作时间</dt><dd>{recipe.saleMs * quantity / 1000} 秒</dd></div>
        <div><dt>售出收入</dt><dd>{recipe.coins * quantity} 金币</dd></div>
      </dl>
      <button type="button" className="tf-button tf-primary" disabled={inactive || !!blocked}
        onClick={event => {
          if (!fish) return;
          const close = event.currentTarget.closest('[data-shop-popup]')?.querySelector<HTMLButtonElement>('[data-popup-close]');
          send({ type: 'prepare', fishId: fish.id, recipeId: recipe.id, quantity }, event.isTrusted);
          setRequested(1);
          close?.focus({ preventScroll: true });
        }}>{blocked ?? `制作 ${quantity} 份`}</button>
    </div>
  );
}

function CookingMenu({ station, initialDish, close, snapshot, send, inactive }: StoreProps & {
  station: CookingStation; initialDish?: RecipeId; close: () => void;
}) {
  const title = useId();
  const dismiss = useRef<HTMLButtonElement>(null);
  const recipes = snapshot.recipes.filter(recipe => recipe.station === station);
  const [chosen, choose] = useState(initialDish);
  const recipe = recipes.find(entry => entry.id === chosen) ?? recipes[0];
  useEffect(() => { if (!inactive) dismiss.current?.focus({ preventScroll: true }); }, [inactive]);
  if (!recipe) return null;

  return (
    <div className="tf-detail-shade">
      <section className="tf-panel tf-cooking-menu" role="dialog" aria-modal="true"
        aria-labelledby={title} data-shop-popup onKeyDown={keepDialogFocus}>
        <div className="tf-panel-head">
          <h3 id={title}>{stations[station].name}菜单</h3>
          <button type="button" className="tf-button" onClick={close} disabled={inactive} ref={dismiss} data-popup-close data-ui-sound>
            {initialDish ? '返回账本' : '返回店内'}
          </button>
        </div>
        <div className="tf-panel-body" tabIndex={inactive ? -1 : 0} role="region" aria-label="制作详情与队列" data-game-scroll>
          <div className="tf-cooking-layout">
            <div className="tf-cooking-recipe">
              <div className="tf-recipe-list" role="group" aria-label="菜品">
                {recipes.map(entry => {
                  const wanted = snapshot.guest?.recipes.includes(entry.id);
                  return <button type="button" key={entry.id}
                    className={entry.id === recipe.id ? 'tf-button tf-primary' : 'tf-button'}
                    data-guest-dish={wanted || undefined} aria-pressed={entry.id === recipe.id}
                    disabled={inactive} data-ui-sound onClick={() => choose(entry.id)}>
                    <DishArt id={entry.id} />
                    <span className="tf-dish-name">{entry.name}</span>
                    <small>{entry.saleMs / 1000} 秒 · {entry.coins} 金币</small>
                  </button>;
                })}
              </div>
              {snapshot.guest?.recipes.includes(recipe.id) && <p className="tf-guest-inline">
                {snapshot.guest.guest}在等这道菜 · 上菜 {snapshot.guest.served}/{snapshot.guest.portions}
              </p>}
              <RecipeForm key={recipe.id} recipe={recipe} snapshot={snapshot} send={send} inactive={inactive} />
            </div>
            <section className="tf-card tf-cooking-orders">
              <h3>制作队列 <small>{snapshot.orders.length} / {snapshot.queueCapacity}</small></h3>
              {!!snapshot.orders.length && <ol className="tf-orders">
                {snapshot.orders.map((order, index) => (
                  <li key={order.id}>
                    <span>{order.label}</span><small>{index === 0 ? '制作中' : '排队中'}</small>
                    {index === 0 && <progress aria-label={`${order.label}制作进度`} max={1} value={order.progress} />}
                  </li>
                ))}
              </ol>}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrderLedger({ snapshot, inactive, close, chooseDish }: {
  snapshot: FishingSnapshot;
  inactive: boolean;
  close: () => void;
  chooseDish: (recipe: RecipeDisplay) => void;
}) {
  const title = useId();
  const dismiss = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!inactive) dismiss.current?.focus({ preventScroll: true }); }, [inactive]);
  const { guest } = snapshot;
  const dishes = snapshot.recipes.filter(recipe => guest?.recipes.includes(recipe.id));

  return (
    <div className="tf-detail-shade">
      <section className="tf-ledger" role="dialog" aria-modal="true" aria-labelledby={title} data-shop-popup onKeyDown={keepDialogFocus}>
        <div className="tf-ledger-spread">
          <div className="tf-ledger-page tf-ledger-summary">
            <h2 id={title}>熟客点单</h2>
            {guest ? <>
              <h3>{guest.guest}</h3>
              <dl>
                <div><dt>上菜</dt><dd>{guest.served} / {guest.portions} 份</dd></div>
                <div><dt>交齐小费</dt><dd>+{guest.bonus} 金币</dd></div>
              </dl>
            </> : <p>本趟熟客订单已全部上齐。</p>}
          </div>
          <div className="tf-ledger-page tf-ledger-recipes">
            <h3>订单需求</h3>
            {guest ? <>
              <p>还需 {guest.portions - guest.served} 份</p>
              <ul className="tf-ledger-dishes">
                {dishes.map(recipe => (
                  <li key={recipe.id}>
                    <button type="button" data-ui-sound data-ledger-recipe={recipe.id} disabled={inactive}
                      onClick={() => chooseDish(recipe)}>
                      <strong>{recipe.name}</strong>
                      <span>{recipe.requirement} · 每份 {recipe.fishPerPortion} 条</span>
                    </button>
                  </li>
                ))}
              </ul>
            </> : <p>已完成 {snapshot.guestsServed} 单</p>}
          </div>
        </div>
        <button type="button" className="tf-button tf-ledger-close" onClick={close} disabled={inactive}
          ref={dismiss} data-popup-close data-ui-sound>合上</button>
      </section>
    </div>
  );
}

type MarketPopup = { type: 'ledger' } | { type: 'menu'; station: CookingStation; dish?: RecipeId };

function Market({ snapshot, send, inactive }: StoreProps) {
  const [popup, openPopup] = useState<MarketPopup>();
  const initiator = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!popup && !inactive) initiator.current?.focus({ preventScroll: true });
  }, [popup, inactive]);
  const blocked = inactive || !!popup;

  return (
    <section className="tf-shop-room" aria-label={shops.market} data-inactive={inactive || undefined}>
      <img className="tf-interior" src={marketRoom} alt="" />
      <ShopTitle shop="market" />
      <button type="button" className="tf-ledger-cover" aria-label="打开点单簿"
        aria-haspopup="dialog" disabled={blocked} data-ui-sound onClick={event => {
          initiator.current = event.currentTarget;
          openPopup({ type: 'ledger' });
        }}>
        <span>点单簿</span>
      </button>
      <div role="group" aria-label="厨房工作台">
        {stationIds.map(id => (
          <button type="button" key={id} data-station={id} className="tf-cooking-spot"
            aria-label={stations[id].name} aria-haspopup="dialog" disabled={blocked} data-ui-sound
            onClick={event => {
              initiator.current = event.currentTarget;
              openPopup({ type: 'menu', station: id });
            }}>
            {snapshot.orders[0]?.station === id && <i className="tf-cooking-steam" aria-hidden="true" />}
            <span>{stations[id].label}</span>
          </button>
        ))}
      </div>
      <div className="tf-room-actions">
        <BoatCommand id="dock" icon="fishingBoat" label="返回码头" send={send} disabled={blocked} />
      </div>
      {popup?.type === 'ledger' && <OrderLedger snapshot={snapshot} inactive={inactive} close={() => openPopup(undefined)}
        chooseDish={recipe => openPopup({ type: 'menu', station: recipe.station, dish: recipe.id })} />}
      {popup?.type === 'menu' && <CookingMenu station={popup.station} initialDish={popup.dish} snapshot={snapshot} send={send} inactive={inactive}
        close={() => openPopup(popup.dish ? { type: 'ledger' } : undefined)} />}
    </section>
  );
}

function Journal({ snapshot, send, inactive }: { snapshot: FishingSnapshot; send: Send; inactive: boolean }) {
  const total = snapshot.fish.filter(fish => fish.discovered).length;
  return (
    <Panel title={`海湾图鉴 · ${total}/${snapshot.fish.length}`} send={send} inactive={inactive} back="boat">
      <ul className="tf-journal" aria-label="鱼种记录">
        {snapshot.fish.map(fish => (
          <li className="tf-card tf-fish" data-rarity={fish.discovered ? fish.rarity : undefined} key={fish.id}>
            <FishFigure fish={fish} />
            <h3>{fish.discovered ? fish.name : '未发现'}</h3>
            {fish.discovered && <p>{fish.rarity} · 收线 {fish.reelMs / 1000} 秒</p>}
            {fish.discovered && <small>{FISH_MASS[fish.id].map(formatMass).join(' – ')}</small>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const baitIds = Object.keys(BAITS) as BaitId[];

function BaitPanel({ snapshot, send, inactive }: StoreProps) {
  const { stock, bait: selected } = snapshot.angling;
  return (
    <Panel title={snapshot.baitStore ? '鱼饵柜' : '鱼饵袋'} send={send} inactive={inactive} back="close-overlay" backLabel="返回">
      <ul className="tf-bait-list">
        {baitIds.map(id => {
          const bait = BAITS[id];
          const amount = id === 'none' ? undefined : stock[id];
          return (
            <li className="tf-card" key={id} data-bait={id}>
              <span className="tf-bait-art" aria-hidden="true" />
              <div><h3>{bait.name}{amount !== undefined && <small> · 剩 {amount} 份</small>}</h3><p>{bait.effect}</p></div>
              <div className="tf-actions">
                <Button action={{ type: 'select-bait', bait: id }} send={send} disabled={inactive || selected === id || amount === 0}>
                  {selected === id ? '已选' : `选用${bait.name}`}
                </Button>
                {snapshot.baitStore && id !== 'none' && <Button action={{ type: 'buy-bait', bait: id }}
                  send={send} primary disabled={inactive || (amount ?? 0) + BAIT_PACK > BAIT_LIMIT || snapshot.coins < bait.price}>
                  补充 {BAIT_PACK} 份 · {bait.price} 金币
                </Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function CareerGallery({ snapshot, send, inactive }: StoreProps) {
  const { best, counts } = snapshot.angling;
  const trophy = best && snapshot.fish.find(fish => fish.id === best.fishId);
  const total = snapshot.fish.reduce((sum, fish) => sum + (counts[fish.id] ?? 0), 0);
  return (
    <section className="tf-career-room" aria-label="东湾荣誉室">
      <img src={careerRoom} className="tf-interior" alt="" />
      <div className="tf-career-heading">
        <h2 tabIndex={-1} data-focus="entry">钓鱼生涯</h2>
        <Button action={{ type: 'close-overlay' }} send={send} disabled={inactive}>返回</Button>
      </div>
      <div className="tf-career-display">
        <section className="tf-trophy" aria-label="最大渔获">
          <h3>最大渔获</h3>
          {best && trophy ? <>
            <FishSprite id={best.fishId} />
            <strong>{formatMass(best.grams)}</strong>
            <p>{trophy.name} · {trophy.rarity}</p>
          </> : <p>暂无纪录</p>}
        </section>
        <section className="tf-career-counts" aria-label="各鱼种捕获次数">
          <h3>累计渔获 <strong>{total} 条</strong></h3>
          <ul tabIndex={inactive ? -1 : 0} data-game-scroll>
            {snapshot.fish.map(fish => <li key={fish.id}><span>{fish.name}</span><b>{counts[fish.id] ?? 0} 条</b></li>)}
          </ul>
        </section>
      </div>
    </section>
  );
}

function CatchReveal({ card, snapshot, send, inactive }: StoreProps & { card: CatchCard }) {
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = cardRef.current;
    return () => {
      if (!element?.contains(element.ownerDocument.activeElement)) return;
      element.closest('.tf-view')?.querySelector<HTMLElement>('.tf-boat-status')?.focus({ preventScroll: true });
    };
  }, []);
  const fish = snapshot.fish.find(entry => entry.id === card.fishId);
  if (!fish) return null;
  return (
    <aside className="tf-catch-reveal" ref={cardRef} data-record={card.record || undefined} data-rarity={fish.rarity} aria-label="渔获卡">
      <Button action={{ type: 'dismiss-catch' }} send={send} disabled={inactive} focus="catch-close">收起</Button>
      <div role="status" aria-atomic="true">
        {(card.record || card.firstDiscovery) && <p className="tf-catch-ribbon">{card.record ? '生涯新纪录' : '图鉴新发现'}</p>}
        <FishSprite id={fish.id} />
        <h2>{fish.name}</h2>
        <strong>{formatMass(card.grams)}</strong>
        <small>{fish.rarity} · {BAITS[card.bait].name} · 累计 {snapshot.angling.counts[fish.id] ?? 0} 条</small>
      </div>
    </aside>
  );
}

export function FishingView({ snapshot, scene, isActive = true, onAction, canvasRef, onDockImageSettled }: FishingViewProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const root = useRef<HTMLElement>(null);
  const previous = useRef(snapshot.screen);
  const latestScene = useRef(scene);
  const [dockRequested, setDockRequested] = useState(false);
  const { screen } = snapshot;
  const ashore = screen === 'dock';
  const indoors = screen === 'market' || screen === 'tackle' || screen === 'career' || snapshot.baitStore;
  const setCanvas = useCallback<RefCallback<HTMLCanvasElement>>(element => {
    canvas.current = element;
    canvasRef?.(element);
  }, [canvasRef]);
  const drawStatic = useCallback(() => {
    if (canvas.current && !canvas.current.hidden) drawFishingBay(canvas.current, latestScene.current);
  }, []);
  useLayoutEffect(() => {
    latestScene.current = ashore ? { ...scene, crossing: { destination: 'dock', progress: 1 } } : scene;
    drawStatic();
  }, [scene, ashore, drawStatic]);
  useEffect(() => {
    if (ashore || screen === 'crossing') setDockRequested(true);
  }, [ashore, screen]);
  useEffect(() => {
    const atlas = new Image();
    atlas.onload = () => {
      if (!canvas.current) return;
      setFishingAtlas(canvas.current, atlas);
      if (previous.current !== 'crossing') drawStatic();
    };
    atlas.src = bayAtlas;
    return () => { atlas.onload = null; };
  }, [drawStatic]);
  useEffect(() => {
    const from = previous.current;
    if (!isActive || from === screen) return;
    previous.current = screen;
    let focus = 'entry';
    if (from === 'bait' || from === 'career' || from === 'guide') focus = from;
    if (screen === 'dock') focus = from === 'market' ? 'market' : 'tackle';
    if (screen === 'boat' && (from === 'dock' || from === 'journal' || from === 'pause' || from === 'crossing')) focus = from === 'crossing' ? 'dock' : from;
    const target = root.current?.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
    target?.focus({ preventScroll: true });
  }, [screen, isActive]);

  const inactive = !isActive;
  const { fight } = snapshot;
  const selectedBait = snapshot.angling.bait;
  const anglingToolsDisabled = inactive || !!fight || snapshot.reeling;
  return (
    <section className="tf-view" aria-label="潮汐小馆" data-screen={screen} data-inactive={inactive || undefined} ref={root}>
      <div className="tf-stage">
        <canvas className="tf-bay" ref={setCanvas} width={BAY_WIDTH} height={BAY_HEIGHT} aria-hidden="true" hidden={indoors} />
        {snapshot.baitStore && <img className="tf-bait-backdrop" src={tackleRoom} alt="" />}
        {(ashore || screen === 'crossing' || dockRequested) && (
          <img className="tf-harbor" src={dockStreet} alt="" hidden onLoad={event => {
            if (canvas.current) setDockImage(canvas.current, event.currentTarget);
            if (ashore) drawStatic();
            onDockImageSettled?.();
          }} onError={onDockImageSettled} />
        )}
        <Header snapshot={snapshot} />
        <p className="tf-sr-only" role="status" aria-atomic="true">
          {screen === 'crossing' || snapshot.catchCard || screen === 'career' ? undefined : snapshot.notice}
        </p>
        {screen === 'crossing' && (
          <p className="tf-crossing-status" tabIndex={-1} data-focus="entry">
            {scene.crossing?.destination === 'dock' ? '正在靠岸' : '正在出海'}
          </p>
        )}
        {screen === 'home' && (
          <>
            <h1 className="tf-home-start">
              <button type="button" className="tf-start" data-focus="entry" disabled={inactive}
                onClick={event => onAction({ type: 'start' }, event.isTrusted)}>
                <FishSprite id="sardine" />
                <span className="tf-start-label">现在上鱼！</span>
                <span className="tf-start-coins" aria-hidden="true"><i /><i /><i /></span>
              </button>
            </h1>
            <nav className="tf-home-actions" aria-label="首页操作">
              <BoatCommand id="career" label="钓鱼生涯" disabled={inactive} send={onAction} />
              <BoatCommand id="exit" label="退出" disabled={inactive} send={onAction} />
            </nav>
          </>
        )}
        {screen === 'boat' && (
          <div className="tf-boat">
            <div className="tf-guide-entry">
              <BoatCommand id="guide" label="任务指南" disabled={anglingToolsDisabled} send={onAction} />
            </div>
            <FightControls snapshot={snapshot} send={onAction} inactive={inactive} impulse={scene.impulse} />
            <BoatStatus snapshot={snapshot} scene={scene} />
            <nav className="tf-angling-actions" aria-label="钓鱼工具">
              <BoatCommand id="bait" label="鱼饵袋" disabled={anglingToolsDisabled} send={onAction}
                detail={selectedBait === 'none' ? undefined : '已选' + BAITS[selectedBait].name} />
              <BoatCommand id="career" label="钓鱼生涯" disabled={anglingToolsDisabled} send={onAction} />
            </nav>
            <BoatControls snapshot={snapshot} send={onAction} inactive={inactive} />
          </div>
        )}
        {screen === 'dock' && <Dock send={onAction} inactive={inactive} />}
        {screen === 'tackle' && <Tackle snapshot={snapshot} send={onAction} inactive={inactive} />}
        {screen === 'market' && <Market snapshot={snapshot} send={onAction} inactive={inactive} />}
        {screen === 'journal' && <Journal snapshot={snapshot} send={onAction} inactive={inactive} />}
        {screen === 'guide' && <QuestGuide snapshot={snapshot} send={onAction} inactive={inactive} />}
        {screen === 'bait' && <BaitPanel snapshot={snapshot} send={onAction} inactive={inactive} />}
        {screen === 'career' && <CareerGallery snapshot={snapshot} send={onAction} inactive={inactive} />}
        {snapshot.catchCard && (
          <div className="tf-landing" key={snapshot.basket.count} data-record={snapshot.catchCard.record || undefined}>
            <CatchReveal card={snapshot.catchCard} snapshot={snapshot} send={onAction} inactive={inactive} />
          </div>
        )}
        {screen === 'pause' && (
          <Panel title="暂停" send={onAction} inactive={inactive}>
            <div className="tf-actions">
              <Button action={{ type: 'resume' }} send={onAction} disabled={inactive} primary>继续<Icon name="next" /></Button>
              <Button action={{ type: 'finish' }} send={onAction} disabled={inactive}>收工</Button>
            </div>
          </Panel>
        )}
        {screen === 'result' && (
          <Panel title="今日收工" send={onAction} inactive={inactive}>
            <dl className="tf-totals">
              <div><dt>本趟营业额</dt><dd>{snapshot.score}</dd></div>
              <div><dt>历史最高</dt><dd>{snapshot.highScore}</dd></div>
            </dl>
            <p>{snapshot.victory ? '已达成' : '未达成'} {snapshot.goal} 金币营业目标</p>
            <p>熟客上齐 {snapshot.guestsServed} / {GUEST_ORDERS.length} 单</p>
            <Button action={{ type: 'career' }} send={onAction} disabled={inactive} focus="career">钓鱼生涯</Button>
            <Button action={{ type: 'home' }} send={onAction} disabled={inactive} primary><Icon name="back" />返回首页</Button>
          </Panel>
        )}
      </div>
    </section>
  );
}
