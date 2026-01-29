from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import shutil
import tempfile
import os

load_dotenv()
from .ocr_engine import process_image_with_structure, json_to_docx

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "OCR Backend is running"}

@app.post("/api/convert")
async def convert_image_to_docx(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Server configuration error: API Key missing")

    try:
        # Save upload to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        
        try:
            # Run OCR
            structured_data, temp_dirs = process_image_with_structure(tmp_path, api_key)
            
            # Generate DOCX
            docx_buffer = json_to_docx(structured_data)
            
            # Cleanup temp dir for images handled by context manager? 
            # Ideally we extract images to a known temp dir we can clean
            # But process_image_with_structure returns the temp_dir path
            
            # Return stream
            return StreamingResponse(
                docx_buffer,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f"attachment; filename={os.path.splitext(file.filename)[0]}.docx"}
            )
            
        finally:
            # Cleanup input file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            # Cleanup extracted images dir (if returned)
            # Note: The temp_dirs returned by process_image_with_structure needs cleanup
            if 'temp_dirs' in locals() and os.path.exists(temp_dirs):
                shutil.rmtree(temp_dirs, ignore_errors=True)
                
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
