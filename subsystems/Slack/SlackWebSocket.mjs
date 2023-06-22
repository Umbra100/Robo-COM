import axios from "axios";
import WebSocket from "ws";
import fs from 'node:fs/promises';
import nodepath from "node:path";
import Highway from '../Highway.mjs';
import { terminalFormatter } from "../helper.mjs";

var modals = {}, token;
const modalMethods = {
   open: async (view,trigger_id) => {
      const request = await axios.request({
         method: 'POST',
         url: 'https://slack.com/api/views.open',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
         },
         data: JSON.stringify({view, trigger_id})
      })
         .then(res => {
            if (res.data.ok) return res.data;
            else throw new Error(`And error occurred while attempting to open modal, '${res.data.error}'`,res.data);
         });
      return request;
   }
}

class SlackWebSocket {
   /**
    * Creats a websocket built for interacting with Slack Socket Mode API
    * @param {Object} options Web socket options
    * @param {String} options.app_level_token App level token for the Slack app
    * @param {String} options.access_token Access token for the Slack app
    * @returns {Extention} Extended websocket built around working with Slack APIs
    */
   constructor(options){
      return Promise.resolve(options)
         .then(async options => {
            const url = await axios.request({
               method: 'POST',
               url: 'https://slack.com/api/apps.connections.open',
               headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Authorization': `Bearer ${options.app_level_token}`
               }
            })
               .then(res => {
                  if (res.data.ok) return res.data.url;
                  else throw new Error(`Slack Socket Mode Request Failed; ${JSON.stringify(res.data)}`);
               });

            const dir = await fs.readdir('./subsystems/Slack/modals',{encoding: 'utf8'});
            for (const i of dir){
               let name = i.slice(0,i.indexOf('.'));
               modals[name] = JSON.parse(await Highway.makeRequest('Local','readFile',[{filepath: `./subsystems/Slack/modals/${i}`}]));
            }
            console.log(terminalFormatter.bootSubBulletPoint,'Modal and URL Data Retrieved');

            token = options.access_token

            return await new Extention(url);
         })
   }
}

class Extention extends WebSocket {
   constructor(url){
      super(url);
      return new Promise((resolve,reject) => {
         this.onopen = () => console.log(terminalFormatter.bootSubBulletPoint,'Web Socket Connected; Waiting for ping');
         this.onmessage = (e) => {
            console.log(e);
            var data = JSON.parse(e.data);
            if (data.type == 'hello') console.log(terminalFormatter.bootSubBulletPoint,'Ping Recieved; Web Socket Online');
            else throw new Error(`An error occurred while activating Slack Websocket, ${JSON.stringify(data)}`);
            this.onmessage = this.messageEvent;
            resolve(this);
         }
      })
   }
   async messageEvent(e){
      const data = JSON.parse(e.data);
      try {
         switch (data.type){
            case 'interactive':
               await this.send(Buffer.from(JSON.stringify({envelope_id: data.envelope_id})));
               if (data.payload.type == 'shortcut') return await handlers[data.payload.callback_id].shortcut(data);
               else return await handlers[data.payload.callback_id].message(data);
            case 'slash_commands':
               await this.send(Buffer.from(JSON.stringify({envelope_id: data.envelope_id})));
               return await handlers[data.payload.command.slice(1,data.payload.command.length)].command(data);
            case 'disconnect'://!alert if error
               console.error(terminalFormatter.errorPoint, 'Socket mode disconnected; please investigate');
               break;
            default: console.log(data);
         }
      } catch(err){
         console.error(terminalFormatter.errorPoint,err);
      }
   }
}

//Split into callback_id: {shortcut:, message:, command:}
const handlers = {
   register: {
      shortcut: async (pkg) => {
         var modal = Object.assign({},modals.register.initial);
         console.log(await modalMethods.open(modal,pkg.payload.trigger_id));
      }
   }
}

export default SlackWebSocket;
