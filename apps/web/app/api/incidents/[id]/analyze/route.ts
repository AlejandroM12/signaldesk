import { proxyAnalyze, type ProxyEnv } from "@/lib/analysis-proxy";

export const maxDuration = 10;

function proxyEnv(): ProxyEnv {
  return {
    API_ORIGIN: process.env.API_ORIGIN,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    ANALYSIS_PROXY_SECRET: process.env.ANALYSIS_PROXY_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };
}

export function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return context.params.then((params) => proxyAnalyze(request, params.id, proxyEnv()));
}
