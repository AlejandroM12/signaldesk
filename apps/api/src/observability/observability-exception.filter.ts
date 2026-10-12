import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { currentRequestId, normalizeMethod, normalizeRoute, writeOperationalLog } from "./request-context";

@Catch()
export class ObservabilityExceptionFilter implements ExceptionFilter {
  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse();
    const adapter = this.adapterHost.httpAdapter;
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const payload =
        typeof body === "object" && body !== null
          ? body
          : { statusCode: exception.getStatus(), message: body };
      if (!adapter.isHeadersSent(response)) {
        adapter.reply(response, payload, exception.getStatus());
      }
      return;
    }

    const request = http.getRequest();
    writeOperationalLog({
      msg: "http_error",
      requestId: currentRequestId() ?? null,
      method: normalizeMethod(request.method),
      route: normalizeRoute(request),
      status: 500,
    });
    if (!adapter.isHeadersSent(response)) {
      adapter.reply(response, { statusCode: 500, message: "Internal server error" }, 500);
    }
  }
}
