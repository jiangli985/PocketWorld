import React, { useState } from 'react';
import { InteractableId } from '../../types/interactable';

interface RoomDetailModalProps {
  itemId: InteractableId;
  onClose: () => void;
}

const BOOK_COLLECTION = [
  {
    id: 'book-architecture',
    spineColor: '#84a93c',
    title: '《微缩建筑与光影叙事》',
    subtitle: '第 4 章：等轴测剖面空间的温度感',
    excerpt:
      '当一束斜阳穿过高窗格栅落在原木书柜与地板接缝上，房间的静谧便有了真实可触的尺度。左墙串灯提供近景暖意，桌面显示器散发出微弱冷光，冷暖对比构成了夜晚独处的安全感。',
  },
  {
    id: 'book-vinyl',
    spineColor: '#eab308',
    title: '《黑胶与模拟合成器手记》',
    subtitle: '附录：如何用本地音频压制专属唱片',
    excerpt:
      '走到书桌左侧的 Hi-Fi 唱机旁，你可以播放内置的四张环境音乐黑胶，或者将电脑里的任意本地音频拖入唱机，系统会根据曲名自动生成独一无二的渐变盘面并持续作为房间背景音乐旋转播放。',
  },
  {
    id: 'book-cat',
    spineColor: '#d97706',
    title: '《橘猫「团子」饲养日记》',
    subtitle: '记录人：小宇 · 房间主人',
    excerpt:
      '团子最喜欢趴在床边的紫灰几何编织地毯上晒太阳。只要走到它身边按 [E] 键或用鼠标轻轻点它，它就会开心地跳起来摇尾巴，还会发出呼噜声。',
  },
];

const ARTWORKS = [
  {
    title: '《暮色山峦 · 暖金》',
    medium: '木框纸本丙烯 · 24 × 24 cm',
    desc: '描绘黄昏时分远山层叠的剪影与暖金色天际，呼应房间午后斜射的暖阳色调。',
  },
  {
    title: '《晴空海岸与白帆》',
    medium: '木框水彩 · 24 × 24 cm',
    desc: '清透的蔚蓝海面与远航白帆，为书桌工作区增添一抹呼吸感。',
  },
  {
    title: '《晚秋林间小径》',
    medium: '木框油画棒 · 26 × 26 cm',
    desc: '交织着暖橙与翠绿的秋日树冠，记录了去年秋天郊游时的写生印象。',
  },
];

export const RoomDetailModal: React.FC<RoomDetailModalProps> = ({
  itemId,
  onClose,
}) => {
  const [selectedBookIdx, setSelectedBookIdx] = useState(0);

  if (itemId === 'bookcase') {
    const activeBook = BOOK_COLLECTION[selectedBookIdx];
    return (
      <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="原木藏书柜与手账台">
        <div className="detail-panel-shell">
          <header className="detail-panel-header">
            <div>
              <h2>原木藏书柜与手账台</h2>
              <p>点击书脊抽出藏书翻阅笔记</p>
            </div>
            <button type="button" className="panel-close-btn" onClick={onClose}>
              返回房间 (Esc)
            </button>
          </header>

          <div className="bookcase-reader-layout">
            <div className="book-spine-selector">
              {BOOK_COLLECTION.map((book, idx) => (
                <button
                  key={book.id}
                  type="button"
                  className={`book-spine-tab ${idx === selectedBookIdx ? 'is-active' : ''}`}
                  onClick={() => setSelectedBookIdx(idx)}
                >
                  <span
                    className="spine-color-dot"
                    style={{ backgroundColor: book.spineColor }}
                  />
                  <span>{book.title}</span>
                </button>
              ))}
            </div>

            <article className="book-page-card">
              <h3>{activeBook.title}</h3>
              <p className="book-page-subtitle">{activeBook.subtitle}</p>
              <p className="book-page-body">{activeBook.excerpt}</p>
            </article>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label="墙面风景装饰画组">
      <div className="detail-panel-shell">
        <header className="detail-panel-header">
          <div>
            <h2>右墙风景装饰画组</h2>
            <p>书桌旁的ミニ画廊，记录三段不同时节的色彩印象</p>
          </div>
          <button type="button" className="panel-close-btn" onClick={onClose}>
            返回房间 (Esc)
          </button>
        </header>

        <div className="artwork-gallery-list">
          {ARTWORKS.map((art) => (
            <article key={art.title} className="artwork-item-row">
              <h3>{art.title}</h3>
              <span className="artwork-medium">{art.medium}</span>
              <p>{art.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};
