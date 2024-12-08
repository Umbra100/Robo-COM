import Shortcut from "../../Shortcut.mjs";
import ModalAssembly from '../../ModalAssembly.mjs';
import RegisterAlert from "../alerts/RegisterAlert.mjs";
import Highway from '../../../../Highway.mjs';
import EngineeringNotebook from "../../../../EngineeringNotebook.mjs";
import { alphabeticalSort, clockFormatter } from "../../../../helper.mjs";
import env from 'dotenv';

env.config({ path: './security/.env' });

var userFile, teamViewBlocks = {}, individualViewBlocks = {}, individualEditViewBlocks = {}, teamEditViewBlocks = {};

/**Handles all shortcut interaction with the engineering notebook integration (besides compiling) */
const NotebookShortcut = new Shortcut('notebook')
   //When the shortcut is ready and defined; geta user data file wrapper
   .onReady(async () => {
      userFile = await Highway.makeRequest('Local','getFile',['./data/users.json']);
   })
   //When the user activates the shortcut
   .onActivation(async ({ shortcut, ack, client}) => {
      await ack();
      //Checks to see if the user is registered; if not then send an alert.
      if (!await RegisterAlert.check(shortcut.user.id)) {
         return await RegisterAlert.alert({ shortcut, ack, client });
      }
      //Gets and uploads modal
      const response = await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('individual', { body: shortcut }),
         trigger_id: shortcut.trigger_id
      });
      //Saves the block data from the modal
      individualViewBlocks[response.view.id] = response.view.blocks;
   })
   //When the user submits any modal relating to the notebook
   .onSubmit(async ({ ack, body, client }) => {
      var metadata = JSON.parse(body.view.private_metadata);
      if (metadata.editing_mode && metadata.original_date !== (body.view.state.values.date?.notebook_choose_note_date?.selected_date || metadata.original_date)){
         return await ack({
            response_action: 'errors',
            errors: {
               date: `The date must be kept the same as the original when editing a note (${clockFormatter.createDate(metadata.original_date, true)}).`
            }
         });
      }
      switch (metadata.submit_type){
         case 'individual':
            await submitEvent.individual({ body, ack });
            break;
         case 'team':
            await submitEvent.team({ body, ack });
            break;
         case 'individual_add_to_team':
            await submitEvent.addIndividualNote({ body, ack, client });
            return;
         case 'alert_edit':
            await submitEvent.alertEdit({ body, ack, client });
            return;
      }
      delete individualViewBlocks[body.view.id];
      delete individualEditViewBlocks[body.view.id];
      delete teamViewBlocks[body.view.id];
      delete teamEditViewBlocks[body.view.id];
   })
   //Handles when the modals dispatch an on close event
   .onClose(async ({ ack, body }) => {
      await ack();
      //Depending on the modal; handle the close event
      delete individualViewBlocks[body.view.id];
      delete individualEditViewBlocks[body.view.id];
      delete teamViewBlocks[body.view.id];
      delete teamEditViewBlocks[body.view.id];
   })
   //Handles when the user clicks to go to a different notetaking type
   .onAction('notebook_choose_note_type', async ({ body, ack, client, action }) => {
      await ack();
      //Gets metadata
      var metadata = JSON.parse(body.view.private_metadata);
      //If the user chooses a different type than the one they are already on
      if (metadata.submit_type !== action.selected_option.value){
         //Get modal data for that different type
         let modal;
         switch (action.selected_option.value){
            case 'individual':
               modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.individual));
               modal.blocks = individualViewBlocks[body.view.id]

               let selected = body.view.state.values.attendance.action.selected_options;
               let index = selected.map(i => i.value).indexOf(body.user.id);
               if (index !== -1) selected = selected.splice(index, 1);
               if (JSON.stringify(body.view.state.values.attendance.action.selected_options) !== '[]'){
                  modal.blocks[6].accessory.initial_options = body.view.state.values.attendance.action.selected_options;
               }
               break;
            case 'team':
               modal = await Assembly.getModal('team');
               teamViewBlocks[body.view.id] = modal.blocks;
               if (JSON.stringify(body.view.state.values.collaboration.action.selected_options) !== '[]'){
                  modal.blocks[5].element.initial_options = body.view.state.values.collaboration.action.selected_options;
               }
               break;
         }
         //Upload modal
         await client.views.update({
            token: process.env.SLACK_BOT_TOKEN,
            view: modal,
            view_id: body.view.id
         });
      }
   })
   //Handles when the user clicks to add a nts
   .onAction('notebook_add_nts', async ({ body, ack, client }) => {
      await ack();
      //Gets metadata and checks to see if the too many nts error has been sent; if so end the function
      var metadata = JSON.parse(body.view.private_metadata);
      if (metadata.nts_error_added) return;
      //Gets the modal and stores the blocks
      var modal = await Assembly.getModal('individual_add_nts', { body });
      if (metadata.editing_mode) individualEditViewBlocks[body.view.id] = modal.blocks;
      else individualViewBlocks[body.view.id] = modal.blocks;
      //Uploads modal data
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })
   //Handles when the user selects a nts to delete
   .onAction('notebook_select_nts', async ({ body, ack, client }) => {
      await ack();
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('individual_nts_selected', { body }),
         view_id: body.view.id
      });
   })
   //Handles when the user clicks to delete a selected nts
   .onAction('notebook_delete_nts', async ({ body, ack, client }) => {
      await ack();
      //Gets the modal data and stores the blocks
      var metadata = JSON.parse(body.view.private_metadata);
      var modal = await Assembly.getModal('individual_delete_nts', { body });
      if (metadata.editing_mode) individualEditViewBlocks[body.view.id] = modal.blocks;
      else individualViewBlocks[body.view.id] = modal.blocks;
      //Uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })
   //Handles when the user clicks to add an individual note to a team note
   .onAction('notebook_add_individual_note', async ({ body, ack, client }) => {
      await ack();
      //If there is no selected date; send an error modal
      if (body.view.state.values.date.notebook_choose_note_date.selected_date == null){
         await client.views.update({
            token: process.env.SLACK_BOT_TOKEN,
            view: await Assembly.getModal('team_add_individual_note_error', { body }, 'Please choose a date before adding individual notes'),
            view_id: body.view.id
         });
         return;
      }
      //Gets the date input and list of users' names and ids
      const date = clockFormatter.createDate(body.view.state.values.date.notebook_choose_note_date.selected_date, true);
      var nameList = body.view.blocks[5].element.options.map(i => i.text.text);
      var idList = body.view.blocks[5].element.options.map(i => i.value);
      //Removes users that already have an individual note from the lists
      for (const i of body.view.blocks) if (i.block_id.indexOf('indNote') == 0){
         let index = nameList.indexOf(i.block_id.split('-')[1]);
         if (index == -1) continue;
         nameList.splice(index, 1);
         idList.splice(index, 1);
      }
      if (typeof EngineeringNotebook.individualIndex[date] !== 'undefined'){
         for (const j of EngineeringNotebook.individualIndex[date]){
            let index = idList.indexOf(j);
            if (index == -1) continue;
            nameList.splice(index, 1);
            idList.splice(index, 1);
         }
      }
      //Checks the results and send a modal accordingly; if there is no users left send an error, otherwise send an individual note modal
      if (nameList.length == 0){
         await client.views.update({
            token: process.env.SLACK_BOT_TOKEN,
            view: await Assembly.getModal('team_add_individual_note_error', { body }, 'There are no more people to add notes for.'),
            view_id: body.view.id
         });
      } else {
         await client.views.push({
            token: process.env.SLACK_BOT_TOKEN,
            view: await Assembly.getModal('team_add_individual_note', { body }),
            trigger_id: body.trigger_id
         });
      }
   })
   //Handles when the user chooses the target of an individual note to be added to a team note
   .onAction('notebook_choose_individual_note_target', async ({ body, ack, client, action }) => {
      await ack();
      //Gets and uploads modal data
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('team_individual_remove_target', { body, action }),
         view_id: body.view.id
      });
   })
   //Handles when the user selects a date for a note
   .onAction('notebook_choose_note_date', async ({ body, ack, client, action }) => {
      await ack();
      //Gets metadata and creates an empty variable
      const metadata = JSON.parse(body.view.private_metadata);
      if (metadata.editing_mode) return;
      var condition;
      //Checks if the selected date already exists in the engineering notebook (if there is already a note)
      switch (metadata.submit_type){
         case 'individual':
            condition = clockFormatter.createDate(action.selected_date, true) in EngineeringNotebook.individualIndex;
            break;
         case 'team':
            condition = EngineeringNotebook.teamIndex.indexOf(clockFormatter.createDate(action.selected_date, true)) !== -1;
            if (metadata.individual_add_error_added) await client.views.update({
               token: process.env.SLACK_BOT_TOKEN,
               view: await Assembly.getModal('team_remove_individual_note_error', { body }),
               view_id: body.view.id
            });
            break;
      }
      //If there is already a note; send an alert
      if (condition){
         await client.views.push({
            token: process.env.SLACK_BOT_TOKEN,
            view: await Assembly.getModal('alert_edit', { body, action }),
            trigger_id: body.trigger_id
         });
      }
   })
   //Handles when the user chooses to go back to their original note (to overwrite the existing one)
   .onAction('notebook_edit_back', async ({ body, ack, client }) => {
      await ack();
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('edit_back', { body }),
         view_id: body.view.id
      });
   })
   //Handles when the user chooses to delete a notebook entry
   .onAction('notebook_edit_delete', async ({ body, ack, client }) => {
      await ack();
      //Gets metadata and inputted date
      const metadata = JSON.parse(body.view.private_metadata);
      var date = clockFormatter.createDate(body.view.state.values.date.notebook_choose_note_date.selected_date, true);
      //Deletes the entry from the notebook database
      if (metadata.submit_type == 'individual'){
         let index = EngineeringNotebook.individualIndex[date].indexOf(body.user.id);
         await EngineeringNotebook.writePath(`${date}.individual[${index}]`, undefined, { action: 'delete' });
      } else {
         await EngineeringNotebook.writePath(`${date}.team`, null, { action: 'set' });
      }
      //Updates the views
      await client.views.push({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('alert_delete', { body }),
         trigger_id: body.trigger_id
      });
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('edit_back', { body }),
         view_id: body.view.id
      });
      //If the notebook data for the day is empty, then delete the date key from the database
      var readData = JSON.stringify((await EngineeringNotebook.read())[date]);
      if (readData == '{"team":null,"individual":[]}'){
         await EngineeringNotebook.writePath(`${date}`, undefined, { action: 'delete' });
      }
   });

/**Handles all modal creation and assembly */
export const Assembly = new ModalAssembly()
   //Modal creation for the default individual note taking modal
   .addModal('individual', async ({ body }) => {
      //Gets the original modal and metadata. Along with a list of users
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.individual));
      var metadata = JSON.parse(modal.private_metadata);
      const bodyMetadata = JSON.parse(body.view?.private_metadata ?? '{}');
      const userList = await getFormattedUserList();
      //Modifies the modal and metadata; adds the users to the user select field, notes down who is executing the shortcut in metadata
      for (var i = 0; i < userList.length; i++){
         if (userList[i].id !== body.user.id || bodyMetadata.submit_type == 'team') modal.blocks[6].accessory.options.push({
            text: {
               type: 'plain_text',
               text: userList[i].name
            },
            value: userList[i].id
         });
         else  metadata.this_user = {
            id: body.user.id,
            name: userList[i].name
         };
      }
      //Saves metadata
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user clicks to add a note to self
   .addModal('individual_add_nts', ({ body }) => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.individual));
      var metadata = JSON.parse(body.view.private_metadata);
      modal.blocks = body.view.blocks;
      //Modifies modal; add note to self field, add confirmation box for switching to team note
      switch (metadata.nts_amount){
         case 0: // If the user doesn't have any notes to self; add the initial blocks
            modal.blocks.pop();
            modal.blocks.push(
               {
                  type: 'section',
                  text: {
                     type: 'plain_text',
                     text: ' '
                  }
               },
               {
                  type: 'divider'
               },
               {
                  type: 'actions',
                  block_id: 'selected_nts0',
                  elements: [
                     {
                        type: 'static_select',
                        placeholder: {
                           type: 'plain_text',
                           text: 'Select NTS'
                        },
                        options: [],
                        action_id: 'notebook_select_nts'
                     },
                     {
                        type: 'button',
                        text: {
                           type: 'plain_text',
                           text: 'Delete NTS'
                        },
                        value: 'delete_nts',
                        action_id: 'notebook_delete_nts'
                     }
                  ]
               },
               {
                  type: 'input',
                  block_id: `nts${metadata.nts_amount + 1}${metadata.editing_mode ? '1' : ''}`,
                  element: {
                     type: 'plain_text_input',
                     action_id: 'action'
                  },
                  label: {
                     type: 'plain_text',
                     text: 'Note To Self'
                  }
               },
               {
                  type: 'context',
                  elements: [
                     {
                        type: 'mrkdwn',
                        text: 'Other people cannot see notes to self'
                     }
                  ]
               },
               {
                  type: 'actions',
                  elements: [
                     {
                        type: 'button',
                        text: {
                           type: 'plain_text',
                           text: 'Add NTS'
                        },
                        value: 'add_nts',
                        action_id: 'notebook_add_nts'
                     }
                  ]
               }
            );
            modal.blocks[0].accessory.confirm = {
               title: {
                  type: 'plain_text',
                  text: 'Are you sure?'
               },
               text: {
                  type: 'plain_text',
                  text: 'Switching to team mode will delete your notes to self. This means you will have to rewrite them if you come back to this menu.'
               },
               confirm: {
                  type: 'plain_text',
                  text: 'Make Team Note'
               },
               deny: {
                  type: 'plain_text',
                  text: 'Keep Editing'
               }
            };
            metadata.nts_max_index = 1;
            break;
         case 5: // If the user already has 5 notes to self; send an error
            modal.blocks[modal.blocks.length - 2].elements[0].text = '❗️ Cannot have more than 5 notes to self.';
            metadata.nts_error_added = true;
            modal.private_metadata = JSON.stringify(metadata);
            return modal;
         default: // If the user already has some notes to self; all another one accordingly
            let popped = modal.blocks.splice(modal.blocks.length - 2,2);
            modal.blocks.push({
               type: 'input',
               block_id: `nts${metadata.nts_max_index + 1}${metadata.editing_mode ? '1' : ''}`,
               element: {
                  type: 'plain_text_input',
                  action_id: 'action'
               },
               label: {
                  type: 'plain_text',
                  text: ' '
               }
            });
            modal.blocks.push(...popped);
            metadata.nts_max_index++;
      }
      //Modifies metadata and adds the nts option to the delete block
      metadata.nts_amount++;
      modal.blocks[9].elements[0].options.push({
         text: {
            type: 'plain_text',
            text: `Note to Self #${metadata.nts_amount}`
         },
         value: `${metadata.nts_amount}`
      });
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user selects a nts to delete
   .addModal('individual_nts_selected', ({ body }) => {
      //Gets original modal data
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.individual));
      modal.blocks = body.view.blocks;
      //Modifies modal; changes the style of the delete button by making it red and adding a confirm dialog when clicked
      modal.blocks[9].elements[1].style = 'danger';
      modal.blocks[9].elements[1].confirm = {
         title: {
            type: 'plain_text',
            text: 'Are you sure?'
         },
         text: {
            type: 'plain_text',
            text: 'Deleting a note to self cannot be undone.'
         },
         confirm: {
            type: 'plain_text',
            text: 'Delete'
         },
         deny: {
            type: 'plain_text',
            text: 'No, Go Back'
         },
         style: 'danger'
      };
      modal.private_metadata = body.view.private_metadata;
      return modal;
   })
   //Modal creation for when the user clicks to delete a nts
   .addModal('individual_delete_nts', async ({ body }) => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.individual));
      var metadata = JSON.parse(body.view.private_metadata);
      modal.blocks = body.view.blocks;
      //Gets selected nts input
      var selectedNTS = parseInt(body.view.state.values[body.view.blocks[9].block_id].notebook_select_nts.selected_option.value);
      //Modifies modal; removes selected nts and takes necessary actions depending on which nts you removed in the order
      modal.blocks.splice(9 + selectedNTS,1);
      modal.blocks[9].elements[0].options.pop();
      delete modal.blocks[9].elements[0].initial_option;
      if (metadata.nts_amount == 1){ //If the user removed the only nts on the modal; delete the nts editing fields
         modal.blocks.splice(6 + selectedNTS, 5);
         modal.blocks.push({
            type: 'section',
            text: {
               type: 'mrkdwn',
               text: 'Would you like to add any notes to yourself?'
            },
            accessory: {
               type: 'button',
               text: {
                  type: 'plain_text',
                  text: 'Add NTS'
               },
               value: 'add_nts',
               action_id: 'notebook_add_nts'
            }
         });
      } else { //If the user deleted a nts, but there are still some left; make sure the modal look stays intact
         if (selectedNTS == 1) modal.blocks[10].label.text = 'Notes To Self';
         if (selectedNTS == metadata.nts_amount){
            modal.blocks[9].elements[0].initial_option = {
               text: {
                  type: 'plain_text',
                  text: `Note to Self #${metadata.nts_amount - 1}`
               },
               value: `${selectedNTS - 1}`
            };
            modal.blocks[9].block_id = (modal.blocks[9].block_id == 'selected_nts0') ? 'selected_nts1' : 'selected_nts0';
         }
      }
      //If the user generated an nts error; remove it
      if (metadata.nts_error_added){
         modal.blocks[modal.blocks.length - 2].elements[0].text = 'Other people cannot see notes to self';
         metadata.nts_error_added = false;
      }
      //Modifies and saves metadata
      metadata.nts_amount--;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for the default team note taking modal
   .addModal('team', async () => {
      //Gets the original modal
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.team));
      //Modifies the modal; adds the users to the user select field
      modal.blocks[5].element.options = (await getFormattedUserList()).map(i => {return {
         text: {
            type: 'plain_text',
            text: i.name
         },
         value: i.id
      }});
      return modal;
   })
   //Modal creation for inputting the data for adding an individual note to a team note
   .addModal('team_add_individual_note', async ({ body }) => {
      //Get modal and metadata
      var modal = await Assembly.getModal('individual', { body });
      var metadata = JSON.parse(body.view.private_metadata);
      var date = clockFormatter.createDate(body.view.state.values.date.notebook_choose_note_date.selected_date, true);
      var options = teamViewBlocks[body.view.id][5].element.options.map(i => {
         if (typeof EngineeringNotebook.individualIndex[date] == 'undefined') return i;
         if (EngineeringNotebook.individualIndex[date].indexOf(i.value) !== -1) return {
            text: {
               type: 'plain_text',
               text: `✅  ${i.text.text}`
            },
            value: i.value
         }
         return i;
      })
      //Modifies modal
      modal.blocks[4].label.text = `Individual Note #${metadata.individual_note_amount + 1}`;
      modal.blocks[4].block_id = 'individual_note_target';
      modal.blocks[4].dispatch_action = true;
      modal.blocks[4].element = {
         type: 'static_select',
         placeholder: {
            type: 'plain_text',
            text: 'Who is this note for?'
         },
         options: options,
         action_id: 'notebook_choose_individual_note_target',
      };
      modal.blocks[5].element.placeholder.text = 'What did they get done?';
      modal.blocks[6].accessory.placeholder.text = 'Who did they work with?';
      modal.blocks.pop();
      modal.blocks.push(
         {
            type: 'context',
            elements: [
               {
                  type: 'plain_text',
                  text: 'Only the person who this note is for can go back and edit this. Once added the note cannot be removed or edited until the team note is saved.'
               }
            ]
         },
         {
            type: 'section',
            block_id: 'notify_individual',
            text: {
               type: 'mrkdwn',
               text: ' '
            },
            accessory: {
               type: 'checkboxes',
               options: [
                  {
                     text: {
                        type: 'plain_text',
                        text: 'Notify the person that this note was created.'
                     },
                     value: 'notify_individual'
                  }
               ],
               initial_options: [
                  {
                     text: {
                        type: 'plain_text',
                        text: 'Notify the person that this note was created.'
                     },
                     value: 'notify_individual'
                  }
               ],
               action_id: 'action'
            }
         }
      );
      modal.blocks.shift();
      modal.title.text = 'Notebook - Individual'
      modal.submit.text = 'Add Note';
      modal.notify_on_close = false;
      //Modifies and saves metadata
      metadata.submit_type = 'individual_add_to_team';
      metadata.team_view_id = body.view.id;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user generates a error when adding an individual note to a team note
   .addModal('team_add_individual_note_error', async ({ body }, error) => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.team));
      var metadata = JSON.parse(body.view.private_metadata);
      modal.blocks = body.view.blocks;
      //Modifies modal; adds the error block if it hasn't already been added
      if (!metadata.individual_add_error_added){
         modal.blocks.push({
            type: 'context',
            elements: [
               {
                  type: 'mrkdwn',
                  text: `❗️ *${error}*`
               }
            ]
         });
      }
      //Modifies modal data and saves it
      metadata.individual_add_error_added = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for removing a previously added individual note adding error
   .addModal('team_remove_individual_note_error', async ({ body }) => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.team));
      var metadata = JSON.parse(body.view.private_metadata);
      if (metadata.editing_mode) modal.blocks = teamEditViewBlocks[body.view.id];
      else modal.blocks = teamViewBlocks[body.view.id];
      metadata.individual_add_error_added = false;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user chooses a target for an individual note (to add to team)
   .addModal('team_individual_remove_target', async ({ body, action }) => {
      //Gets modal, input and metadata;
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.individual));
      var metadata = JSON.parse(body.view.private_metadata);
      var selectedUser = action.selected_option.value;
      //Modifies modal; changes the base properties such as title and submit text, removes the selected user from the collaboration options
      modal.title.text = 'Notebook - Individual'
      modal.submit.text = 'Add Note';
      modal.notify_on_close = true;
      modal.blocks = body.view.blocks;
      var options = JSON.parse(JSON.stringify(teamViewBlocks[metadata.team_view_id][5].element.options));
      options.splice(options.map(i => i.value).indexOf(selectedUser),1);
      modal.blocks[5].accessory.options = options;
      //Saves metadata
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user selects a date that already has an entry
   .addModal('alert_edit', ({ body, action }) => {
      //Gets modal and metadata
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.alert_edit));
      var metadata = JSON.parse(modal.private_metadata);
      const noteMetadata = JSON.parse(body.view.private_metadata);
      //Edits and saves metadata
      metadata.date_target = action.selected_date;
      metadata.note_type = noteMetadata.submit_type;
      metadata.view_id = body.view.id;
      if (typeof noteMetadata.this_user !== 'undefined') metadata.this_user = noteMetadata.this_user;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user chooses to edit an existing entry
   .addModal('edit', async ({ body }) => {
      //Gets notebook data, modal data, metadata and metadata from a copy of the original modal
      var metadata = JSON.parse(body.view.private_metadata);
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal[metadata.note_type]));
      var modalMetadata = JSON.parse(modal.private_metadata);
      if (metadata.note_type == 'individual'){
         modal.blocks[6].accessory.options = individualViewBlocks[metadata.view_id][6].accessory.options;
      } else {
         modal.blocks[5].element.options = teamViewBlocks[metadata.view_id][5].element.options;
      }
      var readData = (await EngineeringNotebook.read())[clockFormatter.createDate(metadata.date_target, true)], entry;
      //Gets the entry data from the notebook
      if (metadata.note_type == 'team') entry = readData.team;
      else for (const i of readData.individual) if (i.id == body.user.id) entry = i;
      //Modifies modal
      //Gets and inputs data from entry
      modal.blocks = modal.blocks.map(i => {
         switch (i.block_id){
            case 'description':
               i.block_id = 'description1';
               i.element.initial_value = entry.description;
               break;
            case 'collaboration':
               i.block_id = 'collaboration1';
               if (entry.collaboration.length !== 0) i.accessory.initial_options = entry.collaboration.map(j => {return {
                  text: {
                     type: 'plain_text',
                     text: j.name
                  },
                  value: j.id
               }});
               break;
            case 'attendance':
               i.block_id = 'attendance1';
               if (entry.attendance.length !== 0) i.element.initial_options = entry.attendance.map(j => {return {
                  text: {
                     type: 'plain_text',
                     text: j.name
                  },
                  value: j.id
               }});
               break;
            case 'notify_team':
               i.block_id = 'notify_team1';
               i.accessory.options[0].text.text = 'Notify the team that this notebook entry was edited. ⭐️';
               i.accessory.initial_options = [{
                  text: {
                     type: 'plain_text',
                     text: 'Notify the team that this notebook entry was edited. ⭐️'
                  },
                  value: 'notify_team'
               }];
               break;
         }
         return i;
      });
      //Removes the note type selector and adds the back and delete buttons
      modal.blocks.shift();
      modal.blocks.splice(3, 0, {
         type: 'actions',
         elements: [
            {
               type: 'button',
               text: {
                  type: 'plain_text',
                  text: 'Back'
               },
               value: 'edit_back',
               action_id: 'notebook_edit_back',
               confirm: {
                  title: {
                     type: 'plain_text',
                     text: 'Are you sure?'
                  },
                  text: {
                     type: 'mrkdwn',
                     text: `Any changes you've made will not be saved`
                  },
                  confirm: {
                     type: 'plain_text',
                     text: 'Yes'
                  },
                  deny: {
                     type: 'plain_text',
                     text: 'No'
                  }
               }
            },
            {
               type: 'button',
               text: {
                  type: 'plain_text',
                  text: 'Delete Note'
               },
               style: 'danger',
               value: 'edit_delete',
               action_id: 'notebook_edit_delete',
               confirm: {
                  title: {
                     type: 'plain_text',
                     text: 'Are you sure?'
                  },
                  text: {
                     type: 'mrkdwn',
                     text: 'This action cannot be undone.'
                  },
                  confirm: {
                     type: 'plain_text',
                     text: 'Yes'
                  },
                  deny: {
                     type: 'plain_text',
                     text: 'No'
                  }
               }
            }
         ]
      });
      //If it's a team entry that's being edited; add the individual notes
      if (metadata.note_type == 'team' && readData.individual.length !== 0){
         modal.blocks.pop();
         for (const i of readData.individual){
            let noteText = `\n>*${i.name}* (#${modalMetadata.individual_note_amount + 1})\n>\n>        `;
            for (const j of i.collaboration){
               noteText += `${j.name} + `;
            }
            noteText += '$';
            if (i.collaboration.length == 0) noteText = noteText.replace('$','- Worked Solo -\n>\n>        ');
            else noteText = noteText.replace(' + $','\n>\n>        ');
            noteText += i.description;
            modal.blocks.push(
               {
                  type: 'section',
                  block_id: `indNote${modalMetadata.individual_note_amount + 1}-${i.name}`,
                  text: {
                     type: 'mrkdwn',
                     text: noteText
                  }
               }
            );
            modalMetadata.individual_note_amount++;
         }
         modal.blocks.push({
            type: 'actions',
            elements: [
               {
                  type: 'button',
                  text: {
                     type: 'plain_text',
                     text: 'Add Individual Note'
                  },
                  value: 'add_individual_note',
                  action_id: 'notebook_add_individual_note'
               }
            ]
         });
      }
      //If it's an individual note being edited; add the notes to self
      if (metadata.note_type == 'individual' && entry.nts.length !== 0){
         let options = [];
         let nts = entry.nts.map(i => {
            modalMetadata.nts_amount++;
            options.push({
               text: {
                  type: 'plain_text',
                  text: `Note to Self #${modalMetadata.nts_amount}`
               },
               value: `${modalMetadata.nts_amount}`
            });

            return {
               type: 'input',
               block_id: `nts${modalMetadata.nts_amount}1`,
               element: {
                  type: 'plain_text_input',
                  action_id: 'action',
                  initial_value: i
               },
               label: {
                  type: 'plain_text',
                  text: (modalMetadata.nts_amount == 1) ? 'Note To Self' : ' '
               }
            }
         })
         modal.blocks.pop();
         modal.blocks.push(
            {
               type: 'section',
               text: {
                  type: 'plain_text',
                  text: ' '
               }
            },
            {
               type: 'divider'
            },
            {
               type: 'actions',
               block_id: 'selected_nts0',
               elements: [
                  {
                     type: 'static_select',
                     placeholder: {
                        type: 'plain_text',
                        text: 'Select NTS'
                     },
                     options,
                     action_id: 'notebook_select_nts'
                  },
                  {
                     type: 'button',
                     text: {
                        type: 'plain_text',
                        text: 'Delete NTS'
                     },
                     value: 'delete_nts',
                     action_id: 'notebook_delete_nts'
                  }
               ]
            },
            ...nts,
            {
               type: 'context',
               elements: [
                  {
                     type: 'mrkdwn',
                     text: 'Other people cannot see notes to self'
                  }
               ]
            },
            {
               type: 'actions',
               elements: [
                  {
                     type: 'button',
                     text: {
                        type: 'plain_text',
                        text: 'Add NTS'
                     },
                     value: 'add_nts',
                     action_id: 'notebook_add_nts'
                  }
               ]
            }
         );
         modalMetadata.nts_max_index = modalMetadata.nts_amount;
         modalMetadata.this_user = metadata.this_user;
      }
      //Modifies and saves metadata
      modalMetadata.editing_mode = true;
      modalMetadata.original_date = metadata.date_target;
      modal.private_metadata = JSON.stringify(modalMetadata);
      return modal;
   })
   //Handles when the user is going from an editing modal back to the original entry making modal
   .addModal('edit_back', async ({ body }) => {
      const metadata = JSON.parse(body.view.private_metadata);
      //Gets and modifies modal data; gets original modal, forms metadata
      var modal;
      if (metadata.submit_type == 'individual'){
         modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.individual));
         modal.blocks = individualViewBlocks[body.view.id];
         let modalMetadata = JSON.parse(modal.private_metadata);
         let amount = 0, max = 0;
         for (const i of modal.blocks) if (i.block_id.indexOf('nts') == 0){
            amount++;
            if (parseInt(i.block_id.split('nts')[1]) > max) max = parseInt(i.block_id.split('nts')[1]);
         }
         modalMetadata.nts_amount = amount;
         modalMetadata.nts_max_index = max;
         modalMetadata.this_user = metadata.this_user;
         modal.private_metadata = JSON.stringify(modalMetadata);
      } else {
         modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.team));
         modal.blocks = teamViewBlocks[body.view.id];
         let modalMetadata = JSON.parse(modal.private_metadata);
         for (const i of modal.blocks) {
            if (i.block_id?.indexOf('indNote') == 0) modalMetadata.individual_note_amount++;
         }
         modal.private_metadata = JSON.stringify(modalMetadata);
      }
      return modal;
   })
   //Handles when the user clicks to delete an existing entry
   .addModal('alert_delete', async ({ body }) => {
      //Gets modal
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.alert_delete));
      //Gets and modifies metadata to set up for transferring back to original modal
      const metadata = JSON.parse(body.view.private_metadata);
      var modalMetadata = JSON.parse(modal.private_metadata);
      modalMetadata.note_type = metadata.submit_type;
      modalMetadata.view_id = body.view.id;
      modal.private_metadata = JSON.stringify(modalMetadata);
      return modal;
   })

const getInputData = {
   //Gets and formats the input data from an individual note submission (not adding a individual note)
   individual: ({ body }) => {
      //Gets metadata
      var metadata = JSON.parse(body.view.private_metadata);
      //Gets user name and id from metadata
      var { name, id } = metadata.this_user;
      //Gets other input data; description, collaboration and notes to self
      var description = (metadata.editing_mode)
         ? body.view.state.values.description1.action.value
         : body.view.state.values.description.action.value;
      var collaboration = (metadata.editing_mode)
         ? body.view.state.values.collaboration1.action.selected_options.map(i => {return {
            name: i.text.text,
            id: i.value
         }})
         : body.view.state.values.collaboration.action.selected_options.map(i => {return {
            name: i.text.text,
            id: i.value
         }});
      var nts = [];
      for (const i in body.view.state.values) if (i.indexOf('nts') == 0){
         nts.push(body.view.state.values[i].action.value);
      }
      //Returns it in a file-friendly object
      return {
         name,
         id,
         description,
         collaboration,
         nts,
         notificationSent: 'N/A'
      };
   },
   //Gets the input data from a team note
   team: ({ body }) => {
      //Gets input data; description, whether or not to send a notification, attendance, and individual notes added
      const metadata = JSON.parse(body.view.private_metadata);
      var description = (metadata.editing_mode)
         ? body.view.state.values.description1.action.value
         : body.view.state.values.description.action.value;
      var notificationSent = (metadata.editing_mode)
         ? (body.view.state.values.notify_team1.action.selected_options.length == 0) ? 'N/A' : false
         : (body.view.state.values.notify_team.action.selected_options.length == 0) ? 'N/A' : false;
      var attendance = (metadata.editing_mode)
         ? body.view.state.values.attendance1.action.selected_options.map(i => {return {
            name: i.text.text,
            id: i.value
         }})
         : body.view.state.values.attendance.action.selected_options.map(i => {return {
            name: i.text.text,
            id: i.value
         }});;
      var individual = [];
      for (const i of body.view.blocks) if (i.block_id.indexOf('indNote') == 0) individual.push(i.text.text);
      var idIndex = {};
      for (const j of body.view.blocks[5].element.options) idIndex[j.text.text] = j.value;
      for (var k = 0; k < individual.length; k++){
         let entry = {};
         let name = individual[k].slice(6,individual[k].indexOf('* (#'));
         let id = idIndex[name];
         let description = individual[k].slice(individual[k].lastIndexOf('        ') + 8,individual[k].length);
         let notificationSent = (individual[k].indexOf('   -   Will Be Notified') == -1) ? 'N/A' : false;
         let collaboration = individual[k].slice(individual[k].indexOf('        ') + 8, individual[k].length);
         collaboration = collaboration.slice(0,collaboration.indexOf('\n&gt;')).split(' + ');
         if (collaboration.indexOf('- Worked Solo -') !== -1) collaboration.splice(collaboration.indexOf('- Worked Solo -'),1);
         collaboration = collaboration.map(i => {return {
            name: i,
            id: idIndex[i]
         }});
         entry = { name, id, description, collaboration, nts: [], notificationSent };
         individual[k] = entry;
      }
      //returns a file-friendly object with the data
      return {
         team: {
            attendance,
            description,
            notificationSent
         },
         individual
      };
   }
}

const submitEvent = {
   //Handles the submission event for adding an individual note to a team note
   addIndividualNote: async ({ body, ack, client }) => {
      //Gets target input and metadata
      var metadata = JSON.parse(body.view.private_metadata);
      var targetName = body.view.state.values.individual_note_target.notebook_choose_individual_note_target.selected_option.text.text;
      var notify = JSON.stringify(body.view.state.values.notify_individual.action.selected_options) !== '[]';
      var modalTarget = (metadata.editing_mode) ? teamEditViewBlocks[metadata.team_view_id] : teamViewBlocks[metadata.team_view_id];
      //If the targeted user already has a note; send an error
      if (JSON.stringify(modalTarget).indexOf(`*${targetName}* (#`) !== -1){
         return await ack({
            response_action: 'errors',
            errors: {
               individual_note_target: 'You\'ve already added a note for this person. Only the target of the note can edit it (once the team note is saved).'
            }
         });
      } else if (targetName.indexOf('✅') !== -1){
         return await ack({
            response_action: 'errors',
            errors: {
               individual_note_target: 'An individual note already exists for this person. Only the target of the note can edit it.'
            }
         })
      } else await ack();
      //Gets the modal data
      var modal = JSON.parse(JSON.stringify(NotebookShortcut.modal.team));
      modal.blocks = (metadata.editing_mode) 
         ? JSON.parse(JSON.stringify(teamEditViewBlocks[metadata.team_view_id])) 
         : JSON.parse(JSON.stringify(teamViewBlocks[metadata.team_view_id]));
      //Modifies modal data; adds the note to the modal
      modal.blocks.pop();
      if (metadata.individual_note_amount > 0) modal.blocks.push({
         type: 'header',
         text: {
            type: 'plain_text',
            text: ' '
         }
      });
      else modal.blocks.push(
         {
            type: 'divider'
         },
         {
            type: 'header',
            text: {
               type: 'plain_text',
               text: 'Individual Notes'
            }
         }
      );
      var noteText = `\n>*${targetName}* (#${metadata.individual_note_amount + 1})${(notify) ? '   -   Will Be Notified' : "   -   Will Not Be Notified"}\n>\n>        `;
      for (const i of body.view.state.values.collaboration.action.selected_options){
         noteText += `${i.text.text} + `;
      }
      noteText += '$';
      if (body.view.state.values.collaboration.action.selected_options.length == 0) noteText = noteText.replace('$','- Worked Solo -\n>\n>        ');
      else noteText = noteText.replace(' + $','\n>\n>        ');
      noteText += body.view.state.values.description.action.value;
      modal.blocks.push(
         {
            type: 'section',
            block_id: `indNote${metadata.individual_note_amount + 1}-${targetName}`,
            text: {
               type: 'mrkdwn',
               text: noteText
            }
         },
         {
            type: 'actions',
            elements: [
               {
                  type: 'button',
                  text: {
                     type: 'plain_text',
                     text: 'Add Individual Note'
                  },
                  value: 'add_individual_note',
                  action_id: 'notebook_add_individual_note'
               }
            ]
         }
      );
      //Modifies and saves metadata
      metadata.individual_note_amount++;
      metadata.submit_type = 'team';
      modal.private_metadata = JSON.stringify(metadata);
      //Saves the changed modal blocks
      if (metadata.editing_mode){
         teamEditViewBlocks[metadata.team_view_id] = modal.blocks;
      } else {
         teamViewBlocks[metadata.team_view_id] = modal.blocks;
      }
      //Uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: metadata.team_view_id
      });
   },
   //Handles submission event for storing an individual note in the notebook
   individual: async ({ body, ack }) => {
      await ack();
      //Gets the input data
      var data = getInputData.individual({ body });
      var date = clockFormatter.createDate(body.view.state.values.date.notebook_choose_note_date.selected_date, true);
      //If the date entry already exists; overwrite it, if not create the entry and save the note
      if (date in EngineeringNotebook.individualIndex){
         for (var i = 0; i < EngineeringNotebook.individualIndex[date].length; i++){
            if (EngineeringNotebook.individualIndex[date][i] == data.id){
               await EngineeringNotebook.writePath(`${date}.individual[${i}]`, data);
               return;
            }
         }
         await EngineeringNotebook.writePath(`${date}.individual`, data, { action: 'append' });
      } else {
         data = {
            team: {
               attendance: [],
               description: null,
               notificationSent: 'N/A'
            },
            individual: [ data ]
         };
         await EngineeringNotebook.writePath(date, data);
      }
   },
   //Handles submission events for storing a team note in the notebook
   team: async ({ body, ack }) => {
      await ack();
      //Gets input data
      var data = getInputData.team({ body });
      var date = clockFormatter.createDate(body.view.state.values.date.notebook_choose_note_date.selected_date, true);
      //Gets the existing notebook data
      const read = await EngineeringNotebook.read();
      //If the date entry already exists, get the existing individual notes
      if (date in EngineeringNotebook.individualIndex){
         let save = JSON.parse(JSON.stringify(data.individual));
         data.individual = read[date].individual;
         for (const i of save) if (EngineeringNotebook.individualIndex[date].indexOf(i.id) == -1) data.individual.push(i);
      }
      await EngineeringNotebook.writePath(date, data);
   },
   //Handles the submission event for going to edit a entry
   alertEdit: async ({ body, ack, client }) => {
      //Gets metadata
      var metadata = JSON.parse(body.view.private_metadata);
      var modal = await Assembly.getModal('edit', { body });
      if (metadata.note_type == 'individual') individualEditViewBlocks[metadata.view_id] = modal.blocks;
      else teamEditViewBlocks[metadata.view_id] = modal.blocks;
      //Gets and uploads modal data
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: metadata.view_id
      });
      await ack();
   }
};

/**
 * Gets a formatted list of users in the slack.
 * The user will be entered in the list if they have registered a name
 * @async
 * @returns {Object[]} List of users that are in the slack sorted alphabetically. Each item contains a name and id (slack id) key, value pair
 */
const getFormattedUserList = async () => {
   var userData = await userFile.read()
   var raw = {}, nameList = [];
   for (const i in userData) if (userData[i].name !== null){
      raw[userData[i].name] = i;
      nameList.push(userData[i].name);
   }
   nameList = alphabeticalSort(nameList);
   return nameList.map(j => {return {
      name: j,
      id: raw[j]
   }});
}

//todo - Program for notifying
   //Maybe by adding a key to the notebook data that lists what entries need to have a notification sent (see example below)
   //The system adds to the notifications listings when the entries are created and/or edited
   //example data form:  "notifications": [
   //    { "type": "team", "date": "May 26th 2023" },
   //    { "type": "individual", "date": "May 26th 2023", "target": "15712683"}
   // ]

export default NotebookShortcut;
