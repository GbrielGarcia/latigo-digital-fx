import { describe, expect, it } from 'vitest';
import { MAX_NODES, MIN_NODES, Rope } from '../src/core/physics/rope';

function makeRope(nodeCount = 20, segmentLength = 0.1): Rope {
  const rope = new Rope({ nodeCount, segmentLength, baseMass: 0.03, taper: 0.9 });
  rope.layoutStraight(0, 0, 0, -1);
  return rope;
}

function stepRope(rope: Rope, seconds: number, hz = 240): void {
  const dt = 1 / hz;
  for (let i = 0; i < seconds * hz; i++) {
    rope.integrate(dt, { gravity: 9.81, dampingPerSecond: 0.5, maxSpeed: 600 });
    rope.setAnchor(0, 0, 0, 0);
    rope.solve({ iterations: 16, bendStiffness: 0.3 });
  }
}

describe('Rope initialisation', () => {
  it('creates the requested nodes laid out at the rest length', () => {
    const rope = makeRope(20, 0.1);
    expect(rope.nodeCount).toBe(20);
    expect(rope.length).toBeCloseTo(1.9, 10);
    for (let i = 0; i < rope.nodeCount; i++) {
      expect(rope.x[i]).toBeCloseTo(0, 12);
      expect(rope.y[i]).toBeCloseTo(-0.1 * i, 12);
      expect(rope.px[i]).toBe(rope.x[i]);
    }
  });

  it('pins node 0 (infinite mass) and tapers mass towards the tip', () => {
    const rope = makeRope();
    expect(rope.invMass[0]).toBe(0);
    for (let i = 2; i < rope.nodeCount; i++) expect(rope.mass[i]).toBeLessThan(rope.mass[i - 1]);
  });

  it('clamps the node count and rejects invalid segment lengths', () => {
    expect(new Rope({ nodeCount: 1, segmentLength: 0.1, baseMass: 1, taper: 0 }).nodeCount).toBe(MIN_NODES);
    expect(new Rope({ nodeCount: 10_000, segmentLength: 0.1, baseMass: 1, taper: 0 }).nodeCount).toBe(
      MAX_NODES,
    );
    expect(() => new Rope({ nodeCount: 10, segmentLength: 0, baseMass: 1, taper: 0 })).toThrow(RangeError);
  });
});

describe('Rope constraints', () => {
  it('keeps every segment close to its rest length while swinging', () => {
    const rope = makeRope(24, 0.09);
    rope.layoutStraight(0, 0, 1, 0); // start horizontal: it will swing down
    stepRope(rope, 1.5);
    for (let i = 0; i < rope.nodeCount - 1; i++) {
      const d = Math.hypot(rope.x[i + 1] - rope.x[i], rope.y[i + 1] - rope.y[i]);
      expect(Math.abs(d - rope.segmentLength) / rope.segmentLength).toBeLessThan(0.05);
    }
  });

  it('stays still when hanging at rest', () => {
    const rope = makeRope(20, 0.1);
    stepRope(rope, 3);
    const tip = rope.nodeCount - 1;
    expect(rope.nodeSpeed(tip, 1 / 240)).toBeLessThan(0.05);
    expect(rope.x[tip]).toBeCloseTo(0, 2);
    expect(rope.kineticEnergy(1 / 240)).toBeLessThan(1e-4);
  });

  it('caps node speed so a huge anchor jump cannot explode the rope', () => {
    const rope = makeRope();
    const dt = 1 / 240;
    for (let i = 0; i < 240; i++) {
      const ax = i % 2 === 0 ? 50 : -50; // teleporting anchor
      rope.integrate(dt, { gravity: 9.81, dampingPerSecond: 0.5, maxSpeed: 600 });
      rope.setAnchor(ax, 0, -ax, 0);
      rope.solve({ iterations: 8, bendStiffness: 0.3 });
      expect(rope.isHealthy(1e4)).toBe(true);
    }
  });

  it('detects non-finite state', () => {
    const rope = makeRope();
    expect(rope.isHealthy()).toBe(true);
    rope.x[5] = Number.NaN;
    expect(rope.isHealthy()).toBe(false);
    rope.x[5] = 0;
    rope.y[3] = Number.POSITIVE_INFINITY;
    expect(rope.isHealthy()).toBe(false);
  });
});
