/* Nimo - wires the page: browser speech APIs + orb + assistant core. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var orb = NimoOrb.createOrb($('orb'));
  var statusEl = $('status'), heardEl = $('heard'), replyEl = $('reply'), micEl = $('mic');

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var hasTTS = 'speechSynthesis' in window;

  function notice(html) { var n = $('notice'); n.innerHTML = html; n.hidden = false; }

  if (!Rec || !hasTTS) {
    statusEl.textContent = 'Browser not supported';
    notice('This browser has no speech recognition. Open Nimo in <b>Google Chrome</b> or <b>Microsoft Edge</b> on a computer.');
    $('start').disabled = true;
    orb.setMode('off');
    return;
  }
  if (location.protocol === 'file:') {
    notice('Opened as a file. It may still work, but Chrome will keep asking for the mic. Better: run <b>start-windows.bat</b> (or start-mac-linux.sh) and use http://localhost:8765');
  }

  // ---------- voice output ----------
  var voices = [];
  function loadVoices() { voices = speechSynthesis.getVoices(); }
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
  function pickVoice(lang) {
    var want = lang === 'ta' ? ['ta-IN', 'ta'] : ['en-IN', 'en-GB', 'en-US', 'en'];
    for (var w = 0; w < want.length; w++) {
      var list = voices.filter(function (v) { return v.lang.replace('_', '-').toLowerCase().indexOf(want[w].toLowerCase()) === 0; });
      if (list.length) {
        var nice = list.filter(function (v) { return /google|natural|neural|online/i.test(v.name); });
        return (nice[0] || list[0]);
      }
    }
    return null;
  }
  var toldNoTamil = false;
  var keep = [];   // Chrome drops utterances that are garbage-collected mid-speech
  var synth = {
    speak: function (text, lang) {
      return new Promise(function (resolve) {
        var voice = pickVoice(lang);
        var sayText = text, sayLang = lang === 'ta' ? 'ta-IN' : 'en-IN';
        if (lang === 'ta' && !voice) {
          // No Tamil voice on this computer: answer stays on screen.
          if (toldNoTamil) { setTimeout(resolve, 1500); return; }
          toldNoTamil = true;
          sayText = 'Tamil voice is not installed on this computer, so I have shown the answer on screen.';
          sayLang = 'en-IN'; voice = pickVoice('en');
        }
        var u = new SpeechSynthesisUtterance(sayText);
        u.lang = sayLang; if (voice) u.voice = voice;
        u.rate = 1.02; u.pitch = 1;
        var done = false;
        function end() { if (done) return; done = true; clearTimeout(safety); keep.splice(keep.indexOf(u), 1); resolve(); }
        u.onend = end; u.onerror = end;
        // Safety net: some browsers occasionally never fire onend.
        var safety = setTimeout(function () { speechSynthesis.cancel(); end(); }, 4000 + sayText.length * 110);
        keep.push(u);
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      });
    },
    cancel: function () { speechSynthesis.cancel(); }
  };

  // ---------- assistant ----------
  var labels = { off: 'Offline', sleeping: 'Say "Hey Nimo"', listening: 'Listening', thinking: '...', speaking: 'Speaking' };
  var assistant = NimoAssistant.createAssistant({
    createRecognition: function () { return new Rec(); },
    synth: synth,
    clock: { now: function () { return Date.now(); }, setTimeout: setTimeout.bind(window), clearTimeout: clearTimeout.bind(window) },
    lang: $('lang').value,
    onEvent: function (e) {
      if (e.type === 'state') {
        statusEl.textContent = labels[e.state] || e.state;
        statusEl.className = 'status ' + e.state;
        orb.setMode(e.state);
        if (e.state === 'sleeping') heardEl.textContent = '';
      } else if (e.type === 'mic') {
        micEl.textContent = e.on ? 'MIC ON' : 'MIC OFF';
        micEl.classList.toggle('on', e.on);
      } else if (e.type === 'heard') {
        if (assistant && assistant.state !== 'sleeping') heardEl.textContent = e.text;
      } else if (e.type === 'wake') {
        heardEl.textContent = e.variant; replyEl.textContent = '';
      } else if (e.type === 'say') {
        replyEl.textContent = e.text;
      } else if (e.type === 'error') {
        var msg = {
          'not-allowed': 'Microphone permission was blocked. Click the lock icon in the address bar, allow Microphone, then reload.',
          'service-not-allowed': 'The browser refused speech recognition. Use Chrome or Edge, served from http://localhost.',
          'audio-capture': 'No microphone found. Plug one in and reload.',
          'network': 'Speech recognition needs internet (the browser sends audio to its speech service). Check your connection.',
          'language-not-supported': 'This browser cannot recognise the selected language.'
        }[e.error];
        if (e.error === 'audio-capture' && (meter.active || Date.now() - meterReleasedAt < 3000)) msg = null; // handled by releasing the meter
        if (msg) notice(msg);
      } else if (e.type === 'voice') {
        setVoice(e.on);
      } else if (e.type === 'mic-starved') {
        onMicStarved();
      } else if (e.type === 'log' && window.console) {
        console.log('[nimo]', e.kind, e.text);
      }
    }
  });
  window.nimo = assistant; // handy for debugging in DevTools

  // ---------- mic level for the orb (visual only) ----------
  // Android: Google's speech service cannot record while this page holds the mic, so the
  // real meter is only used where the mic can be shared (desktop). See js/mic.js.
  var stored = null;
  try { stored = localStorage.getItem(NimoMic.STORE_KEY); } catch (e) {}
  var meterPlan = NimoMic.decideMeter({
    ua: navigator.userAgent,
    uaDataMobile: navigator.userAgentData ? navigator.userAgentData.mobile : undefined,
    search: location.search,
    stored: stored
  });
  var meter = NimoMic.createMeter({
    getUserMedia: function (c) { return navigator.mediaDevices.getUserMedia(c); },
    AudioContext: window.AudioContext || window.webkitAudioContext,
    raf: requestAnimationFrame.bind(window), caf: cancelAnimationFrame.bind(window),
    onLevel: function (v) { orb.setLevel(assistant.state === 'speaking' ? 0 : v); }
  });
  console.log('[nimo] mic meter:', meterPlan.useMeter ? 'on' : 'off', '(' + meterPlan.reason + ')');

  // Without the real meter, pulse the orb from the speech service's own "hearing voice" events.
  var voicePulse = null;
  function setVoice(on) {
    if (meter.active) return;
    if (voicePulse) { clearInterval(voicePulse); voicePulse = null; }
    if (on) {
      voicePulse = setInterval(function () { orb.setLevel(0.35 + Math.random() * 0.45); }, 90);
    } else {
      orb.setLevel(0);
    }
  }

  function startLevelMeter() {
    if (!meterPlan.useMeter || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve();
    return meter.start().catch(function (err) {
      if (err && err.name === 'NotAllowedError') notice('Microphone permission was blocked. Click the lock icon in the address bar, allow Microphone, then reload.');
    });
  }

  // Speech recognition could not get the mic. If our meter holds it, free it and retry once.
  var starvedNotified = false, meterReleasedAt = 0;
  function onMicStarved() {
    if (meter.active) {
      console.log('[nimo] speech service could not get the mic - releasing the orb meter');
      meter.release(); meterReleasedAt = Date.now();
      meterPlan = { useMeter: false, reason: 'runtime-clash' };
      try { localStorage.setItem(NimoMic.STORE_KEY, 'off'); } catch (e) {}
      assistant.stop();
      setTimeout(function () { if (!$('start').hidden) return; assistant.start(); }, 400);
    } else if (!starvedNotified) {
      starvedNotified = true;
      notice('The speech service cannot reach the microphone. Close other apps or tabs using the mic (calls, recorders, other voice apps), then tap Stop and Start Nimo again.');
    }
  }

  $('start').addEventListener('click', function () {
    $('start').hidden = true; $('stop').hidden = false; starvedNotified = false;
    // Unlock speech output with a silent utterance inside the click (autoplay rules).
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    startLevelMeter().then(function () { assistant.start(); });
  });
  $('stop').addEventListener('click', function () {
    assistant.stop(); meter.release(); setVoice(false); $('stop').hidden = true; $('start').hidden = false; heardEl.textContent = ''; replyEl.textContent = '';
  });
  $('lang').addEventListener('change', function (e) { assistant.setLang(e.target.value); });
  // Tap the orb while Nimo is talking to cut it off.
  $('orb').addEventListener('click', function () { assistant.interrupt(); });
  orb.setMode('off');
})();
