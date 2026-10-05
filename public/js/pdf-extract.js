// Pulls plain text out of a PDF entirely client-side (pdf.js from cdnjs) so
// the CV keyword scan in apply.js has something to search. No upload to any
// third-party service - the file never leaves the browser.
// Exposed as window.extractPdfText(file) for the classic (non-module)
// scripts elsewhere on the page to call.
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs';

window.extractPdfText = async function extractPdfText(file) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    const maxPages = Math.min(pdf.numPages, 10);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(' ') + '\n';
      if (text.length > 50000) break;
    }
    return text.trim();
  } catch (e) {
    console.warn('[pdf-extract] could not read this PDF (scanned/image-only, or corrupted):', e);
    return '';
  }
};

window.pdfExtractReady = Promise.resolve(true);
