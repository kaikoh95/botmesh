# Voice Input Feature — Implementation Spec

> Add a mic button to the existing Scarlet instruction box so visitors can speak commands instead of typing.

## Current State

The UI has an `#oracle-inbox` div at the bottom of the page with:
- `#oracle-input` — text input, placeholder "Send instruction to Scarlet..."
- `#oracle-send` — submit button (⚡ Send)
- On submit: POSTs `{ message, from: "ui" }` to `https://api.kurokimachi.com/inbox`

## Proposed Change

Add a 🎤 mic button next to the send button. When pressed:
1. Start listening via Web Speech API
2. Show visual feedback (pulsing red dot, input placeholder changes to "Listening...")
3. On speech end → fill `#oracle-input` with recognized text
4. User can review/edit, then hit Send as normal (or auto-send after 1.5s silence)

## Web Speech API — Key Details

### API Surface

```javascript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();

recognition.continuous = false;      // Stop after one phrase
recognition.interimResults = true;   // Show partial results while speaking
recognition.lang = 'en-US';         // Default; could auto-detect

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  const isFinal = event.results[0].isFinal;
  // Update input with transcript
};

recognition.onerror = (event) => {
  // Handle: 'not-allowed', 'no-speech', 'network', 'aborted'
};

recognition.onend = () => {
  // Reset UI state
};

recognition.start();
```

### Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome (desktop) | ✅ Full | Best support, uses Google cloud STT |
| Chrome (Android) | ✅ Full | Works well |
| Edge | ✅ Full | Chromium-based, same as Chrome |
| Safari (macOS 14.1+) | ✅ | Added in Safari 14.1, uses on-device |
| Safari (iOS 14.5+) | ✅ | Works but requires user gesture to start |
| Firefox | ❌ None | No support, no plans announced |
| Opera | ✅ | Chromium-based |

**Coverage**: ~85% of web users. Firefox users get the mic button hidden via feature detection.

### Permissions

- First use triggers browser microphone permission prompt
- HTTPS required (kurokimachi.com already uses HTTPS ✅)
- No server-side processing needed — all happens in browser

## UI Design

### HTML Addition

```html
<div id="oracle-inbox">
  <input id="oracle-input" type="text" placeholder="Send instruction to Scarlet..." maxlength="300" autocomplete="off" />
  <button id="oracle-mic" title="Voice input" aria-label="Voice input">🎤</button>
  <button id="oracle-send">⚡ Send</button>
</div>
```

### CSS

```css
#oracle-mic {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.6;
  transition: opacity 0.2s;
}
#oracle-mic:hover { opacity: 1; }
#oracle-mic.listening {
  opacity: 1;
  animation: pulse-red 1s infinite;
}
#oracle-mic.unsupported { display: none; }

@keyframes pulse-red {
  0%, 100% { filter: none; }
  50% { filter: drop-shadow(0 0 6px #e74c3c); }
}
```

### Visual States

1. **Idle** — 🎤 button at 60% opacity
2. **Listening** — 🎤 pulses red, input placeholder → "Listening...", interim text fills input in italic
3. **Processing** — brief pause after speech ends, transcript becomes solid text
4. **Error** — tooltip/flash "Mic not available" or "No speech detected", reset to idle

## Implementation Outline

```javascript
(function() {
  const input = document.getElementById('oracle-input');
  const micBtn = document.getElementById('oracle-mic');
  const sendBtn = document.getElementById('oracle-send');
  
  // Feature detection
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition || !micBtn) {
    if (micBtn) micBtn.classList.add('unsupported');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  let listening = false;
  const originalPlaceholder = input.placeholder;

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
      return;
    }
    input.value = '';
    input.placeholder = 'Listening...';
    micBtn.classList.add('listening');
    listening = true;
    recognition.start();
  });

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = transcript;
    
    // If final result, auto-send after brief delay
    if (event.results[event.results.length - 1].isFinal) {
      setTimeout(() => {
        if (input.value.trim()) {
          sendBtn.click(); // Reuse existing send logic
        }
      }, 800); // 800ms delay so user can see what was recognized
    }
  };

  recognition.onerror = (event) => {
    console.warn('[Voice] error:', event.error);
    resetMic();
    if (event.error === 'not-allowed') {
      input.placeholder = 'Mic permission denied';
      setTimeout(() => { input.placeholder = originalPlaceholder; }, 3000);
    }
  };

  recognition.onend = () => {
    resetMic();
  };

  function resetMic() {
    listening = false;
    micBtn.classList.remove('listening');
    input.placeholder = originalPlaceholder;
  }
})();
```

## Integration with Existing Endpoint

No backend changes needed. The voice transcript fills the same `#oracle-input` text box and triggers the same `sendBtn.click()` → POST to `/inbox`. The existing flow handles it.

## Edge Cases

| Case | Handling |
|------|----------|
| No mic permission | Show "Mic permission denied" in placeholder, reset after 3s |
| No speech detected | `onerror` with 'no-speech', silent reset |
| Firefox/unsupported | Hide mic button entirely via `.unsupported` class |
| User clicks mic then types | `recognition.stop()` on input focus, fall back to typing |
| Mobile keyboard overlap | Mic avoids keyboard entirely — good UX win on mobile |
| Multiple rapid clicks | Guard with `listening` flag |

## CSP Update Required

Current CSP in `index.html` does not need changes for Web Speech API — it's a browser-native API, no external scripts or connections needed from our end (Chrome handles the Google STT connection internally outside CSP scope).

## Testing Plan

1. Chrome desktop — full flow: click mic → speak → see transcript → auto-send
2. Safari desktop — same flow, verify on-device STT works
3. Chrome Android — verify permission prompt, full flow
4. iOS Safari — verify user gesture requirement is met (click = gesture ✅)
5. Firefox — verify mic button is hidden
6. Verify existing text input still works unchanged

## Effort Estimate

- **Implementation**: ~1 hour (HTML + CSS + JS, all in index.html)
- **Testing**: ~30 min across browsers
- **Risk**: Low — additive feature, no changes to existing functionality
