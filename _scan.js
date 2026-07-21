const fs = require("fs");
const path = require("path");
const page = path.join(__dirname, "next/static/chunks/app/page-ae349f5f44240e53.js");
let js = fs.readFileSync(page, "utf8");
js = js.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
js = js.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const needles = [
  "Descritivo",
  "descritivo",
  "Observa",
  "observa",
  "Referência",
  "comprovante",
  "placeholder",
  "documentIds",
  "onChange",
  "label",
  "anexo",
  "Anexo",
  "textarea",
  "notes",
  "note",
  "caption",
  "title:",
  "description:",
];

for (const n of needles) {
  let idx = 0,
    c = 0;
  while ((idx = js.indexOf(n, idx)) >= 0 && c < 3) {
    if (n.length < 5 && c > 0) {
      idx++;
      continue;
    }
    console.log("\n##", n, idx);
    console.log(js.slice(Math.max(0, idx - 80), idx + 200).replace(/\s+/g, " "));
    idx++;
    c++;
  }
}

// export backup - what fields in documents
const exp = js.indexOf('t.file("dados.json"');
console.log("\n## export dados", exp);
console.log(js.slice(exp - 400, exp + 200));

// H normalizer documents
const h = js.indexOf("H=e=>{");
console.log("\n## H", h);
console.log(js.slice(h, h + 1200));
