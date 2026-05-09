from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import asyncio
import json as json_mod
import shutil
import tempfile
import zipfile
import base64
import logging
import os
import uuid
from datetime import datetime

load_dotenv()
from .ocr_engine import agentic_extract, json_to_latex, verify_transcription, compile_latex_to_pdf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# session_id -> {data, temp_dir, original_image, filename, timestamp, rating}
sessions: dict = {}
history: list = []


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "OCR Backend is running"}


@app.post("/api/extract")
async def extract_content(file: UploadFile = File(...)):

    """Agentic multi-pass extraction with SSE progress streaming."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    filename = file.filename
    loop = asyncio.get_event_loop()
    progress_queue: asyncio.Queue = asyncio.Queue()

    def send(event: dict):
        loop.call_soon_threadsafe(progress_queue.put_nowait, event)

    async def run_pipeline():
        try:
            log.info(f"Agentic extraction: {filename}")
            structured_data, temp_dir, iteration_log = await asyncio.to_thread(
                agentic_extract, tmp_path, api_key, send
            )

            original_copy = os.path.join(temp_dir, f"_original{suffix}")
            shutil.copy2(tmp_path, original_copy)

            session_id = str(uuid.uuid4())
            sessions[session_id] = {
                "data": structured_data,
                "temp_dir": temp_dir,
                "original_image": original_copy,
                "filename": filename,
                "timestamp": datetime.utcnow().isoformat(),
                "rating": None,
            }

            n = len(structured_data["document"]["elements"])
            log.info(f"Extracted {n} elements → session={session_id} passes={len(iteration_log)}")
            send({"type": "done", "session_id": session_id, "data": structured_data, "iterations": iteration_log})
        except Exception as e:
            log.error(f"Agentic extraction failed for {filename}: {e}")
            send({"type": "error", "message": str(e)})
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    asyncio.create_task(run_pipeline())

    async def generate():
        while True:
            event = await progress_queue.get()
            yield f"data: {json_mod.dumps(event)}\n\n"
            if event.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@app.post("/api/generate")
async def generate_latex(body: dict):
    """Convert (possibly edited) JSON to LaTeX, return zip as base64."""
    session_id = body.get("session_id")
    edited_data = body.get("data")

    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    json_data = edited_data or session["data"]
    temp_dir = session["temp_dir"]
    stem = os.path.splitext(session["filename"])[0]

    log.info(f"Generating LaTeX for session {session_id}")

    try:
        latex_source = json_to_latex(json_data)

        import io
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"{stem}.tex", latex_source)
            if temp_dir and os.path.isdir(temp_dir):
                for fname in os.listdir(temp_dir):
                    # skip the original image copy from the zip
                    if fname.startswith("_original"):
                        continue
                    fpath = os.path.join(temp_dir, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, fname)

        zip_b64 = base64.b64encode(buf.getvalue()).decode()

        history.append({
            "session_id": session_id,
            "filename": session["filename"],
            "timestamp": session["timestamp"],
            "rating": None,
            "latex_preview": latex_source[:400],
        })
        if len(history) > 20:
            history.pop(0)

        log.info(f"LaTeX ready for session {session_id} ({len(latex_source)} chars)")
        return {
            "latex": latex_source,
            "zip_base64": zip_b64,
            "filename": f"{stem}_latex.zip",
        }

    except Exception as e:
        log.error(f"Generation failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/compile")
async def compile_to_pdf(body: dict):
    """Compile the generated LaTeX to PDF using tectonic and return it as base64."""
    session_id = body.get("session_id")
    latex = body.get("latex", "")

    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    temp_dir = session.get("temp_dir")
    stem = os.path.splitext(session["filename"])[0]

    log.info(f"Compiling PDF for session {session_id}")

    try:
        pdf_bytes = await asyncio.to_thread(compile_latex_to_pdf, latex, temp_dir)
        pdf_b64 = base64.b64encode(pdf_bytes).decode()
        log.info(f"PDF compiled for session {session_id} ({len(pdf_bytes)} bytes)")
        return {"pdf_base64": pdf_b64, "filename": f"{stem}.pdf"}
    except Exception as e:
        log.error(f"Compilation failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/verify")
async def verify_output(body: dict):
    """Agent 2 — compare original image against generated LaTeX and report quality."""
    session_id = body.get("session_id")
    latex = body.get("latex", "")

    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    original_image = session.get("original_image")

    if not original_image or not os.path.exists(original_image):
        raise HTTPException(status_code=404, detail="Original image not available for verification")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    log.info(f"Verifying session {session_id}")

    try:
        report = await asyncio.to_thread(verify_transcription, original_image, latex, api_key)
        log.info(f"Verification done: session={session_id} score={report.get('accuracy_score')}")
        return report
    except Exception as e:
        log.error(f"Verification failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/feedback")
async def submit_feedback(body: dict):
    session_id = body.get("session_id")
    rating = body.get("rating")
    comment = body.get("comment", "")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    if session_id in sessions:
        sessions[session_id]["rating"] = rating

    for entry in history:
        if entry["session_id"] == session_id:
            entry["rating"] = rating
            entry["comment"] = comment
            break

    log.info(f"Feedback: session={session_id} rating={rating}")
    return {"status": "ok"}


@app.get("/api/history")
def get_history():
    return {"history": list(reversed(history))}
