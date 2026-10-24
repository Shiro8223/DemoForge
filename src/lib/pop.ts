/** The NeoBrutalist pop palette, in display order. Cycle with `pop(i)` so neighbours never match. */
export const POP_BG = [
  "bg-pop-yellow",
  "bg-pop-pink",
  "bg-pop-blue",
  "bg-pop-green",
  "bg-pop-orange",
  "bg-pop-purple",
  "bg-pop-cyan",
] as const;

export const pop = (i: number) => POP_BG[((i % POP_BG.length) + POP_BG.length) % POP_BG.length];
