# Nimo - Step 1: orb UI + wake word

A voice assistant page: black screen, glowing cyan wireframe/particle orb (like the reference video).
Say **"Hey Nimo"**, **"Nimo"** or **"Hey Buddy"** and it wakes up and answers - one side talking at a time.

## Run it (Windows)
1. Unzip the folder.
2. Double-click `start-windows.bat`. It opens http://localhost:8765 (needs Python, free; Node.js also works).
3. Use **Google Chrome** or **Microsoft Edge**. Click **Start Nimo** and allow the microphone.
4. Say "Hey Nimo, what time is it?"

Mac/Linux: `sh start-mac-linux.sh`. Or any static server in this folder, e.g. `python -m http.server 8765`.
Use `localhost` (not a LAN IP) - browsers only allow the mic on localhost or HTTPS.

## Try saying
- "Hey Nimo" -> "Yes boss, sollunga. I am listening." then ask your question
- "Hey Nimo, what time is it?" / "Nimo, enna time?" / "Hey buddy, what's the date today?"
- "Nimo, eppadi irukka?" / "What is your name?" / "Thank you" / "Go to sleep"
- Switch the top-right selector to தமிழ் and say "ஹே நிமோ, நேரம் என்ன?"

After it answers it keeps listening for 8 seconds for a follow-up (no wake word needed), then goes back to sleep.
Tap the orb while Nimo is talking to cut it off.

## How "no overlap" works
1. Nimo only replies after you finish: it waits for the browser's final transcript plus 0.7 s of silence. If you keep talking, it keeps waiting.
2. The microphone is switched OFF before Nimo speaks (watch the MIC ON/OFF badge), so it never hears itself or talks over you.
3. After speaking it waits 0.35 s, then reopens the mic. Anything matching its own last sentence in the next 2.5 s is dropped (speaker echo guard).
Trade-off: you can't interrupt by voice while Nimo is talking (tap the orb instead). Voice barge-in needs echo-cancelled audio + a local model - later step.

## Honest limits (step 1)
- **Speech recognition = browser's Web Speech API.** Free, no key, no account. In Chrome the audio is sent to Google's speech service (Edge: Microsoft's), so it needs internet and is not private/offline. Works in Chrome and Edge on desktop and in Chrome on Android. Not Firefox. iPhone cannot do the voice part.
- **Android mic sharing.** On Android, Google's speech service cannot record while the page itself holds the mic, so on phones the orb's volume meter is switched off and the orb pulses from the speech service's own "voice heard" events instead. Desktop keeps the real volume meter. If a device still clashes (e.g. Android Chrome in "desktop site" mode), Nimo frees the mic automatically and remembers it. Overrides for testing: add `?meter=off` or `?meter=on` to the URL.
- **Wake word accuracy:** the recognizer doesn't know the word "Nimo", so it often writes "Nemo", "Neemo", "Nimmo". The matcher accepts those and similar spellings, but blocks look-alikes like "demo", "memo", "nine", "name". "Buddy" alone is ignored; it needs "hey/hi buddy". Expect some misses in noisy rooms and occasional false wakes. Speak clearly and a little slower on "Nimo".
- **Wake speed:** usually ~0.5-1.5 s, depending on the internet and Google's service.
- **Tamil / Tanglish:** English/Tanglish mode (en-IN) understands Tanglish written in English letters, e.g. "enna time", "eppadi irukka". Tamil mode (ta-IN) returns Tamil script and Nimo replies in Tamil script. Speaking Tamil aloud needs a Tamil voice installed on the computer (Windows: Settings > Time & language > Language > add Tamil with speech). If none is installed, the Tamil reply is shown on screen. The browser listens in one language at a time - true mixed Tanglish understanding comes with the AI step.
- **Answers are simple rules, not AI yet:** wake-up acknowledgement, time, date, name, how are you, thanks, hello, go to sleep. Anything else gets an honest "I can't answer that yet". Real conversation (an LLM) is the next step.
- **Always listening** keeps the mic on and streams audio to Google/Microsoft while the page is running. Press Stop when you're done.

## Cost
Rs 0. No API keys, no accounts, no paid services. All code is plain HTML/CSS/JavaScript with no libraries or CDN.

## Tests
`node tests/run-tests.js` - 77 automated tests (wake word, Tanglish/Tamil replies, and turn-taking with a fake mic/voice/clock: never speaks while the mic is open, waits for you to finish, echo guard, follow-up window, sleep, tap-to-interrupt, auto-restart) plus mic-sharing: phone/desktop meter policy, full mic release, starved-mic detection and a simulated Android mic clash).

## Files
- `index.html`, `style.css` - page
- `js/orb.js` - the orb animation (canvas, reacts to your voice level and Nimo's state)
- `js/wake.js` - wake word matcher
- `js/assistant.js` - listen / wait / answer state machine (the no-overlap logic)
- `js/brain.js` - step 1 replies
- `js/mic.js` - decides when the orb may open its own mic (never on Android) and releases it on a clash
- `js/app.js` - connects the browser mic and voice
