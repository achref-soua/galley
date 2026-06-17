/**
 * The compile "ding" — a short typewriter-bell tone on a successful build.
 *
 * It is off by default and opt-in (Settings → Compilation). The sound is
 * synthesised with the Web Audio API so nothing ships as an asset, behind a
 * small {@link Bell} seam and an injectable context constructor so the whole
 * thing is covered with a fake `AudioContext` in tests (jsdom has none).
 */

/** Plays the success tone. */
export interface Bell {
  /** Ring the bell once. */
  ding(): void;
}

/** The slice of `AudioParam` the tone uses. */
interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
}

/** The slice of `OscillatorNode` the tone uses. */
interface OscillatorLike {
  frequency: AudioParamLike;
  connect(destination: unknown): void;
  start(when: number): void;
  stop(when: number): void;
}

/** The slice of `GainNode` the tone uses. */
interface GainLike {
  gain: AudioParamLike;
  connect(destination: unknown): void;
}

/** The slice of `AudioContext` the tone uses. */
interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

/** Build the real browser `AudioContext`. */
function defaultContext(): AudioContextLike {
  return new window.AudioContext() as unknown as AudioContextLike;
}

/**
 * A Web Audio bell. The context is created lazily on the first ding and reused,
 * so configuring the sound never opens an audio device until it actually rings.
 */
export function webAudioBell(createContext: () => AudioContextLike = defaultContext): Bell {
  let context: AudioContextLike | null = null;
  return {
    ding() {
      context ??= createContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);

      const start = context.currentTime;
      oscillator.frequency.value = 880;
      // A quick attack to a soft peak, then a short exponential decay — a bell,
      // not a beep. Exponential ramps cannot reach zero, so decay to near-zero.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      oscillator.start(start);
      oscillator.stop(start + 0.32);
    }
  };
}
