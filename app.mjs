import scbolt from '@slack/bolt';
import env from 'dotenv';
import config from './config.json' assert { type: 'json' };
env.config();

import { logFormat } from './utility.mjs';

const Slack = new scbolt.App({
   token: process.env.SLACK_TOKEN,
   signingSecret: process.env.SLACK_SIGNING_SECRET
});
//todo - configure slack bot for socket mode
//todo - keep coding bot
//STARTUP
(async () => {
   console.log(...logFormat.header);
   await Slack.start(config.slackPort);
   console.log(...logFormat.bulletPoint,'Slack Bot Online');
   console.log(...logFormat.subBulletPoint,`Port: ${config.slackPort}`);
   console.log(...logFormat.footer);
})();
