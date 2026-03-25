type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string | Buffer): void;
};

export const config = {
  runtime: "nodejs",
  maxDuration: 300,
};

function isHostedVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (isHostedVercelRuntime()) {
    const traceId = `BKP-SRVLESS-${Date.now()}`;
    const body = JSON.stringify({
      code: "BACKUP_RUNTIME_UNSUPPORTED",
      message:
        `[${traceId}] Full database dump tidak didukung di runtime Vercel serverless. Jalankan dari localhost atau worker backup khusus.`,
      trace_id: traceId,
    });

    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Trace-Id", traceId);
    res.end(body);
    return;
  }

  const { handleFullBackupRequest } = await import("../_lib/full-backup.js");
  const response = await handleFullBackupRequest({ method: req.method, headers: req.headers });

  res.statusCode = response.status;
  for (const [key, value] of Object.entries(response.headers) as [string, string][]) {
    res.setHeader(key, value);
  }
  res.end(response.body);
}
