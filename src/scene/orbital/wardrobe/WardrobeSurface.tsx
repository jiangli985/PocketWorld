import React, { useEffect, useRef, useState } from 'react';
import type { WorldTransition } from '../../../types/world';
import { outfitSlots, outfitNames, type ResidentOutfit } from './outfit';
import everyday from '../../../../assets/models/resident/wardrobe/everyday.webp';
import ribbon from '../../../../assets/models/resident/wardrobe/ribbon.webp';
import cardigan from '../../../../assets/models/resident/wardrobe/cardigan.webp';
import './wardrobe.css';

const portraits = { everyday, ribbon, cardigan };

interface Props {
  current: ResidentOutfit;
  transition: WorldTransition;
  error: string | null;
  onChoose: (outfit: ResidentOutfit) => void;
  onCancel: () => void;
}

export function WardrobeSurface({ current, transition, error, onChoose, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(current);
  const selecting = transition.action?.kind === 'select';
  const changing = selecting && (transition.phase === 'preparing' || transition.phase === 'entering');
  const show = changing || transition.phase === 'error' || (!selecting && transition.phase === 'active');
  useEffect(() => {
    if (!show) return;
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, [show]);
  if (!show) return null;
  return <dialog ref={dialog} className={changing ? 'wardrobe-screen is-changing' : 'wardrobe-screen'}
    aria-label={changing ? '正在换衣服' : '衣柜'} onKeyDown={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    {changing ? <>
      <p role="status" className="wardrobe-changing">正在换衣服<span aria-hidden="true">…</span></p>
      <button type="button" className="wardrobe-cancel-change" onClick={onCancel}>取消换装</button>
    </> : (
      <form className="wardrobe-picker" onSubmit={event => { event.preventDefault(); if (selected !== current) onChoose(selected); }}>
        <div className="wardrobe-heading"><h2>衣柜</h2><button type="button" className="wardrobe-close" aria-label="关闭衣柜" onClick={onCancel}>×</button></div>
        <fieldset><legend>选择一套服装</legend><div className="wardrobe-choices">
          {outfitSlots.map(id => <label key={id} className="wardrobe-option">
              <input type="radio" name="wardrobe-outfit" value={id} autoFocus={id === current} checked={id === selected} onChange={() => setSelected(id)} />
              <span className="wardrobe-card">
                <span className="wardrobe-portrait"><img src={portraits[id]} alt="" /></span>
                <span className="wardrobe-label">{outfitNames[id]}</span>
                {id === current && <small>穿着中</small>}
              </span>
            </label>)}
        </div></fieldset>
        {error && <p role="alert" className="wardrobe-error">{error}</p>}
        <div className="wardrobe-footer"><button type="submit" disabled={selected === current}>换上这套</button></div>
      </form>
    )}
  </dialog>;
}
