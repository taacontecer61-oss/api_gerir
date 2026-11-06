/** Intervalo [início, fim) em UTC para um dia, mês ou ano no fuso de Luanda (UTC+1, sem horário de verão). */
export function archiveRange(year, month, day) {
    const offsetMs = 60 * 60 * 1000;
    const start = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1) - offsetMs);
    let end;
    if (month && day)
        end = new Date(Date.UTC(year, month - 1, day + 1) - offsetMs);
    else if (month)
        end = new Date(Date.UTC(year, month, 1) - offsetMs);
    else
        end = new Date(Date.UTC(year + 1, 0, 1) - offsetMs);
    return { from: start, to: end };
}
