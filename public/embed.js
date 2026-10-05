// Inquira chat widget loader.
// Usage on any clinic website:
//   <script src="https://YOUR-INQUIRA-DOMAIN/embed.js" async></script>
(function () {
  if (window.__inquiraLoaded) return;
  window.__inquiraLoaded = true;

  var script = document.currentScript;
  var origin = script ? new URL(script.src).origin : window.location.origin;
  var lang = (script && script.dataset.lang) || navigator.language || "en";
  var color = (script && script.dataset.color) || "#0d9488";

  var frame = document.createElement("iframe");
  frame.src = origin + "/widget?lang=" + encodeURIComponent(lang);
  frame.title = "Chat";
  frame.style.cssText =
    "position:fixed;bottom:88px;right:20px;width:min(380px,calc(100vw - 40px));height:min(600px,calc(100vh - 120px));" +
    "border:0;border-radius:16px;box-shadow:0 12px 40px rgba(15,23,42,.18);z-index:2147483646;" +
    "opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .18s ease,transform .18s ease;background:#fff";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Open chat");
  button.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;" +
    "background:" + color + ";color:#fff;box-shadow:0 6px 20px rgba(15,23,42,.25);z-index:2147483647;" +
    "display:grid;place-items:center";
  var chatIcon =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeIcon =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  button.innerHTML = chatIcon;

  var open = false;
  button.addEventListener("click", function () {
    open = !open;
    frame.style.opacity = open ? "1" : "0";
    frame.style.transform = open ? "translateY(0)" : "translateY(8px)";
    frame.style.pointerEvents = open ? "auto" : "none";
    button.innerHTML = open ? closeIcon : chatIcon;
    button.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  });

  document.body.appendChild(frame);
  document.body.appendChild(button);
})();
