"""Video analysis and score generation."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os

router = APIRouter()


class VideoAnalyzeRequest(BaseModel):
    filePath: str


class VideoScoreRequest(BaseModel):
    filePath: str
    prompt: str
    sceneAnalysis: str


@router.post("/analyze")
async def analyze_video(req: VideoAnalyzeRequest):
    if not os.path.exists(req.filePath):
        raise HTTPException(400, f"File not found: {req.filePath}")

    scenes = []
    description = "Video analysis unavailable — install opencv-python for scene detection."

    try:
        import cv2
        cap = cv2.VideoCapture(req.filePath)
        fps = cap.get(cv2.CAP_PROP_FPS) or 24
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps

        # Simple scene change detection via histogram diff
        prev_hist = None
        last_cut = 0.0
        for i in range(0, frame_count, int(fps)):
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
            if prev_hist is not None:
                diff = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
                if diff < 0.85:
                    t = i / fps
                    scenes.append({"start": last_cut, "end": t, "mood": "neutral"})
                    last_cut = t
            prev_hist = hist
        scenes.append({"start": last_cut, "end": duration, "mood": "neutral"})
        cap.release()

        description = (
            f"Video: {duration:.1f}s, {fps:.0f}fps, {len(scenes)} scenes detected. "
            f"Mood analysis requires AI integration — set your API key in Settings."
        )
    except ImportError:
        pass

    return {"description": description, "scenes": scenes}


@router.post("/generate-score")
async def generate_score(req: VideoScoreRequest):
    """Generate music score for a video using AI + local synthesis."""
    tracks = []

    # Placeholder — actual implementation connects AI + instruments pipeline
    tracks.append({"name": "AI Score", "audioFile": ""})

    return {"tracks": tracks}
