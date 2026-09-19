type WeaponSound = "m4" | "sniper" | "smg";

const AUDIO_MUTE_KEY = "airsoft-tactical-arena.audio-muted";

class TacticalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  constructor() {
    if (typeof window !== "undefined") this.muted = window.localStorage.getItem(AUDIO_MUTE_KEY) === "true";
  }

  get isMuted() { return this.muted; }

  private ensureContext() {
    if (typeof window === "undefined") return null;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  private output() {
    const context = this.ensureContext();
    if (!context || !this.master || this.muted) return null;
    return { context, master: this.master };
  }

  toggle() {
    this.muted = !this.muted;
    window.localStorage.setItem(AUDIO_MUTE_KEY, String(this.muted));
    const context = this.ensureContext();
    if (this.master && context) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.22, context.currentTime, 0.018);
    return this.muted;
  }

  private tone(frequency: number, duration: number, type: OscillatorType = "sine", gain = 0.2, detune = 0, delay = 0) {
    const output = this.output();
    if (!output) return;
    const { context, master } = output;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime(detune, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, gain = 0.18, filterFrequency = 4200, delay = 0) {
    const output = this.output();
    if (!output) return;
    const { context, master } = output;
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const start = context.currentTime + delay;
    filter.type = "bandpass";
    filter.frequency.value = filterFrequency;
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(Math.max(0.001, gain), start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.buffer = buffer;
    source.connect(filter).connect(envelope).connect(master);
    source.start(start);
    source.stop(start + duration + 0.01);
  }

  ui() {
    this.tone(1150, 0.035, "square", 0.075);
    this.tone(720, 0.028, "triangle", 0.045, 0, 0.018);
  }

  select() {
    this.tone(880, 0.05, "square", 0.07);
    this.tone(1320, 0.04, "sine", 0.045, 0, 0.035);
  }

  fire(weapon: WeaponSound) {
    if (weapon === "sniper") {
      this.noise(0.11, 0.2, 850);
      this.tone(95, 0.16, "triangle", 0.21);
      this.tone(1850, 0.055, "square", 0.08, 0, 0.2);
      return;
    }
    if (weapon === "smg") {
      this.noise(0.045, 0.15, 6100);
      this.tone(160, 0.065, "sawtooth", 0.1);
      this.noise(0.035, 0.1, 7600, 0.075);
      this.tone(1300, 0.035, "square", 0.055, 0, 0.12);
      return;
    }
    this.noise(0.075, 0.14, 3000);
    this.tone(125, 0.085, "sawtooth", 0.11);
    this.tone(2400, 0.035, "square", 0.11, 0, 0.055);
  }

  miss() {
    this.noise(0.18, 0.09, 2700);
    this.tone(540, 0.12, "sine", 0.045, -400, 0.04);
  }

  hit() {
    this.tone(82, 0.16, "triangle", 0.22);
    this.noise(0.07, 0.13, 1600, 0.015);
    this.tone(980, 0.07, "square", 0.08, 0, 0.16);
    this.tone(1460, 0.08, "square", 0.07, 0, 0.24);
  }
}

export const tacticalAudio = new TacticalAudio();
