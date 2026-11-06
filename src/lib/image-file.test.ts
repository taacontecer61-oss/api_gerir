import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { inspectImage, ImageReject } from './image-file.js'

test('aceita um PNG real e ignora o tipo declarado pelo cliente', async () => {
  const buffer = await sharp({
    create: { width: 12, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer()
  const info = await inspectImage(buffer)
  assert.equal(info.mime, 'image/png')
  assert.equal(info.width, 12)
  assert.equal(info.height, 8)
})

test('rejeita HTML com Content-Type de imagem', async () => {
  await assert.rejects(
    () => inspectImage(Buffer.from('<html><script>alert(1)</script></html>')),
    (error: unknown) => error instanceof ImageReject && error.code === 'INVALID_IMAGE',
  )
})

test('rejeita uma imagem acima do limite de pixels', async () => {
  const buffer = await sharp({
    create: { width: 12_001, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer()
  await assert.rejects(
    () => inspectImage(buffer),
    (error: unknown) => error instanceof ImageReject && error.code === 'IMAGE_DIMENSIONS',
  )
})
