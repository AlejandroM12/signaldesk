import { Test, TestingModule } from "@nestjs/testing";
import { API_SERVICE_NAME } from "@signaldesk/contracts";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  it("returns the API health payload", () => {
    expect(controller.getHealth()).toEqual({
      status: "ok",
      service: API_SERVICE_NAME,
    });
  });
});
