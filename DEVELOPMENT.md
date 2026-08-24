# Desenvolvimento

## 1. Colocar o projeto pra rodar no seu Foundry local

Foundry só enxerga módulos dentro de `<seu dataPath>/Data/modules/`. Duas formas de trabalhar sem ficar copiando arquivo toda hora:

**Link simbólico (recomendado — edita aqui, reflete lá direto):**

```bash
# Linux/macOS
ln -s /caminho/para/connection-guard "/caminho/para/FoundryData/Data/modules/connection-guard"

# Windows (PowerShell como administrador)
New-Item -ItemType SymbolicLink -Path "C:\FoundryData\Data\modules\connection-guard" -Target "C:\caminho\para\connection-guard"
```

Depois é só ativar o módulo em **Configurar Jogo → Gerenciar Módulos** e dar F5 no navegador a cada mudança (não tem bundler, então não precisa de build — é ES Module puro, o navegador lê direto).

## 2. Rodando lint/format localmente

```bash
npm install
npm run lint      # eslint
npm run format    # prettier, escreve por cima
```

## 3. Subindo pro GitHub

Este projeto já vem com `git init` feito e o primeiro commit pronto. Só falta apontar pro seu repositório:

```bash
git remote add origin git@github.com:SoftMissT/foundry-vtt-connection-guard.git
git branch -M main
git push -u origin main
```

As URLs em `module.json` (`url` e `manifest`) já apontam para `SoftMissT/foundry-vtt-connection-guard`. Se algum dia trocar de conta/organização, atualize essas duas — o `download` é reescrito automaticamente a cada release (ver §4).

## 4. Publicando uma versão (release)

O workflow `.github/workflows/release.yml` já está configurado: toda vez que você empurra uma tag `vX.Y.Z`, o GitHub Actions roda lint, empacota `dist/module.zip` e `dist/module.json`, e cria uma Release anexando os dois arquivos — que é exatamente o formato que o instalador de módulos do Foundry espera (`manifest` aponta pro `module.json` da última release, `download` aponta pro `.zip` da tag).

Fluxo normal de release:

```bash
# 1. bump de versão nos dois lugares
#    - package.json -> "version"
#    - module.json  -> "version"

git add -A
git commit -m "release: v1.1.0"
git tag v1.1.0
git push origin main --tags
```

O Actions cuida do resto. Depois de alguns minutos a release aparece em `github.com/SoftMissT/foundry-vtt-connection-guard/releases`.

### Empacotar manualmente (sem depender do CI)

```bash
npm run package
# gera dist/module.zip e dist/module.json
```

## 5. Estrutura do repositório

```
.github/workflows/release.yml   CI: lint + package + publicar release na tag
scripts-dev/package-zip.mjs     monta dist/ (só arquivos de runtime) e zipa
scripts/                        código do módulo (ESM, roda direto no navegador)
lang/                           traduções (pt-BR principal, en fallback)
styles/                         CSS
module.json                     manifesto do Foundry
package.json                    dependências de DEV (lint/format/package) — nada disso vai pro zip
eslint.config.js, .prettierrc   configuração das ferramentas de lint/format
```

`scripts-dev/` é separado de `scripts/` de propósito: `scripts/` é código que o Foundry carrega em runtime (fica no zip), `scripts-dev/` é ferramenta interna de build que não deve ir pro pacote final — por isso `package-zip.mjs` monta `dist/` copiando só a lista `RUNTIME_FILES`.
