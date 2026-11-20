(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;

  var widgetId = script.getAttribute("data-widget-id");
  var assistantId = script.getAttribute("data-assistant-id");
  if (!widgetId) return;

  var baseUrl = script.src ? new URL(script.src).origin : window.location.origin;
  var host = document.createElement("div");
  host.id = "ai-widget-host-" + widgetId;
  host.setAttribute("data-assistant-id", assistantId || "");
  document.documentElement.appendChild(host);

  var shadow = host.attachShadow({ mode: "closed" });
  var style = document.createElement("style");
  style.textContent = [
    ":host{all:initial}.ai-widget,.ai-widget *{box-sizing:border-box;font-family:Arial,sans-serif}",
    ".ai-widget{position:fixed;z-index:2147483000;color:#1f2937;font-size:14px}",
    ".ai-widget.bottom-left{left:20px;bottom:20px}.ai-widget.bottom-right{right:20px;bottom:20px}",
    ".ai-button{width:56px;height:56px;border:0;border-radius:50%;color:#fff;font-size:16px;font-weight:700;box-shadow:0 8px 28px #0003;cursor:pointer}",
    ".ai-panel{display:flex;flex-direction:column;width:360px;height:520px;max-height:calc(100vh - 100px);background:#fff;border:1px solid #dfe3ea;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px #0003}",
    ".ai-header{min-height:54px;padding:12px 15px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:12px}",
    ".ai-header strong{font-size:15px;line-height:1.3}.ai-header button{width:30px;height:30px;border:0;border-radius:8px;background:#ffffff20;color:inherit;cursor:pointer;font-size:20px}",
    ".ai-messages{flex:1;overflow:auto;padding:14px;background:#f8f9fc}",
    ".ai-message{max-width:84%;margin:8px 0;padding:10px 12px;border-radius:13px;font-size:13px;line-height:1.45;overflow-wrap:anywhere;white-space:pre-wrap}",
    ".ai-message.user{margin-left:auto;background:#ecebff;color:#37336b}.ai-message.assistant{background:#fff;border:1px solid #e8ebf2;color:#3f4a5e;box-shadow:0 2px 6px #1f29370a}",
    ".ai-status{min-height:18px;margin:0;padding:3px 12px;color:#667085;background:#f8f9fc;font-size:11px;line-height:1.4}",
    ".ai-status.error{color:#b42318}.ai-voice-note{margin:0;padding:0 12px 8px;color:#7a8495;background:#f8f9fc;font-size:10px}",
    ".ai-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}",
    ".ai-form input{flex:1;min-width:0;height:40px;border:1px solid #d1d5db;border-radius:10px;padding:0 11px;font-size:13px;outline:none}",
    ".ai-form input:focus{border-color:#8b7cf6;box-shadow:0 0 0 3px #8b7cf622}.ai-form button,.ai-voice{min-height:38px;border:0;border-radius:10px;color:#fff;padding:0 13px;font-size:12px;font-weight:700;cursor:pointer}",
    ".ai-form button:disabled,.ai-voice:disabled{opacity:.55;cursor:wait}.ai-voice-row{display:flex;align-items:center;gap:8px;padding:0 10px 10px;background:#fff}",
    ".ai-voice{background:#344054}.ai-voice[aria-pressed=true]{background:#b42318}.ai-voice-note{line-height:1.4}",
    ".ai-audio{display:none}.ai-widget [hidden]{display:none!important}",
    "@media(max-width:480px){.ai-panel{position:fixed;inset:0;width:100vw;height:100dvh;max-height:none;border:0;border-radius:0}.ai-widget.bottom-left,.ai-widget.bottom-right{left:0;right:0;bottom:0}}",
  ].join("");
  shadow.appendChild(style);

  var root = document.createElement("div");
  shadow.appendChild(root);

  fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId), {
    headers: { Accept: "application/json" },
  })
    .then(readResponse)
    .then(function (result) {
      if (!result.response.ok) {
        throw new Error(result.body.message || "Widget unavailable.");
      }

      var config = result.body;
      var position = config.position === "bottom-left" ? "bottom-left" : "bottom-right";
      root.innerHTML =
        '<div class="ai-widget ' + position + '">' +
        '<button class="ai-button" aria-label="Open chat" style="background:' + config.buttonColor + '">Chat</button>' +
        '<section class="ai-panel" aria-label="' + escapeHtml(config.title) + '" ' + (config.initialOpen ? "" : "hidden") + '>' +
        '<header class="ai-header" style="background:' + config.primaryColor + '"><strong>' + escapeHtml(config.title) + '</strong><button class="ai-close" type="button" aria-label="Close chat">×</button></header>' +
        '<div class="ai-messages" role="log" aria-live="polite"><div class="ai-message assistant">' + escapeHtml(config.welcomeMessage || "How can I help?") + "</div></div>" +
        '<p class="ai-status" role="status" aria-live="polite"></p>' +
        (config.voiceEnabled ? '<p class="ai-voice-note">Voice chat can also be used for intake. Details are saved only after you consent and confirm.</p>' : "") +
        (config.textEnabled
          ? '<form class="ai-form"><input aria-label="Message" maxlength="4000" placeholder="Type a message..." required><button type="submit" style="background:' + config.primaryColor + '">Send</button></form>'
          : "") +
        (config.voiceEnabled
          ? '<div class="ai-voice-row"><button class="ai-voice" type="button" aria-pressed="false">Start voice chat</button></div>'
          : "") +
        '<audio class="ai-audio" autoplay playsinline></audio>' +
        "</section></div>";

      var panel = root.querySelector(".ai-panel");
      var openButton = root.querySelector(".ai-button");
      var closeButton = root.querySelector(".ai-close");
      var messages = root.querySelector(".ai-messages");
      var status = root.querySelector(".ai-status");
      var form = root.querySelector(".ai-form");
      var input = form && form.querySelector("input");
      var sendButton = form && form.querySelector('button[type="submit"]');
      var voiceButton = root.querySelector(".ai-voice");
      var remoteAudio = root.querySelector(".ai-audio");
      var sessionToken = "";
      var sessionPromise = null;
      var voicePeer = null;
      var voiceEvents = null;
      var microphoneStream = null;
      var voiceSessionToken = "";
      var voiceStarting = false;
      var voiceActive = false;
      var voiceCancelled = false;
      var voiceSessionReady = false;
      var voiceGreetingSent = false;
      var voiceSessionCreated = false;
      var voiceSessionUpdateSent = false;
      var voiceSessionConfig = null;
      var sending = false;
      var processingVoiceTranscript = false;
      var voiceTranscriptQueue = [];
      var processedVoiceItems = Object.create(null);
      var lastAssistantReply = config.welcomeMessage || "How can I help you today?";

      function setStatus(message, isError) {
        status.textContent = message || "";
        status.classList.toggle("error", Boolean(isError));
      }

      function setTextDisabled(disabled) {
        if (input) input.disabled = disabled || sending;
        if (sendButton) sendButton.disabled = disabled || sending;
      }

      openButton.addEventListener("click", function () {
        panel.hidden = false;
        openButton.hidden = true;
        ensureSession().catch(function (error) {
          setStatus(error.message || "Could not start chat.", true);
        });
      });

      closeButton.addEventListener("click", function () {
        panel.hidden = true;
        openButton.hidden = false;
        if (voicePeer || voiceStarting) stopVoice();
      });

      function ensureSession() {
        if (sessionToken) return Promise.resolve(sessionToken);
        if (sessionPromise) return sessionPromise;
        sessionPromise = fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId) + "/sessions", {
          method: "POST",
        })
          .then(readResponse)
          .then(function (result) {
            if (!result.response.ok) {
              throw new Error(result.body.message || "Could not start chat.");
            }
            sessionToken = result.body.sessionToken;
            if (result.body.firstPrompt) {
              lastAssistantReply = result.body.firstPrompt;
              appendMessage(messages, "assistant", lastAssistantReply);
            }
            return sessionToken;
          })
          .catch(function (error) {
            sessionPromise = null;
            throw error;
          });
        return sessionPromise;
      }

      if (form) {
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          if (sending || voiceStarting || voiceActive) return;
          var text = input.value.trim();
          if (!text) return;

          submitMessage(text, false)
            .then(function () {
              input.value = "";
            })
            .catch(function () {});
        });
      }

      function submitMessage(text, fromVoice) {
        if (sending) return Promise.reject(new Error("A message is already being processed."));
        sending = true;
        setTextDisabled(true);
        setStatus(fromVoice ? "Processing what you said..." : "Sending message...");
        appendMessage(messages, "user", text);

        return ensureSession()
            .then(function (token) {
              return fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId) + "/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Widget-Session": token },
                body: JSON.stringify({ content: text, idempotencyKey: createIdempotencyKey() }),
              });
            })
            .then(readResponse)
            .then(function (result) {
              if (!result.response.ok) {
                throw new Error(result.body.message || "Could not send message.");
              }
              lastAssistantReply = result.body.message || "I couldn't generate a reply. Please try again.";
              appendMessage(messages, "assistant", lastAssistantReply);
              setStatus("");
              return lastAssistantReply;
            })
            .catch(function (error) {
              setStatus(error.message || "Could not send message. Please try again.", true);
              throw error;
            })
            .finally(function () {
              sending = false;
              setTextDisabled(voiceStarting || voiceActive);
            });
      }

      function queueVoiceTranscript(transcript) {
        var text = String(transcript || "").trim();
        if (!text || text.length > 4000) return;
        voiceTranscriptQueue.push(text);
        processVoiceTranscriptQueue();
      }

      function processVoiceTranscriptQueue() {
        if (processingVoiceTranscript || sending || !voiceActive || !voiceTranscriptQueue.length) return;
        processingVoiceTranscript = true;
        var transcript = voiceTranscriptQueue.shift();
        submitMessage(transcript, true)
            .then(speakVoiceReply)
            .catch(function () {})
            .finally(function () {
              processingVoiceTranscript = false;
              processVoiceTranscriptQueue();
            });
      }

      function speakVoiceReply(text) {
        if (!voiceEvents || voiceEvents.readyState !== "open" || !voiceSessionReady || !text) return;
        voiceEvents.send(JSON.stringify({
            type: "response.create",
            response: {
              instructions: "Read this exact text aloud. Do not add, remove, or change any words: " + JSON.stringify(text),
              output_modalities: ["audio"],
              max_output_tokens: 512,
            },
        }));
      }

      function speakInitialVoiceReply() {
        if (voiceGreetingSent || voiceCancelled || !voiceSessionReady || !voiceEvents || voiceEvents.readyState !== "open") return;
        voiceGreetingSent = true;
        speakVoiceReply(lastAssistantReply);
      }

      function configureVoiceSession() {
        if (
          voiceSessionUpdateSent ||
          !voiceSessionCreated ||
          !voiceSessionConfig ||
          !voiceEvents ||
          voiceEvents.readyState !== "open"
        ) return;
        voiceSessionUpdateSent = true;
        voiceEvents.send(JSON.stringify({ type: "session.update", session: voiceSessionConfig }));
      }

      if (voiceButton) {
        voiceButton.addEventListener("click", function () {
          if (voiceStarting) return;
          if (voiceActive || voicePeer) {
            stopVoice();
          } else {
            startVoice();
          }
        });
      }

      function startVoice() {
        voiceStarting = true;
        voiceCancelled = false;
        voiceSessionReady = false;
        voiceGreetingSent = false;
        voiceSessionCreated = false;
        voiceSessionUpdateSent = false;
        voiceSessionConfig = null;
        processedVoiceItems = Object.create(null);
        voiceTranscriptQueue = [];
        voiceButton.disabled = true;
        voiceButton.textContent = "Connecting...";
        setTextDisabled(true);
        setStatus("Allow microphone access to start voice chat.");

        var token = "";
        (async function () {
          try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error("Voice chat requires a supported browser and a secure connection.");
            }
            if (!window.RTCPeerConnection) {
              throw new Error("Voice chat is not supported in this browser.");
            }
            microphoneStream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            if (voiceCancelled) throw new Error("Voice chat was cancelled.");

            token = await ensureSession();
            if (voiceCancelled) throw new Error("Voice chat was cancelled.");
            voiceSessionToken = token;
            setStatus("Connecting to voice chat...");

            voicePeer = new RTCPeerConnection();
            voicePeer.addEventListener("track", function (event) {
              remoteAudio.srcObject = event.streams[0];
              remoteAudio.play().catch(function () {
                setStatus("Voice is connected. Tap the page to enable audio playback.");
              });
            });
            voicePeer.addEventListener("connectionstatechange", function () {
              if (voicePeer && voicePeer.connectionState === "connected") {
                voiceActive = true;
                voiceStarting = false;
                voiceButton.disabled = false;
                voiceButton.textContent = "End voice chat";
                voiceButton.setAttribute("aria-pressed", "true");
                setTextDisabled(true);
                setStatus("Finishing voice setup...");
                processVoiceTranscriptQueue();
              } else if (voicePeer && voicePeer.connectionState === "failed") {
                failVoice("Voice connection failed. Check your connection and try again.");
              }
            });

            voiceEvents = voicePeer.createDataChannel("oai-events");
            voiceEvents.addEventListener("open", function () {
              configureVoiceSession();
              speakInitialVoiceReply();
            });
            voiceEvents.addEventListener("message", function (event) {
              var message;
              try {
                message = JSON.parse(event.data);
              } catch {
                setStatus("Received an invalid voice session event.", true);
                return;
              }
              if (message.type === "session.created") {
                voiceSessionCreated = true;
                configureVoiceSession();
              } else if (message.type === "session.updated") {
                voiceSessionReady = true;
                if (microphoneStream) {
                  microphoneStream.getAudioTracks().forEach(function (track) {
                    track.enabled = true;
                  });
                }
                setStatus("Voice chat is connected. Speak naturally, or end the call when finished.");
                speakInitialVoiceReply();
                processVoiceTranscriptQueue();
              }
              if (message.type === "error") {
                failVoice(message.error && message.error.message || "Voice chat encountered an error.");
              } else if (message.type === "conversation.item.input_audio_transcription.completed") {
                if (message.item_id && processedVoiceItems[message.item_id]) return;
                if (message.item_id) processedVoiceItems[message.item_id] = true;
                if (message.transcript) queueVoiceTranscript(message.transcript);
              } else if (message.type === "conversation.item.input_audio_transcription.failed") {
                setStatus("I couldn't understand that. Please try saying it again.", true);
                speakVoiceReply("I couldn't understand that. Please try saying it again.");
              }
            });
            microphoneStream.getAudioTracks().forEach(function (track) {
              track.enabled = false;
              voicePeer.addTrack(track, microphoneStream);
            });

            var offer = await voicePeer.createOffer();
            await voicePeer.setLocalDescription(offer);
            await waitForIceGathering(voicePeer);
            if (voiceCancelled) throw new Error("Voice chat was cancelled.");

            var result = await fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId) + "/voice/session", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Widget-Session": token },
              body: JSON.stringify({ sdp: voicePeer.localDescription.sdp }),
            }).then(readResponse);
            if (!result.response.ok) {
              throw new Error(result.body.message || "Could not start voice chat.");
            }
            if (voiceCancelled) throw new Error("Voice chat was cancelled.");
            if (!result.body.sdp) throw new Error("The voice service returned an invalid answer.");
            if (!result.body.session || result.body.session.type !== "realtime") {
              throw new Error("The voice service returned invalid session settings.");
            }
            voiceSessionConfig = result.body.session;
            configureVoiceSession();
            await voicePeer.setRemoteDescription({ type: "answer", sdp: result.body.sdp });
          } catch (error) {
            releaseVoiceResources();
            voiceSessionToken = "";
            voiceActive = false;
            voiceStarting = false;
            voiceButton.disabled = false;
            voiceButton.textContent = "Start voice chat";
            voiceButton.setAttribute("aria-pressed", "false");
            setTextDisabled(false);
            var message = error.message || "Could not start voice chat.";
            if (token) {
              try {
                await endVoiceSession(token);
              } catch {
                message += " The temporary session could not be closed; refresh the page before retrying.";
              }
            }
            setStatus(message, true);
          }
        })();
      }

      function failVoice(message) {
        voiceCancelled = true;
        var token = voiceSessionToken;
        voiceTranscriptQueue = [];
        releaseVoiceResources();
        voiceSessionToken = "";
        voiceStarting = false;
        voiceActive = false;
        voiceButton.disabled = false;
        voiceButton.textContent = "Start voice chat";
        voiceButton.setAttribute("aria-pressed", "false");
        setTextDisabled(false);
        setStatus(message, true);
        if (token) {
          endVoiceSession(token).catch(function () {
            setStatus(message + " The server could not confirm session cleanup.", true);
          });
        }
      }

      function stopVoice() {
        voiceCancelled = true;
        var token = voiceSessionToken;
        voiceTranscriptQueue = [];
        releaseVoiceResources();
        voiceSessionToken = "";
        voiceStarting = false;
        voiceActive = false;
        voiceButton.disabled = false;
        voiceButton.textContent = "Start voice chat";
        voiceButton.setAttribute("aria-pressed", "false");
        setTextDisabled(false);
        if (!token) {
          setStatus("Voice chat ended.");
          return;
        }
        endVoiceSession(token)
          .then(function () {
            setStatus("Voice chat ended.");
          })
          .catch(function () {
            setStatus("Voice ended, but the server could not confirm session cleanup.", true);
          });
      }

      function releaseVoiceResources() {
        if (voiceEvents) {
          voiceEvents.close();
          voiceEvents = null;
        }
        if (voicePeer) {
          voicePeer.close();
          voicePeer = null;
        }
        if (microphoneStream) {
          microphoneStream.getTracks().forEach(function (track) {
            track.stop();
          });
          microphoneStream = null;
        }
        remoteAudio.srcObject = null;
      }

      function endVoiceSession(token) {
        return fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId) + "/voice/end", {
          method: "POST",
          headers: { "X-Widget-Session": token },
        }).then(function (response) {
          if (!response.ok) throw new Error("Could not close voice session.");
        });
      }

      if (config.initialOpen) {
        openButton.hidden = true;
        ensureSession().catch(function (error) {
          setStatus(error.message || "Could not start chat.", true);
        });
      }
    })
    .catch(function (error) {
      root.textContent = "AI chat is unavailable. " + (error.message || "Please try again later.");
    });

  function waitForIceGathering(peer) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () {
        cleanup();
        reject(new Error("Could not establish a voice connection. Please try again."));
      }, 10000);
      function checkState() {
        if (peer.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      }
      function cleanup() {
        clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", checkState);
      }
      peer.addEventListener("icegatheringstatechange", checkState);
    });
  }

  function readResponse(response) {
    return response.json()
      .catch(function () {
        return {};
      })
      .then(function (body) {
        return { response: response, body: body };
      });
  }

  function createIdempotencyKey() {
    if (window.crypto && window.crypto.randomUUID) return "msg_" + window.crypto.randomUUID();
    return "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  }

  function appendMessage(messages, role, text) {
    var item = document.createElement("div");
    item.className = "ai-message " + role;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
})();
