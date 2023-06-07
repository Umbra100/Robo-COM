import axios from "axios";
import WebSocket from "ws";
import Highway from "../highway.mjs";
import { terminalFormatter } from "../helper.mjs";

//todo - Create refresh token interval
class SlackClient {
   #auth = {}
   #subsystem
   #tokenData
   #websocket
   #files = {}
   #intervalMeta
   #interval

   /**
    * Creates a Slack web client to interact with Slack APIs
    * @param {Object} auth Authentication parameters for the Slack client
    * @param {String} auth.bot_token Slack app bot API token
    * @param {String} auth.client_id Slack app client ID
    * @param {String} auth.client_secret Slack app client secret
    * @param {String} auth.app_level_token Slack app level token
    */
   constructor(auth){
      return Promise.resolve(auth)
         .then(async auth => {
            //Store permanent bot authentication data in object
            console.log(terminalFormatter.bootBulletPoint,'Starting Slack System Client');
            this.#auth.bot_token = auth.bot_token;
            this.#auth.client_id = auth.client_id;
            this.#auth.client_secret = auth.client_secret;
            this.#auth.app_level_token = auth.app_level_token;

            //Activates the oauth endpoint for the slack api
            await Highway.makeRequest('Web','get',['/slack-auth',(res,req) => {
               console.log('Request from slack auth endpoint!');
               console.log(req);
            }]);
            console.log(terminalFormatter.bootSubBulletPoint,'Auth Endpoint Defined on Web Client');

            //Gets the token data from local storage and other file data
            this.#files.tokenStore = await Highway.makeRequest('Local','getFile',['./data/token-store.json']);
            console.log(terminalFormatter.bootSubBulletPoint,'Data Files Acquired');
            this.#tokenData = await this.#files.tokenStore.read();

            //Checks if the token needs to be refreshed; if so refreshes the token and stores new token
            const dates = [new Date(), new Date(this.#tokenData.date_collected)];
            if ((Date.parse(dates[0]) - Date.parse(dates[1])) / 1000 > this.#tokenData.expires_in){
               await this.#refreshToken();
               console.log(terminalFormatter.bootBulletPoint,'Refreshed Access Token');
            };

            console.log(terminalFormatter.bootSubBulletPoint,'Handshake Complete; Access Token Acquired');

            this.#intervalMeta = {
               active: true,
               functionDelay: 1000,
               last_refreshed: Date.parse(new Date(this.#tokenData.date_collected)) / 1000
            };
            this.#interval = setInterval(async () => {await this.#intervalEvent();},this.#intervalMeta.functionDelay);
            this.interval = {
               /**
                * Returns whether or not the interval is active 
                * @returns {Boolean} Whether the interval is active
                */
               getActivity: () => this.#intervalMeta.active,
               /**Activates the log file interval */
               activate: () => {this.#intervalMeta.active = true},
               /**Deactivates the log file interval*/
               deactiveate: () => {this.#intervalMeta.active = false},
               /**
                * Gets the time delay that the interval uses for new log file creation
                * @returns {Number} Amount of time the interval waits before creating a new log file (in seconds)
                */
               getTimeDelay: () => this.#intervalMeta.timeDelay
            };
            console.log(terminalFormatter.bootSubBulletPoint,'Toke Refresh Interval Active');

            //Makes HTTP request to slack api to create a websocket for event recieving
            const socketRequest = await axios.request({
               method: 'POST',
               url: 'https://slack.com/api/apps.connections.open',
               headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Authorization': `Bearer ${this.#auth.app_level_token}`
               }
            })
               .then(res => {
                  if (res.data.ok) return res.data.url;
                  else throw new Error(`Slack Socket Mode Request Failed; ${JSON.stringify(res.data)}`);
               })
            
            //If the request was successfuly, create the websocket and wait until it is online
            if (typeof socketRequest !== 'undefined'){
               this.#websocket = new WebSocket(socketRequest);
               await (new Promise((resolve,reject) => {
                  this.#websocket.onopen = () => {
                     console.log(terminalFormatter.bootSubBulletPoint,'Web Socket Connected; Waiting for ping');
                  }
                  this.#websocket.onmessage = (e) => {
                     var data = JSON.parse(e.data);
                     if (data.type == 'hello'){
                        console.log(terminalFormatter.bootSubBulletPoint,'Ping Recieved; Web Socket Online');
                        this.#websocket.onmessage = undefined;
                     }
                     resolve();
                  }
               }))
            }

            console.log(terminalFormatter.bootSpecialSubBulletPoint,'Client Active');
            this.#subsystem = new Highway.Subsystem('Slack',this);
            return this;
         });
   }
   async #refreshToken(){
      const date = new Date();
      var request = await axios.request({
         method: 'POST',
         url: 'https://slack.com/api/oauth.v2.access',
         headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
         },
         params: new URLSearchParams({
            client_id: this.#auth.client_id,
            client_secret: this.#auth.client_secret,
            grant_type: 'refresh_token',
            refresh_token: this.#tokenData.refresh_token
         })
      })
         .then(res => {
            if (res.ok) return res.data;
            else console.error(res.data);
         });
      request.date_collected = date.toString();
      this.#tokenData = request;
      return await this.#files.tokenStore.write(request);
   }
   //!alert if error
   async #intervalEvent(){
      console.log('test2');
      try {
         if (this.#intervalMeta.active){
            var date = Date.parse(new Date()) / 1000;
            if (date - this.#intervalMeta.last_refreshed > this.#tokenData.expires_in - 300){
               await this.#refreshToken();
               this.#intervalMeta.last_refreshed = Date.parse(new Date()) / 1000;
            }
         }
      } catch(err){
         console.error(terminalFormatter.errorPoint,err);
      }
   }
}


export default SlackClient;
