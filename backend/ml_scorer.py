import os, pickle
import numpy as np
from models import ProfileInput, ScoreOutput, SkillGap, ProfileHealthSuggestion

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

SENIOR = ["senior","lead","manager","director","head","vp","chief","principal","architect","founder","ceo","cto","coo"]
JUNIOR = ["intern","junior","assistant","trainee","associate","entry"]

ROLE_SKILLS = {
    "founder":     ["Leadership","Communication","Strategy","Networking","Sales"],
    "ceo":         ["Leadership","Communication","Strategy","Management","Vision"],
    "cto":         ["System Design","Leadership","Cloud","Architecture","Engineering"],
    "entrepreneur":["Leadership","Communication","Strategy","Networking","Sales"],
    "designer":    ["Figma","UI/UX","Creativity","Prototyping","Adobe"],
    "data":        ["Python","SQL","Machine Learning","Data Analysis","TensorFlow"],
    "engineer":    ["Python","Git","Docker","APIs","System Design"],
    "developer":   ["JavaScript","Git","React","APIs","Node.js"],
    "manager":     ["Project Management","Leadership","Communication","Agile","Scrum"],
    "analyst":     ["SQL","Excel","Tableau","Data Analysis","Power BI"],
    "marketing":   ["SEO","Content","Analytics","Social Media","Campaigns"],
    "sales":       ["CRM","Communication","Negotiation","Networking","Salesforce"],
    "student":     ["Python","Communication","Excel","Project Management","Git"],
    "researcher":  ["Research","Data Analysis","Writing","Python","Statistics"],
    "consultant":  ["Communication","Strategy","Leadership","Excel","Presentation"],
}
DEFAULT_SKILLS = ["Communication","Leadership","Project Management","Excel","Teamwork"]

def detect_role(profile):
    text = ((profile.headline or "") + " " + " ".join(profile.experience or [])).lower()
    for k in ROLE_SKILLS:
        if k in text: return k
    return "default"

def get_tier(s):
    if s <= 40:  return "Beginner"
    if s <= 65:  return "Intermediate"
    if s <= 85:  return "Expert"
    return "Above Expert"

def load(name):
    with open(os.path.join(MODELS_DIR, f"{name}_model.pkl"), "rb") as f:
        return pickle.load(f)

def load_scaler(name):
    p = os.path.join(MODELS_DIR, f"{name}_scaler.pkl")
    if os.path.exists(p):
        with open(p, "rb") as f: return pickle.load(f)
    return None

def career_feats(p):
    txt = " ".join(p.experience or []).lower()
    hd  = (p.headline or "").lower()
    n   = len(p.experience or [])
    return [
        n,
        min(5.0, n * 1.5) if n else 0,
        int(any(w in txt or w in hd for w in SENIOR)),
        int(any(w in txt for w in JUNIOR)),
        max(0, 3 - n * 0.5),
        sum(1 for w in SENIOR if w in txt or w in hd)
    ]

def skill_feats(p):
    role   = detect_role(p)
    target = ROLE_SKILLS.get(role, DEFAULT_SKILLS)
    n      = len(p.skills or [])
    match  = len(set(p.skills or []) & set(target))
    return [n, match, len(target)]

def auth_feats(p):
    n   = len(p.skills or [])
    ab  = p.about or ""
    exp = p.experience or []
    edu = p.education or []
    return [
        n,
        min(1.0, n / 20) if n else 0,
        int(bool(ab and len(ab) > 30)),
        len(ab),
        len(exp),
        len(edu),
        int(p.has_photo or 0)
    ]

def hire_feats(p):
    role   = detect_role(p)
    target = ROLE_SKILLS.get(role, DEFAULT_SKILLS)
    sk     = p.skills or []
    match  = len(set(sk) & set(target))
    hd     = (p.headline or "").lower()
    txt    = " ".join(p.experience or []).lower()
    return [
        match / max(len(target), 1),
        len(p.experience or []) * 1.5,
        int(any(w in txt or w in hd for w in SENIOR)),
        1,
        int(bool(p.education))
    ]

def health_feats(p):
    hd = p.headline or ""
    ab = p.about or ""
    ex = p.experience or []
    return [
        int(bool(hd and len(hd) > 5)),
        len(hd),
        int(bool(ab and len(ab) > 30)),
        len(ab),
        len(ex),
        int(bool(ex)),
        len(p.skills or []),
        int(bool(p.education)),
        int(p.has_photo or 0),
        0
    ]

def build_strengths(p, career, auth, hire):
    out = []
    if career >= 70: out.append("Strong career progression detected in your experience.")
    if auth   >= 80: out.append("Profile looks highly authentic and trustworthy.")
    if p.has_photo:  out.append("Profile photo present — increases views and trust significantly.")
    if p.headline and len(p.headline) > 40: out.append("Headline is detailed and descriptive — good for search visibility.")
    if p.about and len(p.about) > 150:      out.append("About section is well written and informative.")
    if len(p.experience or []) >= 3:        out.append(f"Good experience depth — {len(p.experience)} roles listed.")
    if len(p.skills or []) >= 10:           out.append(f"Strong skill set with {len(p.skills)} skills listed.")
    if p.education:                         out.append("Education section is complete.")
    if hire >= 70:                          out.append("Profile is a strong match for your detected role type.")
    return out[:4]

def build_suggestions(p):
    out = []
    if not p.has_photo:
        out.append(ProfileHealthSuggestion(priority="high", category="Profile Photo",
            issue="No profile photo detected.",
            fix="Add a clear professional headshot. Profiles with photos get up to 21x more views."))
    if not p.headline or len(p.headline) < 20:
        out.append(ProfileHealthSuggestion(priority="high", category="Headline",
            issue="Headline is too short or generic.",
            fix="Rewrite as: [Role] helping [audience] achieve [result]."))
    if not p.about or len(p.about) < 100:
        out.append(ProfileHealthSuggestion(priority="high", category="About section",
            issue="About section is missing or too short.",
            fix="Write 3-5 sentences: who you are, what you do, what makes you different."))
    if len(p.experience or []) < 2:
        out.append(ProfileHealthSuggestion(priority="high", category="Experience",
            issue="Too few experience entries detected.",
            fix="Add bullet points with key achievements using numbers (e.g. 'Improved accuracy by 15%')."))
    if len(p.skills or []) < 8:
        out.append(ProfileHealthSuggestion(priority="medium", category="Skills",
            issue=f"Only {len(p.skills or [])} skills listed. Aim for at least 10.",
            fix="Add top skills and ask colleagues to endorse them — endorsed skills rank higher."))
    if not p.education:
        out.append(ProfileHealthSuggestion(priority="low", category="Education",
            issue="No education section found.",
            fix="Add your degree, certifications, or online courses (Coursera, Udemy, etc.)."))
    return out

def build_insights(p, career, auth, missing):
    out = []
    txt = " ".join(p.experience or []).lower()
    hd  = (p.headline or "").lower()
    role = detect_role(p)

    if any(w in txt or w in hd for w in SENIOR):
        out.append("Career shows upward progression — leadership titles detected.")
    else:
        out.append("No senior titles detected yet — focus on demonstrating impact in current role.")

    if auth >= 80:   out.append("Profile appears authentic — consistent experience and education signals.")
    elif auth >= 65: out.append("Profile looks mostly genuine but could use more detail.")
    else:            out.append("Profile may appear thin — add more detail to increase credibility.")

    if missing:
        rl = role if role != "default" else "your"
        out.append(f"For a {rl} role, consider strengthening: {', '.join(missing[:2])}.")

    if career >= 75: out.append("Strong career trajectory — good progression signals for recruiters.")
    elif career < 50:out.append("Career score is low — more experience or senior roles will improve this.")
    return out

def compute_scores(profile: ProfileInput) -> ScoreOutput:
    cm = load("career");   cs = load_scaler("career")
    sm = load("skill_gap")
    am = load("authenticity"); as_ = load_scaler("authenticity")
    hm = load("hire_fit")
    pm = load("profile_health"); ps = load_scaler("profile_health")

    def pred(model, feats, scaler=None):
        X = np.array([feats])
        if scaler: X = scaler.transform(X)
        return int(np.clip(model.predict(X)[0], 0, 100))

    career = pred(cm,  career_feats(profile),  cs)
    skill  = pred(sm,  skill_feats(profile))
    auth   = pred(am,  auth_feats(profile),    as_)
    hire   = pred(hm,  hire_feats(profile))
    health = pred(pm,  health_feats(profile),  ps)

    role    = detect_role(profile)
    target  = ROLE_SKILLS.get(role, DEFAULT_SKILLS)
    have    = (profile.skills or [])[:6]
    missing = [s for s in target if s not in (profile.skills or [])][:3]
    growing = (profile.skills or [])[6:9]

    return ScoreOutput(
        career_trajectory = career,
        skill_completeness = skill,
        authenticity = auth,
        hire_fit = hire,
        profile_health = health,
        skill_gap = SkillGap(have=have, missing=missing, growing=growing),
        insights = build_insights(profile, career, auth, missing),
        suggestions = build_suggestions(profile),
        strengths = build_strengths(profile, career, auth, hire),
        tiers = {
            "career":         get_tier(career),
            "authenticity":   get_tier(auth),
            "hire_fit":       get_tier(hire),
            "profile_health": get_tier(health)
        }
    )