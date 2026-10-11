/**
 * Dev server only: load Cartheon's Neue Frutiger from where it already lives on this machine.
 *
 * The font is licensed to Cartheon and must not be redistributed, so it is never copied into this repo
 * or into `npm run build`. Set CARTHEON_FONTS to the folder holding the NeueFrutigerWorld-*.woff2 files;
 * otherwise the known Cartheon checkouts are tried. Without it the page falls back to Source Sans 3.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Plugin } from 'vite'

const FACES: [number, string][] = [
  [300, 'NeueFrutigerWorld-Light.woff2'],
  [400, 'NeueFrutigerWorld-Regular.woff2'],
  [500, 'NeueFrutigerWorld-Medium.woff2'],
  [700, 'NeueFrutigerWorld-Bold.woff2'],
  [800, 'NeueFrutigerWorld-Heavy.woff2'],
]

function candidates(): string[] {
  const home = os.homedir()
  return [
    process.env.CARTHEON_FONTS,
    path.join(home, 'Documents/QuantumStartup/cartheon/packages/design-system/src/fonts'),
    path.join(home, 'Documents/QuantumStartup/cartheon/apps/portal/app/fonts'),
  ].filter((d): d is string => !!d)
}

export function cartheonFonts(): Plugin {
  const dir = candidates().find((d) => fs.existsSync(path.join(d, FACES[1][1])))
  return {
    name: 'cartheon-fonts',
    apply: 'serve',
    configResolved(config) {
      config.logger.info(dir ? `Neue Frutiger from ${dir}` : 'Neue Frutiger not found locally, using Source Sans 3', { timestamp: true })
    },
    configureServer(server) {
      if (!dir) return
      server.middlewares.use('/__fonts', (req, res, next) => {
        const file = path.basename(decodeURIComponent((req.url ?? '').split('?')[0]))
        const full = path.join(dir, file)
        if (!FACES.some(([, f]) => f === file) || !fs.existsSync(full)) return next()
        res.setHeader('Content-Type', 'font/woff2')
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(full).pipe(res)
      })
    },
    transformIndexHtml() {
      if (!dir) return
      const css = FACES.map(
        ([w, f]) => `@font-face{font-family:"Neue Frutiger";src:url("/__fonts/${f}") format("woff2");font-weight:${w};font-display:swap}`,
      ).join('')
      return [{ tag: 'style', attrs: { 'data-cartheon-fonts': '' }, children: css, injectTo: 'head-prepend' }]
    },
  }
}
