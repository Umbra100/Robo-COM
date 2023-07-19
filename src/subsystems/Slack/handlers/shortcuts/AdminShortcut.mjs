import Shortcut from '../../Shortcut.mjs';
import ModalAssembly from '../../ModalAssembly.mjs';
import ConfigFile, { waitForChange, ConfigJSON } from '../../../../ConfigFile.mjs';
import Highway from '../../../../Highway.mjs';
import env from 'dotenv';

import { Assembly as RegisterAssembly } from './RegisterShortcut.mjs';
import AdminAlert from '../alerts/AdminAlert.mjs';

env.config({ path: './security/.env' });

var userFile, userData, slackUserData;

/**Handles all shortcut interaction with the admin controls */
const AdminShortcut = new Shortcut('admin')
   .onReady(async () => {
      userFile = await Highway.makeRequest('Local','getFile',['./data/users.json']);
   })
   //Uploads initial admin panel when shortcut is called
   .onActivation(async ({ shortcut, ack, client }) => {
      //Gets and updates the user data from local and slack sources
      userData = await userFile.read();
      slackUserData = (await client.users.list({
         token: process.env.SLACK_BOT_TOKEN
      })).members;
      await ack();
      for (const i of slackUserData){
         if (i.id == shortcut.user.id){
            if (!(await AdminAlert.check(i.id,i))) return await AdminAlert.alert({ shortcut, client });
         }
      }
      //Get and upload modal
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('initial'),
         trigger_id: shortcut.trigger_id
      });
   })
   //Routes submissions to the correct handlers
   .onSubmit(async ({ ack, body, client }) => {
      const metadata = JSON.parse(body.view.private_metadata);
      var modal
      switch (metadata.submitType){
         case 'season_dates':
            await seasonDatesSubmitEvent({ ack, body });
            return;
         case 'user_catalog':
            modal = await Assembly.getModal('user_catalog_user_data_entry', { body });
            break;
         case 'back_to_user_catalog':
            modal = await Assembly.getModal('user_catalog');
            break;
      }
      await ack({
         response_action: 'update',
         view: modal
      })
   })
   //Handles when the user clicks to back button to go back to the admin panel
   .onAction('admin_initial_back_to', async ({ body, ack, client }) => {
      await ack();
      //Get and upload modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('initial'),
         view_id: body.view.id
      });
   })
   //Uploads season date changing modal when that configuration button is pressed
   .onAction('admin_change_season_dates',async ({ ack, client, body }) => {
      await ack();
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('season_dates'),
         view_id: body.view.id
      });
   })
   //Uploads the user catalog modal when that button is pressed
   .onAction('admin_view_user_catalog', async ({ ack, client, body }) => {
      await ack();
      //Gets and uploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('user_catalog'),
         view_id: body.view.id
      });
   })
   //Handles when the user chooses a user to view; checks to make sure they chose a valid user
   .onAction('admin_view_user_choose', async ({ body, ack, client }) => {
      await ack();
      //Gets metadata
      const metadata = JSON.parse(body.view.private_metadata);
      //Iterates through slack user data; if the chosen user is a bot update modal with the error
      for (const i of slackUserData){
         if (i.id == body.view.state.values.user_choose.admin_view_user_choose.selected_user && (i.is_bot || i.id == 'USLACKBOT')){
            if (!metadata.errorAdded){
               await client.views.update({
                  token: process.env.SLACK_BOT_TOKEN,
                  view: await Assembly.getModal('user_catalog_user_choice_error', { body }),
                  view_id: body.view.id
               });
            }
            return;
         }
      }
      //If the error has been added and the chosen user is a valid user; remove the error message
      if (metadata.errorAdded){
         await client.views.update({
            token: process.env.SLACK_BOT_TOKEN,
            view: await Assembly.getModal('user_catalog_user_choice_error_remove', { body }),
            view_id: body.view.id
         })
      }
   })

/**Handles all modal creation and assembly */
export const Assembly = new ModalAssembly()
   //Modal creation for initial modal 
   .addModal('initial', () => JSON.parse(JSON.stringify(AdminShortcut.modal.initial)))
   //Modal creation for season dates modal 
   .addModal('season_dates', () => {
      var modal = JSON.parse(JSON.stringify(AdminShortcut.modal.season_dates));
      if (ConfigFile.season_dates.start !== null) modal.blocks[2].element.initial_date = ConfigFile.season_dates.start;
      if (ConfigFile.season_dates.end !== null) modal.blocks[3].element.initial_date = ConfigFile.season_dates.end;
      return modal;
   })
   //Modal creation for the user catalog modal
   .addModal('user_catalog', () => {
      //Gets the original modal data and creates some arrays for sorting the users
      var modal = JSON.parse(JSON.stringify(AdminShortcut.modal.user_catalog));
      var users = {unregistered: [],part1Complete: [], part2Complete: []};
      //Function used to format the user data into a displayable modal block
      const formatUserToModal = user => ({
         type: 'context',
         elements: [
            {
               type: 'image',
               image_url: user.profile.image_192,
               alt_text: 'Profile Picture'
            },
            {
               type: 'mrkdwn',
               text: `|   *${user.real_name}*`
            }
         ]
      });
      //Iterates through user data from slack and local; formats and sort them so they can be added to the modal
      for (const i of slackUserData){
         if (i.deleted || i.is_bot || i.id == 'USLACKBOT') continue;
         if (i.id in userData){
            switch (userData[i.id].registration_stage){
               case 'Not Complete':
                  users.unregistered.push(formatUserToModal(i));
                  break;
               case 'Part 1 Complete':
                  users.part1Complete.push(formatUserToModal(i));
                  break;
               case 'Part 2 Complete':
                  users.part2Complete.push(formatUserToModal(i));
                  break;
            }
         } else users.unregistered.push(formatUserToModal(i));
      }
      //Adds the unregistered users to the modal
      if (users.unregistered.length > 0){
         modal.blocks.push({
            type: 'section',
            text: {
               type: 'mrkdwn',
               text: '*Unregistered*'
            }
         });
         modal.blocks.push(...users.unregistered);
         modal.blocks[modal.blocks.length-1].elements[1].text += '\n\n>';
      }
      //Adds the users who have completed part 1 to the modal
      if (users.part1Complete.length > 0){
         modal.blocks.push({
            type: 'section',
            text: {
               type: 'mrkdwn',
               text: '*Part 1 Complete*'
            }
         });
         modal.blocks.push(...users.part1Complete);
         modal.blocks[modal.blocks.length-1].elements[1].text += '\n\n>';
      }
      //Adds the users who have completed part 2 to the modal
      if (users.part2Complete.length > 0){
         modal.blocks.push({
            type: 'section',
            text: {
               type: 'mrkdwn',
               text: '*Part 2 Complete*'
            }
         });
         modal.blocks.push(...users.part2Complete);
         modal.blocks[modal.blocks.length-1].elements[1].text += '\n\n>';
      }
      return modal;
   })
   //Modal creation for the user catalog modal with an error saying that you can't choose bot users
   .addModal('user_catalog_user_choice_error', ({ body }) => {
      //Gets original modal data and metadata
      var modal = JSON.parse(JSON.stringify(AdminShortcut.modal.user_catalog));
      var metadata = JSON.parse(modal.private_metadata);
      //Modifies modal; adds in the error context block
      modal.blocks = body.view.blocks;
      var shifted = [];
      shifted.push(modal.blocks.shift());
      shifted.push(modal.blocks.shift());
      shifted.push(modal.blocks.shift());
      modal.blocks = [{
         type: 'context',
         elements: [{
            type: 'mrkdwn',
            text: `⭕️  The chosen user can't be a robot, please choose again  ⭕️`
         }]
      },...modal.blocks];
      modal.blocks = shifted.concat(modal.blocks);
      //Modifies and saves metadata
      metadata.errorAdded = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for removing the error message from the previous modal
   .addModal('user_catalog_user_choice_error_remove', ({ body }) => {
      //Gets original modal
      var modal = JSON.parse(JSON.stringify(AdminShortcut.modal.user_catalog));
      //Modifies modal; removes the error message
      modal.blocks = body.view.blocks;
      modal.blocks = [].concat(modal.blocks.slice(0,3),modal.blocks.slice(4,modal.blocks.length));
      return modal;
   })
   //Modal creation for getting the user data from a specific user
   .addModal('user_catalog_user_data_entry', async ({ body }) => {
      //Gets the modal data (from registration p3) and the specified user's profile picture
      var modal = await RegisterAssembly.getModal('part3', { userData: userData[body.view.state.values.user_choose.admin_view_user_choose.selected_user] });
      var image_url;
      for (const i of slackUserData) if (i.id == body.view.state.values.user_choose.admin_view_user_choose.selected_user) image_url = i.profile.image_512;

      //Modifies modal; transforms it into a modal fitting this functionality, adds user data, adds profile picture, changes other function elements
      modal.callback_id = 'admin';
      modal.submit.text = 'OK';
      modal.close.text = 'Close';
      modal.private_metadata = '{"submitType":"back_to_user_catalog"}'
      for (let j = 0; j < 4; j++) modal.blocks.shift();

      modal.blocks[0].text.text = 'User Info';
      modal.blocks[1].text.text = modal.blocks[1].text.text.replaceAll('null','Not Given');
      modal.blocks[1].text.text = modal.blocks[1].text.text.replaceAll('         ','    ');
      modal.blocks[1].accessory = {
         type: 'image',
         image_url,
         alt_text: 'Profile Picture'
      };
      modal.blocks[3].text.text = modal.blocks[3].text.text.replaceAll('null','Not Given');
      modal.blocks[3].text.text = modal.blocks[3].text.text.replaceAll('         ','    ');
      modal.blocks[3].accessory = {
         type: 'image',
         image_url: 'https://pbs.twimg.com/profile_images/625633822235693056/lNGUneLX_400x400.jpg',
         alt_text: 'cat image'
      };
      modal.blocks[5].text.text = modal.blocks[5].text.text.replaceAll('null','Not Given');
      modal.blocks[5].text.text = modal.blocks[5].text.text.replaceAll('         ','    ');
      return modal;
   })

/**Handles submissions for the season date changing */
const seasonDatesSubmitEvent = async ({ ack, body }) => {
   await ack();
   //If the settings did not change; return
   if (body.view.state.values.startDate.action.selected_date == ConfigFile.season_dates.start && body.view.state.values.endDate.action.selected_date == ConfigFile.season_dates.end) return;
   //Stores the season dates in the config file
   await ConfigJSON.writePath('season_dates',{
      start: body.view.state.values.startDate.action.selected_date,
      end: body.view.state.values.endDate.action.selected_date
   });
   await waitForChange();
}

export default AdminShortcut;
