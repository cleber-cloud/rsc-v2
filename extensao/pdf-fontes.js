/**
 * Fontes Noto Sans (pt-BR) para capas e documentos PDF.
 */
(function (global) {
  "use strict";

  let cache = null;

  async function fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fonte não encontrada: " + url);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function loadFontBytes() {
    if (cache) return cache;
    const base = "./extensao/vendor/fonts/";
    const [regular, bold] = await Promise.all([
      fetchBytes(base + "NotoSans-Regular.ttf"),
      fetchBytes(base + "NotoSans-Bold.ttf"),
    ]);
    cache = { regular, bold };
    return cache;
  }

  /**
   * @param {import('pdf-lib').PDFDocument} pdf
   */
  async function embedNoto(pdf) {
    const { regular, bold } = await loadFontBytes();
    const font = await pdf.embedFont(regular, { subset: true });
    const fontBold = await pdf.embedFont(bold, { subset: true });
    return { font, fontBold, embedded: true };
  }

  function wrapText(text, font, size, maxWidth) {
    const words = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      try {
        if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
        else {
          if (line) lines.push(line);
          // palavra sozinha maior que a linha: quebra forçada
          if (font.widthOfTextAtSize(w, size) > maxWidth) {
            let chunk = "";
            for (const ch of w) {
              const t2 = chunk + ch;
              if (font.widthOfTextAtSize(t2, size) <= maxWidth) chunk = t2;
              else {
                if (chunk) lines.push(chunk);
                chunk = ch;
              }
            }
            line = chunk;
          } else line = w;
        }
      } catch {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function fmtPt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    return x.toLocaleString("pt-BR", {
      minimumFractionDigits: Number.isInteger(x) ? 0 : 1,
      maximumFractionDigits: 2,
    });
  }

  global.RSCPdfFontes = {
    embedNoto,
    loadFontBytes,
    wrapText,
    fmtPt,
    A4: { width: 595.28, height: 841.89 },
    // Descrição breve: ~2–3 linhas na capa com fonte 12
    DESC_MAX_CHARS: 220,
    DESC_MEDIA_PALAVRAS: 35,
  };
})(typeof window !== "undefined" ? window : globalThis);
