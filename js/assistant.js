/* Nimo - assistant core: wake word -> listen -> answer, strictly one side talking at a time.
   Browser-independent: speech recognition, speech output and the clock are injected,
   so the same logic runs in the page and in the automated tests. */
(function (root) {
  'use strict';

  var Wake = (typeof module !== 'undefined' && module.exports) ? require('./wake.js') : root.NimoWake;
  var Brain = (typeof module !== 'undefined' && module.exports) ? require('./brain.js') : root.NimoBrain;

  var DEFAULTS = {
    endOfTurnMs: 700,       // silence after your last word before Nimo decides you've finished
    followUpMs: 8000,       // after answering, keep listening this long without the wake word
    commandWaitMs: 7000,    // after "hey nimo" alone, wait this long for the command
    resumeDelayMs: 350,     // gap between Nimo finishing speaking and the mic reopening
    echoGuardMs: 2500       // for this long after speaking, drop text that matches Nimo's own words
  };

  function createAssistant(deps) {
    var cfg = {}, k;
    for (k in DEFAULTS) cfg[k] = (deps.config && deps.config[k] != null) ? deps.config[k] : DEFAULTS[k];
    var clock = deps.clock;
    var synth = deps.synth;
    var emit = deps.onEvent || function () {};

    var state = 'off';            // off | sleeping | listening | thinking | speaking
    var rec = null, recActive = false, wantRec = false;
    var turnText = "", turnHasWake = false, wakeInfo = null;
    var endTimer = null, windowTimer = null, resumeTimer = null;
    var lastSpoken = '', lastSpokenEnd = 0;
    var lang = deps.lang || 'en-IN';

    function setState(s) {
      if (state === s) return;
      state = s;
      emit({ type: 'state', state: s });
    }
    function log(kind, text) { emit({ type: 'log', kind: kind, text: text }); }
    function clear(t) { if (t) clock.clearTimeout(t); return null; }

    // ---------- microphone (speech recognition) ----------
    function startRec() {
      wantRec = true;
      if (recActive || state === 'speaking' || state === 'off') return;
      rec = deps.createRecognition();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = onResult;
      rec.onerror = function (e) {
        var err = (e && e.error) || 'unknown';
        if (err === 'no-speech' || err === 'aborted') return;
        log('error', err);
        emit({ type: 'error', error: err });
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') stop();
      };
      rec.onend = function () {
        recActive = false;
        emit({ type: 'mic', on: false });
        // Browsers end recognition after silence or ~60 s; reopen unless Nimo is talking or off.
        if (wantRec && state !== 'speaking' && state !== 'off') {
          resumeTimer = clear(resumeTimer);
          resumeTimer = clock.setTimeout(startRec, 150);
        }
      };
      try {
        rec.start();
        recActive = true;
        emit({ type: 'mic', on: true });
      } catch (err) {
        log('error', 'mic start failed: ' + err.message);
      }
    }
    function stopRec() {
      wantRec = false;
      if (rec) {
        var r = rec; rec = null;
        r.onresult = null;          // anything still in flight is discarded
        try { r.abort(); } catch (e) {}
      }
      if (recActive) { recActive = false; emit({ type: 'mic', on: false }); }
    }

    var consumed = 0;   // number of recognition results already handled in this mic session

    function onResult(e) {
      if (state === 'speaking' || state === 'thinking' || state === 'off') return; // never listen over Nimo
      var text = '', isFinal = true, n = e.results.length, lastFinal = consumed;
      for (var i = consumed; i < n; i++) {
        text += e.results[i][0].transcript + ' ';
        if (e.results[i].isFinal) { if (lastFinal === i) lastFinal = i + 1; } else isFinal = false;
      }
      text = text.trim();
      if (!text) return;

      // Drop Nimo's own voice if the speakers leak into the mic.
      if (clock.now() - lastSpokenEnd < cfg.echoGuardMs && Wake.similarity(text, lastSpoken) > 0.75) {
        log('echo', text);
        if (isFinal) consumed = n;
        return;
      }

      turnText = text;
      emit({ type: 'heard', text: text, final: isFinal });

      if (state === 'sleeping') {
        var w = Wake.detect(text);
        if (!w) {
          consumed = lastFinal;           // finished phrases without the wake word are ignored
          turnText = '';
          return;
        }
        turnHasWake = true;
        wakeInfo = w;
        windowTimer = clear(windowTimer);
        setState('listening');
        emit({ type: 'wake', phrase: w.phrase, variant: w.variant });
        log('wake', w.variant);
      } else if (state === 'listening') {
        windowTimer = clear(windowTimer); // user is talking, don't time out
      }
      // Wait for the user to finish: a final result followed by a short silence.
      endTimer = clear(endTimer);
      if (isFinal) {
        endTimer = clock.setTimeout(function () { finishTurn(n); }, cfg.endOfTurnMs);
      }
    }

    function finishTurn(len) {
      endTimer = null;
      if (state !== 'listening') return;
      var text = turnText;
      var command = text;
      if (turnHasWake) {
        var w = Wake.detect(text);
        command = w ? w.command : '';
      } else {
        var w2 = Wake.detect(text);        // "nimo, what time" during follow-up: strip the name
        if (w2 && w2.index === 0) command = w2.command;
      }
      turnText = ''; turnHasWake = false; consumed = len;
      respond(command);
    }

    // ---------- answering ----------
    function respond(command) {
      setState('thinking');
      var out = command ? Brain.reply(command, deps.now ? deps.now() : new Date()) : Brain.wakeAck(Brain.isTamilScript((wakeInfo && wakeInfo.variant) || ''));
      if (command) log('you', command);
      speak(out, function () {
        if (state === 'off') return;
        if (out.action === 'sleep') { goSleep(); return; }
        setState('listening');
        armWindow(command ? cfg.followUpMs : cfg.commandWaitMs);
      });
    }

    function speak(out, done) {
      stopRec();                        // 1. mic closed BEFORE Nimo makes a sound
      consumed = 0;
      setState('speaking');
      log('nimo', out.text);
      emit({ type: 'say', text: out.text, lang: out.lang });
      lastSpoken = out.text;
      synth.speak(out.text, out.lang).then(finish, finish);
      function finish() {
        lastSpokenEnd = clock.now();
        if (state !== 'speaking') return;
        // 2. short gap so the room echo dies, then 3. reopen the mic
        setState('thinking');
        resumeTimer = clock.setTimeout(function () {
          if (state === 'off') return;
          done();
          startRec();
        }, cfg.resumeDelayMs);
      }
    }

    function armWindow(ms) {
      windowTimer = clear(windowTimer);
      windowTimer = clock.setTimeout(function () {
        windowTimer = null;
        if (state === 'listening' && !turnText) goSleep();
      }, ms);
    }

    function goSleep() {
      windowTimer = clear(windowTimer);
      turnText = ''; turnHasWake = false;
      setState('sleeping');
      startRec();
    }

    // ---------- public ----------
    function start() {
      if (state !== 'off') return;
      setState('sleeping');
      startRec();
    }
    function stop() {
      endTimer = clear(endTimer); windowTimer = clear(windowTimer); resumeTimer = clear(resumeTimer);
      setState('off');
      stopRec();
      synth.cancel();
    }
    /** Tap-to-interrupt: cut Nimo off mid-sentence and listen. */
    function interrupt() {
      if (state !== 'speaking') return;
      synth.cancel();                    // synth promise resolves -> finish() reopens the mic
    }
    function setLang(l) {
      lang = l;
      if (recActive) { stopRec(); startRec(); }
    }
    return {
      start: start, stop: stop, interrupt: interrupt, setLang: setLang,
      get state() { return state; },
      get micOpen() { return recActive; }
    };
  }

  var api = { createAssistant: createAssistant, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NimoAssistant = api;
})(this);
