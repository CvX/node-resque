import specHelper from "../utils/specHelper";
import { MultiWorker, Queue } from "../../src";

let queue: Queue;
let multiWorker: MultiWorker;
const checkTimeout = specHelper.timeout / 10;
const minTaskProcessors = 1;
const maxTaskProcessors = 5;

const blockingSleep = (naptime: number) => {
  let sleeping = true;
  const now = new Date();
  let alarm;
  const startingMSeconds = now.getTime();
  while (sleeping) {
    alarm = new Date();
    const alarmMSeconds = alarm.getTime();
    if (alarmMSeconds - startingMSeconds > naptime) {
      sleeping = false;
    }
  }
};

const jobs = {
  slowSleepJob: {
    plugins: [] as string[],
    pluginOptions: {},
    perform: async () => {
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(new Date().getTime());
        }, 1000);
      });
    },
  },
  slowCPUJob: {
    plugins: [] as string[],
    pluginOptions: {},
    perform: async () => {
      blockingSleep(1000);
      return new Date().getTime();
    },
  },
};

describe("multiWorker", () => {
  beforeAll(async () => {
    await specHelper.connect();
    queue = new Queue({
      connection: specHelper.cleanConnectionDetails(),
      queue: specHelper.queue,
    });
    await queue.connect();

    multiWorker = new MultiWorker(
      {
        connection: specHelper.cleanConnectionDetails(),
        timeout: specHelper.timeout,
        checkTimeout: checkTimeout,
        minTaskProcessors: minTaskProcessors,
        maxTaskProcessors: maxTaskProcessors,
        queues: [specHelper.queue],
      },
      jobs
    );

    await multiWorker.end();

    multiWorker.on("error", (error) => {
      throw error;
    });
  }, 30 * 1000);

  afterEach(async () => {
    await queue.delQueue(specHelper.queue);
  });

  afterAll(async () => {
    await queue.end();
    await specHelper.disconnect();
  });

  test("should never have less than one worker", async () => {
    expect(multiWorker.workers.length).toBe(0);
    await multiWorker.start();
    await new Promise((resolve) => {
      setTimeout(resolve, checkTimeout * 3 + 500);
    });

    expect(multiWorker.workers.length).toBeGreaterThan(0);
    await multiWorker.end();
  });

  test(
    "should stop adding workers when the max is hit & CPU utilization is low",
    async () => {
      let i = 0;
      while (i < 100) {
        await queue.enqueue(specHelper.queue, "slowSleepJob", []);
        i++;
      }

      await multiWorker.start();
      await new Promise((resolve) => {
        setTimeout(resolve, checkTimeout * 30);
      });
      expect(multiWorker.workers.length).toBe(maxTaskProcessors);
      await multiWorker.end();
    },
    10 * 1000
  );

  test(
    "should not add workers when CPU utilization is high",
    async () => {
      let i = 0;
      while (i < 100) {
        await queue.enqueue(specHelper.queue, "slowCPUJob", []);
        i++;
      }

      await multiWorker.start();
      await new Promise((resolve) => {
        setTimeout(resolve, checkTimeout * 30);
      });
      expect(multiWorker.workers.length).toBe(minTaskProcessors);
      await multiWorker.end();
    },
    30 * 1000
  );

  test("should pass on all worker emits to the instance of multiWorker", async () => {
    await new Promise(async (resolve) => {
      await queue.enqueue(specHelper.queue, "missingJob", []);

      multiWorker.start();

      multiWorker.on(
        "failure",
        async (workerId, queue, job, error, duration) => {
          expect(String(error)).toBe(
            'Error: No job defined for class "missingJob"'
          );
          expect(duration).toBeGreaterThanOrEqual(0);
          multiWorker.removeAllListeners("error");
          await multiWorker.end();
          resolve(null);
        }
      );
    });
  });
});
