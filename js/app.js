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
        if (msg) notice(msg);
      } else if (e.type === 'log' && window.console) {
        console.log('[nimo]', e.kind, e.text);
      }
    }
  });
  window.nimo = assistant; // handy for debugging in DevTools

  // ---------- mic level for the orb (optional; only visual) ----------
  function startLevelMeter() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve();
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      var AC = window.AudioContext || window.webkitAudioContext; var ac = new AC();
      var src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 512; src.connect(an);
      var buf = new Uint8Array(an.fftSize);
      (function tick() {
        an.getByteTimeDomainData(buf);
        var sum = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
        var rms = Math.sqrt(sum / buf.length);
        orb.setLevel(assistant.state === 'speaking' ? 0 : Math.min(1, rms * 6));
        requestAnimationFrame(tick);
      })();
    }).catch(function (err) {
      if (err && err.name === 'NotAllowedError') notice('Microphone permission was blocked. Click the lock icon in the address bar, allow Microphone, then reload.');
    });
  }

  $('start').addEventListener('click', function () {
    $('start').hidden = true; $('stop').hidden = false;
    // Unlock speech output with a silent utterance inside the click (autoplay rules).
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    startLevelMeter().then(function () { assistant.start(); });
  });
  $('stop').addEventListener('click', function () {
    assistant.stop(); $('stop').hidden = true; $('start').hidden = false; heardEl.textContent = ''; replyEl.textContent = '';
  });
  $('lang').addEventListener('change', function (e) { assistant.setLang(e.target.value); });
  // Tap the orb while Nimo is talking to cut it off.
  $('orb').addEventListener('click', function () { assistant.interrupt(); });
  orb.setMode('off');
})();
