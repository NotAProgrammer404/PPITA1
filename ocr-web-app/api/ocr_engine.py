import os
import base64
import tempfile
import shutil
import subprocess
import anthropic
from PIL import Image

# ── Prompts ──────────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """You are Agent 1 (Extractor). Your role in an agentic pipeline is to PERCEIVE and INTERPRET every element of this document image, then ACT by calling extract_document with a complete, structured representation.

═══ STEP 1 — PERCEIVE LAYOUT ═══
Observe the full page structure before extracting anything:
- Two or more parallel vertical columns → layout="two-column" or "three-column"
- Single flowing content stream → layout="single"
- Full-width title/header lines → column=1 regardless

═══ STEP 2 — INTERPRET & EXTRACT ALL ELEMENTS ═══
Assign every element a column number (1=leftmost). Sort: all column-1 top-to-bottom, then column-2, etc.

Text element rules:
- type: "heading"|"paragraph"|"list"|"table"|"formula"|"image"
- content: spell-corrected text; lists=["item1","item2"]; tables=[["h1","h2"],["r1c1","r1c2"]]
- level: 1-3 for headings only (1=largest). Remove leading '#'.
- bold/italic/underline: detect from visual appearance
- font_size: "xlarge"=title, "large"=section header, "normal"=body, "small"=caption
- indent_level: 0=none, 1-3=nested depth

Side-by-side comparisons → single "table" element.

═══ CRITICAL — IMAGE ELEMENT PRESERVATION ═══
THIS IS A HARD REQUIREMENT. Failure = immediate re-extraction.

Every visible diagram, sketch, figure, graph, chart, drawing, photograph, flowchart, timeline,
mind-map, table-of-images, or any non-text visual region MUST be returned as a separate element:
  - type: "image"
  - content: a brief description of what the visual shows (e.g. "bar chart showing growth trends")
  - bbox: precise coordinates as % of image dimensions (0–100), covering the FULL visual area
  - image_size: "small" (<25% width) | "medium" (25–60%) | "large" (>60%)
  - column: the column the image belongs to

Rules:
  • Even rough handwritten sketches must be captured as image elements
  • bbox is REQUIRED for every image element — never omit it
  • Do NOT subsume an image inside a paragraph — give it its own element
  • If unsure of exact bbox, estimate generously rather than omitting
  • A missing image element is a CRITICAL quality failure

═══ COMPLETENESS REQUIREMENT ═══
Include ALL visible text and ALL visible visual regions. Nothing omitted.
"""

REFINE_PROMPT_TEMPLATE = """You are Agent 1 (Extractor) in a refinement pass. Agent 2 (Critic) reviewed your previous extraction and found quality issues. You must now re-extract the document fixing ALL flagged problems.

═══ AGENT 2 CRITIQUE HISTORY ═══
Cumulative feedback from all previous passes:
{history}

═══ LATEST CRITIQUE (Pass {pass_num}) ═══
Score: {score}/100
Issues:
{issues}

Missing content:
{missing}

═══ YOUR TASK ═══
Re-extract using extract_document, correcting every issue above.

SPECIAL REMINDER — IMAGE ELEMENTS:
- If any diagrams, sketches, figures or visual regions were flagged as missing: ADD THEM NOW
- Every image element MUST have a bbox (x, y, width, height as % of image)
- Do NOT drop any image that was present in prior passes unless it genuinely does not exist
- A missing image = immediate re-extraction by the critic

Be thorough. This is pass {pass_num} of the agentic quality loop.
"""

CRITIQUE_PROMPT = """You are Agent 2 (Critic) in an agentic document extraction pipeline. Your role is to OBSERVE the original image, INTERPRET the current extraction JSON, DECIDE whether quality is acceptable, and ACT by submitting a detailed critique.

The original image is shown above.

Current extraction JSON:
{json_str}

═══ MANDATORY IMAGE AUDIT — DO THIS FIRST ═══
1. Count every visible non-text visual element in the image:
   diagrams, sketches, figures, graphs, charts, flowcharts, drawings, photographs
2. Count every element with type="image" in the JSON
3. If ANY visual element from the image is absent from the JSON → severity="critical", is_acceptable=false
4. If ANY image element is missing a bbox → severity="critical"
5. Document every missing visual as a separate issue

═══ FULL QUALITY CHECKLIST ═══
After the image audit, also check:
- Missing text, sections, headings, or any visible content
- Wrong element types (list mistaken as paragraph, formula as paragraph, etc.)
- Incorrect reading order, especially in multi-column layouts
- Missing or wrong formatting (bold, italic, heading levels)
- Wrong column assignments — left column content mixed with right column
- Missing formulas or tables
- Spelling errors or misread handwriting

═══ DECISION RULES ═══
- is_acceptable=true ONLY when: score≥85 AND no critical issues AND all visible images are captured
- Any missing image OR missing bbox on an image element → is_acceptable=false, regardless of score
- Be strict: it is better to trigger another refinement pass than to approve incomplete output

Use the critique_extraction tool to report your findings.
"""

# ── Tool schemas ──────────────────────────────────────────────────────────────

EXTRACTION_TOOL = {
    "name": "extract_document",
    "description": "Extract all structured content from a document or handwritten notes image.",
    "input_schema": {
        "type": "object",
        "properties": {
            "document": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "layout": {
                        "type": "string",
                        "enum": ["single", "two-column", "three-column"],
                    },
                    "elements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "enum": ["heading", "paragraph", "list", "image", "formula", "table"]},
                                "content": {"description": "Text, list array, or table array-of-arrays"},
                                "column": {"type": "integer", "minimum": 1},
                                "level": {"type": "integer", "minimum": 1, "maximum": 3},
                                "is_math": {"type": "boolean"},
                                "image_size": {"type": "string", "enum": ["small", "medium", "large"]},
                                "bbox": {
                                    "type": "object",
                                    "properties": {
                                        "x": {"type": "number"}, "y": {"type": "number"},
                                        "width": {"type": "number"}, "height": {"type": "number"},
                                    },
                                    "required": ["x", "y", "width", "height"],
                                },
                                "style": {
                                    "type": "object",
                                    "properties": {
                                        "bold": {"type": "boolean"},
                                        "italic": {"type": "boolean"},
                                        "underline": {"type": "boolean"},
                                        "font_size": {"type": "string", "enum": ["small", "normal", "large", "xlarge"]},
                                        "alignment": {"type": "string", "enum": ["left", "center", "right"]},
                                        "text_color": {"type": "string"},
                                        "indent_level": {"type": "integer", "minimum": 0, "maximum": 3},
                                    },
                                },
                            },
                            "required": ["type", "content"],
                        },
                    },
                },
                "required": ["elements"],
            }
        },
        "required": ["document"],
    },
    "cache_control": {"type": "ephemeral"},
}

CRITIQUE_TOOL = {
    "name": "critique_extraction",
    "description": "Report quality issues found when comparing an image to its extracted JSON.",
    "input_schema": {
        "type": "object",
        "properties": {
            "quality_score": {
                "type": "integer", "minimum": 0, "maximum": 100,
                "description": "0=completely wrong, 100=perfect",
            },
            "is_acceptable": {
                "type": "boolean",
                "description": "True if quality is good enough (score>=85 and no critical issues)",
            },
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["critical", "major", "minor"]},
                        "description": {"type": "string"},
                        "fix": {"type": "string"},
                    },
                    "required": ["severity", "description", "fix"],
                },
            },
            "missing_content": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Visible content in image not present in extraction",
            },
            "summary": {"type": "string"},
        },
        "required": ["quality_score", "is_acceptable", "issues", "missing_content", "summary"],
    },
    "cache_control": {"type": "ephemeral"},
}

VERIFICATION_TOOL = {
    "name": "report_verification",
    "description": "Report the quality of a LaTeX transcription compared to the original image.",
    "input_schema": {
        "type": "object",
        "properties": {
            "accuracy_score": {"type": "integer", "minimum": 0, "maximum": 100},
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                        "description": {"type": "string"},
                        "suggestion": {"type": "string"},
                    },
                    "required": ["severity", "description", "suggestion"],
                },
            },
            "missing_elements": {"type": "array", "items": {"type": "string"}},
            "summary": {"type": "string"},
        },
        "required": ["accuracy_score", "issues", "missing_elements", "summary"],
    },
    "cache_control": {"type": "ephemeral"},
}

MEDIA_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _encode_image(image_path: str) -> tuple[str, str]:
    ext = os.path.splitext(image_path)[1].lower()
    media_type = MEDIA_TYPES.get(ext, "image/jpeg")
    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8"), media_type


def _crop_image_elements(structured_data: dict, original_img: Image.Image, temp_dir: str,
                         pass_num: int = 1) -> dict:
    """Crop image regions from original_img and store paths in element dicts.

    Does NOT pre-clear existing image_path values — if a crop fails or bbox is absent,
    the element keeps whatever path it already had (from a prior pass).
    """
    orig_w, orig_h = original_img.size

    # Count existing crops to avoid overwriting files from earlier passes
    existing = [f for f in os.listdir(temp_dir) if f.startswith("image_") and f.endswith(".png")]
    image_counter = len(existing) + 1

    for element in structured_data["document"]["elements"]:
        if element.get("type") != "image":
            continue
        bbox = element.get("bbox")
        if not bbox:
            # No bbox — keep existing image_path if present; otherwise element renders as placeholder
            continue
        try:
            x = int(bbox["x"] * orig_w / 100)
            y = int(bbox["y"] * orig_h / 100)
            w = int(bbox["width"] * orig_w / 100)
            h = int(bbox["height"] * orig_h / 100)
            pad_x = max(10, int(orig_w * 0.03))
            pad_y = max(10, int(orig_h * 0.03))
            cropped = original_img.crop((
                max(0, x - pad_x), max(0, y - pad_y),
                min(orig_w, x + w + pad_x), min(orig_h, y + h + pad_y),
            ))
            out = os.path.join(temp_dir, f"image_p{pass_num}_{image_counter:03d}.png")
            cropped.save(out, format="PNG")
            element["image_path"] = out
            image_counter += 1
        except Exception as e:
            print(f"Crop failed (pass {pass_num}, counter {image_counter}): {e}")
            # Keep existing image_path if crop fails

    return structured_data


def _run_extraction(client: anthropic.Anthropic, image_b64: str, media_type: str,
                    extra_prompt: str = "") -> dict:
    """Single Claude extraction call. Returns structured_data dict."""
    prompt = EXTRACTION_PROMPT
    if extra_prompt:
        prompt = f"{EXTRACTION_PROMPT}\n\n{extra_prompt}"

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        tools=[EXTRACTION_TOOL],
        tool_choice={"type": "tool", "name": "extract_document"},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}},
            ],
        }],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_document":
            return block.input
    raise RuntimeError("Extraction agent returned no tool_use block")


def _run_critique(client: anthropic.Anthropic, image_b64: str, media_type: str,
                  structured_data: dict) -> dict:
    """Critique agent — compares image against current extraction JSON."""
    import json
    json_str = json.dumps(structured_data, indent=2)[:6000]  # cap to avoid token overflow

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        tools=[CRITIQUE_TOOL],
        tool_choice={"type": "tool", "name": "critique_extraction"},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {"type": "text", "text": CRITIQUE_PROMPT.format(json_str=json_str)},
            ],
        }],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "critique_extraction":
            return block.input
    raise RuntimeError("Critique agent returned no tool_use block")


# ── Public API ────────────────────────────────────────────────────────────────

def agentic_extract(image_path: str, api_key: str, progress, max_passes: int = 4):
    """
    Multi-agent extraction loop.
    progress(event_dict) is called to stream status updates to the caller.
    Returns (structured_data, temp_dir, iteration_log).
    """
    client = anthropic.Anthropic(api_key=api_key)

    original_img = Image.open(image_path)
    if original_img.mode not in ("RGB", "L"):
        original_img = original_img.convert("RGB")

    temp_dir = tempfile.mkdtemp()

    # Prepare send image (resize if needed, keep original for crops)
    max_dim = 1568
    if max(original_img.size) > max_dim:
        ratio = max_dim / max(original_img.size)
        send_img = original_img.resize(
            (int(original_img.size[0] * ratio), int(original_img.size[1] * ratio)),
            Image.LANCZOS,
        )
        send_path = os.path.join(temp_dir, "_send.png")
        send_img.save(send_path)
    else:
        send_path = image_path

    image_b64, media_type = _encode_image(send_path)

    iteration_log = []
    structured_data = None
    # Tracks image elements that had successful crops — used to rescue dropped images
    best_image_elements: list[dict] = []

    for pass_num in range(1, max_passes + 1):
        # ── Extraction / Refinement pass ─────────────────────────────────────
        if pass_num == 1:
            progress({"type": "agent", "agent": 1, "pass": pass_num,
                      "message": "Agent 1 (Extractor): perceiving and interpreting document…"})
            extra = ""
        else:
            critique = iteration_log[-1]["critique"]
            issues_text = "\n".join(
                f"  [{i['severity'].upper()}] {i['description']} → Fix: {i['fix']}"
                for i in critique.get("issues", [])
            )
            missing_text = "\n".join(f"  - {m}" for m in critique.get("missing_content", []))

            # Build cumulative history from all previous passes for agent memory
            history_lines = []
            for prev in iteration_log:
                c = prev.get("critique")
                if c:
                    prev_issues = "; ".join(i["description"] for i in c.get("issues", []))
                    history_lines.append(
                        f"  Pass {prev['pass']}: score={c['quality_score']}/100 — {prev_issues or 'no issues listed'}"
                    )
            history_text = "\n".join(history_lines) if history_lines else "  (first refinement)"

            extra = REFINE_PROMPT_TEMPLATE.format(
                history=history_text,
                pass_num=pass_num,
                score=critique["quality_score"],
                issues=issues_text or "  (none listed)",
                missing=missing_text or "  (none listed)",
            )
            progress({"type": "agent", "agent": 1, "pass": pass_num,
                      "message": f"Agent 1 (Extractor): refinement pass {pass_num} — addressing {len(critique.get('issues', []))} issue(s)…"})

        structured_data = _run_extraction(client, image_b64, media_type, extra)
        structured_data["document"]["width"] = original_img.size[0]
        structured_data["document"]["height"] = original_img.size[1]
        _crop_image_elements(structured_data, original_img, temp_dir, pass_num=pass_num)

        elements = structured_data["document"]["elements"]

        # ── Image preservation safety net ─────────────────────────────────────
        # If images seen in previous passes are now gone, inject them back.
        current_image_paths = {
            e.get("image_path") for e in elements
            if e.get("type") == "image" and e.get("image_path")
        }
        rescued = 0
        for prev_img in best_image_elements:
            if prev_img.get("image_path") and prev_img["image_path"] not in current_image_paths:
                elements.append(prev_img)
                rescued += 1

        # Update best_image_elements: keep any image element with a valid crop
        best_image_elements = [
            dict(e) for e in elements
            if e.get("type") == "image" and e.get("image_path") and os.path.isfile(e["image_path"])
        ]

        n_elements = len(elements)
        n_images = sum(1 for e in elements if e.get("type") == "image")
        img_note = f", {n_images} image(s)" if n_images else ""
        if rescued:
            img_note += f" ({rescued} rescued)"
        progress({"type": "pass_done", "pass": pass_num, "elements": n_elements,
                  "message": f"Pass {pass_num} extracted {n_elements} elements{img_note}"})

        # ── Critique pass (skip after last extraction) ─────────────────────
        if pass_num == max_passes:
            iteration_log.append({"pass": pass_num, "elements": n_elements, "critique": None})
            progress({"type": "agent", "agent": 1, "pass": pass_num,
                      "message": f"Max passes reached. Finalizing with {n_elements} elements{img_note}."})
            break

        progress({"type": "agent", "agent": 2, "pass": pass_num,
                  "message": f"Agent 2 (Critic): auditing pass {pass_num} — checking images, text, structure…"})

        critique = _run_critique(client, image_b64, media_type, structured_data)
        score = critique["quality_score"]
        n_issues = len(critique.get("issues", []))
        n_critical = sum(1 for i in critique.get("issues", []) if i.get("severity") == "critical")

        msg = f"Agent 2 decision: {score}/100 — {n_issues} issue(s)"
        if n_critical:
            msg += f" ({n_critical} critical)"
        if critique["is_acceptable"]:
            msg += " — ACCEPTED"

        progress({"type": "critique_done", "pass": pass_num, "score": score,
                  "issues": n_issues, "acceptable": critique["is_acceptable"],
                  "message": msg})

        iteration_log.append({"pass": pass_num, "elements": n_elements, "critique": critique})

        if critique["is_acceptable"]:
            progress({"type": "converged", "pass": pass_num, "score": score,
                      "message": f"Quality gate passed ({score}/100). Converged after {pass_num} pass(es)."})
            break

    return structured_data, temp_dir, iteration_log


def verify_transcription(original_image_path: str, latex_source: str, api_key: str) -> dict:
    """Agent 3 — final review of LaTeX against original image."""
    client = anthropic.Anthropic(api_key=api_key)
    image_b64, media_type = _encode_image(original_image_path)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        tools=[VERIFICATION_TOOL],
        tool_choice={"type": "tool", "name": "report_verification"},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {
                    "type": "text",
                    "text": f"""You are Agent 3 (Verifier) — the final quality assurance step in an agentic document transcription pipeline.

Compare the original document image against the generated LaTeX output and report issues using report_verification.

```latex
{latex_source}
```

AUDIT CHECKLIST:
1. IMAGE PRESERVATION (check first): Are ALL visible diagrams, sketches, figures, charts, and graphs represented in the LaTeX? Missing images = high severity issue
2. TEXT COMPLETENESS: Missing sections, headings, paragraphs, or list items?
3. FORMATTING: Wrong heading levels, missing bold/italic, incorrect alignment?
4. TABLES & FORMULAS: Correctly transcribed?
5. COLUMN ORDER: Multi-column content in correct reading order?
6. ACCURACY: Misread words or introduced errors?

Be specific in your issues so the user knows exactly what to fix.""",
                },
            ],
        }],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "report_verification":
            return block.input
    raise RuntimeError("Verification agent returned no tool_use block")


def compile_latex_to_pdf(latex_source: str, images_dir: str | None = None) -> bytes:
    """Compile LaTeX to PDF using tectonic. Returns raw PDF bytes."""
    tectonic = shutil.which("tectonic")
    if not tectonic:
        raise RuntimeError("tectonic not found. Install: conda install -c conda-forge tectonic")

    with tempfile.TemporaryDirectory() as tmpdir:
        if images_dir and os.path.isdir(images_dir):
            for fname in os.listdir(images_dir):
                if not fname.startswith("_"):
                    src = os.path.join(images_dir, fname)
                    if os.path.isfile(src):
                        shutil.copy2(src, os.path.join(tmpdir, fname))

        tex_path = os.path.join(tmpdir, "document.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_source)

        result = subprocess.run(
            [tectonic, "--keep-logs", tex_path],
            capture_output=True, text=True, cwd=tmpdir,
        )

        pdf_path = os.path.join(tmpdir, "document.pdf")
        if os.path.exists(pdf_path):
            with open(pdf_path, "rb") as f:
                return f.read()

        log = ""
        log_path = os.path.join(tmpdir, "document.log")
        if os.path.exists(log_path):
            with open(log_path) as f:
                log = f.read()[-3000:]
        raise RuntimeError(f"Compilation failed.\nSTDERR:\n{result.stderr}\nLOG:\n{log}")


# ── LaTeX generation ──────────────────────────────────────────────────────────

def _escape_latex(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    text = text.replace("\\", r"\textbackslash{}")
    text = text.replace("&",  r"\&")
    text = text.replace("%",  r"\%")
    text = text.replace("$",  r"\$")
    text = text.replace("#",  r"\#")
    text = text.replace("^",  r"\^{}")
    text = text.replace("_",  r"\_")
    text = text.replace("{",  r"\{")
    text = text.replace("}",  r"\}")
    text = text.replace("~",  r"\textasciitilde{}")
    return text


def _styled(text: str, style: dict) -> str:
    text = _escape_latex(text)
    if style.get("bold"):      text = f"\\textbf{{{text}}}"
    if style.get("italic"):    text = f"\\textit{{{text}}}"
    if style.get("underline"): text = f"\\underline{{{text}}}"
    return text


def _render_element(element: dict, lines: list) -> None:
    etype  = element.get("type", "paragraph")
    style  = element.get("style", {})
    content = element.get("content", "")

    if etype == "heading":
        level = element.get("level", 1)
        cmd = {1: "section", 2: "subsection", 3: "subsubsection"}.get(level, "section")
        lines += [f"\\{cmd}{{{_escape_latex(str(content))}}}", ""]

    elif etype == "paragraph":
        text  = _styled(str(content), style)
        align = style.get("alignment", "left")
        if align == "center":
            lines += [r"\begin{center}", text, r"\end{center}", ""]
        elif align == "right":
            lines += [r"\begin{flushright}", text, r"\end{flushright}", ""]
        else:
            lines += [text, ""]

    elif etype == "list":
        items = content if isinstance(content, list) else []
        lines.append(r"\begin{itemize}[noitemsep]")
        for item in items:
            lines.append(f"  \\item {_escape_latex(str(item) if not isinstance(item, str) else item)}")
        lines += [r"\end{itemize}", ""]

    elif etype == "table":
        rows = content if isinstance(content, list) else []
        if rows and isinstance(rows[0], list):
            col_count = max(len(r) for r in rows)
            lines += [r"\begin{center}", r"\begin{tabular}{" + "|".join(["l"] * col_count) + "}", r"\toprule"]
            for i, row in enumerate(rows):
                cells = [_escape_latex(str(c)) for c in row]
                if i == 0:
                    cells = [f"\\textbf{{{c}}}" for c in cells]
                while len(cells) < col_count:
                    cells.append("")
                lines.append(" & ".join(cells) + r" \\")
                if i == 0:
                    lines.append(r"\midrule")
            lines += [r"\bottomrule", r"\end{tabular}", r"\end{center}", ""]

    elif etype == "formula":
        lines += [r"\begin{equation*}", str(content), r"\end{equation*}", ""]

    elif etype == "image":
        img_path = element.get("image_path")
        size     = element.get("image_size", "medium")
        width    = {"small": "0.3", "medium": "0.5", "large": "0.8"}.get(size, "0.5")
        caption  = str(content) if content and str(content) not in ("image", "") else ""
        if img_path and os.path.isfile(img_path):
            fname  = os.path.basename(img_path)
            lines += [r"\begin{figure}[htbp]", r"\centering",
                      f"\\includegraphics[width={width}\\textwidth]{{{fname}}}"]
        else:
            # Crop failed or bbox missing — render a visible placeholder so the image is not silently dropped
            desc = _escape_latex(caption) if caption else "Image region"
            lines += [r"\begin{figure}[htbp]", r"\centering",
                      f"\\fbox{{\\parbox{{{width}\\textwidth}}{{\\centering\\textit{{[{desc}]}}}}}}"]
        if caption:
            lines.append(f"\\caption{{{_escape_latex(caption)}}}")
        lines += [r"\end{figure}", ""]


def json_to_latex(json_data: dict) -> str:
    doc      = json_data.get("document", {})
    title    = doc.get("title") or "Untitled Document"
    elements = doc.get("elements", [])
    layout   = doc.get("layout", "single")
    num_cols = {"two-column": 2, "three-column": 3}.get(layout, 1)

    lines = [
        r"\documentclass[12pt,a4paper]{article}",
        r"\usepackage[utf8]{inputenc}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage{amsmath, amssymb}",
        r"\usepackage{graphicx}",
        r"\usepackage{booktabs}",
        r"\usepackage[margin=2cm]{geometry}",
        r"\usepackage{enumitem}",
        r"\usepackage[colorlinks=true,linkcolor=blue,urlcolor=blue]{hyperref}",
        r"\usepackage{soul, xcolor, parskip}",
    ]
    if num_cols > 1:
        lines.append(r"\usepackage{multicol}")

    lines += [
        "", f"\\title{{\\textbf{{{_escape_latex(title)}}}}}", r"\author{}", r"\date{}",
        "", r"\begin{document}", r"\maketitle", "",
    ]

    if num_cols == 1:
        for el in elements:
            _render_element(el, lines)
    else:
        col_groups: dict[int, list] = {}
        for el in elements:
            col_groups.setdefault(el.get("column", 1), []).append(el)

        lines.append(f"\\begin{{multicols}}{{{num_cols}}}")
        for col_num in sorted(col_groups.keys()):
            if col_num > 1:
                lines.append(r"\columnbreak")
            for el in col_groups[col_num]:
                _render_element(el, lines)
        lines.append(r"\end{multicols}")

    lines.append(r"\end{document}")
    return "\n".join(lines)
