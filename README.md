# Layout-Preserving OCR with Gemini Vision

A powerful OCR tool that preserves document layout and handles images using Google's Gemini Vision API.

## Features

✨ **Layout Preservation** - Maintains document structure including headings, paragraphs, lists, and tables  
🖼️ **Image Handling** - Detects, describes, and references images within documents  
📄 **Multi-format Support** - Works with PNG, JPG, JPEG, and PDF files  
📝 **Markdown Output** - Generates clean, formatted Markdown with preserved layout  
🚀 **Powered by Gemini** - Uses Google's state-of-the-art vision AI

## Prerequisites

- Python 3.8 or higher
- Google AI Studio API key (free with Google AI Studio)

## Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd layout-ocr
```

2. **Create a virtual environment**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Set up your API key**
   - Get your free API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Copy `.env.example` to `.env`
   - Add your API key to `.env`:
   ```
   GOOGLE_API_KEY=your_actual_api_key_here
   ```

## Usage

```bash
python ocr.py <image_or_pdf_path>
```

### Examples

```bash
# Process a single image
python ocr.py document.png

# Process a PDF
python ocr.py report.pdf

# Specify output file
python ocr.py document.jpg -o output.md
```

## Output

The tool generates Markdown files that preserve:
- Document structure and hierarchy
- Text formatting
- Image positions with descriptions
- Tables and lists
- Page breaks (for multi-page documents)

## Project Structure

```
layout-ocr/
├── ocr.py              # Main OCR script
├── requirements.txt    # Python dependencies
├── .env.example        # API key template
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## License

MIT License - Free for educational and commercial use

## Contributing

This is a school project, but contributions and suggestions are welcome!

## Troubleshooting

**API Key Issues**: Make sure your `.env` file contains a valid Google AI Studio API key

**PDF Processing**: Requires `poppler-utils` on Linux:
```bash
sudo apt-get install poppler-utils
```

## Acknowledgments

Built with Google Gemini Vision API for a school project.
