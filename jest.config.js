// eslint-disable-next-line no-undef
module.exports = {
  maxWorkers: "50%",
  testPathIgnorePatterns: ["<rootDir>/__tests__/utils"],
  transform: {
    "^.+\\.ts?$": "ts-jest",
  },
};
