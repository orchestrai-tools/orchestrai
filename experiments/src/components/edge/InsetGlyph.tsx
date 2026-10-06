import { m, type MotionValue } from 'motion/react';
import { GLYPH_GRID, INSET_GLYPHS } from '../../lib/insetGlyph';
import type { InsetShape } from '../../settings/types';

interface InsetGlyphProps {
  shape: InsetShape;
  transform: MotionValue<string>;
  opacity: MotionValue<number>;
  className: string;
}

/** A Lucide glyph positioned inside the magnet tab. Colour comes from `className` via currentColor. */
export function InsetGlyph({ shape, transform, opacity, className }: InsetGlyphProps) {
  const { icon: Icon, filled } = INSET_GLYPHS[shape];
  return (
    <m.g className={className} style={{ transform, opacity }}>
      <Icon width={GLYPH_GRID} height={GLYPH_GRID} fill={filled ? 'currentColor' : 'none'} />
    </m.g>
  );
}
