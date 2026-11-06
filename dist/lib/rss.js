export function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        // Remove caracteres de controlo inválidos em XML 1.0.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
export function buildRssFeed(input) {
    const latest = input.items.find((item) => item.pubDate)?.pubDate ?? new Date();
    const items = input.items
        .map((item) => {
        const lines = [
            '    <item>',
            `      <title>${escapeXml(item.title)}</title>`,
            `      <link>${escapeXml(item.link)}</link>`,
            `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
            `      <description>${escapeXml(item.description)}</description>`,
        ];
        if (item.pubDate)
            lines.push(`      <pubDate>${item.pubDate.toUTCString()}</pubDate>`);
        if (item.category)
            lines.push(`      <category>${escapeXml(item.category)}</category>`);
        if (item.author)
            lines.push(`      <dc:creator>${escapeXml(item.author)}</dc:creator>`);
        lines.push('    </item>');
        return lines.join('\n');
    })
        .join('\n');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
        '  <channel>',
        `    <title>${escapeXml(input.title)}</title>`,
        `    <link>${escapeXml(input.link)}</link>`,
        `    <description>${escapeXml(input.description)}</description>`,
        `    <language>${escapeXml(input.language ?? 'pt-AO')}</language>`,
        `    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>`,
        `    <atom:link href="${escapeXml(input.selfUrl)}" rel="self" type="application/rss+xml" />`,
        items,
        '  </channel>',
        '</rss>',
        '',
    ].join('\n');
}
