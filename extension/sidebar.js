const TIERS = {
  "Beginner":     { color:"#f87171", bg:"#2d0a0a" },
  "Intermediate": { color:"#fcd34d", bg:"#1c1407" },
  "Expert":       { color:"#60a5fa", bg:"#1e3a5f" },
  "Above Expert": { color:"#4ade80", bg:"#052e16" }
};

function initials(name) {
  if (!name || name === "Unknown") return "?";
  return name.trim().split(/\s+/).slice(0,2).map(w => w[0]).join("").toUpperCase();
}

function setScore(vid, bid, tid, val, tier) {
  document.getElementById(vid).textContent = val;
  setTimeout(() => { document.getElementById(bid).style.width = val + "%"; }, 120);
  const tel = document.getElementById(tid);
  if (tel && tier && TIERS[tier]) {
    tel.textContent = tier;
    tel.style.color = TIERS[tier].color;
    tel.style.background = TIERS[tier].bg;
    tel.style.display = "inline-block";
  }
}

function makeTag(text, cls) {
  const s = document.createElement("span");
  s.className = "tag " + cls;
  s.textContent = text;
  return s;
}

function makeInsight(text, type) {
  const d = document.createElement("div");
  d.className = "iitem";
  if (type === "check") {
    d.innerHTML = `<div class="icheck">&#10003;</div><span>${text}</span>`;
  } else {
    d.innerHTML = `<div class="inum">${type}</div><span>${text}</span>`;
  }
  return d;
}

function render(profile, scores) {
  const t = scores.tiers || {};
  setScore("v-career", "b-career", "t-career", scores.career_trajectory,  t.career);
  setScore("v-auth",   "b-auth",   "t-auth",   scores.authenticity,       t.authenticity);
  setScore("v-hire",   "b-hire",   "t-hire",   scores.hire_fit,           t.hire_fit);
  setScore("v-health", "b-health", "t-health", scores.profile_health,     t.profile_health);

  const haveEl = document.getElementById("tags-have");
  const missEl = document.getElementById("tags-miss");
  haveEl.innerHTML = missEl.innerHTML = "";
  (scores.skill_gap?.have   || []).forEach(s => haveEl.appendChild(makeTag(s, "tag-have")));
  (scores.skill_gap?.growing|| []).forEach(s => haveEl.appendChild(makeTag(s, "tag-growing")));
  (scores.skill_gap?.missing|| []).forEach(s => missEl.appendChild(makeTag("Gap: " + s, "tag-missing")));

  const strEl = document.getElementById("strengths-list");
  strEl.innerHTML = "";
  (scores.strengths || []).forEach(t => strEl.appendChild(makeInsight(t, "check")));

  const insEl = document.getElementById("insights-list");
  insEl.innerHTML = "";
  (scores.insights || []).forEach((t, i) => insEl.appendChild(makeInsight(t, i + 1)));

  const sugEl = document.getElementById("sug-list");
  sugEl.innerHTML = "";
  (scores.suggestions || []).forEach(s => {
    const d = document.createElement("div");
    d.className = "sug " + s.priority;
    d.innerHTML = `
      <div class="sug-meta">
        <span class="sug-cat">${s.category}</span>
        <span class="sug-pri ${s.priority}">${s.priority}</span>
      </div>
      <div class="sug-issue">${s.issue}</div>
      <div class="sug-fix">${s.fix}</div>`;
    sugEl.appendChild(d);
  });
}

function showResult(profile, scores) {
  ["s-wait","s-load","s-err"].forEach(id => document.getElementById(id).style.display = "none");
  document.getElementById("s-result").style.display = "block";

  const pill = document.getElementById("status-pill");
  pill.textContent = "Live"; pill.className = "pill live";

  document.getElementById("r-avatar").textContent = initials(profile.name);
  document.getElementById("r-name").textContent = profile.name || "Unknown";
  document.getElementById("r-head").textContent = profile.headline || "";

  const btn = document.getElementById("analyze-btn");
  btn.disabled = false; btn.textContent = "Analyze Again";

  render(profile, scores);
}

function showLoading() {
  ["s-wait","s-result","s-err"].forEach(id => document.getElementById(id).style.display = "none");
  document.getElementById("s-load").style.display = "flex";
  const btn = document.getElementById("analyze-btn");
  btn.disabled = true; btn.textContent = "Analyzing...";
  const pill = document.getElementById("status-pill");
  pill.textContent = "Analyzing"; pill.className = "pill loading";
}

function showError(msg) {
  document.getElementById("s-load").style.display = "none";
  document.getElementById("s-err").style.display = "block";
  document.getElementById("err-msg").textContent = " " + msg + ". Make sure backend is running: python -m uvicorn main:app --port 8000";
  const btn = document.getElementById("analyze-btn");
  btn.disabled = false; btn.textContent = "Try Again";
  const pill = document.getElementById("status-pill");
  pill.textContent = "Error"; pill.className = "pill error";
}

// On open — restore last result if available
chrome.storage.local.get(["latestProfile","latestScores"], res => {
  if (res.latestProfile && res.latestScores) {
    showResult(res.latestProfile, res.latestScores);
  } else if (res.latestProfile && !res.latestScores) {
    showLoading();
  }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "ANALYZING")    showLoading();
  if (msg.type === "SCORES_READY") showResult(msg.profile, msg.scores);
  if (msg.type === "API_ERROR")    showError(msg.error);
});

// Analyze Again button
document.getElementById("analyze-btn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "RE_ANALYZE" }, () => {
      if (chrome.runtime.lastError) {
        // Content script not loaded, inject it
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ["content_script.js"]
        });
      }
    });
    showLoading();
  });
});