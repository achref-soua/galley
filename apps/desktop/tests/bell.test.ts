import { describe, it, expect, vi, afterEach } from 'vitest';
import { webAudioBell } from '../src/lib/bell';

/** A fake AudioParam recording every scheduled value change. */
class FakeParam {
  value = 0;
  setCalls: Array<[number, number]> = [];
  rampCalls: Array<[number, number]> = [];
  setValueAtTime(value: number, time: number) {
    this.setCalls.push([value, time]);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.rampCalls.push([value, time]);
  }
}

class FakeOscillator {
  frequency = new FakeParam();
  connectedTo: unknown = null;
  started: number | null = null;
  stopped: number | null = null;
  connect(node: unknown) {
    this.connectedTo = node;
  }
  start(when: number) {
    this.started = when;
  }
  stop(when: number) {
    this.stopped = when;
  }
}

class FakeGain {
  gain = new FakeParam();
  connectedTo: unknown = null;
  connect(node: unknown) {
    this.connectedTo = node;
  }
}

class FakeContext {
  currentTime = 5;
  destination = { name: 'speakers' };
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('webAudioBell', () => {
  it('builds the tone graph and plays a short bell', () => {
    const context = new FakeContext();
    const create = vi.fn(() => context);
    const bell = webAudioBell(create);

    bell.ding();

    expect(create).toHaveBeenCalledOnce();
    const osc = context.oscillators[0];
    const gain = context.gains[0];
    expect(osc.connectedTo).toBe(gain);
    expect(gain.connectedTo).toBe(context.destination);
    expect(osc.frequency.value).toBe(880);
    expect(osc.started).toBe(5);
    expect(osc.stopped).toBeCloseTo(5.32);
    // Attack to a soft peak, then decay toward zero.
    expect(gain.gain.setCalls).toEqual([[0.0001, 5]]);
    expect(gain.gain.rampCalls.map(([v]) => v)).toEqual([0.2, 0.0001]);
  });

  it('creates the audio context lazily and reuses it across dings', () => {
    const create = vi.fn(() => new FakeContext());
    const bell = webAudioBell(create);
    bell.ding();
    bell.ding();
    // One context, two oscillators.
    expect(create).toHaveBeenCalledOnce();
  });

  it('defaults to the browser AudioContext', () => {
    const created: FakeContext[] = [];
    (window as unknown as { AudioContext: unknown }).AudioContext = function () {
      const context = new FakeContext();
      created.push(context);
      return context;
    };
    const bell = webAudioBell();
    bell.ding();
    expect(created).toHaveLength(1);
    expect(created[0].oscillators[0].started).toBe(5);
  });
});
