/**
 * 🎙️ QLCL TTS Engine — pipeline đọc văn bản "giọng vốn có của web".
 *
 * Kiến trúc:
 *   1. Cắt text thành câu → gửi round-robin 2 luồng tới /api/tts (Piper, CPU)
 *   2. Reorder buffer: phát tuần tự đúng thứ tự, liền mạch
 *   3. Tốc độ 0.75x–2x qua playbackRate (giữ cao độ)
 *   4. Fallback: API chết → Web Speech API (giọng trình duyệt, ưu tiên Natural/Neural)
 */

const API_ENDPOINT = '/api/tts';
const CONCURRENCY = 2;          // số luồng gửi song song (round-robin)
const MAX_CHUNK_CHARS = 280;    // câu quá dài thì cắt nhỏ thêm
const MIN_CHUNK_CHARS = 24;     // mảnh quá ngắn thì ghép với câu sau
const RATES = [0.75, 1, 1.25, 1.5, 2];

let _session = null;            // phiên đọc hiện tại
let _rate = Number(localStorage.getItem('qlcl_tts_rate')) || 1;
let _bar = null;                // thanh điều khiển nổi

function splitSentences(text) {
  const raw = String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;:])\s+|(?<=\n)/)
    .map(s => s.trim())
    .filter(Boolean);

  const merged = [];
  for (const piece of raw) {
    if (merged.length && merged[merged.length - 1].length < MIN_CHUNK_CHARS) {
      merged[merged.length - 1] += ' ' + piece;
    } else {
      merged.push(piece);
    }
  }

  const chunks = [];
  for (const piece of merged) {
    if (piece.length <= MAX_CHUNK_CHARS) { chunks.push(piece); continue; }
    const parts = piece.split(/(?<=,\s)|\s/);
    let buf = '';
    for (const p of parts) {
      if ((buf + ' ' + p).trim().length > MAX_CHUNK_CHARS && buf) { chunks.push(buf.trim()); buf = p; }
      else buf += ' ' + p;
    }
    if (buf.trim()) chunks.push(buf.trim());
  }
  return chunks;
}

async function fetchSentenceAudio(text, signal) {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal
  });
  if (!res.ok) throw new Error('tts-http-' + res.status);
  return res.blob();
}

function playBlob(blob, session) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = _rate;
    if ('preservesPitch' in audio) audio.preservesPitch = true;
    session.audio = audio;
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('audio-error')); };
    audio.play().catch(reject);
  });
}

/* ── Fallback: Web Speech API với giọng Việt tốt nhất có sẵn ─────────── */
function pickBestLocalVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const vi = voices.filter(v => /^vi/i.test(v.lang));
  if (!vi.length) return null;
  return vi.find(v => /natural|neural|online|premium/i.test(v.name)) || vi[0];
}

function speakLocalFallback(text, session) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') {
      resolve(false); return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    const voice = pickBestLocalVoice();
    if (voice) u.voice = voice;
    u.rate = _rate;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(true);
    session.localUtterance = u;
    window.speechSynthesis.speak(u);
  });
}

/* ── Thanh điều khiển nổi (stop + tốc độ) ─────────────────────────────── */
function ensureBar() {
  if (_bar && document.body.contains(_bar)) return _bar;
  _bar = document.createElement('div');
  _bar.id = 'qlcl-tts-bar';
  _bar.style.cssText = 'position:fixed;z-index:99999;right:18px;bottom:18px;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#111;color:#fff;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 13px system-ui,sans-serif';
  _bar.innerHTML = `
    <span class="qlcl-tts-dot" style="width:8px;height:8px;border-radius:50%;background:#35D6A0;animation:qlcltts 1.2s infinite"></span>
    <span class="qlcl-tts-label">Đang đọc…</span>
    <button class="qlcl-tts-rate" style="background:#222;color:#fff;border:0;border-radius:999px;padding:4px 10px;cursor:pointer;font:700 12px inherit" title="Đổi tốc độ đọc">1x</button>
    <button class="qlcl-tts-stop" style="background:#c0392b;color:#fff;border:0;border-radius:999px;padding:4px 12px;cursor:pointer;font:700 12px inherit" title="Dừng">Dừng</button>
  `;
  if (!document.getElementById('qlcl-tts-style')) {
    const st = document.createElement('style');
    st.id = 'qlcl-tts-style';
    st.textContent = '@keyframes qlcltts{0%,100%{opacity:1}50%{opacity:.3}}';
    document.head.appendChild(st);
  }
  _bar.querySelector('.qlcl-tts-stop').addEventListener('click', () => stop());
  _bar.querySelector('.qlcl-tts-rate').addEventListener('click', () => {
    const next = RATES[(RATES.indexOf(_rate) + 1) % RATES.length];
    setRate(next);
    _bar.querySelector('.qlcl-tts-rate').textContent = _rate + 'x';
    if (_session?.audio) _session.audio.playbackRate = _rate;
  });
  document.body.appendChild(_bar);
  return _bar;
}

function showBar(show) {
  const bar = ensureBar();
  bar.style.display = show ? 'flex' : 'none';
  bar.querySelector('.qlcl-tts-rate').textContent = _rate + 'x';
}

/* ── Pipeline chính ───────────────────────────────────────────────────── */
async function speak(text, opts = {}) {
  const clean = String(text || '').trim();
  if (!clean) return false;
  stop();

  const session = { stopped: false, audio: null, controller: new AbortController() };
  _session = session;
  if (opts.rate) setRate(opts.rate);
  showBar(true);

  const sentences = splitSentences(clean);
  const results = new Map();          // index -> blob
  let nextToFetch = 0;
  let pipelineFailed = false;

  const worker = async () => {
    while (!session.stopped && nextToFetch < sentences.length) {
      const idx = nextToFetch++;       // round-robin: mỗi worker lấy câu kế tiếp
      try {
        results.set(idx, await fetchSentenceAudio(sentences[idx], session.controller.signal));
      } catch {
        if (!session.stopped) pipelineFailed = true;
        return;
      }
    }
  };

  const waitFor = (idx) => new Promise(resolve => {
    const t = setInterval(() => {
      if (results.has(idx) || pipelineFailed || session.stopped) { clearInterval(t); resolve(); }
    }, 25);
  });

  let playedCount = 0;
  const player = (async () => {
    for (let i = 0; i < sentences.length; i++) {
      if (session.stopped) return;
      await waitFor(i);
      if (session.stopped) return;
      const blob = results.get(i);
      results.delete(i);
      if (!blob) return;               // pipeline fail → rơi xuống fallback
      try {
        await playBlob(blob, session);
        playedCount++;
      } catch {
        if (session.stopped) return;
      }
    }
  })();

  const workers = Array.from({ length: Math.min(CONCURRENCY, sentences.length) }, () => worker());
  await Promise.all([...workers, player]);

  if (!session.stopped && playedCount < sentences.length) {
    const remaining = sentences.slice(playedCount).join(' ');
    const ok = await speakLocalFallback(remaining, session);
    if (!ok) { if (_session === session) { _session = null; showBar(false); } return false; }
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (session.stopped || !window.speechSynthesis.speaking) { clearInterval(check); resolve(); }
      }, 120);
    });
  }

  if (_session === session) { _session = null; showBar(false); }
  return true;
}

function stop() {
  if (_session) {
    _session.stopped = true;
    try { _session.controller.abort(); } catch { /* noop */ }
    if (_session.audio) { _session.audio.pause(); _session.audio = null; }
    if (_session.localUtterance) { window.speechSynthesis?.cancel(); }
    _session = null;
  }
  showBar(false);
}

function setRate(r) {
  const rate = Number(r);
  if (RATES.includes(rate)) {
    _rate = rate;
    try { localStorage.setItem('qlcl_tts_rate', String(rate)); } catch { /* noop */ }
  }
}

function isSpeaking() { return _session !== null; }

export const TTSEngine = { speak, stop, setRate, isSpeaking, get rate() { return _rate; } };

if (typeof window !== 'undefined') window.QLCLTTS = TTSEngine;
