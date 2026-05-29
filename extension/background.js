const API_URL = "http://127.0.0.1:8000/analyze";

chrome.runtime.onInstalled.addListener(() => {
  console.log("ProfileLens AI v2 installed.");
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "PROFILE_DATA") return;

  const profile = message.data;

  // Clear old scores immediately so sidebar shows loading
  chrome.storage.local.set({ latestProfile: profile, latestScores: null });
  chrome.runtime.sendMessage({ type: "ANALYZING" });

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  })
    .then(res => {
      if (!res.ok) throw new Error("Server error " + res.status);
      return res.json();
    })
    .then(scores => {
      chrome.storage.local.set({ latestScores: scores });
      chrome.runtime.sendMessage({ type: "SCORES_READY", profile, scores });
    })
    .catch(err => {
      console.error("ProfileLens API error:", err);
      chrome.runtime.sendMessage({ type: "API_ERROR", error: err.message });
    });
});