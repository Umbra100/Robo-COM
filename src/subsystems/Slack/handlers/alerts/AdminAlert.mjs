import Shortcut from "../../Shortcut.mjs";
import ModalAssembly from "../../ModalAssembly.mjs";
import env from 'dotenv';

env.config({ path: './security/.env' });

const AdminAlert = new (class extends Shortcut {
   #getUserInfo
   constructor(){
      super('admin-alert');
   }
   /**
    * Activates the shortcut and gets it ready to operate
    * @param {Object} client Slack client to host the event listeners on
    * @param {Object} modalData Modal data used by the shortcut to perform interactions
    * @async
    */
   async activate(client, modalData){
      this.#getUserInfo = client.client.users.info;
      await super.activate(client, modalData);
   }
   /**
    * Sends a shortcut event to the admin (access denied) alert modal.
    * This is to alert the user that they do not have permission to access an admin functionality
    * Shortcut event should be acknowledged before this method is called
    * @param {Object} pkg Slack shortcut event package 
    * @async
    * @returns {Object} Slack view open response
    */
   async alert({ shortcut, client }){
      //Get and upload modal
      return await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('initial'),
         trigger_id: shortcut.trigger_id
      });
   }
   /**
    * Checks user slack data to see if they are a slack admin
    * @param {String} userId Slack user ID to reference
    * @param {Object} [dataOverride] Slack data to use instead of it calling to get the data
    * @async
    * @returns {Boolean} Whether the user is an admin
    */
   async check(userId, dataOverride){
      var data;
      if (typeof dataOverride !== 'undefined') data = dataOverride;
      else {
         data = (await this.#getUserInfo({
            token: process.env.SLACK_BOT_TOKEN,
            user: userId
         })).user;
      }
      return data.is_admin;
   }
})()
   //When the modal is submitted; acknowledge
   .onSubmit(async ({ ack }) => await ack());

/**Handles all modal creation and assembly */
export const Assembly = new ModalAssembly()
   //Modal creation for the initial modal 
   .addModal('initial',() => JSON.parse(JSON.stringify(AdminAlert.modal.initial)));

export default AdminAlert;

/*

This is the admin alert system. When a user activates a functionality that requires admin privilages, this check whether or not they do.
It also send an alert to the user saying that they need admin privileges.

*/
