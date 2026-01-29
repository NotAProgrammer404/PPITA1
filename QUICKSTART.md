# Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Set Up Your Environment

```bash
# Navigate to the project directory
cd layout-ocr

# Create a virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

**For PDF support on Linux**, also install poppler:
```bash
sudo apt-get install poppler-utils
```

### Step 3: Configure Your API Key

1. Get your **FREE** API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and add your API key:
   ```
   GOOGLE_API_KEY=your_actual_api_key_here
   ```

### Step 4: Run Your First OCR!

```bash
# Process an image
python ocr.py your_document.png

# Process a PDF
python ocr.py your_document.pdf

# Specify output file
python ocr.py document.jpg -o result.md
```

## 📝 What You'll Get

The tool generates Markdown files that preserve:
- ✅ Document structure (headings, paragraphs)
- ✅ Formatting (bold, italic, lists, tables)
- ✅ Image positions with descriptions
- ✅ Multi-page layouts (for PDFs)

## 🎯 Example Output

Input: A document with a heading, paragraph, and image

Output (`document_ocr.md`):
```markdown
# Main Heading

This is a paragraph with **bold text** and *italic text*.

![Image: A chart showing sales data](image_placeholder.jpg)

## Subheading

- List item 1
- List item 2
```

## 🆘 Troubleshooting

**"GOOGLE_API_KEY not found"**
- Make sure you created `.env` file (not `.env.example`)
- Check that your API key is correctly pasted

**PDF processing fails**
- Install poppler-utils: `sudo apt-get install poppler-utils`

**Poor quality results**
- Try higher resolution images
- Ensure text is clear and readable

## 💡 Tips for Best Results

1. Use high-quality images (300+ DPI recommended)
2. Ensure good contrast between text and background
3. Avoid heavily skewed or rotated documents
4. For best layout preservation, use clean, well-formatted documents

## 📚 Next Steps

- Try processing different document types
- Experiment with complex layouts (tables, multi-column)
- Process multi-page PDFs
- Integrate into your workflow!

---

**Need help?** Check the main [README.md](README.md) for more details.
