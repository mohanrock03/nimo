/* Automated tests for Nimo step 1. Run:  node tests/run-tests.js
   Uses a fake microphone, fake voice and fake clock, so it needs no browser or internet. */
'use strict';
var Wake = require('../js/wake.js');
var Brain = require('../js/brain.js');
var Assistant = require('../js/assistant.js');

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

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
