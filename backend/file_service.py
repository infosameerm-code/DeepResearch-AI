
import io
from pathlib import Path

import fitz
from docx import Document


MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def extract_file_text(filename: str, file_content: bytes) -> str:
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(
            "Unsupported file format. Upload PDF, DOCX or TXT."
        )

    if len(file_content) > MAX_FILE_SIZE:
        raise ValueError("File size must not exceed 10 MB.")

    if not file_content:
        raise ValueError("The uploaded file is empty.")

    extracted_text = ""

    # PDF EXTRACTION
    if extension == ".pdf":
        pdf = fitz.open(
            stream=file_content,
            filetype="pdf"
        )

        try:
            extracted_text = "\n".join(
                page.get_text() for page in pdf
            )
        finally:
            pdf.close()

    # DOCX EXTRACTION
    elif extension == ".docx":
        document = Document(
            io.BytesIO(file_content)
        )

        extracted_text = "\n".join(
            paragraph.text
            for paragraph in document.paragraphs
        )

    # TXT EXTRACTION
    elif extension == ".txt":
        extracted_text = file_content.decode(
            "utf-8-sig",
            errors="replace"
        )

    extracted_text = extracted_text.strip()

    if not extracted_text:
        raise ValueError(
            "No readable text found in this file. "
            "Scanned PDFs may require OCR."
        )

    return extracted_text
