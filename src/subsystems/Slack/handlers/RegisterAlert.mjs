import Shortcut from "../Shortcut.mjs";
import Highway from "../../../Highway.mjs";
import { activationEvent as RegisterActivate } from "./RegisterShortcut.mjs";
import env from 'dotenv';

env.config({ path: './security/.env' });

var registerModal, userFile;

const RegisterAlert = new (class extends Shortcut {
   constructor(){
      super('register-alert');
   }
   /**
    * Sends a shortcut event to the registration alert modal.
    * This is used to direct an unregistered user to the registration page if the user has not completed registration.
    * Shortcut event should be acknowledged before this method is called
    * @param {Object} pkg Slack shortcut event package 
    * @async
    * @returns {Object} Slack view open response
    */
   async alert({ shortcut, client }){
      const modal = RegisterAlert.modal.initial;
      return await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         trigger_id: shortcut.trigger_id
      });
   }
   /**
    * Checks a user ID to see if their registration is complete in user data
    * @param {String} userId Slack user ID to check in user data
    * @async
    * @returns {Boolean} Whether the user registration data is complete. true = complete
    */
   async check(userId){
      const data = (await userFile.read())[userId];
      return (typeof data !== 'undefined') && data?.registration_stage == 'Part 2 Complete';
   }
})()
   //When the shortcut is intialized; get user and modal data
   .onReady(async () => {
      var file = await Highway.makeRequest('Local','getFile',['./src/subsystems/Slack/modals/register.json']);
      userFile = await Highway.makeRequest('Local','getFile',['./data/users.json']);
      registerModal = (await file.read()).initial;
   })
   //When the modal is submitted (they click the 'go to registration' button) sends them to registration system
   .onSubmit(async (pkg) => {
      Object.assign(pkg,{
         shortcut: pkg.body
      });
      await RegisterActivate(pkg);
   });

export default RegisterAlert;

/*

This is the registry alert system. When a user activates a shortcut that requires registration data such as contact info,
name, schedule data, etc. it sends them to this shortcut system. The reason this shortcut is here is so we can prevent
errors from happening if a user has incomplete data.

The reason this shortcut is created differently from the other shortcuts is because it's not an officially created shortcut
for the app. Meaning you cannot activate this shortcut through a command on slack. It's simply an event listener for other
shortcuts to activate.

The modal this shortcut sends simply consists of an alert and an option to get sent to the register shortcut.

*/
