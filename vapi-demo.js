/*
 * CC AI SOLUTIONS – connects the existing Interactive Demo mic button to the
 * live Vapi assistant using the official Vapi Web SDK (@vapi-ai/web).
 *
 * - The SDK module is downloaded quietly after the page loads (no call, no
 *   microphone), so a click can call vapi.start() straight away, inside the
 *   visitor's click gesture.
 * - The microphone is requested once, by Vapi itself, when the call starts.
 * - The conversation is entirely handled by the Vapi assistant; this file only
 *   opens/closes the audio session and shows its state and transcript.
 * Uses the PUBLIC key from config.js. No private keys, ever.
 */
(function () {
  'use strict';

  // Pinned SDK version, loaded from the jsDelivr CDN as an ES module.
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.7.1/+esm';
  var CONNECT_TIMEOUT_MS = 20000;

  var btn = document.getElementById('cc-voice-btn');
  var statusEl = document.getElementById('cc-voice-status');
  if (!btn || !statusEl) return;

  var cfg = window.CC_VAPI_CONFIG || {};
  var timeout = cfg.connectTimeoutMs || CONNECT_TIMEOUT_MS;
  var LOCAL_URL = 'http://localhost:8080';

  var TEXT = {
    idle: statusEl.textContent,
    connecting: 'Connecting to the assistant…',
    active: 'Connected. Start talking – click the mic again to end the call.',
    ending: 'Ending the call…',
    ended: 'Call ended. Click the mic to talk again.',
    notConfigured: 'The voice demo isn’t available right now. Please try again later.',
    unsupported: 'Your browser doesn’t support voice calls. Please try the latest Chrome, Edge, Safari or Firefox.',
    insecure: 'The voice demo needs a secure (https) page.',
    fileUrl: 'Browsers block the microphone on files opened directly. Double-click start-website.bat and use ' + LOCAL_URL + '.',
    embedded: 'This preview window can’t use your microphone. Open the site in a normal Chrome or Edge tab.',
    micBlocked: 'Microphone access is blocked. Click the icon left of the address bar, set Microphone to Allow, then click the mic again.',
    windowsBlocked: 'Windows is blocking the microphone. Open Settings > Privacy & security > Microphone, allow access for apps and desktop apps, then try again.',
    noMic: 'No microphone was found. Connect a microphone, then click the mic to try again.',
    micBusy: 'Your microphone is being used by another app. Close it, then click the mic to try again.',
    loadFailed: 'We couldn’t load the voice demo. Check your internet connection and click the mic to try again.',
    timeout: 'The assistant took too long to connect. Click the mic to try again.',
    audioBlocked: 'Your browser blocked the assistant’s audio. Click the mic to try again.',
    failed: 'Something went wrong with the voice call. Click the mic to try again.'
  };

  var LABEL = {
    idle: 'Start talking to the AI agent',
    connecting: 'Connecting to the AI agent',
    active: 'End the call',
    ending: 'Ending the call'
  };

  /* ---------- Live transcript in the existing message area ----------
   * The two sample bubbles are used only as style templates (caller bubble on
   * the left, assistant bubble on the right), so live messages look identical.
   * The samples stay on screen until a real call connects. */
  var transcriptBox = document.getElementById('cc-voice-transcript');
  var bubbleTpl = null;
  if (transcriptBox && transcriptBox.children.length >= 2) {
    bubbleTpl = {
      user: transcriptBox.children[0].cloneNode(false),
      assistant: transcriptBox.children[1].cloneNode(false)
    };
  }
  var openBubble = { user: null, assistant: null }; // bubble still receiving partials
  var TRANSCRIPT_MAX_HEIGHT = '220px';

  function resetTranscript() {
    if (!transcriptBox || !bubbleTpl) return;
    transcriptBox.textContent = '';
    openBubble.user = null;
    openBubble.assistant = null;
    // Long conversations scroll inside the card instead of stretching the page.
    transcriptBox.style.maxHeight = TRANSCRIPT_MAX_HEIGHT;
    transcriptBox.style.overflowY = 'auto';
  }

  function onTranscript(msg) {
    if (!bubbleTpl || state !== 'active') return;         // no updates once the call ends
    if (!msg || msg.type !== 'transcript') return;
    var role = msg.role === 'user' ? 'user' : (msg.role === 'assistant' ? 'assistant' : null);
    var text = (msg.transcript || '').trim();
    if (!role || !text) return;
    var bubble = openBubble[role];
    if (!bubble) {                                         // first piece of a new utterance
      bubble = bubbleTpl[role].cloneNode(false);
      transcriptBox.appendChild(bubble);
    }
    bubble.textContent = text;                             // partials replace, never append
    openBubble[role] = msg.transcriptType === 'final' ? null : bubble;
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
  }

  /* ---------- Button state ---------- */
  var micIcon = btn.querySelector('[data-cc-voice-icon="mic"]');
  var stopIcon = btn.querySelector('[data-cc-voice-icon="stop"]');

  var state = 'idle';     // idle | connecting | active | ending
  var VapiClass = null;
  var vapi = null;
  var sdkPromise = null;
  var connectTimer = 0;
  var attempt = 0;        // ignores late events from an abandoned attempt
  var levelRaf = 0, pendingLevel = 0;

  // SVG elements have no .hidden property, so toggle the attribute directly.
  function showEl(el, show) {
    if (!el) return;
    if (show) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
  }

  function setState(next, message) {
    state = next;
    btn.setAttribute('data-state', next);
    btn.setAttribute('aria-label', LABEL[next] || LABEL.idle);
    btn.setAttribute('aria-busy', next === 'connecting' || next === 'ending' ? 'true' : 'false');
    var live = next === 'active';
    showEl(micIcon, !live);
    showEl(stopIcon, live);
    if (!live) btn.style.removeProperty('--cc-level');
    statusEl.textContent = message || TEXT[next] || TEXT.idle;
  }

  function clearConnectTimer() {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = 0; }
  }

  function configured() {
    var key = (cfg.publicKey || '').trim();
    return key && key.indexOf('PASTE_') !== 0 && (cfg.assistantId || '').trim();
  }

  function isEmbedded() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  /* ---------- Microphone diagnosis (never calls getUserMedia) ----------
   * Finds the browser's media error inside whatever Vapi reports, then works
   * out the cause:  (a) file:// page,  embedded preview,  (b) blocked in the
   * browser,  (c) Windows privacy setting or no microphone. */
  function findMediaError(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 4) return null;
    var name = obj.name || obj.errorName || '';
    var message = String(obj.message || obj.errorMsg || obj.msg || '');
    if (/^(NotAllowedError|NotFoundError|NotReadableError|SecurityError|OverconstrainedError|AbortError)$/.test(name)) {
      return { name: name, message: message };
    }
    if (/permission denied|not allowed|NotAllowedError/i.test(message)) return { name: 'NotAllowedError', message: message };
    if (/requested device not found|NotFoundError|no (audio|microphone)/i.test(message)) return { name: 'NotFoundError', message: message };
    if (/could not start (audio|microphone)|NotReadableError|in use/i.test(message)) return { name: 'NotReadableError', message: message };
    var keys = ['error', 'errorMsg', 'cause', 'details', 'originalError'];
    for (var i = 0; i < keys.length; i++) {
      var inner = obj[keys[i]];
      var found = typeof inner === 'string' ? findMediaError({ message: inner }, depth + 1) : findMediaError(inner, depth + 1);
      if (found) return found;
    }
    return null;
  }

  function micPermissionState() {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('unknown');
    return navigator.permissions.query({ name: 'microphone' })
      .then(function (s) { return s.state; }, function () { return 'unknown'; });
  }

  function hasMicDevice() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve(true);
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      return list.some(function (d) { return d.kind === 'audioinput'; });
    }, function () { return true; });
  }

  // Resolves { cause, text } for a microphone problem, or null if none found.
  function diagnose(mediaErr) {
    if (location.protocol === 'file:') return Promise.resolve({ cause: '(a) opened via file:// instead of ' + LOCAL_URL, text: TEXT.fileUrl });
    if (isEmbedded()) return Promise.resolve({ cause: 'page is inside an embedded preview/iframe without microphone access', text: TEXT.embedded });
    return Promise.all([micPermissionState(), hasMicDevice()]).then(function (r) {
      var perm = r[0], hasMic = r[1];
      if (perm === 'denied') return { cause: '(b) microphone set to "Block" for this site in the browser', text: TEXT.micBlocked };
      if (!hasMic) return { cause: '(c) no microphone input device found by Windows', text: TEXT.noMic };
      if (!mediaErr) return null;
      if (mediaErr.name === 'NotFoundError' || mediaErr.name === 'OverconstrainedError') {
        return { cause: '(c) no usable microphone input device', text: TEXT.noMic };
      }
      if (mediaErr.name === 'NotReadableError' || mediaErr.name === 'AbortError') {
        return { cause: 'microphone is in use by another app or failed to start', text: TEXT.micBusy };
      }
      // NotAllowed while the browser itself allows the site: Windows is blocking it.
      if (/system/i.test(mediaErr.message) || perm === 'granted') {
        return { cause: '(c) Windows Microphone Privacy is blocking the browser', text: TEXT.windowsBlocked };
      }
      return { cause: '(b) microphone permission was dismissed or blocked in the browser', text: TEXT.micBlocked };
    });
  }

  function fail(fallbackText, detail) {
    clearConnectTimer();
    var wasLive = state === 'connecting' || state === 'active';
    attempt++;
    var mediaErr = findMediaError(detail, 0) ||
      (detail && /^Not\w+Error$/.test(detail.name || '') ? { name: detail.name, message: detail.message || '' } : null);
    setState('idle', fallbackText);
    if (wasLive && vapi) { try { vapi.stop(); } catch (e) { /* already closed */ } }
    var shown = attempt;
    diagnose(mediaErr).then(function (d) {
      if (mediaErr) console.error('[CC voice demo] ' + mediaErr.name + ': ' + (mediaErr.message || '(no message)') + (d ? ' → cause: ' + d.cause : ''));
      else if (detail) console.error('[CC voice demo]', detail);
      if (d && shown === attempt && state === 'idle') statusEl.textContent = d.text;
    });
  }

  /* ---------- SDK loading (no call, no microphone) ---------- */
  var loadAttempts = 0;
  function loadSdk() {
    if (VapiClass) return Promise.resolve(VapiClass);
    if (!sdkPromise) {
      // Browsers cache a failed module import, so a retry needs a fresh URL.
      var url = loadAttempts++ ? SDK_URL + '?retry=' + loadAttempts : SDK_URL;
      sdkPromise = import(url).then(function (mod) {
        var V = mod && mod.default;
        if (V && typeof V !== 'function' && typeof V.default === 'function') V = V.default;
        if (typeof V !== 'function' && mod && typeof mod.Vapi === 'function') V = mod.Vapi;
        if (typeof V !== 'function') throw new Error('Vapi SDK export not found');
        VapiClass = V;
        return V;
      });
      sdkPromise.catch(function () { sdkPromise = null; }); // allow a retry
    }
    return sdkPromise;
  }

  function attachEvents(instance) {
    instance.on('call-start', function () {
      if (state !== 'connecting') return;
      clearConnectTimer();
      resetTranscript();
      setState('active');
    });
    instance.on('message', onTranscript);
    instance.on('call-end', function () {
      clearConnectTimer();
      if (state === 'active' || state === 'ending') setState('idle', TEXT.ended);
      else if (state === 'connecting') fail(TEXT.failed, null);
    });
    instance.on('volume-level', function (level) {
      if (state !== 'active') return;
      pendingLevel = Math.max(0, Math.min(1, Number(level) || 0));
      if (levelRaf) return;
      levelRaf = requestAnimationFrame(function () {
        levelRaf = 0;
        if (state === 'active') btn.style.setProperty('--cc-level', pendingLevel.toFixed(3));
      });
    });
    instance.on('error', function (err) {
      if (state === 'idle') return;
      var type = err && (err.type || (err.error && err.error.type));
      fail(type === 'audio-start-failed' ? TEXT.audioBlocked : TEXT.failed, err);
    });
  }

  // Calls vapi.start(). When the SDK is already loaded this runs synchronously
  // inside the click, so the browser treats it as a direct user gesture.
  function startCall(V, my) {
    if (my !== attempt || state !== 'connecting') return;
    if (!vapi) { vapi = new V(cfg.publicKey.trim()); attachEvents(vapi); }
    var result;
    try { result = vapi.start(cfg.assistantId.trim()); }
    catch (err) { fail(TEXT.failed, err); return; }
    Promise.resolve(result).then(function (call) {
      // start() resolves to null when the call could not be created. Vapi's
      // 'error' event carries the reason, so give it a moment to arrive first.
      if (call === null) {
        setTimeout(function () {
          if (my === attempt && state === 'connecting') fail(TEXT.failed, null);
        }, 600);
      }
    }, function (err) {
      if (my === attempt && state === 'connecting') fail(TEXT.failed, err);
    });
  }

  function start() {
    if (!configured()) {
      console.warn('[CC voice demo] No Vapi public key found. This copy of the site has an empty config.js – use the latest download.');
      setState('idle', TEXT.notConfigured);
      return;
    }
    if (location.protocol !== 'file:' && !window.isSecureContext) {
      console.error('[CC voice demo] Not a secure context → cause: ' + (isEmbedded() ? 'page is inside an embedded preview/iframe' : 'page is not served over https or http://localhost'));
      setState('idle', isEmbedded() ? TEXT.embedded : TEXT.insecure);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) {
      setState('idle', location.protocol === 'file:' ? TEXT.fileUrl : TEXT.unsupported);
      return;
    }

    var my = ++attempt;
    setState('connecting');
    connectTimer = setTimeout(function () {
      if (my === attempt && state === 'connecting') fail(TEXT.timeout, null);
    }, timeout);

    if (VapiClass) { startCall(VapiClass, my); return; }   // normal case: still inside the click
    loadSdk().then(function (V) { startCall(V, my); }, function (err) {
      if (my === attempt) fail(TEXT.loadFailed, err);
    });
  }

  function stop() {
    setState('ending');
    clearConnectTimer();
    try { vapi.stop(); } catch (e) { setState('idle', TEXT.ended); return; }
    // Safety net if no call-end event arrives.
    setTimeout(function () { if (state === 'ending') setState('idle', TEXT.ended); }, 4000);
  }

  btn.addEventListener('click', function () {
    if (state === 'idle') start();
    else if (state === 'active') stop();
    // connecting / ending: ignore extra clicks (no duplicate sessions)
  });

  // Download the SDK quietly once the page has loaded: no call, no microphone.
  function preload() { if (configured()) loadSdk().catch(function () { /* retried on click */ }); }
  if (document.readyState === 'complete') setTimeout(preload, 0);
  else window.addEventListener('load', function () { setTimeout(preload, 0); });

  // Close the session if the visitor leaves the page.
  window.addEventListener('pagehide', function () {
    if (vapi && (state === 'active' || state === 'connecting')) { try { vapi.stop(); } catch (e) { /* ignore */ } }
  });
})();
