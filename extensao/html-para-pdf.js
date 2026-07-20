/**
 * Converte HTML completo (Requerimento / Memorial) em PDF visualmente fiel,
 * com brasão, logos e CSS — via html2pdf + renderização on-screen.
 */
(function (global) {
  "use strict";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function fetchAsDataUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await blobToDataUrl(blob);
    } catch {
      return null;
    }
  }

  /**
   * Mapa de assets do ZIP + fallbacks do site (brasão, logos).
   */
  async function montarAssetMap(srcZip) {
    const map = {};

    if (srcZip) {
      for (const path of Object.keys(srcZip.files)) {
        const f = srcZip.files[path];
        if (f.dir) continue;
        if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) continue;
        try {
          const blob = await f.async("blob");
          const dataUrl = await blobToDataUrl(blob);
          const base = path.split("/").pop();
          map[base] = dataUrl;
          map[path] = dataUrl;
          map["./" + base] = dataUrl;
        } catch (_) {}
      }
    }

    // Fallbacks locais do site (mesmos arquivos usados pelo app)
    const locais = [
      ["brasaodarepublica.png", "./brasaodarepublica.png"],
      ["brasao_instituicao.png", "./brasaodarepublica.png"],
      ["logo-uffs.png", "./logo-uffs.png"],
      ["logo_uffs.png", "./logo-uffs.png"],
      ["logo-ufes.png", "./logo-ufes.png"],
      ["logo_instituicao.png", "./logo-uffs.png"],
      ["logo_instituicao.png", "./logo-ufes.png"],
    ];
    for (const [key, url] of locais) {
      if (map[key]) continue;
      const dataUrl = await fetchAsDataUrl(url);
      if (dataUrl) {
        map[key] = dataUrl;
        map["./" + key] = dataUrl;
      }
    }

    return map;
  }

  function injectAssets(html, assetMap) {
    let out = String(html || "");

    // src="..." / src='...'
    out = out.replace(/src\s*=\s*(["'])([^"']+)\1/gi, (full, q, src) => {
      const raw = String(src).trim();
      if (raw.startsWith("data:")) return full;
      const base = raw.split("/").pop().split("?")[0];
      const dataUrl =
        assetMap[raw] ||
        assetMap[base] ||
        assetMap["./" + base] ||
        assetMap[decodeURIComponent(base)];
      if (dataUrl) return `src=${q}${dataUrl}${q}`;
      return full;
    });

    // url(...) em CSS inline
    out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, src) => {
      const raw = String(src).trim();
      if (raw.startsWith("data:")) return full;
      const base = raw.split("/").pop().split("?")[0];
      const dataUrl =
        assetMap[raw] || assetMap[base] || assetMap["./" + base];
      if (dataUrl) return `url("${dataUrl}")`;
      return full;
    });

    return out;
  }

  function buildFullDocument(html) {
    let work = String(html || "");

    // Já é documento completo?
    if (/<html[\s>]/i.test(work)) {
      // garantir charset e fundo branco
      if (!/<meta[^>]+charset/i.test(work)) {
        work = work.replace(
          /<head([^>]*)>/i,
          '<head$1><meta charset="utf-8">'
        );
      }
      return work;
    }

    // Extrair styles se houver fragmento
    const styles = [];
    work.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => {
      styles.push(m);
      return "";
    });
    let body = work;
    const bm = work.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bm) body = bm[1];

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff !important;
    color: #111111 !important;
    font-family: "Times New Roman", Times, Georgia, serif;
  }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
</style>
${styles.join("\n")}
</head>
<body>
${body}
</body>
</html>`;
  }

  function waitForImages(doc, timeoutMs) {
    const imgs = Array.from(doc.images || []);
    if (!imgs.length) return Promise.resolve();
    return Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, timeoutMs || 5000);
          })
      )
    );
  }

  /**
   * HTML string → PDF Uint8Array (layout fiel ao HTML original).
   */
  async function htmlParaPdfBytes(html, assetMap) {
    if (!global.html2pdf) {
      throw new Error("html2pdf não carregado");
    }

    let prepared = injectAssets(html, assetMap || {});
    // Não reintroduzir coluna de paginação; se existir por engano, remove
    prepared = prepared.replace(/<th[^>]*>\s*Comprovantes\s*<\/th>/gi, "");
    prepared = buildFullDocument(prepared);

    // Host visível (opacity mínima) — off-screen gera PDF em branco no html2canvas
    const host = document.createElement("div");
    host.setAttribute("data-rsc-html2pdf", "1");
    host.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:794px",
      "max-width:794px",
      "background:#ffffff",
      "color:#111111",
      "z-index:2147483000",
      "opacity:0.02",
      "pointer-events:none",
      "overflow:visible",
      "padding:0",
      "margin:0",
    ].join(";");

    // iframe isola estilos e recria documento completo (brasão + CSS)
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "rsc-html-pdf");
    iframe.style.cssText =
      "width:794px;min-height:1123px;border:0;display:block;background:#fff;";
    host.appendChild(iframe);
    document.body.appendChild(host);

    try {
      const idoc = iframe.contentDocument || iframe.contentWindow.document;
      idoc.open();
      idoc.write(prepared);
      idoc.close();

      await new Promise((resolve) => {
        if (idoc.readyState === "complete") resolve();
        else iframe.addEventListener("load", () => resolve(), { once: true });
        setTimeout(resolve, 1500);
      });

      // Força tema claro no documento impresso
      try {
        const fix = idoc.createElement("style");
        fix.textContent = `
          html, body { background:#fff !important; color:#111 !important; }
          body { width: 794px !important; margin: 0 auto !important; }
          .dark, .dark body { background:#fff !important; color:#111 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        `;
        (idoc.head || idoc.documentElement).appendChild(fix);
      } catch (_) {}

      await waitForImages(idoc, 6000);
      await sleep(300);

      // Ajusta altura do iframe ao conteúdo
      try {
        const h = Math.max(
          idoc.body.scrollHeight,
          idoc.documentElement.scrollHeight,
          1123
        );
        iframe.style.height = h + "px";
      } catch (_) {}

      await sleep(150);

      const target = idoc.body;
      const worker = global
        .html2pdf()
        .set({
          margin: [10, 10, 12, 10],
          filename: "documento.pdf",
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: "#ffffff",
            windowWidth: 794,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDoc) => {
              try {
                const b = clonedDoc.body;
                if (b) {
                  b.style.background = "#ffffff";
                  b.style.color = "#111111";
                }
              } catch (_) {}
            },
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
          enableLinks: false,
        })
        .from(target);

      const ab = await worker.outputPdf("arraybuffer");
      const bytes = new Uint8Array(ab);
      if (!bytes.length) throw new Error("PDF gerado vazio");
      return bytes;
    } finally {
      try {
        host.remove();
      } catch (_) {}
    }
  }

  global.RSCHtmlParaPdf = {
    htmlParaPdfBytes,
    montarAssetMap,
    injectAssets,
    blobToDataUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
