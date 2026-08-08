import { describe, expect, it, vi, beforeEach } from 'vitest'
import { copyText } from '../src/lib/copy'

function setup(options: {
  clipboard?: { writeText: () => Promise<void> }
  execCommand?: () => boolean
}) {
  vi.stubGlobal('navigator', { clipboard: options.clipboard })
  vi.stubGlobal('window', { isSecureContext: true })
  vi.stubGlobal('document', {
    createElement: () => ({ style: {}, setAttribute() {}, select() {}, value: '' }),
    body: { appendChild() {}, removeChild() {} },
    execCommand: options.execCommand ?? (() => false),
  })
}

beforeEach(() => vi.unstubAllGlobals())

describe('copyText', () => {
  it('Clipboard API가 되면 true', async () => {
    setup({ clipboard: { writeText: async () => {} } })
    expect(await copyText('123')).toBe(true)
  })

  it('Clipboard API가 없으면 execCommand로 폴백한다', async () => {
    setup({ clipboard: undefined, execCommand: () => true })
    expect(await copyText('123')).toBe(true)
  })

  it('Clipboard API가 던지면 폴백한다', async () => {
    setup({
      clipboard: { writeText: async () => { throw new Error('denied') } },
      execCommand: () => true,
    })
    expect(await copyText('123')).toBe(true)
  })

  it('둘 다 실패하면 false — 호출자가 안내를 띄울 수 있어야 한다', async () => {
    setup({ clipboard: undefined, execCommand: () => false })
    expect(await copyText('123')).toBe(false)
  })
})
