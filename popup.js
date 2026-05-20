const toggleButton = document.getElementById("toggleButton");
const toggleLabel = document.getElementById("toggleLabel");
const statusText = document.getElementById("statusText");
const blockedList = document.getElementById("blockedList");

let enabled = true;

function render(nextEnabled, blockedHosts = []) {
  enabled = nextEnabled !== false;
  toggleButton.dataset.enabled = String(enabled);
  toggleButton.setAttribute("aria-pressed", String(enabled));
  toggleLabel.textContent = enabled ? "Captcha is on" : "Captcha is off";
  statusText.textContent = enabled ? "Blocking distracting sites" : "Blocking paused";

  blockedList.replaceChildren(
    ...blockedHosts.map((host) => {
      const item = document.createElement("li");
      item.textContent = host;
      return item;
    })
  );
}

function requestStatus() {
  chrome.runtime.sendMessage({ type: "CAUGHTCHA_GET_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      statusText.textContent = "Could not read status";
      return;
    }
    render(response.enabled, response.blockedHosts);
  });
}

toggleButton.addEventListener("click", () => {
  const nextEnabled = !enabled;
  chrome.runtime.sendMessage({ type: "CAUGHTCHA_SET_ENABLED", enabled: nextEnabled }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      statusText.textContent = "Could not update status";
      return;
    }
    requestStatus();
  });
});

requestStatus();
