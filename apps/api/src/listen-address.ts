export const LOCAL_API_PORT = 3001;
export const LISTEN_HOST = "0.0.0.0";

const PORT_MIN = 1;
const PORT_MAX = 65_535;

export type ListenTarget = {
  port: number;
  host: typeof LISTEN_HOST;
};

type ListenEnv = {
  PORT?: string;
  API_PORT?: string;
};

export function readListenTarget(env: ListenEnv): ListenTarget {
  const fromHost = present(env.PORT);
  if (fromHost !== undefined) {
    return { port: parsePort(fromHost, "PORT"), host: LISTEN_HOST };
  }

  const fromLocal = present(env.API_PORT);
  if (fromLocal !== undefined) {
    return { port: parsePort(fromLocal, "API_PORT"), host: LISTEN_HOST };
  }

  return { port: LOCAL_API_PORT, host: LISTEN_HOST };
}

function present(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parsePort(value: string, name: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} debe ser un entero entre ${PORT_MIN} y ${PORT_MAX}.`);
  }
  const port = Number(value);
  if (port > PORT_MAX) {
    throw new Error(`${name} debe ser un entero entre ${PORT_MIN} y ${PORT_MAX}.`);
  }
  return port;
}
