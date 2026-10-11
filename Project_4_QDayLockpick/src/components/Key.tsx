/**
 * The key a, drawn once and used everywhere: the title art and the world-map marker. It stands upright with
 * the tip at (0, 0) and the bow above, so a parent transform places it by the tip. The bitting faces right.
 */
export const KEY_BOW_Y = -58

const BOW = `M0 ${KEY_BOW_Y - 17} a17 17 0 1 0 0.01 0 Z M0 ${KEY_BOW_Y - 6.5} a6.5 6.5 0 1 1 -0.01 0 Z`
const BLADE = 'M-4.5 -38 H4.5 V-32 H10 V-27 H4.5 V-22 H8 V-17 H4.5 V-11 H9 V-7 H4.5 V-4 L0 0 L-4.5 -4 Z'

export function KeyShape() {
  return (
    <g className="key-shape">
      <path className="kmetal" d={BOW} fillRule="evenodd" />
      <rect className="kmetal" x="-8" y={KEY_BOW_Y + 14} width="16" height="6" />
      <path className="kmetal" d={BLADE} />
      <line className="kgroove" x1="-1" y1="-36" x2="-1" y2="-6" />
    </g>
  )
}
