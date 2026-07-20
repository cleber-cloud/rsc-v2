# Publicar no GitHub Pages

Esta pasta está **pronta** para o GitHub Pages (site estático).

## Conteúdo

- `index.html` — app completa  
- `next/` — JS/CSS/fontes (nome sem `_` para o GitHub Pages/Jekyll servir corretamente)  
- `extensao/` — ANEXOS consolidados + importar backup  
- logos, `uffs-layout.css`  
- **`.nojekyll`** — recomendado no Pages  

Caminhos são **relativos** (`./next/...`), para funcionar em:

`https://SEU_USUARIO.github.io/NOME_DO_REPO/`

---

## Passo a passo (recomendado)

### 1. Criar repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)  
2. Nome, ex.: `calculadora-rsc`  
3. Público  
4. **Não** marque “Add README” (pode criar vazio)  
5. Create repository  

### 2. Enviar esta pasta

No PowerShell (ajuste o caminho do seu usuário GitHub):

```powershell
cd "D:\Calculadora TAEs\github-pages"

git init
git add .
git commit -m "Assistente RSC-PCCTAE para GitHub Pages"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/calculadora-rsc.git
git push -u origin main
```

(Substitua `SEU_USUARIO` e o nome do repositório.)

### 3. Ativar o Pages

1. No repositório → **Settings** → **Pages**  
2. **Source:** Deploy from a branch  
3. **Branch:** `main`  
4. **Folder:** `/ (root)`  
5. **Save**  

Aguarde 1–2 minutos.

### 4. Abrir o site

URL típica:

```
https://SEU_USUARIO.github.io/calculadora-rsc/
```

(O nome final depende do repositório.)

---

## Atualizar depois

```powershell
cd "D:\Calculadora TAEs\github-pages"
git add .
git commit -m "Atualiza calculadora"
git push
```

O Pages atualiza sozinho em alguns minutos.

---

## Checklist

- [ ] Arquivo `.nojekyll` está no repositório (raiz)  
- [ ] `index.html` está na **raiz** do repo (não dentro de outra pasta)  
- [ ] Settings → Pages → branch `main` / root  
- [ ] Site abre e carrega o visual verde  
- [ ] No DevTools → Network, `./_next/...` e `./extensao/...` retornam 200  

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| Página em branco / 404 em JS/CSS | A pasta deve se chamar `next/` (não `_next/`); confira a raiz do repo |
| CSS/JS não carregam | Confirme a URL `...github.io/NOME_REPO/` e que o Pages usa branch `main` / root |
| “Site not found” | Aguarde o deploy verde em Actions / Settings → Pages |

---

## Observações

- Dados e PDFs ficam no **navegador do usuário**, não no GitHub.  
- Limites do Pages: ~100 GB/mês (soft), site até 1 GB — suficiente para esta ferramenta.  
- Não suba a pasta pai “Calculadora TAEs” inteira — só o conteúdo de **`github-pages`**.  
