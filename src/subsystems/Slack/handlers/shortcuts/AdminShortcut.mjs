import Shortcut from '../../Shortcut.mjs';
import ModalAssembly from '../../ModalAssembly.mjs';
import ConfigFile, { ConfigJSON } from '../../../../ConfigFile.mjs';
import Highway from '../../../../Highway.mjs';
import { capitalizeWords, alphabeticalSort } from '../../../../helper.mjs';
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
         case 'team_options_edit':
            await teamOptionsEditSubmitEvent({ ack, body, client });
            return;
         default:
            await ack();
            return;
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
   //Handles when the user presses to go to team option changing in the admin panel
   .onAction('admin_change_team_options', async ({ body, ack, client}) => {
      await ack();
      //Gets and uploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('team_options'),
         view_id: body.view.id
      });
   })
   //Handles whne the user chooses to edit the info of a team and its subteams
   .onAction('admin_edit_team', async ({ body, ack, client, action }) => {
      await ack();
      //Gets and uploads modal data
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('team_options_edit', { body, action }),
         view_id: body.view.id
      });
   })
   //Handles when the user clicks to delete a team
   .onAction('admin_delete_team', async ({ body, ack, client, action }) => {
      await ack();
      //Deletes the team from config data
      await ConfigJSON.writePath(`team_options.${action.value}`, undefined, { action: 'delete' });
      //Gets and uploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('team_options', { body }),
         view_id: body.view.id
      });
   })
   //Handles when a user clicks to create a new team
   .onAction('admin_add_new_team', async ({ body, ack, client }) => {
      await ack();
      //Gets and modifies modal
      var modal = await Assembly.getModal('team_options_edit', { body });
      modal.submit.text = 'Add Team';
      //Uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })
   //Handles when the user selects a subteam
   .onAction('admin_subteam_select', async ({ body, ack, client, action }) => {
      await ack();
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('subteam_select', { body, action }),
         view_id: body.view.id
      });
   })
   //Handles when the user clicks to add a new subteam
   .onAction('admin_add_new_subteam', async ({ body, ack, client }) => {
      await ack();
      //Gets input and metadata. Also creates an empty variable for modal
      var metadata = JSON.parse(body.view.private_metadata);
      var modal;
      if (!metadata.newSubteamEditingAdded) modal = await Assembly.getModal('subteam_add_new', { body });
      else {
         let subteamName = body.view.state.values[body.view.blocks[8].block_id].action.value;
         if (typeof metadata.team == 'undefined' || typeof metadata.team_prefix == 'undefined'){
            if (body.view.state.values.team_name.action.value !== null){
               metadata.options[body.view.state.values.team_name.action.value.toLowerCase()] = [];
               metadata.team = body.view.state.values.team_name.action.value.toLowerCase();
            }
            if (body.view.state.values.team_prefix.action.value !== null){
               metadata.team_prefix = body.view.state.values.team_prefix.action.value;
            }
            if (typeof metadata.team == 'undefined' || typeof metadata.team_prefix == 'undefined'){
               modal = await Assembly.getModal('subteam_name_error', { body }, 'Enter a team (not subteam) name and prefix before creating subteams');
            }
         } 
         if (typeof modal == 'undefined'){
            if (subteamName == null){
               modal = await Assembly.getModal('subteam_name_error', { body }, 'Please enter a name and click the "Add New Subteam" button');
            } else if (metadata.options[metadata.team]?.indexOf(subteamName.toLowerCase()) !== -1){
               modal = await Assembly.getModal('subteam_name_error', { body }, 'That subteam already exists');
            } else if (subteamName.length > 20){
               modal = await Assembly.getModal('subteam_name_error', { body }, 'Subteam name cannot be above 20 characters');
            } else {
               metadata.options[metadata.team].push(body.view.state.values[body.view.blocks[8].block_id].action.value.toLowerCase());
               body.view.private_metadata = JSON.stringify(metadata);
               modal = await Assembly.getModal('subteam_select', {
                  body,
                  action: { selected_option: {
                     text: {
                        type: 'plain_text',
                        text: `${metadata.team_prefix} ${capitalizeWords(subteamName.toLowerCase())}`
                     },
                     value: subteamName.toLowerCase()
                  }}
               });
            }
         }
      }
      //Uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })
   //Handles when the user clicks to delete an existing subteam
   .onAction('admin_delete_subteam', async ({ body, ack, client, action }) => {
      await ack();
      //Gets metadata and indees for the subteam
      var metadata = JSON.parse(body.view.private_metadata);
      var metaIndex = metadata.options[metadata.team].indexOf(action.value);
      //Modifies and saves metadata; removes the subteam
      metadata.options[metadata.team].splice(metaIndex,1);
      if (metaIndex == metadata.options[metadata.team].length) metaIndex--;
      body.view.private_metadata = JSON.stringify(metadata);

      //Fabricates an action so modal creation goes well
      var action = metadata.options[metadata.team][metaIndex] || 'no_subteams_added';
      action = { selected_option: {
         text: {
            type: 'plain_text',
            text: (metadata.options[metadata.team][metaIndex]) ? `${metadata.team_prefix} ${capitalizeWords(action)}` : 'No Subteams Added'
         },
         value: action
      }};
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('subteam_select', { body, action }),
         view_id: body.view.id
      });
   })
   //Handles when the user clicks to rename a subteam
   .onAction('admin_rename_subteam', async ({ body, ack, client, action }) => {
      await ack();
      //Gets input and metadata. Also indexes for the selected subteam
      var metadata = JSON.parse(body.view.private_metadata);
      var metaIndex = metadata.options[metadata.team].indexOf(action.value);
      var subteamName = body.view.state.values[body.view.blocks[10].block_id].action.value;
      //Gets the modal data depending on the scenario
      if (subteamName == null){ //If the subteam name field is empty; get an error modal
         modal = await Assembly.getModal('subteam_name_error', { body }, 'Please enter a name and click the "Add New Subteam" button');
      } else if (subteamName.length > 20){ //If the subteam name is above 20 charatcers; get an error modal
         modal = await Assembly.getModal('subteam_name_error', { body }, 'Subteam name cannot be above 20 characters');
      } else { //If the subteam name is valid; update and save metadata and get modal that selects the subteam
         metadata.options[metadata.team][metaIndex] = subteamName.toLowerCase();
         body.view.private_metadata = JSON.stringify(metadata);
         var modal = await Assembly.getModal('subteam_select', {
            body,
            action: { selected_option: {
               text: {
                  type: 'plain_text',
                  text: `${metadata.team_prefix} ${capitalizeWords(subteamName.toLowerCase())}`
               },
               value: subteamName.toLowerCase()
            }}
         });
      }
      //Uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
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
   //Modal creation for viewing all the teams and subteams
   .addModal('team_options', () => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(AdminShortcut.modal.team_options));
      var metadata = JSON.parse(modal.private_metadata);
      //Modifies modal data; adds the team option sections and saves them to metadata
      for (const i in ConfigFile.team_options){
         let sectionText = 
            `\n>*Name:*   ${capitalizeWords(i)}` +
            `\n>*Prefix:*   ${ConfigFile.team_options[i].prefix}` +
            `\n>*Subteams:*`
         ;
         for (const j of ConfigFile.team_options[i].options){
            sectionText += `\n>       - ${capitalizeWords(j)}`;
         }
         if (ConfigFile.team_options[i].options.length == 0) sectionText += `   No Subteams Added`;
         modal.blocks.push(
            { type: "divider" },
            {
               type: "header",
               text: {
                  type: "plain_text",
                  text: `${capitalizeWords(i)} Team`
               }
            },
            {
               type: "section",
               text: {
                  type: "mrkdwn",
                  text: sectionText
               },
               accessory: {
                  type: "button",
                  text: {
                     type: "plain_text",
                     text: "Edit Details"
                  },
                  value: i,
                  action_id: "admin_edit_team"
               }
            },
            {
               type: "actions",
               elements: [
                  {
                     type: "button",
                     text: {
                        type: "plain_text",
                        text: "Delete Team"
                     },
                     value: i,
                     action_id: "admin_delete_team"
                  }
               ]
            }
         );
         metadata.options[i] = ConfigFile.team_options[i].options;
      }
      //Saves metadata
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user selects a team to modify
   .addModal('team_options_edit', ({ body, action }) => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(AdminShortcut.modal.team_options_edit));
      var metadata = JSON.parse(body.view.private_metadata);
      //Modifies metadata
      metadata.submitType = 'team_options_edit';
      if (typeof metadata.team_prefix == 'undefined') metadata.team = action?.value;
      if (typeof metadata.team_prefix == 'undefined') metadata.team_prefix = ConfigFile.team_options[metadata.team]?.prefix;
      metadata.subteamEditingAdded = false;
      //Modifies modal data
      if (metadata.team) modal.blocks[3].element.initial_value = capitalizeWords(metadata.team);
      if (metadata.team_prefix) modal.blocks[4].element.initial_value = metadata.team_prefix;
      var sectionText = '*Subteams*\n';
      if (metadata.options[metadata.team]?.length == 0 || typeof metadata.options[metadata.team] == 'undefined'){
         modal.blocks[6].accessory.options.push({
            text: {
               type: 'plain_text',
               text: `No Subteams Added`
            },
            value: 'no_subteams_added'
         });
      } else for (const i of metadata.options[metadata.team]){
         sectionText += `\n     -         ${capitalizeWords(i)}`;
         modal.blocks[6].accessory.options.push({
            text: {
               type: 'plain_text',
               text: `${metadata.team_prefix} ` + `${capitalizeWords(i)}`
            },
            value: i
         });
      }
      sectionText += '\n\n>';
      modal.blocks[6].text.text = sectionText;
      if (body.view.submit.text == 'Add Team') modal.submit.text = 'Add Team';
      //Saves metadata
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user selects a subteam to modify
   .addModal('subteam_select', async ({ body, action }) => {
      //Gets metadata and modal data
      var metadata = JSON.parse(body.view.private_metadata);
      var modal = await Assembly.getModal('team_options_edit',{
         body,
         action: { value: metadata.team }
      });
      //Gets input data from select subteam dropdown
      var selectedSubteam = capitalizeWords(action.selected_option.value);
      //Modifies metadata
      metadata.subteamEditingAdded = true;
      metadata.newSubteamEditingAdded = false;
      //Modifies modal; adds new input blocks, resets input data for the subteam dropdown
      modal.blocks[6].block_id = (body.view.blocks[6].block_id == 'subteam_select0') ? 'subteam_select1' : 'subteam_select0';
      modal.blocks[6].text.text = modal.blocks[6].text.text.replace(`         ${selectedSubteam}`,`  💠 ${selectedSubteam}`);
      modal.blocks.push(
         {
            type: 'section',
            text: {
               type: 'plain_text',
               text: ' ',
            }
         },
         { type: 'divider' },
         {
            type: 'input',
            block_id: (body.view.blocks[10]?.block_id == 'subteam_name0') ? 'subteam_name1' : 'subteam_name0',
            element: {
               type: 'plain_text_input',
               action_id: 'action',
               placeholder: {
                  type: 'plain_text',
                  text: 'Enter a name'
               }
            },
            label: {
               type: 'plain_text',
               text: 'Subteam Name'
            },
            optional: true
         },
         {
            type: 'actions',
            elements: [
               {
                  type: 'button',
                  text: {
                     type: 'plain_text',
                     text: 'Rename Subteam'
                  },
                  value: selectedSubteam.toLowerCase(),
                  action_id: 'admin_rename_subteam'
               },
               {
                  type: 'button',
                  text: {
                     type: 'plain_text',
                     text: 'Delete Subteam'
                  },
                  value: selectedSubteam.toLowerCase(),
                  action_id: 'admin_delete_subteam',
                  style: 'danger'
               }
            ]
         }
      );
      modal.blocks[6].accessory.initial_option = action.selected_option;
      if (selectedSubteam.toLowerCase() == 'no_subteams_added'){
         modal.blocks.pop();
         modal.blocks.pop();
         modal.blocks.pop();
      } else modal.blocks[10].element.initial_value = selectedSubteam;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Handles when the user clicks to create a new subteam
   .addModal('subteam_add_new', async ({ body }) => {
      //Gets modal and metadata
      var metadata = JSON.parse(body.view.private_metadata);
      var modal = await Assembly.getModal('team_options_edit', {
         body,
         action: { value: metadata.team }
      });
      //Modifies metadata
      metadata.newSubteamEditingAdded = true;
      metadata.subteamEditingAdded = false;
      //Modifies modal data
      var popped = modal.blocks.pop();
      popped.elements[0].style = 'primary';
      modal.blocks.push(
         { type: 'divider' },
         {
            type: 'input',
            block_id: body.view.blocks[10]?.block_id || 'subteam_name0',
            element: {
               type: 'plain_text_input',
               action_id: 'action',
               placeholder: {
                  type: 'plain_text',
                  text: 'Enter a name'
               }
            },
            label: {
               type: 'plain_text',
               text: 'Subteam Name'
            },
            optional: true
         },
         popped
      );
      //Saves metadata
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user creates an error clicking on the 'Add New Subteam' button
   .addModal('subteam_name_error', async ({ body }, error) => {
      //Gets metadata and creates an empty variable for the modal data. Also creates the block for the error
      var metadata = JSON.parse(body.view.private_metadata);
      var modal;
      var context = {
         type: 'context',
         elements: [
            {
               type: 'plain_text',
               text: `❗️ ${error}`
            }
         ]
      };
      //Gets the modal data based on conditions
      if (metadata.subteamEditingAdded){ //If the user is in a subteam editing menu; modify modal to display error accordingly
         modal = await Assembly.getModal('subteam_select', {
            body,
            action: { selected_option: body.view.state.values[body.view.blocks[6].block_id].admin_subteam_select.selected_option} 
         });
         modal.blocks[10].block_id = (modal.blocks[10].block_id == 'subteam_name0') ? 'subteam_name1' : 'subteam_name0';
         modal.blocks[6].block_id = (modal.blocks[6].block_id == 'subteam_select0') ? 'subteam_select1' : 'subteam_select0';
         let popped = modal.blocks.pop();
         modal.blocks.push(context,popped);
      } else { //If the user is in a subteam adding menu; modify modal to display error accordingly
         modal = await Assembly.getModal('subteam_add_new', { body });
         modal.blocks[8].block_id = body.view.blocks[8].block_id;
         let popped = modal.blocks.pop();
         modal.blocks.push(context,popped);
      }
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

/**Handles subissions for changing the team option data */
const teamOptionsEditSubmitEvent = async ({ ack, body }) => {
   //Gets metadata and notes down old team name
   var metadata = JSON.parse(body.view.private_metadata);
   var oldTeamName = metadata.team;
   //Updates the team name and team prefix of the metadata
   metadata.team = body.view.state.values.team_name.action.value.toLowerCase();
   metadata.team_prefix = body.view.state.values.team_prefix.action.value;

   //Gets the current config data
   var configData = JSON.parse(JSON.stringify(ConfigFile.team_options));
   //Error checks the team name and team prefix fields
   if (metadata.team in configData && body.view.submit.text == 'Add Team') return await ack({ response_action: 'errors', errors: {
      team_name: 'Team already exists'
   }});
   if (metadata.team.length > 20) return await ack({ response_action: 'errors', errors: {
      team_name: 'Team name cannot be above 20 characters'
   }});
   if ([...metadata.team_prefix].length > 1) return await ack({ response_action: 'errors', errors: {
      team_prefix: 'Team prefix cannot be more than 1 character big'
   }});

   //If the saved team is new; add a template to the overwrite data
   if (typeof configData[oldTeamName] == 'undefined') configData[oldTeamName] = {
      prefix: '',
      options: []
   }
   //Fill out the overwrite data
   configData[oldTeamName].prefix = metadata.team_prefix;
   configData[oldTeamName].options = metadata.options[oldTeamName] || [];
   configData[metadata.team] = configData[oldTeamName];
   if (metadata.team !== oldTeamName) delete configData[oldTeamName];

   //Sorts the teams and subteams alphabetically
   for (const i in configData){
      configData[i].options = alphabeticalSort(configData[i].options);
      let index = configData[i].options.indexOf(`I Don't Know`);
      if (index !== -1) configData[i].options.push(configData[i].options.splice(index,1)[0]);
   }
   configData = (() => {
      let keys = alphabeticalSort(Object.keys(configData)), returnData = {};
      let index = keys.indexOf('other');
      if (index !== -1) keys.push(keys.splice(index,1)[0]);
      for (const j of keys) returnData[j] = configData[j];
      return returnData;
   })();
   //Saves the data to config
   await ConfigJSON.writePath(`team_options`,configData);
   //Logs the change in system log file
   await Highway.makeRequest('Local','log',['Team Options have been changed', { data: configData }]);
   //Gets and uploads a team options modal
   await ack({
      response_action: 'update',
      view: await Assembly.getModal('team_options')
   });
}

export default AdminShortcut;
