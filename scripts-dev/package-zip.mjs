// Monta dist/ com só os arquivos que o Foundry precisa em runtime
// (sem package.json, eslint config, .git etc.) e zipa em dist/module.zip.
// Usado por `npm run package` e pelo workflow de release do GitHub Actions.
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import zip from 'bestzip'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')

const RUNTIME_FILES = ['module.json', 'scripts', 'styles', 'lang', 'LICENSE', 'README.md', 'CHANGELOG.md']

// No CI, a tag da release (ex.: refs/tags/v1.2.3, via GITHUB_REF_NAME=v1.2.3)
// atualiza version/download dentro do module.json empacotado, para o link
// de download sempre bater com a tag publicada. Localmente, sem essa env
// var, o module.json vai pro dist sem alteração.
async function patchManifestVersion() {
  const tag = process.env.GITHUB_REF_NAME
  if (!tag) return

  const version = tag.replace(/^v/, '')
  const manifestPath = path.join(dist, 'module.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  manifest.version = version
  if (manifest.download) {
    manifest.download = manifest.download.replace(/download\/v[^/]+\//, `download/${tag}/`)
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`module.json ajustado para a tag ${tag} (version ${version})`)
}

async function main() {
  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })

  for (const entry of RUNTIME_FILES) {
    await cp(path.join(root, entry), path.join(dist, entry), { recursive: true })
  }

  await patchManifestVersion()

  await zip({
    source: '*',
    destination: '../module.zip',
    cwd: dist,
  })

  console.log(`Empacotado: ${path.join(dist, 'module.zip')}`)
  console.log(`Manifesto solto (para o asset "module.json" do release): ${path.join(dist, 'module.json')}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
