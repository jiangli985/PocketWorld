import React, { useCallback, useEffect, useState } from 'react';
import {
  CharacterPosture,
  InteractableId,
  MusicDisc,
  RoomLightingState,
} from './types/interactable';
import { GameId } from './types/game';
import { RoomScene, RoomViewAction, RoomViewCommand } from './scene/RoomScene';
import {
  PRESET_MUSIC_DISCS,
  roomAudio,
} from './scene/audioEngine';
import { MusicPlayerModal } from './components/music-player/MusicPlayerModal';
import { PocketOSModal } from './components/computer/PocketOSModal';
import { RoomDetailModal } from './components/room-panels/RoomDetailModal';

function getDevGameParam(): GameId | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const dev = params.get('dev');
  if (dev === 'mario' || dev === 'shooter') {
    return dev;
  }
  return null;
}

export const App: React.FC = () => {
  const devGame = getDevGameParam();

  const [lighting, setLighting] = useState<RoomLightingState>({
    mainLightOn: true,
    bedsideLampOn: true,
    stringLightsOn: true,
    timeOfDay: 'day',
  });

  const [hoveredId, setHoveredId] = useState<InteractableId | null>(null);
  const [focusedId, setFocusedId] = useState<InteractableId | null>(
    devGame ? 'computer' : null
  );
  const [modalVisible, setModalVisible] = useState<boolean>(Boolean(devGame));
  const [activeCartridgeGame, setActiveCartridgeGame] = useState<GameId | null>(
    devGame
  );

  // 主角状态
  const [posture, setPosture] = useState<CharacterPosture>('standing');
  const [walkTarget, setWalkTarget] = useState<[number, number, number] | null>(
    null
  );
  const [nearbyId, setNearbyId] = useState<InteractableId | null>(null);
  const [characterPos, setCharacterPos] = useState<[number, number, number]>([
    0.95, 0, 0.45,
  ]);
  const [statusBubble, setStatusBubble] = useState<string | null>(null);

  // 音乐与音效状态
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [discs, setDiscs] = useState<MusicDisc[]>(PRESET_MUSIC_DISCS);
  const [activeDisc, setActiveDisc] = useState<MusicDisc>(PRESET_MUSIC_DISCS[0]);
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);

  // 场景微交互反馈状态
  const [chairAngle, setChairAngle] = useState<number>(0.25);
  const [pettedAt, setPettedAt] = useState<number>(0);
  const [plantWateredAt, setPlantWateredAt] = useState<number>(0);
  const [trashTossedAt, setTrashTossedAt] = useState<number>(0);
  const [viewCommand, setViewCommand] = useState<RoomViewCommand | null>(null);

  const sendViewCommand = useCallback((action: RoomViewAction) => {
    setViewCommand((prev) => ({ action, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const showTransientBubble = useCallback((msg: string) => {
    setStatusBubble(msg);
    window.setTimeout(() => {
      setStatusBubble((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  const handleCloseFocus = useCallback(() => {
    setModalVisible(false);
    setFocusedId(null);
    setActiveCartridgeGame(null);
  }, []);

  // Esc 返回房间（当不在小游戏运行中时）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && focusedId && !activeCartridgeGame) {
        e.preventDefault();
        handleCloseFocus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeCartridgeGame, focusedId, handleCloseFocus]);

  const handleInteract = useCallback(
    (id: InteractableId) => {
      if (id === 'light-switch') {
        roomAudio.playSfx('switch');
        setLighting((prev) => {
          const next = !prev.mainLightOn;
          showTransientBubble(next ? '已开启房间主照明' : '已关闭房间主照明');
          return { ...prev, mainLightOn: next };
        });
        return;
      }

      if (id === 'bedside-lamp') {
        roomAudio.playSfx('switch');
        setLighting((prev) => {
          const next = !prev.bedsideLampOn;
          showTransientBubble(next ? '已点亮床头阅读暖灯' : '已关闭床头暖灯');
          return { ...prev, bedsideLampOn: next };
        });
        return;
      }

      if (id === 'string-lights') {
        roomAudio.playSfx('switch');
        setLighting((prev) => {
          const next = !prev.stringLightsOn;
          showTransientBubble(next ? '已开启吊柜暖黄串灯' : '已关闭吊柜串灯');
          return { ...prev, stringLightsOn: next };
        });
        return;
      }

      if (id === 'window') {
        roomAudio.playSfx('soft');
        setLighting((prev) => {
          const nextTime = prev.timeOfDay === 'day' ? 'night' : 'day';
          showTransientBubble(
            nextTime === 'day'
              ? '窗外切换为「午后暖阳」'
              : '窗外切换为「静谧月夜」'
          );
          return { ...prev, timeOfDay: nextTime };
        });
        return;
      }

      if (id === 'bed') {
        roomAudio.playSfx('soft');
        setWalkTarget(null);
        setPosture((prev) => {
          const next = prev === 'sleeping' ? 'standing' : 'sleeping';
          showTransientBubble(
            next === 'sleeping' ? '躺在温暖的木床上小憩...' : '伸了个懒腰起床啦'
          );
          return next;
        });
        return;
      }

      if (id === 'chair') {
        roomAudio.playSfx('soft');
        setWalkTarget(null);
        setChairAngle((prev) => prev + Math.PI * 0.65);
        setPosture((prev) => {
          const next = prev === 'sitting' ? 'standing' : 'sitting';
          showTransientBubble(
            next === 'sitting' ? '坐在电脑转椅上' : '从转椅上起身'
          );
          return next;
        });
        return;
      }

      if (id === 'pet') {
        roomAudio.playSfx('cat');
        setPettedAt(performance.now());
        setPosture('petting');
        showTransientBubble('橘猫「团子」开心地蹭了蹭你的手 ~ 呼噜呼噜');
        window.setTimeout(() => {
          setPosture((prev) => (prev === 'petting' ? 'standing' : prev));
        }, 1400);
        return;
      }

      if (id === 'plant') {
        roomAudio.playSfx('water');
        setPlantWateredAt(performance.now());
        showTransientBubble('给琴叶榕花箱浇了水，叶片舒展摇曳');
        return;
      }

      if (id === 'trash-bin') {
        roomAudio.playSfx('paper');
        setTrashTossedAt(performance.now());
        showTransientBubble('随手将一张废纸团精准投进纸篓！');
        return;
      }

      // 需要相机推进并展开交互界面的物品：computer / music-player / bookcase / wall-art
      roomAudio.playSfx('soft');
      setWalkTarget(null);
      setFocusedId(id);
      setModalVisible(false);
      window.setTimeout(() => {
        setModalVisible(true);
      }, 620);
    },
    [showTransientBubble]
  );

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      roomAudio.setMuted(next);
      return next;
    });
  };

  const handleSelectDisc = (disc: MusicDisc) => {
    roomAudio.playSfx('disc');
    setActiveDisc(disc);
    setIsMusicPlaying(true);
    roomAudio.startMusic(disc);
  };

  const handleToggleMusicPlay = () => {
    if (isMusicPlaying) {
      roomAudio.stopMusic();
      setIsMusicPlaying(false);
    } else {
      roomAudio.startMusic(activeDisc);
      setIsMusicPlaying(true);
    }
  };

  const handleAddUserDisc = (newDisc: MusicDisc) => {
    setDiscs((prev) => [newDisc, ...prev]);
    setActiveDisc(newDisc);
    setIsMusicPlaying(true);
    roomAudio.startMusic(newDisc);
    showTransientBubble(`已压制并播放新光盘：《${newDisc.title}》`);
  };

  return (
    <div
      className={`pocketworld-root ${
        lighting.timeOfDay === 'night' || !lighting.mainLightOn
          ? 'is-night-ambience'
          : 'is-day-ambience'
      }`}
    >
      {/* 3D 等轴测房间画布 */}
      <RoomScene
        lighting={lighting}
        hoveredId={hoveredId}
        onHoverChange={setHoveredId}
        focusedId={focusedId}
        onInteract={handleInteract}
        posture={posture}
        onPostureChange={setPosture}
        walkTarget={walkTarget}
        onWalkTargetChange={setWalkTarget}
        nearbyId={nearbyId}
        onNearbyChange={setNearbyId}
        characterPos={characterPos}
        onCharacterPosChange={setCharacterPos}
        statusBubble={statusBubble}
        isMusicPlaying={isMusicPlaying}
        activeDisc={activeDisc}
        chairAngle={chairAngle}
        pettedAt={pettedAt}
        plantWateredAt={plantWateredAt}
        trashTossedAt={trashTossedAt}
        viewCommand={viewCommand}
      />

      {/* 顶部环境与灯光快捷控制栏 */}
      <header className="room-hud-topbar">
        <div className="brand-pill">
          <h1>PocketWorld</h1>
          <span className="brand-status-dot" />
          <span className="brand-subtitle">
            主角：小宇（{posture === 'sleeping' ? '床上小憩' : posture === 'sitting' ? '桌前入座' : '自由探索'}）
          </span>
        </div>

        <nav className="room-quick-controls" aria-label="房间灯光与设备快捷控制">
          <button
            type="button"
            className={`hud-toggle-btn ${lighting.mainLightOn ? 'is-on' : ''}`}
            onClick={() => handleInteract('light-switch')}
          >
            主灯：{lighting.mainLightOn ? '开' : '关'}
          </button>

          <button
            type="button"
            className={`hud-toggle-btn ${lighting.bedsideLampOn ? 'is-on' : ''}`}
            onClick={() => handleInteract('bedside-lamp')}
          >
            床头灯：{lighting.bedsideLampOn ? '开' : '关'}
          </button>

          <button
            type="button"
            className={`hud-toggle-btn ${lighting.stringLightsOn ? 'is-on' : ''}`}
            onClick={() => handleInteract('string-lights')}
          >
            串灯：{lighting.stringLightsOn ? '开' : '关'}
          </button>

          <button
            type="button"
            className={`hud-toggle-btn ${lighting.timeOfDay === 'day' ? 'is-on' : ''}`}
            onClick={() => handleInteract('window')}
          >
            窗景：{lighting.timeOfDay === 'day' ? '午后暖阳' : '静谧月夜'}
          </button>

          <button
            type="button"
            className={`hud-toggle-btn ${isMusicPlaying ? 'is-playing' : ''}`}
            onClick={() => handleInteract('music-player')}
          >
            唱机：{isMusicPlaying ? activeDisc.title.slice(0, 8) : '点此播放'}
          </button>

          <button
            type="button"
            className="hud-toggle-btn is-accent"
            onClick={() => handleInteract('computer')}
          >
            打开电脑
          </button>

          <button
            type="button"
            className="hud-toggle-btn"
            onClick={handleToggleMute}
          >
            {isMuted ? '取消静音' : '静音'}
          </button>
        </nav>
      </header>

      {!focusedId && (
        <div className="room-view-controls" role="toolbar" aria-label="视角控制">
          <button type="button" title="向左环绕" aria-label="向左环绕" onClick={() => sendViewCommand('rotate-left')}>
            ⟲
          </button>
          <button type="button" title="放大" aria-label="放大" onClick={() => sendViewCommand('zoom-in')}>
            +
          </button>
          <button type="button" title="复位视角" aria-label="复位视角" onClick={() => sendViewCommand('reset')}>
            ⌂
          </button>
          <button type="button" title="缩小" aria-label="缩小" onClick={() => sendViewCommand('zoom-out')}>
            −
          </button>
          <button type="button" title="向右环绕" aria-label="向右环绕" onClick={() => sendViewCommand('rotate-right')}>
            ⟳
          </button>
        </div>
      )}

      {/* 底部主角控制与房间交互指引栏 */}
      {!focusedId && (
        <footer className="room-hud-bottombar">
          <div className="controls-guide-bar">
            <span>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> 或 <kbd>方向键</kbd> 控制主角行走
            </span>
            <span>
              <kbd>Space</kbd> 跳跃
            </span>
            <span>
              靠近家具按 <kbd>E</kbd> 或 <strong>直接点击家具/开关/猫咪</strong> 互动
            </span>
            <span>点击地板任意位置可引导主角前往</span>
            <span>拖动旋转 · 滚轮缩放 · 右键平移</span>
          </div>
        </footer>
      )}

      {/* 推镜到位后的专属交互界面 */}
      {focusedId === 'music-player' && modalVisible && (
        <MusicPlayerModal
          discs={discs}
          activeDisc={activeDisc}
          isPlaying={isMusicPlaying}
          onSelectDisc={handleSelectDisc}
          onTogglePlay={handleToggleMusicPlay}
          onAddDisc={handleAddUserDisc}
          onClose={handleCloseFocus}
        />
      )}

      {focusedId === 'computer' && modalVisible && (
        <PocketOSModal
          initialGame={devGame}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onActiveGameChange={setActiveCartridgeGame}
          onClose={handleCloseFocus}
        />
      )}

      {(focusedId === 'bookcase' || focusedId === 'wall-art') &&
        modalVisible && (
          <RoomDetailModal itemId={focusedId} onClose={handleCloseFocus} />
        )}
    </div>
  );
};
