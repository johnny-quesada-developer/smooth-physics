// Measures the cost of named-parameter objects in a hot kernel: a quaternion rotating every particle offset,
// written once with positional numbers (the solver kernels' style) and once with one object parameter.
export type ParameterStyleResult = { readonly calls: number; readonly positionalMs: number; readonly namedMs: number; readonly namedOverPositional: number };

const result = new Float32Array(3);

// v + w t + q × t with t = 2 (q × v): the vector rotated by the unit quaternion.
function rotatePositional(rotationX: number, rotationY: number, rotationZ: number, rotationW: number, vectorX: number, vectorY: number, vectorZ: number): void {
  const twiceCrossX = 2 * (rotationY * vectorZ - rotationZ * vectorY);
  const twiceCrossY = 2 * (rotationZ * vectorX - rotationX * vectorZ);
  const twiceCrossZ = 2 * (rotationX * vectorY - rotationY * vectorX);
  result[0] = vectorX + rotationW * twiceCrossX + (rotationY * twiceCrossZ - rotationZ * twiceCrossY);
  result[1] = vectorY + rotationW * twiceCrossY + (rotationZ * twiceCrossX - rotationX * twiceCrossZ);
  result[2] = vectorZ + rotationW * twiceCrossZ + (rotationX * twiceCrossY - rotationY * twiceCrossX);
}

// The same rotation; the keys are the quaternion (qx, qy, qz, qw) and the vector (vx, vy, vz).
function rotateNamed({ qx, qy, qz, qw, vx, vy, vz }: { qx: number; qy: number; qz: number; qw: number; vx: number; vy: number; vz: number }): void {
  const twiceCrossX = 2 * (qy * vz - qz * vy);
  const twiceCrossY = 2 * (qz * vx - qx * vz);
  const twiceCrossZ = 2 * (qx * vy - qy * vx);
  result[0] = vx + qw * twiceCrossX + (qy * twiceCrossZ - qz * twiceCrossY);
  result[1] = vy + qw * twiceCrossY + (qz * twiceCrossX - qx * twiceCrossZ);
  result[2] = vz + qw * twiceCrossZ + (qx * twiceCrossY - qy * twiceCrossX);
}

export function measureParameterStyle({ particles = 1024, rounds = 2000 }: { particles?: number; rounds?: number } = {}): ParameterStyleResult {
  const offsets = Float32Array.from({ length: particles * 3 }, (_, index) => Math.sin(index));
  const output = new Float32Array(particles * 3);
  // A tenth of the rounds untimed first, so the engine has optimized the loop before the clock starts.
  const timeRounds = (rotate: (particle: number, round: number) => void): number => {
    for (let round = 0; round < rounds / 10; round++) for (let particle = 0; particle < particles; particle++) rotate(particle, round);
    const start = performance.now();
    for (let round = 0; round < rounds; round++) for (let particle = 0; particle < particles; particle++) rotate(particle, round);
    return performance.now() - start;
  };
  const halfAngleAt = (round: number): number => round * 0.0005;

  const positionalMs = timeRounds((particle, round) => {
    const halfAngle = halfAngleAt(round);
    const particleOffset = particle * 3;
    rotatePositional(
      0,
      Math.sin(halfAngle),
      0,
      Math.cos(halfAngle),
      offsets[particleOffset] ?? 0,
      offsets[particleOffset + 1] ?? 0,
      offsets[particleOffset + 2] ?? 0,
    );
    output[particleOffset] = result[0] ?? 0;
    output[particleOffset + 1] = result[1] ?? 0;
    output[particleOffset + 2] = result[2] ?? 0;
  });
  const namedMs = timeRounds((particle, round) => {
    const halfAngle = halfAngleAt(round);
    const particleOffset = particle * 3;
    rotateNamed({
      qx: 0,
      qy: Math.sin(halfAngle),
      qz: 0,
      qw: Math.cos(halfAngle),
      vx: offsets[particleOffset] ?? 0,
      vy: offsets[particleOffset + 1] ?? 0,
      vz: offsets[particleOffset + 2] ?? 0,
    });
    output[particleOffset] = result[0] ?? 0;
    output[particleOffset + 1] = result[1] ?? 0;
    output[particleOffset + 2] = result[2] ?? 0;
  });

  const roundToThreeDecimals = (value: number): number => Number(value.toFixed(3));
  return {
    calls: particles * rounds,
    positionalMs: roundToThreeDecimals(positionalMs),
    namedMs: roundToThreeDecimals(namedMs),
    namedOverPositional: roundToThreeDecimals(namedMs / positionalMs),
  };
}
