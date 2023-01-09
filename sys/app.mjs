import fs from 'node:fs';
import scbolt from '@slack/bolt';
import env from 'dotenv';

import CMDCatalog from './commands.mjs';
import DirectoryManifest from './util/directory.mjs';
import { logFormat, timeout } from './util/other.mjs';

var schedulerInterval, config, online = false;

env.config();
const Dir = await new DirectoryManifest('./config.json');

const Slack = new scbolt.App({
   token: process.env.SLACK_BOT_TOKEN,
   signingSecret: process.env.SLACK_SIGNING_SECRET,
   socketMode: true,
   appToken: process.env.SLACK_APP_TOKEN,
});

//todo - develop /notify command per notebook outline

const handler = {
   message: async (e) => {
      console.log('test2');
      console.log(e);
   },
   command: async (payload) => {
      await payload.ack();
      const name = payload.command.command.split('/')[1];
      try {
         await CMDCatalog[name](payload);
         console.log(...logFormat.normal,`User ${payload.command.user_name}(${payload.command.user_id}) executed command '${name}'`);
         await Dir.LogFile.log(
            `User ${payload.command.user_name}(${payload.command.user_id}) executed command '${name}'`,
            `\nResult:  Success`,
            `\nPayload Text:  ${payload.text}`
         );
      } catch (err){
         console.log(...logFormat.error,`User ${payload.command.user_name}(${payload.command.user_id}) executed commad '${name}'\n`,err);
         await Dir.LogFile.log(
            `User ${payload.command.user_name}(${payload.command.user_id}) executed commad '${name}'`,
            `\nResult:  Fail`,
            err
         );
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

//STARTUP
await (async () => {
   console.log(...logFormat.header);

   for (var i in CMDCatalog){
      await Slack.command(`/${i}`,handler.command);
   }
   console.log(...logFormat.bulletPoint,'Commands Initialized');

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

