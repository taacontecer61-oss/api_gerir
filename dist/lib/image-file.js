import sharp from 'sharp';
const FORMAT_MIME = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
};
export const MAX_IMAGE_EDGE = 12_000;
export const MAX_IMAGE_PIXELS = 40_000_000;
export class ImageReject extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = 'ImageReject';
        this.code = code;
    }
}
/** Confirma o formato pelos bytes, não pelo Content-Type declarado pelo cliente. */
export async function inspectImage(buffer) {
    let meta;
    try {
        meta = await sharp(buffer, {
            limitInputPixels: MAX_IMAGE_PIXELS,
            failOn: 'error',
            animated: false,
        }).metadata();
    }
    catch {
        throw new ImageReject('INVALID_IMAGE');
    }
    const format = meta.format;
    if (!format || !(format in FORMAT_MIME))
        throw new ImageReject('INVALID_IMAGE');
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 1 || height < 1 || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
        throw new ImageReject('IMAGE_DIMENSIONS');
    }
    if (width * height > MAX_IMAGE_PIXELS)
        throw new ImageReject('IMAGE_DIMENSIONS');
    return {
        format: format,
        mime: FORMAT_MIME[format],
        width,
        height,
    };
}
export function extensionForFormat(format) {
    switch (format) {
        case 'jpeg':
            return '.jpg';
        case 'png':
            return '.png';
        case 'webp':
            return '.webp';
        case 'gif':
            return '.gif';
    }
}
