import sanitizeHtml from 'sanitize-html';
const ALLOWED_TAGS = [
    'p',
    'br',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'blockquote',
    'strong',
    'em',
    'u',
    's',
    'a',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'figure',
    'img',
    'figcaption',
    'span',
];
export function sanitizeArticleHtml(html) {
    return sanitizeHtml(html || '', {
        allowedTags: ALLOWED_TAGS,
        allowedAttributes: {
            a: ['href', 'title', 'rel', 'target'],
            img: ['src', 'alt', 'title', 'width', 'height'],
            td: ['colspan', 'rowspan'],
            th: ['colspan', 'rowspan'],
            p: ['style'],
            h2: ['style'],
            h3: ['style'],
            li: ['style'],
            '*': ['class'],
        },
        allowedStyles: {
            '*': {
                'text-align': [/^(left|right|center|justify)$/],
            },
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
            a: sanitizeHtml.simpleTransform('a', {
                rel: 'noopener noreferrer',
                target: '_blank',
            }),
        },
    });
}
export function readingTimeFromHtml(html) {
    const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
}
