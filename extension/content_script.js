if (window.__plLoaded) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "RE_ANALYZE") runScraper();
  });
} else {
  window.__plLoaded = true;

  const $ = (s, r = document) => { try { return r.querySelector(s); } catch { return null; } };
  const $$ = (s, r = document) => { try { return [...r.querySelectorAll(s)]; } catch { return []; } };
  const txt = (el) => el ? (el.innerText || el.textContent || "").trim() : "";
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ─── Wait for element ─────────────────────────────────────────────────────
  function waitFor(selector, ms = 20000) {
    return new Promise(resolve => {
      const start = Date.now();
      (function poll() {
        const el = $(selector);
        if (el && txt(el).length > 0) return resolve(el);
        if (Date.now() - start > ms) return resolve(null);
        setTimeout(poll, 400);
      })();
    });
  }

  // ─── Scroll to trigger lazy load ──────────────────────────────────────────
  async function fullScroll() {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      window.scrollTo(0, (document.body.scrollHeight / steps) * i);
      await sleep(350);
    }
    await sleep(600);
    window.scrollTo(0, 0);
    await sleep(500);
  }

  // ─── Click "Show all X skills" link specifically ───────────────────────────
  // LinkedIn uses an <a> tag with text like "Show all 14 skills →"
  async function clickShowAllSkills() {
    // Find all anchors/buttons whose text contains "show all" and "skill"
    const all = $$("a, button, span[role='button']");
    let clicked = false;
    for (const el of all) {
      const t = txt(el).toLowerCase();
      if (t.includes("show all") && t.includes("skill") && el.offsetParent !== null) {
        console.log("ProfileLens: clicking show all skills:", txt(el));
        try {
          el.click();
          clicked = true;
          await sleep(1500); // wait for modal/page to load
        } catch(e) {}
      }
    }
    return clicked;
  }

  // ─── Click ALL "Show all" / "See more" expanders ─────────────────────────
  async function expandAll() {
    const patterns = ["show all", "see all", "see more", "show more"];
    let count = 0;
    for (const el of $$("button, a, span[role='button']")) {
      const t = txt(el).toLowerCase();
      if (patterns.some(p => t.startsWith(p)) && el.offsetParent !== null) {
        try { el.click(); count++; await sleep(350); } catch(e) {}
      }
    }
    if (count > 0) await sleep(800);
    return count;
  }

  // ─── Find section element by H2/H3 heading keyword ────────────────────────
  function getSectionByHeading(keyword) {
    for (const h of $$("h2, h3")) {
      if (txt(h).toLowerCase().includes(keyword.toLowerCase())) {
        let el = h;
        for (let i = 0; i < 10; i++) {
          el = el.parentElement;
          if (!el) break;
          if (el.tagName === "SECTION") return el;
          if (el.tagName === "DIV" && (el.querySelector("ul") || el.querySelector("li"))) return el;
        }
      }
    }
    const byId = document.getElementById(keyword) || $(`[name="${keyword}"]`);
    if (byId) {
      let el = byId;
      for (let i = 0; i < 10; i++) {
        el = el.parentElement;
        if (!el) break;
        if (el.tagName === "SECTION") return el;
      }
    }
    return null;
  }

  // ─── TreeWalker: extract all visible text lines from a container ──────────
  function extractLines(container, maxLines = 50) {
    if (!container) return [];
    const NOISE = new Set([
      "show all","see all","see more","show more","add","edit","save",
      "skills","education","experience","about","•","·","endorsed",
      "endorsement","connections","followers","following","view profile",
      "share","message","connect","follow","open to","add section",
      "enhance profile","resources","endorse","button","link","report",
      "more","less","people also viewed","you might know"
    ]);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        try {
          const cs = window.getComputedStyle(p);
          if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0)
            return NodeFilter.FILTER_REJECT;
        } catch(e) {}
        const tag = p.tagName?.toUpperCase();
        if (!tag || ["SCRIPT","STYLE","SVG","PATH","NOSCRIPT"].includes(tag))
          return NodeFilter.FILTER_REJECT;
        if (p.classList.contains("visually-hidden") || p.classList.contains("sr-only"))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const results = [], seen = new Set();
    while (walker.nextNode()) {
      const raw = walker.currentNode.nodeValue?.trim() || "";
      if (!raw || raw.length < 2) continue;
      if (/^\d+$/.test(raw)) continue;
      if (/^\d+\s*(yr|mo|yrs|mos|year|month)/i.test(raw)) continue;
      if (NOISE.has(raw.toLowerCase())) continue;
      if (raw.toLowerCase().includes("linkedin") && raw.length < 25) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      results.push(raw);
      if (results.length >= maxLines) break;
    }
    return results;
  }

  // ─── NAME ─────────────────────────────────────────────────────────────────
  function scrapeName() {
    for (const sel of [
      "h1.text-heading-xlarge",
      ".pv-top-card h1",
      ".ph5 h1",
      "main h1",
      "h1"
    ]) {
      for (const el of $$(sel)) {
        const t = txt(el);
        if (t && t.length > 1 && t.length < 80 && !t.toLowerCase().includes("linkedin")) return t;
      }
    }
    return "";
  }

  // ─── HEADLINE ─────────────────────────────────────────────────────────────
  // LinkedIn shows headline in multiple places; we try them all
  function scrapeHeadline(name) {
    const nameLower = name.toLowerCase();

    // 1. Direct selectors for the profile top card area
    const directSelectors = [
      ".text-body-medium.break-words",
      ".pv-text-details__left-panel .text-body-medium",
      ".pv-top-card .text-body-medium",
      ".ph5 .text-body-medium",
      // Newer LinkedIn uses this for the headline div
      "div.text-body-medium[dir]",
      ".pv-top-card--list .text-body-medium",
    ];
    for (const sel of directSelectors) {
      for (const el of $$(sel)) {
        const t = txt(el);
        if (t && t.toLowerCase() !== nameLower && t.length > 3 && t.length < 400
            && !t.includes("connections") && !t.includes("followers")) {
          return t;
        }
      }
    }

    // 2. Walk siblings of h1 — headline is always close to the name
    const h1 = $("h1");
    if (h1) {
      // Try next siblings
      let sib = h1.nextElementSibling;
      for (let i = 0; i < 6 && sib; i++, sib = sib.nextElementSibling) {
        const t = txt(sib);
        if (t && t.toLowerCase() !== nameLower && t.length > 3 && t.length < 400
            && !t.includes("connections") && !t.includes("followers")) return t;
      }
      // Try parent's children after h1
      const parent = h1.parentElement;
      if (parent) {
        let found = false;
        for (const child of parent.children) {
          if (child === h1) { found = true; continue; }
          if (!found) continue;
          const t = txt(child);
          if (t && t.toLowerCase() !== nameLower && t.length > 3 && t.length < 400) return t;
        }
      }
    }

    // 3. The sticky nav bar also contains the headline
    for (const nav of $$("nav, header, [class*='nav'], [class*='sticky']")) {
      const t = txt(nav);
      if (t && t.toLowerCase() !== nameLower && t.length > 10 && t.length < 400
          && !t.includes("Home") && !t.includes("Jobs")) {
        // Extract just the headline part (usually after the name)
        const lines = t.split("\n").map(l => l.trim()).filter(l => l.length > 3);
        for (const line of lines) {
          if (!line.toLowerCase().includes(nameLower) && line.length < 300) return line;
        }
      }
    }

    return "";
  }

  // ─── LOCATION ─────────────────────────────────────────────────────────────
  function scrapeLocation() {
    // Strategy 1: known selectors
    const selectors = [
      ".pv-text-details__left-panel .text-body-small.inline.t-black--light.break-words",
      ".pv-text-details__left-panel .text-body-small",
      ".pb2 .text-body-small.inline.t-black--light.break-words",
      ".pb2 .text-body-small",
      ".mt2 .text-body-small",
      // Newer layout
      "[class*='top-card'] .text-body-small",
      ".ph5 .text-body-small",
    ];
    for (const sel of selectors) {
      for (const el of $$(sel)) {
        const t = txt(el);
        if (t && t.length > 2 && t.length < 100
            && !t.includes("connections") && !t.includes("followers")
            && !t.includes("Contact info") && !t.includes("following")) {
          return t;
        }
      }
    }

    // Strategy 2: Find text near h1 that looks like a location
    // Locations typically: "City, State, Country" or "City, Country"
    const h1 = $("h1");
    if (h1) {
      const topCard = h1.closest(".ph5, section, main, [class*='top-card']") || h1.parentElement?.parentElement?.parentElement;
      if (topCard) {
        for (const el of $$("span, div", topCard)) {
          const t = txt(el);
          // Location heuristic: short, has comma, not a connection count
          if (t && t.length > 3 && t.length < 80
              && (t.includes(",") || /^[A-Z][a-z]/.test(t))
              && !t.includes("connections") && !t.includes("followers")
              && !t.includes("|") && !/\d{4}/.test(t)) {
            // Make sure it's not the name or headline
            if (!t.includes("@") && !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) {
              return t;
            }
          }
        }
      }
    }

    return "";
  }

  // ─── ABOUT ────────────────────────────────────────────────────────────────
  function scrapeAbout() {
    const sec = getSectionByHeading("about");
    if (!sec) return "";
    const lines = extractLines(sec, 80);
    const filtered = lines.filter(l => l.toLowerCase() !== "about" && l.length > 3);
    return filtered.join(" ").slice(0, 1200);
  }

  // ─── EDUCATION ────────────────────────────────────────────────────────────
  function scrapeEducation() {
    const sec = getSectionByHeading("education");
    if (!sec) return [];
    const results = [];
    let items = [];
    for (const sel of [
      "li.artdeco-list__item","li.pvs-list__paged-list-item",
      "li.pvs-list__item--line-separated","li.pvs-list__item--two-column","li"
    ]) {
      items = $$(sel, sec);
      if (items.length > 0) break;
    }
    if (items.length > 0) {
      for (const item of items.slice(0, 8)) {
        const lines = extractLines(item, 12);
        const clean = lines.filter(l => {
          const low = l.toLowerCase();
          return l.length > 1 && !["education","add","edit","activities and societies","grade"].includes(low);
        });
        if (clean.length > 0) results.push(clean.slice(0, 5).join(" | "));
      }
    } else {
      const lines = extractLines(sec, 40);
      const clean = lines.filter(l => l.toLowerCase() !== "education" && l.length > 2);
      if (clean.length > 0) results.push(clean.slice(0, 8).join(" | "));
    }
    return results.filter(Boolean);
  }

  // ─── EXPERIENCE ───────────────────────────────────────────────────────────
  function scrapeExperience() {
    const sec = getSectionByHeading("experience");
    if (!sec) return [];
    const results = [];
    let items = [];
    for (const sel of [
      "li.artdeco-list__item","li.pvs-list__paged-list-item",
      "li.pvs-list__item--line-separated","li"
    ]) {
      items = $$(sel, sec);
      if (items.length > 0) break;
    }
    if (items.length > 0) {
      for (const item of items.slice(0, 10)) {
        const lines = extractLines(item, 10);
        const clean = lines.filter(l => l.toLowerCase() !== "experience" && l.length > 1);
        if (clean.length > 0) results.push(clean.slice(0, 5).join(" | "));
      }
    } else {
      const lines = extractLines(sec, 40);
      const clean = lines.filter(l => l.toLowerCase() !== "experience" && l.length > 2);
      if (clean.length > 0) results.push(clean.slice(0, 8).join(" | "));
    }
    return results.filter(Boolean);
  }

  // ─── SKILLS ───────────────────────────────────────────────────────────────
  // Skills are the trickiest: LinkedIn hides most behind "Show all X skills →"
  // That link opens a NEW PAGE (/details/skills/) not a modal on newer LinkedIn.
  // So we scrape what's visible + navigate to details page if needed.
  async function scrapeSkills() {
    const SKIP = new Set([
      "skills","show all skills","see all skills","add a skill","top skills",
      "industry knowledge","tools & technologies","interpersonal skills",
      "other skills","endorsed by","people also endorsed","show all","see all",
      "endorse","top skill","featured"
    ]);

    function parseSkillsFromContainer(container) {
      if (!container) return [];
      let items = [];
      for (const sel of [
        "li.artdeco-list__item","li.pvs-list__paged-list-item",
        "li.pvs-list__item--line-separated","li.pvs-list__item--two-column","li"
      ]) {
        items = $$(sel, container);
        if (items.length > 0) break;
      }

      const skills = [];
      if (items.length > 0) {
        for (const item of items.slice(0, 30)) {
          const lines = extractLines(item, 5);
          for (const line of lines) {
            if (line.length < 2 || line.length > 70) continue;
            if (SKIP.has(line.toLowerCase())) continue;
            if (/\d+\s*endorsement/i.test(line)) continue;
            if (/^\d+$/.test(line)) continue;
            skills.push(line);
            break; // first valid line per item = skill name
          }
        }
      } else {
        // Fallback: walk all text
        const lines = extractLines(container, 60);
        for (const line of lines) {
          if (line.length < 2 || line.length > 70) continue;
          if (SKIP.has(line.toLowerCase())) continue;
          if (/\d+\s*endorsement/i.test(line)) continue;
          skills.push(line);
        }
      }
      return [...new Set(skills)];
    }

    // 1. Try main profile page skills section first
    const mainSec = getSectionByHeading("skills");
    const mainSkills = mainSec ? parseSkillsFromContainer(mainSec) : [];
    console.log("ProfileLens: main page skills:", mainSkills);

    // 2. Check if there's a "Show all X skills" link → navigate to /details/skills/
    let allSkills = [...mainSkills];

    const skillsPageLink = $$("a").find(a => {
      const href = a.href || "";
      const t = txt(a).toLowerCase();
      return href.includes("/details/skills") || (t.includes("show all") && t.includes("skill"));
    });

    if (skillsPageLink) {
      const skillsUrl = skillsPageLink.href.includes("/details/skills")
        ? skillsPageLink.href
        : window.location.href.replace(/\/$/, "") + "/details/skills/";

      console.log("ProfileLens: fetching skills page:", skillsUrl);

      try {
        // Use fetch to get the skills detail page HTML
        const resp = await fetch(skillsUrl, { credentials: "include" });
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Extract skill names from fetched page
        const fetchedSkills = [];
        // Skills page has items in lists
        for (const li of doc.querySelectorAll("li")) {
          const spans = [...li.querySelectorAll("span")];
          for (const span of spans) {
            const t = (span.innerText || span.textContent || "").trim();
            if (t && t.length > 1 && t.length < 70 && !SKIP.has(t.toLowerCase())) {
              fetchedSkills.push(t);
              break;
            }
          }
        }
        // Also try plain text walk
        if (fetchedSkills.length < 3) {
          const allText = (doc.body.innerText || doc.body.textContent || "").split("\n");
          for (const line of allText) {
            const t = line.trim();
            if (t && t.length > 1 && t.length < 70 && !SKIP.has(t.toLowerCase())) {
              fetchedSkills.push(t);
            }
          }
        }

        console.log("ProfileLens: fetched skills page items:", fetchedSkills.slice(0, 30));
        if (fetchedSkills.length > allSkills.length) {
          allSkills = fetchedSkills;
        }
      } catch(e) {
        console.log("ProfileLens: skills page fetch failed, using main page skills:", e.message);
      }
    }

    const result = [...new Set(allSkills)].slice(0, 30);
    console.log("ProfileLens: final skills:", result);
    return result;
  }

  // ─── PHOTO ────────────────────────────────────────────────────────────────
  function hasPhoto() {
    for (const img of $$("img")) {
      const src = img.src || "";
      if (!src.startsWith("http")) continue;
      if (src.includes("ghost") || src.includes("data:") || src.includes("icon")) continue;
      if (src.includes("profile-displayphoto") ||
          src.includes("licdn.com/dms/image") ||
          (img.alt || "").toLowerCase().includes("photo")) return 1;
    }
    return 0;
  }

  // ─── JSON-LD fast path ────────────────────────────────────────────────────
  function fromJsonLd() {
    for (const s of $$('script[type="application/ld+json"]')) {
      try {
        const d = JSON.parse(s.textContent);
        const graph = d["@graph"] || [d];
        const p = graph.find(n => n["@type"] === "Person");
        if (!p?.name) continue;
        return {
          name:       p.name || "",
          headline:   p.jobTitle || "",
          location:   p.address?.addressLocality || "",
          about:      p.description || "",
          experience: (p.worksFor || []).map(j => [j.name, j.employee?.jobTitle].filter(Boolean).join(" | ")),
          education:  (p.alumniOf || []).map(e => [e.name, e.award].filter(Boolean).join(" | ")),
          skills:     (p.knowsAbout || []).map(s => typeof s === "string" ? s : s.name || "").filter(Boolean),
        };
      } catch {}
    }
    return null;
  }

  // ─── Debug ────────────────────────────────────────────────────────────────
  function debugPage() {
    console.log("=== ProfileLens DEBUG ===");
    $$("h2,h3").forEach(h => console.log(`  ${h.tagName}: "${txt(h)}"`));
    console.log("=========================");
  }

  // ─── MAIN ─────────────────────────────────────────────────────────────────
  async function runScraper() {
    if (!window.location.href.includes("linkedin.com/in/")) return;
    console.log("ProfileLens: starting...");

    await waitFor("h1");
    await sleep(1000);

    console.log("ProfileLens: scrolling...");
    await fullScroll();

    console.log("ProfileLens: expanding...");
    await expandAll();
    await sleep(800);

    debugPage();

    // JSON-LD
    const ld = fromJsonLd();

    // DOM scrape
    const name       = ld?.name     || scrapeName();
    const headline   = ld?.headline || scrapeHeadline(name);
    const location   = ld?.location || scrapeLocation();
    const about      = ld?.about    || scrapeAbout();
    const experience = (ld?.experience?.length ? ld.experience : null) || scrapeExperience();
    const education  = (ld?.education?.length  ? ld.education  : null) || scrapeEducation();

    // Skills: async because it may fetch the /details/skills/ page
    const skills = (ld?.skills?.length ? ld.skills : null) || await scrapeSkills();

    const finalName = (name && name.length > 1) ? name :
      (window.location.pathname.split("/in/")[1]?.split("/")[0] || "")
        .replace(/-[a-z0-9]{5,}$/, "").replace(/-/g, " ").trim() || "Unknown";

    const profile = {
      name:           finalName,
      headline:       headline   || "",
      location:       location   || "",
      about:          about      || "",
      experience:     experience || [],
      education:      education  || [],
      skills:         skills     || [],
      has_photo:      hasPhoto(),
      connectionText: "",
      url:            window.location.href,
      scrapedAt:      new Date().toISOString()
    };

    console.log("ProfileLens extracted:", profile);
    chrome.runtime.sendMessage({ type: "PROFILE_DATA", data: profile });
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "RE_ANALYZE") runScraper();
  });

  runScraper();
}