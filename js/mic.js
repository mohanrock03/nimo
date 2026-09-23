/* Nimo - microphone sharing policy for the orb's volume meter.

   Why this exists: the orb's volume animation opens its own mic stream (getUserMedia).
   On Android, Chrome's speech recognition runs in Google's separate speech service,
   and that service cannot record while Chrome already holds the microphone
   ("Speech Recognition and Synthesis from Google cannot record now as Chrome is recording").
   So on Android (and other phones) the meter is never opened; speech recognition gets the mic
   alone and the orb reacts to speech events instead. Desktop Chrome can share the mic, so the
   real meter stays there. If a device we did not expect still clashes (for example Android
   Chrome in "desktop site" mode), the app releases the meter at runtime and remembers that.

   Browser: window.NimoMic. Node (tests): module.exports. */
(function (root) {
  'use strict';

  var STORE_KEY = 'nimo.meter';

  // env: { ua, uaDataMobile, search, stored }
  // Returns { useMeter: boolean, reason: string }
  function decideMeter(env) {
    env = env || {};
    var ua = String(env.ua || '');
    var q = String(env.search || '');
    var m = /[?&]meter=(on|off)\b/i.exec(q);
    if (m) return { useMeter: m[1].toLowerCase() === 'on', reason: 'url-' + m[1].toLowerCase() };
    if (env.stored === 'off') return { useMeter: false, reason: 'remembered-clash' };
    if (/Android/i.test(ua)) return { useMeter: false, reason: 'android' };
    if (env.uaDataMobile === true) return { useMeter: false, reason: 'mobile' };
    if (/iPhone|iPad|iPod|Mobile/i.test(ua)) return { useMeter: false, reason: 'mobile' };
    return { useMeter: true, reason: 'desktop' };
  }

  // Volume meter that can be fully released (every track stopped, AudioContext closed).
  // deps: { getUserMedia(constraints) -> Promise<stream>, AudioContext, raf, caf, onLevel(v) }
  function createMeter(deps) {
    var stream = null, ac = null, rafId = null, active = false, gen = 0;
    function release() {
      gen++;
      active = false;
      if (rafId != null && deps.caf) deps.caf(rafId);
      rafId = null;
      if (stream) {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        stream = null;
      }
      if (ac) { try { ac.close(); } catch (e) {} ac = null; }
      if (deps.onLevel) deps.onLevel(0);
    }
    function start() {
      if (active) return Promise.resolve(true);
      var myGen = ++gen;
      return deps.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (s) {
        if (myGen !== gen) { s.getTracks().forEach(function (t) { t.stop(); }); return false; } // released meanwhile
        stream = s; active = true;
        if (!deps.AudioContext) return true;
        ac = new deps.AudioContext();
        var src = ac.createMediaStreamSource(s), an = ac.createAnalyser();
        an.fftSize = 512; src.connect(an);
        var buf = new Uint8Array(an.fftSize);
        (function tick() {
          if (myGen !== gen) return;
          an.getByteTimeDomainData(buf);
          var sum = 0;
          for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
          if (deps.onLevel) deps.onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
          rafId = deps.raf ? deps.raf(tick) : null;
        })();
        return true;
      });
    }
    return {
      start: start,
      release: release,
      get active() { return active; }
    };
  }

  var api = { decideMeter: decideMeter, createMeter: createMeter, STORE_KEY: STORE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NimoMic = api;
})(this);
