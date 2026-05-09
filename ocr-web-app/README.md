# Layout OCR

An agentic document transcription tool that converts images of handwritten notes or printed documents into professional LaTeX files — ready to compile or open directly in Overleaf.

---

## How It Works

The system follows a 3-step agentic loop:

```
Upload Image → Review & Edit Extracted Content → Generate LaTeX + Download ZIP
```

1. **Extract** — The image is sent to Gemini 2.5 Pro, which returns a structured JSON representation of all document elements (headings, paragraphs, lists, tables, formulas, images).
2. **Review** — The extracted content is displayed as editable cards. You can fix text, change element types, toggle bold/italic, and delete elements before committing. This is the human-in-the-loop step.
3. **Generate** — The (edited) JSON is converted to a `.tex` file. A ZIP is produced containing the LaTeX source and any cropped image regions. You can download the ZIP or send it directly to Overleaf.

Feedback (1–5 stars) is collected after each conversion and stored in session history.

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Model | Gemini 2.5 Pro (via `google-generativeai`) |
| Backend | Python · FastAPI · Uvicorn |
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS |
| Process Manager | PM2 (via `manage.sh`) |

---

## Project Structure

```
ocr-web-app/
├── api/
│   ├── index.py          # FastAPI app — /extract, /generate, /feedback, /history
│   └── ocr_engine.py     # Gemini extraction + LaTeX generation
├── frontend/
│   └── src/
│       ├── App.tsx                     # Multi-step state machine
│       ├── types.ts                    # Shared TypeScript types
│       └── components/
│           ├── UploadStep.tsx          # Step 1 — file upload UI
│           ├── PreviewStep.tsx         # Step 2 — editable content review
│           ├── ResultStep.tsx          # Step 3 — LaTeX viewer, download, feedback
│           └── HistoryPanel.tsx        # Session history sidebar
├── .env                  # GOOGLE_API_KEY goes here
├── requirements.txt      # Python dependencies
├── ecosystem.config.js   # PM2 process config
└── manage.sh             # Start/stop/restart helper
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/extract` | Upload image → returns session ID + structured JSON |
| `POST` | `/api/generate` | JSON → LaTeX + ZIP (base64) |
| `POST` | `/api/feedback` | Submit star rating for a session |
| `GET` | `/api/history` | List recent conversions |

---

## Setup

### 1. Clone and enter the project

```bash
cd ocr-web-app
```

### 2. Create a Python virtual environment

```bash
python -m venv ../venv
source ../venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Set your Google API key

Edit `.env` in the project root:

```
GOOGLE_API_KEY=your_key_here
```

Get a key at [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

---

## Run Commands

### Option A — Two terminals (recommended for development)

**Terminal 1 — Backend:**
```bash
cd /path/to/ocr-web-app
source ../venv/bin/activate
uvicorn api.index:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd /path/to/ocr-web-app/frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

---

### Option B — PM2 (both processes in the background)

```bash
# Start everything
./manage.sh start

# Check status
./manage.sh status

# Stream logs
./manage.sh logs

# Stop everything
./manage.sh stop

# Restart
./manage.sh restart
```

Open `http://localhost:5173` in your browser.

---

### Health check

```bash
curl http://localhost:8000/api/health
```
