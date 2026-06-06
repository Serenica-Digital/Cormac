import http from 'node:http';

/**
 * Background worker. A stub for the walking skeleton: it is a valid, portable
 * long-running container with a health endpoint and nothing more. The weekly
 * change report (ADR-010, the safety net that gates apply-then-report) and the
 * inbound connector processors (SMS, email) land here next.
 */
const port = Number(process.env.WORKER_PORT ?? 8070);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', worker: 'stub' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`[worker] stub listening on ${port}`);
});
