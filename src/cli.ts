import { readFile, writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer'
import sade from 'sade'
import { red, yellow } from 'yoctocolors'
import { init, render, validate } from './index.js'

// Trick Rollup into not bundling package.json
const pkgPath = '../package.json'
const pkg = JSON.parse(
  await readFile(new URL(pkgPath, import.meta.url), 'utf-8'),
)

type RenderOptions = {
  output: string
  theme?: string
  browser_bin?: string
}

export const cli = sade(pkg.name).version(pkg.version)

function getPuppeter(browser_bin?: string): Promise<puppeteer.Browser> {
  if (browser_bin && browser_bin.trim().length > 0) {
    return puppeteer.launch({ executablePath: browser_bin })
  } else {
    return puppeteer.launch()
  }
}
cli
  .command('render [filename]', 'Render resume', {
    alias: 'export',
    default: true,
  })
  .option('-o, --output', 'Output filename', 'resume.html')
  .option('-t, --theme', 'Theme to use')
  .option('-b, --browser_bin', 'Chromium executable for puppeteer')
  .action(
    async (
      filename: string = 'resume.json',
      { output, theme, browser_bin }: RenderOptions,
    ) => {
      const resume = JSON.parse(await readFile(filename, 'utf-8'))

      const themeName = theme ?? resume?.meta?.theme
      if (!themeName) {
        console.error(
          `No theme to use. Please specify one via the ${yellow(
            '--theme',
          )} option or the ${yellow('.meta.theme')} field of your resume.`,
        )

        process.exitCode = 1
        return
      }

      let themeModule
      try {
        themeModule = await import(themeName)
      } catch {
        console.error(
          `Could not load theme ${yellow(themeName)}. Is it installed?`,
        )

        process.exitCode = 1
        return
      }

      const rendered = await render(resume, themeModule)
      if (output.endsWith('.pdf')) {
        const browser = await getPuppeter(browser_bin)
        const page = await browser.newPage()
        await page.setContent(rendered, { waitUntil: 'networkidle0' })
        await page.pdf({ path: output, format: 'a4', printBackground: true })
        await browser.close()
      } else {
        await writeFile(output, rendered)
      }

      console.log(
        `You can find your rendered resume at ${yellow(output)}. Nice work! 🚀`,
      )
    },
  )

cli
  .command('init [filename]', 'Create sample resume', { alias: 'create' })
  .action(async (filename: string = 'resume.json') => {
    await init(filename)
    console.log(
      `Done! Start editing ${yellow(filename)} now, and run the ${yellow(
        'render',
      )} command when you are ready. 👍`,
    )
  })

cli
  .command('validate [filename]', 'Validate resume')
  .action(async (filename: string = 'resume.json') => {
    try {
      await validate(filename)
      console.log(`Your ${yellow(filename)} looks amazing! ✨`)
    } catch (err) {
      if (!Array.isArray(err)) {
        throw err
      }

      console.error(
        `Uh-oh! The following errors were found in ${yellow(filename)}:\n`,
      )
      err.forEach((err: { message: string; path: string }) =>
        console.error(` ${red(`❌ ${err.message}`)} at ${yellow(err.path)}.`),
      )

      process.exitCode = 1
    }
  })
