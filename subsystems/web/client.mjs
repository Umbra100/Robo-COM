import app from 'express';
import https from 'https';
import { terminalFormatter } from '../helper.mjs';
import Highway from '../highway.mjs';

class WebClient {
   #app
   #subsystem
   #server
   #sslkey
   #sslcert
   /**
    * Creates a web client used for interacting with endpoints both with other APIs and itself
    * @param {Object} options Options to decide how the web client will behave
    * @param {Number} options.port The port that the HTTPS server will listen on
    */
   constructor(options){
      return Promise.resolve(options)
         .then(async (options) => {
            console.log(terminalFormatter.bootBulletPoint,'Starting Web System Client');
            this.port = options.port;
            this.#sslkey = await Highway.makeRequest('Local','readFile',[{filepath: './security/.key'}]);
            this.#sslcert = await Highway.makeRequest('Local','readFile',[{filepath: './security/.cert'}]);

            this.#app = app();
            console.log(terminalFormatter.bootSubBulletPoint,'Express App Created');

            this.#server = https.createServer({
               key: this.#sslkey,
               cert: this.#sslcert
            },this.#app);
            await (new Promise((resolve,reject) => {
               this.#server.listen(this.port,() => {
                  console.log(terminalFormatter.bootSubBulletPoint,`HTTPS Server Established; Listening on port ${this.port}`);
                  resolve();
               })
            }));

            console.log(terminalFormatter.bootSpecialSubBulletPoint,'Client Active');
            this.#subsystem = new Highway.Subsystem('Web',this);
            return this;
         })
   }
   get(path,callback){
      return this.#app.get(path,callback);
   }
   post(path,callback){
      return this.#app.post(path,callback);
   }
}

export default WebClient;
