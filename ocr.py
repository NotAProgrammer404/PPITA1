#!/usr/bin/env python3
"""
Layout-Preserving OCR using Google Gemini Vision API
Preserves document layout and handles images intelligently.
"""

import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import Image

# Load environment variables
load_dotenv()

# Configure Gemini API
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    print("Error: GOOGLE_API_KEY not found in .env file")
    print("Please copy .env.example to .env and add your API key")
    sys.exit(1)

genai.configure(api_key=GOOGLE_API_KEY)


def process_image(image_path: str, output_path: str = None) -> str:
    """
    Process an image using Gemini Vision API to extract text with layout preservation.
    
    Args:
        image_path: Path to the image file
        output_path: Optional path for output file
        
    Returns:
        Extracted text in Markdown format
    """
    try:
        # Load and validate image
        img = Image.open(image_path)
        print(f"📄 Processing: {image_path}")
        print(f"   Image size: {img.size[0]}x{img.size[1]} pixels")
        
        # Initialize Gemini model with vision capabilities
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Craft prompt for layout preservation
        prompt = """Analyze this document image and extract ALL text while preserving the exact layout and structure.

IMPORTANT INSTRUCTIONS:
1. Preserve the document hierarchy using Markdown:
   - Use # for main headings, ## for subheadings, ### for sub-subheadings
   - Maintain paragraph breaks and spacing
   - Keep lists (ordered and unordered) in their original format
   - Preserve table structure using Markdown tables
   
2. For images/figures in the document:
   - Note their position with: ![Image: brief description](image_placeholder.jpg)
   - Describe what the image shows
   
3. Formatting:
   - Use **bold** for bold text
   - Use *italic* for italic text
   - Use `code` for monospace/code text
   - Preserve alignment where obvious
   
4. Extract ALL text exactly as it appears
5. Maintain the reading order (top to bottom, left to right)

Output ONLY the formatted Markdown content, no explanations or preamble."""

        # Generate content
        print("🤖 Analyzing with Gemini Vision...")
        response = model.generate_content([prompt, img])
        
        # Extract text
        extracted_text = response.text
        
        # Save to file if output path specified
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(extracted_text)
            print(f"✅ Saved to: {output_path}")
        
        return extracted_text
        
    except FileNotFoundError:
        print(f"❌ Error: File not found: {image_path}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error processing image: {str(e)}")
        sys.exit(1)


def process_pdf(pdf_path: str, output_path: str = None) -> str:
    """
    Process a PDF file by converting pages to images and processing each.
    
    Args:
        pdf_path: Path to the PDF file
        output_path: Optional path for output file
        
    Returns:
        Extracted text from all pages in Markdown format
    """
    try:
        from pdf2image import convert_from_path
        
        print(f"📚 Processing PDF: {pdf_path}")
        
        # Convert PDF to images
        print("🔄 Converting PDF pages to images...")
        images = convert_from_path(pdf_path)
        print(f"   Found {len(images)} page(s)")
        
        # Initialize Gemini model
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        all_pages_text = []
        
        # Process each page
        for i, img in enumerate(images, 1):
            print(f"\n📄 Processing page {i}/{len(images)}...")
            
            prompt = """Analyze this document page and extract ALL text while preserving the exact layout and structure.

IMPORTANT INSTRUCTIONS:
1. Preserve the document hierarchy using Markdown:
   - Use # for main headings, ## for subheadings, ### for sub-subheadings
   - Maintain paragraph breaks and spacing
   - Keep lists (ordered and unordered) in their original format
   - Preserve table structure using Markdown tables
   
2. For images/figures in the document:
   - Note their position with: ![Image: brief description](image_placeholder.jpg)
   - Describe what the image shows
   
3. Formatting:
   - Use **bold** for bold text
   - Use *italic* for italic text
   - Use `code` for monospace/code text
   
4. Extract ALL text exactly as it appears
5. Maintain the reading order (top to bottom, left to right)

Output ONLY the formatted Markdown content, no explanations or preamble."""

            response = model.generate_content([prompt, img])
            page_text = response.text
            
            # Add page separator
            if i > 1:
                all_pages_text.append(f"\n\n---\n**Page {i}**\n---\n\n")
            else:
                all_pages_text.append(f"**Page {i}**\n\n")
            
            all_pages_text.append(page_text)
        
        # Combine all pages
        full_text = "".join(all_pages_text)
        
        # Save to file if output path specified
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(full_text)
            print(f"\n✅ Saved to: {output_path}")
        
        return full_text
        
    except ImportError:
        print("❌ Error: pdf2image not installed or poppler-utils missing")
        print("Install with: pip install pdf2image")
        print("On Linux, also run: sudo apt-get install poppler-utils")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error processing PDF: {str(e)}")
        sys.exit(1)


def main():
    """Main entry point for the OCR tool."""
    parser = argparse.ArgumentParser(
        description='Layout-Preserving OCR using Gemini Vision API',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ocr.py document.png
  python ocr.py report.pdf -o output.md
  python ocr.py image.jpg --output result.md
        """
    )
    
    parser.add_argument('input', help='Input image or PDF file')
    parser.add_argument('-o', '--output', help='Output Markdown file (optional)')
    
    args = parser.parse_args()
    
    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ Error: Input file not found: {args.input}")
        sys.exit(1)
    
    # Determine output path
    if args.output:
        output_path = args.output
    else:
        output_path = input_path.stem + '_ocr.md'
    
    # Process based on file type
    file_ext = input_path.suffix.lower()
    
    print("=" * 60)
    print("🔍 Layout-Preserving OCR with Gemini Vision")
    print("=" * 60)
    
    if file_ext == '.pdf':
        result = process_pdf(str(input_path), output_path)
    elif file_ext in ['.png', '.jpg', '.jpeg', '.webp', '.gif']:
        result = process_image(str(input_path), output_path)
    else:
        print(f"❌ Error: Unsupported file type: {file_ext}")
        print("Supported formats: PNG, JPG, JPEG, WEBP, GIF, PDF")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✨ Processing complete!")
    print("=" * 60)
    
    # Display preview
    print("\n📝 Preview (first 500 characters):")
    print("-" * 60)
    print(result[:500])
    if len(result) > 500:
        print("...")
    print("-" * 60)


if __name__ == '__main__':
    main()
