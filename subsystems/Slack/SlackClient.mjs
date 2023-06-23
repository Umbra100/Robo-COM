import boltpkg from '@slack/bolt';
const { App: Bolt } = boltpkg;
import fs from 'node:fs/promises';
import Highway from '../Highway.mjs';
import env from 'dotenv';
import { terminalFormatter } from '../helper.mjs';

import RegisterShortcut from './handlers/RegisterShortcut.mjs';

env.config({path: './security'});

var modals = {};
/**Modifed Slack Client built off of Bolt */
class SlackClient extends Bolt {
   #subsystem
   constructor(){
      console.log(terminalFormatter.bootBulletPoint,'Starting Slack System Client')
      super({
         token: process.env.SLACK_BOT_TOKEN,
         appToken: process.env.SLACK_APP_LEVEL_TOKEN,
         signingSecret: process.env.SLACK_CLIENT_SECRET,
         logger,
         socketMode: true
      });
      console.log(terminalFormatter.bootSubBulletPoint,'Bolt Client Started');
      return Promise.resolve(this)
         .then(async cls => {
            //Starts socket mode connection
            await cls.start();
            await new Promise((resolve, reject) => {
               logger.onConnection(() => {
                  logger.onConnection(() => {});
                  resolve();
               });
            });
            console.log(terminalFormatter.bootSubBulletPoint,'Web Socket Connected');

            //Gets modal data for slack to use
            const dir = await fs.readdir('./subsystems/Slack/modals',{encoding: 'utf8'});
            for (const i of dir){
               let name = i.slice(0,i.indexOf('.'));
               modals[name] = JSON.parse(await Highway.makeRequest('Local','readFile',[{filepath: `./subsystems/Slack/modals/${i}`}]));
            }
            console.log(terminalFormatter.bootSubBulletPoint,'Modal Data Retrieved');

            //Shortcut activations
            RegisterShortcut.activate(cls,modals);

            console.log(terminalFormatter.bootSubBulletPoint,'Event Listeners Active');

            console.log(terminalFormatter.bootSpecialSubBulletPoint,'Client Active');
            cls.#subsystem = new Highway.Subsystem('Slack',cls);
            return cls;
         })
   }
}

/** Logger to override the Slack Bolt logs; also used to listen for when the websocket connection is made */
const logger = new (class {
   #callbackEvent
   constructor(){this.#callbackEvent = () => {}}
   debug (log){}
   info (log){
      if (log.indexOf('Now connected to Slack') !== -1) logger.#callbackEvent();
      else if (log.indexOf('Going to establish a new connection to Slack') == -1) {
         console.log(terminalFormatter.bulletPoint,'SlackBolt sent info message: ',log);
      }
   }
   error (log){
      console.log(terminalFormatter.errorPoint, 'SlackBolt sent error message: ',log);
   }
   warn (log){
      console.log(terminalFormatter.errorPoint, 'SlackBolt sent warning message: ',log);
   }
   getLevel (){}
   setLevel (){}
   onConnection (callback){
      this.#callbackEvent = callback;
   }
})();

export default SlackClient
