import type { Curve, SlopedKey } from './curves';

// A jump: the pelvis leaves the floor at `from` metres and lands at `to`, falling freely in between.
export type Flight = { readonly start: number; readonly end: number; readonly from: number; readonly to: number };

const GRAVITY = 9.8;

export function launchSpeed(flight: Flight): number {
  const seconds = flight.end - flight.start;
  return (flight.to - flight.from + 0.5 * GRAVITY * seconds * seconds) / seconds;
}

export const landingSpeed = (flight: Flight): number => launchSpeed(flight) - GRAVITY * (flight.end - flight.start);

// Keys for the ground curve on either side of a flight, with the flight's own vertical speed, so the body never
// stalls on the way up or stops dead on the way down.
export const takeOff = (flight: Flight): SlopedKey => [flight.start, flight.from, launchSpeed(flight)];
export const touchDown = (flight: Flight): SlopedKey => [flight.end, flight.to, landingSpeed(flight)];

// Pelvis height: ballistic during a flight, the ground curve otherwise.
export function pelvisHeight({ flights, ground, time }: { flights: readonly Flight[]; ground: Curve; time: number }): number {
  const flight = flights.find((candidate) => time > candidate.start && time < candidate.end);
  if (!flight) return ground(time);
  const elapsed = time - flight.start;
  return flight.from + launchSpeed(flight) * elapsed - 0.5 * GRAVITY * elapsed * elapsed;
}
