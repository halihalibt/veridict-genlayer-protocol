/**
 * Procedural Web Audio API Synthesizer & Tactile Feedback Controller
 * Zero external audio assets required; strictly opt-in (muted by default).
 */
export class VeridictSoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = false;
  public volume = 0.35;

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public triggerHaptic(pattern: number | number[] = 12): void {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore unsupported devices
      }
    }
  }

  public playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.045);
    gain.gain.setValueAtTime(this.volume * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  public playValidatorVote(index: number, agree = true): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const pentatonic = [
      523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5, 1174.66, 1318.5,
    ];
    const freq = agree ? pentatonic[index % pentatonic.length] : 165.0;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = agree ? "triangle" : "sawtooth";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
  }

  public playFinalityChord(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const chord = [261.63, 329.63, 392.0, 493.88, 587.33]; // Cmaj9
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.03);
      gain.gain.setValueAtTime(this.volume * 0.2, ctx.currentTime + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.03);
      osc.stop(ctx.currentTime + 0.78);
    });
  }
}

export const soundEngine = new VeridictSoundEngine();
