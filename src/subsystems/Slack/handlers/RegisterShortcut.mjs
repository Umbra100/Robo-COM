import Shortcut from "../Shortcut.mjs";
import ModalAssembly from "../ModalAssembly.mjs";
import Highway from "../../../Highway.mjs";
import ConfigFile from "../../../ConfigFile.mjs";
import EmailValidator from 'email-validator';
import env from 'dotenv';
import { terminalFormatter } from "../../../helper.mjs";

env.config({path: './security/.env'});
var userFile;

/** Main shortcut object */
const RegisterShortcut = new Shortcut('register')
   //When the shortcut listener is activated 
   .onReady(async () => {
      userFile = await Highway.makeRequest('Local','getFile',['./data/users.json']);
   })
   //Handles when the register shortcut is called 
   .onActivation(async (pkg) => {
      const { shortcut, ack, client } = pkg;
      await ack();
      
      //Defines modal variable and gets user data for modals to use
      var modal;
      const data = (await userFile.read())[shortcut.user.id];

      //Gets modal data accoridng to registration stage
      switch (data.registration_stage){
         case 'Not Complete':
            modal = await Assembly.getModal('part1',{ ...pkg, userData: data });
            break;
         case 'Part 1 Complete':
            modal = await Assembly.getModal('part2',{ ...pkg, userData: data });
            break;
         case 'Part 2 Complete':
            modal = await Assembly.getModal('part3',{ ...pkg, userData: data });
            break;
         default: throw new Error(`Invalid registration stage, expected 'Part 1 Complete', 'Part 2 Complete' or 'Not Complete', recieved '${data.registration_stage}'`);
      }

      //Uploads modal
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         trigger_id: shortcut.trigger_id
      });
   })
   //Routes the submission event to the correct function for handling 
   .onSubmit(async (pkg) => {
      switch (JSON.parse(pkg.view.private_metadata).part){
         case 1:
            await P1submitEvent(pkg);
            break;
         case 2:
            await P2submitEvent(pkg);
            break;
         case 3:
            await P3submitEvent(pkg);
            break;
      }
   })
   //Handles when the user clicks on the 'Add Personal Contact" button in part two 
   .onAction('personal_email_button',async ({ ack, body, client }) => {
      await ack();
      //Gets the modal data and if the personal emal hasn't been added:
      var metadata = JSON.parse(body.view.private_metadata);
      if (!metadata.personal_email_added){
         //Uploads modal with the personal email
         await client.views.update({
            token: process.env.SLACK_BOT_TOKEN,
            view: await Assembly.getModal('part2_personal_email', { body }),
            view_id: body.view.id
         });
      }
   })
   //Handles when the user clicks on the 'Add Personal Contact" button in the config mode of part two
   .onAction('personal_email_button_config',async({ ack, body, client }) => {
      await ack();
      //Gets the modal data and if the personal emal hasn't been added:
      var metadata = JSON.parse(body.view.private_metadata);
      if (!metadata.personal_email_added){
         //Uploads modal with the personal email
         await client.views.update({
            token: process.env.SLACK_BOT_TOKEN,
            view: await Assembly.getModal('part2_personal_email_config', { body }),
            view_id: body.view.id
         });
      }
   })
   //Handles when the user chooses what registration info they want to change
   .onAction('info_select_action', async ({ ack, body, client }) => {
      await ack();
      //Gets and uploads modal data
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('part3_info_chosen', { body }),
         view_id: body.view.id
      });
   })
   //Acknowledges any miscellenous actions that don't have an event 
   .onAction('action',async ({ ack }) => {await ack();});

/**Handles all modal creation and assembly */
export const Assembly = new ModalAssembly()
   //Modal creation for part 1 
   .addModal('part1',() => {
      //Get original modal data
      var modal = JSON.parse(JSON.stringify(RegisterShortcut.modal.part1));
      //Modify modal data; add team choices
      modal.blocks[2].element.options = [];
      for (const i in ConfigFile.team_options){
         for (const j of ConfigFile.team_options[i].options){
            modal.blocks[2].element.options.push({
               text: {
                  type: 'plain_text',
                  text: `${ConfigFile.team_options[i].prefix} ${j.slice(0,1).toUpperCase()}${j.slice(1,j.length)}`
               },
               value: `${i}.${j}`
            });
         }
      }
      return modal;
   })
   //Modal creation for part 1 config mode 
   .addModal('part1_config', async ({ userData }) => {
      //Gets original modal data and metadata
      var modal = await Assembly.getModal('part1');
      var metadata = JSON.parse(modal.private_metadata);

      //Modify modal by adding existing registration data
      modal.blocks[1].element.initial_value = userData.name;
      modal.blocks[4].element.initial_options = [{
         text: {
            type: 'plain_text',
            text: 'I am interested in participating in outreach events'
         },
         value: 'yes'
      }];
      modal.blocks[2].element.initial_options = [];
      for (const i of userData.teams){
         let spl = i.split('.');
         modal.blocks[2].element.initial_options.push({
            text: {
               type: 'plain_text',
               text: `${ConfigFile.team_options[spl[0]].prefix} ${spl[1].slice(0,1).toUpperCase()}${spl[1].slice(1,spl[1].length)}`
            },
            value: i
         });
      }
      modal.submit = {
         type: 'plain_text',
         text: 'Save'
      };
      modal.blocks.pop();
      modal.blocks.pop();
      //Modify can save metadata
      metadata.stageOverride = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for part 2 
   .addModal('part2', () => JSON.parse(JSON.stringify(RegisterShortcut.modal.part2)))
   //Modal creation for part 2 personal email adding 
   .addModal('part2_personal_email', async ({ body }) => {
      //Gets metadata and original modal data
      var modal = await Assembly.getModal('part2');
      var metadata = JSON.parse(modal.private_metadata);
      //Adds personal email field
      modal.blocks[5] = {
         type: "input",
         block_id: "personal_email",
         element: {
            type: "email_text_input",
            action_id: "action",
            placeholder: {
               type: "plain_text",
               text: "Personal Email",
            },
         },
         label: {
            type: "plain_text",
            text: " ",
         }
      };
      //Validates currently inputted emails; if they aren't valid, don't put them in
      if (EmailValidator.validate(body?.view?.state?.values?.school_email?.action?.value)){
         modal.blocks[4].element.initial_value = body.view.state.values.school_email.action.value;
      }
      if (EmailValidator.validate(body?.view?.state?.values?.guardian_email?.action?.value)){
         modal.blocks[9].element.initial_value = body. view.state.values.guardian_email.action.value;
      }
      //Modify and store metadata
      metadata.personal_email_added = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for part 2 config mode 
   .addModal('part2_config',async ({ body, userData }) => {
      //Gets original modal data and do some modification; if there is a personal email, get that modal instead
      var modal, metadata;
      if (userData.personal_contact.personal_email == null){
         modal = await Assembly.getModal('part2');
         modal.blocks[5].elements[0].action_id = 'personal_email_button_config';
         metadata = JSON.parse(modal.private_metadata);
      } else {
         modal = await Assembly.getModal('part2_personal_email', { body });
         metadata = JSON.parse(modal.private_metadata);
         modal.blocks[5].element.initial_value = userData.personal_contact.personal_email;
         metadata.personal_email_added = true;
      }
      //Modify modal; add existing registration data
      modal.blocks[3].element.initial_value = userData.personal_contact.phone_number;
      modal.blocks[4].element.initial_value = userData.personal_contact.school_email;
      modal.blocks[7].element.initial_value = userData.guardian_contact.name;
      modal.blocks[8].element.initial_value = userData.guardian_contact.phone_number;
      modal.blocks[9].element.initial_value = userData.guardian_contact.email;
      if (userData.settings.recieve_daily_reminders) modal.blocks[11].accessory.initial_options = [{
         text: {
            type: 'mrkdwn',
            text: '*I would like to recieve daily reminders*'
         },
         description: {
            type: 'mrkdwn',
            text: 'This will send a daily reminder about coming to robotics'
         },
         value: 'reminders-active'
      }];
      modal.submit = {
         type: 'plain_text',
         text: 'Save'
      }
      modal.blocks.shift();
      modal.blocks.shift();
      //Save metadata
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for part 2 config mode personal email adding 
   .addModal('part2_personal_email_config', async ({ body }) => {
      //Get original personal email modal
      var modal = await Assembly.getModal('part2_personal_email', { body });
      //Modify to be in config mode; remove header description
      modal.blocks.shift();
      modal.blocks.shift();
      return modal;
   })
   //Modal creation for part 3 (part after registration is complete) 
   .addModal('part3', ({ userData }) => {
      //Gets original modal data
      var modal = JSON.parse(JSON.stringify(RegisterShortcut.modal.part3));

      //Stores userdata in modal metadata
      var metadata = JSON.parse(modal.private_metadata);
      metadata.userData = userData;
      modal.private_metadata = JSON.stringify(metadata);

      //Modifies modal data; fills out user data from completed registration
      //Fills out user info
      modal.blocks[5].text.text = modal.blocks[5].text.text.replace('$1',userData.name);
      modal.blocks[5].text.text = modal.blocks[5].text.text.replace('$2',userData.personal_contact.phone_number);
      modal.blocks[5].text.text = modal.blocks[5].text.text.replace('$3',userData.personal_contact.school_email);
      if (userData.personal_contact.personal_email !== null){
         modal.blocks[5].text.text = modal.blocks[5].text.text.replace('$4',`\n>         *Personal Email:*   ${userData.personal_contact.personal_email}`);
      } else modal.blocks[5].text.text = modal.blocks[5].text.text.replace('$4','');

      //Fills out guardian info
      modal.blocks[7].text.text = modal.blocks[7].text.text.replace('$5',userData.guardian_contact.name);
      modal.blocks[7].text.text = modal.blocks[7].text.text.replace('$6',userData.guardian_contact.phone_number);
      modal.blocks[7].text.text = modal.blocks[7].text.text.replace('$7',userData.guardian_contact.email);

      //Fills out other info
      modal.blocks[9].text.text = modal.blocks[9].text.text.replace('$8',userData.interested_in_outreach ? 'Yes' : 'No');
      modal.blocks[9].text.text = modal.blocks[9].text.text.replace('$9',''.concat(...userData.teams.map(i => {
         var str = i.split('.')[1];
         str = str.slice(0,1).toUpperCase() + str.slice(1,str.length);
         return `\n>               •  ${str}`;
      })));
      return modal;
   })
   //Modal creation for part 3 required input field error adding 
   .addModal('part3_required_field_error', async ({ body }) => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(RegisterShortcut.modal.part3));
      var metadata = JSON.parse(body.view.private_metadata);
      //Changes modal data; adds the requires field error if it hasn't already been added
      modal.blocks = body.view.blocks;
      if (!metadata.warningAdded){
         modal.blocks = [].concat(modal.blocks.slice(0, 3), [{
            type: "context",
            elements: [
               {
                  type: "mrkdwn",
                  text: "⭕️  This field is required  ⭕️",
               }
            ]
         }], modal.blocks.slice(3, modal.blocks.length));
      }
      //Modifies and stores metadata
      metadata.warningAdded = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for part 3 user chooses info to change 
   .addModal('part3_info_chosen', async ({ body }) => {
      //Gets the original modal data
      var metadata = JSON.parse(body.view.private_metadata);
      var modal = await Assembly.getModal('part3', { userData: metadata.userData });

      //If the user chose to change part 1 data, mark those list items
      if (body.view.state.values.info_select.info_select_action.selected_option.value == 'p1'){
         modal.blocks[5].text.text = modal.blocks[5].text.text.replace('         *Name:*','💠  *Name:*');
         modal.blocks[9].text.text = modal.blocks[9].text.text.replace('         *Interested in Outreach:*','💠  *Interested in Outreach:*');
         modal.blocks[9].text.text = modal.blocks[9].text.text.replace('         *Team Interest:*','💠  *Team Interest:*');
      //If the user chose to change part 2 data, mark those list items
      } else {
         modal.blocks[5].text.text = modal.blocks[5].text.text.replace('         *Phone Number:*','💠   *Phone Number:*');
         modal.blocks[5].text.text = modal.blocks[5].text.text.replace('         *School Email:*','💠   *School Email:*');
         modal.blocks[5].text.text = modal.blocks[5].text.text.replace('         *Personal Email:*','💠   *Personal Email:*');
         modal.blocks[7].text.text = modal.blocks[7].text.text.replace('         *Name:*','💠   *Name:*');
         modal.blocks[7].text.text = modal.blocks[7].text.text.replace('         *Phone Number:*','💠   *Phone Number:*');
         modal.blocks[7].text.text = modal.blocks[7].text.text.replace('         *Email:*','💠   *Email:*');
      }
      //Save metadata
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })

/**Handles the submission event for part one of registration */
const P1submitEvent = async ({ ack, body, client }) => {
   //Gets metadata
   var metadata = JSON.parse(body.view.private_metadata);
   //Creates the base data entry to be stored in user data and makes necessary changes
   var dataForm = {
      name: body.view.state.values.name_text_field.action.value,
      slack_username: body.user.username,
      slack_name: body.user.name,
      unsure_about_teams: false,
      teams: [],
      interested_in_outreach: body.view.state.values.outreach_field.action.selected_options[0]?.value == 'yes',
      registration_stage: metadata.stageOverride ? 'Part 2 Complete' : 'Part 1 Complete'
   };
   for (const i of body.view.state.values.team_select_field.action.selected_options){
      if (i.value == `other.I Don't Know`) dataForm.unsure_about_teams = true;
      else dataForm.teams.push(i.value);
   }

   //Overwrites the base user data
   var data = (await userFile.read())[body.user.id];
   Object.assign(data,dataForm);
   await userFile.writePath(body.user.id,data);

   //Sends them to part two of registration unless the submission is in config mode (just to change existing data)
   if (!metadata.stageOverride){
      await ack({
         response_action: 'update',
         view: await Assembly.getModal('part2')
      });
   } else await ack();
}

//todo - DM user a welcome message with necessary info
/**Handles the submission event for part two of registration */
const P2submitEvent = async ({ ack, body, view }) => {
   //Gets metadata
   var metadata = JSON.parse(body.view.private_metadata), errors = {};
   //Validates inputted email addresses
   if (!EmailValidator.validate(view.state.values.school_email.action.value)) errors.school_email = 'Invalid email';
   if (!EmailValidator.validate(view.state.values.personal_email?.action?.value) && metadata.personal_email_added){
      errors.personal_email = 'Invalid email';
   }
   if (!EmailValidator.validate(view.state.values.guardian_email.action.value)) errors.guardian_email = 'Invalid email';

   //If an email address was invalid, send an error
   if (Object.keys(errors).length !== 0){
      await ack({
         response_action: 'errors',
         errors
      });
      return;
   } else await ack();

   //Forms data to overwrite in user file
   var dataForm = {
      personal_contact: {
         phone_number: view.state.values.personal_phone_number.action.value,
         school_email: view.state.values.school_email.action.value,
         personal_email: (metadata.personal_email_added) ? view.state.values.personal_email.action.value : null
      },
      guardian_contact: {
         name: view.state.values.guardian_name.action.value,
         phone_number: view.state.values.guardian_phone_number.action.value,
         email: view.state.values.guardian_email.action.value
      },
      registration_stage: 'Part 2 Complete'
   };
   var settingsData = {
      recieve_daily_reminders: typeof view.state.values.reminder.action.selected_options[0] !== 'undefined'
   };

   //Overwrites user data
   var data = (await userFile.read())[body.user.id];
   Object.assign(data,dataForm);
   Object.assign(data.settings,settingsData);
   await userFile.writePath(body.user.id,data);

   //Log results
   await Highway.makeRequest('Local','log',[`User '${data.slack_name}' (${data.name}) has completed registration.`]);
   console.log(terminalFormatter.bulletPoint,`User '${data.slack_name}' (${data.name}) has completed registration.`);
}

/**Handles when a submits to modify some of their registration data */
const P3submitEvent = async ({ ack, body, client }) => {
   //Gets metadata
   var metadata = JSON.parse(body.view.private_metadata);
   //If a user hasn't selected info to modify, send an error
   if (body.view.state.values.info_select.info_select_action.selected_option == null){
      await ack({
         response_action: 'update',
         view: await Assembly.getModal('part3_required_field_error', { body })
      });
      return;
   }
   //If the user has chosen to modify registration data from part one; send part one modal in config mode
   if (body.view.state.values.info_select.info_select_action.selected_option.value == 'p1'){
      await ack({
         response_action: 'update',
         view: await Assembly.getModal('part1_config',{ userData: metadata.userData })
      });
   //If the user has chosen to modify registration data from part two; send part two modal in config mode
   } else {
      await ack({
         response_action: 'update',
         view: await Assembly.getModal('part2_config',{ userData: metadata.userData })
      });
   }
}

export default RegisterShortcut;
