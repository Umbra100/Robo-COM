import LogManifest from "./subsystems/local/log-control.mjs";
const test = await new LogManifest({directory: './logs',interval: 2});
await test.createNewLogFile();
