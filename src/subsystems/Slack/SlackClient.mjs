import boltpkg from '@slack/bolt';
const { App: Bolt } = boltpkg;
import fs from 'node:fs/promises';
import Highway from '../../Highway.mjs';
import ConfigFile from '../../ConfigFile.mjs';
import env from 'dotenv';
import { terminalFormatter } from '../../helper.mjs';

import RegisterShortcut from './handlers/shortcuts/RegisterShortcut.mjs';
import ScheduleShortcut from './handlers/shortcuts/ScheduleShortcut.mjs';
import AdminShortcut from './handlers/shortcuts/AdminShortcut.mjs';

import RegisterAlert from './handlers/alerts/RegisterAlert.mjs';
import AdminAlert from './handlers/alerts/AdminAlert.mjs';

env.config({path: './security'});

var modals = {}, messages = {};
/**Modifed Slack Client built off of Bolt */
class SlackClient extends Bolt {
   #subsystem
   constructor(){
      console.log(terminalFormatter.bootBulletPoint,'Starting Slack System Client');
      //Creates the base Bolt client
      super({
         token: process.env.SLACK_BOT_TOKEN,
         appToken: process.env.SLACK_APP_LEVEL_TOKEN,
         signingSecret: process.env.SLACK_CLIENT_SECRET,
         logger,
         socketMode: true
      });
      console.log(terminalFormatter.bootSubBulletPoint,'Bolt Client Started');
      //Starts socket mode and does other initialization steps
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
            const modalDir = await fs.readdir('./src/subsystems/Slack/modals',{encoding: 'utf8'});
            for (const i of modalDir){
               let name = i.slice(0,i.indexOf('.'));
               modals[name] = JSON.parse(await Highway.makeRequest('Local','readFile',[{filepath: `./src/subsystems/Slack/modals/${i}`}]));
            }
            console.log(terminalFormatter.bootSubBulletPoint,'Modal Data Retrieved');

            //Gets the message format data for slack to use
            const messageDir = await fs.readdir('./src/subsystems/Slack/messages',{encoding: 'utf8'});
            for (const i of messageDir){
               let name = i.slice(0,i.indexOf('.'));
               messages[name] = JSON.parse(await Highway.makeRequest('Local','readFile',[{filepath: `./src/subsystems/Slack/messages/${i}`}]));
            }
            console.log(terminalFormatter.bootSubBulletPoint,'Message Data Retrieved');

            //Shortcut activations
            await RegisterShortcut.activate(cls,modals);
            await ScheduleShortcut.activate(cls,modals);
            await AdminShortcut.activate(cls,modals);

            //Alert activations
            await RegisterAlert.activate(cls,modals);
            await AdminAlert.activate(cls,modals);

            //Miscellenious
            cls.event('team_join', async (pkg) => teamJoinEvent(pkg));
            cls.action('user_welcome_response_action', async (pkg) => userWelcomeButtonEvent(pkg));

            console.log(terminalFormatter.bootSubBulletPoint,'Event Listeners Active');

            console.log(terminalFormatter.bootSpecialSubBulletPoint,'Client Active');
            cls.#subsystem = new Highway.Subsystem('Slack',cls);

            // await teamJoinEvent({ event: { user: { id: 'U04H4NHJC95' } }, client: cls.client });
            return cls;
         })
   }
   /**
    * 
    * @param {String} userId User ID of the dm to send
    * @param {Object} options Message body to send with text, attachment and block keys.
    */
   async sendDirectionMessage(userId,options){
      const dm = await this.client.conversations.open({
         token: process.env.SLACK_BOT_TOKEN,
         users: userId
      });
      await this.client.chat.postMessage({
         token: process.env.SLACK_BOT_TOKEN,
         channel: dm.channel.id,
         ...options
      });
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

/**Event that triggers when a new person joins the slack server. It creates a new user entry, and sends them a welcome message */
const teamJoinEvent = async ({ event, client }) => {
   //Get user data from the new user and message data to be sent
   var welcomeMessage = JSON.parse(JSON.stringify(messages.welcome.initial));
   var introductionMessage = JSON.parse(JSON.stringify(messages.welcome.intro));
   const slackUserData = (await client.users.info({
      token: process.env.SLACK_BOT_TOKEN,
      user: event.user.id
   })).user;
   const slackUserDM = (await client.conversations.open({
      token: process.env.SLACK_BOT_TOKEN,
      users: event.user.id
   })).channel.id;

   //Modifies message data to fit the user's welcome message
   welcomeMessage.blocks[1].text.text = `\n>Name: *${slackUserData.real_name}*\n\n>Username: *${slackUserData.name}*`;
   welcomeMessage.blocks[1].accessory.image_url = slackUserData.profile.image_512;

   var teacherStr = `${ConfigFile.teacher_contact.formal_prefix} ${ConfigFile.teacher_contact.name.split(' ')[1]}`;
   introductionMessage.blocks[0].text.text = introductionMessage.blocks[0].text.text.replace('$1',ConfigFile.team.number)
   introductionMessage.blocks[0].text.text = introductionMessage.blocks[0].text.text.replace('$2',ConfigFile.team.email);
   introductionMessage.blocks[3].text.text = introductionMessage.blocks[3].text.text.replace('$3',teacherStr);
   introductionMessage.blocks[3].text.text = introductionMessage.blocks[3].text.text.replace('$4',ConfigFile.teacher_contact.room);
   introductionMessage.blocks[4].elements[0].text = introductionMessage.blocks[4].elements[0].text.replace('$5',teacherStr);
   introductionMessage.blocks[6].text.text = introductionMessage.blocks[6].text.text.replace('$6',ConfigFile.welcome_message.introduction_video_url);

   //Creates the new user entries in local data
   await createNewUser(event.user.id);

   //If welcome messages are enabled, send the welcome message
   if (ConfigFile.welcome_message.send){
      await client.chat.postMessage({
         token: process.env.SLACK_BOT_TOKEN,
         channel: ConfigFile.welcome_message.channel,
         ...welcomeMessage
      });
   }

   await client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: slackUserDM,
      ...introductionMessage
   });

   //Log that a new user has joined
   await Highway.makeRequest('Local','log',[`User ${slackUserData.name} (${slackUserData.real_name}) has joined the team.`]);
   console.log(terminalFormatter.bulletPoint,`User ${slackUserData.name} (${slackUserData.real_name}) has joined the team.`);
};

/**Handles the evemt of when a user click to welcome a new user */
const userWelcomeButtonEvent = async ({ ack, client, body }) => {
   await ack();

   //Get and modifies the message data
   var message = JSON.parse(JSON.stringify(messages.welcome.response));
   var index = Math.round(Math.random() * ConfigFile.welcome_message.gif_responses.length-1);
   message.attachments[0].image_url = ConfigFile.welcome_message.gif_responses[index];

   //Gets the user data of the user who executed the welcome
   const slackUserData = (await client.users.info({
      token: process.env.SLACK_BOT_TOKEN,
      user: body.user.id
   })).user;

   //Sends the welcome message on behalf of the user
   await client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: ConfigFile.welcome_message.channel,
      username: slackUserData.display_name || slackUserData.real_name,
      icon_url: slackUserData.profile.image_512,
      ...message
   });
}

/**Creates a new user entry */
export const createNewUser = async (id) => {
   //Gets the user and schedule data files
   const userFile = await Highway.makeRequest('Local','getFile',['./data/users.json']);
   const scheduleFile = await Highway.makeRequest('Local','getFile',['./data/scheduling.json']);
   //Write a new entry for the user data file
   const ret = await userFile.writePath(id,{
      name: null,
      slack_username: null,
      slack_name: null,
      personal_contact: {
         phone_number: null,
         school_email: null,
         personal_email: null
      },
      guardian_contact: {
         name: null,
         phone_number: null,
         email: null
      },
      teams: [],
      unsure_about_teams: null,
      interested_in_outreach: null,
      settings: Object.assign({},ConfigFile.default_account_settings),
      registration_stage: 'Not Complete'
   });
   //Write a new entry for the schedule data file
   await scheduleFile.writePath(id, {
      periods: {
         absent: [],
         recieve_notebook: [],
         extended: {},
      },
      days: {
         absent: [],
         recieve_notebook: [],
      },
      passed: []
   });
   return ret;
}

export default SlackClient

//todo - Develop registration modal further
//todo - Create notification system
//todo - Create Settings shortcut
//todo - Create Leave shortcut
