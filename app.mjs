import LogManifest from "./subsystems/local/log-control.mjs";
import { getConfigTimeDelay } from "./subsystems/helper.mjs";
const test = await new LogManifest({directory: './logs',interval: getConfigTimeDelay()});
