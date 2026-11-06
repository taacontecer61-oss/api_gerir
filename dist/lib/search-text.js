/** Termos para MATCH ... AGAINST (? IN BOOLEAN MODE). Devolve null se não houver palavras utilizáveis. */
export function booleanFulltext(raw) {
    const words = raw
        .replace(/[+\-<>()~*"@]+/g, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 3 && /^[\p{L}\p{N}_-]+$/u.test(word))
        .slice(0, 8);
    if (!words.length)
        return null;
    return words.map((word) => `${word}*`).join(' ');
}
