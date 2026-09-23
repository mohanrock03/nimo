/* Nimo - wake word matcher (pure logic, no browser APIs).
   Works in the browser (window.NimoWake) and in Node (module.exports). */
(function (root) {
  'use strict';

  // Ways a speech recognizer commonly writes "nimo".
  var NIMO_LATIN = ['nimo', 'nemo', 'neemo', 'nimmo', 'nemmo', 'nimoh', 'neemoh', 'nimow', 'nimou', 'nimoo', 'neemu', 'nimu'];
  var NIMO_TAMIL = ['நிமோ', 'நீமோ', 'நிமொ', 'நீமொ', 'நிம்மோ', 'நிமோவ்', 'நிமோ'];
  // Words that are one letter away from "nimo" but are real words - never treat as the wake word.
  var NEAR_MISS_BLOCK = ['nine', 'name', 'nima', 'nino', 'nina', 'none', 'note', 'mode', 'more', 'memo', 'demo', 'limo', 'nice', 'nimbus'];
  var PREFIXES = ['hey', 'hi', 'hai', 'hay', 'ok', 'okay', 'hello', 'yo', 'ஹே', 'ஹாய்', 'ஏய்', 'ஹலோ'];
  var BUDDY = ['buddy', 'budy', 'buddie', 'buddi', 'baddy', 'bady', 'body', 'பட்டி', 'படி', 'பட்டீ'];

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[.,!?;:"'()\[\]{}\-_/\\]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    var n = normalize(text);
    return n ? n.split(' ') : [];
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function isNimo(token) {
    if (NIMO_LATIN.indexOf(token) >= 0 || NIMO_TAMIL.indexOf(token) >= 0) return true;
    if (NEAR_MISS_BLOCK.indexOf(token) >= 0) return false;
    // Loose match: starts with "n", 4-6 letters, one edit away from "nimo" or "nemo".
    if (/^n[a-z]{3,5}$/.test(token) && (levenshtein(token, 'nimo') <= 1 || levenshtein(token, 'nemo') <= 1)) return true;
    return false;
  }

  /**
   * Find the wake phrase in a transcript.
   * Returns null, or { phrase, variant, index, command } where command is the text spoken after the wake phrase.
   */
  function detect(text) {
    var tokens = tokenize(text);
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var hasPrefix = i > 0 && PREFIXES.indexOf(tokens[i - 1]) >= 0;
      if (isNimo(t)) {
        var start = hasPrefix ? i - 1 : i;
        return {
          phrase: hasPrefix ? 'hey nimo' : 'nimo',
          variant: tokens.slice(start, i + 1).join(' '),
          index: start,
          command: tokens.slice(i + 1).join(' ')
        };
      }
      // "buddy" alone is too common in normal talk, so it needs "hey"/"hi" in front.
      if (hasPrefix && BUDDY.indexOf(t) >= 0) {
        return {
          phrase: 'hey buddy',
          variant: tokens[i - 1] + ' ' + t,
          index: i - 1,
          command: tokens.slice(i + 1).join(' ')
        };
      }
    }
    return null;
  }

  // Rough text similarity (0-1), used to drop Nimo's own voice if the mic picks it up.
  function similarity(a, b) {
    a = normalize(a); b = normalize(b);
    if (!a || !b) return 0;
    var longer = a.length >= b.length ? a : b, shorter = a.length >= b.length ? b : a;
    if (longer.indexOf(shorter) >= 0) return shorter.length / longer.length + 0.3;
    return 1 - levenshtein(a, b) / longer.length;
  }

  var api = { detect: detect, normalize: normalize, tokenize: tokenize, isNimo: isNimo, levenshtein: levenshtein, similarity: similarity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NimoWake = api;
})(this);
