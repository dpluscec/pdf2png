export type Rotation = 0 | 90 | 180 | 270;

export function accumulateRotation(current: Rotation, delta: 90 | -90): Rotation {
  return (((current + delta) % 360 + 360) % 360) as Rotation;
}
