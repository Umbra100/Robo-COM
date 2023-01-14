import fs from 'node:fs';
import scbolt from '@slack/bolt';
import tw from 'twilio';
import env from 'dotenv';

import Catalog from './interface.mjs';
import DirectoryManifest from './util/directory.mjs';
import { logFormat, timeout, formPayload, compileSMSDate } from './util/other.mjs';

var schedulerInterval, config, online = false;

env.config();
const Dir = await new DirectoryManifest('./config.json');

const Slack = new scbolt.App({
   token: process.env.SLACK_BOT_TOKEN,
   signingSecret: process.env.SLACK_SIGNING_SECRET,
   socketMode: true,
   appToken: process.env.SLACK_APP_TOKEN,
});
const Twilio = new tw(process.env.TWILIO_SID,process.env.TWILIO_TOKEN);

//todo - develop /notify command per notebook outline

//todo - Tie app to SMS delivery

const handler = {
   interaction: async (payload) => {
      await payload.ack();
      var log = {type: undefined, result: undefined}, name, user;
      try {
         switch (payload.body.type){
            case 'command':
               log.type = 'command';
               name = payload.body.command.split('/')[1];
               user = `${payload.body.user_name}(${payload.body.user_id})`;
               log.result = await Catalog.Commands[name]({payload, manifest: Dir, client: Slack});
               break;
            case 'message_action':
               log.type = 'shortcut.message';
               name = payload.body.callback_id;
               user = `${payload.body.user.username}(${payload.body.user.id})`;
               log.result = await Catalog.MessageShortcuts[name]({payload, manifest: Dir, client: Slack});
               break;
            case 'shortcut':
               log.type = 'shortcut.normal';
               name = payload.body.callback_id;
               user = `${payload.body.user.username}(${payload.body.user.id})`;
               console.log(Catalog.Shortcuts[name]);
               log.result = await Catalog.Shortcuts[name]({payload, manifest: Dir, client: Slack});
               break;
         }
         console.log(...logFormat.normal,`User ${user} successfully executed ${log.type} interaction '${name}'`);
         await Dir.LogFile.log(`User ${user} executed ${log.type} interaction '${name}'`,log.result || '');
      } catch (err){//todo - program specific error responses as development continues
         console.log(...logFormat.error,`User ${user} unsuccessfully executed ${log.type} interaction '${name}'\n`,err);
         await Dir.LogFile.log(
            `User ${user} executed ${log.type} interaction '${name}'`,
            {Result: 'FAIL'},
            err
         );
         if (typeof payload.say == 'function') await payload.say('Local error occured. Please check logs.');
      }
   },
   modalInteraction: async (payload) => {
      var modal, reply, input, choiceData;
      await payload.ack();
      switch (payload.body.actions[0].action_id){
         case 'notificationInput':
            const optionData = await config.availableTeams;
            input = {
               name: payload.body.view.state.values.nameField.nameInput.value,
               phone: payload.body.view.state.values.phoneField.phonenumberInput.value,
               team: payload.body.view.state.values.teamField.teamInput.selected_option,
               notification: payload.body.actions[0].text.text
            };
            modal = await Dir.UIFile.getViewData('register');
            modal.view.blocks[2].element.options = [];
            for (const i of optionData){
               modal.view.blocks[2].element.options.push({
                  text: {
                     type: 'plain_text',
                     text: i
                  },
                  value: i
               });
            }
            if (input.name !== null) modal.view.blocks[0].element.initial_value = input.name;
            if (input.phone !== null) modal.view.blocks[1].element.initial_value = input.phone;
            if (input.team !== null) modal.view.blocks[2].element.initial_option = {
               text: {type: 'plain_text', text: input.team.text.text},
               value: input.team.value
            };

            choiceData = await Dir.UIFile.read()
               .then(data => data.register.alternations[0].options);
            if (input.notification == 'Yes'){
               modal.view.blocks[4].accessory = choiceData.no;
            } else {
               modal.view.blocks[4].accessory = choiceData.yes;
            }
            reply = await Slack.client.views.update({
               token: process.env.SLACK_BOT_TOKEN,
               view: modal.view,
               view_id: payload.body.view.id
            });
            break;
         case 'recipientButtonInput':
            input = {
               message: payload.body.view.state.values.messageField.messageInput.value,
               recipientButton: payload.body.view.blocks[0].accessory.text.text
            }
            modal = await Dir.UIFile.getViewData('notifyCommand');

            if (input.message !== null) modal.view.blocks[2].element.initial_value = input.message;
            choiceData = await Dir.UIFile.read()
               .then(data => data.notifyCommand.alternations);

            if (input.recipientButton == 'Yes'){
               if (typeof payload.body.view.blocks[2].hint !== 'undefined') modal.view.blocks[2].hint = {
                  type: 'plain_text',
                  text: 'Any files attached to this message will not be sent.'
               };
               const teams = await Dir.ConfigFile.read()
                  .then(d => d.availableTeams);
               const users = await Dir.UserFile.read()
                  .then(d => d.data);
               modal.view.blocks[0].accessory = choiceData[0].no;
               modal.view.blocks.splice(1,0,choiceData[1].recipientChoice);
               
               modal.view.blocks[1].element.options = [];
               for (const i of teams){
                  modal.view.blocks[1].element.options.push({
                     text: {
                        type: 'plain_text',
                        text: `✴️   ${i.toUpperCase()} TEAM`,
                        emoji: true
                     },
                     value: i
                  })
               }
               for (const i of users){
                  modal.view.blocks[1].element.options.push({
                     text: {
                        type: 'plain_text',
                        text: i.name
                     },
                     value: i.phone
                  })
               }
            } else {
               if (typeof payload.body.view.blocks[3].hint !== 'undefined') modal.view.blocks[2].hint = {
                  type: 'plain_text',
                  text: 'Any files attached to this message will not be sent.'
               };
               modal.view.blocks[0].accessory = choiceData[0].yes;
            }

            await Slack.client.views.update({
               token: process.env.SLACK_BOT_TOKEN,
               view: modal.view,
               view_id: payload.body.view.id
            })
            break;
      }
   },
   viewSubmission: async (payload) => {
      await payload.ack();
      var input, data, modal;
      switch (payload.body.view.callback_id){
         case 'registerData':
            const overwrite = {
               name: payload.view.state.values.nameField.nameInput.value,
               phone: ''.concat(...payload.view.state.values.phoneField.phonenumberInput.value.split('-')),
               team: payload.view.state.values.teamField.teamInput.selected_option.value,
               notifications: payload.view.blocks[4].accessory.text.text == 'Yes',
               user_id: payload.body.user.id
            };
            await Dir.UserFile.setUserData(payload.body.user.id,overwrite);
            break;
         case 'notifyShortcutData':
         case 'notifyCommandData':
            var date = compileSMSDate();
            const teams = await Dir.ConfigFile.read()
               .then(data => data.availableTeams);
            const users = await Dir.UserFile.read()
               .then(data => data.data);
            var recipients = [];
            input = {
               message: payload.body.view.state.values.messageField.messageInput.value,
               recipients: typeof payload.body.view.state.values.recipientField == 'undefined' ? ['All'] : (
                  payload.body.view.state.values.recipientField.recipientInput.selected_options.map(i => i.value)
               )
            };
            const metadata = JSON.parse(payload.body.view.private_metadata);
            data = {
               senderName: await Dir.UserFile.getUserData(payload.body.user.id).then(d => d?.name) ?? (
                  await Slack.client.users.info({
                     user: payload.body.user.id
                  }).then(d => d.user.profile.real_name)
               ),
               senderTeam: await Dir.UserFile.getUserData(payload.body.user.id).then(d => d?.team) ?? '',
               message: input.message,
               date,
               channel: payload.body.view.private_metadata == '' ? null : (
                  `#${metadata.channel.name}`
               ),
               url: await Slack.client.chat.getPermalink({
                  token: process.env.SLACK_BOT_TOKEN,
                  channel: metadata.channel.id,
                  message_ts: metadata.message_ts
               }).then(d => d.permalink)
            };

            var message = ''.concat(
               `${data.senderName} ${(data.senderTeam == '' ? '' : (
                  `from the ${data.senderTeam.toLowerCase()} team `
               ))}sent an important message in ${data.channel} chat!\n\n`,
               `"${data.message}"`,
               (metadata.hasFiles) ? '\n\n(has attached files)\n' : '\n\n',
               `${data.url}`
            );

            for (const i of input.recipients){
               if (i == 'All'){
                  recipients = users.map(j => j.phone);
               } else {
                  if (teams.indexOf(i) == -1){
                     if (recipients.indexOf(i) == -1) recipients.push(i);
                  } else {
                     for (const j of users){
                        if (j.team == i && recipients.indexOf(j.phone) == -1) recipients.push(j.phone);
                     }
                  }
               }
            }
            await SendSMS({text: message},...recipients);
            break;
         case 'shutdownData':
            console.log(payload.body.user);
            data = payload.body.view.state.values.passwordInput.passwordData.value;
            if (data !== process.env.APPLICATION_PASSWORD){
               modal = await Dir.UIFile.getViewData('shutdown');
               modal.view.blocks[0].hint = {
                  type: 'plain_text',
                  text: '❗️Password Incorrect❗️'
               };
               modal.trigger_id = payload.body.trigger_id;
               await Slack.client.views.open(modal);
            } else {
               await ShutDown();
            }
            break;      
      }
   },
   schedule: async () => {
      const logEntries = await Dir.LiveFile.EntryArray.log.getAll();
      var latestEntry = logEntries[0];
      if (typeof latestEntry == 'undefined') {
         console.log(...logFormat.normal,`Log file not found; Created instance`);
         await Dir.LogFile.new();
         return;
      }
      for (const i of logEntries){
         if (parseInt(i.name.split('-')[1]) > parseInt(latestEntry.name.split('-')[1])) latestEntry = i;
      }
      var entryDue = (new Date(latestEntry.timeCreated).getTime() * 0.001) + (await Dir.ConfigFile.read()).logs.interval;
      if (entryDue < new Date().getTime() * 0.001){
         console.log(...logFormat.normal,`Executed log entry; Created log file:\n${JSON.stringify(latestEntry)}`);
         await Dir.LogFile.new();
      }
   },
   updateConfig: async () => {
      const data = await Dir.ConfigFile.read();
      config = data;
      if (online) console.log(...logFormat.normal,'Config Data Updated');
   }
};

const SendSMS = async ({text, mediaurls},...phones) => {
   for (const i of phones){
      await (new Promise(async (resolve,reject) => {
         setTimeout(async () => {
            await Twilio.messages.create({
               body: text,
               from: config.CONSTANT.appPhoneNumber,
               mediaUrl: mediaurls,
               to: i
            });
            resolve();
         },1100);
      }))
         .catch(err => {
            console.error(`Error sending SMS to '${i}'; `,err);
         })
   }
}
const SendSlackDM = async ({text, userid}) => {
   await Slack.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: userid,
      text
   });
}
const ShutDown = async () => {
   await Dir.LogFile.log('Application Stopped');
   await SendSlackDM({
      text: 'Application Has Stopped',
      userid: process.env.OWNER_ID
   });
   process.exit();
}

//STARTUP
await (async () => {
   console.log(...logFormat.header);
   const uidata = await Dir.UIFile.read();
   //Surface Interactions
   for (var i in Catalog.Commands){
      await Slack.command(`/${i}`,(payload) => {handler.interaction(formPayload(payload))});
   }
   for (var i in Catalog.MessageShortcuts){
      await Slack.shortcut(`${i}`,(payload) => {handler.interaction(formPayload(payload))});
   }
   for (var i in Catalog.Shortcuts){
      await Slack.shortcut(`${i}`,(payload) => {handler.interaction(formPayload(payload))});
   }
   //UI Interactions
   for (var i of Catalog.keys.ui){
      await Slack.action(`${i}`,(payload) => {handler.modalInteraction(payload)});
   }
   //View Submission
   for (const i in uidata){
      Slack.view(`${uidata[i].modal.view.callback_id}`,(payload) => {handler.viewSubmission(payload)});
   }
   console.log(...logFormat.bulletPoint,'Interactions Initialized');

   config = await Dir.ConfigFile.read();
   fs.watchFile('./config.json', {interval: config.CONSTANT.intervals.config},handler.updateConfig);
   console.log(...logFormat.bulletPoint,'Config Data Loaded And Data Watcher Active');

   schedulerInterval = setInterval(handler.schedule,config.CONSTANT.intervals.scheduler);
   console.log(...logFormat.bulletPoint,'Log Schedular Active');

   console.log(...logFormat.bulletPoint,'Establishing Slack Connection...',...logFormat.reset);
   const reply = await Slack.start();
   await timeout(() => {
      if (reply.ok){
         console.log('Connection Established');
      }
      else {
         console.log(...logFormat.error, 'Connection Unsuccessful');
         console.log('Reply:  ',reply);
      }
   },1000);

   await Dir.LogFile.log('Application Started');
   online = true;
   console.log(...logFormat.footer);
})();
