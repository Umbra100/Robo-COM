import LocalClientClass from "./subsystems/Local/LocalClient.mjs";
import SlackClientClass from './subsystems/Slack/SlackClient.mjs';
import WebClientClass from "./subsystems/Web/WebClient.mjs";

import ConfigFile from "./config.mjs";
import Highway from "./subsystems/Highway.mjs";
import { terminalFormatter } from "./subsystems/helper.mjs";
import env from 'dotenv';
env.config({ path: './security/.env' });
console.log(terminalFormatter.header);

var LocalClient, WebClient, SlackClient;

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
   }
   return ret;
});
console.log(terminalFormatter.bootBulletPoint,'Highway System Established');

LocalClient = await new LocalClientClass();
WebClient = await new WebClientClass({
   port: ConfigFile.server_port
});
SlackClient = await new SlackClientClass({
   bot_: process.env.SLACK_BOT_TOKEN,
   client_id: process.env.SLACK_CLIENT_ID,
   client_secret: process.env.SLACK_CLIENT_SECRET,
   app_level_token: process.env.SLACK_APP_LEVEL_TOKEN
});

await LocalClient.logs.currentFile.log('Application Online');
console.log(terminalFormatter.footer);

//todo - Finish register shortcut functionality (conjunction with other features)
