/* Nimo - step 1 replies. Small, rule-based and fully offline.
   This is NOT an AI model yet; real conversation is a later step. */
(function (root) {
  'use strict';

  function has(text, words) {
    for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) >= 0) return true;
    return false;
  }
  function isTamilScript(text) { return /[\u0B80-\u0BFF]/.test(text); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function timeText(d, tamil) {
    var h = d.getHours(), m = d.getMinutes();
    var h12 = h % 12 || 12, ampm = h < 12 ? 'AM' : 'PM';
    if (tamil) return 'இப்போ நேரம் ' + h12 + ':' + pad(m) + ' ' + ampm;
    return "It's " + h12 + ':' + pad(m) + ' ' + ampm + '.';
  }
  function dateText(d, tamil) {
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var s = days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    return tamil ? 'இன்று ' + s : 'Today is ' + s + '.';
  }

  /** Short acknowledgement when only the wake word was said. */
  function wakeAck(heardTamil) {
    return heardTamil
      ? { text: 'சொல்லுங்க, நான் கேக்குறேன்.', lang: 'ta' }
      : { text: 'Yes boss, sollunga. I am listening.', lang: 'en' };
  }

  /**
   * Reply to a command. Returns { text, lang, action } where action may be 'sleep'.
   */
  function reply(command, now) {
    now = now || new Date();
    var raw = String(command || '').trim();
    var t = raw.toLowerCase();
    var tamil = isTamilScript(raw);

    if (!t) return wakeAck(tamil);

    if (has(t, ['go to sleep', 'sleep now', 'bye', 'good night', 'stop listening', 'thoonggu', 'thungu', 'போய் தூங்கு', 'தூங்கு'])) {
      return { text: tamil ? 'சரி, நான் தூங்கப் போறேன். தேவைப்பட்டா கூப்பிடுங்க.' : 'Okay, going to sleep. Call me when you need me.', lang: tamil ? 'ta' : 'en', action: 'sleep' };
    }
    if (has(t, ['what time', 'time now', 'the time', 'enna time', 'time enna', 'mani enna', 'நேரம் என்ன', 'மணி என்ன', 'மணி எத்தனை'])) {
      return { text: timeText(now, tamil), lang: tamil ? 'ta' : 'en' };
    }
    if (has(t, ['date', 'what day', 'today', 'innaiku', 'inniku', 'தேதி', 'இன்னைக்கு', 'இன்று'])) {
      return { text: dateText(now, tamil), lang: tamil ? 'ta' : 'en' };
    }
    if (has(t, ['your name', 'who are you', 'nee yaaru', 'nee yaru', 'un peru', 'unga peru', 'நீ யாரு', 'நீ யார்', 'உன் பெயர்', 'உன் பேரு'])) {
      return tamil
        ? { text: 'நான் நிமோ, உங்க personal assistant.', lang: 'ta' }
        : { text: "I'm Nimo, your personal assistant.", lang: 'en' };
    }
    if (has(t, ['how are you', 'eppadi irukka', 'epdi irukka', 'eppadi irukeenga', 'epdi iruka', 'எப்படி இருக்க', 'எப்படி இருக்கீங்க'])) {
      return tamil
        ? { text: 'நான் நல்லா இருக்கேன். நீங்க எப்படி இருக்கீங்க?', lang: 'ta' }
        : { text: "I'm doing great, boss. Neenga eppadi irukeenga?", lang: 'en' };
    }
    if (has(t, ['thank', 'nandri', 'நன்றி'])) {
      return tamil ? { text: 'பரவாயில்லை!', lang: 'ta' } : { text: 'Anytime, boss.', lang: 'en' };
    }
    if (has(t, ['hello', 'hi ', 'vanakkam', 'வணக்கம்']) || t === 'hi') {
      return tamil ? { text: 'வணக்கம்! என்ன செய்யணும்?', lang: 'ta' } : { text: 'Vanakkam boss! What can I do?', lang: 'en' };
    }
    if (has(t, ['what can you do', 'enna panna mudiyum', 'என்ன பண்ண முடியும்'])) {
      return { text: 'Right now I can wake up, tell the time and date, and chat a little. Bigger skills come in the next steps.', lang: 'en' };
    }
    // Honest fallback: Nimo heard it but has no brain for it yet.
    return tamil
      ? { text: 'நீங்க சொன்னது கேட்டுச்சு. இதுக்கு பதில் அடுத்த step-ல வரும்.', lang: 'ta' }
      : { text: "I heard you, but I can't answer that yet. That comes in the next step.", lang: 'en' };
  }

  var api = { reply: reply, wakeAck: wakeAck, isTamilScript: isTamilScript };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NimoBrain = api;
})(this);
