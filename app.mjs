import { updateConfig } from "./src/ConfigFile.mjs";
await updateConfig();
import EngineeringNotebook from "./src/EngineeringNotebook.mjs";
await EngineeringNotebook.updateIndex();

import LocalClientClass from "./src/subsystems/Local/LocalClient.mjs";
import SlackClientClass from './src/subsystems/Slack/SlackClient.mjs';
import WebClientClass from "./src/subsystems/Web/WebClient.mjs";
import TwilioClientClass from "./src/subsystems/Twilio/TwilioClient.mjs";

import Highway from "./src/Highway.mjs";
import { terminalFormatter } from "./src/helper.mjs";
import env from 'dotenv';
import email from 'email-validator';
env.config({ path: './security/.env' });
console.log(terminalFormatter.header);

var LocalClient, WebClient, SlackClient, TwilioClient;

const highwayHandler = new Highway.RequestHandler(async (req) => {
   var ret;
   switch (req.system){
      case 'Web': //Routes to web subsystem in the app scope
         ret = await WebClient[req.method](...req.params);
         break;
      case 'Local': //Routes to local subsystem in the app scope
         ret = await LocalClient[req.method](...req.params);
         break;
      case 'Slack': //Routes to slack subsystem in the app scope
         ret = await SlackClient[req.method](...req.params);
         break;
      case 'Twilio':
         ret = await TwilioClient[req.method](...req.params);
         break;
   }
   return ret;
});
console.log(terminalFormatter.bootBulletPoint,'Highway System Established');

LocalClient = await new LocalClientClass();
WebClient = await new WebClientClass();
SlackClient = await new SlackClientClass();
TwilioClient = await new TwilioClientClass();

await LocalClient.logs.currentFile.log('Application Online');
console.log(terminalFormatter.footer);

//todo - Create message recieving functionality for Twilio client (local doesn't work, external endpoint connection needed)
//todo - Make scheduling watch for days that we don't have robotics (set by normal times and club leaders)

//todo - Make notification system (accomodate for scheduling as well)

//* Note: Date classes cannot process dates that have day suffixes such as 'rd' or 'st'
//* Note: Date classes that are created with format 'mm/dd/yy' are 6 hours ahead of 'Month Day Year' format
