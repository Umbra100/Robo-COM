import LocalClientClass from "./subsystems/local/client.mjs";
import SlackClientClass from './subsystems/slack/client.mjs';
import WebClientClass from "./subsystems/web/client.mjs";

import ConfigFile from "./config.mjs";
import Highway from "./subsystems/highway.mjs";
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

console.log(terminalFormatter.footer);

//todo - Build program friendly Slack Client

//todo - later make sure token exchange works (when it's expired)
//todo - later add a error alerting system to alert admin if a important error occurs (at "//!alert if error" marked spots)
