/**
 * HTML → PDF fiel (Requerimento / Memorial)
 * ----------------------------------------------------------------------------
 * Estratégia:
 *  1) Documento self-contained (imagens em data URL)
 *  2) Render no DOM principal (sem iframe — html2canvas falha/corta em iframe)
 *  3) Captura ALTURA TOTAL (scrollHeight)
 *  4) Fatia o canvas em páginas A4 com jsPDF
 * ----------------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  const PAGE_WIDTH_PX = 794; // ~A4 @ 96dpi

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
      return await blobToDataUrl(await res.blob());
    } catch {
      return null;
    }
  }

  async function montarAssetMap(srcZip) {
    const map = {};

    if (srcZip) {
      for (const path of Object.keys(srcZip.files)) {
        const f = srcZip.files[path];
        if (f.dir) continue;
        if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) continue;
        try {
          const dataUrl = await blobToDataUrl(await f.async("blob"));
          const base = path.split("/").pop();
          map[base] = dataUrl;
          map[path] = dataUrl;
          map["./" + base] = dataUrl;
        } catch (_) {}
      }
    }

    const locais = [
      ["brasaodarepublica.png", "./brasaodarepublica.png"],
      ["brasao_instituicao.png", "./brasaodarepublica.png"],
      ["logo-uffs.png", "./logo-uffs.png"],
      ["logo_uffs.png", "./logo-uffs.png"],
      ["logo-ufes.png", "./logo-ufes.png"],
      ["logo_instituicao.png", "./logo-uffs.png"],
    ];
    for (const [key, url] of locais) {
      if (map[key]) continue;
      const dataUrl = await fetchAsDataUrl(url);
      if (dataUrl) {
        map[key] = dataUrl;
        map["./" + key] = dataUrl;
      }
    }
    // se logo_instituicao ainda vazio, tenta ufes
    if (!map["logo_instituicao.png"]) {
      const u = await fetchAsDataUrl("./logo-ufes.png");
      if (u) map["logo_instituicao.png"] = u;
    }
    return map;
  }

  function injectAssets(html, assetMap) {
    let out = String(html || "");
    out = out.replace(/src\s*=\s*(["'])([^"']+)\1/gi, (full, q, src) => {
      const raw = String(src).trim();
      if (raw.startsWith("data:")) return full;
      const base = raw.split("/").pop().split("?")[0];
      const dataUrl =
        assetMap[raw] ||
        assetMap[base] ||
        assetMap["./" + base] ||
        assetMap[decodeURIComponent(base)];
      return dataUrl ? `src=${q}${dataUrl}${q}` : full;
    });
    out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, src) => {
      const raw = String(src).trim();
      if (raw.startsWith("data:")) return full;
      const base = raw.split("/").pop().split("?")[0];
      const dataUrl = assetMap[raw] || assetMap[base] || assetMap["./" + base];
      return dataUrl ? `url("${dataUrl}")` : full;
    });
    return out;
  }

  function extractParts(html) {
    const styles = [];
    String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => {
      styles.push(m);
      return "";
    });
    // link stylesheets — ignora (vamos injetar assets)
    let body = html;
    const bm = String(html).match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bm) body = bm[1];
    else if (/<html[\s>]/i.test(html)) {
      // body ausente: usa tudo sem head
      body = String(html)
        .replace(/<head[\s\S]*?<\/head>/i, "")
        .replace(/<\/?html[^>]*>/gi, "");
    }
    body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
    return { styles: styles.join("\n"), body };
  }

  async function waitImages(root, timeoutMs) {
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, timeoutMs || 8000);
          })
      )
    );
  }

  function getHtml2Canvas() {
    if (typeof global.html2canvas === "function") return global.html2canvas;
    throw new Error("html2canvas não carregado");
  }

  function getJsPDF() {
    const j =
      (global.jspdf && global.jspdf.jsPDF) ||
      global.jsPDF ||
      (global.jspdf && global.jspdf.default);
    if (!j) throw new Error("jsPDF não carregado");
    return j;
  }

  /**
   * Fatia um canvas alto em páginas A4 e devolve Uint8Array PDF.
   */
  function canvasToPdfBytes(canvas) {
    const jsPDF = getJsPDF();
    const pdf = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
      compress: true,
    });

    const pageW = pdf.internal.pageSize.getWidth(); // 210
    const pageH = pdf.internal.pageSize.getHeight(); // 297
    const margin = 8; // mm
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    // Largura do canvas → contentW mm
    const pxPerMm = canvas.width / contentW;
    const pageHeightPx = Math.floor(contentH * pxPerMm);

    if (pageHeightPx < 50) {
      throw new Error("Altura de página inválida na conversão PDF");
    }

    let y = 0;
    let pageIndex = 0;

    while (y < canvas.height) {
      const sliceH = Math.min(pageHeightPx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0,
        y,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH
      );

      const imgData = slice.toDataURL("image/jpeg", 0.92);
      const sliceHmm = sliceH / pxPerMm;

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, margin, contentW, sliceHmm, undefined, "FAST");

      y += sliceH;
      pageIndex++;
      // segurança
      if (pageIndex > 80) break;
    }

    if (pageIndex === 0) throw new Error("Nenhuma página gerada no PDF");

    const ab = pdf.output("arraybuffer");
    return new Uint8Array(ab);
  }

  /**
   * HTML → PDF Uint8Array
   */
  async function htmlParaPdfBytes(html, assetMap) {
    const h2c = getHtml2Canvas();
    getJsPDF();

    let prepared = injectAssets(html, assetMap || {});
    prepared = prepared.replace(/<th[^>]*>\s*Comprovantes\s*<\/th>/gi, "");
    const parts = extractParts(prepared);

    // Host no documento principal — largura fixa A4
    const host = document.createElement("div");
    host.setAttribute("data-rsc-pdf-host", "1");
    host.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:" + PAGE_WIDTH_PX + "px",
      "max-width:" + PAGE_WIDTH_PX + "px",
      "background:#ffffff",
      "color:#111111",
      "z-index:2147483646",
      // precisa ser “visível” para o motor de layout; opacity baixa ok
      "opacity:0.05",
      "pointer-events:none",
      "overflow:visible",
      "margin:0",
      "padding:0",
      "box-sizing:border-box",
    ].join(";");

    const shell = document.createElement("div");
    shell.style.cssText =
      "width:" +
      PAGE_WIDTH_PX +
      "px;background:#fff;color:#111;box-sizing:border-box;padding:12px 16px;";
    shell.innerHTML =
      (parts.styles || "") +
      `<style>
        html,body{background:#fff!important;color:#111!important;}
        *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;}
        img{max-width:100%;height:auto;}
        table{border-collapse:collapse;width:100%;}
        .dark, .dark *{background:transparent!important;color:#111!important;}
      </style>` +
      (parts.body || "");

    host.appendChild(shell);
    document.body.appendChild(host);

    try {
      await waitImages(shell, 8000);
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      } catch (_) {}
      await sleep(250);

      // Força reflow e mede altura real
      const fullHeight = Math.max(
        shell.scrollHeight,
        shell.offsetHeight,
        shell.getBoundingClientRect().height
      );
      if (fullHeight < 40) {
        throw new Error("Conteúdo HTML sem altura mensurável (vazio?)");
      }

      const canvas = await h2c(shell, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: PAGE_WIDTH_PX,
        windowWidth: PAGE_WIDTH_PX,
        height: Math.ceil(fullHeight),
        windowHeight: Math.ceil(fullHeight),
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        foreignObjectRendering: false,
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          try {
            const el = clonedDoc.querySelector("[data-rsc-pdf-host] > div");
            if (el) {
              el.style.opacity = "1";
              el.style.background = "#ffffff";
              el.style.color = "#111111";
            }
            clonedDoc.body.style.background = "#ffffff";
          } catch (_) {}
        },
      });

      if (!canvas || canvas.width < 10 || canvas.height < 10) {
        throw new Error("html2canvas retornou canvas vazio");
      }

      const bytes = canvasToPdfBytes(canvas);
      // magia %PDF
      const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (head !== "%PDF") throw new Error("Saída não é PDF válido");
      if (bytes.length < 2000) throw new Error("PDF suspeitamente pequeno");
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
    canvasToPdfBytes,
  };
})(typeof window !== "undefined" ? window : globalThis);
