import LocalClientClass from "./subsystems/local/client.mjs";
import { terminalFormatter } from "./subsystems/helper.mjs";
console.log(terminalFormatter.header);

const LocalClient = await new LocalClientClass();

console.log(terminalFormatter.footer);
