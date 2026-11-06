import React, { useRef, useState } from 'react';
import { MusicDisc } from '../../types/interactable';
import {
  generateDiscColorsFromName,
  roomAudio,
} from '../../scene/audioEngine';

interface MusicPlayerModalProps {
  discs: MusicDisc[];
  activeDisc: MusicDisc;
  isPlaying: boolean;
  onSelectDisc: (disc: MusicDisc) => void;
  onTogglePlay: () => void;
  onAddDisc: (disc: MusicDisc) => void;
  onClose: () => void;
}

export const MusicPlayerModal: React.FC<MusicPlayerModalProps> = ({
  discs,
  activeDisc,
  isPlaying,
  onSelectDisc,
  onTogglePlay,
  onAddDisc,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pressingDiscName, setPressingDiscName] = useState<string | null>(null);
  const [pressingColors, setPressingColors] = useState<[string, string]>([
    '#f59e0b',
    '#ec4899',
  ]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
    const colors = generateDiscColorsFromName(cleanTitle);
    const objectUrl = URL.createObjectURL(file);

    setPressingDiscName(cleanTitle);
    setPressingColors(colors);
    roomAudio.playSfx('disc');

    window.setTimeout(() => {
      const newDisc: MusicDisc = {
        id: `user-disc-${Date.now()}`,
        title: cleanTitle,
        artist: '本地导入音频 · 专属压制光盘',
        audioUrl: objectUrl,
        discThemeColor: colors,
        isUserUploaded: true,
      };
      onAddDisc(newDisc);
      setPressingDiscName(null);
    }, 950);
  };

  return (
    <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="Hi-Fi 黑胶与光盘唱机">
      <div className="hi-fi-deck-shell">
        <header className="hi-fi-header">
          <div className="hi-fi-title-group">
            <h2>Hi-Fi 留声光盘唱机</h2>
            <p>音乐将在退回 3D 房间或游玩电脑时作为环境背景乐持续播放</p>
          </div>

          <button type="button" className="panel-close-btn" onClick={onClose}>
            返回房间 (Esc)
          </button>
        </header>

        <div className="hi-fi-body">
          {/* 左侧：实体唱盘转台与机械唱臂 */}
          <div className="turntable-stage">
            <div className="turntable-platter-housing">
              <div
                className={`turntable-disc ${isPlaying ? 'is-spinning' : ''}`}
                style={{
                  background: `radial-gradient(circle, #0f172a 0%, #0f172a 13%, ${activeDisc.discThemeColor[0]} 14%, ${activeDisc.discThemeColor[1]} 36%, #1e293b 37%, #0f172a 68%, #334155 69%, #0f172a 100%)`,
                }}
              >
                <div className="disc-grooves" />
                <div
                  className="disc-center-label"
                  style={{
                    background: `linear-gradient(135deg, ${activeDisc.discThemeColor[0]}, ${activeDisc.discThemeColor[1]})`,
                  }}
                >
                  <span className="disc-label-text">{activeDisc.title.slice(0, 10)}</span>
                  <div className="disc-spindle-hole" />
                </div>
              </div>

              {/* 机械唱臂 */}
              <div className={`turntable-tonearm ${isPlaying ? 'is-engaged' : ''}`}>
                <div className="tonearm-pivot" />
                <div className="tonearm-rod" />
                <div className="tonearm-headshell" />
              </div>
            </div>

            {/* 当前曲目与电平律动条 */}
            <div className="turntable-now-playing">
              <div className="now-playing-meta">
                <h3>{activeDisc.title}</h3>
                <span>{activeDisc.artist}</span>
              </div>

              <div className="equalizer-bars" aria-hidden="true">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span
                    key={i}
                    className={`eq-bar ${isPlaying ? 'is-active' : ''}`}
                    style={{
                      animationDelay: `${(i % 5) * 0.11}s`,
                      background: `linear-gradient(to top, ${activeDisc.discThemeColor[0]}, ${activeDisc.discThemeColor[1]})`,
                    }}
                  />
                ))}
              </div>

              <div className="turntable-transport">
                <button
                  type="button"
                  className="transport-play-btn"
                  onClick={onTogglePlay}
                >
                  {isPlaying ? '暂停唱盘' : '开始播放'}
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：光盘架列表与「本地音频压制光盘」工坊 */}
          <div className="disc-rack-column">
            <div
              className={`disc-dropzone ${isDragging ? 'is-dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.flac,.m4a,audio/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)}
              />

              {pressingDiscName ? (
                <div className="disc-pressing-preview">
                  <div
                    className="pressing-mini-disc"
                    style={{
                      background: `conic-gradient(${pressingColors[0]}, ${pressingColors[1]}, ${pressingColors[0]})`,
                    }}
                  />
                  <div>
                    <strong>正在压制专属光盘...</strong>
                    <p>激光刻印曲目：《{pressingDiscName}》</p>
                  </div>
                </div>
              ) : (
                <div className="dropzone-prompt">
                  <strong>导入本地音频压制实体光盘</strong>
                  <p>点击选择或拖入 .mp3 / .wav / .flac / .ogg 文件，实时生成渐变光盘并入仓旋转播放</p>
                </div>
              )}
            </div>

            <div className="disc-collection-list">
              {discs.map((disc) => {
                const selected = disc.id === activeDisc.id;
                return (
                  <button
                    key={disc.id}
                    type="button"
                    className={`disc-item-row ${selected ? 'is-selected' : ''}`}
                    onClick={() => onSelectDisc(disc)}
                  >
                    <span
                      className={`mini-disc-badge ${selected && isPlaying ? 'is-spinning' : ''}`}
                      style={{
                        background: `linear-gradient(135deg, ${disc.discThemeColor[0]}, ${disc.discThemeColor[1]})`,
                      }}
                    >
                      <span className="mini-disc-hole" />
                    </span>

                    <span className="disc-item-info">
                      <strong>{disc.title}</strong>
                      <small>{disc.artist}</small>
                    </span>

                    <span className="disc-item-status">
                      {selected ? (isPlaying ? '播放中' : '已入仓') : '装入唱盘'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
