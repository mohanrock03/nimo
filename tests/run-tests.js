/* Automated tests for Nimo step 1. Run:  node tests/run-tests.js
   Uses a fake microphone, fake voice and fake clock, so it needs no browser or internet. */
'use strict';
var Wake = require('../js/wake.js');
var Brain = require('../js/brain.js');
var Assistant = require('../js/assistant.js');
var Mic = require('../js/mic.js');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

// ---------- fake clock ----------
function FakeClock() {
  var t = 0, timers = [], id = 0;
  return {
    now: function () { return t; },
    setTimeout: function (fn, ms) { timers.push({ id: ++id, at: t + ms, fn: fn }); return id; },
    clearTimeout: function (i) { timers = timers.filter(function (x) { return x.id !== i; }); },
    advance: function (ms) {
      var end = t + ms;
      for (;;) {
        timers.sort(function (a, b) { return a.at - b.at; });
        var next = timers[0];
        if (!next || next.at > end) break;
        timers.shift(); t = next.at; next.fn();
      }
      t = end;
    }
  };
}

// ---------- harness ----------
function harness() {
  var clock = FakeClock();
  var mic = { instances: [], current: null };
  var said = [], overlaps = 0, pendingSpeech = null, events = [];
  function FakeRec() {
    var self = this; this.results = [];
    this.start = function () { mic.current = self; mic.instances.push(self); };
    this.abort = function () { if (mic.current === self) mic.current = null; };
    this.stop = this.abort;
  }
  var synth = {
    speak: function (text) {
      if (a.micOpen) overlaps++;             // Nimo must never talk while the mic is listening
      said.push(text);
      return new Promise(function (res) { pendingSpeech = res; });
    },
    cancel: function () { if (pendingSpeech) { var r = pendingSpeech; pendingSpeech = null; r(); } }
  };
  var a = Assistant.createAssistant({
    createRecognition: function () { return new FakeRec(); },
    synth: synth, clock: clock,
    now: function () { return new Date(2026, 8, 24, 15, 7); },
    onEvent: function (e) { events.push(e); }
  });
  var h = {
    a: a, clock: clock, said: said, events: events, mic: mic,
    get overlaps() { return overlaps; },
    // Simulate the browser delivering words. segments: [[text, isFinal], ...] for the current session.
    hear: function (segments) {
      var r = mic.current; if (!r) return false;
      r.results = segments.map(function (s) { var x = [{ transcript: s[0] }]; x.isFinal = s[1]; return x; });
      r.onresult && r.onresult({ results: r.results, resultIndex: 0 });
      return true;
    },
    // Finish current speech output (like the voice reaching its end) and let async settle.
    finishSpeaking: async function () {
      await Promise.resolve();
      if (pendingSpeech) { var r = pendingSpeech; pendingSpeech = null; r(); }
      await Promise.resolve(); await Promise.resolve();
    },
    states: function () { return events.filter(function (e) { return e.type === 'state'; }).map(function (e) { return e.state; }); }
  };
  return h;
}

(async function main() {
  console.log('\nWake word detection');
  var yes = ['hey nimo', 'Hey Nimo!', 'nimo', 'Nemo', 'hey Nemo what time is it', 'hi neemo', 'ok nimmo', 'hey buddy', 'Hey buddy, how are you', 'hey body',
    'ஹே நிமோ', 'நிமோ நேரம் என்ன', 'blah blah hey nimo', 'nimo, go to sleep'];
  var no = ['my buddy said hello', 'buddy', 'I have nine apples', 'show me the demo', 'take a memo', 'his name is nino', 'no more', 'hello there', 'good morning', ''];
  yes.forEach(function (s) { test('wakes on "' + s + '"', function () { ok(Wake.detect(s), 'not detected'); }); });
  no.forEach(function (s) { test('ignores "' + s + '"', function () { eq(Wake.detect(s), null); }); });
  test('extracts command after wake word', function () { eq(Wake.detect('Hey Nemo, what time is it?').command, 'what time is it'); });
  test('extracts Tamil command', function () { eq(Wake.detect('ஹே நிமோ நேரம் என்ன').command, 'நேரம் என்ன'); });

  console.log('\nReplies');
  var now = new Date(2026, 8, 24, 15, 7);
  test('time in English', function () { eq(Brain.reply('what time is it', now).text, "It's 3:07 PM."); });
  test('time in Tanglish', function () { eq(Brain.reply('enna time', now).text, "It's 3:07 PM."); });
  test('time in Tamil script', function () { eq(Brain.reply('நேரம் என்ன', now).lang, 'ta'); });
  test('date', function () { eq(Brain.reply("what's the date today", now).text, 'Today is Thursday, 24 September 2026.'); });
  test('name', function () { ok(/Nimo/.test(Brain.reply('what is your name').text)); });
  test('tanglish how are you', function () { ok(/great/.test(Brain.reply('eppadi irukka').text)); });
  test('sleep command', function () { eq(Brain.reply('go to sleep').action, 'sleep'); });
  test('honest fallback for unknown', function () { ok(/can't answer that yet/.test(Brain.reply('book a flight to delhi').text)); });

  console.log('\nTurn-taking (fake mic + fake voice)');
  var h;

  h = harness(); h.a.start();
  test('starts asleep with mic open', function () { eq(h.a.state, 'sleeping'); ok(h.a.micOpen); });
  h.hear([['what is the weather', true]]); h.clock.advance(2000);
  test('ignores speech without wake word', function () { eq(h.said.length, 0); eq(h.a.state, 'sleeping'); });
  h.hear([['what is the weather', true], ['hey ni', false]]);
  h.hear([['what is the weather', true], ['hey nimo', false]]);
  test('wakes instantly on interim "hey nimo" but does not speak yet', function () { eq(h.a.state, 'listening'); eq(h.said.length, 0); });
  h.hear([['what is the weather', true], ['hey nimo what', false]]);
  h.clock.advance(2000);
  test('does not answer while user is still mid-sentence (no final result)', function () { eq(h.said.length, 0); });
  h.hear([['what is the weather', true], ['hey nimo what time is it', true]]);
  h.clock.advance(300);
  h.hear([['what is the weather', true], ['hey nimo what time is it', true], ['please', false]]);
  h.clock.advance(600);
  test('keeps waiting when the user continues after a pause', function () { eq(h.said.length, 0); });
  h.hear([['what is the weather', true], ['hey nimo what time is it', true], ['please', true]]);
  h.clock.advance(700);
  test('answers after user finishes', function () { eq(h.said.length, 1); eq(h.said[0], "It's 3:07 PM."); });
  test('mic is closed while Nimo speaks', function () { eq(h.a.state, 'speaking'); ok(!h.a.micOpen); eq(h.overlaps, 0); });
  test('words arriving while Nimo speaks are ignored', function () { eq(h.hear([['echo', true]]), false); });
  await h.finishSpeaking();
  test('mic stays closed during the short gap after speaking', function () { ok(!h.a.micOpen); });
  h.clock.advance(400);
  test('mic reopens after Nimo finishes, in follow-up listening', function () { ok(h.a.micOpen); eq(h.a.state, 'listening'); });
  h.hear([["it's 3:07 pm", true]]); h.clock.advance(1000);
  test('drops its own voice picked up by the mic (echo guard)', function () { eq(h.said.length, 1); });
  h.clock.advance(3000);
  h.hear([["it's 3:07 pm", true], ['eppadi irukka', true]]); h.clock.advance(800);
  test('follow-up question works without wake word', function () { eq(h.said.length, 2); ok(/great/.test(h.said[1])); });
  await h.finishSpeaking(); h.clock.advance(400);
  h.clock.advance(8100);
  test('goes back to sleep after 8 s of silence', function () { eq(h.a.state, 'sleeping'); ok(h.a.micOpen); });
  h.hear([['random chat', true]]); h.clock.advance(1000);
  test('after sleeping, needs the wake word again', function () { eq(h.said.length, 2); });

  h = harness(); h.a.start();
  h.hear([['hey buddy', true]]); h.clock.advance(700);
  test('wake word alone -> short acknowledgement', function () { eq(h.said.length, 1); ok(/listening/.test(h.said[0])); });
  await h.finishSpeaking(); h.clock.advance(400);
  h.hear([['go to sleep', true]]); h.clock.advance(700);
  test('sleep command', function () { ok(/going to sleep/.test(h.said[1])); });
  await h.finishSpeaking(); h.clock.advance(400);
  test('asleep after sleep command', function () { eq(h.a.state, 'sleeping'); ok(h.a.micOpen); });

  h = harness(); h.a.start();
  h.hear([['nimo tell me a very long story', true]]); h.clock.advance(700);
  test('speaking before interrupt', function () { eq(h.a.state, 'speaking'); });
  h.a.interrupt(); await Promise.resolve(); await Promise.resolve(); h.clock.advance(400);
  test('tap to interrupt stops Nimo and reopens the mic', function () { ok(h.a.micOpen); eq(h.a.state, 'listening'); });

  h = harness(); h.a.start();
  h.hear([['ஹே நிமோ நேரம் என்ன', true]]); h.clock.advance(700);
  test('Tamil script end-to-end', function () { ok(/நேரம்/.test(h.said[0])); });
  h.a.stop();
  test('stop turns everything off', function () { eq(h.a.state, 'off'); ok(!h.a.micOpen); });

  // Browser ends recognition by itself (silence / 60 s limit): Nimo must reopen it.
  h = harness(); h.a.start();
  var first = h.mic.current; first.onend(); h.clock.advance(200);
  test('auto-restarts mic when the browser ends it', function () { ok(h.mic.current && h.mic.current !== first); ok(h.a.micOpen); });

  test('no overlap across all scenarios', function () { eq(h.overlaps, 0); });

  // ---------- mic sharing (Android fix) ----------
  var UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  var UA_ANDROID_TAB = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  var UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  var UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1';
  test('meter off on Android phone Chrome', function () { var d = Mic.decideMeter({ ua: UA_ANDROID }); eq(d.useMeter, false); eq(d.reason, 'android'); });
  test('meter off on Android tablet (no "Mobile" in UA)', function () { eq(Mic.decideMeter({ ua: UA_ANDROID_TAB }).useMeter, false); });
  test('meter off when userAgentData says mobile', function () { eq(Mic.decideMeter({ ua: UA_WIN, uaDataMobile: true }).useMeter, false); });
  test('meter off on iPhone', function () { eq(Mic.decideMeter({ ua: UA_IPHONE }).useMeter, false); });
  test('meter stays on for desktop Chrome', function () { var d = Mic.decideMeter({ ua: UA_WIN, uaDataMobile: false }); eq(d.useMeter, true); eq(d.reason, 'desktop'); });
  test('?meter=off forces it off on desktop', function () { eq(Mic.decideMeter({ ua: UA_WIN, search: '?meter=off' }).useMeter, false); });
  test('?meter=on forces it on (testing override)', function () { eq(Mic.decideMeter({ ua: UA_ANDROID, search: '?x=1&meter=on' }).useMeter, true); });
  test('remembered clash keeps meter off', function () { var d = Mic.decideMeter({ ua: UA_WIN, stored: 'off' }); eq(d.useMeter, false); eq(d.reason, 'remembered-clash'); });

  function fakeMedia() {
    var dev = { holders: 0, streams: [], acClosed: 0, pending: [] };
    dev.getUserMedia = function () {
      return new Promise(function (res) {
        var s = { tracks: [{ stopped: false, stop: function () { if (!this.stopped) { this.stopped = true; dev.holders--; } } }],
                  getTracks: function () { return this.tracks; } };
        dev.holders++; dev.streams.push(s); dev.pending.push(function () { res(s); });
      });
    };
    dev.flush = async function () { while (dev.pending.length) dev.pending.shift()(); await Promise.resolve(); await Promise.resolve(); };
    dev.AC = function () {
      this.createMediaStreamSource = function () { return { connect: function () {} }; };
      this.createAnalyser = function () { return { fftSize: 0, getByteTimeDomainData: function (b) { for (var i = 0; i < b.length; i++) b[i] = i % 2 ? 160 : 96; } }; };
      this.close = function () { dev.acClosed++; };
    };
    return dev;
  }
  var dev = fakeMedia(), levels = [];
  var meter = Mic.createMeter({ getUserMedia: dev.getUserMedia, AudioContext: dev.AC, raf: function () { return 1; }, caf: function () {}, onLevel: function (v) { levels.push(v); } });
  var p = meter.start(); await dev.flush(); await p;
  test('meter opens the mic and reports a level', function () { ok(meter.active); eq(dev.holders, 1); ok(levels.length && levels[0] > 0); });
  meter.release();
  test('meter release stops every track and closes audio', function () { ok(!meter.active); eq(dev.holders, 0); eq(dev.acClosed, 1); eq(levels[levels.length - 1], 0); });
  dev = fakeMedia();
  meter = Mic.createMeter({ getUserMedia: dev.getUserMedia, AudioContext: dev.AC, onLevel: function () {} });
  p = meter.start(); meter.release(); await dev.flush(); await p;
  test('release during a pending mic request does not leak the stream', function () { ok(!meter.active); eq(dev.holders, 0); });

  // Assistant tells the page when the speech service never gets audio.
  function starvedEvents(hh) { return hh.events.filter(function (e) { return e.type === 'mic-starved'; }); }
  h = harness(); h.a.start();
  h.mic.current.onend(); h.clock.advance(200);
  test('one audio-less session is not yet a clash', function () { eq(starvedEvents(h).length, 0); });
  h.mic.current.onend(); h.clock.advance(200);
  test('two audio-less sessions in a row -> mic-starved', function () { eq(starvedEvents(h).length, 1); });
  h = harness(); h.a.start();
  h.mic.current.onaudiostart(); h.mic.current.onend(); h.clock.advance(200);
  h.mic.current.onaudiostart(); h.mic.current.onend(); h.clock.advance(200);
  test('sessions that got audio never report mic-starved', function () { eq(starvedEvents(h).length, 0); ok(h.a.micOpen); });
  h = harness(); h.a.start();
  h.mic.current.onend(); h.clock.advance(200); h.mic.current.onaudiostart(); h.mic.current.onend(); h.clock.advance(200); h.mic.current.onend(); h.clock.advance(200);
  test('audio resets the starvation count', function () { eq(starvedEvents(h).length, 0); });
  h = harness(); h.a.start();
  h.mic.current.onerror({ error: 'audio-capture' });
  test('audio-capture error -> mic-starved + mic off', function () { eq(starvedEvents(h).length, 1); eq(h.a.state, 'off'); });
  h = harness(); h.a.start();
  h.hear([['hey nimo what time is it', true]]); h.clock.advance(700);
  test('Nimo closing the mic to speak does not count as starvation', function () { eq(h.a.state, 'speaking'); eq(starvedEvents(h).length, 0); });
  h = harness(); h.a.start();
  h.mic.current.onspeechstart(); h.mic.current.onspeechend();
  test('speech start/end reach the page for the orb pulse', function () {
    var v = h.events.filter(function (e) { return e.type === 'voice'; }).map(function (e) { return e.on; });
    eq(JSON.stringify(v), '[true,false]');
  });

  // End-to-end simulation of the Android clash: one exclusive microphone.
  // The speech service only gets audio if nobody else holds the mic.
  async function androidRun(ua) {
    var dev = fakeMedia(), clock = FakeClock(), said = [], cur = null, starved = 0;
    function Rec() { var self = this; this.start = function () { cur = self; clock.setTimeout(function () {
        if (cur !== self) return;
        if (dev.holders === 0) self.onaudiostart && self.onaudiostart();
        else { self.onend && self.onend(); }   // Android: "cannot record now as Chrome is recording"
      }, 50); };
      this.abort = function () { if (cur === self) cur = null; }; this.stop = this.abort; }
    var plan = Mic.decideMeter({ ua: ua });
    var meter = Mic.createMeter({ getUserMedia: dev.getUserMedia, onLevel: function () {} });
    var assistant = Assistant.createAssistant({
      createRecognition: function () { return new Rec(); }, clock: clock,
      now: function () { return new Date(2026, 8, 24, 15, 7); },
      synth: { speak: function (t) { said.push(t); return Promise.resolve(); }, cancel: function () {} },
      onEvent: function (e) { if (e.type === 'mic-starved') { starved++; if (meter.active) { meter.release(); assistant.stop(); clock.setTimeout(function () { assistant.start(); }, 400); } } }
    });
    if (plan.useMeter) { var mp = meter.start(); await dev.flush(); await mp; }
    assistant.start(); clock.advance(2000);
    function hear(t) { var r = cur; r.results = [[{ transcript: t }]]; r.results[0].isFinal = true; r.onresult({ results: r.results, resultIndex: 0 }); }
    if (cur) hear('hey nimo what time is it');
    clock.advance(800); await Promise.resolve(); await Promise.resolve();
    return { said: said, starved: starved, plan: plan, holders: dev.holders };
  }
  var r1 = await androidRun(UA_ANDROID);
  test('Android phone: page never opens the mic, wake word + answer work', function () { eq(r1.plan.useMeter, false); eq(r1.starved, 0); eq(r1.said.length, 1); ok(/3:07|15:07|time/i.test(r1.said[0]), r1.said[0]); });
  var r2 = await androidRun('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
  test('Android "desktop site" mode: clash detected, meter released, then it answers', function () { eq(r2.plan.useMeter, true); ok(r2.starved >= 1); eq(r2.holders, 0); eq(r2.said.length, 1); });



  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
