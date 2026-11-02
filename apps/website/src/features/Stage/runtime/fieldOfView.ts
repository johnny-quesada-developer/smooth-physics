// The vertical field of view, in degrees, of a stage at least as wide as its camera framing's design.
export const FIELD_OF_VIEW = 38;
// The stage shape, width over height, that a camera framing is composed for unless it names its own.
export const DESIGN_ASPECT = 16 / 10;

const RADIANS = Math.PI / 180;

// A stage narrower than the design, such as a phone held upright, sees as far across as the design does and more above
// and below, so a subject that moves sideways stays in view. A wider stage keeps the design's height and sees more
// across.
export function fieldOfView({ aspect, design = DESIGN_ASPECT }: { aspect: number; design?: number | undefined }): number {
  if (aspect >= design) return FIELD_OF_VIEW;
  const halfHeight = (Math.tan((FIELD_OF_VIEW / 2) * RADIANS) * design) / aspect;
  return (2 * Math.atan(halfHeight)) / RADIANS;
}
