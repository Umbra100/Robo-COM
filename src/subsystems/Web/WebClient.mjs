import app from 'express';
import https from 'https';
import ConfigFile from '../../ConfigFile.mjs';
import Highway from '../../Highway.mjs';
import { terminalFormatter } from '../../helper.mjs';

class WebClient {
   #app
   #subsystem
   #server
   #sslkey
   #sslcert
   constructor(){
      return Promise.resolve()
         .then(async () => {
            console.log(terminalFormatter.bootBulletPoint,'Starting Web System Client');
            this.port = ConfigFile.clients.web.server_port;
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
