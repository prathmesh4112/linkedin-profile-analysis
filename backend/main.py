import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import ProfileInput, ScoreOutput
from ml_scorer import compute_scores

app = FastAPI(title="ProfileLens AI API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ProfileLens API is running", "version": "2.0"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/analyze", response_model=ScoreOutput)
def analyze(profile: ProfileInput):
    scores = compute_scores(profile)
    return scores