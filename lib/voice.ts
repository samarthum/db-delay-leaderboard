/**
 * Voice search, browser side: microphone -> 16 kHz PCM -> ElevenLabs Scribe v2 Realtime over a WebSocket.
 *
 * The page asks /api/scribe-token for a single-use token (the API key stays on the server), opens the socket with it
 * and streams 100 ms chunks. Scribe sends partial transcripts while the person talks and a committed one when they
 * stop (server-side voice activity detection), which ends the session. No SDK: it is a few dozen lines of protocol.
 *
 * Call start() from a tap: browsers only allow the microphone and audio playback to start from a user gesture.
 */

export type VoiceError = "unsupported" | "nomic" | "denied" | "service" | "nospeech" | "network";

export interface VoiceEvents {
  onListening(): void;
  onPartial(text: string): void;
  onFinal(text: string): void;
  onError(e: VoiceError): void;
}

const TOKEN_URL = "/api/scribe-token/"; // trailing slash: the site uses trailingSlash, and the slashless address answers 308
const WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const SILENCE_SECS = 1.1; // how long a pause ends the sentence
const NO_SPEECH_MS = 9000; // nothing recognised after this long: give up
const MAX_MS = 25000; // a route question is a few seconds; never record longer than this
const FINISH_WAIT_MS = 2200; // after Stop: wait this long for the last words
const TOKEN_TTL_MS = 10 * 60 * 1000; // tokens live 15 minutes; refresh before that

// ---------------------------------------------------------------- token (fetched ahead, used once)

let pending: { at: number; promise: Promise<string> } | null = null;

async function fetchToken(): Promise<string> {
  const r = await fetch(TOKEN_URL, { method: "POST", cache: "no-store" });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const body = (await r.json()) as { token?: string };
  if (!body.token) throw new Error("no token");
  return body.token;
}

/** Ask for a token now so the first tap does not wait for it. Safe to call often. */
export function prefetchToken(): void {
  if (pending && Date.now() - pending.at < TOKEN_TTL_MS) return;
  const promise = fetchToken();
  promise.catch(() => {
    if (pending?.promise === promise) pending = null;
  });
  pending = { at: Date.now(), promise };
}

function takeToken(): Promise<string> {
  prefetchToken();
  const p = pending!.promise;
  pending = null; // single use
  return p;
}

// ---------------------------------------------------------------- audio worklet (inline, no extra file)

/** Resamples whatever the device runs at (44.1 or 48 kHz) to 16 kHz and posts 100 ms of Int16 plus a level. */
const WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.t = 0;
    this.prev = 0;
    this.out = new Int16Array(1600);
    this.n = 0;
    this.peak = 0;
  }
  process(inputs) {
    const x = inputs[0] && inputs[0][0];
    if (!x) return true;
    const len = x.length;
    while (this.t < len - 1) {
      const i = Math.floor(this.t);
      const f = this.t - i;
      const a = i < 0 ? this.prev : x[i];
      const v = a + (x[i + 1] - a) * f;
      const s = Math.max(-1, Math.min(1, v));
      this.out[this.n++] = s < 0 ? s * 32768 : s * 32767;
      const m = Math.abs(s);
      if (m > this.peak) this.peak = m;
      this.t += this.ratio;
      if (this.n === 1600) {
        this.port.postMessage({ pcm: this.out.buffer, level: this.peak }, [this.out.buffer]);
        this.out = new Int16Array(1600);
        this.n = 0;
        this.peak = 0;
      }
    }
    this.prev = x[len - 1];
    this.t -= len;
    return true;
  }
}
registerProcessor("pcm16", Pcm16);
`;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  return btoa(s);
}

type Ctor = typeof AudioContext;
const AudioCtx: Ctor | undefined = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);

/** Asks the server whether voice search is set up (the key is configured). Answered once per tab. */
export async function voiceConfigured(): Promise<boolean> {
  try {
    const cached = sessionStorage.getItem("voice-ok-2");
    if (cached !== null) return cached === "1";
  } catch {
    // storage blocked: ask every time
  }
  try {
    const r = await fetch(TOKEN_URL, { cache: "no-store" });
    const ok = r.ok && ((await r.json()) as { ok?: boolean }).ok === true;
    try {
      sessionStorage.setItem("voice-ok-2", ok ? "1" : "0");
    } catch {
      // ignore
    }
    return ok;
  } catch {
    return false;
  }
}

/** True when this browser and page can record at all (HTTPS or localhost, getUserMedia, AudioWorklet). */
export function voiceSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(AudioCtx) && typeof AudioWorkletNode !== "undefined";
}

// ---------------------------------------------------------------- session

export class VoiceSession {
  /** 0..1, the loudest sample of the latest 100 ms. Read it from an animation frame. */
  level = 0;

  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private queue: string[] = [];
  private partial = "";
  private heardSpeech = false;
  private finishing = false;
  private done = false;
  private timers: number[] = [];

  constructor(private ev: VoiceEvents) {}

  /** Must run inside a tap handler. */
  start(): void {
    if (!voiceSupported()) return this.fail("unsupported");
    // Created synchronously, inside the gesture, so iOS lets it run.
    this.ctx = new AudioCtx!();
    void this.ctx.resume();
    const mic = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const token = takeToken();
    token.catch(() => undefined); // handled below; this keeps a failure from being reported twice
    mic.then(
      async (stream) => {
        if (this.done) return stream.getTracks().forEach((t) => t.stop());
        this.stream = stream;
        try {
          await this.attachMic(stream);
        } catch {
          return this.fail("unsupported");
        }
        token.then(
          (tk) => !this.done && this.open(tk),
          () => this.fail("service"),
        );
      },
      (e: DOMException) => this.fail(e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "nomic" : "denied"),
    );
    this.timers.push(window.setTimeout(() => this.stop(), MAX_MS));
  }

  private async attachMic(stream: MediaStream) {
    const ctx = this.ctx!;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (this.done) return;
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm16", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    const mute = ctx.createGain(); // the node must reach the destination to run in some browsers; keep it silent
    mute.gain.value = 0;
    src.connect(node).connect(mute).connect(ctx.destination);
    node.port.onmessage = (m: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.level = m.data.level;
      this.send(m.data.pcm, false);
    };
    this.node = node;
    this.timers.push(window.setTimeout(() => !this.heardSpeech && this.fail("nospeech"), NO_SPEECH_MS));
    this.ev.onListening();
  }

  private open(token: string) {
    const q = new URLSearchParams({
      model_id: "scribe_v2_realtime",
      token,
      audio_format: "pcm_16000",
      commit_strategy: "vad",
      vad_silence_threshold_secs: String(SILENCE_SECS),
    });
    const ws = new WebSocket(`${WS_URL}?${q}`);
    this.ws = ws;
    ws.onopen = () => {
      for (const c of this.queue) ws.send(c);
      this.queue = [];
    };
    ws.onmessage = (m) => this.onMessage(m.data as string);
    ws.onerror = () => this.fail("network");
    ws.onclose = () => {
      if (!this.done) this.finishing ? this.settle() : this.fail("network");
    };
  }

  private send(pcm: ArrayBuffer, commit: boolean) {
    const msg = JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: toBase64(pcm), commit, sample_rate: 16000 });
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(msg);
    else if (!this.ws || this.ws.readyState === WebSocket.CONNECTING) this.queue.push(msg);
  }

  private onMessage(raw: string) {
    let d: { message_type?: string; text?: string };
    try {
      d = JSON.parse(raw);
    } catch {
      return;
    }
    switch (d.message_type) {
      case "partial_transcript":
        if (d.text?.trim()) {
          this.heardSpeech = true;
          this.partial = d.text.trim();
          this.ev.onPartial(this.partial);
        }
        break;
      case "committed_transcript":
      case "committed_transcript_with_timestamps": {
        const text = (d.text ?? "").trim();
        if (text) {
          this.partial = text;
          this.settle();
        } else if (this.finishing) this.settle();
        break;
      }
      case "insufficient_audio_activity":
        this.fail("nospeech");
        break;
      case "auth_error":
      case "quota_exceeded":
      case "rate_limited":
      case "resource_exhausted":
      case "unaccepted_terms":
      case "error":
      case "transcriber_error":
      case "session_time_limit_exceeded":
        this.fail("service");
        break;
      default:
        break;
    }
  }

  /** The Stop button: send the last words to be finalised, then wait briefly for them. */
  stop(): void {
    if (this.done || this.finishing) return;
    this.finishing = true;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.port.close();
    this.send(new Int16Array(1600).buffer, true);
    this.timers.push(window.setTimeout(() => this.settle(), FINISH_WAIT_MS));
  }

  /** Close without a result. */
  cancel(): void {
    this.done = true;
    this.cleanup();
  }

  private settle() {
    if (this.done) return;
    const text = this.partial.trim();
    this.done = true;
    this.cleanup();
    if (text) this.ev.onFinal(text);
    else this.ev.onError("nospeech");
  }

  private fail(e: VoiceError) {
    if (this.done) return;
    // A connection that drops after words were recognised still has something worth using.
    if (e === "network" && this.partial.trim()) return this.settle();
    this.done = true;
    this.cleanup();
    this.ev.onError(e);
  }

  private cleanup() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    try {
      this.node?.port.close();
    } catch {
      // already closed
    }
    this.node?.disconnect();
    void this.ctx?.close().catch(() => undefined);
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    this.ws = null;
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.level = 0;
  }
}
