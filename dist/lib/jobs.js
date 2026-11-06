const queue = [];
let running = 0;
const CONCURRENCY = 2;
function drain() {
    while (running < CONCURRENCY && queue.length > 0) {
        const job = queue.shift();
        if (!job)
            return;
        running += 1;
        job()
            .catch(() => undefined)
            .finally(() => {
            running -= 1;
            drain();
        });
    }
}
/** Fila em processo para trabalho que não deve bloquear o pedido HTTP. */
export function enqueue(job) {
    queue.push(job);
    drain();
}
