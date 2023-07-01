import Shortcut from "../Shortcut.mjs";
import Highway from "../../../Highway.mjs";
import ConfigFile from "../../../ConfigFile.mjs";
import EmailValidator from 'email-validator';
import env from 'dotenv';
import { terminalFormatter } from "../../../helper.mjs";

env.config({path: './security/.env'});

var userFile, scheduleFile;
var P1submitEvent, P2submitEvent, P2addPersonalEmailEvent;

/** Main shortcut object */
const RegisterShortcut = new Shortcut('register')
   .onReady(async () => {
      userFile = await Highway.makeRequest('Local','getFile',['./data/users.json']);
      scheduleFile = await Highway.makeRequest('Local','getFile',['./data/scheduling.json']);
   })
   .onActivation(async (pkg) => await activationEvent(pkg))
   .onSubmit(async (pkg) => { //todo - Route to settings page when executed and p2 is completed
      //Routes the submission event ot the correct function for handling
      switch (JSON.parse(pkg.view.private_metadata).part){
         case 1:
            await P1submitEvent(pkg);
            break;
         case 2:
            await P2submitEvent(pkg);
            break;
      }
   })
   .onAction('personal_email_button',async (pkg) => {await P2addPersonalEmailEvent(pkg);})
   .onAction('reminder_action',async ({ ack }) => {await ack();});

export const activationEvent = async ({ shortcut, ack, client }) => {
   await ack();
   
   //Gets the user data file from local client
   const data = await userFile.read();

   //If the user has not completed part one of registration; send them there
   if (typeof data[shortcut.user.id] == 'undefined' || data[shortcut.user.id].registration_part == null){
      //Adds team options to modal
      let modal = Object.assign({},RegisterShortcut.modal.part1);
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

      //Opens modal
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         trigger_id: shortcut.trigger_id
      });
   //If the user has completed part one of registration; send them to part two
   } else {
      //Gets and sends modal
      let modal = Object.assign({},RegisterShortcut.modal.part2);
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         trigger_id: shortcut.trigger_id
      });
   }
};

/**Handles the submission event for part one of registration */
P1submitEvent = async ({ ack, body, view, client }) => {
   await ack();

   //Creates the base data entry to be stored in user data and makes necessary changes
   await createNewUser(body.user.id);
   var dataForm = {
      name: view.state.values.name_text_field.action.value,
      slack_username: body.user.username,
      slack_name: body.user.name,
      unsure_about_teams: false,
      teams: [],
      interested_in_outreach: view.state.values.outreach_field.action.selected_options[0]?.value == 'yes',
      registration_stage: 'Part 1 Complete'
   };
   for (const i of view.state.values.team_select_field.action.selected_options){
      if (i.value == `other.I Don't Know`) dataForm.unsure_about_teams = true;
      else dataForm.teams.push(i.value);
   }

   //Overwrites the base user data
   var data = (await userFile.read())[body.user.id];
   Object.assign(data,dataForm);
   await userFile.writePath(body.user.id,data);

   //Sends them to part two of registration
   var modal = Object.assign({},RegisterShortcut.modal.part2);
   await client.views.open({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      trigger_id: body.trigger_id
   });
}

//todo - DM user a welcome message with necessary info
//Handles the submission event for part two of registration
P2submitEvent = async ({ ack, body, view, client}) => {
   await ack();

   //Forms data to overwrite in user file
   var dataForm = {
      personal_contact: {
         phone_number: view.state.values.personal_phone_number.action.value,
         school_email: view.state.values.school_email.action.value,
         personal_email: (JSON.parse(view.private_metadata).personal_email_added) ? view.state.values.personal_email.action.value : null
      },
      guardian_contact: {
         name: view.state.values.guardian_name.action.value,
         phone_number: view.state.values.guardian_phone_number.action.value,
         email: view.state.values.guardian_email.action.value
      },
      registration_stage: 'Part 2 Complete'
   };

   var settingsData = {
      recieve_daily_reminders: typeof view.state.values.reminder.reminder_action.selected_options[0] !== 'undefined'
   };

   //Overwrites user data
   var data = (await userFile.read())[body.user.id];
   Object.assign(data,dataForm);
   Object.assign(data.settings,settingsData);
   await userFile.writePath(body.user.id,data);

   await Highway.makeRequest('Local','log',[`User '${data.slack_name}' (${data.name}) has completed registration.`]);
   console.log(terminalFormatter.bulletPoint,`User '${data.slack_name}' (${data.name}) has completed registration.`);
}

/**Handles the event that's passed when the user clicks on the 'Add Personal Contact" button in part two */
P2addPersonalEmailEvent = async ({ ack, body: { view }, client }) => {
   await ack();

   //Changes the modal to add another email entry
   var meta = JSON.parse(view.private_metadata);
   var modal = JSON.parse(JSON.stringify(RegisterShortcut.modal.part2));
   if (!meta.personal_email_added){
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

      if (EmailValidator.validate(view.state.values.school_email.action.value)){
         modal.blocks[4].element.initial_value = view.state.values.school_email.action.value;
      }
      if (EmailValidator.validate(view.state.values.guardian_email.action.value)){
         modal.blocks[9].element.initial_value = view.state.values.guardian_email.action.value;
      }

      meta.personal_email_added = true;
      modal.private_metadata = JSON.stringify(meta);

      //Pushes the new modal to the user
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: view.id
      });
   }
}

const createNewUser = async (id) => {
   await userFile.writePath(id,{
      name: null,
      slack_username: null,
      slack_name: null,
      personal_contact: {
         phone_number: null,
         school_email: null,
         personal_email: null
      },
      guardian_contact: {
         name: null,
         phone_number: null,
         email: null
      },
      teams: [],
      unsure_about_teams: null,
      interested_in_outreach: null,
      settings: Object.assign({},ConfigFile.default_account_settings),
      registration_stage: null
   });

   await scheduleFile.writePath(id, {
      periods: {
         absent: [],
         recieve_notebook: [],
         extended: {},
      },
      days: {
         absent: [],
         recieve_notebook: [],
      },
      passed: []
   });
}

export default RegisterShortcut;

//todo - program to check email validation
