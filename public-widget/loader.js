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
  style.textContent =
    ":host{all:initial}.ai-widget{position:fixed;z-index:2147483000;font-family:Arial,sans-serif}" +
    ".ai-widget.bottom-left{left:20px;bottom:20px}.ai-widget.bottom-right{right:20px;bottom:20px}" +
    ".ai-button{width:56px;height:56px;border:0;border-radius:50%;color:#fff;box-shadow:0 8px 28px #0003;cursor:pointer}" +
    ".ai-panel{display:flex;flex-direction:column;width:360px;height:520px;max-height:calc(100vh - 100px);background:#fff;border:1px solid #dfe3ea;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px #0003}" +
    ".ai-header{padding:14px 16px;color:#fff;display:flex;justify-content:space-between;align-items:center}.ai-header button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:18px}" +
    ".ai-messages{flex:1;overflow:auto;padding:14px}.ai-message{max-width:78%;margin:8px 0;padding:9px 11px;border-radius:12px;font-size:14px;line-height:1.35}" +
    ".ai-message.user{margin-left:auto;background:#eef2ff}.ai-message.assistant{background:#f3f4f6}.ai-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb}.ai-form input{flex:1;min-width:0;border:1px solid #d1d5db;border-radius:10px;padding:10px}.ai-form button{border:0;border-radius:10px;color:#fff;padding:0 13px}" +
    "@media(max-width:480px){.ai-panel{position:fixed;inset:0;width:100vw;height:100vh;max-height:none;border-radius:0}.ai-widget.bottom-left,.ai-widget.bottom-right{left:0;right:0;bottom:0}}";
  shadow.appendChild(style);

  var root = document.createElement("div");
  shadow.appendChild(root);

  fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId), {
    headers: { Accept: "application/json" },
  })
    .then(function (response) {
      if (!response.ok) throw new Error("Widget unavailable");
      return response.json();
    })
    .then(function (config) {
      var position = config.position === "bottom-left" ? "bottom-left" : "bottom-right";
      root.innerHTML =
        '<div class="ai-widget ' + position + '">' +
        '<button class="ai-button" aria-label="Open chat" style="background:' + config.buttonColor + '">AI</button>' +
        '<section class="ai-panel" aria-label="' + escapeHtml(config.title) + '" ' + (config.initialOpen ? "" : 'hidden') + '>' +
        '<header class="ai-header" style="background:' + config.primaryColor + '"><strong>' + escapeHtml(config.title) + '</strong><button class="ai-close" aria-label="Close chat">×</button></header>' +
        '<div class="ai-messages"><div class="ai-message assistant">' + escapeHtml(config.welcomeMessage || "How can I help?") + '</div></div>' +
        '<form class="ai-form"><input aria-label="Message" placeholder="Type a message..." ' + (config.textEnabled ? "" : "disabled") + '><button type="submit" style="background:' + config.primaryColor + '">Send</button></form>' +
        "</section></div>";

      var container = root.querySelector(".ai-widget");
      var panel = root.querySelector(".ai-panel");
      var button = root.querySelector(".ai-button");
      var close = root.querySelector(".ai-close");
      var messages = root.querySelector(".ai-messages");
      var form = root.querySelector(".ai-form");
      var input = root.querySelector(".ai-form input");
      var sessionToken = sessionStorage.getItem("ai_widget_" + widgetId) || "";

      button.addEventListener("click", function () {
        panel.hidden = false;
        button.hidden = true;
        ensureSession();
      });
      close.addEventListener("click", function () {
        panel.hidden = true;
        button.hidden = false;
      });

      function ensureSession() {
        if (sessionToken) return Promise.resolve(sessionToken);
        return fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId) + "/sessions", { method: "POST" })
          .then(function (response) {
            if (!response.ok) throw new Error("Could not start session");
            return response.json();
          })
          .then(function (session) {
            sessionToken = session.sessionToken;
            sessionStorage.setItem("ai_widget_" + widgetId, sessionToken);
            if (session.firstPrompt) appendMessage("assistant", session.firstPrompt);
            return sessionToken;
          });
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var text = input.value.trim();
        if (!text) return;
        input.value = "";
        appendMessage("user", text);
        ensureSession()
          .then(function (token) {
            return fetch(baseUrl + "/api/public/widgets/" + encodeURIComponent(widgetId) + "/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Widget-Session": token },
              body: JSON.stringify({ content: text, idempotencyKey: "msg_" + Date.now() + "_" + text.length }),
            });
          })
          .then(function (response) {
            if (!response.ok) throw new Error("Could not send message");
            return response.json();
          })
          .then(function (body) {
            appendMessage("assistant", body.message);
          })
          .catch(function (error) {
            appendMessage("assistant", error.message || "Could not send message.");
          });
      });

      function appendMessage(role, text) {
        var item = document.createElement("div");
        item.className = "ai-message " + role;
        item.textContent = text;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
      }

      if (config.initialOpen) {
        button.hidden = true;
        ensureSession();
      }
    })
    .catch(function () {
      root.textContent = "AI chat is unavailable.";
    });

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
})();
