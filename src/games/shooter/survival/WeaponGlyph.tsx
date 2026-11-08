import React from 'react';
import type { WeaponId } from './weapons';
import { heroSprite, variantSprite } from './pixel-art';
import type { VariantId } from './arsenal';
export default function WeaponGlyph({ id, variant, portrait = false }: { id: WeaponId; variant?:VariantId; portrait?: boolean }): React.ReactElement {
  const sprite = portrait ? heroSprite(id) : variantSprite(id,variant);
  return <svg viewBox={portrait ? '-4 -3 24 26' : '-3 -5 28 20'} shapeRendering="crispEdges" aria-hidden="true">{sprite.rows.flatMap((row,y)=>[...row].map((key,x)=>sprite.colors[key] ? <rect key={`${x}/${y}`} x={x} y={y} width={1} height={1} fill={sprite.colors[key]} /> : null))}</svg>;
}
