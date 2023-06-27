import App from 'twilio';
import env from 'dotenv';
import ConfigFile from '../../ConfigFile.mjs';
import Highway from '../../Highway.mjs';
import { terminalFormatter } from '../../helper.mjs';

env.config({path: './security/.env'});

var client;

/**Twilio Cleint used for handling SMS communication */
class TwilioClient {
   #subsystem
   constructor(){
      console.log(terminalFormatter.bootBulletPoint,'Starting Twilio SMS Client');
      client = App(process.env.TWILIO_SID,process.env.TWILIO_AUTH_TOKEN);
      console.log(terminalFormatter.bootSubBulletPoint,'Twilio Client Defined');
      console.log(terminalFormatter.bootSpecialSubBulletPoint,'Client Active');

      this.#subsystem = new Highway.Subsystem('Twilio',this);
   }
   /**
    * Sends an SMS message to a recipient with specified content
    * @param {Object} options Options for sending the message
    * @param {String} options.to Phone number of the recipient to send to
    * @param {String} options.body Body of the message to send
    * @returns Message response data
    */
   async send({ to, body }){
      return await client.messages.create({
         body,
         to,
         from: ConfigFile.clients.twilio.phone_number
      })
   }
}

export default TwilioClient;
