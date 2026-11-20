import React, { useEffect, useRef } from 'react';
import './catInteraction.css';

export function CatInteraction({ onChoose }: { onChoose: (choice?: 'pet' | 'home') => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return <dialog ref={dialog} className="cat-interaction" aria-labelledby="cat-interaction-title"
    onClose={() => onChoose()}>
    <form method="dialog" onSubmit={event => {
      event.preventDefault();
      const button = (event.nativeEvent as SubmitEvent).submitter;
      const choice = button instanceof HTMLButtonElement ? button.value : undefined;
      onChoose(choice === 'pet' || choice === 'home' ? choice : undefined);
    }}>
      <h2 id="cat-interaction-title">团子</h2>
      <div className="cat-interaction-actions">
        <button value="pet" autoFocus>摸摸团子</button>
        <button value="home">回猫窝</button>
      </div>
      <button className="cat-interaction-cancel" value="cancel">取消</button>
    </form>
  </dialog>;
}
