import React, { useEffect, useRef } from 'react';
import './catInteraction.css';

export function CatInteraction({ onChoose }: { onChoose: (choice?: 'pet' | 'home') => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return <dialog ref={dialog} className="cat-interaction" aria-labelledby="cat-interaction-title" onClose={event => {
    const choice = event.currentTarget.returnValue;
    onChoose(choice === 'pet' || choice === 'home' ? choice : undefined);
  }}>
    <form method="dialog">
      <h2 id="cat-interaction-title">团子</h2>
      <div className="cat-interaction-actions">
        <button value="pet" autoFocus>摸摸团子</button>
        <button value="home">回猫窝</button>
      </div>
      <button className="cat-interaction-cancel" value="cancel">取消</button>
    </form>
  </dialog>;
}
