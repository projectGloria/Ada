/**
 * @file Procedural Victorian sound synthesizer using Web Audio API.
 * Synthesizes deep Gothic church bells and crumbling stone masonry
 * with zero external binary asset bloat and zero network latency.
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Synthesizes a resonant Victorian bronze church bell chime.
 * Simulates strike note, hum tone, minor third, and harmonic overtones.
 */
export function playChurchBell(enabled = false) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Fundamental strike frequency (A3 = 220Hz, deep parish bell)
  const strikeFrequencies = [220, 440, 523.25, 659.25, 880];
  const decays = [4.5, 3.2, 2.5, 1.8, 1.2];
  const gains = [0.4, 0.25, 0.2, 0.15, 0.1];

  strikeFrequencies.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(gains[idx], now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decays[idx]);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + decays[idx]);
  });
}

/**
 * Synthesizes crumbling Victorian masonry / stone collapse.
 * Uses filtered brown noise bursts and low-frequency impacts.
 */
export function playCrumblingMasonry(enabled = false) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const bufferSize = ctx.sampleRate * 2.5; // 2.5 seconds of debris
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);

  // Generate Brownian noise (rumbling debris)
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    output[i] = (lastOut + 0.02 * white) / 1.02;
    lastOut = output[i];
    output[i] *= 3.5;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  // Bandpass filter to sound like heavy falling bricks and mortar
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(320, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 2.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.4);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 2.5);
}
